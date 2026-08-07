#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   screenshots.mjs — visual QA harness for the light/dark theme.

   Builds are NOT triggered here; run `npm run build` first (serves dist/ if it
   exists, else the source tree).

   Two things this harness got wrong for its whole life, both of which made it
   emit files that looked plausible and carried no information:

     · It selected light mode with Playwright's `colorScheme: 'light'`, which
       sets prefers-color-scheme — and the site deliberately ignores that. Light
       is opt-in via the toggle only, persisted to localStorage and re-applied
       by the <head> bootstrap before first paint. So every "light" capture was
       a byte-identical copy of its dark twin: half the matrix, all of it noise.
       The theme is now pinned the way a visitor pins it.

     · It captured full-page shots without scrolling. `[data-animate]` is
       opacity 0 until initScrollReveal() reveals it, and that sweep runs on
       scroll / resize / hashchange / load — none of which a fullPage capture
       fires. index-full-dark.png was 1280x5458 with roughly 4,600px of solid
       black below the hero. Every capture now scrolls the page through before
       shooting.

   Usage: node scripts/screenshots.mjs [outDir]
──────────────────────────────────────────────────────────────────────────────*/
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser, scrollThrough, settleReveal } from '../test/e2e/harness.mjs';

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
  /* launchBrowser() rather than chromium.launch(): the E2E harness already
     solved "the pinned browser is not the browser this machine has" — it
     honours CHROMIUM_EXECUTABLE, scans PLAYWRIGHT_BROWSERS_PATH for whatever
     build is actually present, and says out loud when it substitutes. A second
     fallback here would be a worse copy of that one. */
  const browser = await launchBrowser();

  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    /* The site ships dark and treats light as an explicit choice, so this is
       how a visitor selects it — the <head> bootstrap reads the same key
       before first paint. Setting prefers-color-scheme would do nothing. */
    if (scheme === 'light') {
      await ctx.addInitScript(() => {
        try { localStorage.setItem('theme', 'light'); } catch { /* private mode */ }
      });
    }
    const page = await ctx.newPage();
    for (const shot of SHOTS) {
      await page.goto(base + shot.path, { waitUntil: 'load' });
      /* nudge the hero into life (the CNN scene starts on first interaction) */
      await page.mouse.move(640, 300);
      await page.mouse.move(660, 320);
      await page.waitForTimeout(shot.wait || 1400);
      await scrollThrough(page);
      await settleReveal(page);
      /* `behavior: 'instant'`, and then wait for scrollY to actually reach 0.
         This used to be a bare scrollTo(0, 0) followed by a 400 ms pause —
         but html carries `scroll-behavior: smooth`, so from the bottom of a
         5400px homepage the shutter fired mid-flight and index-hero-*.png was
         a photograph of the Projects section. The one capture named "hero"
         never contained the hero.

         CLAUDE.md already records this exact trap for test/e2e/content.e2e.mjs
         ("a fixed timeout after scrollTo() measures mid-flight, and reads as
         the effect being a few percent wrong"). Same stylesheet, same cause,
         learned there and not applied here. Polling rather than a longer sleep
         because the right wait depends on page height, which differs per
         shot. */
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 })
        .catch(() => { /* a page too short to scroll is already at 0 */ });
      await page.waitForTimeout(400);
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
