#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   diagnose-mnist-domain.mjs — what does the widget actually feed the model?

   Before adding data or augmentation, establish whether the drawing canvas
   produces something MNIST-shaped at all. Training around a preprocessing bug
   would work — the model would learn to compensate — and we would never find
   out, because the only symptom is "it gets my sevens wrong".

   So: drive the real page in a real browser, pull the raw drawing surface out,
   run it through the **actual** preprocessing (js/mnist-preprocess.js is pure,
   so Node runs the identical code the browser does), and compare the result
   against the ten committed MNIST test digits on the measures that would
   explain a domain gap.

     · ink coverage        — how much of the 28×28 field is ink at all
     · stroke width        — mean horizontal run length through the digit
     · intensity histogram — MNIST's anti-aliased scans have a characteristic
                             spread; a canvas stroke tends to be more binary
     · edge softness       — fraction of ink in the mid-intensity band
     · bounding box        — preprocessing should land every digit in 20×20
     · centre of mass      — should sit on (14.5, 14.5)

   Usage: node scripts/diagnose-mnist-domain.mjs [--json out.json]
   ───────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser, newPage, startServer } from '../test/e2e/harness.mjs';
import { preprocessDigit, grayFromImageData, FIELD, BOX, CENTRE } from '../js/mnist-preprocess.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAB = '/projects/mnist-lenet.html';

/* The same strokes the e2e suite draws, so the two agree on what "a digit
   drawn by a person" means. */
const DIGITS = {
  0: [[[.5,.08],[.24,.28],[.20,.5],[.24,.72],[.5,.92],[.76,.72],[.80,.5],[.76,.28],[.5,.08]]],
  1: [[[.42,.22],[.55,.10],[.55,.92]]],
  2: [[[.24,.28],[.34,.12],[.60,.10],[.76,.26],[.70,.46],[.26,.90],[.80,.90]]],
  3: [[[.26,.16],[.56,.08],[.76,.24],[.60,.46],[.44,.48]],[[.60,.46],[.80,.66],[.62,.90],[.32,.90],[.22,.80]]],
  4: [[[.62,.10],[.22,.64],[.82,.64]],[[.62,.10],[.62,.92]]],
  5: [[[.74,.12],[.32,.12],[.28,.44],[.50,.40],[.74,.52],[.72,.78],[.48,.92],[.26,.84]]],
  6: [[[.68,.12],[.42,.24],[.28,.52],[.28,.74],[.46,.92],[.68,.84],[.74,.62],[.58,.48],[.36,.52],[.28,.66]]],
  7: [[[.22,.14],[.80,.14],[.46,.92]]],
  8: [[[.5,.10],[.30,.22],[.34,.42],[.5,.50],[.68,.42],[.70,.22],[.5,.10]],[[.5,.50],[.28,.64],[.26,.82],[.5,.92],[.74,.82],[.72,.64],[.5,.50]]],
  9: [[[.70,.50],[.50,.58],[.32,.46],[.34,.24],[.54,.10],[.70,.24],[.72,.50],[.62,.80],[.40,.92]]],
};

/* The same digits written the way most of continental Europe writes them:
   a 1 with a full upstroke flag and a base serif, a crossed 7, a closed 4, a
   9 with a straight tail, a looped 2. MNIST was collected from US Census
   employees and American high-school students, so these forms are rare in it —
   which is the hypothesis this set exists to test. */
const EUROPEAN = {
  1: [[[.28,.30],[.55,.08],[.55,.90]], [[.30,.90],[.80,.90]]],
  7: [[[.20,.14],[.80,.14],[.42,.92]], [[.28,.54],[.66,.50]]],
  4: [[[.62,.10],[.20,.62],[.84,.62]], [[.62,.10],[.62,.92]]],
  9: [[[.72,.46],[.52,.56],[.32,.44],[.34,.22],[.56,.10],[.72,.24],[.72,.92]]],
  2: [[[.24,.28],[.34,.12],[.60,.10],[.76,.26],[.68,.44],[.40,.56],[.30,.72],[.44,.80],[.30,.88],[.80,.88]]],
  /* A slashed zero and a barred Z-like 2 are programmer habits rather than
     national ones, so they stay out — this set is about handwriting. */
};

