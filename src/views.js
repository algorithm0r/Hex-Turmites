'use strict';
// The stats panel: four pages, switched with keys 1-4. Everything reads from a Stats object
// computed at the last reporting period — the views never touch the grid directly and never
// mutate anything.
//
//   1 POPULATION — density, diversity, dominance, lethality over time
//   2 GENE POOL  — the allele table: for each condition, who carries which output. At n=2
//                  this is the COMPLETE state of the gene pool, 6x7, not a summary of it.
//   3 ATLAS      — every POSSIBLE genome as one pixel, 343x343, lit by occupancy. This view
//                  exists only because 7^6 = 343^2; it is the n=2 privilege made visible.
//   4 LINEAGES   — a Muller-style stack of the genotypes that ever held share, with their
//                  rule tables spelled out.

// Colour for one output slot: absent is grey, otherwise the colour it paints, shaded by which
// way it turns. Hue says "what colour", shade says "which rotation".
function outputPalette(n) {
  const out = ['#39404d'];                       // slot 0 = RULE_ABSENT = death
  const lightness = [42, 58, 74];                // L, none, R
  for (let c = 0; c < n; c++) {
    const hue = Math.round(c * 360 / n);
    for (let r = 0; r < 3; r++) out.push('hsl(' + hue + ',72%,' + lightness[r] + '%)');
  }
  return out;
}

function outputLabel(slot) {
  if (slot === 0) return 'die';
  const code = slot - 1;
  return 'c' + ((code / 3) | 0) + ['L', '-', 'R'][code % 3];
}

function conditionLabel(q, n) {
  const self = (q / (n + 1)) | 0, faced = (q % (n + 1)) - 1;
  return 'c' + self + '|' + (faced < 0 ? 'dead' : 'c' + faced);
}

