#!/usr/bin/env node
/* ============================================================
   generate-cnn-activations
   --------------------------------------------------------------
   Replays ten MNIST forward passes through the trained LeNet-5 and bakes the
   activations into data/cnn-activations.js, which js/cnn-hero.js animates as
   the homepage hero background.

   The whole point of this step is that the browser never runs inference: the
   hero is a *player* for activations computed here, so the homepage ships no
   TensorFlow.js, no Three.js, and no weights — about 30 KB of uint8 data
   instead of several hundred KB of ML runtime.

   Inputs (committed, produced by `npm run train-cnn`):
     data/cnn-model.json     trained weights + test accuracy
     data/cnn-samples.json   ten test digits, one per class

   Deterministic: same inputs -> byte-identical output, which is what
   test/generate-cnn-activations.test.mjs asserts.

   Run:  node scripts/generate-cnn-activations.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createState, forward, argmax, deserializeModel, PARAM_KEYS } from './lib/lenet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
export const OUT_FILE = 'data/cnn-activations.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-cnn-activations.mjs [--dry-run]\n');
  process.exit(0);
}

/* ── What the hero draws ─────────────────────────────────────────────────────
   Pooling layers are deliberately absent: at hero scale a 12x12 pooled map is
   visually indistinguishable from the 24x24 conv map above it, so they are
   rendered as a labelled connector instead of a plane of their own. conv1 is
   stored 2x2-max-downsampled (24x24 -> 12x12); at the ~4px-per-cell the hero
   actually paints, the full map carries no extra information and costs 4x the
   bytes.                                                                      */
export const LAYERS = [
  { id: 'input', kind: 'map', label: 'input', detail: '28×28', maps: 1, w: 28, h: 28 },
  { id: 'conv1', kind: 'map', label: 'conv1', detail: '6@24×24', maps: 6, w: 12, h: 12, downsampled: 2 },
  { id: 'conv2', kind: 'map', label: 'conv2', detail: '16@8×8', maps: 16, w: 8, h: 8 },
  { id: 'fc1', kind: 'vector', label: 'fc1', detail: '120', n: 120 },
  { id: 'fc2', kind: 'vector', label: 'fc2', detail: '84', n: 84 },
  { id: 'out', kind: 'output', label: 'softmax', detail: '10', n: 10 },
];

const layerSize = (l) => (l.kind === 'map' ? l.maps * l.w * l.h : l.n);

/* 2x2 max-downsample of a `maps`-channel square feature map. */
function downsample(src, maps, inW, factor) {
  const outW = inW / factor;
  const out = new Float32Array(maps * outW * outW);
  for (let c = 0; c < maps; c++) {
    for (let y = 0; y < outW; y++) {
      for (let x = 0; x < outW; x++) {
        let best = -Infinity;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const v = src[c * inW * inW + (y * factor + dy) * inW + (x * factor + dx)];
            if (v > best) best = v;
          }
        }
        out[c * outW * outW + y * outW + x] = best;
      }
    }
  }
  return out;
}

/* Quantise to uint8 against a shared per-layer maximum so brightness stays
   comparable across the ten digits (a per-sample rescale would make every
   frame equally vivid and hide how differently the net responds). */
function quantise(values, max) {
  const out = new Uint8Array(values.length);
  const scale = max > 0 ? 255 / max : 0;
  for (let i = 0; i < values.length; i++) {
    const v = Math.round(values[i] * scale);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

const b64 = (u8) => Buffer.from(u8).toString('base64');

/* Signed [-1,1] -> uint8 with 128 as zero, for the conv1 kernels. */
function quantiseSigned(values) {
  let max = 0;
  for (const v of values) max = Math.max(max, Math.abs(v));
  const out = new Uint8Array(values.length);
  const scale = max > 0 ? 127 / max : 0;
  for (let i = 0; i < values.length; i++) out[i] = 128 + Math.round(values[i] * scale);
  return out;
}

export function build() {
  const modelMeta = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'cnn-model.json'), 'utf8'));
  const model = deserializeModel(modelMeta);
  const { samples } = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'cnn-samples.json'), 'utf8'));

  const state = createState();
  const raw = [];

  for (const sample of samples) {
    const pixels = new Uint8Array(Buffer.from(sample.pixels, 'base64'));
    forward(model, pixels, state);
    const predicted = argmax(state.probs);
    raw.push({
      digit: sample.digit,
      predicted,
      confidence: Number(state.probs[predicted].toFixed(4)),
      probs: Array.from(state.probs, (p) => Number(p.toFixed(4))),
      values: {
        input: Float32Array.from(pixels, (p) => p / 255),
        conv1: downsample(state.c1, 6, 24, 2),
        conv2: state.c2.slice(),
        fc1: state.h1.slice(),
        fc2: state.h2.slice(),
        out: state.probs.slice(),
      },
    });
  }

  /* One max per layer, shared by all ten samples. */
  const maxima = {};
  for (const layer of LAYERS) {
    let max = 0;
    for (const r of raw) for (const v of r.values[layer.id]) if (v > max) max = v;
    maxima[layer.id] = Number(max.toFixed(6));
  }

  const layers = [];
  let offset = 0;
  for (const layer of LAYERS) {
    const size = layerSize(layer);
    layers.push({ ...layer, offset, size, max: maxima[layer.id] });
    offset += size;
  }
  const stride = offset;

  const encoded = raw.map((r) => {
    const buf = new Uint8Array(stride);
    for (const layer of layers) {
      buf.set(quantise(r.values[layer.id], maxima[layer.id]), layer.offset);
    }
    return {
      digit: r.digit,
      predicted: r.predicted,
      confidence: r.confidence,
      probs: r.probs,
      data: b64(buf),
    };
  });

  return {
    meta: {
      arch: 'LeNet-5',
      dataset: 'MNIST',
      testAccuracy: modelMeta.testAccuracy,
      params: PARAM_KEYS.reduce((n, k) => n + model[k].length, 0),
      stride,
      note: 'Activations precomputed offline — the browser runs no inference.',
    },
    kernels: {
      count: 6, w: 5, h: 5,
      data: b64(quantiseSigned(model.w1)),
    },
    layers,
    samples: encoded,
  };
}

export function render() {
  const cnn = build();
  const lines = [
    '/* ============================================================',
    '   cnn-activations.js — GENERATED FILE, DO NOT EDIT',
    '   Regenerate with: npm run generate-cnn-activations',
    '',
    `   ${cnn.meta.arch} trained on ${cnn.meta.dataset} by scripts/train-cnn.mjs`,
    `   (${(cnn.meta.testAccuracy * 100).toFixed(2)}% test accuracy). Ten forward passes,`,
    '   one per class, quantised to uint8 and base64-packed — the hero animation',
    '   in js/cnn-hero.js replays these, it does not run the network.',
    '',
    '   Each sample\'s `data` is one base64 blob of `meta.stride` bytes; every',
    '   layer in `layers` gives the { offset, size } slice into it, plus the',
    '   `max` its uint8 values were scaled against.',
    '   ============================================================ */',
    `export const CNN = ${JSON.stringify(cnn, null, 2)};`,
    '',
    '/* Legacy bare-global read path, mirroring data/locations.js. */',
    'globalThis.CNN = CNN;',
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
  const cnn = build();
  process.stdout.write(
    `wrote ${OUT_FILE} — ${cnn.samples.length} digits × ${cnn.meta.stride} B ` +
    `(${(out.length / 1024).toFixed(1)} KB source)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
