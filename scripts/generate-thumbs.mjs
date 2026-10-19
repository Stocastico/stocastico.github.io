#!/usr/bin/env node
/* ============================================================
   generate-thumbs.mjs
   --------------------------------------------------------------
   data/projects.js (each entry's `bg`)  ->  img/thumbs/<id>.webp
                                          + img/thumbs/manifest.json

   The media-bin frames on the project cards (#192 — see the note above
   THUMB_W in js/render-cards.js). One 640×360 WebP per project that has a
   `bg`, cropped to 16:9 with libvips' attention strategy, which keeps the
   busy part of a wide banner rather than its geometric centre.

   Two of the `bg`s are SVG stencils (rag-query, mnist-lenet): diagrams whose
   colours are `var(--…)`, which no rasteriser can resolve. Only their alpha
   is meaningful — the detail page paints them through `mask-image` — so the
   same is done here: the alpha is used as a mask for the palette accent over
   the palette ground, and the whole diagram is fitted inside the frame rather
   than cropped, because a cropped diagram is a picture of half an arrow.

   Drift guard: manifest.json maps each id to a hash of its source bytes and
   of the recipe (size, quality, palette colours for the stencils).
   test/project-thumbs.test.mjs recomputes it. Hashing the inputs rather than
   comparing output bytes keeps the check independent of the libvips build.

   Usage:
     node scripts/generate-thumbs.mjs [--dry-run] [--help]
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { PROJECTS } from '../data/projects.js';
import { THUMB_W, THUMB_H, thumbUrl } from '../js/render-cards.js';
import { THEME } from '../js/theme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const MANIFEST = 'img/thumbs/manifest.json';
const QUALITY = 72;
/* Bump when the recipe changes in a way the inputs below do not capture. */
const RECIPE = 1;

export function thumbJobs(projects) {
  return projects.filter((p) => p.bg).map((p) => {
    const source = path.join(ROOT, p.bg);
    const stencil = p.bg.endsWith('.svg');
    const recipe = JSON.stringify({ RECIPE, THUMB_W, THUMB_H, QUALITY, ...(stencil ? { bg: THEME.bg, accent: THEME.accent } : {}) });
    const hash = crypto.createHash('sha256').update(recipe).update(fs.readFileSync(source)).digest('hex').slice(0, 16);
    return { id: p.id, source, stencil, out: path.join(ROOT, thumbUrl(p).slice(1)), hash };
  });
}

async function render(sharp, job) {
  if (!job.stencil) {
    return sharp(job.source)
      .resize(THUMB_W, THUMB_H, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: QUALITY })
      .toBuffer();
  }
  /* Fit the diagram inside an inset box, take its alpha, and use that as the
     opacity of a flat accent layer over the ground. */
  const PAD = 0.08;
  const alpha = await sharp(job.source, { density: 192 })
    .resize(Math.round(THUMB_W * (1 - 2 * PAD)), Math.round(THUMB_H * (1 - 2 * PAD)), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .extractChannel('alpha')
    .linear(0.8, 0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ink = await sharp({ create: { width: alpha.info.width, height: alpha.info.height, channels: 3, background: THEME.accent } })
    .joinChannel(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: THUMB_W, height: THUMB_H, channels: 3, background: THEME.bg } })
    .composite([{ input: ink, gravity: 'center' }])
    .webp({ quality: QUALITY })
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: node scripts/generate-thumbs.mjs [--dry-run]\n');
    return;
  }
  const dry = args.includes('--dry-run');
  const { default: sharp } = await import('sharp');
  const jobs = thumbJobs(PROJECTS);
  const dir = path.join(ROOT, 'img/thumbs');
  if (!dry) fs.mkdirSync(dir, { recursive: true });

  const keep = new Set(jobs.map((j) => path.basename(j.out)));
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (f.endsWith('.webp') && !keep.has(f)) {
      console.log(`remove  img/thumbs/${f}`);
      if (!dry) fs.unlinkSync(path.join(dir, f));
    }
  }
  for (const job of jobs) {
    const buf = await render(sharp, job);
    console.log(`${dry ? 'would write' : 'write'}  ${path.relative(ROOT, job.out)}  ${(buf.length / 1024).toFixed(1)} KB`);
    if (!dry) fs.writeFileSync(job.out, buf);
  }
  const manifest = JSON.stringify(Object.fromEntries(jobs.map((j) => [j.id, j.hash])), null, 2) + '\n';
  if (!dry) fs.writeFileSync(path.join(ROOT, MANIFEST), manifest);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
