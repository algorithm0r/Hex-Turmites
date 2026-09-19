# Hex Turmites — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-09-18 (scaffold) — refreshed every session close; may carry unverified claims
**Verified:** 2026-09-18 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
DEVPLAN Stage 1b — The economy is not yet doing real work  `[ ACTIVE ]`
(Stage 2, rule-space visualization, landed 2026-09-18)

## State
Stages 1 and 2 done: the egocentric face model runs in-browser and headless, with a four-page
stats panel (population / gene pool / genome-space atlas / lineages). Spinner and walker
demonstrators verified. Smoke PASS (21 checks) @ 2026-09-18; browser-checked on all four
pages, no console errors.

## Metrics
- smoketest: 28/28 PASS, deterministic (8/8 repeat runs)
- walker: 15 ticks → 2 cells alive, advanced exactly 15 hexes, births = deaths + 1
- spinner: 6 ticks → 6/6 neighbours filled, 0 deaths
- shipped defaults @ t=1000: median pop 6292, lethal slots ~0.1% (seeded 15%)
- extinction risk: 0/60 seeds at initialSeeds=100 (was 1/60 at 40)
- diversity @ t~3200: 680 distinct genotypes but effective (Hill N1) only 151, top clone 8%
- genome space explored: ~2-3% of 117,649 after a few thousand ticks
- draw cost: observer 3.6 ms/frame, heaviest panel page 2.6 ms, world.update 0.55 ms/tick

## Branches
- `main`

## Open
- The new tab strip has not been seen in a real browser (Playwright MCP pinned to an
  uninstalled Firefox build); click geometry is covered by the stub test, the look is not.
- Runs are reproducible: `PARAMETERS.seed` pins the PRNG and the seed is saved in the packet.
- Forks 1-3 settled (see DEVPLAN "Settled in Stage 1"); fork 3 (rotation cost) unswept.
- The model saturates to density ~0.98 in every parameter regime tried — selection purges
  lethal rules faster than density rises. Decide whether to add a pressure or report it.

## Next action
DEVPLAN Stage 1b — sweep reproCost x pDeath x mutationRate properly and decide whether the
saturating attractor needs a new pressure.

## Blockers
- none
