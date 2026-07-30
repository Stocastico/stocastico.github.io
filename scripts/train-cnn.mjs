#!/usr/bin/env node
/* ============================================================
   train-cnn
   --------------------------------------------------------------
   Trains the small LeNet-5 in scripts/lib/lenet.mjs on MNIST and writes:

     data/cnn-model.json    the trained weights (base64 float32) + metadata
     data/cnn-samples.json  ten test digits (one per class) the hero cycles through

   This is a one-off, run-by-hand step — it downloads ~11 MB of MNIST into
   .cache/mnist/ (gitignored) and takes a few minutes of pure-JS CPU. Neither
   the dataset nor any ML library ever ships to the browser: only the
   activations produced later by `generate-cnn-activations` do.

   Run:  node scripts/train-cnn.mjs [--epochs 8] [--train 60000] [--seed 1337]
                                    [--lr 0.05] [--decay 0.68] [--batch 32]
                                    [--pick-only] [--dry-run]
                                    [--real-train f1.json,f2.json]
                                    [--real-oversample 50]
                                    [--real-eval test/fixtures/real-digits.json]

   --pick-only reuses the committed weights and only re-chooses the ten
   showcase digits, skipping the training run.

   --real-train mixes captured real digits (fixtures produced by
   scripts/ingest-digit-capture.mjs) into MNIST, oversampled, to close the
   domain gap between MNIST's scanned pen strokes and a mouse on a canvas.
   --real-eval names the held-out fixture reported each epoch, and the script
   refuses to train on it. Splitting those two by *capture session* is the
   point: samples from one hand in one sitting are not independent.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  createModel, createState, createGrads, createBackState, zeroGrads,
  forward, backward, argmax, serializeModel, deserializeModel, PARAM_KEYS, rng,
} from './lib/lenet.mjs';
import { augment, DEFAULT_AUG } from './lib/augment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'mnist');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'Usage: node scripts/train-cnn.mjs [--epochs N] [--train N] [--seed N] ' +
    '[--lr F] [--decay F] [--batch N] [--pick-only] [--dry-run]\n' +
    '       [--real-train a.json,b.json] [--real-oversample N] [--real-eval f.json]\n' +
    '       [--checkpoint f.json] [--resume f.json]\n');
  process.exit(0);
}
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const DRY_RUN = args.includes('--dry-run');
const PICK_ONLY = args.includes('--pick-only');
const EPOCHS = flag('epochs', 8);
/* Augmentation is on by default — the whole point of this revision. --no-augment
   reproduces the previous model for comparison. */
const AUGMENT = !args.includes('--no-augment');
const N_TRAIN = flag('train', 60000);
const SEED = flag('seed', 1337);
/* Real captured digits mixed into the training set — see mixRealDigits(). Off
   unless asked for, so the committed config stays reproducible from its seed. */
const strFlag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const REAL_TRAIN = strFlag('real-train', '');
const REAL_OVERSAMPLE = flag('real-oversample', 50);
const REAL_EVAL = strFlag('real-eval', 'test/fixtures/real-digits.json');
const LR0 = flag('lr', 0.05);
const DECAY = flag('decay', 0.68);
const BATCH = flag('batch', 32);
/* Checkpoint / resume. A full run is ~35s per epoch, which puts eighteen epochs
   past the ten-minute-per-command ceiling of the sandbox this was trained in, so
   a run has to be splittable. The checkpoint carries the momentum buffers as
   well as the weights: SGD with momentum 0.9 keeps most of a step's magnitude in
   `velocity`, and resuming from weights alone restarts from a dead stop — the
   epoch after the seam trains visibly worse than the one before it. Epoch order
   and augmentation are reseeded per epoch from (SEED, epoch), so a run split
   across N invocations produces the same model as one that ran straight through. */
const CHECKPOINT = strFlag('checkpoint', '');
const RESUME = strFlag('resume', '');

/* MNIST mirror maintained by the CVDF (same bytes as the original LeCun
   distribution, which has been rate-limiting direct downloads for years). */
const BASE = 'https://storage.googleapis.com/cvdf-datasets/mnist';
const FILES = {
  trainImages: 'train-images-idx3-ubyte.gz',
  trainLabels: 'train-labels-idx1-ubyte.gz',
  testImages: 't10k-images-idx3-ubyte.gz',
  testLabels: 't10k-labels-idx1-ubyte.gz',
};

