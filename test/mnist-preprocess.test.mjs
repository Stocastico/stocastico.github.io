/* Tests for js/mnist-preprocess.js.

   The headline test is the round trip: take a committed MNIST digit, blow it
   up to the size of the drawing canvas as if someone had drawn it, push it
   back through the pipeline, and require the result to be the original image
   again. That is a much stronger claim than "the output is 28×28", and it is
   the one that catches the failure this module exists to prevent — a centring
   convention that is off by half a pixel silently degrades every prediction.

   Everything here is pure array work; no DOM, no canvas. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  preprocessDigit, inkBounds, centreOfMass, resampleBox, grayFromImageData,
  FIELD, BOX, CENTRE,
} from '../js/mnist-preprocess.js';
import { createState, forward, argmax } from '../js/lenet.js';
import { loadModel } from '../data/lenet-weights.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = JSON.parse(readFileSync(resolve(ROOT, 'data/cnn-samples.json'), 'utf8')).samples;

const pixelsOf = (sample) => new Uint8Array(Buffer.from(sample.pixels, 'base64'));

/* Nearest-neighbour upscale — stands in for "the visitor drew this". */
function upscale(px, factor) {
  const w = FIELD * factor;
  const out = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = px[Math.floor(y / factor) * FIELD + Math.floor(x / factor)];
    }
  }
  return { grid: out, size: w };
}

/* ── Bounding box ────────────────────────────────────────────────────────── */

test('mnist-preprocess: inkBounds returns null for an empty grid', () => {
  assert.equal(inkBounds(new Uint8Array(100), 10, 10), null);
});

test('mnist-preprocess: inkBounds is tight around the ink', () => {
  const g = new Uint8Array(100);
  g[2 * 10 + 3] = 255;
  g[5 * 10 + 7] = 255;
  assert.deepEqual(inkBounds(g, 10, 10), { x0: 3, y0: 2, x1: 8, y1: 6 });
});

test('mnist-preprocess: inkBounds ignores the faint anti-aliased fringe', () => {
  const g = new Uint8Array(100);
  g[0] = 4;                 /* below threshold — a stroke's soft edge */
  g[5 * 10 + 5] = 255;
  assert.deepEqual(inkBounds(g, 10, 10), { x0: 5, y0: 5, x1: 6, y1: 6 });
});

/* ── Resampling ──────────────────────────────────────────────────────────── */

test('mnist-preprocess: resampleBox averages, it does not sample', () => {
  /* A 2×2 of 0/255/255/0 down to 1×1 must give the mean, 127.5 — a
     nearest-neighbour implementation would give 0 or 255. */
  const src = new Uint8Array([0, 255, 255, 0]);
  const out = resampleBox(src, 2, { x0: 0, y0: 0, x1: 2, y1: 2 }, 1, 1);
  assert.ok(Math.abs(out[0] - 127.5) < 1e-6, `got ${out[0]}`);
});

test('mnist-preprocess: resampleBox at 1:1 is the identity', () => {
  const src = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const out = resampleBox(src, 3, { x0: 0, y0: 0, x1: 3, y1: 3 }, 3, 3);
  for (let i = 0; i < 9; i++) assert.ok(Math.abs(out[i] - src[i]) < 1e-6);
});

/* ── Centre of mass ──────────────────────────────────────────────────────── */

test('mnist-preprocess: centreOfMass weights by intensity', () => {
  const g = new Float32Array(4);
  g[0] = 100;   /* pixel (0,0), centre (0.5, 0.5) */
  g[1] = 300;   /* pixel (1,0), centre (1.5, 0.5) */
  const com = centreOfMass(g, 2, 2);
  assert.ok(Math.abs(com.x - 1.25) < 1e-6, `x=${com.x}`);
  assert.ok(Math.abs(com.y - 0.5) < 1e-6, `y=${com.y}`);
});

test('mnist-preprocess: centreOfMass returns null with no mass', () => {
  assert.equal(centreOfMass(new Float32Array(9), 3, 3), null);
});

