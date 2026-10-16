'use strict';
// ALL DOM lives here (and in index.html). The sim classes never touch the document, which
// is what lets the same files run headlessly. Builds the control panel from PARAM_SCHEMA
// and writes changes straight back into PARAMETERS.
var _controlRefreshers = [];

function buildControls() {
  const panel = document.getElementById('controlPanel');
  _controlRefreshers = [];
  for (const spec of PARAM_SCHEMA) {
    if (spec.type === 'bool') { buildToggle(panel, spec); continue; }
    if (spec.type === 'choice') { buildChoice(panel, spec); continue; }
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

// A boolean parameter as a checkbox. Same contract as a slider: writes PARAMETERS, honours
// `resets`, and registers a refresher so programmatic changes show up in the panel.
function buildToggle(panel, spec) {
  const wrap = document.createElement('label');
  wrap.className = 'ctl toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!PARAMETERS[spec.key];
  input.onchange = function () {
    PARAMETERS[spec.key] = input.checked;
    if (spec.resets && typeof reset === 'function') reset();
  };
  wrap.appendChild(input);
  wrap.appendChild(document.createTextNode(' ' + spec.label));
  panel.appendChild(wrap);
  _controlRefreshers.push(function () { input.checked = !!PARAMETERS[spec.key]; });
}

// A string parameter with a fixed set of values, as a dropdown. `options` is [value, label].
function buildChoice(panel, spec) {
  const wrap = document.createElement('label');
  wrap.className = 'ctl';
  wrap.appendChild(document.createTextNode(spec.label + ' '));
  const sel = document.createElement('select');
  for (const [value, text] of spec.options) {
    const o = document.createElement('option');
    o.value = value; o.textContent = text;
    sel.appendChild(o);
  }
  sel.value = PARAMETERS[spec.key];
  sel.onchange = function () {
    PARAMETERS[spec.key] = sel.value;
    if (spec.resets && typeof reset === 'function') reset();
  };
  wrap.appendChild(sel);
  panel.appendChild(wrap);
  _controlRefreshers.push(function () { sel.value = PARAMETERS[spec.key]; });
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
    ['Crawler (C)', function () { seedNamed('crawler'); }],
    ['Genotype view (G)', function () { toggleGenotypeView(); }],
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
