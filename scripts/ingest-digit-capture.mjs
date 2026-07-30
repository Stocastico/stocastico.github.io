#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   ingest-digit-capture.mjs — raw capture dump → committed 28×28 fixture.

   `tools/capture-digits.js` dumps what the browser had: a data-URL PNG of the
   whole drawing surface per sample, which is ~14 KB each and useless to a
   trainer without a decoder. This turns a dump into the compact form the
   fixtures use — base64 28×28 MNIST greys — by running the PNG through
   Chromium and then through js/mnist-preprocess.js, i.e. the exact path the
   live widget takes. Decoding in the browser is deliberate: a Node image
   library could disagree with what Chromium actually painted, and then the
   stored pixels would not be the pixels the model saw.

   The output carries `meant` and `readAtCapture` so a later run can measure
   drift: if the shipped model no longer reproduces the accuracy recorded at
   capture time, either the model or the preprocessing moved.

   Usage:
     node scripts/ingest-digit-capture.mjs <dump.json> --out <fixture.json>
                                           [--note "..."] [--writer <id>]

   `--writer` matters more than it looks. Samples from one hand are not
   independent, so a train/test split that mixes writers measures how well the
   model memorised a person rather than how well it reads handwriting. Every
   sample is tagged so a split can be made by writer later; see the note in
   test/fixtures/README.md.
   ───────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync } from 'node:fs';

import { launchBrowser } from '../test/e2e/harness.mjs';
import { preprocessDigit, grayFromImageData } from '../js/mnist-preprocess.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  process.stdout.write(
    'Usage: node scripts/ingest-digit-capture.mjs <dump.json> --out <fixture.json> ' +
    '[--note "..."] [--writer <id>]\n');
  process.exit(0);
}
const flag = (name, dflt = null) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const dumpPath = args[0];
const outPath = flag('--out');
if (!outPath) { console.error('error: --out is required'); process.exit(1); }
const writer = flag('--writer', 'unknown');
const note = flag('--note', 'Real digits drawn on the live widget. 28x28 MNIST-format greys, base64.');

/* The dump is a bare array (or an object keyed by index, which is what
   JSON.parse gives back for some serialisations of one). */
const parsed = JSON.parse(readFileSync(dumpPath, 'utf8'));
const raw = Array.isArray(parsed) ? parsed : Object.values(parsed);
if (!raw.length) { console.error('error: dump is empty'); process.exit(1); }

const browser = await launchBrowser();
const page = await browser.newPage();
await page.goto('about:blank');

const samples = [];
const surfaces = new Set();
for (const s of raw) {
  const img = await page.evaluate(async (dataUrl) => {
    const im = new Image();
    im.src = dataUrl;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { data: Array.from(d.data), width: d.width, height: d.height };
  }, s.png);

  const { gray, width, height } = grayFromImageData({
    data: Uint8ClampedArray.from(img.data), width: img.width, height: img.height,
  });
  const pixels = preprocessDigit(gray, width, height);
  surfaces.add(`${img.width}×${img.height}`);
  samples.push({
    meant: Number(s.meant),
    readAtCapture: s.read === undefined || s.read === null ? null : Number(s.read),
    writer,
    pixels: Buffer.from(pixels).toString('base64'),
  });
}

await page.close();
await browser.close();

const agreed = samples.filter((s) => s.readAtCapture === s.meant).length;
const out = {
  note,
  captured: (raw[0].at || '').slice(0, 10) || null,
  writer,
  surface: [...surfaces].join(', '),
  n: samples.length,
  accuracyAtCapture: `${agreed}/${samples.length}`,
  samples,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
process.stdout.write(
  `✓ ${samples.length} samples → ${outPath}\n` +
  `  writer: ${writer} | surface: ${out.surface} | accuracy at capture: ${out.accuracyAtCapture}\n`);
