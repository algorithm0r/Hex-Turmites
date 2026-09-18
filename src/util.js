'use strict';
// Pure helpers — no DOM, no globals beyond these. Safe to load in the browser AND in the
// headless vm context (declared as `var`/`function` so they attach to either global).
var TAU = Math.PI * 2;

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────
// Every stochastic choice in the sim core goes through random(), never Math.random, so a
// run is reproducible from its seed alone. The seed actually used is written into the data
// packet, which is what makes a stored run re-runnable later.
var _rngState = 0;

function setSeed(s) {
  _rngState = (s >>> 0) || 0x9e3779b9;
  return _rngState;
}

// mulberry32
function random() {
  _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

setSeed((Date.now() ^ 0x5bf03635) >>> 0);   // replaced by PARAMETERS.seed at World construction

function randomInt(n) { return Math.floor(random() * n); }
function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Box–Muller normal sample
function normalSample(mean, sd) {
  mean = mean || 0; sd = (sd == null) ? 1 : sd;
  const u = 1 - random(), v = random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function rgb(r, g, b) { return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')'; }
function hsl(h, s, l) { return 'hsl(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%)'; }

// Evenly spaced hues for the n living colours (from ../Hex CA/sim/util.js).
function getCellColors(n) {
  return Array.from({ length: n }, (_, i) => 'hsl(' + Math.round(i * 360 / n) + ', 75%, 58%)');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}
