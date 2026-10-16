'use strict';
// The world: a toroidal hex grid where every living cell is a turmite — a 2D Turing machine
// with a face, a colour, and a genome. State lives in flat typed arrays (Hex CA's layout),
// not in objects, so the hot loop stays allocation-free. The world never draws; the Observer
// renders it (model/view split), which is what keeps it headless-safe.
//
// THE TICK, for one organism:
//   1. sense the single cell its face points at          (egocentric — the whole point)
//   2. look up cond = (self colour, faced colour) in the genome
//   3. no rule → die. Otherwise the rule gives (next colour, rotation)
//   4. earn energy (energyRule, below); rotation costs
//   5. if the SENSED cell was empty and energy >= reproCost, place a mutated child in it
//
// Step 5 uses the PRE-rotation face deliberately: the organism reproduces into the cell it
// actually looked at, and the rotation takes effect for the next tick. That is what makes
// "spawn a copy, then turn and see it" the two-tick sequence the model is built around.
//
// ENERGY (PARAMETERS.energyRule). Earned after the rule has recoloured the organism, so it is
// paid for the state the organism put itself in:
//   'mismatch' — one unit per neighbour of a different colour (optionally counting empty
//                cells as different: emptyIsMismatch). Rewards sitting against the other colour.
//   'match'    — one unit per neighbour of the same colour. Rewards same-colour clumps.
//   'change'   — one unit when the rule changed the organism's colour (the Stage 1 economy).
// Neighbours are read live, so under async update some have already acted this tick.
//
// MOVEMENT (PARAMETERS.movement, off by default). A rule whose move bit is set, firing while
// the sensed cell is empty, replaces step 5: the organism steps INTO the sensed cell (paying
// moveCost) and, if it can then afford reproCost, leaves a mutated child in the cell it just
// vacated. Facing anything alive, the move is blocked and the rule only recolours and turns.
// The child behind takes its face from the same childOrientation rule as a forward child,
// computed from the pre-rotation face, so under 'inherit' it faces the way its parent went.
var World = class World {
  constructor() {
    const P = PARAMETERS;
    // Pin the PRNG before anything stochastic happens, and keep the seed so the packet can
    // record it — a stored run is only re-runnable if its seed travels with it.
    this.rngSeed = P.seed == null ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : (P.seed >>> 0);
    setSeed(this.rngSeed);

    this.cols = P.gridCols;
    this.rows = P.gridRows;
    this.N = this.cols * this.rows;
    this.n = P.n;
    this.ncond = nConditions(this.n);

    this.color  = new Int8Array(this.N).fill(-1);   // -1 = empty
    this.face   = new Uint8Array(this.N);
    this.energy = new Float32Array(this.N);
    this.genome = new Int8Array(this.N * this.ncond);
    this.bornTick = new Int32Array(this.N).fill(-1);

    this._order = new Int32Array(this.N);
    // Neighbour table, 6 per cell in DIR order: the neighbour energy rules read all six every
    // tick for every organism, so compute the torus wrap once rather than per lookup.
    this.nbr = new Int32Array(this.N * 6);
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const i = c * this.rows + r;
        for (let d = 0; d < 6; d++) this.nbr[i * 6 + d] = hexNeighbor(c, r, d, this.cols, this.rows);
      }
    }
    this.tick = 0;
    this.movement = movementOn();                   // fixed for this world's lifetime
    this.births = 0;
    this.deaths = 0;
    this.moves = 0;
    this.birthsThisPeriod = 0;
    this.deathsThisPeriod = 0;
    this.movesThisPeriod = 0;

    this.seed();
  }

  // ─── setup ──────────────────────────────────────────────────────────────────
  seed() {
    const P = PARAMETERS;
    const named = P.seedGenome === 'spinner' ? spinnerGenome()
                : P.seedGenome === 'walker'  ? walkerGenome()
                : null;
    if (named && this.n !== 2) throw new Error('named genome "' + P.seedGenome + '" is n=2 only');
    for (let s = 0; s < P.initialSeeds; s++) {
      const i = randomInt(this.N);
      if (this.color[i] !== -1) continue;              // occupied — skip, don't retry
      this.place(i, randomInt(this.n), randomInt(6), named);
      this.energy[i] = (P.founderChildren || 0) * P.reproCost;
    }
  }

  // Put an organism in cell i. `src` is an Int8Array of ncond rule outputs, or null for random.
  place(i, color, face, src) {
    const base = i * this.ncond;
    if (src) this.genome.set(src, base);
    else randomGenome(this.n, PARAMETERS.absentP, this.genome, base);
    this.color[i] = color;
    this.face[i] = face;
    this.energy[i] = 0;
    this.bornTick[i] = -1;
    return i;
  }

  kill(i) {
    this.color[i] = -1;
    this.energy[i] = 0;
    this.deaths++;
    this.deathsThisPeriod++;
  }

  // ─── the tick ───────────────────────────────────────────────────────────────
  update(engine) {
    const P = PARAMETERS;
    const { cols, rows, N, n, ncond, color, face, energy, genome, bornTick, _order } = this;
    const t = (this.tick = engine ? engine.tick : this.tick + 1);
    const reproCost = P.reproCost, rotationCost = P.rotationCost;
    const earn = P.energyPerTransition, pDeath = P.pDeath;
    const childOri = P.childOrientation, childEnergy = P.childEnergy;
    const mutationRate = P.mutationRate, absentP = P.absentP;
    const movement = this.movement, moveCost = P.moveCost;
    const nbr = this.nbr;
    const eRule = P.energyRule === 'match' ? 1 : P.energyRule === 'change' ? 0 : 2;   // 2 = mismatch
    const emptyPays = eRule === 2 && !!P.emptyIsMismatch;

    // Snapshot who is alive at the start of the tick. Organisms born during this tick are
    // not in the list, and the bornTick guard keeps a newborn from acting before its first
    // full tick — otherwise a lineage would run ahead of the clock in a single update.
    let m = 0;
    for (let i = 0; i < N; i++) if (color[i] !== -1) _order[m++] = i;
    if (P.asyncUpdate) {
      for (let a = m - 1; a > 0; a--) {
        const b = randomInt(a + 1);
        const tmp = _order[a]; _order[a] = _order[b]; _order[b] = tmp;
      }
    }

    for (let a = 0; a < m; a++) {
      const i = _order[a];
      const self = color[i];
      if (self === -1) continue;                 // died earlier in this same tick
      if (bornTick[i] === t) continue;           // newborn: waits for the next tick

      if (pDeath > 0 && random() < pDeath) { this.kill(i); continue; }

      // 1. sense the faced cell
      const col = (i / rows) | 0, row = i % rows;
      const f = face[i];
      const j = hexNeighbor(col, row, f, cols, rows);
      const faced = color[j];

      // 2-3. look up the rule; no rule means death
      const out = genome[i * ncond + condIndex(self, faced, n)];
      if (out === RULE_ABSENT) { this.kill(i); continue; }

      // 4. act: recolour (earning), then rotate (costing)
      const nextColor = outColor(out, n), rot = outRot(out);
      let e = energy[i];
      if (nextColor !== self) { color[i] = nextColor; if (eRule === 0) e += earn; }
      if (eRule !== 0) {
        let k = 0;
        for (let d = i * 6, end = d + 6; d < end; d++) {
          const c = color[nbr[d]];
          if (c === -1) { if (emptyPays) k++; }
          else if ((c === nextColor) === (eRule === 1)) k++;
        }
        e += earn * k;
      }
      if (rot !== ROT_NONE) { face[i] = rotateFace(f, rot); e -= rotationCost; }
      if (e < 0) e = 0;

      // 5m. move into the cell just sensed, leaving a child behind if the energy is there
      if (movement && faced === -1 && outMoves(out, n)) {
        e -= moveCost;
        if (e < 0) e = 0;
        const pbase = i * ncond, mbase = j * ncond;
        for (let q = 0; q < ncond; q++) genome[mbase + q] = genome[pbase + q];
        color[j] = nextColor;
        face[j] = face[i];                       // post-rotation: the turn still applies next tick
        bornTick[j] = bornTick[i];               // j was empty at the snapshot, so it won't act again
        this.moves++;
        this.movesThisPeriod++;
        if (e >= reproCost) {
          e -= reproCost;                        // i still holds the parent's genome: mutate in place
          if (mutationRate > 0) mutateGenome(genome, pbase, n, mutationRate, absentP);
          this._birth(i, nextColor, f, childOri, childEnergy, t);
        } else {
          color[i] = -1;                         // vacated — not a death
          energy[i] = 0;
        }
        energy[j] = e;
        continue;
      }

      // 5. reproduce into the cell just sensed, if it was empty and the energy is there
      if (faced === -1 && e >= reproCost) {
        e -= reproCost;
        const cbase = j * ncond, pbase = i * ncond;
        for (let q = 0; q < ncond; q++) genome[cbase + q] = genome[pbase + q];
        if (mutationRate > 0) mutateGenome(genome, cbase, n, mutationRate, absentP);
        this._birth(j, nextColor, f, childOri, childEnergy, t);   // a copy of the parent as it now is
      }
      energy[i] = e;
    }
  }

  // A child in cell c whose genome is already in place. `f` is the parent's PRE-rotation face.
  _birth(c, col, f, childOri, childEnergy, t) {
    this.color[c] = col;
    this.face[c] = childOri === 'inherit' ? f
                 : childOri === 'offsetR' ? (f + 1) % 6
                 : childOri === 'offsetL' ? (f + 5) % 6
                 : randomInt(6);
    this.energy[c] = childEnergy;
    this.bornTick[c] = t;
    this.births++;
    this.birthsThisPeriod++;
  }

  // ─── metrics ────────────────────────────────────────────────────────────────
  population() {
    let p = 0;
    for (let i = 0; i < this.N; i++) if (this.color[i] !== -1) p++;
    return p;
  }

  // Distinct genomes among the living, and the largest clone's share — the pair that makes
  // a phase transition in the dominant population legible.
  genotypes() {
    const counts = new Map();
    for (let i = 0; i < this.N; i++) {
      if (this.color[i] === -1) continue;
      const k = genomeIdExact(this.n) ? genomeId(this.genome, i * this.ncond, this.ncond, this.n)
                                      : genomeKey(this.genome, i * this.ncond, this.ncond);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let top = 0;
    for (const v of counts.values()) if (v > top) top = v;
    return { distinct: counts.size, topClone: top, counts };
  }

  stats() {
    let pop = 0, esum = 0, absent = 0;
    for (let i = 0; i < this.N; i++) {
      if (this.color[i] === -1) continue;
      pop++;
      esum += this.energy[i];
      const base = i * this.ncond;
      for (let q = 0; q < this.ncond; q++) if (this.genome[base + q] === RULE_ABSENT) absent++;
    }
    const g = this.genotypes();
    return {
      rngSeed: this.rngSeed,
      tick: this.tick,
      population: pop,
      density: pop / this.N,
      meanEnergy: pop ? esum / pop : 0,
      meanAbsentRules: pop ? absent / pop / this.ncond : 0,   // fraction of lethal conditions
      distinctGenotypes: g.distinct,
      topCloneShare: pop ? g.topClone / pop : 0,
      births: this.birthsThisPeriod,
      deaths: this.deathsThisPeriod,
      moves: this.movesThisPeriod,
    };
  }

  resetPeriodCounters() { this.birthsThisPeriod = 0; this.deathsThisPeriod = 0; this.movesThisPeriod = 0; }
};
