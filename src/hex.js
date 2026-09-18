'use strict';
// Hex geometry, ported from ../Hex CA/sim/hexca.js. Flat-top hexagons, even-q offset
// (odd columns shifted DOWN by half a cell height), toroidal wrap.
//
// The six directions are listed in CLOCKWISE order, and that ordering is load-bearing here
// in a way it was not in Hex CA: an organism's face is an index into this list, so a right
// turn is (face + 1) % 6 and a left turn is (face + 5) % 6. Do not reorder.
var DIR_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

var EVEN_NEIGHBORS = [
  { dc:  0, dr: -1 }, // N
  { dc: +1, dr: -1 }, // NE
  { dc: +1, dr:  0 }, // SE
  { dc:  0, dr: +1 }, // S
  { dc: -1, dr:  0 }, // SW
  { dc: -1, dr: -1 }, // NW
];
var ODD_NEIGHBORS = [
  { dc:  0, dr: -1 }, // N
  { dc: +1, dr:  0 }, // NE
  { dc: +1, dr: +1 }, // SE
  { dc:  0, dr: +1 }, // S
  { dc: -1, dr: +1 }, // SW
  { dc: -1, dr:  0 }, // NW
];

// Rotation codes, as emitted by a rule's output.
var ROT_L = 0, ROT_NONE = 1, ROT_R = 2;

// Apply a rotation code to a face. R is clockwise because DIR order is clockwise.
function rotateFace(face, rot) {
  if (rot === ROT_R) return (face + 1) % 6;
  if (rot === ROT_L) return (face + 5) % 6;
  return face;
}

// Flat cell index. Column-major, matching Hex CA: i = col * rows + row.
function hexIndex(col, row, rows) { return col * rows + row; }

// Neighbour of cell (col,row) in direction `dir`, wrapped on the torus. Returns a flat index.
function hexNeighbor(col, row, dir, cols, rows) {
  const off = (col % 2 === 0 ? EVEN_NEIGHBORS : ODD_NEIGHBORS)[dir];
  const nc = (col + off.dc + cols) % cols;
  const nr = (row + off.dr + rows) % rows;
  return nc * rows + nr;
}

// Precomputed unit hex vertices (flat-top), scaled at draw time.
var HEX_VERTS = [];
for (let i = 0; i < 6; i++) {
  HEX_VERTS.push({ x: Math.cos(Math.PI / 3 * i), y: Math.sin(Math.PI / 3 * i) });
}

// Pixel centre of a cell, for the Observer.
function hexCenter(col, row, size) {
  const sqrt3 = Math.sqrt(3);
  return {
    x: col * size * 1.5 + size,
    y: row * size * sqrt3 + (col % 2 === 1 ? size * sqrt3 / 2 : 0) + size,
  };
}

// Unit vector pointing along direction `dir`, for drawing the face marker. Direction 0 (N)
// is straight up in screen space; each step clockwise is +60 degrees.
function dirVector(dir) {
  const a = -Math.PI / 2 + dir * Math.PI / 3;
  return { x: Math.cos(a), y: Math.sin(a) };
}