/* ── Shape guarantees ────────────────────────────────────────────────────── */

test('mnist-preprocess: preprocessDigit returns null on a blank canvas', () => {
  assert.equal(preprocessDigit(new Uint8Array(280 * 280), 280, 280), null);
});

test('mnist-preprocess: output is always 784 bytes and fits the 20px box', () => {
  for (const sample of SAMPLES) {
    const { grid, size } = upscale(pixelsOf(sample), 10);
    const out = preprocessDigit(grid, size, size);
    assert.equal(out.length, FIELD * FIELD);
    assert.ok(Math.max(out.meta.boxW, out.meta.boxH) <= BOX,
      `digit ${sample.digit} exceeds the ${BOX}px box`);
    /* Never clipped: the pasted grid has to lie entirely inside the field. */
    assert.ok(out.meta.offsetX >= 0 && out.meta.offsetX + out.meta.boxW <= FIELD);
    assert.ok(out.meta.offsetY >= 0 && out.meta.offsetY + out.meta.boxH <= FIELD);
  }
});

test('mnist-preprocess: aspect ratio is preserved, never stretched to square', () => {
  /* A tall thin stroke — a '1'. Squaring it would be the classic bug. */
  const w = 100, h = 100;
  const g = new Uint8Array(w * h);
  for (let y = 20; y < 80; y++) for (let x = 48; x < 52; x++) g[y * w + x] = 255;
  const out = preprocessDigit(g, w, h);
  assert.equal(out.meta.boxH, BOX, 'long side should be scaled to the box');
  assert.ok(out.meta.boxW <= 2, `expected a thin result, got ${out.meta.boxW}px wide`);
});

/* ── The round trip ──────────────────────────────────────────────────────── */

test('mnist-preprocess: a real MNIST digit survives the round trip unchanged', () => {
  let exact = 0;
  let worstMeanError = 0;
  for (const sample of SAMPLES) {
    const original = pixelsOf(sample);
    const { grid, size } = upscale(original, 10);
    const out = preprocessDigit(grid, size, size);

    let total = 0;
    for (let i = 0; i < 784; i++) total += Math.abs(out[i] - original[i]);
    const mean = total / 784;
    if (total === 0) exact++;
    if (mean > worstMeanError) worstMeanError = mean;
  }
  /* MNIST's own normalisation is what this pipeline reimplements, so running
     it over an already-normalised digit has to be a no-op. Nine of the ten
     come back byte-for-byte; the tenth differs by rounding on a couple of
     pixels. With the centring off by half a pixel this figure is ~18. */
  assert.ok(exact >= 9, `only ${exact}/10 digits round-tripped exactly`);
  assert.ok(worstMeanError < 0.5,
    `worst mean absolute error ${worstMeanError.toFixed(2)}/255 — centring has drifted`);
});

test('mnist-preprocess: the model still reads every round-tripped digit correctly', () => {
  const model = loadModel();
  const state = createState();
  for (const sample of SAMPLES) {
    const { grid, size } = upscale(pixelsOf(sample), 10);
    forward(model, preprocessDigit(grid, size, size), state);
    assert.equal(argmax(state.probs), sample.digit,
      `round-tripped ${sample.digit} was read as ${argmax(state.probs)}`);
  }
});

test('mnist-preprocess: centring targets the centre of pixel 14, not 14.0', () => {
  /* Pinning the constant, because it is the single value that quietly breaks
     everything and reads like an off-by-one when it is correct. */
  assert.equal(CENTRE, 14.5);
});

/* ── Canvas adapter ──────────────────────────────────────────────────────── */

test('mnist-preprocess: grayFromImageData reads the alpha channel', () => {
  /* Two opaque-but-differently-coloured pixels must produce identical ink, so
     that a palette switch cannot change what the model sees. */
  const imageData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]),
  };
  const { gray, width, height } = grayFromImageData(imageData);
  assert.equal(width, 2);
  assert.equal(height, 1);
  assert.deepEqual(Array.from(gray), [255, 128]);
});
