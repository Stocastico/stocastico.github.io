/* Tests for the homepage hero's filter maths (js/receptive-field.js).

   The hero draws the name as a grid of pixels and shows what a 5×5 filter
   makes of it. That is a claim about convolution, so the arithmetic is tested
   here against cases whose answer is known in advance — a vertical step for a
   vertical-edge filter, an L for the corner detector — rather than against
   the module's own output. The renderer around it is DOM and is covered by
   the browser suite.

   The learned filter gets the stronger check: it has to *be* conv1 of the
   committed LeNet-5, to within the int8 quantisation step, because the
   button that selects it says so. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FILTERS, K, convolve, harris, normalise, respond, decodeLearned, fitFont, revealedColumns, stretchKeyword,
} from '../js/receptive-field.js';
import { HERO_SCAN } from '../data/hero-scan.js';
import { deserializeModel } from '../scripts/lib/lenet.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* A w×h grid with ink where pred(x, y) holds. */
function grid(w, h, pred) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = pred(x, y) ? 1 : 0;
  return g;
}
const at = (g, w, x, y) => g[y * w + x];

test('FILTERS: unique ids, 5×5 kernels, a label on every one', () => {
  const ids = FILTERS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(K, 5);
  for (const f of FILTERS) {
    assert.ok(f.label && f.label.length > 0, `${f.id} has no label`);
    if (f.kernel) assert.equal(f.kernel.length, K * K, `${f.id} is not 5×5`);
  }
  assert.ok(FILTERS.some((f) => f.id === 'corners'), 'corner detector missing');
  assert.ok(FILTERS.some((f) => f.id === 'learned'), 'learned filter missing');
});

test('edge filters sum to zero, so flat ink and flat paper both read as nothing', () => {
  for (const f of FILTERS.filter((x) => x.kernel)) {
    const sum = f.kernel.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum) < 1e-9, `${f.id} sums to ${sum}`);
  }
});

test('convolve: a centred delta kernel returns the input unchanged', () => {
  const w = 9, h = 7;
  const g = grid(w, h, (x, y) => (x * 3 + y) % 4 === 0);
  const delta = new Float32Array(K * K); delta[12] = 1;
  assert.deepEqual(Array.from(convolve(g, w, h, delta)), Array.from(g));
});

test('convolve: zero padding — a kernel that reads off the edge sees paper', () => {
  const w = 5, h = 5;
  const g = grid(w, h, () => true);
  const left = new Float32Array(K * K); left[10] = 1; // two columns to the left of centre
  const out = convolve(g, w, h, left);
  assert.equal(at(out, w, 0, 2), 0);
  assert.equal(at(out, w, 1, 2), 0);
  assert.equal(at(out, w, 2, 2), 1);
});

test('vertical edges: responds on a vertical step, not on a horizontal one', () => {
  const v = FILTERS.find((f) => f.id === 'vertical');
  const w = 20, h = 20;
  const vStep = grid(w, h, (x) => x >= 10);
  const hStep = grid(w, h, (_, y) => y >= 10);
  const rv = convolve(vStep, w, h, v.kernel);
  const rh = convolve(hStep, w, h, v.kernel);
  const inner = (r) => { let m = 0; for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) m = Math.max(m, Math.abs(at(r, w, x, y))); return m; };
  assert.ok(inner(rv) > 1, 'no response to a vertical edge');
  assert.ok(inner(rh) < 1e-9, 'responded to a horizontal edge');
  /* Signed: paper→ink and ink→paper answer with opposite signs, which is
     what the two accent colours are there to show. */
  const mirrored = convolve(grid(w, h, (x) => x < 10), w, h, v.kernel);
  assert.ok(at(rv, w, 10, 10) > 0 && at(mirrored, w, 10, 10) < 0);
});

test('horizontal edges: the transpose of vertical', () => {
  const v = FILTERS.find((f) => f.id === 'vertical').kernel;
  const hk = FILTERS.find((f) => f.id === 'horizontal').kernel;
  for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) assert.equal(hk[y * K + x], v[x * K + y]);
});

