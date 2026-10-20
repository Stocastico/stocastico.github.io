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

   They are rendered by Chromium (scripts/lib/og-render.mjs), not by sharp:
   sharp's SVG renderer ignores @font-face, so the old cards were set in the
   machine's DejaVu, never in the site's type, and their wrapping was a
   character-count estimate of a font that was not even the one drawn. Now
   the browser sets the type and line-clamp does the cutting (#195).

   The palette is the second reason. The two hand-drawn cards in this directory
   are frozen in an amber palette the site stopped wearing several rotations
   ago — the same failure the inline diagrams had before they were inlined, and
   the same one og-<palette>.png solves for the brand card. These regenerate,
   so a palette change carries the project cards with it.

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

import { fontFaces, barStops, esc, renderPngs, W, H } from './lib/og-render.mjs';

const require = createRequire(import.meta.url);
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

/* The margin every line of type keeps from the card's edge. The pixel test
   in test/generate-project-og.test.mjs reads it. */
export const PAD = 84;

/* The Montaggio title card for a project: the colour-bar strip, the year in
   mono (it is data), the tags in the UI face, the title in Archivo at its
   narrowest, two lines of description in the serif, and a footer. Titles and
   descriptions are cut by line-clamp; a long title steps its size down once
   rather than shrinking continuously, so thirteen cards keep one or two type
   sizes, not thirteen. */
export function htmlFor(project, p) {
  const long = project.title.length > 58;
  const tags = (project.tags || []).map((t) => `<span>${esc(t)}</span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
* { margin: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; background: ${p.bg}; color: ${p.text}; position: relative; overflow: hidden; }
.bars { position: absolute; inset: 0 0 auto 0; height: 14px; background: linear-gradient(90deg, ${barStops(p)}); }
.card { position: absolute; inset: 14px ${PAD}px 110px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
.meta { display: flex; gap: 18px; align-items: baseline; font-family: 'Archivo'; font-size: 24px; color: ${p.textMuted || p.text}; }
.year { font-family: 'JetBrains Mono'; font-weight: 700; color: ${p.accentText || p.accent}; }
.meta span + span::before { content: '·'; margin-right: 18px; }
.title { font-family: 'Archivo'; font-weight: 800; font-stretch: 62%; font-size: ${long ? 76 : 92}px; line-height: 0.95;
         display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; text-wrap: balance; }
.desc { font-family: 'Source Serif 4'; font-size: 26px; line-height: 1.35; color: ${p.textMuted || p.text};
        display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.foot { position: absolute; left: ${PAD}px; right: ${PAD}px; bottom: 48px; display: flex; justify-content: space-between; align-items: baseline;
        font-family: 'Archivo'; font-size: 24px; color: ${p.text}; }
.foot .who::before { content: ''; display: inline-block; width: 14px; height: 14px; margin-right: 14px; background: ${p.accent}; }
.foot .domain { font-family: 'JetBrains Mono'; font-size: 21px; color: ${p.textMuted || p.text}; }
</style></head><body>
<div class="bars"></div>
<div class="card">
  <div class="meta"><span class="year">${esc(project.year)}</span>${tags}</div>
  <div class="title">${esc(project.title)}</div>
  <div class="desc">${esc(project.description || '')}</div>
</div>
<div class="foot"><span class="who">Stefano Masneri</span><span class="domain">stefanomasneri.com</span></div>
</body></html>`;
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
  const pngs = await renderPngs(targets.map((project) => htmlFor(project, palette)));
  for (const [i, project] of targets.entries()) {
    const png = pngs[i];
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
