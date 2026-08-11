/* Regression tests for the narrow/touch hero pipeline (data/hero-scan.js →
   js/kernel-scan.js).

   Four things matter here:
     1. data/hero-scan.js must not drift from the committed model + digits (the
        generator is deterministic, so this is exact);
     2. the baked blobs must describe the shapes js/kernel-scan.js indexes into
        — a wrong length silently paints garbage;
     3. the int8 kernels must still *be* conv1. This is the assertion worth
        having: the scene's whole claim is that it convolves the real trained
        filters over a real MNIST digit, and that claim is only true if the
        feature map the renderer computes matches the one js/lenet.js's
        forward() computes for the same digit. Quantisation is allowed to move
        it a little; it is not allowed to move it anywhere interesting;
     4. the module must stay off every page that is not the homepage hero,
        which means main.js may only reach it through a dynamic import.

   The 14 KB of digits are the reason (2) is not enough on its own: a blob of
   the right length full of the wrong bytes passes a shape check and fails (3).
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, build, OUT_FILE } from '../scripts/generate-hero-scan.mjs';
import { HERO_SCAN } from '../data/hero-scan.js';
import { createState, forward, deserializeModel } from '../scripts/lib/lenet.mjs';
import { MEAN, STD, C1, K } from '../js/lenet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const IN_W = 28;
const OUT_W = IN_W - K + 1;

/* The renderer's own decode path, kept in step with js/kernel-scan.js. */
function decodeKernels() {
  const { count, scale, weights, bias } = HERO_SCAN.kernels;
  const raw = Buffer.from(weights, 'base64');
  const out = [];
  for (let f = 0; f < count; f++) {
    const w = new Float32Array(K * K);
    for (let i = 0; i < K * K; i++) {
      const b = raw[f * K * K + i];
      w[i] = (b > 127 ? b - 256 : b) * scale;
    }
    out.push({ w, bias: bias[f] });
  }
  return out;
}

/* The convolution js/kernel-scan.js runs, for one filter. */
function convolve(pixels, kernel) {
  const map = new Float32Array(OUT_W * OUT_W);
  for (let oy = 0; oy < OUT_W; oy++) {
    for (let ox = 0; ox < OUT_W; ox++) {
      let sum = kernel.bias;
      for (let ky = 0; ky < K; ky++) {
        const row = (oy + ky) * IN_W + ox;
        for (let kx = 0; kx < K; kx++) {
          const x = (pixels[row + kx] / 255 - HERO_SCAN.meta.mean) / HERO_SCAN.meta.std;
          sum += x * kernel.w[ky * K + kx];
        }
      }
      map[oy * OUT_W + ox] = sum > 0 ? sum : 0;
    }
  }
  return map;
}

test('hero-scan: committed data is in sync with the model (no drift)', () => {
  assert.equal(render(), read(OUT_FILE),
    `${OUT_FILE} is stale — run \`npm run generate-hero-scan\` and commit it`);
});

test('hero-scan: the generator is deterministic', () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});

test('hero-scan: normalisation constants come from js/lenet.js, not a copy', () => {
  assert.equal(HERO_SCAN.meta.mean, MEAN);
  assert.equal(HERO_SCAN.meta.std, STD);
});

test('hero-scan: kernels and digits have the shapes kernel-scan.js indexes', () => {
  assert.equal(HERO_SCAN.kernels.count, C1, 'conv1 has six filters');
  assert.equal(HERO_SCAN.kernels.k, K);
  assert.equal(HERO_SCAN.kernels.bias.length, C1);
  assert.ok(HERO_SCAN.kernels.scale > 0, 'int8 scale must be positive');
  assert.equal(Buffer.from(HERO_SCAN.kernels.weights, 'base64').length, C1 * K * K);

  assert.equal(HERO_SCAN.digits.length, 10, 'one digit per class');
  const labels = HERO_SCAN.digits.map((d) => d.label).sort((a, b) => a - b);
  assert.deepEqual(labels, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const d of HERO_SCAN.digits) {
    assert.equal(Buffer.from(d.pixels, 'base64').length, IN_W * IN_W,
      `digit ${d.label}: not a 28×28 blob`);
  }
});

test('hero-scan: the digits are not blank, and are mostly background', () => {
  /* Both halves matter: an all-zero blob passes every length check above and
     renders an empty grid, and an all-255 blob would render a solid block. */
  for (const d of HERO_SCAN.digits) {
    const bytes = Buffer.from(d.pixels, 'base64');
    let ink = 0;
    for (const b of bytes) if (b > 32) ink++;
    assert.ok(ink > 40, `digit ${d.label}: only ${ink} inked pixels — blank?`);
    assert.ok(ink < 400, `digit ${d.label}: ${ink} inked pixels — not an MNIST digit`);
  }
});

