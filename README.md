# Hex Turmites

Turmites with heredity on a hex grid: each organism is a 2D Turing machine with a face, an evolving rule genome, and face-forward reproduction.

A browser-based agent-based simulation (vanilla JS + Canvas, no build step), scaffolded from
the shared engine v2.

## Run
- **Live:** <https://algorithm0r.github.io/Hex-Turmites/> (GitHub Pages, served from `main`).
  The Pages copy never writes run packets to the database; a local copy does, at epoch.
- **Browser:** open `index.html`.
- **Headless batch:** `node runner.mjs --reps 50` — runs the same sim core in the main V8 realm
  (indirect `eval`, not `vm` — avoids vm's hot-loop tax; see `~/.claude/conventions.md` §4) and
  writes self-describing packets to MongoDB through the research Server.
- **Smoke test:** `node smoketest.mjs` — no DB; asserts the Stage 1 invariants (the walker
  advances exactly one hex per tick, the spinner tiles its six neighbours in six ticks,
  rule-absence kills, clones are exact without mutation) and prints metrics.

## In the browser
`S` seeds a spinner, `W` a walker, `C` a crawler, `R` returns to the evolving default. `G`
toggles genotype colouring, `F` toggles the face markers.

**Energy from** (dropdown) sets how organisms earn. Each tick, after the rule has recoloured
an organism, it earns one unit per neighbour whose colour **differs** from its own (the
default), or per neighbour whose colour **matches**, or (the Stage 1 rule) one unit when the
rule changed its colour. By default only living neighbours count. Tick **Empty neighbour =
mismatch** to make open space pay too. Because a lone organism earns nothing under the
neighbour rules, random founders start with energy for **Founder children** births. The
spinner, walker and crawler demos switch to the colour-change rule. Two more choices:
**payoff table**, where each living neighbour pays `payoffTable[your colour][its colour]` (the
**Payoff table** dropdown: match, mismatch, cyclic, seeded random, or a custom matrix set from
the console) and each empty one pays **Empty neighbour pays**; and **neighbour diversity**, one
unit per distinct colour, other than your own, among your neighbours.

**Faced neighbour** (off by default) trades energy with the living cell an organism faced: it
drinks up to **Transfer amount** from an unlike neighbour and pours that much into a like one.
**Eat** also kills a neighbour drunk to zero. **Repro cost per rule** (0 by default) adds that
much to the reproduction cost for every rule the parent carries.

**Colours (n)** goes up to 42 (21 with movement on, which pulls n down if needed). Every rule is
filled by default (**Absent-rule p** 0); raise it to bring back death by missing rule. With
**Founders viable in open space** on (default), random founders always have rules for facing an
empty cell.

**Movement** (checkbox, or `M`; off by default) gives every rule a move bit. A rule that says
move, firing while the faced cell is empty, steps the organism into that cell and, if it can
afford `reproCost`, leaves a child in the cell it vacated. Facing anything alive, the move is
blocked. Off, the model is exactly the Stage 1 one. Toggling resets the world, because the
genome gets twice the outputs per condition (13^6 genomes at n=2 instead of 7^6). The atlas
then shows move-free skeletons, one pixel per 64 genomes, and rule labels carry a trailing `m`.
The crawler (flip colour, never turn, always move) is the movement demonstrator: one head
drawing a straight line of children behind it. **Speed** runs up to 100 ticks per frame; **Slow-mo**
goes the other way, one tick every N frames (60 is about one tick a second), and overrides
Speed while it is above 1.

Switch the stats panel by **clicking its tabs**, or with keys `1`-`4`, or `Tab` / `Shift-Tab`
to cycle:
1. **Population** — density, effective and distinct genotypes, top clone share, lethal slots.
2. **Gene pool** — the allele table. For each condition, what fraction of the population
   carries each output, plus one stacked strip per condition over time. At n=2 this is the
   *complete* state of the gene pool (6x7, or 6x13 with movement), not a summary of it.
3. **Atlas** — all 117,649 possible n=2 organisms as a 343x343 image (7^6 = 343^2; with
   movement on, move-free skeletons, each pooling 64 genomes), lit by
   occupancy. Bright = alive now, dim = visited earlier. The 7x7 bands are labelled: the row
   band is the organism's rule when it is c0 facing empty, the column band when it is c1.
4. **Lineages** — a Muller-style stack of every genotype that ever held share, each with its
   rule table spelled out.

### What the two colour schemes mean
They are different on purpose:
- **Genotype view on the grid (`G`)** — *similarity-based*. A genome is projected into RGB by
  summing a fixed random vector per (condition, output). Identical genomes get exactly the same
  colour, so a clone is a uniform patch, and near-identical genomes get near-identical colours.
  But the projection compresses distance: going from 1 differing slot to all 6 only multiplies
  colour distance by 2.38x (the sqrt(6) random-walk scaling), and a 1-slot pair looks farther
  apart than a completely different pair 8.5% of the time. **Trust it for "these cells are the
  same clone", not for reading distance.**
- **Lineage colours on page 4** — *arbitrary*. A hash of the genome id. Stable per genotype, but
  it says nothing about similarity. Use the id and the printed rule table to confirm identity.

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
