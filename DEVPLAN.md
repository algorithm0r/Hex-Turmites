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
- Scaffolded from engine v2 (vanilla-JS canvas + standard DB client).
- **Stage 1 complete.** The face model runs in-browser and headless: hex geometry with
  orientation, the `(self, faced)` genome, sense→recolour→rotate→reproduce-forward, mutation
  on copy, rule-absence death. Both demonstrator organisms verified by `smoketest.mjs`.

## Not yet built
- Stages 2-4 below.

## Settled in Stage 1
- **Fork 1 — child orientation:** `inherit`, and specifically the BIRTH DIRECTION (the
  parent's face at sense time, before the rule's rotation). This is what makes the walker a
  straight line. `offsetR` / `offsetL` / `random` are parameters, unswept.
- **Fork 2 — reproduction gating:** fixed cost, `reproCost`. The scale matters more than the
  mechanism: income is ~1 energy/tick, so the cost has to be **tens of ticks** to constrain
  anything. At `reproCost: 1` the grid saturates almost immediately.
- **Fork 3 — rotation cost:** free (`rotationCost: 0`), unswept. Left as a dial.

## Stages
### Stage 1 — The face model  [ DONE 2026-09-18 ]
- [x] Hex grid + the 6 neighbour offsets (ported from Hex CA, now in `src/hex.js`)
- [x] Cell state gains an **orientation** field (1 of 6)
- [x] Genome representation: rule table on `(self_color, faced_color)` → `(colour, rotation)`
- [x] Tick: sense faced cell → fire rule → set colour, rotate, reproduce-if-empty
- [x] Mutation on copy; forks 1-3 settled (above)
- [x] `smoketest.mjs` asserts the real invariants
- [x] Seeded PRNG throughout the sim core; runs replay exactly from `PARAMETERS.seed`
**Done when:** a hand-written spinner genome tiles a disc, and a reproduce-forward-then-die
genome visibly walks — both in-browser and headless.  ✓ verified, see DEVLOG 2026-09-18.

### Stage 1b — The economy is not yet doing real work  [ ACTIVE ]
The Stage 1 mechanism is correct, but the model as parameterised has one attractor: selection
purges lethal rules fast (12% → ~1% of slots while density is still 0.4) and after that the
only death left is `pDeath`, so the grid fills to ~0.98 and stays there. With 6 conditions the
rule table is small enough that evolution solves it almost immediately — which is fork 4's
"the dynamics may be too regular" showing up empirically, earlier than expected.
- [ ] Decide whether saturation is a problem to fix or the honest result to report
- [ ] Candidate pressures, if it needs one: crowding cost, energy cap, per-tick metabolism,
      an ageing term, or a cost that scales with the number of non-absent rules
- [ ] Sweep `reproCost` x `pDeath` x `mutationRate` properly and map the regimes
**Done when:** there is either a parameter regime with sustained non-saturating dynamics, or
a written argument that saturation is the model's real behaviour and the interest is elsewhere.

### Stage 2 — Rule-space visualization  [ DONE 2026-09-18 ]
- [x] Four-page stats panel (keys 1-4), all fed from one genetics pass per reporting period
- [x] Allele table: per condition, the population's distribution over outputs — complete at
      n=2, plus a stacked strip per condition over time
- [x] **Genome-space atlas**: all 117,649 n=2 genomes as a 343x343 image (7^6 = 343^2), with
      the 7x7 bands labelled by the rule they correspond to. Occupancy now, plus ever-visited.
- [x] Muller-style lineage stack with each genotype's rule table spelled out
- [x] Diversity done properly: Hill N1 (`exp(Shannon)`) and inverse Simpson, not just a count
- [x] Numeric genome id (base-(3n+1)), bijection verified over the whole n=2 space
**Done when:** a phase transition in the dominant population is legible from the panel while
the sim runs.  ✓ the lethal-rule purge is visible as the grey band collapsing in every strip.

### Stage 2b — Visualization follow-ups  [ PLANNED ]
- [ ] Genotype-colour contrast on the grid is washed out (the JL projection averages toward
      grey) — stretch it
- [ ] Hex CA's raster orderings (sort-by-dead, frequency, spectral clustering) and the
      possessed/encountered condition split
- [ ] Transition matrices over time
- [ ] The atlas has no meaningful adjacency beyond the band structure — a Hamming-preserving
      (Gray-code) layout would make distance mean something
- [ ] Packet export sufficient for post-hoc Muller plots at higher resolution than the live
      top-40-per-sample

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
