#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   screenshots.mjs — visual QA harness for the light/dark theme.

   Builds are NOT triggered here; run `npm run build` first (serves dist/ if it
   exists, else the source tree). Captures each page in both colour schemes by
   emulating prefers-color-scheme, exercising the OS-preference path (the same
   CSS + getTheme() code the manual toggle drives).

   Usage: node scripts/screenshots.mjs [outDir]
──────────────────────────────────────────────────────────────────────────────*/
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVE = existsSync(join(ROOT_DIR, 'dist')) ? join(ROOT_DIR, 'dist') : ROOT_DIR;
const OUT = join(ROOT_DIR, process.argv[2] || 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let url = req.url.split('?')[0];
      if (url === '/') url = '/index.html';
      const file = join(SERVE, url);
      if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* page slug, path, optional scroll (px), fullPage */
const SHOTS = [
  { name: 'index-hero', path: '/index.html', fullPage: false },
  { name: 'index-full', path: '/index.html', fullPage: true },
  { name: 'cv',         path: '/cv.html',    fullPage: false },
  { name: 'projects',   path: '/projects.html', fullPage: false },
  { name: 'travel',     path: '/travel.html', fullPage: false, scroll: 0, wait: 2500 },
  { name: 'links',      path: '/links.html', fullPage: false },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme });
    const page = await ctx.newPage();
    for (const shot of SHOTS) {
      await page.goto(base + shot.path, { waitUntil: 'load' });
      /* nudge the hero into life (neural net starts on first interaction) */
      await page.mouse.move(640, 300);
      await page.mouse.move(660, 320);
      await page.evaluate(() => window.scrollBy(0, 1));
      await page.waitForTimeout(shot.wait || 1400);
      if (shot.scroll) await page.evaluate((y) => window.scrollTo(0, y), shot.scroll);
      const file = join(OUT, `${shot.name}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: !!shot.fullPage });
      console.log('✓', file.replace(ROOT_DIR + '/', ''));
    }
    await ctx.close();
  }

  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
