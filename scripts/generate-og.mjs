/* ============================================================
   generate-og
   --------------------------------------------------------------
   Renders the site's Open Graph / social card for each palette: a
   deterministic 1200×630 PNG built from an HTML template in the palette's own
   colours (data/palettes.yaml) and the site's own faces.

   The card is the Montaggio title card (#190, #195): the colour-bar strip
   across the top, the name in Archivo at its narrowest and heaviest, the
   tagline at its widest and lightest — the same pair the homepage hero sets
   one above the other — and the location in the UI face. It is rendered by
   Chromium (scripts/lib/og-render.mjs) because the previous SVG-through-sharp
   path could not load web fonts at all, so the card was never actually set
   in the site's type.

   Output: img/og/og-<paletteKey>.png

   generate-theme points every brand page's og:image / twitter:image at the
   ACTIVE palette's card.

   Run:  node scripts/generate-og.mjs [--dry-run]
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
const OUT_DIR = path.join(ROOT, 'img', 'og');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-og.mjs [--dry-run]\n');
  process.exit(0);
}

export function htmlFor(p) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
* { margin: 0; box-sizing: border-box; }
body { width: ${W}px; height: ${H}px; background: ${p.bg}; color: ${p.text}; position: relative; overflow: hidden; }
.bars { position: absolute; inset: 0 0 auto 0; height: 14px; background: linear-gradient(90deg, ${barStops(p)}); }
.card { position: absolute; inset: 14px 0 0 0; padding: 0 84px 64px; display: flex; flex-direction: column; justify-content: center; }
.name { font-family: 'Archivo'; font-weight: 800; font-stretch: 62%; font-size: 168px; line-height: 0.9; letter-spacing: -0.01em; white-space: nowrap; }
.tagline { margin-top: 28px; font-family: 'Archivo'; font-weight: 300; font-stretch: 125%; font-size: 40px; line-height: 1.15; }
.tagline em { font-style: normal; font-weight: 600; }
.foot { position: absolute; left: 84px; right: 84px; bottom: 52px; display: flex; justify-content: space-between; align-items: baseline;
        font-family: 'Archivo'; font-size: 26px; color: ${p.textMuted || p.text}; }
.foot .place::before { content: ''; display: inline-block; width: 14px; height: 14px; margin-right: 14px; background: ${p.accent}; }
.foot .domain { font-family: 'JetBrains Mono'; font-size: 22px; }
</style></head><body>
<div class="bars"></div>
<div class="card">
  <div class="name">Stefano Masneri</div>
  <div class="tagline">AI that <em>understands</em> video,<br>and AI that <em>creates</em> it</div>
</div>
<div class="foot"><span class="place">San Sebastián, Spain</span><span class="domain">stefanomasneri.com</span></div>
</body></html>`;
}

async function main() {
  const data = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
  const palettes = data.palettes || {};
  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });

  const entries = Object.entries(palettes);
  const pngs = await renderPngs(entries.map(([, p]) => htmlFor(p)));
  let count = 0;
  for (const [i, [key, p]] of entries.entries()) {
    if (!DRY_RUN) fs.writeFileSync(path.join(OUT_DIR, `og-${key}.png`), pngs[i]);
    count += 1;
    process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}og-${key}.png (${p.name})\n`);
  }
  process.stdout.write(`Done. ${count} OG card(s) ${DRY_RUN ? 'would be ' : ''}written to img/og/.\n`);
}

/* Command-line only. Every generator in this directory now carries this guard:
   two of them (analytics, speculation-rules) ran at import time, which made
   their test suites unable to fail and let `npm test` write to the working
   tree. See the note in scripts/generate-analytics.mjs. */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

export { W, H };
