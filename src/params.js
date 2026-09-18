'use strict';
// Single source of truth for every tunable. Serialized verbatim into every saved data
// packet (see datamanager.js) so any run reconstructs from its stored parameters.
// Declared `var` so it's a global in the browser AND in the headless realm.
var PARAMETERS = {
  // --- grid ---
  gridCols: 120,
  gridRows: 80,
  cellSize: 7,

  // --- model ---
  n: 2,                  // living colours. n=2 keeps the genome space enumerable (7^6);
                         // n=3 takes it to 10^12 and the exhaustive atlas is gone.
  asyncUpdate: true,     // organisms act in random order on the live grid (turmite-natural,
                         // and it makes simultaneous births into one cell impossible)

  // --- energy economy (DEVPLAN fork 2: fixed cost per reproduction) ---
  energyPerTransition: 1, // earned when the rule's output colour differs from the current one
  rotationCost: 0,        // fork 3: rotation is free by default
  reproCost: 20,          // fixed cost to place a child. Calibrated to income, NOT to genome
                          // size: an organism earns ~1/tick, so 20 means "20 ticks of work
                          // per child". At reproCost 1 the economy constrains nothing and the
                          // grid saturates immediately — see DEVLOG 2026-09-18.
  childEnergy: 0,         // energy a newborn starts with

  // --- reproduction (DEVPLAN fork 1) ---
  childOrientation: 'inherit', // 'inherit' (child faces the direction it was born in —
                               // filaments and straight runs) | 'offsetR' | 'offsetL' | 'random'

  // --- death ---
  pDeath: 0.01,          // random death per tick per organism (on top of rule-absence death)

  // --- mutation ---
  mutationRate: 0.01,    // per-condition probability of reassignment on reproduction
  absentP: 0.15,         // probability a (re)assigned slot is absent — the lethality dial

  // --- reproducibility ---
  seed: null,            // null = a fresh seed each run (recorded in the packet);
                         // set an integer to replay a run exactly

  // --- initial population ---
  initialSeeds: 100,     // random organisms dropped on an empty grid. At 40 the founding
                         // population fails to establish in ~2% of runs (measured, 60 trials);
                         // at 100 it did not fail once.
  seedGenome: 'random',  // 'random' | 'spinner' | 'walker' (the last two are n=2 only)

  // --- view ---
  drawMode: 'state',     // 'state' | 'genotype'
  showFaces: true,       // draw the orientation tick — without it a spinner and a walker
                         // look identical, and orientation is the whole point of this model

  // --- engine ---
  updatesPerDraw: 4,     // sim updates per rendered frame

  // --- data collection ---
  reportingPeriod: 25,   // sample metrics every N ticks
  epoch: 5000,           // a run ends (and ships a packet) at N ticks

  // --- database (the standard vendored client, src/db.js) ---
  db: {
    transport: 'socket',
    server: 'https://research.climbinggiants.com:8888',
    mongoUrl: 'mongodb://127.0.0.1:27017',
    db: 'hexturmitesDB',
    run: 'run',
  },
};

// Schema drives the auto-generated control panel (ui.js). One entry per live-tunable.
var PARAM_SCHEMA = [
  { key: 'n', label: 'Colours (n)', min: 2, max: 6, step: 1, resets: true },
  { key: 'initialSeeds', label: 'Seeds', min: 1, max: 800, step: 1, resets: true },
  { key: 'absentP', label: 'Absent-rule p', min: 0, max: 1, step: 0.01 },
  { key: 'mutationRate', label: 'Mutation rate', min: 0, max: 0.5, step: 0.005 },
  { key: 'reproCost', label: 'Repro cost', min: 0, max: 100, step: 1 },
  { key: 'rotationCost', label: 'Rotation cost', min: 0, max: 5, step: 0.5 },
  { key: 'pDeath', label: 'Random death', min: 0, max: 0.05, step: 0.001 },
  { key: 'updatesPerDraw', label: 'Speed', min: 1, max: 100, step: 1 },
  { key: 'cellSize', label: 'Cell size', min: 3, max: 20, step: 1, refits: true },
];
