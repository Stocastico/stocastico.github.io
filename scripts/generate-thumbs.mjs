#!/usr/bin/env node
/* ============================================================
   generate-thumbs.mjs
   --------------------------------------------------------------
   data/projects.js (each entry's `bg`)  ->  public/img/thumbs/<id>.webp
                                          + data/thumbs-manifest.json (drift guard, not deployed)

   The media-bin frames on the project cards (#192 — see the note above
   THUMB_W in js/render-cards.js). One 640×360 WebP per project that has a
   `bg`, cropped to 16:9 with libvips' attention strategy, which keeps the
   busy part of a wide banner rather than its geometric centre.

   Two of the `bg`s are SVGs (rag-query, mnist-lenet), and both are fitted
   inside the frame rather than cropped, because a cropped diagram is a
   picture of half an arrow. One painted in palette variables (rag-query) is
   rendered in its real colours: `var(--…)` is resolved against THEME before
   the rasteriser sees it, which no rasteriser could do on its own. It used
   to go through the stencil path below like the other one, and its boxes
   came out as solid accent slabs with every label lost inside them. A plain
   stencil with no variables (mnist-lenet) is still only alpha — its alpha
   masks a flat accent over the ground, as on its detail page.

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

/* In public/, not img/: Vite copies public/ verbatim, so the file is served at
   exactly the URL the card names. Under img/ the build hashed the <img> srcs
   in the HTML but not the identical URLs js/main.js builds when it reshuffles
   the homepage cards, so the client-rendered frames pointed at nothing. */
export const MANIFEST = 'data/thumbs-manifest.json';
const QUALITY = 72;
/* Bump when the recipe changes in a way the inputs below do not capture. */
const RECIPE = 2;

export function thumbJobs(projects) {
  return projects.filter((p) => p.bg || p.thumb).map((p) => {
    /* `thumb` (drafts/thumbs/, an off-site piece's map on a transparent
       ground) is fitted onto the card's ground like a diagram; `bg` is
       cropped or stencilled as below. */
    const map = !!p.thumb;
    const source = path.join(ROOT, p.thumb || p.bg);
    const stencil = !map && p.bg.endsWith('.svg');
    const recipe = JSON.stringify({ RECIPE, THUMB_W, THUMB_H, QUALITY, ...(stencil ? { palette: SVG_VARS() } : {}), ...(map ? { map, bg: THEME.bg } : {}) });
    const hash = crypto.createHash('sha256').update(recipe).update(fs.readFileSync(source)).digest('hex').slice(0, 16);
    return { id: p.id, source, stencil, map, out: path.join(ROOT, 'public', thumbUrl(p).slice(1)), hash };
  });
}

/* The palette as the custom properties the diagrams use. `-rgb` variants are
   space-separated channels, as in css/styles.css; `bg-card` is resolved over
   the ground because a rasteriser has no page behind the SVG. */
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + rgbOf(a).map((v, i) => Math.round(v * (1 - t) + rgbOf(b)[i] * t).toString(16).padStart(2, '0')).join('');
export function SVG_VARS() {
  return {
    accent: THEME.accent, accent2: THEME.accent2, text: THEME.text, 'text-muted': THEME.textMuted,
    'text-faint': THEME.textFaint, bg: THEME.bg, 'bg-card': mix(THEME.bg, THEME.text, 0.12),
    'accent-rgb': rgbOf(THEME.accent).join(' '), 'accent2-rgb': rgbOf(THEME.accent2).join(' '),
    'text-rgb': rgbOf(THEME.text).join(' '),
    'accent-text': THEME.accentText, 'accent2-text': THEME.accent2Text,
    /* --border is text at 20% (the generated :root); over the ground. */
    border: mix(THEME.bg, THEME.text, 0.2),
  };
}

/** Resolve var(--x) and rgb(var(--x-rgb) / a) to literal colours. Throws on a
    variable it does not know, so a new one cannot render as black. */
export function resolveSvgVars(svg, vars = SVG_VARS()) {
  const look = (name) => {
    if (!(name in vars)) throw new Error(`generate-thumbs: no palette value for var(--${name})`);
    return vars[name];
  };
  return svg
    .replace(/rgb\(var\(--([a-z0-9-]+)\)\s*\/\s*([0-9.]+)\)/g, (_, n, a) => `rgba(${look(n).split(' ').join(',')},${a})`)
    .replace(/var\(--([a-z0-9-]+)\)/g, (_, n) => look(n));
}

async function render(sharp, job) {
  if (job.map) {
    /* A map on a transparent ground: fitted whole, centred on the ground. */
    const PAD = 0.06;
    const art = await sharp(job.source)
      .resize(Math.round(THUMB_W * (1 - 2 * PAD)), Math.round(THUMB_H * (1 - 2 * PAD)), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return sharp({ create: { width: THUMB_W, height: THUMB_H, channels: 3, background: THEME.bg } })
      .composite([{ input: art, gravity: 'center' }])
      .webp({ quality: QUALITY })
      .toBuffer();
  }
  if (!job.stencil) {
    return sharp(job.source)
      .resize(THUMB_W, THUMB_H, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: QUALITY })
      .toBuffer();
  }
  const PAD = 0.08;
  const fit = [Math.round(THUMB_W * (1 - 2 * PAD)), Math.round(THUMB_H * (1 - 2 * PAD))];
  const svg = fs.readFileSync(job.source, 'utf8');
  if (svg.includes('var(--')) {
    /* Painted in palette variables: render it in those colours, fitted. */
    const art = await sharp(Buffer.from(resolveSvgVars(svg)), { density: 192 })
      .resize(fit[0], fit[1], { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return sharp({ create: { width: THUMB_W, height: THUMB_H, channels: 3, background: THEME.bg } })
      .composite([{ input: art, gravity: 'center' }])
      .webp({ quality: QUALITY })
      .toBuffer();
  }
  /* A plain stencil: fit it inside an inset box, take its alpha, and use that
     as the opacity of a flat accent layer over the ground. */
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
  const dir = path.join(ROOT, 'public/img/thumbs');
  if (!dry) fs.mkdirSync(dir, { recursive: true });

  const keep = new Set(jobs.map((j) => path.basename(j.out)));
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (f.endsWith('.webp') && !keep.has(f)) {
      console.log(`remove  public/img/thumbs/${f}`);
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