/* ─── Human-hand distortions ─────────────────────────────────────────────
   The clean-polyline sets above are how a *program* draws a digit. A hand on
   a mouse adds three things none of them have, and each is a separate
   hypothesis about where the model gets brittle:

     slant   — most people write on a lean; MNIST's slant distribution is
               centred near vertical, so a strong lean is out-of-distribution
     tremor  — small perpendicular wobble along the path
     sparse  — a fast gesture fires few pointermove events, so the browser
               joins distant samples with straight segments and curves become
               visibly polygonal
   ─────────────────────────────────────────────────────────────────────── */

function slantPath(strokes, k) {
  /* Shear about the vertical centre, positive k leaning right. */
  return strokes.map((st) => st.map(([x, y]) => [x + k * (0.5 - y), y]));
}

function tremorPath(strokes, amp, seed = 1) {
  /* Deterministic pseudo-random so a failure is reproducible. */
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
  return strokes.map((st) => st.map(([x, y]) => [x + amp * rnd(), y + amp * rnd()]));
}

const DISTORTIONS = [
  { name: 'clean',        fn: (s) => s,                       steps: 12 },
  { name: 'slant +0.25',  fn: (s) => slantPath(s, 0.25),      steps: 12 },
  { name: 'slant -0.25',  fn: (s) => slantPath(s, -0.25),     steps: 12 },
  { name: 'tremor 0.03',  fn: (s) => tremorPath(s, 0.03),     steps: 12 },
  { name: 'tremor 0.06',  fn: (s) => tremorPath(s, 0.06),     steps: 12 },
  { name: 'sparse (fast)', fn: (s) => s,                      steps: 1  },
  { name: 'slant+tremor', fn: (s) => tremorPath(slantPath(s, 0.22), 0.04), steps: 2 },
];

/* ─── Measures ───────────────────────────────────────────────────────────── */

const INK = 8;   /* same threshold mnist-preprocess uses for ink bounds */

function coverage(px) {
  let n = 0;
  for (const v of px) if (v > INK) n++;
  return n / px.length;
}

function meanInk(px) {
  let sum = 0, n = 0;
  for (const v of px) if (v > INK) { sum += v; n++; }
  return n ? sum / n : 0;
}

/* Mean horizontal run length through inked pixels. A crude but robust stroke
   gauge: for a stroke of width w crossed at angle θ the run is w/sin θ, so
   averaged over a whole digit it tracks w closely and needs no skeletonising. */
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
  /* Median: a horizontal stroke (the bar of a 7) contributes one enormous run
     that would drag a mean well past anything the eye would call width. */
  runs.sort((a, b) => a - b);
  return runs[runs.length >> 1];
}

/* Share of ink sitting at intermediate intensity. MNIST's digits are
   anti-aliased downsamples of binary scans, so they carry a lot of partial
   coverage; a hard-edged render carries very little. */
function edgeSoftness(px) {
  let mid = 0, ink = 0;
  for (const v of px) {
    if (v > INK) { ink++; if (v < 200) mid++; }
  }
  return ink ? mid / ink : 0;
}

function histogram(px, bins = 8) {
  const h = new Array(bins).fill(0);
  let ink = 0;
  for (const v of px) {
    if (v <= INK) continue;
    ink++;
    h[Math.min(bins - 1, Math.floor((v / 256) * bins))]++;
  }
  return h.map((n) => (ink ? n / ink : 0));
}

