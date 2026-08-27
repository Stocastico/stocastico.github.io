/* Social cards for the project pages.

   Every generated artefact in this repo has a drift guard, and this one is
   deliberately NOT a byte comparison. The card is rendered through sharp,
   which rasterises the SVG with libvips and librsvg; the exact bytes depend on
   the versions installed and on the platform, so a byte check would fail on a
   contributor's machine while the card is perfectly correct. What is asserted
   instead is everything a byte check would have been standing in for: the
   files exist, they are the size the platforms require, they are drawn in the
   palette the site is currently wearing, the layout arithmetic keeps the text
   inside its box, and every page points at the card that belongs to it.

   The last of those is the one that matters most. og:image is the single
   property on a page that nobody on the team ever sees — it renders in someone
   else's feed, not in the browser you are testing in — which is how eleven
   pages came to advertise cards between 270x187 and 800x533, two of them below
   the 300px floor at which X abandons summary_large_image entirely. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { PROJECTS } from '../data/projects.js';
import { svgFor, ownedProjects } from '../scripts/generate-project-og.mjs';

const require = createRequire(import.meta.url);
const { parseYaml } = require('../scripts/lib/yaml.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OG_DIR = path.join(ROOT, 'img', 'projects', 'og');

const palettes = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
const ACTIVE = palettes.palettes[palettes.active];
const owned = ownedProjects(PROJECTS);

/* PNG: an 8-byte signature then IHDR, width and height as big-endian uint32. */
function pngSize(buf) {
  assert.equal(buf.toString('latin1', 0, 8), '\x89PNG\r\n\x1a\n', 'not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('project-og: the generator owns a non-trivial set of projects', () => {
  assert.ok(owned.length >= 10,
    `only ${owned.length} project(s) point og:image at img/projects/og/ — `
    + 'either the pages have drifted or ownedProjects() is wrong');
});

test('project-og: a card exists for every project that claims one', () => {
  const missing = owned
    .filter((p) => !fs.existsSync(path.join(OG_DIR, `${p.id}.png`)))
    .map((p) => p.id);
  assert.deepEqual(missing, [],
    `these pages advertise a card that is not in img/projects/og/: ${missing.join(', ')}.\n`
    + 'Run `npm run generate-project-og`.');
});

test('project-og: no orphan cards', () => {
  if (!fs.existsSync(OG_DIR)) return;
  const claimed = new Set(owned.map((p) => `${p.id}.png`));
  const orphans = fs.readdirSync(OG_DIR).filter((f) => !claimed.has(f));
  assert.deepEqual(orphans, [],
    `img/projects/og/ holds cards no page references: ${orphans.join(', ')}`);
});

/* 1200x630 is what the platforms ask for. The floors underneath it are the
   reason this whole thing exists: below 600x315 Facebook and LinkedIn drop to
   a thumbnail, and below 300px wide X abandons summary_large_image and renders
   the small summary card instead. */
for (const project of owned) {
  test(`project-og: ${project.id}.png is 1200x630`, () => {
    const file = path.join(OG_DIR, `${project.id}.png`);
    const { width, height } = pngSize(fs.readFileSync(file));
    assert.equal(width, 1200, `${project.id}.png is ${width}px wide`);
    assert.equal(height, 630, `${project.id}.png is ${height}px tall`);
  });
}

/* Every project page's og:image, whether this generator drew it or not. The
   two hand-drawn cards are covered here too — they are the ones no generator
   would catch. */
test('project-og: every project page advertises a card of a usable size', () => {
  const tooSmall = [];
  for (const project of PROJECTS) {
    if (!project.url?.startsWith('projects/')) continue;
    const page = path.join(ROOT, project.url);
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    const m = /<meta property="og:image"\s+content="[^"]*?\/(img\/[^"]+)"/.exec(html);
    assert.ok(m, `${project.url} has no og:image`);

    const file = path.join(ROOT, m[1]);
    assert.ok(fs.existsSync(file), `${project.url} points og:image at ${m[1]}, which does not exist`);
    assert.ok(!m[1].endsWith('.svg'),
      `${project.url} points og:image at an SVG — scrapers do not render them`);

    const { width, height } = pngSize(fs.readFileSync(file));
    if (width < 600 || height < 315) tooSmall.push(`${project.id}: ${m[1]} is ${width}x${height}`);
  }
  assert.deepEqual(tooSmall, [],
    'these social cards are below the 600x315 floor where previews degrade:\n  '
    + tooSmall.join('\n  '));
});

test('project-og: the declared og:image:width/height match the file', () => {
  const wrong = [];
  for (const project of PROJECTS) {
    if (!project.url?.startsWith('projects/')) continue;
    const page = path.join(ROOT, project.url);
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, 'utf8');
    const src = /<meta property="og:image"\s+content="[^"]*?\/(img\/[^"]+)"/.exec(html);
    const w = /<meta property="og:image:width"\s+content="(\d+)"/.exec(html);
    const h = /<meta property="og:image:height"\s+content="(\d+)"/.exec(html);
    if (!src || !w || !h) continue;
    const real = pngSize(fs.readFileSync(path.join(ROOT, src[1])));
    if (Number(w[1]) !== real.width || Number(h[1]) !== real.height) {
      wrong.push(`${project.id}: declares ${w[1]}x${h[1]}, file is ${real.width}x${real.height}`);
    }
  }
  assert.deepEqual(wrong, [], `og:image dimensions disagree with the file:\n  ${wrong.join('\n  ')}`);
});

/* The palette check is the drift guard a byte comparison would have provided.
   The two hand-drawn cards in img/projects/ are frozen in an amber palette the
   site rotated away from several cycles ago; these must not join them. */
test('project-og: cards are drawn in the active palette', () => {
  const svg = svgFor(owned[0], ACTIVE);
  for (const colour of [ACTIVE.bg, ACTIVE.accent, ACTIVE.accent2]) {
    assert.ok(svg.includes(colour),
      `the card template does not use ${colour} from the active "${palettes.active}" palette`);
  }
});

test('project-og: the card template reads no hard-coded colour', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-project-og.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export function svgFor'), src.indexOf('export function ownedProjects'));
  const hex = body.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [],
    'generate-project-og.mjs has a literal colour in the card template — '
    + 'every colour must come from the palette, or the cards stop rotating with it');
});

