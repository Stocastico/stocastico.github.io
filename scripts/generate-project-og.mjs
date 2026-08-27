#!/usr/bin/env node
/* ============================================================
   generate-project-og
   --------------------------------------------------------------
   One 1200x630 social card per project, built from the active palette.

   Why this exists. A project page's og:image was its hero image, and a hero
   image and a social card want opposite things. A hero is stretched full-bleed
   under a 65-95% scrim, so it can be wide, dim and lossy; a card is shown at
   about 500px in a feed with nothing over it, and the platforms have hard
   floors. Measured across the thirteen pages, only one hero (mlops-bg, 1600x840)
   was actually the right size. Two were catastrophic — avatech-bg at 270x187
   and mpi-brain-bg at 292x173, both under X's 300px minimum for
   summary_large_image, so those two cards silently degraded to the small
   summary layout. Four more sat between 673 and 800 wide, under the 600x315
   floor at which Facebook and LinkedIn stop showing a large image. Two heroes
   are SVGs, which no scraper renders at all.

   Why the cards are typographic rather than photographic. The obvious fix —
   composite the hero into the card — cannot work for the pages that need it
   most: a 270x187 screenshot is no better inside a 1200x630 frame than it is
   stretched across a hero. Compositing only where the source is big enough
   would give four picture cards and nine text cards, which reads as an
   accident. So every card is drawn from type and palette, the same way the
   brand card (scripts/generate-og.mjs) and the hand-drawn LeNet card already
   are, and the too-small-source problem disappears rather than being managed.

   The palette is the second reason. The two hand-drawn cards in this directory
   are frozen in an amber palette the site stopped wearing several rotations
   ago — the same failure the inline diagrams had before they were inlined, and
   the same one og-<palette>.png solves for the brand card. These regenerate,
   so a palette rotation carries the project cards with it.

   Output: img/projects/og/<id>.png

   A project may still pin a hand-made card with an `og:` field in its draft;
   this generator skips any project whose committed page points somewhere other
   than img/projects/og/.

   Run:  node scripts/generate-project-og.mjs [--dry-run] [--only <id>]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { parseYaml } = require('./lib/yaml.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'img', 'projects', 'og');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'Usage: node scripts/generate-project-og.mjs [--dry-run] [--only <project-id>]\n\n'
    + 'Renders img/projects/og/<id>.png (1200x630) for every project whose page\n'
    + 'points its og:image there. Colours come from the active palette in\n'
    + 'data/palettes.yaml, so re-run after `npm run generate-theme`.\n',
  );
  process.exit(0);
}

const W = 1200;
const H = 630;

/* Both faces are embedded so the render does not depend on what fonts the
   machine happens to have — the same reason generate-og does it. */
const b64 = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString('base64');
const MONO = b64('fonts/jetbrains-mono-latin-wght-normal.woff2');
const SERIF = b64('fonts/source-serif-4-latin-wght-normal.woff2');

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* JetBrains Mono is monospaced at exactly 600/1000 em, so a mono line's width
   is arithmetic rather than a guess. Source Serif is proportional, so its
   average advance has to be estimated, and the estimate must err high — a low
   one puts a line over the right edge, a high one merely wraps early. 0.50 was
   measurably too low: the longest descriptions rendered about 35px past the
   margin. 0.545 clears every description in data/projects.js with room, which
   test/generate-project-og.test.mjs re-checks against the real strings rather
   than trusting the constant. */
const MONO_ADVANCE = 0.6;
const SERIF_ADVANCE = 0.545;

