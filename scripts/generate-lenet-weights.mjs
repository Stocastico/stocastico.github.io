#!/usr/bin/env node
/* ============================================================
   generate-lenet-weights.mjs
   --------------------------------------------------------------
   data/cnn-model.json  ->  data/lenet-weights.js

   The trained model is committed as float32 (237 KB of JSON), which is the
   right format for the training pipeline and much too heavy to hand to a
   browser. This quantises the five weight tensors to **int8 with a per-tensor
   symmetric scale** and leaves the five bias vectors in float32 — biases are
   236 numbers in total, so keeping them exact costs ~1 KB and removes the one
   quantisation error that shifts a whole channel at once.

   Result: ~59 KB of ESM source (~44 KB of actual payload), imported *only* by
   projects/mnist-lenet.html, and only after the visitor has drawn something.
   The homepage still ships zero weights — it replays precomputed activations
   from data/cnn-activations.js.

   The generator is deterministic and network-free: it reads two committed
   files and writes one. `test/lenet-weights.test.mjs` regenerates and fails
   on drift, and separately checks that the quantised model still agrees with
   the float32 model on the ten committed MNIST samples.

   Usage:
     node scripts/generate-lenet-weights.mjs [--dry-run] [--help]
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PARAM_KEYS, createState, forward, argmax, deserializeModel, f32ToBase64,
} from './lib/lenet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const MODEL_PATH = resolve(ROOT, 'data/cnn-model.json');
const SAMPLES_PATH = resolve(ROOT, 'data/cnn-samples.json');
const OUT_PATH = resolve(ROOT, 'data/lenet-weights.js');

/* Weight tensors get int8; bias vectors stay float32. */
const WEIGHT_KEYS = ['w1', 'w2', 'w3', 'w4', 'w5'];
const BIAS_KEYS = ['b1', 'b2', 'b3', 'b4', 'b5'];

/* ── Quantisation ────────────────────────────────────────────────────────── */

/* Symmetric per-tensor int8: scale = max|v| / 127, so 0 maps exactly to 0 and
   the extremes land on ±127. Asymmetric (zero-point) quantisation would buy
   nothing here — every tensor is a roughly zero-centred weight distribution. */
export function quantizeInt8(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    const a = Math.abs(values[i]);
    if (a > max) max = a;
  }
  /* An all-zero tensor has no scale; use 1 so dequantisation is a no-op. */
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

export function dequantizeInt8(q, scale) {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] * scale;
  return out;
}

function int8ToBase64(q) {
  return Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString('base64');
}

/* ── Build ───────────────────────────────────────────────────────────────── */

export function buildQuantized(modelJson) {
  const model = deserializeModel(modelJson);
  const scales = {};
  const weights = {};
  const biases = {};
  const dequantized = {};
  let count = 0;

  for (const key of WEIGHT_KEYS) {
    const { scale, q } = quantizeInt8(model[key]);
    scales[key] = scale;
    weights[key] = int8ToBase64(q);
    dequantized[key] = dequantizeInt8(q, scale);
    count += q.length;
  }
  for (const key of BIAS_KEYS) {
    biases[key] = f32ToBase64(model[key]);
    dequantized[key] = model[key];
    count += model[key].length;
  }

  return { model, scales, weights, biases, dequantized, count };
}

/* Replay the ten committed MNIST samples through both the float32 and the
   quantised model. This is the whole offline accuracy check we can do — MNIST
   itself lives in .cache/ and is not committed, deliberately, so the generator
   stays runnable in CI. */
export function compareOnSamples(floatModel, quantModel, samples) {
  const fs_ = createState();
  const qs = createState();
  let agree = 0;
  let maxProbDelta = 0;

  for (const sample of samples) {
    const pixels = new Uint8Array(Buffer.from(sample.pixels, 'base64'));
    forward(floatModel, pixels, fs_);
    forward(quantModel, pixels, qs);
    if (argmax(fs_.probs) === argmax(qs.probs)) agree++;
    for (let i = 0; i < 10; i++) {
      const d = Math.abs(fs_.probs[i] - qs.probs[i]);
      if (d > maxProbDelta) maxProbDelta = d;
    }
  }

  return { total: samples.length, agree, maxProbDelta };
}