function bbox(px) {
  let x0 = FIELD, y0 = FIELD, x1 = -1, y1 = -1;
  for (let y = 0; y < FIELD; y++) {
    for (let x = 0; x < FIELD; x++) {
      if (px[y * FIELD + x] > INK) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { w: 0, h: 0 } : { w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function centroid(px) {
  let sx = 0, sy = 0, s = 0;
  for (let y = 0; y < FIELD; y++) {
    for (let x = 0; x < FIELD; x++) {
      const v = px[y * FIELD + x];
      if (v > 0) { sx += x * v; sy += y * v; s += v; }
    }
  }
  return s ? { x: sx / s, y: sy / s } : { x: 0, y: 0 };
}

function measure(px) {
  const box = bbox(px);
  const c = centroid(px);
  return {
    coverage: coverage(px),
    meanInk: meanInk(px),
    stroke: strokeWidth(px),
    softness: edgeSoftness(px),
    box: `${box.w}×${box.h}`,
    com: `${c.x.toFixed(1)},${c.y.toFixed(1)}`,
    hist: histogram(px),
  };
}

/* ─── Reference: the committed MNIST test digits ─────────────────────────── */

function mnistSamples() {
  const { samples } = JSON.parse(readFileSync(join(ROOT, 'data/cnn-samples.json'), 'utf8'));
  return samples.map((s) => ({
    digit: s.digit,
    pixels: Uint8Array.from(Buffer.from(s.pixels, 'base64')),
  }));
}

/* ─── Drawn: the real page, driven by a real pointer ─────────────────────── */

async function drawnSamples(set = DIGITS, transform = (x) => x, steps = 12) {
  const server = await startServer();
  const browser = await launchBrowser();
  const page = await newPage(browser, server, { viewport: { width: 1440, height: 900 } });
  const out = [];
  try {
    await page.goto(server.base + LAB, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas[data-mnist="draw"]');
    await page.evaluate(() =>
      document.querySelector('canvas[data-mnist="draw"]').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1200);

    const box = await (await page.$('canvas[data-mnist="draw"]')).boundingBox();
    const pad = 0.12;
    const P = (nx, ny) => ({
      x: box.x + box.width * (pad + nx * (1 - 2 * pad)),
      y: box.y + box.height * (pad + ny * (1 - 2 * pad)),
    });

    for (const [digit, rawStrokes] of Object.entries(set)) {
      const strokes = transform(rawStrokes);
      await page.click('[data-mnist="clear"]');
      await page.waitForTimeout(60);
      for (const stroke of strokes) {
        const pts = [];
        for (let i = 0; i < stroke.length - 1; i++) {
          const [ax, ay] = stroke[i], [bx, by] = stroke[i + 1];
          for (let k = 0; k < steps; k++) pts.push([ax + (bx - ax) * k / steps, ay + (by - ay) * k / steps]);
        }
        pts.push(stroke[stroke.length - 1]);
        const s = P(...pts[0]);
        await page.mouse.move(s.x, s.y);
        await page.mouse.down();
        for (const p of pts.slice(1)) { const q = P(...p); await page.mouse.move(q.x, q.y); }
        await page.mouse.up();
      }
      await page.waitForTimeout(350);

      /* The raw drawing surface, straight out of the canvas. Everything after
         this runs in Node against the same pure module the browser uses. */
      const raw = await page.evaluate(() => {
        const c = document.querySelector('canvas[data-mnist="draw"]');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height);
        return { data: Array.from(d.data), width: d.width, height: d.height };
      });
      const verdict = await page.evaluate(() => ({
        read: document.querySelector('[data-mnist="verdict"]').textContent.trim(),
        conf: document.querySelector('[data-mnist="confidence"]').textContent.trim(),
      }));

      const { gray, width, height } = grayFromImageData({
        data: Uint8ClampedArray.from(raw.data), width: raw.width, height: raw.height,
      });
      const pixels = preprocessDigit(gray, width, height);
      out.push({ digit: Number(digit), pixels, verdict });
    }
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
  return out;
}

/* ─── Reporting ──────────────────────────────────────────────────────────── */

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function table(title, rows) {
  console.log(`\n${title}`);
  console.log('  digit  coverage  meanInk  stroke  softness   box    com');
  for (const r of rows) {
    console.log(`  ${String(r.digit).padEnd(6)} ${pct(r.m.coverage).padStart(7)}  ` +
      `${r.m.meanInk.toFixed(0).padStart(6)}  ${String(r.m.stroke).padStart(5)}  ` +
      `${pct(r.m.softness).padStart(7)}  ${r.m.box.padStart(6)}  ${r.m.com}`);
  }
}

function summary(label, rows) {
  return {
    label,
    coverage: mean(rows.map((r) => r.m.coverage)),
    meanInk: mean(rows.map((r) => r.m.meanInk)),
    stroke: mean(rows.map((r) => r.m.stroke)),
    softness: mean(rows.map((r) => r.m.softness)),
    hist: Array.from({ length: 8 }, (_, i) => mean(rows.map((r) => r.m.hist[i]))),
  };
}

const jsonOut = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1] : null;

const mnist = mnistSamples().map((s) => ({ digit: s.digit, m: measure(s.pixels), pixels: s.pixels }));
const shape = (s) => ({ digit: s.digit, verdict: s.verdict, m: measure(s.pixels), pixels: s.pixels });
const drawn = (await drawnSamples(DIGITS)).map(shape);
const euro  = (await drawnSamples(EUROPEAN)).map(shape);

console.log('MNIST domain diagnosis');
console.log('======================');
console.log(`field ${FIELD}×${FIELD}, box ${BOX}, centre target ${CENTRE}`);

table('MNIST (committed test digits — what the model was trained on)', mnist);
table('DRAWN (canvas, through the real preprocessing)', drawn);

const a = summary('MNIST', mnist);
const b = summary('drawn', drawn);

console.log('\nAggregate');
console.log('  measure      MNIST     drawn     ratio');
const cmp = (name, x, y, fmt = (v) => v.toFixed(2)) =>
  console.log(`  ${name.padEnd(12)} ${fmt(x).padStart(7)}  ${fmt(y).padStart(7)}   ${(y / x).toFixed(2)}×`);
cmp('coverage', a.coverage, b.coverage, pct);
cmp('meanInk', a.meanInk, b.meanInk, (v) => v.toFixed(0));
cmp('stroke(px)', a.stroke, b.stroke);
cmp('softness', a.softness, b.softness, pct);

console.log('\nIntensity histogram (share of ink per 32-level bin)');
console.log('  bin    ' + Array.from({ length: 8 }, (_, i) => String(i * 32).padStart(6)).join(''));
console.log('  MNIST  ' + a.hist.map((v) => pct(v).padStart(6)).join(''));
console.log('  drawn  ' + b.hist.map((v) => pct(v).padStart(6)).join(''));

console.log('\nPredictions on the drawn set');
const wrong = drawn.filter((d) => d.verdict.read !== String(d.digit));
for (const d of drawn) {
  const ok = d.verdict.read === String(d.digit) ? ' ' : '✗';
  console.log(`  ${ok} drew ${d.digit} → read ${d.verdict.read.padEnd(2)} ${d.verdict.conf}`);
}
console.log(`  ${drawn.length - wrong.length}/${drawn.length} correct`);

console.log('\nPredictions on the CONTINENTAL EUROPEAN forms');
const euroWrong = euro.filter((d) => d.verdict.read !== String(d.digit));
for (const d of euro) {
  const ok = d.verdict.read === String(d.digit) ? ' ' : '✗';
  console.log(`  ${ok} drew ${d.digit} → read ${d.verdict.read.padEnd(2)} ${d.verdict.conf}`);
}
console.log(`  ${euro.length - euroWrong.length}/${euro.length} correct`);
table('EUROPEAN forms (canvas, through the real preprocessing)', euro);

console.log('\nRobustness to what a hand actually does');
console.log('  distortion        correct   misreads');
for (const d of DISTORTIONS) {
  const rows = (await drawnSamples(DIGITS, d.fn, d.steps)).map(shape);
  const bad = rows.filter((r) => r.verdict.read !== String(r.digit));
  const detail = bad.map((r) => `${r.digit}→${r.verdict.read}`).join(' ');
  console.log(`  ${d.name.padEnd(16)}  ${String(rows.length - bad.length).padStart(2)}/${rows.length}     ${detail}`);
}

/* Side-by-side ASCII, so the shape difference is visible and not just numeric. */
console.log('\nSide by side (MNIST left, drawn right)');
const RAMP = ' .:-=+*#%@';
for (const d of [1, 7, 4]) {
  const m = mnist.find((r) => r.digit === d), w = drawn.find((r) => r.digit === d);
  if (!m || !w) continue;
  console.log(`\n  digit ${d}`);
  for (let y = 0; y < FIELD; y += 1) {
    const row = (px) => Array.from({ length: FIELD }, (_, x) =>
      RAMP[Math.min(9, Math.floor(px[y * FIELD + x] / 26))]).join('');
    console.log(`   ${row(m.pixels)}   ${row(w.pixels)}`);
  }
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ mnist: a, drawn: b, perDigit: { mnist, drawn } }, null, 2));
  console.log(`\nWrote ${jsonOut}`);
}
