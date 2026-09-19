# Hex Turmites — DEVLOG
Newest entry on top. **Append only — never edit past entries.**

<!-- append new entries above this line -->

## 2026-09-18 — tabs become a control; what the genotype colours actually mean
**Done:** the stats panel's tab strip is now a real control. It was drawn to look like tabs but
nothing hit-tested it — an affordance with no function. `Views._tabs` now records click targets,
`Views.hitTestTab` resolves a canvas point to a page, and `main.js` routes canvas clicks and
sets a pointer cursor over the strip. `Tab` / `Shift-Tab` cycle pages, keys `1`-`4` still jump
directly, and the four page buttons are gone from the control panel. `BUTTON` joined the
keydown exclusion list so Tab still moves focus normally through the remaining controls.

**Measured — are genotype colours arbitrary or similarity-based?** Chris asked; the honest
answer needed numbers rather than a reading of the code. Over 30,000 constructed pairs at each
exact Hamming distance (n=2):

| slots differing | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| mean colour distance | 1.371 | 1.907 | 2.327 | 2.671 | 2.988 | 3.269 |

**Similarity-based, but only in one direction.** Monotone, so not arbitrary — but the ratio
from 1 slot to all 6 is 2.38x, not 6x, which is the sqrt(6) = 2.45 random-walk scaling a random
projection gives. The distributions overlap heavily: a 1-slot-different pair looks *farther*
apart than a completely different pair **8.5%** of the time.

So identical genomes are exactly the same colour (a clone is a uniform patch — the guarantee
that matters) and near-identical genomes are near-identical colours, but distance is not
readable off the picture. Recorded in `observer.js` next to the projection, in the README, and
as a Stage 2b item: if distance has to be legible it wants a real embedding (MDS/UMAP over the
117,649 genomes, precomputed once), not a random projection.

Worth stating plainly because the two colour schemes in the app mean different things: the grid
genotype view is similarity-based, while **page 4's lineage colours are an arbitrary hash of the
genome id** and say nothing about similarity.

Also checked: the genotype palette renormalises per frame from the living population, so a fixed
genome's rendered colour drifts as the population changes — measured at 4-8 units out of a 200
range over 4000 ticks, i.e. 2-4%. Visually negligible; left alone.

**State:** `node smoketest.mjs` → PASS, 28 checks, 8/8 repeat runs. The tab strip is covered by
the automated checks now: `views.js` is exercised through a stubbed 2D context, which verifies
all four pages draw and that the centre of each tab resolves to its own page, that tabs do not
overlap, and that the strip stays inside the panel. That stub immediately earned its keep by
catching two missing context methods.

**Not verified in a real browser this session.** The Playwright MCP is pinned to Firefox 1544
and only 1543 and 1549 are installed, so it refused to launch; I did not download a browser onto
the machine for a visual check. The click geometry is covered by the stub test above, but the
*look* of the new tab strip is unconfirmed — worth ten seconds of Chris's eyes.

**Next:** unchanged — Stage 1b, the saturating attractor.

## 2026-09-18 — Stage 2: visualizing the gene pool
**Done:** a four-page stats panel (keys 1-4), all fed from a single genetics pass per
reporting period. New `src/stats.js` (population genetics) and `src/views.js` (the pages);
`genome.js` gained a numeric genome id and its inverse.

**The move that made the rest possible:** a genome is now read as a base-(3n+1) number, so at
n=2 every possible organism has an id in 0..117648 and the whole genome space indexes into an
ordinary array. Clone counting stopped using string keys, and the atlas became drawable. The
bijection is verified exhaustively over all 117,649 genomes in the smoke test — the atlas is
only honest if id <-> genome is exact.

**The four pages:**
1. *Population* — density, effective + distinct genotypes, top clone share, lethal slots.
2. *Gene pool* — the allele table: for each condition, the population's distribution over
   outputs, plus one stacked strip per condition over time. At n=2 this is the COMPLETE state
   of the gene pool (6x7), not a summary. The lethal-rule purge is directly visible here as
   the grey "die" band collapsing in every strip within the first few samples.
3. *Atlas* — all 117,649 possible organisms as a 343x343 image, because 7^6 = 343^2 exactly.
   Bright = alive now, dim = visited earlier. The 7x7 band structure is labelled and the
   labelling was verified against the id arithmetic, not assumed: `y = id/343` is the first
   three conditions so the row band is the rule for "c0 facing empty", and `x = id%343` makes
   the column band "c1 facing empty". Adjacency *within* a band is not meaningful and the
   caption says so.
4. *Lineages* — a Muller-style stack of every genotype that ever held share, each with its
   rule table spelled out.

**Measured — the diversity number was lying.** Distinct-genotype count runs far ahead of any
sensible reading of diversity because it counts singletons. Added Hill numbers:

| | distinct | effective (Hill N1) | inverse Simpson (N2) | top clone |
|---|---|---|---|---|
| t=600  | 181 | 40  | 22.6 | 9.5% |
| t=3200 | 680 | 151 | —    | 8.1% |

So the population behaves like ~150 equally-common genotypes, not 680 — a 4.5x overstatement.
STATUS and the panel now quote the effective number first. Pinned by smoke checks that N2 <=
N1 <= distinct and that a clonal population reads as exactly 1.

Genome space explored after a few thousand ticks: **~2-3% of 117,649**. Evolution is visiting
a small, structured corner of the space, and the top "die" row band of the atlas stays empty —
an organism whose rule for "c0 facing empty" is death leaves no descendants.

**State:** `node smoketest.mjs` → PASS, 21 checks, 10/10 repeat runs. Browser-checked on all
four pages, no console errors.

**Not a regression, recorded so the next instance does not chase it:** the headless browser
reports 0-15 ticks/sec because it never composites, so `requestAnimationFrame` does not fire
(`gameEngine.running` is true and `rafFramesPerSec` is 0). Direct timings are the real cost:
`world.update` 0.55 ms/tick, observer draw 3.6 ms/frame, heaviest panel page 2.6 ms. Framerate
on a real screen is Chris's to confirm.

**Next:** Stage 1b — the saturating attractor. Stage 2b holds the visualization follow-ups
(grid genotype-colour contrast, Hex CA's raster orderings, transition matrices, a
Hamming-preserving atlas layout).

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
