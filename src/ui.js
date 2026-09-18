'use strict';
// ALL DOM lives here (and in index.html). The sim classes never touch the document, which
// is what lets the same files run headlessly. Builds the control panel from PARAM_SCHEMA
// and writes changes straight back into PARAMETERS.
var _controlRefreshers = [];

function buildControls() {
  const panel = document.getElementById('controlPanel');
  _controlRefreshers = [];
  for (const spec of PARAM_SCHEMA) {
    const wrap = document.createElement('label');
    wrap.className = 'ctl';
    wrap.appendChild(document.createTextNode(spec.label + ' '));
    const input = document.createElement('input');
    input.type = 'range';
    input.min = spec.min; input.max = spec.max; input.step = spec.step;
    input.value = PARAMETERS[spec.key];
    const val = document.createElement('span');
    val.textContent = ' ' + PARAMETERS[spec.key];
    input.oninput = function () {
      PARAMETERS[spec.key] = parseFloat(input.value);
      val.textContent = ' ' + input.value;
      if (spec.resets && typeof reset === 'function') reset();
      else if (spec.refits && typeof fitCanvas === 'function') fitCanvas();
    };
    wrap.appendChild(input);
    wrap.appendChild(val);
    panel.appendChild(wrap);
    // Code paths like seedNamed() change PARAMETERS directly; without this the panel keeps
    // showing the old number and quietly lies about what the sim is running.
    _controlRefreshers.push(function () {
      input.value = PARAMETERS[spec.key];
      val.textContent = ' ' + PARAMETERS[spec.key];
    });
  }
  buildButtons();
}

// Buttons that are not simple numeric sliders.
function buildButtons() {
  const panel = document.getElementById('controlPanel');
  const row = document.createElement('div');
  row.className = 'btnrow';
  const defs = [
    ['Reset (R)', function () { reset(); }],
    ['Spinner (S)', function () { seedNamed('spinner'); }],
    ['Walker (W)', function () { seedNamed('walker'); }],
    ['Genotype view (G)', function () { toggleGenotypeView(); }],
    ['Population (1)', function () { setStatsPage(0); }],
    ['Gene pool (2)', function () { setStatsPage(1); }],
    ['Atlas (3)', function () { setStatsPage(2); }],
    ['Lineages (4)', function () { setStatsPage(3); }],
    ['Faces (F)', function () { toggleFaces(); }],
  ];
  for (const [label, fn] of defs) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    row.appendChild(b);
  }
  panel.appendChild(row);
}

// Re-read PARAMETERS into every control. Call after changing params programmatically.
function refreshControls() {
  for (const f of _controlRefreshers) f();
}

function setStatus(msg) {
  const s = document.getElementById('status');
  if (s) s.textContent = msg;
}
