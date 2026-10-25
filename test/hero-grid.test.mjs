/* Tests for the homepage hero's pure maths (js/hero-grid.js).

   The hero draws the name as a grid of pixels and, every few seconds, a burst
   of broadcast static tears a few horizontal bands sideways and tints their
   edges. Where the bands fall and how far they slip is decided by pure
   functions, tested here against the invariants that keep the name legible
   (a band stays inside the grid, never slips by zero, never swallows most of
   the picture) rather than against exact output. The renderer around them is
   DOM and is covered by the browser suite. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { glitchBands, sampleShifted, fitFont, stretchKeyword, BURST } from '../js/hero-grid.js';

/* A small seeded generator, so a failure names a reproducible burst. */
const lcg = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const COLORS = ['#dad25e', '#59c1c9', '#5cbf54', '#e17edc', '#e0574d', '#6d8cf0'];

test('glitchBands: every band sits inside the grid and slips sideways by a real amount', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rows = 12 + (seed % 40), cols = 60 + (seed % 90);
    const bands = glitchBands(lcg(seed), cols, rows, COLORS);
    assert.ok(bands.length >= BURST.minBands && bands.length <= BURST.maxBands, `seed ${seed}: ${bands.length} bands`);
    for (const b of bands) {
      assert.ok(b.y >= 0 && b.y + b.h <= rows, `seed ${seed}: band ${b.y}+${b.h} leaves ${rows} rows`);
      assert.ok(b.h >= 1 && b.h <= BURST.maxHeight, `seed ${seed}: height ${b.h}`);
      assert.ok(Number.isInteger(b.dx) && b.dx !== 0 && Math.abs(b.dx) <= BURST.maxShift, `seed ${seed}: dx ${b.dx}`);
    }
  }
});

test('glitchBands: bands never overlap, and never cover more than half the picture', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rows = 8 + (seed % 40);
    const bands = glitchBands(lcg(seed), 100, rows, COLORS);
    const taken = new Set();
    for (const b of bands) {
      for (let y = b.y; y < b.y + b.h; y++) {
        assert.ok(!taken.has(y), `seed ${seed}: row ${y} is in two bands`);
        taken.add(y);
      }
    }
    assert.ok(taken.size <= Math.ceil(rows / 2), `seed ${seed}: ${taken.size} of ${rows} rows torn`);
  }
});

test('glitchBands: one or two bands carry a colour pair taken from the palette, the rest are plain', () => {
  let tinted = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const bands = glitchBands(lcg(seed), 120, 30, COLORS);
    const coloured = bands.filter((b) => b.tint);
    assert.ok(coloured.length >= 1 && coloured.length <= BURST.maxTinted, `seed ${seed}: ${coloured.length} tinted`);
    for (const b of coloured) {
      assert.equal(b.tint.length, 2);
      assert.notEqual(b.tint[0], b.tint[1], `seed ${seed}: a tint of one colour is not a split`);
      for (const c of b.tint) assert.ok(COLORS.includes(c), `seed ${seed}: ${c} is not a palette colour`);
    }
    tinted += coloured.length;
  }
  assert.ok(tinted > 300, 'colours should appear in every burst');
});

test('glitchBands: the extremes of the random source still give a legal burst', () => {
  for (const r of [() => 0, () => 0.999999]) {
    const bands = glitchBands(r, 80, 20, COLORS);
    assert.ok(bands.length >= 1);
    for (const b of bands) assert.ok(b.y >= 0 && b.y + b.h <= 20 && b.dx !== 0);
  }
});

test('glitchBands: a grid too short to tear returns no bands rather than throwing', () => {
  assert.deepEqual(glitchBands(lcg(1), 80, 0, COLORS), []);
  assert.deepEqual(glitchBands(lcg(1), 80, 1, COLORS).every((b) => b.y === 0 && b.h === 1), true);
});

test('sampleShifted: a slipped row reads from the cell it slipped from, and wraps around the edge', () => {
  const w = 5;
  const g = Float32Array.from([0, 0.25, 0.5, 0.75, 1]);
  assert.equal(sampleShifted(g, w, 0, 0, 0), 0);
  assert.equal(sampleShifted(g, w, 2, 0, 1), 0.25, 'slipped right by 1: cell 2 shows what was in cell 1');
  assert.equal(sampleShifted(g, w, 0, 0, 1), 1, 'the left edge wraps to the right end');
  assert.equal(sampleShifted(g, w, 4, 0, -1), 0, 'slipped left by 1: the right edge wraps to the start');
  assert.equal(sampleShifted(g, w, 3, 0, 12), sampleShifted(g, w, 3, 0, 2), 'a slip longer than the row wraps');
});

test('fitFont: the longer line fills the grid width without overflowing it', () => {
  /* A fake measure: every glyph is 0.6 em wide, like a monospace. */
  const measure = (text, size) => text.length * size * 0.6;
  const size = fitFont(['Stefano', 'Masneri'], 140, measure);
  assert.ok(measure('Stefano', size) <= 140);
  assert.ok(measure('Stefano', size + 1) > 140 * 0.97, 'leaves more than 3% of the width unused');
});

test('stretchKeyword: percentages map to the nearest keyword the canvas font accepts', () => {
  assert.equal(stretchKeyword('62%'), 'extra-condensed');
  assert.equal(stretchKeyword('100%'), 'normal');
  assert.equal(stretchKeyword('125%'), 'expanded');
  assert.equal(stretchKeyword('normal'), 'normal', 'a keyword or junk falls back to normal');
  assert.equal(stretchKeyword(''), 'normal');
});
