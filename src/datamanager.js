'use strict';
// Samples the world's metrics every reportingPeriod ticks, feeds the live graphs, and ships
// a self-describing packet (full PARAMETERS + samples) to the DB at epoch. The packet()
// helper (db.js) embeds PARAMETERS verbatim so every run reconstructs from its own record.
//
// The sampled set is chosen so a phase transition is legible after the fact without the
// grid: density says how full the world is, distinctGenotypes and topCloneShare say whether
// the population is a soup or a sweep, and meanAbsentRules tracks how fast selection purges
// lethal conditions — the fastest-moving quantity in this model.
//
// NOTE: in the browser this auto-flushes at epoch (fire-and-forget, errors logged). The
// headless runner (runner.mjs) drives ticks and flushes explicitly so it can await the write.
var DataManager = class DataManager {
  constructor(world, db, graphs) {
    this.world = world;
    this.db = db;
    this.graphs = graphs || {};
    this.samples = [];
    this.run = (PARAMETERS.db && PARAMETERS.db.run) || 'run';
    this.flushed = false;
  }

  update(engine) {
    if (engine.tick % PARAMETERS.reportingPeriod === 0) {
      const s = this.world.stats();
      this.samples.push(s);
      this.world.resetPeriodCounters();
      if (this.graphs.density) this.graphs.density.push(s.density);
      if (this.graphs.genotypes) this.graphs.genotypes.push(s.distinctGenotypes);
      if (this.graphs.topClone) this.graphs.topClone.push(s.topCloneShare);
      if (this.graphs.lethal) this.graphs.lethal.push(s.meanAbsentRules);
      if (typeof setStatus === 'function') {
        setStatus('t=' + s.tick + '  pop=' + s.population + '  genotypes=' + s.distinctGenotypes +
          '  top clone=' + (s.topCloneShare * 100).toFixed(1) + '%');
      }
    }
    if (!this.flushed && engine.tick >= PARAMETERS.epoch) {
      this.flushed = true;
      this.flush();
    }
  }

  async flush() {
    if (!this.db) return { ok: false };
    const pkt = this.db.packet(PARAMETERS, {
      run: this.run, samples: this.samples, final: this.world.stats(),
    });
    try {
      const res = await this.db.insert(this.run, pkt);
      if (typeof console !== 'undefined') console.log('[data] saved', JSON.stringify(res));
      return res;
    } catch (e) {
      if (typeof console !== 'undefined') console.error('[data] save failed:', e.message);
      return { ok: false, error: e.message };
    }
  }

  draw() {}
};
