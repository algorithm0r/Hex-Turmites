# Hex Turmites — Claude instructions

## Read first, every session
1. `STATUS.md` — where the system is right now (the 60-second orient)
2. `DEVLOG.md` — the top entry (what changed last)
3. `DEVPLAN.md` — the current `[ ACTIVE ]` stage

## What this is
Turmites with heredity on a hex grid: each organism is a 2D Turing machine with a face, an evolving rule genome, and face-forward reproduction.

## Stack (never violate)
- Vanilla JS + Canvas. No build step, no framework, no modules. `<script>` tags load
  `src/` in dependency order (`main.js` last).
- **Shared things are top-level `var`** — including `var Foo = class Foo {}`. This is what
  lets the SAME `src/` files run in the browser AND headless: the runners strip `'use strict'`
  and load them into the **main V8 realm via indirect `eval`** (not `vm`), where top-level
  `var` attaches to `globalThis` (a bare `class`/`const` would be block-scoped and never
  attach). Main-realm, not `vm`, because `vm` adds a ~7-10x hot-loop tax on per-tick global
  reads and we never need its sandbox isolation (conventions §4). Never fork the sim core.
- **All DOM lives in `ui.js` + `index.html`.** Sim classes (`world`, `agent`, `observer`,
  `datamanager`) touch zero DOM — that's what keeps them headless-safe.
- **Model/view split:** the world holds state and never draws; the `Observer` renders it.
- **Config:** one `PARAMETERS` global (`params.js`), serialized verbatim into every saved
  packet. `PARAM_SCHEMA` drives the control panel.
- **DB:** the vendored standard client `src/db.js` (see `~/.claude/conventions.md` §4).
  Use `db.packet()`, `db.nextBatch()`, and `db.scratch()` for throwaway work.

## Model invariants (don't break these silently)
- **The six directions in `hex.js` are in clockwise order and a face is an index into them**,
  so a right turn is `(face+1)%6`. Reordering that list silently changes every rotation.
- **An organism reproduces into the cell it SENSED** — the pre-rotation faced cell — and the
  rotation applies to the next tick. That two-step is what makes "spawn a copy, then turn and
  see it" work, and it is what `smoketest.mjs` pins.
- **A newborn does not act on the tick it was born** (`bornTick` guard), or a lineage runs
  ahead of the clock inside one update.
- **Energy is earned per neighbour whose colour DIFFERS from the organism's** (`energyRule:
  'mismatch'`, the default since 2026-10-11), counted after its rule recolours it. Only living
  neighbours count unless `emptyIsMismatch`. `'match'` pays per same-colour neighbour;
  `'change'` is the Stage 1 economy (one unit per colour change) and reproduces old runs
  bit-for-bit. A lone organism earns nothing under the neighbour rules, so random founders
  start with `founderChildren x reproCost` energy, and the spinner/walker/crawler demos force
  `'change'` (alone on the grid, they would never reproduce otherwise).
- **More incomes and transfers are options, all off by default:** `'payoff'` (n x n table;
  its `match` / `mismatch` tables replay those rules bit-for-bit, smoke-pinned), `'diversity'`,
  `faceTransfer` `'share'` / `'eat'` (drink from the unlike faced neighbour, pour into a like
  one; `'eat'` kills one drunk to 0), and `reproCostPerRule` (threshold = reproCost + k x
  filled rules; 0 = the flat cost exactly).
- **`absentP` is 0 by default (since 2026-10-23)**, so at defaults no rule is ever absent and
  rule-absence death never fires; set 0.15 for the earlier lethality. Random founders always
  carry rules for the facing-empty conditions (`founderOpenRules`).
- **n is capped at 42 (21 with movement) by the Int8 genome**: the top rule code
  `nOutputs(n)-1` must fit in 127. `World` throws past it; never widen the cap without moving
  the genome to a wider array, or codes wrap and silently become other rules.
- `reproCost` 20 was calibrated against the `'change'` income (~1/tick). Neighbour income runs
  0-6/tick, so under the default it barely constrains: mean energy sits ~230 and the grid still
  saturates. Raising it only delays saturation (measured 2026-10-11, see DEVPLAN).
- **`genomeId` reads the rule table as a base-(3n+1) number with q=0 as the MOST significant
  digit.** The atlas layout depends on it: at n=2, `y = id/343` is the first three conditions
  and `x = id%343` the last three, which is why the row band means "its rule when c0 facing
  empty". Change the digit order and the atlas silently means something else. The smoke test
  pins the bijection over all 117,649 genomes.
- **Movement is a high bit on each output: `code = move*3n + colour*3 + rot`** (`movement`
  param, off by default). Off, every code and id is the Stage 1 one, so the radix is 3n+1 and
  everything above holds unchanged; on, the radix is 6n+1 (13^6 at n=2) and the atlas indexes
  by `skeletonId` (move bits dropped). Toggling it must rebuild the World. A mover steps into
  the faced cell only if it is empty, and its child is born in the cell it VACATED.
- **The move bit is neutral wherever the faced cell is alive** (4 of 6 conditions at n=2): a
  move there is always blocked. So with movement on, 16 genome ids share each phenotype, and
  distinct/effective genotype counts are inflated by drift in those bits — don't compare them
  across the toggle without saying so.
- **Quote the effective number, not the distinct count**, whenever describing diversity.

## Conventions
Follow `~/.claude/conventions.md`. STATUS is overwritten every close (present truth); DEVLOG is
append-only, newest on top (history); DEVPLAN stages carry `[ DONE ] / [ ACTIVE ] / [ PLANNED ]`
tokens and a `**Done when:**` criterion. `/log-session` rewrites STATUS — don't hand-edit its
`Verified:` line (that moves only on a cold `/audit`).

## Run
- Browser: open `index.html`. Live copy: https://algorithm0r.github.io/Hex-Turmites/ — GitHub
  Pages from `main` (repo `algorithm0r/Hex-Turmites`, public), so every push to `main` redeploys.
  `main.js` nulls the DB client on `*.github.io` so public visitors never write run packets.
- Headless batch: `node runner.mjs --reps N` (writes to MongoDB via the Server).
- Smoke (no DB): `node smoketest.mjs` — prints the numbers that go in the DEVLOG entry.