function wrap(text, maxWidth, fontSize, advance) {
  const perChar = fontSize * advance;
  const limit = Math.max(1, Math.floor(maxWidth / perChar));
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (!line) { line = word; continue; }
    if ((line + ' ' + word).length <= limit) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

/* Long titles step down through these sizes until they fit three lines. The
   ladder is coarse on purpose: a card whose type size is a continuous function
   of its title length has thirteen different type sizes and reads as thirteen
   unrelated cards. */
const TITLE_SIZES = [64, 56, 48, 42, 38];
const TITLE_MAX_LINES = 3;

function fitTitle(title, maxWidth) {
  for (const size of TITLE_SIZES) {
    const lines = wrap(title, maxWidth, size, MONO_ADVANCE);
    if (lines.length <= TITLE_MAX_LINES) return { size, lines };
  }
  const size = TITLE_SIZES[TITLE_SIZES.length - 1];
  return { size, lines: wrap(title, maxWidth, size, MONO_ADVANCE).slice(0, TITLE_MAX_LINES) };
}

export function svgFor(project, palette) {
  const p = palette;
  const PAD = 84;
  const BOX = W - PAD * 2;

  const { size: titleSize, lines: titleLines } = fitTitle(project.title, BOX);
  const eyebrow = [project.year, ...(project.tags || [])].join('  ·  ').toUpperCase();

  /* Two lines of description, cut on a word with an ellipsis rather than
     mid-word — the card is a summary of a summary.

     The ellipsis is appended after wrapping, so it can push a line that
     exactly filled its measure one character past it. Two cards did overrun
     by 4px that way. Drop trailing words until the ellipsis fits rather than
     reserving space up front, which would shorten every line to pay for the
     few that need it. */
  const DESC_SIZE = 25;
  const descFits = (s) => s.length * DESC_SIZE * SERIF_ADVANCE <= BOX;
  const descLines = wrap(project.description || '', BOX, DESC_SIZE, SERIF_ADVANCE).slice(0, 2);
  if (descLines.length === 2 && (project.description || '').length
      > descLines.join(' ').length) {
    let last = descLines[1].replace(/[,;:.]?$/, '');
    while (!descFits(`${last}…`) && last.includes(' ')) {
      last = last.slice(0, last.lastIndexOf(' '));
    }
    descLines[1] = `${last}…`;
  }

  /* Laid out from the title block outwards so a one-line and a three-line
     title stay optically centred rather than both starting at a fixed y. */
  const titleLead = titleSize * 1.24;
  const titleH = titleLines.length * titleLead;
  const titleTop = (H - titleH) / 2 - 6;

  const titleTspans = titleLines
    .map((l, i) => `<tspan x="${PAD}" y="${(titleTop + titleLead * (i + 0.78)).toFixed(1)}">${esc(l)}</tspan>`)
    .join('');
  const descTspans = descLines
    .map((l, i) => `<tspan x="${PAD}" y="${(titleTop + titleH + 62 + i * 34).toFixed(1)}">${esc(l)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(data:font/woff2;base64,${MONO}) format('woff2'); }
      @font-face { font-family: 'Source Serif 4'; font-weight: 400 700; src: url(data:font/woff2;base64,${SERIF}) format('woff2'); }
      .mono  { font-family: 'JetBrains Mono', monospace; }
      .serif { font-family: 'Source Serif 4', serif; }
    </style>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.bgAlt || p.bg}"/>
      <stop offset="1" stop-color="${p.bg}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.14" r="0.85">
      <stop offset="0" stop-color="${p.accent}" stop-opacity="0.26"/>
      <stop offset="0.6" stop-color="${p.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.96" cy="0.98" r="0.8">
      <stop offset="0" stop-color="${p.accent2}" stop-opacity="0.22"/>
      <stop offset="0.62" stop-color="${p.accent2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0.25" stop-color="${p.heroGradFrom || p.accent}"/>
      <stop offset="1" stop-color="${p.heroGradTo || p.accent2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text class="mono" x="${PAD}" y="106" font-size="21" font-weight="700"
        fill="${esc(p.accentText || p.accent)}" letter-spacing="3.2">${esc(eyebrow)}</text>

  <text class="mono" font-size="${titleSize}" font-weight="700"
        fill="url(#title)" letter-spacing="-2">${titleTspans}</text>

  <text class="serif" font-size="25" fill="${esc(p.textMuted || p.text)}">${descTspans}</text>

  <rect x="${PAD}" y="${H - 74}" width="30" height="3" rx="1.5" fill="${p.accent}"/>
  <text class="mono" x="${PAD + 48}" y="${H - 64}" font-size="21"
        fill="${esc(p.text)}">Stefano Masneri</text>
  <text class="serif" x="${W - PAD}" y="${H - 64}" font-size="21"
        fill="${esc(p.textMuted || p.text)}" text-anchor="end">stefanomasneri.com</text>
</svg>`;
}

/* Which projects this generator owns: the ones whose committed page already
   points og:image at img/projects/og/. A page pinned to a hand-made card is
   left alone, which is what makes the `og:` frontmatter field meaningful. */
export function ownedProjects(projects, root = ROOT) {
  return projects.filter((proj) => {
    if (!proj.url || !proj.url.startsWith('projects/')) return false;
    const page = path.join(root, proj.url);
    if (!fs.existsSync(page)) return false;
    const m = /<meta property="og:image"\s+content="[^"]*?\/(img\/[^"]+)"/
      .exec(fs.readFileSync(page, 'utf8'));
    return Boolean(m) && m[1] === `img/projects/og/${proj.id}.png`;
  });
}

export async function renderCard(project, palette) {
  return sharp(Buffer.from(svgFor(project, palette))).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const { PROJECTS } = await import(path.join(ROOT, 'data', 'projects.js'));
  const data = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
  const palette = data.palettes[data.active];
  if (!palette) throw new Error(`data/palettes.yaml has no palette named "${data.active}"`);

  let targets = ownedProjects(PROJECTS);
  if (ONLY) targets = targets.filter((p) => p.id === ONLY);
  if (!targets.length) {
    process.stdout.write(ONLY
      ? `No project "${ONLY}" points its og:image at img/projects/og/.\n`
      : 'No project points its og:image at img/projects/og/ — nothing to do.\n');
    return;
  }

  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const project of targets) {
    const png = await renderCard(project, palette);
    const out = path.join(OUT_DIR, `${project.id}.png`);
    if (!DRY_RUN) fs.writeFileSync(out, png);
    process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}img/projects/og/${project.id}.png (${(png.length / 1024).toFixed(0)} KB)\n`);
  }
  process.stdout.write(
    `Done. ${targets.length} card(s) ${DRY_RUN ? 'would be ' : ''}written `
    + `in the "${data.active}" palette.\n`,
  );
}

/* Command-line only — see the note in scripts/generate-analytics.mjs about
   generators that ran at import time and made their own tests unable to fail. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
