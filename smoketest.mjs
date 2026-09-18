// No-DB sanity run. Verifies the Stage 1 model invariants and prints the numbers that belong
// in the DEVLOG entry (proof coupled to log). Exits non-zero on failure.
//   node smoketest.mjs
//
// Loads the SAME browser sim files into the MAIN V8 realm via indirect eval (NOT vm).
// Everything in src/ is `var` / `function` / `var X = class X`, so once the leading
// 'use strict' directive is stripped the top-level names attach to globalThis and read as
// fast native globals. Main-realm (not vm) because vm adds a ~7-10x hot-loop tax on per-tick
// global reads (e.g. PARAMETERS.*) and a one-config run never needs vm's isolation — see
// ~/.claude/conventions.md §4.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indirectEval = eval; // aliased → runs in the global (sloppy) realm, so `var` leaks to globalThis
for (const f of ['util.js', 'params.js', 'hex.js', 'genome.js', 'engine.js', 'world.js', 'stats.js']) {
  let src = readFileSync(path.join(__dirname, 'src', f), 'utf8');
  src = src.replace(/^\s*(['"])use strict\1;?/, ''); // strip directive so declarations leak to global
  indirectEval(src);
}

const P = globalThis.PARAMETERS;
const DEFAULTS = JSON.parse(JSON.stringify(P));   // the shipped configuration, before any test edits it
const { World, GameEngine, spinnerGenome, walkerGenome, hexNeighbor, nConditions } = globalThis;

let failures = 0;
function check(name, ok, detail) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

// A world with no random seeding, so each test places exactly what it wants to observe.
function bare(over) {
  Object.assign(P, {
    seed: 20260918,                     // fixed, so a failure is reproducible rather than a coin toss
    gridCols: 41, gridRows: 41, n: 2, initialSeeds: 0, seedGenome: 'random',
    mutationRate: 0, pDeath: 0, absentP: 0, reproCost: 1, rotationCost: 0,
    energyPerTransition: 1, childEnergy: 0, childOrientation: 'inherit', asyncUpdate: true,
  }, over || {});
  return new World();
}
function run(w, ticks) {
  const e = new GameEngine();
  for (let t = 1; t <= ticks; t++) { e.tick = t; w.update(e); }
}
function livingCells(w) {
  const out = [];
  for (let i = 0; i < w.N; i++) if (w.color[i] !== -1) out.push(i);
  return out;
}

// ─── 1. WALKER — reproduce forward, then die. Locomotion out of the birth/death cycle ────
// The lineage becomes a 2-cell object (head + the parent that has not yet met its child)
// advancing exactly one hex per tick along a fixed direction, in a straight line.
console.log('walker — reproduce-forward-then-die is motion');
{
  const T = 15, DIR = 0;                    // direction 0 = N = {dc:0, dr:-1}, so col is fixed
  const w = bare();
  const col = 20, row = 30;
  w.place(col * w.rows + row, 0, DIR, walkerGenome());
  run(w, T);

  const alive = livingCells(w);
  const rowsOf = alive.map((i) => i % w.rows).sort((a, b) => a - b);
  const colsOf = [...new Set(alive.map((i) => (i / w.rows) | 0))];
  const wrap = (r) => ((r % w.rows) + w.rows) % w.rows;
  const expect = [wrap(row - T), wrap(row - T + 1)].sort((a, b) => a - b);

  check('exactly 2 cells alive (head + expiring tail)', alive.length === 2, 'n=' + alive.length);
  check('travelled in a straight line (one column)', colsOf.length === 1 && colsOf[0] === col,
        'cols=' + colsOf.join(','));
  check('advanced exactly ' + T + ' cells north in ' + T + ' ticks',
        rowsOf[0] === expect[0] && rowsOf[1] === expect[1],
        'rows=' + rowsOf.join(',') + ' expected=' + expect.join(','));
  check('births == deaths + 1 (steady march)', w.births === w.deaths + 1,
        'births=' + w.births + ' deaths=' + w.deaths);
}

// ─── 2. SPINNER — flip colour and turn right; tile the disc ──────────────────────────────
// Six ticks is one full rotation, so all six neighbours of the seed must be occupied.
console.log('spinner — one rotation tiles the six neighbours');
{
  const w = bare();
  const col = 20, row = 20, seed = col * w.rows + row;
  w.place(seed, 0, 0, spinnerGenome());
  run(w, 6);

  let filled = 0;
  for (let d = 0; d < 6; d++) if (w.color[hexNeighbor(col, row, d, w.cols, w.rows)] !== -1) filled++;
  check('all 6 neighbours of the seed are alive after 6 ticks', filled === 6, filled + '/6');
  check('seed itself survived (spinner has no lethal condition)', w.color[seed] !== -1);
  check('deaths = 0 (every condition is covered)', w.deaths === 0, 'deaths=' + w.deaths);

  const w2 = bare();
  w2.place(seed, 0, 0, spinnerGenome());
  run(w2, 60);
  const pop = w2.population();
  check('film keeps growing (pop > 50 by tick 60)', pop > 50, 'pop=' + pop);
}

// ─── 3. Rule-absence kills, and the clone is exact when mutation is off ──────────────────
console.log('death and heredity');
{
  const w = bare();
  const g = new Int8Array(nConditions(2)).fill(-1);   // no rule matches anything
  w.place(20 * w.rows + 20, 0, 0, g);
  run(w, 1);
  check('an organism with no matching rule dies on its first tick', w.population() === 0,
        'pop=' + w.population());

  const w2 = bare();
  w2.place(20 * w2.rows + 20, 0, 0, spinnerGenome());
  run(w2, 40);
  const g2 = w2.genotypes();
  check('mutation off → one genotype in the whole population',
        g2.distinct === 1, 'distinct=' + g2.distinct + ' pop=' + w2.population());

  const w3 = bare({ mutationRate: 0.25, absentP: 0.3 });
  w3.place(20 * w3.rows + 20, 0, 0, spinnerGenome());
  run(w3, 60);
  check('mutation on → genotypes diverge', w3.genotypes().distinct > 1,
        'distinct=' + w3.genotypes().distinct + ' pop=' + w3.population());
}

// ─── 4. The SHIPPED defaults produce a living, evolving population ───────────────────────
// This one deliberately uses PARAMETERS as it ships rather than a test fixture, so the
// smoke test fails if a default is ever changed to something degenerate.
console.log('shipped defaults (reproCost=' + DEFAULTS.reproCost + ' pDeath=' + DEFAULTS.pDeath +
  ' initialSeeds=' + DEFAULTS.initialSeeds + ')');
{
  // Across several fixed seeds, not one: whether a founding population establishes is
  // genuinely stochastic, and a single run turns that into a flaky test. At initialSeeds=40
  // this failed roughly 1 run in 60.
  const seeds = [101, 202, 303, 404, 505, 606];
  let extinct = 0, last = null, lastWorld = null;
  for (const sd of seeds) {
    Object.assign(P, DEFAULTS, { seed: sd });
    const w = new World();
    run(w, 1000);
    last = w.stats();
    lastWorld = w;
    if (last.population === 0) extinct++;
  }
  const s = last;
  check('no founding population went extinct (' + seeds.length + ' seeds x 1000 ticks)',
        extinct === 0, extinct + '/' + seeds.length + ' extinct');
  // s.births is cumulative here: resetPeriodCounters() is the DataManager's job and no
  // DataManager runs in the smoke test.
  check('population is still turning over', s.births > 0, 'births=' + s.births);
  check('selection purged lethal conditions', s.meanAbsentRules < DEFAULTS.absentP,
        'lethal=' + (s.meanAbsentRules * 100).toFixed(2) + '% < seeded ' + (DEFAULTS.absentP * 100) + '%');
  console.log('    tick=' + s.tick + ' pop=' + s.population + ' density=' + s.density.toFixed(3) +
    ' genotypes=' + s.distinctGenotypes + ' topClone=' + (s.topCloneShare * 100).toFixed(1) + '%' +
    ' meanEnergy=' + s.meanEnergy.toFixed(2) +
    ' lethalConds=' + (s.meanAbsentRules * 100).toFixed(1) + '%' +
    ' births=' + lastWorld.births + ' deaths=' + lastWorld.deaths +
    ' (last seed ' + seeds[seeds.length - 1] + ')');
}

// ─── 5. The genetics layer ───────────────────────────────────────────────────────────────
console.log('genome identity and diversity');
{
  const { genomeId, genomeFromId, nConditions, Stats, spinnerGenome } = globalThis;
  // The atlas is only honest if id <-> genome is a bijection over the WHOLE space.
  let bad = 0;
  const buf = new Int8Array(nConditions(2));
  for (let i = 0; i < 117649; i++) { genomeFromId(i, 2, buf); if (genomeId(buf, 0, 6, 2) !== i) bad++; }
  check('genome id is a bijection over all 117,649 n=2 genomes', bad === 0, bad + ' mismatches');

  Object.assign(P, DEFAULTS, { seed: 4242 });
  const w = new World();
  const st = new Stats(w);
  run(w, 600);
  const rec = st.sample(600);

  let rowsOk = true;
  for (let q = 0; q < st.ncond; q++) {
    let sum = 0;
    for (let sl = 0; sl < st.nslot; sl++) sum += rec.alleles[q * st.nslot + sl];
    if (Math.abs(sum - 1) > 1e-4) rowsOk = false;
  }
  check('every condition row of the allele table sums to 1', rowsOk);
  check('effective genotypes <= distinct (Hill N1 bound)', rec.effective <= rec.distinct + 1e-9,
        'effective=' + rec.effective.toFixed(1) + ' distinct=' + rec.distinct);
  check('inverse Simpson <= effective (N2 <= N1)', rec.simpson <= rec.effective + 1e-9,
        'N2=' + rec.simpson.toFixed(1) + ' N1=' + rec.effective.toFixed(1));

  const ex = st.explored();
  check('atlas laid out as 343 x 343', st.atlasSide === 343, 'side=' + st.atlasSide);
  check('explored a strict subset of genome space', ex.seen > 0 && ex.seen < ex.total,
        ex.seen + '/' + ex.total + ' = ' + (ex.frac * 100).toFixed(3) + '%');
  console.log('    distinct=' + rec.distinct + '  effective(N1)=' + rec.effective.toFixed(1) +
    '  inverseSimpson(N2)=' + rec.simpson.toFixed(1) + '  top=' + (rec.topShare * 100).toFixed(1) + '%' +
    '  explored=' + (ex.frac * 100).toFixed(3) + '%');

  // A monoculture must read as diversity 1, whatever the population size.
  Object.assign(P, { seed: 7, gridCols: 41, gridRows: 41, n: 2, initialSeeds: 0,
    mutationRate: 0, pDeath: 0, absentP: 0, reproCost: 1, rotationCost: 0,
    energyPerTransition: 1, childEnergy: 0, childOrientation: 'inherit', asyncUpdate: true });
  const w2 = new World();
  w2.place(20 * w2.rows + 20, 0, 0, spinnerGenome());
  const st2 = new Stats(w2);
  run(w2, 40);
  const r2 = st2.sample(40);
  check('a clonal population has effective diversity 1', Math.abs(r2.effective - 1) < 1e-6,
        'effective=' + r2.effective.toFixed(6) + ' pop=' + r2.population);
}

console.log('smoke: ' + (failures === 0 ? 'PASS' : 'FAIL (' + failures + ')'));
process.exit(failures === 0 ? 0 : 1);