test('hero-scan: the browser-side convolution reproduces lenet.js conv1', () => {
  /* This is the claim the whole scene rests on. Run the committed digits
     through the full float32 model, then compute the same layer the way
     js/kernel-scan.js does — from the int8 kernels in data/hero-scan.js — and
     require the two to agree. */
  const model = deserializeModel(JSON.parse(read('data/cnn-model.json')));
  const state = createState();
  const kernels = decodeKernels();

  let worst = 0;
  let scale = 0;
  for (const d of HERO_SCAN.digits) {
    const pixels = new Uint8Array(Buffer.from(d.pixels, 'base64'));
    forward(model, pixels, state);
    for (let f = 0; f < C1; f++) {
      const map = convolve(pixels, kernels[f]);
      const base = f * OUT_W * OUT_W;
      for (let i = 0; i < map.length; i++) {
        const ref = state.c1[base + i];
        if (Math.abs(ref) > scale) scale = Math.abs(ref);
        const delta = Math.abs(map[i] - ref);
        if (delta > worst) worst = delta;
      }
    }
  }
  /* The bound is derived, not tuned to what passed. One output is a sum of 25
     terms, each carrying at most half an int8 step (scale/2 ≈ 0.0066) times
     the largest normalised input ((1 - MEAN) / STD ≈ 2.82) — so ~0.46 in the
     absolute worst case, against a layer range of ~9. 2% of the range sits
     just above the error actually observed (~1.3%) and two orders of magnitude
     below what convolving the *wrong* filter would produce. */
  assert.ok(worst < scale * 0.02,
    `conv1 disagrees with lenet.js by ${worst.toFixed(4)} (layer range ${scale.toFixed(2)})`);
});

test('hero-scan: every digit has a live filter to show', () => {
  /* This model has two dead conv1 units: filters 2 and 6 (indices 1 and 5)
     never leave zero on any MNIST digit — an ordinary training outcome, and
     the reason js/kernel-scan.js skips a blank pairing rather than animating
     three and a half seconds of empty grid.

     What must hold for the scene to work is the other half: every digit has
     filters that *do* respond. If a retrained model ever killed enough of
     them, the renderer's skip loop would run out of alternatives and paint an
     empty box — this fails first, and says why. */
  const kernels = decodeKernels();
  for (const d of HERO_SCAN.digits) {
    const pixels = new Uint8Array(Buffer.from(d.pixels, 'base64'));
    const live = kernels.filter((k) => convolve(pixels, k).some((v) => v > 0));
    assert.ok(live.length >= 2,
      `digit ${d.label}: only ${live.length} of ${kernels.length} conv1 filters respond`);
  }
});

test('hero-scan: kernel-scan.js is dynamically imported, and ships no runtime', () => {
  const main = read('js/main.js');
  assert.ok(/import\(['"]\.\/kernel-scan\.js['"]\)[\s\S]{0,80}KernelScan/.test(main),
    'main.js must reach the narrow-viewport hero through a dynamic import');
  assert.ok(!/^import[\s\S]{0,120}['"]\.\/kernel-scan\.js['"]/m.test(main),
    'main.js must not statically import kernel-scan.js — that lands it in every page');

  const src = read('js/kernel-scan.js');
  assert.ok(!/three-context|from ['"]three['"]/.test(src),
    'kernel-scan.js must not pull Three.js onto the homepage');
  assert.ok(!/from ['"]\.\/lenet\.js['"]/.test(src),
    'kernel-scan.js must not import the full forward pass — it draws one layer');
  assert.ok(!/cnn-activations/.test(src),
    'kernel-scan.js must not import the desktop hero\'s activation blobs');
  assert.ok(/from ['"]\.\.\/data\/hero-scan\.js['"]/.test(src),
    'kernel-scan.js should read its kernels from data/hero-scan.js');
});

test('hero-scan: the payload stays small enough for a phone', () => {
  /* The point of a separate data module (rather than reusing
     data/cnn-activations.js, 42 KB of five other layers) is that this one is
     small. A ceiling, not a measurement — well above the ~13 KB it is now, so
     it fails on a category change rather than on a retrained digit. */
  const bytes = Buffer.byteLength(read(OUT_FILE));
  assert.ok(bytes < 24 * 1024,
    `${OUT_FILE} is ${(bytes / 1024).toFixed(1)} KB — the mobile hero's data budget is 24 KB`);
});
