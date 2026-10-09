'use strict';
// The GameEngine loop (engine v2, descended from the long-running "Bad Aliens" shell but
// cleaned: no dead AssetManager, no DOM, browser/headless split made explicit).
//
// An "entity" is anything with optional update(engine) and draw(ctx) methods, plus an
// optional `removeFromWorld` flag. The world, observer, datamanager and charts are all
// entities. Browser drives the loop via start(); headless drives update() in a plain loop.
//
// Declared `var Foo = class Foo` so the class is a global in the browser AND attaches to
// the headless vm context (a bare `class Foo {}` would be block-scoped and invisible there).
var GameEngine = class GameEngine {
  constructor() {
    this.entities = [];
    this.ctx = null;
    this.running = false;
    this.tick = 0;
  }

  init(ctx) { this.ctx = ctx; }
  add(entity) { this.entities.push(entity); }
  clear() { this.entities = []; this.tick = 0; }

  // browser entry — render-locked loop with fast-forward (updatesPerDraw) and slow-mo
  // (framesPerUpdate: one update every N frames). Draws every frame either way, so the
  // view stays responsive to UI changes while the sim is crawling.
  start() {
    this.running = true;
    let frame = 0;
    const loop = () => {
      if (!this.running) return;
      const slow = PARAMETERS.framesPerUpdate || 1;
      if (slow > 1) { if (++frame >= slow) { frame = 0; this.update(); } }
      else for (let i = 0; i < PARAMETERS.updatesPerDraw; i++) this.update();
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }

  // one simulation step (the headless entry point too)
  update() {
    this.tick++;
    for (const e of this.entities) if (e.update) e.update(this);
    this.entities = this.entities.filter((e) => !e.removeFromWorld);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const e of this.entities) if (e.draw) e.draw(ctx);
  }
};
