# Hex Turmites

Turmites with heredity on a hex grid: each organism is a 2D Turing machine with a face, an evolving rule genome, and face-forward reproduction.

A browser-based agent-based simulation (vanilla JS + Canvas, no build step), scaffolded from
the shared engine v2.

## Run
- **Browser:** open `index.html`.
- **Headless batch:** `node runner.mjs --reps 50` — runs the same sim core in the main V8 realm
  (indirect `eval`, not `vm` — avoids vm's hot-loop tax; see `~/.claude/conventions.md` §4) and
  writes self-describing packets to MongoDB through the research Server.
- **Smoke test:** `node smoketest.mjs` — no DB; asserts the Stage 1 invariants (the walker
  advances exactly one hex per tick, the spinner tiles its six neighbours in six ticks,
  rule-absence kills, clones are exact without mutation) and prints metrics.

## In the browser
`S` seeds a spinner, `W` a walker, `R` returns to the evolving default. `G` toggles genotype
colouring (clonal families share a hue, so a sweep is the field changing colour), `F` toggles
the face markers. The four gutter graphs are density, distinct genotypes, top clone share, and
the fraction of genome slots that are lethal.

## Layout
- `src/` — sim core: `hex.js` (geometry, ported from ../Hex CA), `genome.js` (the rule table),
  `world.js` (the grid and the tick), plus `engine`, `params`, `observer`, `datamanager`,
  `charts`, `util` + `db.js` (vendored standard DB client) + `ui.js`/`main.js` (browser-only,
  all DOM).
- `runner.mjs` / `smoketest.mjs` — headless entry points.
- `DEVPLAN.md` / `DEVLOG.md` — the plan (forward) and the log (backward, append-only).

See `~/.claude/conventions.md` for the shared standards this follows.