async function fetchIdx(name) {
  fs.mkdirSync(CACHE, { recursive: true });
  const gz = path.join(CACHE, name);
  if (!fs.existsSync(gz)) {
    process.stdout.write(`  downloading ${name}…\n`);
    const res = await fetch(`${BASE}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(gz, Buffer.from(await res.arrayBuffer()));
  }
  return zlib.gunzipSync(fs.readFileSync(gz));
}

/* IDX format: 4-byte magic (last byte = number of dimensions), then one
   big-endian int32 per dimension, then the raw uint8 payload. */
function parseIdx(buf) {
  const dims = buf[3];
  let offset = 4;
  const shape = [];
  for (let d = 0; d < dims; d++) { shape.push(buf.readInt32BE(offset)); offset += 4; }
  return { shape, data: new Uint8Array(buf.subarray(offset)) };
}

async function loadSplit(imagesFile, labelsFile) {
  const images = parseIdx(await fetchIdx(imagesFile));
  const labels = parseIdx(await fetchIdx(labelsFile));
  return { count: images.shape[0], pixels: images.data, labels: labels.data };
}

/* ── Mixing real captures into MNIST ──────────────────────────────────────
   77 real digits against 60 000 MNIST is 0.13% of the set: the gradient from
   them is noise and the model never sees the domain. Oversampling is what
   makes them count — and it is safe here only because augment() distorts every
   copy independently, so N repeats are N different images rather than the same
   image N times. Without augmentation this would just memorise 77 pictures.

   The eval fixture is refused as a training input. That check is the whole
   value of the held-out set: same-session data on both sides would report a
   number that means nothing, and it would look like success. */
function loadRealFixture(rel) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`real-digit fixture not found: ${rel}`);
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return { abs, writer: json.writer || 'unknown', samples: json.samples };
}

function mixRealDigits(train) {
  if (!REAL_TRAIN) return { train, note: null };
  const evalAbs = REAL_EVAL === 'none' ? null : path.resolve(ROOT, REAL_EVAL);
  const sets = REAL_TRAIN.split(',').map((s) => s.trim()).filter(Boolean).map(loadRealFixture);
  for (const s of sets) {
    if (path.resolve(s.abs) === evalAbs) {
      throw new Error(
        `refusing to train on ${REAL_EVAL}: it is the evaluation set.\n` +
        'Training and evaluating on the same captures reports a number that means nothing.');
    }
  }
  const extra = sets.reduce((n, s) => n + s.samples.length, 0) * REAL_OVERSAMPLE;
  const nBase = Math.min(N_TRAIN, train.count);
  const pixels = new Uint8Array((nBase + extra) * 784);
  const labels = new Uint8Array(nBase + extra);
  pixels.set(train.pixels.subarray(0, nBase * 784), 0);
  labels.set(train.labels.subarray(0, nBase), 0);
  let at = nBase;
  for (const set of sets) {
    for (const s of set.samples) {
      const px = Uint8Array.from(Buffer.from(s.pixels, 'base64'));
      for (let r = 0; r < REAL_OVERSAMPLE; r++) {
        pixels.set(px, at * 784);
        labels[at] = s.meant;
        at += 1;
      }
    }
  }
  const writers = [...new Set(sets.map((s) => s.writer))].join(', ');
  return {
    train: { count: at, pixels, labels },
    note: `  mixing ${extra} real-digit copies (${sets.reduce((n, s) => n + s.samples.length, 0)} ` +
          `captures × ${REAL_OVERSAMPLE}, writer: ${writers}) into ${nBase} MNIST — ` +
          `${((extra / at) * 100).toFixed(1)}% of the training set\n`,
  };
}

function evaluate(model, split, limit = split.count) {
  const s = createState();
  let correct = 0;
  for (let i = 0; i < limit; i++) {
    forward(model, split.pixels.subarray(i * 784, i * 784 + 784), s);
    if (argmax(s.probs) === split.labels[i]) correct++;
  }
  return correct / limit;
}

/* Pick one test digit per class for the hero to cycle through. Not the most
   confident one: at p = 1.0000 the softmax bar chart the hero draws is a
   single bar and nine invisible ones. Aiming just under that keeps the glyph
   clean and canonical while leaving a visible runner-up. */
const TARGET_CONFIDENCE = 0.985;

function pickSamples(model, split) {
  const s = createState();
  const best = Array.from({ length: 10 }, () => ({ index: -1, confidence: -1, distance: Infinity }));
  for (let i = 0; i < split.count; i++) {
    const label = split.labels[i];
    forward(model, split.pixels.subarray(i * 784, i * 784 + 784), s);
    if (argmax(s.probs) !== label) continue;
    const confidence = s.probs[label];
    const distance = Math.abs(confidence - TARGET_CONFIDENCE);
    if (distance < best[label].distance) best[label] = { index: i, confidence, distance };
  }
  return best.map((b, digit) => ({
    digit,
    testIndex: b.index,
    confidence: Number(b.confidence.toFixed(6)),
    pixels: Buffer.from(split.pixels.subarray(b.index * 784, b.index * 784 + 784))
      .toString('base64'),
  }));
}

function writeSamples(samples) {
  fs.writeFileSync(path.join(ROOT, 'data', 'cnn-samples.json'),
    JSON.stringify({ dataset: 'MNIST test split', samples }, null, 2) + '\n');
}

/* Re-pick the ten showcase digits against the already-trained weights,
   without spending another few minutes on training. */
async function pickOnly() {
  const test = await loadSplit(FILES.testImages, FILES.testLabels);
  const model = deserializeModel(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cnn-model.json'), 'utf8')));
  const samples = pickSamples(model, test);
  for (const s of samples) {
    process.stdout.write(`  ${s.digit}: test #${s.testIndex} · p=${s.confidence.toFixed(4)}\n`);
  }
  if (DRY_RUN) { process.stdout.write('  --dry-run: nothing written\n'); return; }
  writeSamples(samples);
  process.stdout.write('  wrote data/cnn-samples.json\n');
}

/* The held-out real digits — 45 samples captured from the live widget, the only
   set that ever disagreed with MNIST test accuracy. Reported every epoch and
   never trained on: MNIST validation says 98.5% while a visitor sees 60%, so a
   run that only watches `val` is watching the wrong number. */
let REAL = null;
function evaluateReal(model, state) {
  if (REAL === null) {
    if (REAL_EVAL === 'none') {
      REAL = [];
    } else {
      const f = path.isAbsolute(REAL_EVAL) ? REAL_EVAL : path.join(ROOT, REAL_EVAL);
      /* A mistyped path used to fall through to an empty set and print `n/a` for
         every epoch — indistinguishable from a run that was asked not to
         evaluate, and it silently removes the only check on the thing this
         revision exists for. Opting out is spelled `--real-eval none`. */
      if (!fs.existsSync(f)) {
        throw new Error(
          `real-eval fixture not found: ${REAL_EVAL}\n` +
          'Pass --real-eval none to train without a held-out capture set.');
      }
      REAL = JSON.parse(fs.readFileSync(f, 'utf8')).samples.map((s) => ({
        meant: s.meant, px: Uint8Array.from(Buffer.from(s.pixels, 'base64')),
      }));
    }
  }
  if (!REAL.length) return { ok: 0, n: 0, pct: '  n/a' };
  let ok = 0;
  for (const s of REAL) {
    forward(model, s.px, state);
    if (argmax(state.probs) === s.meant) ok++;
  }
  return { ok, n: REAL.length, pct: ((ok / REAL.length) * 100).toFixed(1) };
}

async function main() {
  process.stdout.write('LeNet-5 / MNIST — plain-JS trainer\n');
  if (PICK_ONLY) return pickOnly();
  let train = await loadSplit(FILES.trainImages, FILES.trainLabels);
  const test = await loadSplit(FILES.testImages, FILES.testLabels);
  process.stdout.write(`  train ${train.count} · test ${test.count}\n`);
  process.stdout.write(AUGMENT
    ? `  augmentation ON — break ${DEFAULT_AUG.breakP} affine ${DEFAULT_AUG.affineP} ` +
      `elastic ${DEFAULT_AUG.elasticP} thickness ${DEFAULT_AUG.thickP}\n`
    : '  augmentation OFF\n');

  const mixed = mixRealDigits(train);
  if (mixed.note) process.stdout.write(mixed.note);
  train = mixed.train;

  const nTrain = REAL_TRAIN ? train.count : Math.min(N_TRAIN, train.count);
  const model = createModel(SEED);
  const grads = createGrads();
  const velocity = {};
  for (const k of PARAM_KEYS) velocity[k] = new Float32Array(model[k].length);
  const state = createState();
  const back = createBackState();

  const order = new Int32Array(nTrain);
  for (let i = 0; i < nTrain; i++) order[i] = i;

  const MOMENTUM = 0.9;
  const t0 = Date.now();

  let startEpoch = 0;
  if (RESUME) {
    const ck = JSON.parse(fs.readFileSync(path.resolve(ROOT, RESUME), 'utf8'));
    for (const k of PARAM_KEYS) {
      model[k].set(ck.model[k]);
      velocity[k].set(ck.velocity[k]);
    }
    startEpoch = ck.epoch;
    process.stdout.write(
      `  resumed from ${RESUME} — ${startEpoch} epoch(s) already done\n`);
  }

  for (let epoch = startEpoch; epoch < EPOCHS; epoch++) {
    /* Reseeded from (SEED, epoch) rather than once per run: a run split at an
       epoch boundary then draws the same order and the same distortions as one
       that never stopped. A single run-long stream could not be picked back up
       without also serialising the PRNG's internal state. */
    const rand = rng((SEED ^ 0x9e3779b9) + epoch * 0x85ebca6b);
    /* Fisher-Yates with the seeded PRNG so a rerun reproduces the same model. */
    for (let i = nTrain - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    /* Geometric step decay — enough late-epoch fine-tuning to clear 99%. */
    const lr = LR0 * Math.pow(DECAY, epoch);
    let loss = 0, seen = 0;

    for (let b = 0; b < nTrain; b += BATCH) {
      const size = Math.min(BATCH, nTrain - b);
      zeroGrads(grads);
      for (let k = 0; k < size; k++) {
        const i = order[b + k];
        const src = train.pixels.subarray(i * 784, i * 784 + 784);
        forward(model, AUGMENT ? augment(src, rand) : src, state);
        loss += backward(model, state, grads, back, train.labels[i]);
      }
      const scale = lr / size;
      for (const key of PARAM_KEYS) {
        const p = model[key], g = grads[key], v = velocity[key];
        for (let i = 0; i < p.length; i++) {
          v[i] = MOMENTUM * v[i] - scale * g[i];
          p[i] += v[i];
        }
      }
      seen += size;
      if (seen % 6400 === 0) {
        const pct = ((seen / nTrain) * 100).toFixed(0).padStart(3);
        process.stdout.write(
          `  epoch ${epoch + 1}/${EPOCHS} ${pct}%  loss ${(loss / seen).toFixed(4)}\r`);
      }
    }
    const acc = evaluate(model, test, 2000);
    const real = evaluateReal(model, state);
    process.stdout.write(
      `  epoch ${epoch + 1}/${EPOCHS} done · loss ${(loss / seen).toFixed(4)} · ` +
      `val ${(acc * 100).toFixed(2)}% · real ${real.pct}% (${real.ok}/${real.n}) · ` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

    if (CHECKPOINT) {
      const ck = { epoch: epoch + 1, model: {}, velocity: {} };
      for (const k of PARAM_KEYS) {
        ck.model[k] = Array.from(model[k]);
        ck.velocity[k] = Array.from(velocity[k]);
      }
      fs.writeFileSync(path.resolve(ROOT, CHECKPOINT), JSON.stringify(ck));
    }
  }

  const accuracy = evaluate(model, test);
  process.stdout.write(`  final test accuracy: ${(accuracy * 100).toFixed(2)}%\n`);

  const samples = pickSamples(model, test);
  const modelJson = serializeModel(model, {
    dataset: 'MNIST',
    trainedOn: nTrain,
    epochs: EPOCHS,
    augment: AUGMENT ? DEFAULT_AUG : null,
    seed: SEED,
    lr: LR0,
    lrDecay: DECAY,
    batch: BATCH,
    testAccuracy: Number(accuracy.toFixed(4)),
  });

  if (DRY_RUN) {
    process.stdout.write('  --dry-run: nothing written\n');
    return;
  }
  fs.writeFileSync(path.join(ROOT, 'data', 'cnn-model.json'),
    JSON.stringify(modelJson) + '\n');
  writeSamples(samples);
  process.stdout.write('  wrote data/cnn-model.json + data/cnn-samples.json\n');
  process.stdout.write('  next: npm run generate-cnn-activations\n');
}

main().catch((err) => {
  process.stderr.write(`train-cnn failed: ${err.message}\n`);
  process.exit(1);
});
