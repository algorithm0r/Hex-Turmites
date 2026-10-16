'use strict';
// Browser entry + wiring (not loaded headlessly). reset() rebuilds the world from the
// current PARAMETERS.
var gameEngine, world, dataManager, db, stats, views;

// The grid decides how big the canvas has to be — at the default 120x80 with cellSize 7 the
// board is ~1274x984, so a fixed canvas silently crops the bottom rows. The graphs get their
// own gutter to the right of the board rather than being drawn over it.
var PANEL_W = PARAMETERS.panelWidth;

function boardWidth() {
  return Math.ceil(PARAMETERS.gridCols * PARAMETERS.cellSize * 1.5 + PARAMETERS.cellSize * 2);
}

function fitCanvas() {
  const size = PARAMETERS.cellSize, sqrt3 = Math.sqrt(3);
  const cv = gameEngine.ctx.canvas;
  PANEL_W = PARAMETERS.panelWidth;
  cv.width  = boardWidth() + PANEL_W;
  cv.height = Math.max(320, Math.ceil(PARAMETERS.gridRows * size * sqrt3 + size * 2));
}

function reset() {
  gameEngine.clear();
  fitCanvas();
  world = new World();
  stats = new Stats(world);
  views = new Views(world, stats);
  // The public GitHub Pages copy never writes: a visitor's run reaching epoch would otherwise
  // be filed into the research DB beside real data. DataManager.flush() no-ops on a null db.
  db = /\.github\.io$/.test(location.hostname) ? null : createDB(PARAMETERS.db);
  dataManager = new DataManager(world, db, stats);
  gameEngine.add(world);
  gameEngine.add(new Observer(world));
  gameEngine.add(dataManager);
  gameEngine.add(views);
  setStatus('seeded ' + world.population() + ' organisms');
}

// Seed the grid with one hand-written organism instead of a random population — the two
// Stage 1 demonstrators, reachable from the panel.
//
// These deliberately drop reproCost to 1, the cheapest economy, so each organism acts once
// per tick and the mechanism is legible: the spinner completes a disc in six ticks and the
// walker advances one hex per tick. At the shipped reproCost the same genomes behave the
// same way, just twenty times slower, which reads as a stall rather than a demonstration.
//
// The crawler is a movement organism, so seeding it switches movement on. The spinner and
// walker never set a move bit, so they behave identically with movement on or off.
//
// All three demos earn by colour CHANGE: they were built for that economy, and alone on an
// empty grid a neighbour rule would pay them nothing, so they would never reproduce.
function seedNamed(kind) {
  PARAMETERS.n = 2;
  PARAMETERS.energyRule = 'change';
  if (kind === 'crawler') PARAMETERS.movement = true;
  PARAMETERS.seedGenome = kind;
  PARAMETERS.initialSeeds = 0;
  PARAMETERS.mutationRate = 0;
  PARAMETERS.pDeath = 0;
  PARAMETERS.reproCost = 1;
  reset();
  const col = (world.cols / 2) | 0, row = (world.rows / 2) | 0;
  world.place(col * world.rows + row, 0, 0, kind === 'spinner' ? spinnerGenome()
                                          : kind === 'crawler' ? crawlerGenome() : walkerGenome());
  refreshControls();
  setStatus(kind + ' seeded at centre — energy from colour change, reproCost 1, mutation and random death off. ' +
    'Press R to return to the evolving default.');
}

function toggleGenotypeView() {
  PARAMETERS.drawMode = PARAMETERS.drawMode === 'state' ? 'genotype' : 'state';
}
function toggleFaces() { PARAMETERS.showFaces = !PARAMETERS.showFaces; }
// Movement changes the genome encoding, so a toggle always starts a fresh world.
function toggleMovement() {
  PARAMETERS.movement = !PARAMETERS.movement;
  reset();
  refreshControls();
  setStatus('movement ' + (PARAMETERS.movement ? 'ON' : 'OFF') + ' — world reset');
}
function setStatsPage(i) { PARAMETERS.statsPage = i; }

// Canvas point for a mouse event, corrected for any CSS scaling of the canvas element.
function canvasPoint(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * (canvas.width / r.width),
    y: (ev.clientY - r.top) * (canvas.height / r.height),
  };
}

function wireTabs(canvas) {
  canvas.addEventListener('click', function (ev) {
    if (!views) return;
    const p = canvasPoint(canvas, ev);
    const tab = views.hitTestTab(p.x, p.y);
    if (tab >= 0) { setStatsPage(tab); gameEngine.draw(); }
  });
  // pointer feedback, so the strip reads as clickable
  canvas.addEventListener('mousemove', function (ev) {
    if (!views) return;
    const p = canvasPoint(canvas, ev);
    canvas.style.cursor = views.hitTestTab(p.x, p.y) >= 0 ? 'pointer' : 'default';
  });
}

window.addEventListener('keydown', function (e) {
  const t = e.target.tagName;
  // BUTTON included so Tab still moves focus normally through the control panel; the page
  // cycle only fires when focus is not on a control.
  if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || t === 'BUTTON') return;
  const k = e.key.toLowerCase();
  if (e.key === 'Tab') {                       // Tab / Shift-Tab cycles the pages
    e.preventDefault();
    setStatsPage((PARAMETERS.statsPage + (e.shiftKey ? 3 : 1)) % 4);
    return;
  }
  if (k >= '1' && k <= '4') setStatsPage(parseInt(k, 10) - 1);
  else if (k === 'g') toggleGenotypeView();
  else if (k === 'f') toggleFaces();
  else if (k === 'r') reset();
  else if (k === 's') seedNamed('spinner');
  else if (k === 'w') seedNamed('walker');
  else if (k === 'c') seedNamed('crawler');
  else if (k === 'm') toggleMovement();
});

window.onload = function () {
  const canvas = document.getElementById('gameWorld');
  gameEngine = new GameEngine();
  gameEngine.init(canvas.getContext('2d'));
  buildControls();
  wireTabs(canvas);
  reset();
  gameEngine.start();
};
