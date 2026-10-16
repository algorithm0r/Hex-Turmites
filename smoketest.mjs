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
    movement: false, moveCost: 0,
    energyRule: 'change', emptyIsMismatch: false, founderChildren: 0,   // the economy the demos are built on
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
  Object.assign(P, { seed: 7, gridCols: 41, gridRows: 41, n: 2, initialSeeds: 0, energyRule: 'change',
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

// ─── 6. The stats tabs are a control, not a picture of one ───────────────────────────────
// views.js is browser-only, so it gets a stubbed 2D context. Worth the stub: the tab strip is
// drawn by the same code that hit-tests it, and a drift between the two is invisible until
// someone clicks and nothing happens.
console.log('stats tabs');
{
  const noop = () => {};
  const ctx = {
    canvas: { width: 1704, height: 984 },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    stroke: noop, fill: noop, fillRect: noop, strokeRect: noop, fillText: noop,
    drawImage: noop, putImageData: noop, translate: noop, rotate: noop, scale: noop,
    clearRect: noop, arc: noop, rect: noop, setTransform: noop,
    measureText: (t) => ({ width: String(t).length * 5 }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
    textBaseline: '', imageSmoothingEnabled: true,
  };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };

  const viewsSrc = readFileSync(path.join(__dirname, 'src', 'views.js'), 'utf8')
    .replace(/^\s*(['"])use strict\1;?/, '');
  indirectEval(viewsSrc);
  const { Views, Stats } = globalThis;

  Object.assign(P, DEFAULTS, { seed: 5150 });
  globalThis.PANEL_W = P.panelWidth;
  const bw = Math.ceil(P.gridCols * P.cellSize * 1.5 + P.cellSize * 2);
  globalThis.boardWidth = () => bw;

  const w = new World();
  const st = new Stats(w);
  run(w, 200);
  st.sample(200);
  const views = new Views(w, st);

  let allPagesDrew = true, drawErr = '';
  for (let pg = 0; pg < 4; pg++) {
    P.statsPage = pg;
    try { views.draw(ctx); } catch (e) { allPagesDrew = false; drawErr = 'page ' + pg + ': ' + e.message; }
  }
  check('all four pages draw without throwing', allPagesDrew, drawErr);
  check('the tab strip registered 4 click targets', views._tabRects.length === 4,
        'n=' + views._tabRects.length);

  // the centre of tab i must hit page i
  let hits = true, detail = '';
  for (const t of views._tabRects) {
    const got = views.hitTestTab(t.x + t.w / 2, t.y + t.h / 2);
    if (got !== t.page) { hits = false; detail = 'tab ' + t.page + ' -> ' + got; }
  }
  check('clicking each tab selects its own page', hits, detail);
  check('a click on the board misses every tab', views.hitTestTab(10, 500) === -1);
  check('a click below the strip misses every tab',
        views.hitTestTab(views._tabRects[0].x + 4, views._tabRects[0].y + 60) === -1);

  // tabs must not overlap, and must stay inside the panel
  const sorted = [...views._tabRects].sort((a, b) => a.x - b.x);
  let disjoint = true;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].x < sorted[i - 1].x + sorted[i - 1].w) disjoint = false;
  check('tabs do not overlap', disjoint);
  const last = sorted[sorted.length - 1];
  check('tab strip stays inside the panel', last.x + last.w <= bw + P.panelWidth,
        'right edge ' + Math.round(last.x + last.w) + ' <= ' + (bw + P.panelWidth));

  // Movement widens the allele table to 13 slots and turns the atlas into a skeleton map —
  // every page has to survive that too.
  Object.assign(P, DEFAULTS, { seed: 5151, movement: true });
  const wm = new World();
  const stm = new Stats(wm);
  run(wm, 200);
  stm.sample(200);
  const vm = new Views(wm, stm);
  let mDrew = true, mErr = '';
  for (let pg = 0; pg < 4; pg++) {
    P.statsPage = pg;
    try { vm.draw(ctx); } catch (e) { mDrew = false; mErr = 'page ' + pg + ': ' + e.message; }
  }
  check('all four pages draw with movement on', mDrew, mErr);
  check('movement palette covers every slot', vm.palette.length === stm.nslot,
        vm.palette.length + ' colours for ' + stm.nslot + ' slots');
  Object.assign(P, DEFAULTS);
}

// ─── 7. MOVEMENT — a move bit per rule; step into empty, leave a child behind ────────────
console.log('movement');
{
  const { crawlerGenome, genomeId, genomeFromId, skeletonId, nOutputs, genomeSpaceSize, outCode,
          ROT_NONE, Stats } = globalThis;

  // The encoding: off is the Stage 1 space exactly, on doubles the outputs.
  P.movement = false;
  const offOut = nOutputs(2), offSpace = genomeSpaceSize(2);
  P.movement = true;
  const onOut = nOutputs(2), onSpace = genomeSpaceSize(2);
  check('movement off: 6 outputs, 7^6 = 117,649 genomes', offOut === 6 && offSpace === 117649,
        offOut + ' outputs, ' + offSpace);
  check('movement on: 12 outputs, 13^6 = 4,826,809 genomes', onOut === 12 && onSpace === 4826809,
        onOut + ' outputs, ' + onSpace);

  // id <-> genome over the bigger space: every 7th id plus both ends, about 690k round trips.
  let bad = 0;
  const buf = new Int8Array(6);
  for (let i = 0; i < onSpace; i += 7) { genomeFromId(i, 2, buf); if (genomeId(buf, 0, 6, 2) !== i) bad++; }
  genomeFromId(onSpace - 1, 2, buf); if (genomeId(buf, 0, 6, 2) !== onSpace - 1) bad++;
  check('movement genome id round-trips (every 7th of 4.8M)', bad === 0, bad + ' mismatches');

  // Dropping move bits lands on the Stage 1 id: the atlas coordinate means the same thing.
  const crawl = crawlerGenome();
  const stripped = Int8Array.from(crawl, (v) => (v < 0 ? v : v % 6));
  P.movement = false;
  const stage1Id = genomeId(stripped, 0, 6, 2);
  P.movement = true;
  check('skeleton id of the crawler = Stage 1 id of its move-free twin',
        skeletonId(crawl, 0, 6, 2) === stage1Id, skeletonId(crawl, 0, 6, 2) + ' vs ' + stage1Id);

  // A crawler that can never afford a child is ONE organism that travels: no births, no deaths.
  {
    const T = 15, DIR = 0, col = 20, row = 30;
    const w = bare({ movement: true, reproCost: 1e9 });
    w.place(col * w.rows + row, 0, DIR, crawlerGenome());
    run(w, T);
    const alive = livingCells(w);
    const wrap = (r) => ((r % w.rows) + w.rows) % w.rows;
    const at = alive.length === 1 ? alive[0] : -1;
    check('a non-reproducing crawler stays one organism', alive.length === 1, 'n=' + alive.length);
    check('it moved exactly ' + T + ' cells north in ' + T + ' ticks',
          at === col * w.rows + wrap(row - T), 'cell=' + at + ' expected=' + (col * w.rows + wrap(row - T)));
    check('moves = ' + T + ', births = deaths = 0', w.moves === T && w.births === 0 && w.deaths === 0,
          'moves=' + w.moves + ' births=' + w.births + ' deaths=' + w.deaths);
  }

  // One tick at reproCost 1: the parent steps forward, the child appears where it was.
  {
    const DIR = 0, col = 20, row = 30;
    const w = bare({ movement: true, reproCost: 1 });
    const start = col * w.rows + row;
    w.place(start, 0, DIR, crawlerGenome());
    run(w, 1);
    const ahead = hexNeighbor(col, row, DIR, w.cols, w.rows);
    check('after one tick: parent ahead, child in the vacated cell',
          w.color[ahead] !== -1 && w.color[start] !== -1 && w.population() === 2,
          'ahead=' + w.color[ahead] + ' behind=' + w.color[start] + ' pop=' + w.population());
    check('the child behind faces the way its parent went (inherit)', w.face[start] === DIR,
          'face=' + w.face[start]);
    check('the parent paid reproCost, the child starts at childEnergy',
          w.energy[ahead] === 0 && w.energy[start] === 0 && w.births === 1 && w.moves === 1,
          'parent=' + w.energy[ahead] + ' child=' + w.energy[start] + ' births=' + w.births);
  }

  // Facing something alive, a move is blocked: the rule only recolours.
  {
    const col = 20, row = 30;
    const w = bare({ movement: true, reproCost: 1e9 });
    const me = col * w.rows + row, ahead = hexNeighbor(col, row, 0, w.cols, w.rows);
    const wall = new Int8Array(6).fill(outCode(0, ROT_NONE, 0, 2));   // stays c0, never turns or moves
    w.place(ahead, 0, 3, wall);
    w.place(me, 0, 0, crawlerGenome());
    run(w, 3);
    check('a crawler facing a living cell does not move', w.color[me] !== -1 && w.moves === 0,
          'moves=' + w.moves);
  }

  // The shipped economy with movement on: alive, moving, and every gene a legal code.
  {
    Object.assign(P, DEFAULTS, { seed: 909, movement: true });
    const w = new World();
    const st = new Stats(w);
    run(w, 600);
    let illegal = 0;
    for (let i = 0; i < w.N; i++) {
      if (w.color[i] === -1) continue;
      for (let q = 0; q < w.ncond; q++) {
        const v = w.genome[i * w.ncond + q];
        if (v < -1 || v >= 12) illegal++;
      }
    }
    const rec = st.sample(600);
    const ex = st.explored();
    check('shipped defaults + movement: population survives 600 ticks', rec.population > 0,
          'pop=' + rec.population);
    check('organisms actually move', w.moves > 0, 'moves=' + w.moves);
    check('every gene is a legal movement code (-1..11)', illegal === 0, illegal + ' illegal');
    check('the atlas stays 343 x 343 with movement on', st.atlasSide === 343 && ex.total === 117649,
          'side=' + st.atlasSide + ' total=' + ex.total);
    console.log('    movement @ t=600: pop=' + rec.population + ' density=' + rec.density.toFixed(3) +
      ' effective(N1)=' + rec.effective.toFixed(1) + ' distinct=' + rec.distinct +
      ' moves=' + w.moves + ' births=' + w.births + ' deaths=' + w.deaths +
      ' skeletons explored=' + (ex.frac * 100).toFixed(3) + '%');
  }
  Object.assign(P, DEFAULTS);
}

// ─── 8. ENERGY RULES — what one organism earns from a fixed neighbourhood ────────────────
// A c0 centre with two c1 neighbours, one c0 neighbour and three empty cells. Every organism
// runs a "stay c0/c1, never turn" genome, so nobody changes colour and the neighbourhood holds
// still for the tick. The centre's income is then exactly the count each rule defines.
console.log('energy rules');
{
  const { outCode, ROT_NONE, condIndex } = globalThis;
  const still = (c) => { const g = new Int8Array(6); for (let q = 0; q < 6; q++) g[q] = outCode(c, ROT_NONE, 0, 2); return g; };
  const earned = (over) => {
    const w = bare(Object.assign({ reproCost: 1e9 }, over));
    const col = 20, row = 20, me = col * w.rows + row;
    w.place(me, 0, 0, still(0));
    w.place(w.nbr[me * 6 + 0], 1, 0, still(1));
    w.place(w.nbr[me * 6 + 2], 1, 0, still(1));
    w.place(w.nbr[me * 6 + 4], 0, 0, still(0));
    run(w, 1);
    return w.energy[me];
  };
  const cases = [
    ['mismatch, living only: 2 unlike neighbours → 2', { energyRule: 'mismatch' }, 2],
    ['mismatch, empty pays: 2 unlike + 3 empty → 5', { energyRule: 'mismatch', emptyIsMismatch: true }, 5],
    ['match: 1 like neighbour → 1', { energyRule: 'match' }, 1],
    ['match ignores emptyIsMismatch → still 1', { energyRule: 'match', emptyIsMismatch: true }, 1],
    ['change: no colour change → 0', { energyRule: 'change' }, 0],
  ];
  for (const [name, over, want] of cases) {
    const got = earned(over);
    check(name, got === want, 'earned ' + got);
  }

  // Founders are funded in children, so raising reproCost cannot starve them.
  Object.assign(P, DEFAULTS, { seed: 31, reproCost: 45 });
  const wf = new World();
  let funded = true;
  for (let i = 0; i < wf.N; i++) if (wf.color[i] !== -1 && wf.energy[i] !== 45) funded = false;
  check('founders start with founderChildren x reproCost energy', funded && DEFAULTS.founderChildren === 1);
  Object.assign(P, DEFAULTS);
}

console.log('smoke: ' + (failures === 0 ? 'PASS' : 'FAIL (' + failures + ')'));
process.exit(failures === 0 ? 0 : 1);
