#!/usr/bin/env node
/* ============================================================
   generate-mnist-og
   --------------------------------------------------------------
   The social card of projects/mnist-lenet.html: the network reading a digit.

   It used to be a hand-drawn PNG, frozen in an amber palette the site left
   several rotations ago and quoting a test accuracy (98.52%) the retrained
   model no longer has. Every number and every pixel on this card is now
   computed: the input is a real MNIST test digit from data/cnn-samples.json,
   the conv1/conv2 maps, the two dense layers and the softmax come from
   forward() in js/lenet.js — the same function the page runs — on the weights
   in data/cnn-model.json, and the accuracy is the model's own testAccuracy.
   Colours come from the active palette; the type is the site's, rendered by
   Chromium (scripts/lib/og-render.mjs).

   The page pins this card (its og:image is not under img/projects/og/), so
   generate-project-og leaves it alone and this script owns it.

   Output: img/projects/mnist-lenet-og.png

   Run:  node scripts/generate-mnist-og.mjs [--dry-run] [--help]
   Re-run after train-cnn, or after a palette change.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { fontFaces, barStops, esc, renderPngs, W, H } from './lib/og-render.mjs';
import { deserializeModel } from './lib/lenet.mjs';
import { forward, createState, argmax } from '../js/lenet.js';

const require = createRequire(import.meta.url);
const { parseYaml } = require('./lib/yaml.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'img', 'projects', 'mnist-lenet-og.png');
const DIGIT = 3;

/** One forward pass over the committed sample of DIGIT. */
export function readDigit() {
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cnn-model.json'), 'utf8'));
  const samples = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cnn-samples.json'), 'utf8')).samples;
  const sample = samples.find((s) => s.digit === DIGIT);
  const pixels = Uint8Array.from(Buffer.from(sample.pixels, 'base64'));
  const s = forward(deserializeModel(model), pixels, createState());
  const params = Object.values(model.params)
    .reduce((n, b64) => n + Buffer.from(b64, 'base64').length / 4, 0);
  return {
    pixels, s, params, accuracy: model.testAccuracy,
    verdict: argmax(s.probs), p: s.probs[argmax(s.probs)],
  };
}

/* A grid of square cells as SVG rects, one fill, opacity per value (0–1).
   Zero cells are drawn as a faint ground so the grid still reads. */
function grid(values, cols, cell, fill, ground) {
  const rows = Math.ceil(values.length / cols);
  const gap = cell > 4 ? 1 : 0.5;
  const rects = [];
  values.forEach((v, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    const a = Math.min(1, v);
    rects.push(a > 0.04
      ? `<rect x="${x}" y="${y}" width="${cell - gap}" height="${cell - gap}" fill="${fill}" fill-opacity="${a.toFixed(2)}"/>`
      : `<rect x="${x}" y="${y}" width="${cell - gap}" height="${cell - gap}" fill="${ground}"/>`);
  });
  return `<svg width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}">${rects.join('')}</svg>`;
}

/* Normalised to the layer's peak, then square-rooted: ReLU activations are
   sparse and heavy-tailed, so linear opacity left all but a few cells
   invisible at feed size. */
const norm = (arr) => {
  let m = 0;
  for (const v of arr) if (v > m) m = v;
  return Array.from(arr, (v) => (m ? Math.sqrt(v / m) : 0));
};

/** Feature maps laid out as a block: `n` maps of `size`², `perRow` across. */
function maps(arr, n, size, perRow, cell, fill, ground) {
  const all = norm(arr);
  const out = [];
  for (let k = 0; k < n; k++) out.push(grid(all.slice(k * size * size, (k + 1) * size * size), size, cell, fill, ground));
  return `<div class="maps" style="grid-template-columns: repeat(${perRow}, auto)">${out.join('')}</div>`;
}

