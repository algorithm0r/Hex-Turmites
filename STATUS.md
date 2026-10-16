# Hex Turmites — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-16 (movement toggle + neighbour-colour energy) — refreshed every session close; may carry unverified claims
**Verified:** 2026-09-18 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
DEVPLAN Stage 1b — The economy is not yet doing real work  `[ ACTIVE ]`

## State
Stages 1 and 2 done. The face model runs in-browser and headless with a four-page stats panel.
Smoke PASS (51 checks) @ ac86213, deterministic across 3 repeat runs.

**The model changed this session (2026-10-11):**
- **Energy now comes from neighbour colours.** Default `energyRule: 'mismatch'`: one unit per
  living neighbour of a different colour. Also available: `'match'`, and `'change'` (Stage 1),
  which reproduces the old shipped-defaults numbers exactly @ ac86213. Random founders start
  funded for `founderChildren` births. The demos force `'change'`.
- **Movement is a toggle, off by default**: a move bit per rule. A mover steps into the empty
  faced cell and leaves its child in the cell it vacated. Off = Stage 1 encoding, bit-identical.

Browser-checked @ local server 2026-10-11: controls work, no console errors, tab strip looks
right. Atlas page look with movement on: unchecked (stale screenshot).

**Live:** https://algorithm0r.github.io/Hex-Turmites/ serves `main`. It gets these changes on
the push that follows this close; the redeploy is unverified until someone loads it.

## Metrics
- smoketest: 51/51 PASS @ ac86213
- shipped defaults (mismatch) @ t=1000, seed 606: density 0.986, mean energy 229, effective N1 47.9 (seed 4242, t=600)
- energy rules @ t=1500, 4 seeds (2026-10-11): density 0.95-0.99 under every rule; unlike-neighbour fraction change 0.43 / mismatch 0.42 / mismatch+empty 0.37 / match 0.17
- mismatch reproCost 25-50: every survivor at 0.91-0.99 by t=3000; 1-3/6 founding failures from 40 up
- movement on, shipped defaults @ t=600: density 0.990, effective N1 39.5 (inflated by neutral move bits)
- walker / spinner / crawler demos: pinned by the smoke test (15 hexes in 15 ticks; 6/6 neighbours; 15 moves, 0 births)

## Branches
- `main` (tracks `origin/main`)

## Open
- **Saturation survives both changes.** Income (0-6/tick) dwarfs reproCost 20, so energy does
  not limit reproduction; raising the cost only delays filling.
- **Mismatch does not mix colours** (unlike-neighbour 0.42, below the colour-blind 0.5).
  Unexplained; the kin-colour guess is untested.
- With movement on, 4 of 6 n=2 move bits are neutral, so genotype diversity counts include
  drift. A phenotype id that drops them is not built.
- Atlas page with movement on: not seen in a real browser.
- Layout deviation (from the PA hub): the repo is the container itself, not `Hex Turmites/sim`.

## Next action
DEVPLAN Stage 1b — try a pressure that bites when income is high: per-tick metabolism or an
energy cap. Then the full reproCost x pDeath x mutationRate x energyRule sweep.

## Blockers
- none
