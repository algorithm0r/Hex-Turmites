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
//   4. colour change earns energy; rotation costs
//   5. if the SENSED cell was empty and energy >= reproCost, place a mutated child in it
//
// Step 5 uses the PRE-rotation face deliberately: the organism reproduces into the cell it
// actually looked at, and the rotation takes effect for the next tick. That is what makes
// "spawn a copy, then turn and see it" the two-tick sequence the model is built around.
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
    this.tick = 0;
    this.births = 0;
    this.deaths = 0;
    this.birthsThisPeriod = 0;
    this.deathsThisPeriod = 0;

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
      const nextColor = outColor(out), rot = outRot(out);
      let e = energy[i];
      if (nextColor !== self) { color[i] = nextColor; e += earn; }
      if (rot !== ROT_NONE) { face[i] = rotateFace(f, rot); e -= rotationCost; }
      if (e < 0) e = 0;

      // 5. reproduce into the cell just sensed, if it was empty and the energy is there
      if (faced === -1 && e >= reproCost) {
        e -= reproCost;
        const cbase = j * ncond, pbase = i * ncond;
        for (let q = 0; q < ncond; q++) genome[cbase + q] = genome[pbase + q];
        if (mutationRate > 0) mutateGenome(genome, cbase, n, mutationRate, absentP);
        color[j]  = nextColor;                   // the child is a copy of the parent as it now is
        face[j]   = childOri === 'inherit' ? f
                  : childOri === 'offsetR' ? (f + 1) % 6
                  : childOri === 'offsetL' ? (f + 5) % 6
                  : randomInt(6);
        energy[j] = childEnergy;
        bornTick[j] = t;
        this.births++;
        this.birthsThisPeriod++;
      }
      energy[i] = e;
    }
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
      const k = genomeKey(this.genome, i * this.ncond, this.ncond);
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
    };
  }

  resetPeriodCounters() { this.birthsThisPeriod = 0; this.deathsThisPeriod = 0; }
};
