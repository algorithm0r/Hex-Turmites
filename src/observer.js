'use strict';
// The view. Reads world state and draws it; never mutates the model. Keeping all rendering
// here (instead of cells drawing themselves) is what makes the world headless-safe.
//
// Two draw modes:
//   'state'    — fill by cell colour, plus a tick mark showing which way each organism faces.
//                The face marker is the whole reason this model is not Hex CA, so it is on
//                by default: without it a spinner and a walker look identical.
//   'genotype' — fill by a projection of the genome into RGB, so clonal families share a
//                colour and a selective sweep is visible as the screen changing hue.
var Observer = class Observer {
  constructor(world) {
    this.world = world;
    this._projection = null;
    this._projN = -1;
  }

  update() {}

  draw(ctx) {
    if (PARAMETERS.drawMode === 'genotype') this._drawGenotype(ctx);
    else this._drawState(ctx);
  }

  // ─── state view ─────────────────────────────────────────────────────────────
  _drawState(ctx) {
    const w = this.world, size = PARAMETERS.cellSize, n = w.n;
    const cellColors = getCellColors(n);

    // Batch one path per colour — thousands of individual fills would dominate the frame.
    const groups = Array.from({ length: n + 1 }, () => []);
    for (let col = 0; col < w.cols; col++) {
      for (let row = 0; row < w.rows; row++) {
        const c = w.color[col * w.rows + row];
        const p = hexCenter(col, row, size);
        groups[c === -1 ? 0 : c + 1].push(p.x, p.y);
      }
    }
    const fills = ['#0b0e13', ...cellColors];
    for (let g = 0; g <= n; g++) this._fillHexes(ctx, groups[g], fills[g], size);

    if (PARAMETERS.showFaces && size >= 4) this._drawFaces(ctx, size);
  }

  _fillHexes(ctx, pts, fill, size) {
    if (!pts.length) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let p = 0; p < pts.length; p += 2) {
      const cx = pts[p], cy = pts[p + 1];
      ctx.moveTo(cx + size * HEX_VERTS[0].x, cy + size * HEX_VERTS[0].y);
      for (let v = 1; v < 6; v++) ctx.lineTo(cx + size * HEX_VERTS[v].x, cy + size * HEX_VERTS[v].y);
      ctx.closePath();
    }
    ctx.fill();
  }

  // One stroked path for every face marker — the orientation field made visible.
  _drawFaces(ctx, size) {
    const w = this.world;
    ctx.strokeStyle = 'rgba(10,12,18,0.85)';
    ctx.lineWidth = Math.max(1, size * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let col = 0; col < w.cols; col++) {
      for (let row = 0; row < w.rows; row++) {
        const i = col * w.rows + row;
        if (w.color[i] === -1) continue;
        const p = hexCenter(col, row, size);
        const d = dirVector(w.face[i]);
        ctx.moveTo(p.x + d.x * size * 0.10, p.y + d.y * size * 0.10);
        ctx.lineTo(p.x + d.x * size * 0.78, p.y + d.y * size * 0.78);
      }
    }
    ctx.stroke();
  }

  // ─── genotype view ──────────────────────────────────────────────────────────
  // Johnson-Lindenstrauss style: each (condition, output) pair gets a fixed random 3-vector
  // and a genome is the sum of its slots' vectors. The vectors come from a seeded PRNG, so the
  // colours mean the same thing from run to run.
  //
  // COLOURS ARE SIMILARITY-BASED, BUT ONLY IN ONE DIRECTION. Measured over constructed pairs
  // at each exact Hamming distance (n=2, 30k pairs per bucket):
  //
  //     slots differing   1      2      3      4      5      6
  //     mean colour dist  1.37   1.91   2.33   2.67   2.99   3.27
  //
  // Monotone, so it is not arbitrary. But the ratio from 1 slot to all 6 is only 2.38x, not
  // 6x — that is the sqrt(6) = 2.45 random-walk scaling a random projection gives, and the
  // distributions overlap heavily: a 1-slot pair looks FARTHER apart than a totally different
  // pair 8.5% of the time.
  //
  // So: identical genomes are exactly the same colour (a clone is a uniform patch, which is
  // the guarantee that matters), and near-identical genomes are near-identical colours. But
  // do NOT read distance off the picture — two similar colours need not be similar genomes.
  // Page 4 (Lineages) is the place to confirm identity; its colours are a hash of the genome
  // id, deliberately arbitrary, and mean nothing about similarity.
  _ensureProjection(n, ncond) {
    // keyed on the slot count too: toggling movement changes it without changing n
    if (this._projN === n && this._projSlots === nOutputs(n) + 1 && this._projection) return;
    let s = 0x9e3779b9;
    const rnd = () => {           // mulberry32
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const slots = nOutputs(n) + 1;                  // outputs + RULE_ABSENT
    const proj = new Float32Array(ncond * slots * 3);
    for (let k = 0; k < proj.length; k++) proj[k] = rnd() * 2 - 1;
    this._projection = proj;
    this._projSlots = slots;
    this._projN = n;
  }

  _drawGenotype(ctx) {
    const w = this.world, size = PARAMETERS.cellSize, ncond = w.ncond;
    this._ensureProjection(w.n, ncond);
    const proj = this._projection, slots = this._projSlots;

    // First pass: project, and track the range so the palette uses the full gamut.
    const rgbBuf = new Float32Array(w.N * 3);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < w.N; i++) {
      if (w.color[i] === -1) continue;
      const base = i * ncond;
      let r = 0, g = 0, b = 0;
      for (let q = 0; q < ncond; q++) {
        const v = w.genome[base + q] + 1;          // RULE_ABSENT (-1) → slot 0
        const k = (q * slots + v) * 3;
        r += proj[k]; g += proj[k + 1]; b += proj[k + 2];
      }
      rgbBuf[i * 3] = r; rgbBuf[i * 3 + 1] = g; rgbBuf[i * 3 + 2] = b;
      if (r < lo) lo = r; if (r > hi) hi = r;
      if (g < lo) lo = g; if (g > hi) hi = g;
      if (b < lo) lo = b; if (b > hi) hi = b;
    }
    const range = (hi - lo) || 1;

    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let col = 0; col < w.cols; col++) {
      for (let row = 0; row < w.rows; row++) {
        const i = col * w.rows + row;
        if (w.color[i] === -1) continue;
        const p = hexCenter(col, row, size);
        const r = ((rgbBuf[i * 3] - lo) / range) * 200 + 40;
        const g = ((rgbBuf[i * 3 + 1] - lo) / range) * 200 + 40;
        const b = ((rgbBuf[i * 3 + 2] - lo) / range) * 200 + 40;
        ctx.fillStyle = rgb(r, g, b);
        ctx.beginPath();
        ctx.moveTo(p.x + size * HEX_VERTS[0].x, p.y + size * HEX_VERTS[0].y);
        for (let v = 1; v < 6; v++) ctx.lineTo(p.x + size * HEX_VERTS[v].x, p.y + size * HEX_VERTS[v].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (PARAMETERS.showFaces && size >= 4) this._drawFaces(ctx, size);
  }
};
