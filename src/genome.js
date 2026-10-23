'use strict';
// The genome: a rule table keyed on what the organism can sense.
//
// CONDITION — the organism senses exactly one cell, the one its face points at.
//   self  ∈ 0..n-1        (the organism is alive, so it always has a colour)
//   faced ∈ {dead} ∪ 0..n-1   → n+1 values
//   cond  = self * (n+1) + (facedColor + 1)      [dead is -1, so it indexes to 0]
//   ncond = n * (n+1)                            [6 at n=2, 12 at n=3]
//
// OUTPUT — one byte per condition.
//   -1                    absent: no rule matches, the organism dies
//   code = colour * 3 + rot     rot ∈ {0:L, 1:none, 2:R}     → 3n codes
//
// GENOME SPACE = (3n + 1) ^ (n(n+1)).  n=2 → 7^6 = 117,649 (enumerable — this is the
// whole argument for making n=2 primary). n=3 → 10^12, and the atlas is gone.
//
// MOVEMENT (PARAMETERS.movement). When on, every output also carries a move bit:
//   code = move * 3n + colour * 3 + rot          → 6n codes
// The move bit sits ABOVE the old codes, so with movement off every code, every genome id
// and the 343x343 atlas mean exactly what they always did. With it on, n=2 is
// 13^6 = 4,826,809 genomes (still enumerable). The flag is read live, so changing it
// requires a fresh World — the control panel resets on toggle.
var RULE_ABSENT = -1;

function movementOn() { return !!PARAMETERS.movement; }
function nConditions(n) { return n * (n + 1); }
function nOutputs(n) { return 3 * n * (movementOn() ? 2 : 1); }   // excludes RULE_ABSENT
function genomeSpaceSize(n) { return Math.pow(nOutputs(n) + 1, n * (n + 1)); }
// Genomes are Int8Array, so the largest rule code, nOutputs(n) - 1, must be <= 127: n <= 42
// with movement off, n <= 21 with it on. Past that a code wraps negative and silently becomes
// a different rule (or a fake RULE_ABSENT), so World refuses to build rather than run corrupt.
function maxColours() { return Math.floor(128 / nOutputs(1)); }

function condIndex(self, facedColor, n) { return self * (n + 1) + (facedColor + 1); }
function outCode(color, rot, move, n) { return color * 3 + rot + (move ? 3 * n : 0); }
function outColor(code, n) { return ((code / 3) | 0) % n; }
function outRot(code) { return code % 3; }
function outMoves(code, n) { return code >= 3 * n; }
function outLabel(code, n) {
  return 'c' + outColor(code, n) + ['L', '-', 'R'][outRot(code)] + (outMoves(code, n) ? 'm' : '');
}

// Human-readable dump of one genome, for the console and for test failures.
function genomeToString(g, n) {
  const parts = [];
  for (let self = 0; self < n; self++) {
    for (let f = -1; f < n; f++) {
      const code = g[condIndex(self, f, n)];
      const lhs = 'c' + self + '|' + (f < 0 ? 'dead' : 'c' + f);
      parts.push(lhs + '->' + (code === RULE_ABSENT ? 'die' : outLabel(code, n)));
    }
  }
  return parts.join('  ');
}

// Numeric identity for a genome: read the rule table as a base-(3n+1) number, with
// RULE_ABSENT as digit 0. At n=2 that is a 6-digit base-7 number, so every possible organism
// has an id in 0..117648 — the whole genome space indexes into an ordinary array. This is
// what makes the atlas view possible, and it makes clone counting allocation-free.
//
// Exact while (3n+1)^ncond <= 2^53: fine for n=2 (1.2e5) and n=3 (1e12), NOT for n>=4, where
// genomeKey() is the fallback.
function genomeIdExact(n) { return genomeSpaceSize(n) <= Number.MAX_SAFE_INTEGER; }

function genomeId(g, base, ncond, n) {
  const radix = nOutputs(n) + 1;
  let id = 0;
  for (let q = 0; q < ncond; q++) id = id * radix + (g[base + q] + 1);
  return id;
}

// The genome's id with every move bit dropped: a base-(3n+1) number whatever the movement
// setting. This is the atlas coordinate, so the 343x343 picture survives movement — each
// pixel then stands for the 2^6 = 64 genomes that differ only in when they move. With
// movement off it equals genomeId.
function skeletonId(g, base, ncond, n) {
  const radix = 3 * n + 1, span = 3 * n;
  let id = 0;
  for (let q = 0; q < ncond; q++) {
    const v = g[base + q];
    id = id * radix + (v === RULE_ABSENT ? 0 : (v % span) + 1);
  }
  return id;
}

// Inverse of genomeId — unpack an id back into a rule table.
function genomeFromId(id, n, out) {
  const ncond = nConditions(n), radix = nOutputs(n) + 1;
  const g = out || new Int8Array(ncond);
  for (let q = ncond - 1; q >= 0; q--) {
    g[q] = (id % radix) - 1;
    id = Math.floor(id / radix);
  }
  return g;
}

