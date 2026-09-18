# Hex Turmites — DEVLOG
Newest entry on top. **Append only — never edit past entries.**

<!-- append new entries above this line -->

## 2026-09-18 — Stage 1: the face model runs
**Done:** built the egocentric turmite model on top of the scaffold. New `src/hex.js` (hex
geometry ported from ../Hex CA — flat-top even-q, six directions in clockwise order so a face
is an index and a right turn is `(face+1)%6`), new `src/genome.js` (the `(self, faced)` rule
table, mutation, and the two hand-written demonstrator genomes), rewritten `src/world.js`
(orientation field, sense→recolour→rotate→reproduce-forward, rule-absence death),
`src/observer.js` (hex rendering, face markers, JL genotype colouring), and a rewritten
`smoketest.mjs`. Removed the demo `agent.js`.

**Changed:** `params.js` is now the turmite parameter set. Defaults `n=2`, `reproCost=20`,
`pDeath=0.01`. Canvas now sizes itself from the grid (the old fixed 800x600 cropped the
bottom rows) and the four metric graphs moved into a right-hand gutter instead of being
drawn over the board. Control panel now refreshes when code changes PARAMETERS behind it —
it was showing `reproCost 20` while the demonstrators ran at 1.

**State:** `node smoketest.mjs` → PASS, 12 checks. Verified in-browser at
`http://127.0.0.1:8231` (python http.server; file:// is blocked by the browser harness) —
no console errors, both views render, graphs populate.

The two Stage 1 demonstrators, both asserted in the smoke test:
- **walker** `[c0|dead->c1-, c1|dead->c0-, everything else die]` — reproduces forward, then
  faces its own child, finds no rule, and dies. 15 ticks → exactly 2 cells alive, one column,
  advanced exactly 15 hexes north, births = deaths + 1. Locomotion out of the birth/death
  cycle, as predicted.
- **spinner** `[c0|*->c1R, c1|*->c0R]` — 6 ticks → all six neighbours of the seed alive,
  0 deaths. Keeps tiling: pop 1681 (a full 41x41 grid) by tick 60.

**Measured — the economy needed calibrating, and then stopped mattering.** At the inherited
`reproCost=1` the grid saturated (density 0.986) within a few hundred ticks. Sweeping cost
against death rate at 2000 ticks:

| reproCost | pDeath | density @1000 | density @2000 | genotypes | top clone |
|---|---|---|---|---|---|
| 1 | 0.005 | 0.995 | 0.995 | 868 | 5.9% |
| 5 | 0.02 | 0.975 | 0.978 | 787 | 8.7% |
| 20 | 0.02 | 0.197 | 0.862 | 492 | 12.5% |
| 60 | 0.005 | 0.077 | 0.359 | 202 | 17.9% |
| 60 | 0.02 | 0 (extinct) | 0 | — | — |

So the cost has to be tens of ticks of income to constrain anything — the prior session's
fork-2 worry was right, but the fix is calibrating against *income*, not genome size.

**Finding, and it is the input to the next decision:** even at a calibrated cost the system
has one attractor. Instrumenting the time course at `reproCost=20, pDeath=0.01`, the fraction
of lethal genome slots falls 11.9% → 1.37% by tick 500 while density is still only 0.41, and
reaches 0.2% by tick 1000. The purge *leads* saturation rather than following it. Reading
(inference, not measurement): with only 6 conditions, selection covers the whole rule table
almost immediately, after which rule-absence death stops operating and the population is
limited only by `pDeath` and space — so it fills to ~0.98 and sits there. This is fork 4's
"12 conditions is a tiny FSM and the dynamics may be too regular", arriving earlier than
expected. Recorded as Stage 1b rather than tuned away.

**Reproducibility, added after the smoke test turned out to be flaky.** Running it repeatedly,
1 run in 12 failed with the founding population extinct. That was two defects, not one:
- Every stochastic choice in the sim core now goes through a seeded mulberry32 (`setSeed` /
  `random` in `util.js`); `Math.random` no longer appears in `src/`. `PARAMETERS.seed` pins a
  run, `null` draws a fresh one, and the seed actually used is recorded in `stats()` and so
  travels into the data packet. Verified: same seed → identical trajectory, different seed →
  different.
- The extinction was real, not test noise. Measured over 60 seeds x 1000 ticks:
  `initialSeeds=40` → 1/60 extinct; 100 → 0/60; 200 → 0/60; 400 → 0/60. Default raised
  40 → 100 (median pop at t=1000: 3330 → 6292). Opening the page had a ~2% chance of a dead
  grid.

The smoke test now runs the shipped defaults across six fixed seeds instead of one unseeded
run: 10/10 repeat invocations pass, 14 checks.

**Next:** Stage 1b — decide whether the saturating attractor is a problem to fix (crowding
cost? metabolism? ageing?) or the honest result to report.

## 2026-09-18 — scaffolded
**Done:** project scaffolded from engine v2 — vanilla-JS canvas microframework with
model/view split, the vendored standard DB client, a headless `runner.mjs`, and `smoketest.mjs`.
**Changed:** initial file tree.
**State:** runs (demo drifters model, in-browser + headless); `smoketest.mjs` passes.
**Next:** replace the demo model with the real Hex Turmites dynamics (DEVPLAN Stage 1).
