#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   eval-real-digits.mjs — the number that actually matters, per fixture.

   MNIST test accuracy is not the thing this widget is judged on. A visitor
   draws with a mouse and the model reads ~98% of MNIST and far less of that.
   This measures the gap directly, over every captured-digit fixture, and
   prints the per-class confusions so a regression says *what* broke.

   By default it reads the float32 weights in data/cnn-model.json — what
   train-cnn just produced. `--shipped` reads data/lenet-weights.js instead,
   i.e. the int8 weights the browser actually downloads, which is the honest
   check that quantisation did not cost anything.

   Usage:
     node scripts/eval-real-digits.mjs [--shipped] [fixture.json …]
   ───────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deserializeModel } from './lib/lenet.mjs';
import { forward, createState, argmax } from '../js/lenet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/eval-real-digits.mjs [--shipped] [fixture.json …]\n');
  process.exit(0);
}
const SHIPPED = args.includes('--shipped');
const fixtures = args.filter((a) => !a.startsWith('--'));
const targets = fixtures.length ? fixtures : [
  'test/fixtures/real-digits.json',
  'test/fixtures/real-digits-2.json',
].filter((f) => fs.existsSync(path.join(ROOT, f)));

let model, label;
if (SHIPPED) {
  ({ loadModel: model } = await import('../data/lenet-weights.js'));
  model = model();
  label = 'data/lenet-weights.js (int8, what the browser downloads)';
} else {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cnn-model.json'), 'utf8'));
  model = deserializeModel(json);
  label = `data/cnn-model.json (float32) — MNIST test ${(json.testAccuracy * 100).toFixed(2)}%`;
}

const state = createState();
process.stdout.write(`model: ${label}\n\n`);

let totalOk = 0, totalN = 0;
for (const rel of targets) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const perClass = {}, conf = {};
  let ok = 0, unsure = 0;
  for (const s of d.samples) {
    forward(model, Uint8Array.from(Buffer.from(s.pixels, 'base64')), state);
    const a = argmax(state.probs);
    if (state.probs[a] < 0.6) unsure += 1;
    perClass[s.meant] ??= { n: 0, ok: 0 };
    perClass[s.meant].n += 1;
    if (a === s.meant) { ok += 1; perClass[s.meant].ok += 1; }
    else { (conf[s.meant] ??= {})[a] = ((conf[s.meant] || {})[a] || 0) + 1; }
  }
  const n = d.samples.length;
  totalOk += ok; totalN += n;
  process.stdout.write(
    `${rel}  (writer: ${d.writer || '?'}, session ${d.captured || '?'})\n` +
    `  ${ok}/${n} = ${((ok / n) * 100).toFixed(1)}%` +
    (d.accuracyAtCapture ? `   [at capture: ${d.accuracyAtCapture}]` : '') +
    `   ·  ${unsure}/${n} below p=0.6\n`);
  const rows = Object.keys(perClass).sort();
  process.stdout.write('  ' + rows.map((k) => {
    const c = perClass[k];
    const bad = conf[k] ? ' →' + Object.entries(conf[k]).map(([r, m]) => `${r}×${m}`).join(',') : '';
    return `${k}:${c.ok}/${c.n}${bad}`;
  }).join('  ') + '\n\n');
}

if (targets.length > 1) {
  process.stdout.write(`all fixtures: ${totalOk}/${totalN} = ${((totalOk / totalN) * 100).toFixed(1)}%\n`);
}
