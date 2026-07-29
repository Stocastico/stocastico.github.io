#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   eval-preprocess-variants.mjs — can the real failures be fixed before the model?

   The contact sheet of the 45 captured samples shows one thing over and over:
   the digits the model gets wrong are the ones whose loops did not close. A 0
   drawn as a C reads as 3 or 2; a 6 whose bowl never meets its stem reads as 5;
   an 8 with a gap in one loop reads as 2 or 3. Digits of the same classes with
   closed loops are read correctly.

   That is a topology problem, and it explains why every statistical measure in
   analyse-real-samples.mjs failed to separate right from wrong — coverage, ink,
   stroke width and centre of mass are all blind to whether a curve joins up.

   Closing a gap is exactly what a morphological closing does, and a thicker pen
   does it too. Both are preprocessing changes, so if either works the fix costs
   no retraining and no new data. This measures them against the real samples —
   the only yardstick that has reproduced the failure.

   Every variant runs the shipped forward pass (js/lenet.js) against the shipped
   int8 weights, so an accuracy here is the accuracy a visitor would get.

   Usage: node scripts/eval-preprocess-variants.mjs <dump.json>
   ───────────────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';

import { launchBrowser } from '../test/e2e/harness.mjs';
import { preprocessDigit, grayFromImageData } from '../js/mnist-preprocess.js';
import { createState, forward, argmax } from '../js/lenet.js';
import { loadModel } from '../data/lenet-weights.js';

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('usage: node scripts/eval-preprocess-variants.mjs <dump.json>');
  process.exit(1);
}

/* ─── Morphology on the raw drawing surface ──────────────────────────────── */

/* Separable max filter — a square structuring element, which is what a round
   pen nib approximates well enough at this scale and costs O(n) rather than
   O(n·r²). */
function maxFilter(src, w, h, r) {
  if (r <= 0) return src;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w) { const v = src[y * w + xx]; if (v > m) m = v; }
      }
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h) { const v = tmp[yy * w + x]; if (v > m) m = v; }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

function minFilter(src, w, h, r) {
  if (r <= 0) return src;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < w) { const v = src[y * w + xx]; if (v < m) m = v; }
      }
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < h) { const v = tmp[yy * w + x]; if (v < m) m = v; }
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

const dilate = (g, w, h, r) => maxFilter(g, w, h, r);
/* Closing: dilate then erode by the same radius. Bridges gaps narrower than
   2r while leaving stroke width essentially unchanged — which is the point,
   since the statistics said stroke width is not what distinguishes a failure. */
const close = (g, w, h, r) => minFilter(maxFilter(g, w, h, r), w, h, r);

const VARIANTS = [
  { name: 'baseline (shipping)', fn: (g, w, h) => g },
  { name: 'dilate r=2',          fn: (g, w, h) => dilate(g, w, h, 2) },
  { name: 'dilate r=4',          fn: (g, w, h) => dilate(g, w, h, 4) },
  { name: 'dilate r=6',          fn: (g, w, h) => dilate(g, w, h, 6) },
  { name: 'close r=4',           fn: (g, w, h) => close(g, w, h, 4) },
  { name: 'close r=8',           fn: (g, w, h) => close(g, w, h, 8) },
  { name: 'close r=12',          fn: (g, w, h) => close(g, w, h, 12) },
  { name: 'close r=16',          fn: (g, w, h) => close(g, w, h, 16) },
  { name: 'close r=12 + dil r=2', fn: (g, w, h) => dilate(close(g, w, h, 12), w, h, 2) },
];

/* ─── Decode once, evaluate many ─────────────────────────────────────────── */

const raw = JSON.parse(readFileSync(dumpPath, 'utf8'));
const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto('about:blank');

const samples = [];
for (const s of raw) {
  const r = await page.evaluate(async (u) => {
    const img = new Image(); img.src = u; await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    return { data: Array.from(d.data), width: d.width, height: d.height };
  }, s.png);
  const { gray, width, height } = grayFromImageData({
    data: Uint8ClampedArray.from(r.data), width: r.width, height: r.height,
  });
  samples.push({ meant: String(s.meant), gray, width, height });
}
await browser.close();

const model = loadModel();
const state = createState();

function evaluate(variant) {
  let ok = 0;
  const wrong = [];
  for (const s of samples) {
    const g = variant.fn(s.gray, s.width, s.height);
    const px = preprocessDigit(g, s.width, s.height);
    if (!px) { wrong.push(`${s.meant}→∅`); continue; }
    forward(model, px, state);
    const read = String(argmax(state.probs));
    if (read === s.meant) ok++;
    else wrong.push(`${s.meant}→${read}`);
  }
  return { ok, n: samples.length, wrong };
}

console.log('Preprocessing variants against the 45 real captured digits');
console.log('=========================================================');
console.log('  variant                  accuracy        misreads');
const results = [];
for (const v of VARIANTS) {
  const r = evaluate(v);
  results.push({ name: v.name, ...r });
  const pct = ((r.ok / r.n) * 100).toFixed(1);
  const counts = new Map();
  for (const w of r.wrong) counts.set(w, (counts.get(w) ?? 0) + 1);
  const summary = [...counts].sort((a, b) => b[1] - a[1])
    .map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(' ');
  console.log(`  ${v.name.padEnd(24)} ${String(r.ok).padStart(2)}/${r.n}  ${pct.padStart(5)}%   ${summary}`);
}

const best = results.reduce((a, b) => (b.ok > a.ok ? b : a));
const base = results[0];
console.log(`\nbest: ${best.name} — ${best.ok}/${best.n} vs baseline ${base.ok}/${base.n} ` +
  `(${best.ok > base.ok ? '+' : ''}${best.ok - base.ok} digits)`);

/* A preprocessing change has to not break what already works. MNIST's own test
   digits are the regression check: they arrive already closed, so a closing
   should be a near-no-op on them. */
const { samples: mnistSamples } = JSON.parse(readFileSync(new URL('../data/cnn-samples.json', import.meta.url), 'utf8'));
console.log('\nRegression on the committed MNIST test digits (28×28, no raw canvas)');
console.log('  these arrive pre-rendered, so only variants that also work at 28×28 apply');
for (const v of VARIANTS) {
  let ok = 0;
  for (const s of mnistSamples) {
    const px0 = Uint8Array.from(Buffer.from(s.pixels, 'base64'));
    /* Scale the radius from the 280px drawing surface to the 28px field. */
    const r = Math.max(0, Math.round((v.name.match(/r=(\d+)/)?.[1] ?? 0) / 10));
    const px = v.name === 'baseline (shipping)' ? px0
      : v.name.startsWith('dilate') ? maxFilter(px0, 28, 28, r)
      : close(px0, 28, 28, r);
    forward(model, px, state);
    if (argmax(state.probs) === s.digit) ok++;
  }
  console.log(`  ${v.name.padEnd(24)} ${ok}/10`);
}