/* Does the text stay inside its box?

   The first version of this asked the question of the SVG, by multiplying
   character counts by an assumed average advance. That is the same arithmetic
   the wrapper itself uses, so at best it re-asserted the wrapper's own
   assumption, and when the assumption was made pessimistic enough to be
   independent it failed seven cards that render perfectly well. The estimate
   was never the thing anyone cares about.

   So this reads the pixels. Text on these cards peaks around luminance 230;
   the background, glows included, does not clear 55 anywhere. Ink in the
   margin strip is therefore unambiguous, and the check holds whatever the
   renderer does with the font — which is the part an estimate can never
   promise. */
const CANVAS = 1200;
const PAD = 84;
const INK = 100;          // safely above the brightest background, far below text

async function marginInk(file) {
  const sharpLib = require('sharp');
  const { data, info } = await sharpLib(file).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const worst = { left: 0, right: 0 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 3;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (x < PAD - 8 && lum > worst.left) worst.left = lum;
      if (x > CANVAS - PAD + 2 && lum > worst.right) worst.right = lum;
    }
  }
  return worst;
}

for (const project of owned) {
  test(`project-og: ${project.id}.png keeps its text inside the margins`, async () => {
    const file = path.join(OG_DIR, `${project.id}.png`);
    const { left, right } = await marginInk(file);
    assert.ok(right < INK,
      `${project.id}.png has ink in the right margin (luminance ${right.toFixed(0)}) — a line ran past x=${CANVAS - PAD}`);
    assert.ok(left < INK,
      `${project.id}.png has ink in the left margin (luminance ${left.toFixed(0)})`);
  });
}

/* The pixel check above can only see a card that has been rendered. This one
   catches the same bug in the template before anyone regenerates: it is the
   wrapper's own arithmetic, so it does not prove a line fits, but it does
   prove the wrapper believes it does. A card whose committed PNG is stale
   would otherwise pass the pixel check while the template had already broken. */
test('project-og: the wrapper never emits a line it thinks is too wide', () => {
  const over = [];
  for (const project of owned) {
    const svg = svgFor(project, ACTIVE);
    for (const block of svg.matchAll(/<text class="(mono|serif)"[^>]*font-size="(\d+)"[^>]*>([\s\S]*?)<\/text>/g)) {
      const [, face, size, inner] = block;
      const advance = face === 'mono' ? 0.6 : 0.545;
      for (const t of inner.matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)) {
        const width = t[1].length * Number(size) * advance;
        if (PAD + width > CANVAS - PAD + 1) {
          over.push(`${project.id}: "${t[1].slice(0, 44)}…" ≈ ${Math.round(width)}px in a ${CANVAS - PAD * 2}px box`);
        }
      }
    }
  }
  assert.deepEqual(over, [], `the wrapper emitted an over-wide line:\n  ${over.join('\n  ')}`);
});

test('project-og: every card carries its title, year and facets', () => {
  for (const project of owned) {
    const svg = svgFor(project, ACTIVE);
    const flat = svg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(flat.includes(String(project.year).toUpperCase()),
      `${project.id}: the year is missing from its card`);
    for (const tag of project.tags) {
      assert.ok(flat.includes(tag.toUpperCase().replace(/&/g, '&amp;')),
        `${project.id}: facet "${tag}" is missing from its card`);
    }
    /* The title is wrapped across tspans, so compare word by word. */
    for (const word of project.title.split(/\s+/)) {
      assert.ok(flat.includes(word.replace(/&/g, '&amp;')),
        `${project.id}: the word "${word}" is missing from its card title`);
    }
  }
});
