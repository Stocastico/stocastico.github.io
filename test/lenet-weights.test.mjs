/* Tests for scripts/generate-lenet-weights.mjs and the module it emits.

   Two jobs:
     1. drift — data/lenet-weights.js must be exactly what the generator
        produces from the committed data/cnn-model.json, so nobody can
        hand-edit the weights the browser runs;
     2. fidelity — the int8 quantisation must not change what the model says.

   The second is the one that matters. Quantisation is a lossy step applied to
   the artefact visitors actually interact with, and a silent regression there
   would look like "the demo is bad at 8s" rather than like a bug. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generate, OUTPUT_PATH, quantizeInt8, dequantizeInt8, buildQuantized, compareOnSamples,
} from '../scripts/generate-lenet-weights.mjs';
import { createState, forward, argmax } from '../js/lenet.js';
import { deserializeModel } from '../scripts/lib/lenet.mjs';
import { LENET, loadModel } from '../data/lenet-weights.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = JSON.parse(readFileSync(resolve(ROOT, 'data/cnn-model.json'), 'utf8'));
const SAMPLES = JSON.parse(readFileSync(resolve(ROOT, 'data/cnn-samples.json'), 'utf8')).samples;

test('lenet-weights: data/lenet-weights.js is up to date with the generator', () => {
  const { source } = generate();
  const onDisk = readFileSync(OUTPUT_PATH, 'utf8');
  assert.equal(source, onDisk,
    'data/lenet-weights.js has drifted — run `npm run generate-lenet-weights`');
});

test('lenet-weights: quantizeInt8 round-trips within half a step', () => {
  const values = new Float32Array([-1, -0.5, 0, 0.25, 0.9, 1]);
  const { scale, q } = quantizeInt8(values);
  const back = dequantizeInt8(q, scale);
  for (let i = 0; i < values.length; i++) {
    assert.ok(Math.abs(back[i] - values[i]) <= scale / 2 + 1e-7,
      `index ${i}: ${back[i]} vs ${values[i]} exceeds half a quantisation step`);
  }
  /* Symmetric quantisation must map exact zero to exact zero — a nonzero
     "zero" weight would leak signal through every dead connection. */
  assert.equal(back[2], 0);
});

test('lenet-weights: an all-zero tensor survives quantisation', () => {
  const { scale, q } = quantizeInt8(new Float32Array(8));
  assert.equal(scale, 1);
  assert.ok(dequantizeInt8(q, scale).every((v) => v === 0));
});

test('lenet-weights: the shipped module decodes to the same weights the generator built', () => {
  const built = buildQuantized(MODEL);
  const shipped = loadModel();
  for (const key of Object.keys(built.dequantized)) {
    const a = built.dequantized[key];
    const b = shipped[key];
    assert.equal(b.length, a.length, `${key} length`);
    for (let i = 0; i < a.length; i++) {
      assert.equal(b[i], a[i], `${key}[${i}] differs between generator and shipped module`);
    }
  }
});

test('lenet-weights: quantisation does not change any prediction', () => {
  const floatModel = deserializeModel(MODEL);
  const check = compareOnSamples(floatModel, loadModel(), SAMPLES);
  assert.equal(check.agree, check.total,
    `int8 quantisation changed ${check.total - check.agree} of ${check.total} predictions`);
  /* Empirically ~9e-3. A hard ceiling well above that catches a real
     regression without failing on floating-point noise. */
  assert.ok(check.maxProbDelta < 0.05,
    `max probability drift ${check.maxProbDelta} exceeds 0.05`);
});

test('lenet-weights: the shipped model classifies all ten committed samples correctly', () => {
  const model = loadModel();
  const state = createState();
  for (const sample of SAMPLES) {
    const pixels = new Uint8Array(Buffer.from(sample.pixels, 'base64'));
    forward(model, pixels, state);
    assert.equal(argmax(state.probs), sample.digit,
      `sample labelled ${sample.digit} classified as ${argmax(state.probs)}`);
  }
});

test('lenet-weights: metadata matches the source model', () => {
  assert.equal(LENET.arch, MODEL.arch);
  assert.equal(LENET.testAccuracy, MODEL.testAccuracy);
  assert.equal(LENET.params, 44426);
  assert.equal(LENET.quant, 'int8-per-tensor');
});

test('lenet-weights: the payload stays small enough to ship on one page', () => {
  const bytes = Buffer.byteLength(readFileSync(OUTPUT_PATH, 'utf8'));
  /* The whole argument for quantising is that this page costs ~44 KB gzip
     rather than the 237 KB of float32 JSON. Guard the source size so a future
     change (float16, more layers) has to be a deliberate decision. */
  assert.ok(bytes < 80 * 1024,
    `data/lenet-weights.js is ${(bytes / 1024).toFixed(1)} KB — expected under 80 KB`);
});
