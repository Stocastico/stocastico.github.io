#!/usr/bin/env node
/* ============================================================
   generate-og
   --------------------------------------------------------------
   Renders one Open Graph / social-card image per palette so the share preview
   matches whatever palette the site is currently wearing (the palette rotates
   weekly via CI). Each card is a deterministic 1200×630 PNG built from an SVG
   template — no headless browser — using the same colours generate-theme reads
   from data/palettes.yaml. The display/prose fonts are embedded as base64 so the
   text renders identically regardless of the host's installed fonts.

   Output: img/og/og-<paletteKey>.png  (e.g. og-crimson.png)

   generate-theme points every brand page's og:image / twitter:image at the
   ACTIVE palette's card.

   Run:  node scripts/generate-og.mjs [--dry-run]
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
const OUT_DIR = path.join(ROOT, 'img', 'og');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-og.mjs [--dry-run]\n');
  process.exit(0);
}

const W = 1200;
const H = 630;

function b64Font(rel) {
  return fs.readFileSync(path.join(ROOT, rel)).toString('base64');
}
const MONO = b64Font('fonts/jetbrains-mono-latin-wght-normal.woff2');
const SERIF = b64Font('fonts/source-serif-4-latin-wght-normal.woff2');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgFor(p) {
  const bg = p.bg;
  const bgAlt = p.bgAlt || p.bg;
  const from = p.heroGradFrom || p.accent;
  const to = p.heroGradTo || p.accent2;
  const muted = p.textMuted || p.text;
  const accent = p.accent;
  const accent2 = p.accent2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(data:font/woff2;base64,${MONO}) format('woff2'); }
      @font-face { font-family: 'Source Serif 4'; font-weight: 400 700; src: url(data:font/woff2;base64,${SERIF}) format('woff2'); }
      .name { font-family: 'JetBrains Mono', monospace; font-weight: 700; }
      .body { font-family: 'Source Serif 4', serif; font-weight: 400; }
    </style>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bgAlt}"/>
      <stop offset="1" stop-color="${bg}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.16" cy="0.2" r="0.9">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.30"/>
      <stop offset="0.55" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.95" cy="1.0" r="0.8">
      <stop offset="0" stop-color="${accent2}" stop-opacity="0.26"/>
      <stop offset="0.6" stop-color="${accent2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="name" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.3" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text class="name" x="90" y="250" font-size="118" fill="url(#name)" letter-spacing="-5">Stefano</text>
  <text class="name" x="90" y="370" font-size="118" fill="url(#name)" letter-spacing="-5">Masneri</text>

  <text class="body" x="94" y="446" font-size="30" fill="${esc(muted)}" letter-spacing="0.5">AI · Machine Learning · Computer Vision · Augmented Reality</text>

  <rect x="94" y="486" width="34" height="3" rx="1.5" fill="${accent}"/>
  <text class="body" x="146" y="496" font-size="26" fill="${esc(p.text)}">San Sebastián, Spain</text>

  <text class="body" x="${W - 90}" y="${H - 56}" font-size="24" fill="${esc(muted)}" text-anchor="end">stefanomasneri.com</text>
</svg>`;
}

async function main() {
  const data = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
  const palettes = data.palettes || {};
  if (!DRY_RUN) fs.mkdirSync(OUT_DIR, { recursive: true });

  let count = 0;
  for (const [key, p] of Object.entries(palettes)) {
    const svg = svgFor(p);
    const out = path.join(OUT_DIR, `og-${key}.png`);
    if (!DRY_RUN) {
      await sharp(Buffer.from(svg)).png().toFile(out);
    }
    count += 1;
    process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}og-${key}.png (${p.name})\n`);
  }
  process.stdout.write(`Done. ${count} OG card(s) ${DRY_RUN ? 'would be ' : ''}written to img/og/.\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });

export { svgFor };
