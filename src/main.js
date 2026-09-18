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
  db = createDB(PARAMETERS.db);
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
function seedNamed(kind) {
  PARAMETERS.n = 2;
  PARAMETERS.seedGenome = kind;
  PARAMETERS.initialSeeds = 0;
  PARAMETERS.mutationRate = 0;
  PARAMETERS.pDeath = 0;
  PARAMETERS.reproCost = 1;
  reset();
  const col = (world.cols / 2) | 0, row = (world.rows / 2) | 0;
  world.place(col * world.rows + row, 0, 0, kind === 'spinner' ? spinnerGenome() : walkerGenome());
  refreshControls();
  setStatus(kind + ' seeded at centre — reproCost 1, mutation and random death off. ' +
    'Press R to return to the evolving default.');
}

function toggleGenotypeView() {
  PARAMETERS.drawMode = PARAMETERS.drawMode === 'state' ? 'genotype' : 'state';
}
function toggleFaces() { PARAMETERS.showFaces = !PARAMETERS.showFaces; }
function setStatsPage(i) { PARAMETERS.statsPage = i; }

window.addEventListener('keydown', function (e) {
  const t = e.target.tagName;
  if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (k >= '1' && k <= '4') setStatsPage(parseInt(k, 10) - 1);
  else if (k === 'g') toggleGenotypeView();
  else if (k === 'f') toggleFaces();
  else if (k === 'r') reset();
  else if (k === 's') seedNamed('spinner');
  else if (k === 'w') seedNamed('walker');
});

window.onload = function () {
  const canvas = document.getElementById('gameWorld');
  gameEngine = new GameEngine();
  gameEngine.init(canvas.getContext('2d'));
  buildControls();
  reset();
  gameEngine.start();
};