// A stable colour per genotype id, so a lineage keeps its colour across frames and pages.
function lineageColor(id) {
  let h;
  if (typeof id === 'number') {
    h = id >>> 0;
  } else {
    h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return 'hsl(' + (h % 360) + ',' + (55 + (h >>> 9) % 25) + '%,' + (48 + (h >>> 17) % 22) + '%)';
}

var Views = class Views {
  constructor(world, stats) {
    this.world = world;
    this.stats = stats;
    this.palette = outputPalette(world.n);
    this._atlasImage = null;
    this._scratch = null;
    this._tabRects = [];        // filled by _tabs each draw; read by hitTestTab
  }

  // Which tab (if any) is at canvas point (px, py)? -1 for none. main.js routes clicks here
  // so the tab strip is the control, rather than a picture of one.
  hitTestTab(px, py) {
    for (const t of this._tabRects) {
      if (px >= t.x && px <= t.x + t.w && py >= t.y && py <= t.y + t.h) return t.page;
    }
    return -1;
  }

  update() {}

  draw(ctx) {
    const x0 = boardWidth() + 12;
    const w = PANEL_W - 24;
    this.panelH = ctx.canvas.height;
    ctx.save();
    ctx.fillStyle = '#0b0e13';
    ctx.fillRect(boardWidth(), 0, PANEL_W, ctx.canvas.height);
    const page = PARAMETERS.statsPage | 0;
    this._tabs(ctx, x0, 10, w, page);
    if (page === 1) this._genePool(ctx, x0, 40, w);
    else if (page === 2) this._atlas(ctx, x0, 40, w);
    else if (page === 3) this._lineages(ctx, x0, 40, w);
    else this._population(ctx, x0, 40, w);
    ctx.restore();
  }

  // A real tab strip: evenly divided across the panel, click targets recorded for hit-testing,
  // and the active tab joined to the page below it by leaving its bottom edge open.
  _tabs(ctx, x, y, w, page) {
    const names = ['Population', 'Gene pool', 'Atlas', 'Lineages'];
    const h = 20;
    const tw = w / names.length;
    this._tabRects = [];
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < names.length; i++) {
      const cx = x + i * tw;
      const active = i === page;
      ctx.fillStyle = active ? '#2b6cf6' : '#161b23';
      ctx.fillRect(cx, y, tw - 2, h);
      ctx.fillStyle = active ? '#ffffff' : '#79808c';
      const label = (i + 1) + '  ' + names[i];
      ctx.fillText(label, cx + (tw - 2 - ctx.measureText(label).width) / 2, y + 13.5);
      this._tabRects.push({ x: cx, y: y, w: tw - 2, h: h, page: i });
    }
    // the rule under the strip, broken where the active tab sits
    ctx.strokeStyle = '#2b6cf6';
    ctx.beginPath();
    ctx.moveTo(x, y + h + 0.5);
    ctx.lineTo(x + w, y + h + 0.5);
    ctx.stroke();
  }

  _title(ctx, x, y, text, sub) {
    ctx.fillStyle = '#cdd2da';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(text, x, y);
    if (sub) {
      ctx.fillStyle = '#6f757f';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(sub, x, y + 12);
    }
  }

  // ─── page 1: population ─────────────────────────────────────────────────────
  _population(ctx, x, y, w) {
    const h = this.stats.history;
    if (!h.length) return;
    const N = this.world.N;
    const series = [
      ['density', (r) => r.population / N, '#7fd1ff', 1, (v) => v.toFixed(3)],
      ['effective genotypes (Hill N1)', (r) => r.effective, '#9ae6a0', null, (v) => v.toFixed(1)],
      ['distinct genotypes', (r) => r.distinct, '#e0c26a', null, (v) => String(v | 0)],
      ['top clone share', (r) => r.topShare, '#e08a8a', 1, (v) => (v * 100).toFixed(1) + '%'],
      ['lethal genome slots', (r) => r.lethal || 0, '#b98ae0', 1, (v) => (v * 100).toFixed(2) + '%'],
    ];
    let yy = y + 6;
    for (const s of series) {
      this._spark(ctx, x, yy, w, 58, h, s[0], s[1], s[2], s[3], s[4]);
      yy += 68;
    }
  }

  _spark(ctx, x, y, w, h, hist, label, fn, color, fixedMax, fmt) {
    ctx.strokeStyle = '#242a35';
    ctx.strokeRect(x, y, w, h);
    let max = fixedMax || 0;
    if (!fixedMax) for (const r of hist) { const v = fn(r); if (v > max) max = v; }
    if (!max) max = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const px = x + (hist.length === 1 ? 0 : (i / (hist.length - 1)) * w);
      const py = y + h - (fn(hist[i]) / max) * h;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = '#8a8f98';
    ctx.fillText(label, x + 4, y + 10);
    const txt = fmt(fn(hist[hist.length - 1]));
    ctx.fillStyle = color;
    ctx.fillText(txt, x + w - 4 - ctx.measureText(txt).width, y + 10);
  }

  // ─── page 2: the allele table ───────────────────────────────────────────────
  _genePool(ctx, x, y, w) {
    const st = this.stats, n = st.n, ncond = st.ncond, nslot = st.nslot;
    const cur = st.current;
    this._title(ctx, x, y + 10, 'Gene pool — who carries which rule',
      'rows: what it senses.  columns: what it does.  cell: % of population.');
    const labelW = 52;
    const cw = (w - labelW) / nslot;
    const ch = 20;
    const top = y + 54;

    ctx.font = '9px system-ui, sans-serif';
    for (let s = 0; s < nslot; s++) {
      ctx.fillStyle = '#79808c';
      const lbl = outputLabel(s);
      ctx.fillText(lbl, x + labelW + s * cw + (cw - ctx.measureText(lbl).width) / 2, top - 5);
    }
    for (let q = 0; q < ncond; q++) {
      ctx.fillStyle = '#79808c';
      ctx.fillText(conditionLabel(q, n), x, top + q * ch + 13);
      for (let s = 0; s < nslot; s++) {
        const f = cur.alleles[q * nslot + s];
        ctx.fillStyle = this.palette[s];
        ctx.globalAlpha = 0.08 + 0.92 * Math.min(1, f);
        ctx.fillRect(x + labelW + s * cw + 1, top + q * ch + 1, cw - 2, ch - 2);
        ctx.globalAlpha = 1;
        if (f > 0.05) {
          ctx.fillStyle = f > 0.55 ? '#0b0e13' : '#cdd2da';
          const t = String(Math.round(f * 100));
          ctx.fillText(t, x + labelW + s * cw + (cw - ctx.measureText(t).width) / 2, top + q * ch + 13);
        }
      }
    }

    // Per-condition history: a rule sweeping the population reads as a band taking over
    // its own strip.
    const hist = st.history;
    let yy = top + ncond * ch + 26;
    this._title(ctx, x, yy, 'each condition over time',
      'a rule sweeping the population is a band taking over its strip');
    yy += 22;
    const avail = this.panelH - yy - 12;
    const sh = Math.max(16, avail / ncond);
    for (let q = 0; q < ncond; q++) {
      this._stack(ctx, x + labelW, yy, w - labelW, sh - 4, hist,
        (r, sl) => r.alleles[q * nslot + sl], nslot, (sl) => this.palette[sl]);
      ctx.fillStyle = '#79808c';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(conditionLabel(q, n), x, yy + (sh - 4) / 2 + 3);
      yy += sh;
    }
  }

  // Generic stacked-area over history. value(record, band) returns shares summing to <= 1.
  _stack(ctx, x, y, w, h, hist, value, nBands, colorOf) {
    ctx.strokeStyle = '#242a35';
    if (hist.length < 2) { ctx.strokeRect(x, y, w, h); return; }
    const step = w / (hist.length - 1);
    const acc = new Float64Array(hist.length);
    for (let b = 0; b < nBands; b++) {
      ctx.fillStyle = colorOf(b);
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const px = x + i * step, py = y + h - acc[i] * h;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      for (let i = hist.length - 1; i >= 0; i--) {
        acc[i] += value(hist[i], b);
        ctx.lineTo(x + i * step, y + h - acc[i] * h);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // ─── page 3: the complete genome-space atlas ────────────────────────────────
  _atlas(ctx, x, y, w) {
    const st = this.stats;
    if (!st.atlasSide) {
      this._title(ctx, x, y + 12, 'Atlas unavailable at n=' + st.n,
        'genome space is ' + (st.spaceSize === Infinity ? 'unbounded' : st.spaceSize.toExponential(2)) +
        ' — only n=2 (117,649 = 343^2) fits in a picture.');
      return;
    }
    const side = st.atlasSide;
    const ex = st.explored();
    this._title(ctx, x, y + 10,
      'Atlas — all ' + st.spaceSize.toLocaleString('en-US') + ' possible organisms',
      'one pixel per genome.  bright = alive now,  dim blue = visited earlier.');
    ctx.fillStyle = '#6f757f';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('explored ' + ex.seen.toLocaleString('en-US') + ' of ' +
      ex.total.toLocaleString('en-US') + '  (' + (ex.frac * 100).toFixed(3) + '%)', x, y + 36);

    if (!this._atlasImage || this._atlasImage.width !== side) {
      this._atlasImage = ctx.createImageData(side, side);
    }
    const img = this._atlasImage, data = img.data;
    const occ = st.occupancy, ever = st.everOccupied;
    let peak = 1;
    for (let i = 0; i < occ.length; i++) if (occ[i] > peak) peak = occ[i];
    const lp = Math.log(peak + 1);
    for (let i = 0; i < occ.length; i++) {
      const o = occ[i], p = i * 4;
      if (o > 0) {
        // Log scale with a bright floor: a genome held by ONE organism still has to be
        // visible, or the rare-variant fringe — the part that matters — disappears.
        const t = Math.log(o + 1) / lp;
        data[p] = 70 + 185 * t; data[p + 1] = 160 + 95 * t; data[p + 2] = 255; data[p + 3] = 255;
      } else if (ever[i]) {
        data[p] = 48; data[p + 1] = 68; data[p + 2] = 104; data[p + 3] = 255;
      } else {
        data[p] = 13; data[p + 1] = 16; data[p + 2] = 22; data[p + 3] = 255;
      }
    }
    // putImageData ignores transforms, so stage at 1:1 then blit.
    if (!this._scratch) this._scratch = document.createElement('canvas');
    const cv = this._scratch;
    cv.width = side; cv.height = side;
    cv.getContext('2d').putImageData(img, 0, 0);

    const ax = x + 22, ay = y + 62;                 // room for the axis labels
    const scale = Math.min(1, (w - 24) / side);
    const S = side * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, ax, ay, S, S);

    // 343 = 7^3, so the id's most significant digit picks a band of 49 rows and the
    // column's most significant digit a band of 49 columns. Those bands are not decoration:
    // each one is "the organisms whose rule for this condition is X". Labelling them turns
    // the picture into a map you can read a genome off.
    const block = S / 7;
    ctx.strokeStyle = 'rgba(160,190,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < 7; k++) {
      ctx.moveTo(ax + k * block, ay); ctx.lineTo(ax + k * block, ay + S);
      ctx.moveTo(ax, ay + k * block); ctx.lineTo(ax + S, ay + k * block);
    }
    ctx.stroke();
    ctx.strokeStyle = '#242a35';
    ctx.strokeRect(ax, ay, S, S);

    ctx.font = '8px system-ui, sans-serif';
    ctx.fillStyle = '#79808c';
    for (let k = 0; k < 7; k++) {
      const lbl = outputLabel(k);
      ctx.fillText(lbl, ax + k * block + (block - ctx.measureText(lbl).width) / 2, ay - 4);
      ctx.save();
      ctx.translate(ax - 5, ay + k * block + block / 2 + ctx.measureText(lbl).width / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(lbl, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = '#6f757f';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('column band: what it does when it is c1 facing empty', ax, ay + S + 14);
    ctx.fillText('row band: what it does when it is c0 facing empty', ax, ay + S + 26);
    ctx.fillStyle = '#5a616c';
    ctx.fillText('within a band, position is the remaining four rules (base-7).', ax, ay + S + 42);
    ctx.fillText('neighbouring pixels are NOT neighbouring genomes — only the', ax, ay + S + 54);
    ctx.fillText('band structure is meaningful.', ax, ay + S + 66);
  }

  // ─── page 4: lineages ───────────────────────────────────────────────────────
  _lineages(ctx, x, y, w) {
    const st = this.stats, hist = st.history;
    const ids = st.dominantLineages(14);
    const index = new Map();
    for (let i = 0; i < ids.length; i++) index.set(ids[i], i);
    this._title(ctx, x, y + 10, 'Lineages — genotypes that ever held share',
      'stacked share of the population over time.  grey band = every other genotype.');

    const sh = 210;
    const shareOf = (r, b) => {
      if (b === ids.length) {                       // the "everything else" band
        let known = 0;
        for (const e of r.top) if (index.has(e[0])) known += e[1];
        return Math.max(0, (r.population ? 1 : 0) - known);
      }
      const want = ids[b];
      for (const e of r.top) if (e[0] === want) return e[1];
      return 0;
    };
    this._stack(ctx, x, y + 30, w, sh, hist, shareOf, ids.length + 1,
      (b) => (b === ids.length ? '#333b49' : lineageColor(ids[b])));
    ctx.strokeStyle = '#242a35';
    ctx.strokeRect(x, y + 30, w, sh);

    // Legend: each dominant genotype spelled out as its rule table.
    let yy = y + 30 + sh + 18;
    ctx.font = '9px system-ui, sans-serif';
    const curShare = new Map(st.current.top);
    const buf = new Int8Array(st.ncond);
    for (let i = 0; i < ids.length && yy < this.panelH - 12; i++) {
      const id = ids[i];
      ctx.fillStyle = lineageColor(id);
      ctx.fillRect(x, yy - 7, 8, 8);
      const share = curShare.get(id) || 0;
      ctx.fillStyle = share > 0 ? '#cdd2da' : '#5a616c';
      ctx.fillText('#' + id + '   ' + (share * 100).toFixed(1) + '%', x + 12, yy);
      if (st.exactIds) {
        genomeFromId(id, st.n, buf);
        ctx.fillStyle = share > 0 ? '#79808c' : '#464c56';
        ctx.fillText(this._compactGenome(buf, st.n), x + 12, yy + 10);
      }
      yy += 25;
    }
    if (yy < this.panelH - 12) {
      ctx.fillStyle = '#333b49';
      ctx.fillRect(x, yy - 7, 8, 8);
      ctx.fillStyle = '#79808c';
      ctx.fillText('everything else', x + 12, yy);
    }
  }

  // "c1R c1R c1R  |  c0R c0R c0R" — outputs in condition order, grouped by self colour.
  _compactGenome(g, n) {
    const parts = [];
    for (let self = 0; self < n; self++) {
      const row = [];
      for (let f = -1; f < n; f++) {
        const code = g[condIndex(self, f, n)];
        row.push(code === RULE_ABSENT ? 'die' : 'c' + outColor(code) + ['L', '-', 'R'][outRot(code)]);
      }
      parts.push(row.join(' '));
    }
    return parts.join('  |  ');
  }
};
