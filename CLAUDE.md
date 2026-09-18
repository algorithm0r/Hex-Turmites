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
- **Energy is earned on colour CHANGE.** An organism that never recolours never earns and so
  can never reproduce — that is why both demonstrator genomes flip colour every tick.
- `reproCost` is calibrated against income (~1/tick), not genome size. At 1 the economy
  constrains nothing.

## Conventions
Follow `~/.claude/conventions.md`. STATUS is overwritten every close (present truth); DEVLOG is
append-only, newest on top (history); DEVPLAN stages carry `[ DONE ] / [ ACTIVE ] / [ PLANNED ]`
tokens and a `**Done when:**` criterion. `/log-session` rewrites STATUS — don't hand-edit its
`Verified:` line (that moves only on a cold `/audit`).

## Run
- Browser: open `index.html`.
- Headless batch: `node runner.mjs --reps N` (writes to MongoDB via the Server).
- Smoke (no DB): `node smoketest.mjs` — prints the numbers that go in the DEVLOG entry.