// A canonical string key for genotype identity (clone counting, genotype colouring).
function genomeKey(g, base, ncond) {
  let s = '';
  for (let q = 0; q < ncond; q++) s += (g[base + q] + 1).toString(36) + ',';
  return s;
}

// Random genome. `absentP` is the probability a slot is absent (death) — the dial that
// sets how lethal the initial population is. With `fillOpen`, the n facing-empty conditions
// (q % (n+1) === 0, since empty indexes to 0) always get a rule, so a founder is viable in
// open space and absentP only bites once it meets other organisms. Off, the draw sequence
// is the original one, so old seeds replay exactly.
function randomGenome(n, absentP, out, base, fillOpen) {
  const ncond = nConditions(n), nout = nOutputs(n);
  for (let q = 0; q < ncond; q++) {
    if (fillOpen && q % (n + 1) === 0) { out[base + q] = randomInt(nout); continue; }
    out[base + q] = random() < absentP ? RULE_ABSENT : randomInt(nout);
  }
  return out;
}

function filledRules(g, base, ncond) {
  let k = 0;
  for (let q = 0; q < ncond; q++) if (g[base + q] !== RULE_ABSENT) k++;
  return k;
}

// The energy an organism needs to reproduce, and pays when it does: a flat reproCost plus
// reproCostPerRule for each rule its genome has filled. Carrying a rule is then paid for at
// every birth, which lets selection weigh a rule's price against the death it prevents.
function reproThreshold(g, base, ncond) {
  const k = PARAMETERS.reproCostPerRule;
  return k ? PARAMETERS.reproCost + k * filledRules(g, base, ncond) : PARAMETERS.reproCost;
}

// Point mutation on copy: each slot independently reassigned with probability `rate`.
// A reassignment may land on RULE_ABSENT, so rules are both created and destroyed here.
function mutateGenome(g, base, n, rate, absentP) {
  const ncond = nConditions(n), nout = nOutputs(n);
  let nMut = 0;
  for (let q = 0; q < ncond; q++) {
    if (random() < rate) {
      g[base + q] = random() < absentP ? RULE_ABSENT : randomInt(nout);
      nMut++;
    }
  }
  return nMut;
}

// ─── Named genomes (n = 2) ────────────────────────────────────────────────────
// The two organisms Stage 1 has to demonstrate. Both flip colour every tick, because
// they run on the 'change' economy (energyRule; seedNamed forces it), where energy is earned
// on colour CHANGE — an organism that never changes colour never earns and so can never
// reproduce. Alone on an empty grid the neighbour rules would pay them nothing at all.

// SPINNER — "flip colour and turn right, always." Reproduces whenever its face lands on
// an empty cell, so it tiles the six cells around itself and its children do the same:
// the film-builder. Every condition is covered, so it never dies of rule-absence.
//   c0|*  -> c1 R      c1|*  -> c0 R
function spinnerGenome() {
  const n = 2, g = new Int8Array(nConditions(n));
  for (let f = -1; f < n; f++) {
    g[condIndex(0, f, n)] = outCode(1, ROT_R, 0, n);   // colour 0 → colour 1, turn right
    g[condIndex(1, f, n)] = outCode(0, ROT_R, 0, n);   // colour 1 → colour 0, turn right
  }
  return g;
}

// WALKER — "reproduce forward, then die." Facing empty space it flips colour and copies
// itself ahead; the next tick it faces its own child, finds no rule, and dies. The organism
// is sessile, but the birth/death cycle carries it in a straight line. Locomotion for free.
//   c0|dead -> c1 -     c1|dead -> c0 -      every other condition: die
function walkerGenome() {
  const n = 2, g = new Int8Array(nConditions(n)).fill(RULE_ABSENT);
  g[condIndex(0, -1, n)] = outCode(1, ROT_NONE, 0, n);  // facing empty: become c1, spawn ahead
  g[condIndex(1, -1, n)] = outCode(0, ROT_NONE, 0, n);  // facing empty: become c0, spawn ahead
  return g;                                              // facing anything alive: no rule → die
}

// CRAWLER (movement on only) — "flip colour and step forward, always." It actually moves,
// rather than walking by birth and death, and it leaves a child in each cell it vacates
// whenever it can afford one. At reproCost 1 that is every tick: a straight trail of
// children behind a single advancing head. The movement counterpart of the walker.
//   c*|*  -> flip colour, no turn, move
function crawlerGenome() {
  const n = 2, g = new Int8Array(nConditions(n));
  for (let f = -1; f < n; f++) {
    g[condIndex(0, f, n)] = outCode(1, ROT_NONE, 1, n);
    g[condIndex(1, f, n)] = outCode(0, ROT_NONE, 1, n);
  }
  return g;
}
