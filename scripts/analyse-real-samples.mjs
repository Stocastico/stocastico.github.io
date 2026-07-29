#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   analyse-real-samples.mjs — measure the digits that actually fail.

   scripts/diagnose-mnist-domain.mjs falsified eight hypotheses using strokes I
   generated, and every one of them came back clean. This reads the real thing:
   a capture dump of {meant, read, png} taken from the live widget by the person
   whose handwriting the model gets wrong.

   The PNG is the raw drawing surface, so everything downstream is the code that
   ships — Chromium decodes the image (no image library, and no chance of a
   decoder that disagrees with the browser's), and js/mnist-preprocess.js turns
   it into the 28×28 the model reads.

   The comparison that matters is not "real vs MNIST" but three-way:
   real-and-wrong vs real-and-right vs MNIST. A measure that separates the first
   two is a *cause*; a measure where real digits differ from MNIST but the
   correct and incorrect ones agree is just a property of the input device.

   Usage: node scripts/analyse-real-samples.mjs <dump.json>
   ───────────────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../test/e2e/harness.mjs';
import { preprocessDigit, grayFromImageData, FIELD } from '../js/mnist-preprocess.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('usage: node scripts/analyse-real-samples.mjs <dump.json>');
  process.exit(1);
}

const INK = 8;

/* ─── Measures (identical to diagnose-mnist-domain.mjs) ──────────────────── */

const coverage = (px) => { let n = 0; for (const v of px) if (v > INK) n++; return n / px.length; };
const meanInk = (px) => {
  let s = 0, n = 0;
  for (const v of px) if (v > INK) { s += v; n++; }
  return n ? s / n : 0;
};
function strokeWidth(px) {
  const runs = [];
  for (let y = 0; y < FIELD; y++) {
    let run = 0;
    for (let x = 0; x < FIELD; x++) {
      if (px[y * FIELD + x] > INK) run++;
      else if (run) { runs.push(run); run = 0; }
    }
    if (run) runs.push(run);
  }
  if (!runs.length) return 0;
  runs.sort((a, b) => a - b);
  return runs[runs.length >> 1];
}
const softness = (px) => {
  let mid = 0, ink = 0;
  for (const v of px) if (v > INK) { ink++; if (v < 200) mid++; }
  return ink ? mid / ink : 0;
};
function bbox(px) {
  let x0 = FIELD, y0 = FIELD, x1 = -1, y1 = -1;
  for (let y = 0; y < FIELD; y++) for (let x = 0; x < FIELD; x++) {
    if (px[y * FIELD + x] > INK) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { w: 0, h: 0 } : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function centroid(px) {
  let sx = 0, sy = 0, s = 0;
  for (let y = 0; y < FIELD; y++) for (let x = 0; x < FIELD; x++) {
    const v = px[y * FIELD + x];
    if (v > 0) { sx += x * v; sy += y * v; s += v; }
  }
  return s ? { x: sx / s, y: sy / s } : { x: 0, y: 0 };
}
/* Aspect of the ink before preprocessing normalises it — preprocessing fits the
   longest side to 20, so a digit drawn wide loses height and vice versa. */
const aspect = (px) => { const b = bbox(px); return b.h ? b.w / b.h : 0; };

function measure(px) {
  return {
    coverage: coverage(px), meanInk: meanInk(px), stroke: strokeWidth(px),
    softness: softness(px), aspect: aspect(px), box: bbox(px), com: centroid(px),
  };
}

/* ─── Decode the captured PNGs through the browser ───────────────────────── */

async function decode(samples) {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.goto('about:blank');
    const out = [];
    for (const s of samples) {
      const raw = await page.evaluate(async (dataUrl) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        return { data: Array.from(d.data), width: d.width, height: d.height };
      }, s.png);
      const { gray, width, height } = grayFromImageData({
        data: Uint8ClampedArray.from(raw.data), width: raw.width, height: raw.height,
      });
      const pixels = preprocessDigit(gray, width, height);
      out.push({ ...s, pixels, canvas: `${raw.width}×${raw.height}` });
    }
    return out;
  } finally {
    await page.close();
    await browser.close();
  }
}