test('harris: a corner scores positive, a straight edge negative, flat zero', () => {
  const w = 30, h = 30;
  /* A filled square: four corners, four edges, a flat interior. */
  const g = grid(w, h, (x, y) => x >= 8 && x < 22 && y >= 8 && y < 22);
  const r = harris(g, w, h);
  let corner = -Infinity; for (const [x, y] of [[8, 8], [21, 8], [8, 21], [21, 21]]) corner = Math.max(corner, at(r, w, x, y));
  assert.ok(corner > 0, `corner response ${corner}`);
  assert.ok(at(r, w, 15, 8) < 0, `edge response ${at(r, w, 15, 8)}`);
  assert.equal(at(r, w, 15, 15), 0);
  assert.equal(at(r, w, 2, 2), 0);
  /* The strongest response anywhere sits at a corner, not mid-edge. */
  let best = 0, bx = 0, by = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(r, w, x, y) > best) { best = at(r, w, x, y); bx = x; by = y; }
  assert.ok((bx < 12 || bx > 18) && (by < 12 || by > 18), `peak at ${bx},${by}`);
});

test('normalise: maps into [-1, 1] with the largest magnitude at exactly 1', () => {
  const n = normalise(Float32Array.from([-4, 2, 0, 1]));
  assert.deepEqual(Array.from(n), [-1, 0.5, 0, 0.25]);
  assert.deepEqual(Array.from(normalise(new Float32Array(3))), [0, 0, 0], 'all-zero input must not divide by zero');
});

test('respond: every filter gives a normalised map the size of the grid', () => {
  const w = 24, h = 16;
  const g = grid(w, h, (x, y) => x > 5 && x < 18 && y > 3 && y < 12);
  const learned = decodeLearned(HERO_SCAN);
  for (const f of FILTERS) {
    const r = respond(g, w, h, f, learned[0]);
    assert.equal(r.length, w * h, f.id);
    const m = r.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
    assert.ok(Math.abs(m - 1) < 1e-6, `${f.id} peak ${m}`);
  }
});

test('decodeLearned: six 5×5 kernels that are conv1 of the committed model, to within one int8 step', () => {
  const flat = deserializeModel(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cnn-model.json'), 'utf8'))).w1;
  const learned = decodeLearned(HERO_SCAN);
  assert.equal(learned.length, 6);
  const step = HERO_SCAN.kernels.scale;
  for (let f = 0; f < 6; f++) {
    assert.equal(learned[f].length, K * K);
    for (let i = 0; i < K * K; i++) {
      assert.ok(Math.abs(learned[f][i] - flat[f * K * K + i]) <= step / 2 + 1e-6, `kernel ${f}[${i}]`);
    }
  }
});

test('fitFont: the longer line fills the grid width without overflowing it', () => {
  /* A fake measure: every glyph is 0.6 em wide, like a monospace. */
  const measure = (text, size) => text.length * size * 0.6;
  const size = fitFont(['Stefano', 'Masneri'], 140, measure);
  assert.ok(measure('Stefano', size) <= 140);
  assert.ok(measure('Stefano', size + 1) > 140 * 0.97, 'leaves more than 3% of the width unused');
});

test('revealedColumns: the window reveals every column up to its centre, clamped', () => {
  assert.equal(revealedColumns(0, 100), 0);
  assert.equal(revealedColumns(0.5, 100), 50);
  assert.equal(revealedColumns(1, 100), 100);
  assert.equal(revealedColumns(-3, 100), 0);
  assert.equal(revealedColumns(7, 100), 100);
});

test('stretchKeyword: percentages map to the nearest keyword the canvas font accepts', () => {
  assert.equal(stretchKeyword('62%'), 'extra-condensed');
  assert.equal(stretchKeyword('100%'), 'normal');
  assert.equal(stretchKeyword('125%'), 'expanded');
  assert.equal(stretchKeyword('normal'), 'normal', 'a keyword or junk falls back to normal');
  assert.equal(stretchKeyword(''), 'normal');
});
