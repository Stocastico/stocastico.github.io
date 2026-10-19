/* ============================================================
   og-render — HTML → 1200×630 PNG in headless Chromium, for the social cards
   (scripts/generate-og.mjs, scripts/generate-project-og.mjs).

   Why a browser and not sharp. The cards used to be SVG rasterised by sharp,
   i.e. librsvg, which ignores @font-face — so every card was set in whatever
   the machine had (DejaVu Sans Mono on Linux), never in the site's own faces,
   however carefully the woff2 files were base64-embedded. Chromium honours
   @font-face, the variable width axis Archivo's condensed display cut needs,
   and line-clamp, so the card is laid out by the same engine as the site and
   wrapping stops being character-count arithmetic.

   Playwright is already a dev dependency (the e2e suite). The fallback to a
   pre-installed Chromium mirrors test/e2e/harness.mjs.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const W = 1200;
export const H = 630;

const b64 = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString('base64');

/** The site's three faces, embedded, under the names css/fonts.css uses. */
export function fontFaces() {
  return [
    `@font-face { font-family: 'Archivo'; font-weight: 300 800; font-stretch: 62% 125%; src: url(data:font/woff2;base64,${b64('fonts/archivo-latin-wdth-wght-normal.woff2')}) format('woff2'); }`,
    `@font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url(data:font/woff2;base64,${b64('fonts/jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); }`,
    `@font-face { font-family: 'Source Serif 4'; font-weight: 400 700; src: url(data:font/woff2;base64,${b64('fonts/source-serif-4-latin-wght-normal.woff2')}) format('woff2'); }`,
  ].join('\n');
}

/** The seven colour bars, left to right, as the strip on every page draws them. */
export function barStops(p) {
  const bars = [p.text, p.accent, p.accent2, p.pins.lived, p.pins.holiday, p.pins.current, p.pins.worktrip];
  const step = 100 / bars.length;
  return bars.map((c, i) => `${c} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`).join(', ');
}

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function launch() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (err) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const exe = fs.existsSync(base) && fs.readdirSync(base)
      .filter((d) => d.startsWith('chromium-'))
      .map((d) => path.join(base, d, 'chrome-linux', 'chrome'))
      .find((p) => fs.existsSync(p));
    if (!exe) throw err;
    return chromium.launch({ executablePath: exe });
  }
}

/** Render each HTML document to a PNG buffer at 1200×630. One browser for all. */
export async function renderPngs(htmls) {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const out = [];
    for (const html of htmls) {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      out.push(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } }));
    }
    return out;
  } finally {
    await browser.close();
  }
}
