'use strict';
// Samples the world's metrics every reportingPeriod ticks, feeds the live graphs, and ships
// a self-describing packet (full PARAMETERS + samples) to the DB at epoch. The packet()
// helper (db.js) embeds PARAMETERS verbatim so every run reconstructs from its own record.
//
// The sampled set is chosen so a phase transition is legible after the fact without the
// grid: density says how full the world is, distinctGenotypes and topCloneShare say whether
// the population is a soup or a sweep, and meanAbsentRules tracks how fast selection purges
// lethal conditions — the fastest-moving quantity when absentP > 0 (at the default 0 it stays 0).
//
// NOTE: in the browser this auto-flushes at epoch (fire-and-forget, errors logged). The
// headless runner (runner.mjs) drives ticks and flushes explicitly so it can await the write.
var DataManager = class DataManager {
  constructor(world, db, stats) {
    this.world = world;
    this.db = db;
    this.stats = stats;
    this.samples = [];
    this.run = (PARAMETERS.db && PARAMETERS.db.run) || 'run';
    this.flushed = false;
  }

  update(engine) {
    if (engine.tick % PARAMETERS.reportingPeriod === 0) {
      // Stats does the whole genetics pass; its record IS the stored sample, minus the
      // per-sample genotype head, which is for the live views and would bloat the packet.
      const s = this.stats.sample(engine.tick);
      this.world.resetPeriodCounters();
      this.samples.push({
        tick: s.tick, population: s.population, density: s.density, meanEnergy: s.meanEnergy,
        lethal: s.lethal, distinct: s.distinct, effective: s.effective, simpson: s.simpson,
        topShare: s.topShare, topId: s.topId, births: s.births, deaths: s.deaths, moves: s.moves,
        eaten: s.eaten,
      });
      if (typeof setStatus === 'function') {
        setStatus('t=' + s.tick + '  pop=' + s.population +
          '  genotypes=' + s.distinct + ' (effective ' + s.effective.toFixed(1) + ')' +
          '  top clone=' + (s.topShare * 100).toFixed(1) + '%');
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
      rngSeed: this.world.rngSeed,
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
