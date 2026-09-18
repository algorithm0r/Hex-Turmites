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
the face markers.

Keys `1`-`4` switch the stats panel:
1. **Population** — density, effective and distinct genotypes, top clone share, lethal slots.
2. **Gene pool** — the allele table. For each condition, what fraction of the population
   carries each output, plus one stacked strip per condition over time. At n=2 this is the
   *complete* state of the gene pool (6x7), not a summary of it.
3. **Atlas** — all 117,649 possible n=2 organisms as a 343x343 image (7^6 = 343^2), lit by
   occupancy. Bright = alive now, dim = visited earlier. The 7x7 bands are labelled: the row
   band is the organism's rule when it is c0 facing empty, the column band when it is c1.
4. **Lineages** — a Muller-style stack of every genotype that ever held share, each with its
   rule table spelled out.

**Read the diversity number carefully.** "Distinct genotypes" counts singletons, so it runs
far ahead of how diverse the population actually is; the effective number (Hill N1,
`exp(Shannon)`) is the honest headline. A typical run shows ~680 distinct but N1 ~150.

## Layout
- `src/` — sim core: `hex.js` (geometry, ported from ../Hex CA), `genome.js` (the rule table
  and the numeric genome id), `world.js` (the grid and the tick), `stats.js` (population
  genetics — alleles, Hill diversity, genotype counts, atlas occupancy), plus `engine`,
  `params`, `observer`, `datamanager`, `util` + `db.js` (vendored standard DB client) +
  `views.js`/`ui.js`/`main.js` (browser-only, all DOM).
- `runner.mjs` / `smoketest.mjs` — headless entry points.
- `DEVPLAN.md` / `DEVLOG.md` — the plan (forward) and the log (backward, append-only).

See `~/.claude/conventions.md` for the shared standards this follows.
