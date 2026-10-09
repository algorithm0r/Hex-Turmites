# Hex Turmites — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-09 (slow-mo + GitHub Pages) — refreshed every session close; may carry unverified claims
**Verified:** 2026-09-18 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
DEVPLAN Stage 1b — The economy is not yet doing real work  `[ ACTIVE ]` (untouched since 2026-09-18)

## State
Stages 1 and 2 done: the egocentric face model runs in-browser and headless, with a four-page
stats panel (population / gene pool / genome-space atlas / lineages). Smoke PASS (28 checks)
@ b98a57d (2026-10-09).

**Live:** https://algorithm0r.github.io/Hex-Turmites/ — GitHub Pages from `main` of the public
repo `algorithm0r/Hex-Turmites`; every push to `main` redeploys. Checked in a browser on
2026-10-09: loads and runs, no console errors, and the DB client is null on that host, so visitors
never write packets. Local copies still write to `hexturmitesDB` at epoch.

Browser speed now goes both ways: Speed (1-100 ticks/frame) and Slow-mo (one tick every 1-60
frames). Slow-mo was verified on the live site (ticks = frames / N).

## Metrics
- smoketest: 28/28 PASS @ b98a57d; deterministic (8/8 repeat runs, last measured 2026-09-18)
- walker: 15 ticks → 2 cells alive, advanced exactly 15 hexes, births = deaths + 1
- spinner: 6 ticks → 6/6 neighbours filled, 0 deaths
- shipped defaults @ t=1000: median pop 6292, lethal slots ~0.1% (seeded 15%) — 2026-09-18
- extinction risk: 0/60 seeds at initialSeeds=100 (was 1/60 at 40) — 2026-09-18
- diversity @ t~3200: 680 distinct genotypes but effective (Hill N1) only 151, top clone 8% — 2026-09-18
- genome space explored: ~2-3% of 117,649 after a few thousand ticks — 2026-09-18
- draw cost: observer 3.6 ms/frame, heaviest panel page 2.6 ms, world.update 0.55 ms/tick — 2026-09-18

## Branches
- `main` (tracks `origin/main`)

## Open
- The stats-panel tab strip has still not been seen at full width in a real browser. Playwright
  MCP fails to launch Firefox, and the built-in pane was too narrow to show the panel. Chris
  can check it on the live site.
- Forks 1-3 settled (see DEVPLAN "Settled in Stage 1"); fork 3 (rotation cost) unswept.
- The model saturates to density ~0.98 in every parameter regime tried. Decide whether to add a
  pressure or report it.
- Layout deviation (from the PA hub): the repo is the container itself, not `Hex Turmites/sim`.

## Next action
DEVPLAN Stage 1b — sweep reproCost x pDeath x mutationRate properly and decide whether the
saturating attractor needs a new pressure.

## Blockers
- none
