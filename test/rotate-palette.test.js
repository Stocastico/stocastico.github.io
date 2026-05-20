'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Tests for scripts/rotate-palette.js
   Run:  npm run test:rotate-palette
──────────────────────────────────────────────────────────────────────────────*/
const test   = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, paletteOrder, nextPalette, rewriteActive } = require('../scripts/rotate-palette');

// ─── parseArgs ─────────────────────────────────────────────────────────────────

test('parseArgs: defaults', () => {
  const o = parseArgs(['node', 'rotate-palette.js']);
  assert.equal(o.palette, null);
  assert.equal(o.dryRun, false);
  assert.equal(o.help, false);
});

test('parseArgs: flags', () => {
  const o = parseArgs(['node', 'x', '--palette', 'crimson', '--dry-run']);
  assert.equal(o.palette, 'crimson');
  assert.equal(o.dryRun, true);
});

test('parseArgs: unknown argument throws', () => {
  assert.throws(() => parseArgs(['node', 'x', '--nope']), /Unknown argument/);
});

// ─── paletteOrder ──────────────────────────────────────────────────────────────

test('paletteOrder: preserves document order', () => {
  const data = { palettes: { forest: {}, apricot: {}, crimson: {} } };
  assert.deepEqual(paletteOrder(data), ['forest', 'apricot', 'crimson']);
});

test('paletteOrder: empty when palettes missing', () => {
  assert.deepEqual(paletteOrder({}), []);
  assert.deepEqual(paletteOrder({ palettes: null }), []);
});

// ─── nextPalette ───────────────────────────────────────────────────────────────

test('nextPalette: advances by one', () => {
  const ids = ['forest', 'apricot', 'crimson'];
  assert.equal(nextPalette(ids, 'forest'), 'apricot');
  assert.equal(nextPalette(ids, 'apricot'), 'crimson');
});

test('nextPalette: wraps around at the end', () => {
  const ids = ['forest', 'apricot', 'crimson'];
  assert.equal(nextPalette(ids, 'crimson'), 'forest');
});

test('nextPalette: unknown current falls back to first', () => {
  assert.equal(nextPalette(['forest', 'apricot'], 'gone'), 'forest');
});

test('nextPalette: empty list throws', () => {
  assert.throws(() => nextPalette([], 'x'), /no palettes/);
});

// ─── rewriteActive ─────────────────────────────────────────────────────────────

test('rewriteActive: swaps the active value only', () => {
  const yaml = 'active: forest\n\npalettes:\n  forest:\n    name: Forest\n';
  const out  = rewriteActive(yaml, 'apricot');
  assert.match(out, /^active: apricot$/m);
  assert.match(out, /palettes:\n  forest:/);
});

test('rewriteActive: preserves a trailing inline comment', () => {
  const out = rewriteActive('active: forest  # current\n', 'crimson');
  assert.equal(out, 'active: crimson  # current\n');
});

test('rewriteActive: throws when no active line exists', () => {
  assert.throws(() => rewriteActive('palettes:\n  forest: {}\n', 'apricot'), /active:/);
});
