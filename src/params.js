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
  energyRule: 'mismatch', // how an organism earns, each tick, after its rule has recoloured it:
                          //   'mismatch' — one unit per neighbour whose colour differs from its own
                          //   'match'    — one unit per neighbour whose colour equals its own
                          //   'change'   — one unit when the rule changed its colour (the Stage 1
                          //                economy; spinner/walker/crawler demos use this)
                          // Neighbour rules pay 0..6 per tick, so income is NOT ~1/tick any more.
  emptyIsMismatch: false, // mismatch only: does an empty neighbour count as a non-match? false =
                          // income comes only from contact with living organisms, so a lone
                          // organism earns nothing. true = open space pays, lone earns 6/tick.
  founderChildren: 1,     // each random founder starts with founderChildren x reproCost energy.
                          // Under the neighbour rules a scattered founder earns nothing alone, so
                          // this buys contact. Counted in children, not energy, so moving
                          // reproCost can't silently starve the founders. Stage 1 founders had 0.
  energyPerTransition: 1, // the unit: earned per colour change, or per (mis)matching neighbour
  rotationCost: 0,        // fork 3: rotation is free by default
  moveCost: 0,            // paid when an organism actually steps (movement on only)
  reproCost: 20,          // fixed cost to place a child. Calibrated to income, NOT to genome
                          // size: an organism earns ~1/tick, so 20 means "20 ticks of work
                          // per child". At reproCost 1 the economy constrains nothing and the
                          // grid saturates immediately — see DEVLOG 2026-09-18.
  childEnergy: 0,         // energy a newborn starts with

  // --- reproduction (DEVPLAN fork 1) ---
  childOrientation: 'inherit', // 'inherit' (child faces the direction it was born in —
                               // filaments and straight runs) | 'offsetR' | 'offsetL' | 'random'

  // --- movement ---
  movement: false,        // false: organisms only recolour, turn and reproduce (the Stage 1
                          // model, 7^6 genomes at n=2). true: every rule output also carries a
                          // move bit — step into the faced cell if it is empty, leaving a child
                          // in the vacated cell when reproCost is affordable. 13^6 genomes.
                          // Changes the genome encoding, so toggling it resets the world.

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
  statsPage: 0,          // 0 population, 1 gene pool, 2 atlas, 3 lineages (keys 1-4)
  panelWidth: 430,       // the stats panel; the atlas wants >= 360 to draw 343px at 1:1
  drawMode: 'state',     // 'state' | 'genotype'
  showFaces: true,       // draw the orientation tick — without it a spinner and a walker
                         // look identical, and orientation is the whole point of this model

  // --- engine ---
  updatesPerDraw: 4,     // sim updates per rendered frame
  framesPerUpdate: 1,    // slow-mo: above 1, ONE update every N frames (updatesPerDraw is
                         // ignored), so 60 is ~1 tick/sec. Browser-only; headless ignores it.

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
// A `type: 'bool'` entry renders as a checkbox and a `type: 'choice'` entry as a dropdown,
// instead of a slider.
var PARAM_SCHEMA = [
  { key: 'movement', label: 'Movement (M)', type: 'bool', resets: true },
  { key: 'energyRule', label: 'Energy from', type: 'choice',
    options: [['mismatch', 'mismatching neighbours'], ['match', 'matching neighbours'],
              ['change', 'colour change (Stage 1)']] },
  { key: 'emptyIsMismatch', label: 'Empty neighbour = mismatch', type: 'bool' },
  { key: 'founderChildren', label: 'Founder children', min: 0, max: 5, step: 1, resets: true },
  { key: 'n', label: 'Colours (n)', min: 2, max: 6, step: 1, resets: true },
  { key: 'initialSeeds', label: 'Seeds', min: 1, max: 800, step: 1, resets: true },
  { key: 'absentP', label: 'Absent-rule p', min: 0, max: 1, step: 0.01 },
  { key: 'mutationRate', label: 'Mutation rate', min: 0, max: 0.5, step: 0.005 },
  { key: 'reproCost', label: 'Repro cost', min: 0, max: 100, step: 1 },
  { key: 'rotationCost', label: 'Rotation cost', min: 0, max: 5, step: 0.5 },
  { key: 'moveCost', label: 'Move cost', min: 0, max: 5, step: 0.5 },
  { key: 'pDeath', label: 'Random death', min: 0, max: 0.05, step: 0.001 },
  { key: 'updatesPerDraw', label: 'Speed', min: 1, max: 100, step: 1 },
  { key: 'framesPerUpdate', label: 'Slow-mo', min: 1, max: 60, step: 1 },
  { key: 'cellSize', label: 'Cell size', min: 3, max: 20, step: 1, refits: true },
];