function render({ modelJson, scales, weights, biases, count, check }) {
  const lines = [];
  const push = (s) => lines.push(s);

  push('/* --------------------------------------------------------------------------');
  push('   LeNet-5 weights, quantised for the browser');
  push('   GENERATED by scripts/generate-lenet-weights.mjs — do not edit by hand.');
  push('');
  push('   Run:  npm run generate-lenet-weights');
  push('');
  push(`   Source:      data/cnn-model.json (float32, ${modelJson.arch})`);
  push(`   Parameters:  ${count.toLocaleString('en-GB').replace(/,/g, ' ')}`);
  push(`   Test acc.:   ${(modelJson.testAccuracy * 100).toFixed(2)}% (float32, full MNIST test split)`);
  push('');
  push('   The five weight tensors are int8 with a per-tensor symmetric scale');
  push('   (value = int8 * scale); the five bias vectors stay float32 because they');
  push('   are only 236 numbers and a quantised bias shifts an entire channel.');
  push('');
  push(`   Quantisation cost, measured on the ten committed samples:`);
  push(`     predictions unchanged: ${check.agree}/${check.total}`);
  push(`     max |Δp| across all classes: ${check.maxProbDelta.toExponential(2)}`);
  push('');
  push('   Imported only by js/mnist-lab.js (projects/mnist-lenet.html), behind a');
  push('   dynamic import. No other page downloads any of this.');
  push('-------------------------------------------------------------------------- */');
  push('');
  push('export const LENET = {');
  push(`  arch: ${JSON.stringify(modelJson.arch)},`);
  push(`  params: ${count},`);
  push(`  testAccuracy: ${modelJson.testAccuracy},`);
  push(`  epochs: ${modelJson.epochs},`);
  push("  quant: 'int8-per-tensor',");
  push('  /* int8 tensors: value = byte * scale */');
  push('  scales: {');
  for (const key of WEIGHT_KEYS) push(`    ${key}: ${scales[key]},`);
  push('  },');
  push('  weights: {');
  for (const key of WEIGHT_KEYS) push(`    ${key}: '${weights[key]}',`);
  push('  },');
  push('  /* float32 little-endian */');
  push('  biases: {');
  for (const key of BIAS_KEYS) push(`    ${key}: '${biases[key]}',`);
  push('  },');
  push('};');
  push('');
  push('/* base64 -> Int8Array (weights) */');
  push('function decodeInt8(b64) {');
  push('  const bin = atob(b64);');
  push('  const out = new Int8Array(bin.length);');
  push('  for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;');
  push('  return out;');
  push('}');
  push('');
  push('/* base64 -> Float32Array (biases), little-endian */');
  push('function decodeFloat32(b64) {');
  push('  const bin = atob(b64);');
  push('  const bytes = new Uint8Array(bin.length);');
  push('  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);');
  push('  return new Float32Array(bytes.buffer);');
  push('}');
  push('');
  push('/* Dequantise into the { w1, b1, ... } bag js/lenet.js forward() expects.');
  push('   Called once per page load; ~44 k multiplications, well under a frame. */');
  push('export function loadModel() {');
  push('  const m = {};');
  push('  for (const key of Object.keys(LENET.weights)) {');
  push('    const q = decodeInt8(LENET.weights[key]);');
  push('    const scale = LENET.scales[key];');
  push('    const out = new Float32Array(q.length);');
  push('    for (let i = 0; i < q.length; i++) out[i] = q[i] * scale;');
  push('    m[key] = out;');
  push('  }');
  push('  for (const key of Object.keys(LENET.biases)) m[key] = decodeFloat32(LENET.biases[key]);');
  push('  return m;');
  push('}');
  push('');

  return lines.join('\n');
}

/* ── Public entry point (also used by the test) ──────────────────────────── */

export function generate() {
  const modelJson = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
  const samplesJson = JSON.parse(readFileSync(SAMPLES_PATH, 'utf8'));

  const built = buildQuantized(modelJson);
  const check = compareOnSamples(built.model, built.dequantized, samplesJson.samples);

  return {
    source: render({ modelJson, ...built, check }),
    check,
    count: built.count,
  };
}

export const OUTPUT_PATH = OUT_PATH;

/* ── CLI ─────────────────────────────────────────────────────────────────── */

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage: node scripts/generate-lenet-weights.mjs [options]

Quantises data/cnn-model.json to int8 and writes data/lenet-weights.js,
the module the interactive MNIST page imports.

Options:
  --dry-run     Print a summary without writing the file
  -h, --help    Show this help
`);
    return;
  }

  const { source, check, count } = generate();
  const rel = relative(process.cwd(), OUT_PATH);

  console.log(`Parameters:       ${count}`);
  console.log(`Output size:      ${(Buffer.byteLength(source) / 1024).toFixed(1)} KB of ESM source`);
  console.log(`Sample agreement: ${check.agree}/${check.total} predictions unchanged`);
  console.log(`Max |Δp|:         ${check.maxProbDelta.toExponential(3)}`);

  if (argv.includes('--dry-run')) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  writeFileSync(OUT_PATH, source, 'utf8');
  console.log(`\nWrote: ${rel}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
