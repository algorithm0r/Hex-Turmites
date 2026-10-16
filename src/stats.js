'use strict';
// Population genetics on the living grid. Everything here is computed once per reporting
// period (not per frame) and cached, because the views want the same numbers repeatedly.
//
// Three levels of description, coarse to fine:
//   1. DIVERSITY   — how many distinct genomes, and the effective number (Hill N1). The
//                    effective number is the honest headline: a population of 400 genotypes
//                    where one clone holds 90% is not a diverse population, and the raw count
//                    says it is.
//   2. ALLELES     — for each condition, what fraction of the population carries each output.
//                    At n=2 this is a 6x7 table (6x13 with movement) and it is the COMPLETE
//                    state of the gene pool, not a summary of it.
//   3. GENOTYPES   — counts per whole-genome id, for the lineage (Muller) view and the atlas.
var Stats = class Stats {
  constructor(world) {
    this.world = world;
    const n = world.n;
    this.n = n;
    this.ncond = world.ncond;
    this.nslot = nOutputs(n) + 1;                 // outputs + RULE_ABSENT, which is slot 0
    this.exactIds = genomeIdExact(n);

    this.alleles = new Float32Array(this.ncond * this.nslot);   // frequencies, current sample
    this.counts = new Map();                                     // genotype id -> living count
    this.history = [];                                           // one record per sample
    this.spaceSize = this.exactIds ? genomeSpaceSize(n) : Infinity;
    this.movement = world.movement;

    // The atlas: one slot per POSSIBLE genome skeleton (the rule table with move bits dropped,
    // see skeletonId). Only built when that space is small enough to hold in memory — the n=2
    // privilege and the reason n=2 is the primary config. With movement off a skeleton IS a
    // genome; with it on, each atlas cell pools the 2^ncond genomes that differ only in moves.
    this.atlasSize = Math.pow(3 * n + 1, this.ncond);
    this.atlasSide = 0;
    this.occupancy = null;
    this.everOccupied = null;
    if (this.atlasSize <= (1 << 21)) {
      this.atlasSide = Math.round(Math.sqrt(this.atlasSize));
      if (this.atlasSide * this.atlasSide === this.atlasSize) {   // 117649 = 343^2 exactly
        this.occupancy = new Float32Array(this.atlasSize);
        this.everOccupied = new Uint8Array(this.atlasSize);
      } else {
        this.atlasSide = 0;
      }
    }
    this.sample(0);
  }

  // ─── the one expensive pass ─────────────────────────────────────────────────
  sample(tick) {
    const w = this.world, ncond = this.ncond, nslot = this.nslot;
    const alleles = this.alleles.fill(0);
    const counts = this.counts; counts.clear();
    if (this.occupancy) this.occupancy.fill(0);

    let pop = 0, lethalSlots = 0, esum = 0;
    for (let i = 0; i < w.N; i++) {
      if (w.color[i] === -1) continue;
      pop++;
      esum += w.energy[i];
      const base = i * ncond;
      for (let q = 0; q < ncond; q++) {
        const v = w.genome[base + q];
        if (v === RULE_ABSENT) lethalSlots++;
        alleles[q * nslot + (v + 1)]++;
      }
      const id = this.exactIds ? genomeId(w.genome, base, ncond, this.n)
                               : genomeKey(w.genome, base, ncond);
      counts.set(id, (counts.get(id) || 0) + 1);
      if (this.occupancy) {
        const a = this.movement ? skeletonId(w.genome, base, ncond, this.n) : id;
        this.occupancy[a]++; this.everOccupied[a] = 1;
      }
    }
    if (pop) for (let k = 0; k < alleles.length; k++) alleles[k] /= pop;

    // Hill numbers. N1 = exp(Shannon) is the effective number of equally-common genotypes —
    // the measure that moves when a sweep happens and the raw count does not.
    let H = 0, simpson = 0, top = 0, topId = null;
    for (const [id, c] of counts) {
      const p = c / pop;
      if (p > 0) H -= p * Math.log(p);
      simpson += p * p;
      if (c > top) { top = c; topId = id; }
    }

    const rec = {
      tick,
      rngSeed: w.rngSeed,
      population: pop,
      density: pop / w.N,
      meanEnergy: pop ? esum / pop : 0,
      lethal: pop ? lethalSlots / pop / ncond : 0,   // fraction of genome slots that kill
      births: w.birthsThisPeriod,
      deaths: w.deathsThisPeriod,
      moves: w.movesThisPeriod,
      distinct: counts.size,
      effective: pop ? Math.exp(H) : 0,        // Hill N1
      simpson: pop ? 1 / simpson : 0,          // Hill N2 (inverse Simpson)
      topShare: pop ? top / pop : 0,
      topId,
      alleles: Float32Array.from(alleles),
      // Only the head of the distribution is retained per sample; the Muller view needs the
      // lineages that ever mattered, not the singletons.
      top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
             .map(([id, c]) => [id, c / pop]),
    };
    this.history.push(rec);
    this.current = rec;
    return rec;
  }

  // The genotypes worth naming in a legend: ranked by the largest share they ever reached.
  dominantLineages(k) {
    const peak = new Map();
    for (const rec of this.history) {
      for (const [id, share] of rec.top) {
        if (!peak.has(id) || peak.get(id) < share) peak.set(id, share);
      }
    }
    return [...peak.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map((e) => e[0]);
  }

  // How much of the reachable genome space the population has ever visited.
  explored() {
    if (!this.everOccupied) return null;
    let seen = 0;
    for (let i = 0; i < this.everOccupied.length; i++) seen += this.everOccupied[i];
    return { seen, total: this.atlasSize, frac: seen / this.atlasSize };
  }
};