export function htmlFor(p, d = readDigit()) {
  const ground = `${p.text}14`;
  const input = grid(Array.from(d.pixels, (v) => v / 255), 28, 8, p.text, ground);
  const c1 = maps(d.s.c1, 6, 24, 2, 2.5, p.accent, ground);
  const c2 = maps(d.s.c2, 16, 8, 4, 4.5, p.accent, ground);
  const h1 = grid(norm(d.s.h1), 10, 7, p.accent, ground);
  const h2 = grid(norm(d.s.h2), 7, 7, p.accent, ground);
  const bars = Array.from(d.s.probs, (v, i) => `<div class="row${i === d.verdict ? ' on' : ''}"><span>${i}</span>`
    + `<i style="width:${Math.max(2, Math.round(v * 90))}px"></i></div>`).join('');
  const pct = (d.accuracy * 100).toFixed(2);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
* { margin: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; background: ${p.bg}; color: ${p.text}; position: relative; overflow: hidden; font-family: 'Archivo'; }
.bars { position: absolute; inset: 0 0 auto 0; height: 14px; background: linear-gradient(90deg, ${barStops(p)}); }
.head { position: absolute; left: 64px; right: 64px; top: 50px; }
.meta { font-family: 'JetBrains Mono'; font-size: 20px; color: ${p.accentText || p.accent}; }
.title { margin-top: 10px; font-weight: 800; font-stretch: 62%; font-size: 64px; line-height: 0.95; }
.net { position: absolute; left: 64px; right: 64px; top: 200px; height: 300px; display: flex; align-items: flex-end; justify-content: space-between; }
.net .soft, .net .verdict { align-self: center; }
.stage { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.stage b { font-weight: 600; font-size: 19px; }
.stage small { font-family: 'JetBrains Mono'; font-size: 15px; color: ${p.textMuted || p.text}; }
.maps { display: grid; gap: 4px; }
.soft .row { display: flex; align-items: center; gap: 8px; height: 19px; font-family: 'JetBrains Mono'; font-size: 15px; color: ${p.textMuted || p.text}; }
.soft .row i { display: block; height: 8px; background: ${p.textMuted || p.text}; opacity: 0.5; }
.soft .row.on { color: ${p.accentText || p.accent}; }
.soft .row.on i { background: ${p.accent}; opacity: 1; }
.verdict { text-align: center; }
.verdict .digit { font-weight: 800; font-stretch: 62%; font-size: 150px; line-height: 0.9; color: ${p.accent}; }
.verdict small { font-family: 'JetBrains Mono'; font-size: 18px; color: ${p.textMuted || p.text}; }
.foot { position: absolute; left: 64px; right: 64px; bottom: 40px; display: flex; justify-content: space-between; font-size: 22px; color: ${p.textMuted || p.text}; }
.foot .domain { font-family: 'JetBrains Mono'; font-size: 20px; }
</style></head><body>
<div class="bars"></div>
<div class="head">
  <div class="meta">LeNet-5 · MNIST · ${d.params.toLocaleString('en-US')} parameters</div>
  <div class="title">Draw a digit, watch a LeNet-5 read it</div>
</div>
<div class="net">
  <div class="stage">${input}<b>Input</b><small>28×28</small></div>
  <div class="stage">${c1}<b>conv1</b><small>6@24×24</small></div>
  <div class="stage">${c2}<b>conv2</b><small>16@8×8</small></div>
  <div class="stage">${h1}<b>fc1</b><small>120</small></div>
  <div class="stage">${h2}<b>fc2</b><small>84</small></div>
  <div class="stage soft">${bars}</div>
  <div class="verdict"><div class="digit">${esc(d.verdict)}</div><small>p = ${d.p.toFixed(3)}</small></div>
</div>
<div class="foot"><span>Trained in plain JavaScript · ${pct}% test accuracy · runs in your browser</span><span class="domain">stefanomasneri.com</span></div>
</body></html>`;
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: node scripts/generate-mnist-og.mjs [--dry-run]\n');
    return;
  }
  const data = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
  const palette = data.palettes[data.active];
  const [png] = await renderPngs([htmlFor(palette)]);
  if (!argv.includes('--dry-run')) fs.writeFileSync(OUT, png);
  process.stdout.write(`✓ ${argv.includes('--dry-run') ? '[dry] ' : ''}img/projects/mnist-lenet-og.png (${(png.length / 1024).toFixed(0)} KB)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((err) => { console.error(err); process.exit(1); });
}