function mnistSamples() {
  const { samples } = JSON.parse(readFileSync(join(ROOT, 'data/cnn-samples.json'), 'utf8'));
  return samples.map((s) => ({
    digit: s.digit, pixels: Uint8Array.from(Buffer.from(s.pixels, 'base64')),
  }));
}

/* ─── Report ─────────────────────────────────────────────────────────────── */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const raw = JSON.parse(readFileSync(dumpPath, 'utf8'));
const decoded = await decode(raw);
for (const s of decoded) s.m = measure(s.pixels);

const right = decoded.filter((s) => String(s.meant) === String(s.read));
const wrong = decoded.filter((s) => String(s.meant) !== String(s.read));
const mnist = mnistSamples().map((s) => ({ ...s, m: measure(s.pixels) }));

console.log('Real captured samples');
console.log('=====================');
console.log(`${decoded.length} samples, ${wrong.length} misread — accuracy ${pct(right.length / decoded.length)}`);
console.log(`drawing surface: ${[...new Set(decoded.map((s) => s.canvas))].join(', ')}`);

console.log('\nConfusions (meant → read, count)');
const conf = new Map();
for (const s of wrong) {
  const k = `${s.meant} → ${s.read}`;
  conf.set(k, (conf.get(k) ?? 0) + 1);
}
for (const [k, n] of [...conf].sort((a, b) => b[1] - a[1])) console.log(`  ${k}   ×${n}`);

console.log('\nPer-digit accuracy');
for (let d = 0; d <= 9; d++) {
  const all = decoded.filter((s) => String(s.meant) === String(d));
  if (!all.length) continue;
  const ok = all.filter((s) => String(s.read) === String(d)).length;
  const bar = '█'.repeat(ok) + '░'.repeat(all.length - ok);
  console.log(`  ${d}  ${String(ok).padStart(2)}/${String(all.length).padEnd(2)}  ${bar}`);
}

console.log('\nThe three-way comparison — a cause must separate wrong from right');
console.log('  measure       MNIST    real-right  real-wrong   wrong/right');
const row = (name, f, fmt = (v) => v.toFixed(2)) => {
  const a = mean(mnist.map(f)), b = mean(right.map(f)), c = mean(wrong.map(f));
  console.log(`  ${name.padEnd(12)} ${fmt(a).padStart(7)}  ${fmt(b).padStart(10)}  ${fmt(c).padStart(10)}   ${(c / b).toFixed(2)}×`);
};
row('coverage', (s) => s.m.coverage, pct);
row('meanInk', (s) => s.m.meanInk, (v) => v.toFixed(0));
row('stroke(px)', (s) => s.m.stroke);
row('softness', (s) => s.m.softness, pct);
row('aspect w/h', (s) => s.m.aspect);
row('box w', (s) => s.m.box.w, (v) => v.toFixed(1));
row('box h', (s) => s.m.box.h, (v) => v.toFixed(1));
row('com x', (s) => s.m.com.x, (v) => v.toFixed(2));
row('com y', (s) => s.m.com.y, (v) => v.toFixed(2));

/* Render the worst confusion, next to the MNIST digit it should have matched. */
const RAMP = ' .:-=+*#%@';
const render = (px) => Array.from({ length: FIELD }, (_, y) =>
  Array.from({ length: FIELD }, (_, x) => RAMP[Math.min(9, Math.floor(px[y * FIELD + x] / 26))]).join(''));

const worst = [...conf].sort((a, b) => b[1] - a[1])[0]?.[0];
if (worst) {
  const [meant] = worst.split(' → ');
  const bad = wrong.find((s) => `${s.meant} → ${s.read}` === worst);
  const good = right.find((s) => String(s.meant) === meant);
  const ref = mnist.find((s) => String(s.digit) === meant);
  console.log(`\nWorst confusion: ${worst}`);
  console.log('  MNIST reference          drawn & correct          drawn & misread');
  const a = ref ? render(ref.pixels) : Array(FIELD).fill(' '.repeat(FIELD));
  const b = good ? render(good.pixels) : Array(FIELD).fill(' '.repeat(FIELD));
  const c = render(bad.pixels);
  for (let y = 0; y < FIELD; y++) console.log(`  ${a[y]}  ${b[y]}  ${c[y]}`);
}
