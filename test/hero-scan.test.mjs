/* Regression tests for the hero's learned filter (data/hero-scan.js →
   js/receptive-field.js).

   Three things matter here:
     1. data/hero-scan.js must not drift from the committed model (the
        generator is deterministic, so this is exact);
     2. the int8 kernels must still *be* conv1 — the button says "Learned",
        and that is only true if convolving with them reproduces the layer
        js/lenet.js's forward() computes. Quantisation may move it a little,
        not anywhere interesting. The digits for that check come from
        data/cnn-samples.json, since the data module no longer carries any;
     3. the kernels must stay off every page and every visit that does not ask
        for them: main.js reaches the hero only through a dynamic import, and
        the hero reaches this module only through another one.
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
const SAMPLES = JSON.parse(read('data/cnn-samples.json')).samples;

const IN_W = 28;
const OUT_W = IN_W - K + 1;

/* An independent decode (Buffer, not atob) — js/receptive-field.js has its own
   decodeLearned(), held to the model by test/receptive-field.test.mjs. */
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

/* A valid-padding conv1 with bias and ReLU — what lenet.js computes. */
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

test('hero-scan: the kernels have the shapes the hero indexes', () => {
  assert.equal(HERO_SCAN.kernels.count, C1, 'conv1 has six filters');
  assert.equal(HERO_SCAN.kernels.k, K);
  assert.equal(HERO_SCAN.kernels.bias.length, C1);
  assert.ok(HERO_SCAN.kernels.scale > 0, 'int8 scale must be positive');
  assert.equal(Buffer.from(HERO_SCAN.kernels.weights, 'base64').length, C1 * K * K);

  assert.equal(HERO_SCAN.digits, undefined, 'the digits left with the narrow-viewport hero');
});

test('hero-scan: the int8 kernels reproduce lenet.js conv1', () => {
  /* The claim the Learned button rests on. Run the committed sample digits
     through the full float32 model, then compute the same layer from the int8
     kernels in data/hero-scan.js, and require the two to agree. */
  const model = deserializeModel(JSON.parse(read('data/cnn-model.json')));
  const state = createState();
  const kernels = decodeKernels();

  let worst = 0;
  let scale = 0;
  for (const d of SAMPLES) {
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

test('hero-scan: reached only through two dynamic imports', () => {
  const main = read('js/main.js');
  assert.ok(/import\(['"]\.\/receptive-field\.js['"]\)/.test(main),
    'main.js must reach the hero through a dynamic import');
  assert.ok(!/^import[\s\S]{0,120}['"]\.\/receptive-field\.js['"]/m.test(main),
    'main.js must not statically import receptive-field.js — that lands it in every page');

  const src = read('js/receptive-field.js');
  assert.ok(/import\(['"]\.\.\/data\/hero-scan\.js['"]\)/.test(src),
    'the hero must load the learned kernels only when that filter is chosen');
  assert.ok(!/^import[\s\S]{0,120}hero-scan/m.test(src),
    'a static import would make every homepage visit pay for a button few press');
  assert.ok(!/three-context|from ['"]three['"]|from ['"]\.\/lenet\.js['"]/.test(src),
    'the hero must not pull Three.js or the forward pass onto the homepage');
});

test('hero-scan: the payload stays tiny', () => {
  /* Six 5×5 int8 kernels are 150 bytes; the rest is header. A ceiling, not a
     measurement, so it fails on a category change (digits creeping back in)
     rather than on a retrained model. */
  const bytes = Buffer.byteLength(read(OUT_FILE));
  assert.ok(bytes < 4 * 1024,
    `${OUT_FILE} is ${(bytes / 1024).toFixed(1)} KB — the learned filter's budget is 4 KB`);
});
