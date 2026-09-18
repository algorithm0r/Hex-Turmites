# Hex Turmites — DEVPLAN
*Living document, not frozen. Update as the design evolves.*

## The model

Turmites — 2D Turing machines, the family containing Langton's ant — with **per-organism
genomes, reproduction, and heredity**. Every cell is an ant, the grid is the tape, and the
ants copy themselves. The sibling project `../Hex CA` is the allocentric (count-vector)
version; this one is the **egocentric** version, and that is the whole point.

An organism occupies a hex cell and has:
- a **color** (its state, 1 of `n`)
- a **face** (its orientation, 1 of 6)
- a **genome**: a rule table keyed on `(self_color, faced_color)` where
  `faced ∈ {dead, 0..n−1}`

Each tick the organism senses **only the cell its face points at**. The matched rule fires:
- set `next_color`
- rotate the face `{L, none, R}`
- reproduce into the faced cell **if that cell is empty**

Child gets a mutated copy of the genome. Reproduction is only ever face-forward — the
BFS/empty-cell-search apparatus of Hex CA is deleted, not ported.

**Spaces.** Conditions: `n × (n+1)`. For n=3 that is 12 (down from 252 in Hex CA).
Outputs: absent, or `n` colors × 3 rotations.

**Two results that should fall out for free:**
- A spinner (rotates one step per tick, reproduces whenever it faces empty) tiles a disc
  around itself — it builds a film of itself.
- Reproduce-forward-then-die *is* locomotion. The organism is sessile; **movement is
  emergent from the birth/death cycle.**

## Why n=2 is the primary configuration, not a degenerate case

At n=2 the entire genome space is **enumerable**: 2 self × 3 faced = 6 conditions;
7 outputs each (absent, or 2 colors × 3 rotations); **7⁶ = 117,649 genomes total.**

Every possible organism can be exhaustively simulated. That buys a complete atlas of an
evolvable organism space — full fitness landscape, every viable genotype characterized,
and evolution's actual trajectory plotted **against ground truth about where it could have
gone.** That is impossible in Hex CA and it is the thing that anchors a paper. Build for
n=2 first; keep `n` a parameter.

## Design forks — settle these in Stage 1

1. **Child orientation.** Probably determines the resulting morphology. Options: inherit
   parent's current face (→ filaments, straight runs), parent's face + fixed offset
   (→ spirals), a mutable "birth orientation" gene, or random.
   **Start: inherit parent's current face**, as a swept parameter — cheapest, and the
   alternatives are one line away.
2. **Reproduction gating.** Hex CA's `threshold = k × genomeSize` goes nearly free with a
   12-slot genome, so the economy stops constraining anything.
   **Start: fixed energy cost per reproduction**, to keep the energy model doing real work.
   (Alternative: make reproduction an explicit rule action — genome becomes a genuine
   program, but all pressure on genome size disappears.)
3. **Does rotation cost or earn?** Probably free, with color change earning as in Hex CA.
   But a small rotation cost makes spinners pay for their film-building — possibly the
   difference between an interesting economy and a trivial one.
4. **The extension ladder** (sensing strength). One face is weak sensing; 12 conditions is
   a tiny FSM and the dynamics may be too regular.
   `face only` → `face + two flanking cells` (gives chirality detection) →
   **full ordered 6-tuple read starting from the face.**

   That last rung is where the two projects converge: the face gives a **canonical starting
   point for reading the neighborhood**, so an ordered tuple replaces the count vector.
   Hex CA is exactly the face model with orientation discarded. Condition space at that
   rung is `n × (n+1)⁶` = 12,288 for n=3 — large but tractable. If the face model works,
   that rung makes Hex CA a special case rather than a dead end.

## Inherited from Hex CA
New repo, shared patterns: the hex geometry and neighbor offsets, `graph.js` / `histogram.js`,
the params pattern, and **the rule-space visualization tools** — the frequency-matrix
machinery is agnostic to what a condition *is*, so it transfers directly.

## Built
- Scaffolded from engine v2 (vanilla-JS canvas + standard DB client). Demo "drifters"
  model runs in-browser and headless.

## Not yet built
- Everything above.

## Stages
### Stage 1 — The face model  [ ACTIVE ]
- [ ] Hex grid + axial coords + the 6 neighbor offsets (port geometry from Hex CA)
- [ ] Cell state gains an **orientation** field (1 of 6) — new array, new layout
- [ ] Genome representation: rule table on `(self_color, faced_color)` → `(color, rotation, ...)`
- [ ] Tick: sense faced cell → fire rule → set color, rotate, reproduce-if-empty
- [ ] Mutation on copy; settle fork 1 (child orientation) and fork 2 (reproduction gating)
- [ ] `smoketest.mjs` asserts a real invariant (not the demo drift check)
**Done when:** a hand-written spinner genome tiles a disc, and a
reproduce-forward-then-die genome visibly walks — both in-browser and headless.

### Stage 2 — Rule-space visualization  [ PLANNED ]
- [ ] Port the Hex CA visualizer set (genotype coloring, sort-by-dead, clustering,
      possessed/encountered condition split, transition matrices over time)
- [ ] Data export sufficient for post-hoc Muller plots
**Done when:** a phase transition in the dominant population is legible from the panel
while the sim runs.

### Stage 3 — The n=2 atlas  [ PLANNED ]
- [ ] Exhaustive enumeration + simulation of all 117,649 n=2 genomes
- [ ] Characterize each: viable? spinner? walker? film-builder? sterile?
- [ ] Plot evolved trajectories against the ground-truth landscape
**Done when:** the atlas exists as queryable data and an evolutionary run can be overlaid
on it.

### Stage 4 — Up the sensing ladder  [ PLANNED ]
- [ ] face + flanking cells (chirality)
- [ ] full ordered 6-tuple from the face — the rung that subsumes Hex CA
**Done when:** the ordered-tuple model reproduces Hex CA behavior when orientation is
discarded.
