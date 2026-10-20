#!/usr/bin/env node
/* ============================================================
   generate-hero-scan.mjs
   --------------------------------------------------------------
   data/cnn-model.json  ->  data/hero-scan.js

   The homepage hero (js/receptive-field.js) offers a "Learned" filter: one of
   the six conv1 kernels of the LeNet-5 behind projects/mnist-lenet.html,
   convolved over the visitor's view of the name. That needs conv1's kernels
   and nothing else, so this emits exactly those — ~1 KB, imported only when
   the button is pressed.

   It used to carry ten MNIST digits as well (14 KB), for the narrow-viewport
   hero that swept a window over them; that renderer is gone, and the digits
   went with it. test/hero-scan.test.mjs reads them from data/cnn-samples.json
   instead when it checks the kernels against the full model.

   The kernels are the real trained ones, quantised to int8 with a single
   symmetric scale (the same treatment as generate-lenet-weights, for the same
   reason: 0 stays exactly 0). Biases stay float32 — there are six of them.

   Input (committed, produced by `npm run train-cnn`):
     data/cnn-model.json     trained weights + test accuracy

   Deterministic and network-free: same inputs -> byte-identical output, which
   is what test/hero-scan.test.mjs asserts.

   Usage:
     node scripts/generate-hero-scan.mjs [--dry-run] [--help]
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deserializeModel } from './lib/lenet.mjs';
import { MEAN, STD, C1, K } from '../js/lenet.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MODEL_PATH = path.join(ROOT, 'data/cnn-model.json');
export const OUT_FILE = 'data/hero-scan.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-hero-scan.mjs [--dry-run]\n');
  process.exit(0);
}

/* Symmetric per-tensor int8. Same function as generate-lenet-weights', kept
   local rather than imported: that module reads the whole 237 KB model and
   runs comparison forward passes on import, which this generator has no use
   for. Fifteen lines is the cheaper of the two couplings. */
export function quantizeInt8(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a > max) max = a;
  }
  const scale = max > 0 ? max / 127 : 1;
  const q = new Int8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let v = Math.round(values[i] / scale);
    if (v > 127) v = 127;
    if (v < -127) v = -127;
    q[i] = v;
  }
  return { scale, q };
}

export function build() {
  const modelJson = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  const model = deserializeModel(modelJson);

  /* conv1 only: w1 is C1 filters of K*K, filter f at w1[f*25 + ky*5 + kx]. */
  const w1 = model.w1.slice(0, C1 * K * K);
  const { scale, q } = quantizeInt8(w1);

  return {
    meta: {
      arch: 'LeNet-5',
      dataset: 'MNIST',
      layer: 'conv1',
      testAccuracy: modelJson.testAccuracy,
      /* MNIST's normalisation, so the browser convolves the same numbers the
         network was trained on rather than raw greys. */
      mean: MEAN,
      std: STD,
      note: 'conv1 kernels only — the homepage hero\'s Learned filter.',
    },
    kernels: {
      count: C1,
      k: K,
      scale,
      weights: Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString('base64'),
      bias: Array.from(model.b1.slice(0, C1)),
    },
  };
}

export function render() {
  const data = build();
  const lines = [
    '/* ============================================================',
    '   hero-scan.js — GENERATED FILE, DO NOT EDIT',
    '   Regenerate with: npm run generate-hero-scan',
    '',
    '   Source: data/cnn-model.json',
    '',
    '   conv1 of the LeNet-5 trained by scripts/train-cnn.mjs. The homepage',
    '   hero (js/receptive-field.js) imports this only when its Learned filter',
    '   is chosen, and convolves the name with one of these six kernels.',
    '',
    '   Kernels are int8 (multiply by `kernels.scale`); biases are float32.',
    '   ============================================================ */',
    `export const HERO_SCAN = ${JSON.stringify(data, null, 2)};`,
    '',
    '/* Legacy bare-global read path, mirroring data/locations.js. */',
    'globalThis.HERO_SCAN = HERO_SCAN;',
    '',
  ];
  return lines.join('\n');
}

function main() {
  const out = render();
  const target = path.join(ROOT, OUT_FILE);
  if (DRY_RUN) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    process.stdout.write(
      current === out
        ? `${OUT_FILE} is up to date (${out.length} bytes)\n`
        : `${OUT_FILE} would change (${out.length} bytes)\n`);
    return;
  }
  fs.writeFileSync(target, out);
  const data = build();
  process.stdout.write(
    `wrote ${OUT_FILE} — ${data.kernels.count} conv1 kernels ` +
    `(${(out.length / 1024).toFixed(1)} KB source)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
