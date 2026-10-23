# Hex Turmites — STATUS
*One screen. The current pulse. Overwritten, never appended — for history read DEVLOG.*

**Updated:** 2026-10-23 (up to 42 colours; payoff/diversity income; drink/pour/eat; absentP 0) — refreshed every session close; may carry unverified claims
**Verified:** 2026-09-18 (scaffold) — last cold audit (`/audit`); the State section is trusted only as of this date

## Stage
DEVPLAN Stage 1b — The economy is not yet doing real work  `[ ACTIVE ]`

## State
Stages 1 and 2 done. The face model runs in-browser and headless with a four-page stats panel.
Smoke PASS (81 checks) @ 90891db-dirty (pre-commit; the session commit follows).

**Changed this session (2026-10-23), all as options:**
- **n up to 42** (21 with movement): the Int8 genome's limit. `World` throws past it; the
  browser pulls n to 21 when movement goes on.
- **Defaults changed:** `absentP` 0 (no rule is ever absent, so rule-absence death is off) and
  `founderOpenRules` on (random founders carry rules for every facing-empty condition).
- **New incomes:** `'payoff'` (n x n table: match / mismatch replay the old rules exactly,
  cyclic, seeded random, custom) and `'diversity'` (per distinct unlike colour).
- **`faceTransfer`** (off): drink from an unlike faced neighbour, pour into a like one; `'eat'`
  kills one drunk to 0.
- **`reproCostPerRule`** (0): reproduction cost grows with the parent's filled rules.

Browser-checked @ local server 2026-10-23: n=42 builds, movement cap works by checkbox and
`M`, payoff/cyclic + eat runs 200 ticks, no console errors. Unseen: the gene-pool page at
n=42, frame rate with the pane visible.

**Live:** https://algorithm0r.github.io/Hex-Turmites/ serves `main`, which does not have this
session's work until it is pushed.

## Metrics
- smoketest: 81/81 PASS @ 90891db-dirty (pre-commit)
- shipped defaults @ t=1000, seed 606: density 0.989, mean energy 249, lethal slots 0.0%
- new options @ t=2000, 3 seeds, n=2 / n=6 (2026-10-23): mismatch 3/3, 3/3; share 5 unlike
  fraction 0.475 (vs 0.44); cyclic n=6 pop 4,029; **mismatch + eat 1/3, 0/3 survive**;
  change + eat n=2 3/3 at density ~0.53
- absentP 0.15, mismatch: n ≥ 30 extinct 0/5 without open-space founders, 5/5 with
- per-rule cost: n=2 never drops a rule; n=6 change income k=0.5 → 37-40 of 42 filled; n=42
  filled stays ~85% (the mutation-only level) at every k

## Branches
- `main` (tracks `origin/main`)

## Open
- **Saturation survives at defaults.** First candidate against it: colour-change income +
  eating held density ~0.53 at n=2 (3 seeds, 2000 ticks). Not yet shown to be sustained.
- **Eating kills most runs under mismatch income.** Untested guess: newborns start at 0
  energy, so an unlike neighbour eats them on sight.
- **Mismatch does not mix colours** (unlike-neighbour 0.44, below the colour-blind 0.5).
  Sharing nudges it to 0.475. Unexplained.
- With movement on, 4 of 6 n=2 move bits are neutral, so genotype diversity counts include
  drift. A phenotype id that drops them is not built.
- Atlas page with movement on: not seen in a real browser. Gene-pool page at large n: not seen.
- Layout deviation (from the PA hub): the repo is the container itself, not `Hex Turmites/sim`.

## Next action
DEVPLAN Stage 1b — test change income + `'eat'` for a sustained non-saturating regime
(longer runs, more seeds), and check the newborn guess for why eating kills under mismatch.

## Blockers
- none
