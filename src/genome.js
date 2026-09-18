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
var RULE_ABSENT = -1;

function nConditions(n) { return n * (n + 1); }
function nOutputs(n) { return 3 * n; }              // excludes RULE_ABSENT
function genomeSpaceSize(n) { return Math.pow(3 * n + 1, n * (n + 1)); }

function condIndex(self, facedColor, n) { return self * (n + 1) + (facedColor + 1); }
function outCode(color, rot) { return color * 3 + rot; }
function outColor(code) { return (code / 3) | 0; }
function outRot(code) { return code % 3; }

// Human-readable dump of one genome, for the console and for test failures.
function genomeToString(g, n) {
  const rotName = ['L', '-', 'R'];
  const parts = [];
  for (let self = 0; self < n; self++) {
    for (let f = -1; f < n; f++) {
      const code = g[condIndex(self, f, n)];
      const lhs = 'c' + self + '|' + (f < 0 ? 'dead' : 'c' + f);
      parts.push(lhs + '->' + (code === RULE_ABSENT ? 'die' : 'c' + outColor(code) + rotName[outRot(code)]));
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
  const radix = 3 * n + 1;
  let id = 0;
  for (let q = 0; q < ncond; q++) id = id * radix + (g[base + q] + 1);
  return id;
}

// Inverse of genomeId — unpack an id back into a rule table.
function genomeFromId(id, n, out) {
  const ncond = nConditions(n), radix = 3 * n + 1;
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
// sets how lethal the initial population is.
function randomGenome(n, absentP, out, base) {
  const ncond = nConditions(n), nout = nOutputs(n);
  for (let q = 0; q < ncond; q++) {
    out[base + q] = random() < absentP ? RULE_ABSENT : randomInt(nout);
  }
  return out;
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
// energy is earned on colour CHANGE (fork 2: fixed cost per reproduction) — an organism
// that never changes colour never earns and so can never reproduce.

// SPINNER — "flip colour and turn right, always." Reproduces whenever its face lands on
// an empty cell, so it tiles the six cells around itself and its children do the same:
// the film-builder. Every condition is covered, so it never dies of rule-absence.
//   c0|*  -> c1 R      c1|*  -> c0 R
function spinnerGenome() {
  const n = 2, g = new Int8Array(nConditions(n));
  for (let f = -1; f < n; f++) {
    g[condIndex(0, f, n)] = outCode(1, ROT_R);   // colour 0 → colour 1, turn right
    g[condIndex(1, f, n)] = outCode(0, ROT_R);   // colour 1 → colour 0, turn right
  }
  return g;
}

// WALKER — "reproduce forward, then die." Facing empty space it flips colour and copies
// itself ahead; the next tick it faces its own child, finds no rule, and dies. The organism
// is sessile, but the birth/death cycle carries it in a straight line. Locomotion for free.
//   c0|dead -> c1 -     c1|dead -> c0 -      every other condition: die
function walkerGenome() {
  const n = 2, g = new Int8Array(nConditions(n)).fill(RULE_ABSENT);
  g[condIndex(0, -1, n)] = outCode(1, ROT_NONE);  // facing empty: become c1, spawn ahead
  g[condIndex(1, -1, n)] = outCode(0, ROT_NONE);  // facing empty: become c0, spawn ahead
  return g;                                        // facing anything alive: no rule → die
}
