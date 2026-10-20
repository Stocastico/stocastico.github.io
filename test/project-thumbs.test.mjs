/* Project cards as a media bin (#192).

   Each card opens on a 16:9 frame, the way an editor's bin shows a clip. The
   frame is a small thumbnail made at build time (scripts/generate-thumbs.mjs)
   from the project's `bg`, not the `bg` itself: those are hero banners of up
   to 130 KB, and projects.html would otherwise fetch every one of them to
   paint fifteen frames a few hundred pixels wide. A project with no `bg`
   (the two off-site datavizzes) gets the colour bars instead — the test card
   a bin shows for a clip with no picture.

   Three things are checked here: the thumbnails exist and are the size the
   markup promises, the manifest still matches the sources they were made
   from (the drift guard — by source hash rather than output bytes, which
   would tie the test to one build of libvips), and the card builder emits
   the frame. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { PROJECTS } from '../data/projects.js';
import { projectCardHtml, THUMB_W, THUMB_H, thumbUrl } from '../js/render-cards.js';
import { thumbJobs, MANIFEST } from '../scripts/generate-thumbs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THUMBS = path.join(ROOT, 'public/img/thumbs');

test('thumbs: the frame is 16:9', () => {
  assert.equal(THUMB_W * 9, THUMB_H * 16);
});

test('thumbs: every project with a bg has a thumbnail of the promised size, and nothing else does', async () => {
  const withBg = PROJECTS.filter((p) => p.bg);
  assert.ok(withBg.length >= 10, `only ${withBg.length} projects carry a bg`);
  for (const p of withBg) {
    const file = path.join(ROOT, 'public', thumbUrl(p).slice(1));
    assert.ok(fs.existsSync(file), `missing ${path.relative(ROOT, file)} — run \`npm run generate-thumbs\``);
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, 'webp');
    assert.deepEqual([meta.width, meta.height], [THUMB_W, THUMB_H], `${p.id}: wrong size`);
    /* The point of the thumbnail is weight; 40 KB is ~2× the current largest. */
    assert.ok(fs.statSync(file).size < 40_000, `${p.id}: ${fs.statSync(file).size} bytes`);
  }
  const expected = new Set(withBg.map((p) => `${p.id}.webp`));
  const stray = fs.readdirSync(THUMBS).filter((f) => f.endsWith('.webp') && !expected.has(f));
  assert.deepEqual(stray, [], 'thumbnails for projects that no longer exist (or lost their bg)');
});

test('thumbs: the manifest matches the sources (drift guard)', () => {
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  const fresh = Object.fromEntries(thumbJobs(PROJECTS).map((j) => [j.id, j.hash]));
  assert.deepEqual(committed, fresh,
    'a thumbnail is stale against its source image (or the recipe changed) — run `npm run generate-thumbs`');
});

test('card: a project with a bg opens on its thumbnail', () => {
  const p = PROJECTS.find((x) => x.bg);
  const html = projectCardHtml(p);
  const img = /<div class="project-card__thumb">\s*<img ([^>]+)>/.exec(html);
  assert.ok(img, 'no thumbnail frame');
  const attrs = img[1];
  assert.match(attrs, new RegExp(`src="${thumbUrl(p)}"`));
  assert.match(attrs, new RegExp(`width="${THUMB_W}" height="${THUMB_H}"`), 'reserve the box: width + height');
  assert.match(attrs, /loading="lazy"/);
  assert.match(attrs, /alt=""/, 'decorative: the title right below says what it is');
  assert.ok(thumbUrl(p).startsWith('/img/thumbs/'), 'root-absolute, served from public/ as named');
  assert.doesNotMatch(html, new RegExp(p.bg.replace(/[.]/g, '\\.')), 'never the full-size hero');
});

test('card: a project without a bg gets the colour bars, not an empty frame', () => {
  const p = PROJECTS.find((x) => !x.bg);
  assert.ok(p, 'fixture: expected at least one bg-less project');
  const html = projectCardHtml(p);
  assert.match(html, /<div class="project-card__thumb project-card__thumb--bars">/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, new RegExp(`<span class="project-card__slate" aria-hidden="true">${p.id}</span>`), "the slate names the clip");
});

test('card: the year sits in the frame where a clip shows its duration, still inside the link text', () => {
  const html = projectCardHtml(PROJECTS[0]);
  const thumb = /<div class="project-card__thumb[^"]*">([\s\S]*?)<\/div><div class="project-card__body">/.exec(html);
  assert.ok(thumb, 'thumb must come first, then the body');
  assert.match(thumb[1], /class="project-card__year"/);
  assert.doesNotMatch(thumb[1], /aria-hidden="true"[^>]*>[^<]*\d{4}/, 'the year must stay audible');
});

test('card: personal projects carry the outlined strip class', () => {
  const personal = PROJECTS.find((x) => x.kind === 'personal');
  const work = PROJECTS.find((x) => x.kind === 'work');
  assert.match(projectCardHtml(personal), /class="project-card is-personal"/);
  assert.match(projectCardHtml(work), /class="project-card"/);
});

test('thumbs: a diagram painted in palette variables keeps its colours, not a one-colour silhouette', async () => {
  /* rag-query.svg is drawn in var(--accent2) boxes with var(--text) labels.
     Rendered as a stencil — its alpha as a mask over one flat accent — the
     boxes became solid yellow slabs and every label vanished into them (the
     review: "non si vede bene"). The thumbnail must carry the diagram's own
     two inks: cyan box outlines and light label text. */
  const { THEME } = await import('../js/theme.js');
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const near = (px, c, tol) => Math.abs(px[0] - c[0]) + Math.abs(px[1] - c[1]) + Math.abs(px[2] - c[2]) < tol;
  const { data, info } = await sharp(path.join(THUMBS, 'rag-document-qa.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let cyan = 0, light = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const px = [data[i], data[i + 1], data[i + 2]];
    if (near(px, hex(THEME.accent2), 60)) cyan++;
    if (px[0] > 170 && px[1] > 170 && px[2] > 170) light++;
  }
  assert.ok(cyan > 40, `only ${cyan} pixels in the box colour (thin outlines; the stencil had 0)`);
  assert.ok(light > 300, `only ${light} pixels light enough to be label text`);
});

test('the MLOps card shows its own architecture diagram, not the stock image', () => {
  /* Review of #192: the generic render the page shipped with said nothing
     about the project; the write-up's own diagram says what it was. */
  const p = PROJECTS.find((x) => x.id === 'mlops-vertex-media');
  assert.equal(p.bg, 'img/projects/mlops-architecture.svg');
});

test('every SVG bg is a stencil: no full-frame background rect', () => {
  /* The detail-page hero paints an SVG bg through mask-image, so only its
     alpha counts: a diagram with a ground rect becomes one solid slab. */
  for (const p of PROJECTS.filter((x) => x.bg && x.bg.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(ROOT, p.bg), 'utf8');
    const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    assert.ok(vb, `${p.bg} has no viewBox`);
    const full = new RegExp(`<rect(?![^>]*\\bx=)(?![^>]*\\by=)[^>]*width="${vb[1]}"[^>]*height="${vb[2]}"`);
    assert.doesNotMatch(svg, full, `${p.bg} has a background rect`);
  }
});
