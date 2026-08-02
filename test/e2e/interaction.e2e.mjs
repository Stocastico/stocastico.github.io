/* ─────────────────────────────────────────────────────────────────────────────
   interaction.e2e.mjs — the chrome still works after you use the site.

   Two categories here, and the second is the interesting one.

   The first is ordinary: the mobile menu opens, ⌘K opens, the theme toggle
   toggles, the palette dots repaint. Unit tests with DOM stubs cover some of
   this already, but a stub cannot tell you whether the button is reachable, on
   screen, and not covered by something else.

   The second is lifecycle, and no stub can reach it at all. A browser may
   freeze a page into the back/forward cache instead of unloading it, and
   restore it later with no reload and no DOMContentLoaded. The site tore
   itself down on that freeze, so Back returned a page whose hero, navbar,
   ⌘K palette and back-to-top were all dead. That is only observable with a
   real browser doing a real history navigation, with bfcache enabled.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';

import { PROJECTS } from '../../data/projects.js';
import {
  BFCACHE_ARGS, BFCACHE_IGNORE, VIEWPORTS, allPages, bfcacheWorks, blockExternalRequests,
  launchBrowser, launchBrowserWithBfcache, newPage, nudgePointer, resolveColor, startServer,
} from './harness.mjs';

/* Same-origin paths this build deliberately does not produce. A project entry
   whose `url` leaves `projects/` points at a page served from the same domain
   by a *different* repo — the Donostia dataviz is a GitHub Pages project site,
   and this repo's CNAME puts the user site on the apex domain, so /<repo>/ is
   already a real path in production. Against the dist/ served here it is a 404,
   and the crawl below has to know the difference or it fails on a link that
   works. Derived from data/projects.js rather than hardcoded, so it cannot
   drift from what the cards actually link to; test/generate-cards.test.mjs
   separately pins that these same urls stay out of the sitemap. */
const OFF_BUILD_PATHS = new Set(
  PROJECTS
    .filter((p) => p.url && !/^(https?:|mailto:|#)/.test(p.url) && !p.url.startsWith('projects/'))
    .map((p) => new URL(p.url, 'http://off-build.invalid/').pathname),
);

let server, browser, bfBrowser, bfcacheAvailable = false, bfWhy = '';

before(async () => {
  server = await startServer();
  browser = await launchBrowser();

  /* Only one configuration actually produces a bfcache restore, measured:

       default (headless shell)        no
       headless shell + flags          no
       channel:'chromium' alone        no
       channel:'chromium' + flags      YES

     So a launch failure on the channel is the whole story, and it used to be
     swallowed twice over — once by launchBrowser's executable fallback and
     again here — leaving a browser that simply cannot bfcache and a skip that
     said only "this browser does not implement it". True, but not why.
     Record the reason so one CI run identifies the cause instead of another
     round of guessing. */
  try {
    bfBrowser = await launchBrowserWithBfcache();
    bfWhy = `channel:'chromium' launched (v${bfBrowser.version()})`;
  } catch (err) {
    bfWhy = `channel:'chromium' failed to launch — ${String(err.message).split('\n')[0]}`;
    bfBrowser = await launchBrowser({ ignoreDefaultArgs: BFCACHE_IGNORE, args: BFCACHE_ARGS });
  }

  bfcacheAvailable = await bfcacheWorks(bfBrowser, server.base + '/index.html');
  console.warn(`[e2e] bfcache ${bfcacheAvailable ? 'available' : 'UNAVAILABLE'} — ${bfWhy}`);
  if (!bfcacheAvailable) {
    console.warn('[e2e] the real Back round trip will skip. Only channel:\'chromium\' plus the ' +
      'BackForwardCache flags produces a restore; `npx playwright install chromium` provides ' +
      'that build alongside the headless shell.');
  }
});
after(async () => {
  if (bfBrowser && bfBrowser !== browser) await bfBrowser.close();
  await browser?.close();
  await server?.close();
});

/* ─── Navigation ─────────────────────────────────────────────────────────── */

describe('navigation', () => {
  test('every internal link resolves to a real page', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    const broken = [];
    try {
      for (const path of ['/index.html', '/cv.html', '/projects.html', '/publications.html', '/travel.html', '/links.html', '/now.html']) {
        await page.goto(server.base + path, { waitUntil: 'domcontentloaded' });
        const hrefs = await page.$$eval('a[href]', (as) => as
          .map((a) => a.getAttribute('href'))
          .filter((h) => h && !/^(https?:|mailto:|tel:|#)/.test(h)));
        for (const href of new Set(hrefs)) {
          const url = new URL(href, server.base + path);
          if (OFF_BUILD_PATHS.has(url.pathname)) continue;
          const res = await page.request.get(url.toString());
          if (!res.ok()) broken.push(`${path} → ${href} (${res.status()})`);
        }
      }
    } finally { await page.close(); }
    assert.deepEqual(broken, []);
  });

  test('every in-page anchor has a matching target', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'domcontentloaded' });
      const dangling = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h.length > 1 && !document.querySelector(h)));
      assert.deepEqual(dangling, [], 'nav links point at sections that do not exist');
    } finally { await page.close(); }
  });

  test('the mobile menu opens and exposes the nav links', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.mobile });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const toggle = await page.$('#nav-toggle');
      assert.ok(toggle, 'no mobile nav toggle');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      await toggle.click();
      await page.waitForTimeout(400);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true',
        'the toggle did not report itself expanded');
      const visibleLinks = await page.$$eval('#navbar a[href]', (as) =>
        as.filter((a) => a.getBoundingClientRect().width > 0).length);
      assert.ok(visibleLinks >= 3, `only ${visibleLinks} nav links visible once open`);
    } finally { await page.close(); }
  });

  test('the command palette opens on Ctrl+K and closes on Escape', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const overlay = await page.$('#cmd-overlay');
      assert.ok(overlay, 'no command palette overlay');
      assert.ok(await overlay.getAttribute('hidden') !== null, 'palette starts open');

      await page.keyboard.press('Control+k');
      await page.waitForTimeout(300);
      assert.equal(await overlay.getAttribute('hidden'), null, 'Ctrl+K did not open the palette');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      assert.ok(await overlay.getAttribute('hidden') !== null, 'Escape did not close the palette');
    } finally { await page.close(); }
  });

  /* The palette used to be homepage-only: every other page shipped the nav and
     the key handler but no #cmd-overlay, so initCommandPalette() returned early
     and Ctrl+K silently did nothing. A shortcut advertised in the navbar chip
     that dies on the first navigation is worse than no shortcut, and nothing in
     the static suite could see it — the markup was simply absent, which reads
     as intentional to a file-level check. Page list comes from dist/, so a new
     page joins this automatically. */
  test('the command palette works on every page, not just the homepage', async () => {
    const pages = allPages();
    assert.ok(pages.length > 5, `only ${pages.length} pages found`);
    for (const path of pages) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
      try {
        await page.goto(server.base + path, { waitUntil: 'networkidle' });
        const overlay = await page.$('#cmd-overlay');
        assert.ok(overlay, `${path}: no command palette overlay`);

        await page.keyboard.press('Control+k');
        await page.waitForTimeout(250);
        assert.equal(await overlay.getAttribute('hidden'), null,
          `${path}: Ctrl+K did not open the palette`);

        /* Opened is not enough — the list has to be populated and reachable. */
        const items = await page.$$eval('#cmd-list .cmd-item:not([hidden])', (els) => els.length);
        assert.ok(items > 3, `${path}: palette opened with only ${items} items`);
      } finally { await page.close(); }
    }
  });
});

/* ─── Theme and palette ──────────────────────────────────────────────────── */

describe('theme', () => {
  test('the site is dark by default even when the OS prefers light', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop, colorScheme: 'light' });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const css = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const { luminance } = await resolveColor(page, css);
      assert.ok(luminance < 60,
        `the page rendered light (luminance ${luminance.toFixed(1)}) despite dark being the default`);
    } finally { await page.close(); }
  });

  test('the toggle switches to light and the choice survives a reload', async () => {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    await blockExternalRequests(page, server.base);
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await page.click('#theme-toggle');
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');

      const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light',
        'the light choice did not survive a reload');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), lightBg,
        'the restored light theme painted a different background');
    } finally { await ctx.close(); }
  });

  test('each palette dot repaints the page and persists', async () => {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    await blockExternalRequests(page, server.base);
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const ids = await page.$$eval('.palette-dot', (bs) => bs.map((b) => b.dataset.palette));
      assert.ok(ids.length >= 2, `expected several palettes, found ${ids.length}`);

      const seen = new Set();
      for (const id of ids) {
        await page.click(`.palette-dot[data-palette="${id}"]`);
        await page.waitForTimeout(400);
        const accent = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
        assert.ok(accent, `palette ${id} produced no --accent`);
        seen.add(accent);
        assert.equal(
          await page.evaluate(() => localStorage.getItem('palette')) ?? id,
          await page.evaluate(() => localStorage.getItem('palette')) ?? id);
      }
      assert.equal(seen.size, ids.length,
        `${ids.length} palettes produced only ${seen.size} distinct accents`);
    } finally { await ctx.close(); }
  });
});

/* ─── Lifecycle: the back/forward cache ──────────────────────────────────── */

/* Two tests, because the property and the integration are different claims and
   only one of them can be checked everywhere.

   The property — a `pagehide` with `persisted: true` must not tear the page
   down — is what actually broke, and it can be checked on any browser by
   dispatching that event. It runs unconditionally.

   The integration — the browser really freezes and restores the document —
   needs a browser that implements bfcache. `chrome-headless-shell`, which is
   Playwright's default headless build, does not. Where it is unavailable that
   test skips with its reason stated, rather than failing (the code is fine, the
   browser simply cannot exercise it) or quietly passing (which is the habit
   that shipped the bug). The property test above still holds the line. */

describe('lifecycle: the page survives Back', () => {
  const heroIsAnimating = (page) => page.evaluate(async () => {
    const c = document.getElementById('neural-canvas');
    if (!c) return 'no-canvas';
    const ctx = c.getContext('2d');
    const hash = () => {
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 3; i < d.length; i += 4 * 13) h = (h * 31 + d[i]) | 0;
      return h;
    };
    const before = hash();
    await new Promise((r) => setTimeout(r, 900));
    return before !== hash();
  });

  const paletteOpens = async (page) => {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(250);
    const open = await page.evaluate(() => !document.getElementById('cmd-overlay').hidden);
    if (open) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
    return open;
  };

  test('a freeze into the bfcache does not tear the page down', async () => {
    /* The regression itself, checked directly: dispatch the pagehide the
       browser fires when it freezes a page, and require everything to still be
       alive afterwards. No bfcache support needed, so this runs everywhere. */
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await nudgePointer(page);
      await page.waitForTimeout(2200);

      assert.equal(await heroIsAnimating(page), true, 'hero was not animating to begin with');
      assert.equal(await paletteOpens(page), true, '⌘K did not work to begin with');

      await page.evaluate(() =>
        dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      await page.waitForTimeout(600);

      assert.equal(await heroIsAnimating(page), true,
        'the hero canvas died on a persisted pagehide — teardown ran on a bfcache freeze');
      assert.equal(await paletteOpens(page), true,
        '⌘K died on a persisted pagehide');
      assert.equal(
        await page.evaluate(() => document.getElementById('nav-toggle')?.getAttribute('aria-expanded')),
        'false', 'the mobile menu lost its wiring on a persisted pagehide');
    } finally { await page.close(); }
  });

  test('a real Back restores a working page', async (t) => {
    if (!bfcacheAvailable) {
      t.skip(`no back/forward cache in this browser — ${bfWhy}. ` +
        'Only channel:\'chromium\' with the BackForwardCache flags restores a page; ' +
        'the headless shell cannot, whatever flags it is given.');
      return;
    }
    const page = await bfBrowser.newPage({ viewport: VIEWPORTS.desktop });
    await page.addInitScript(() => {
      window.__lifecycle = [];
      addEventListener('pagehide', (e) => window.__lifecycle.push(`pagehide:${e.persisted}`));
      addEventListener('pageshow', (e) => window.__lifecycle.push(`pageshow:${e.persisted}`));
    });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await nudgePointer(page);
      await page.waitForTimeout(2200);
      assert.equal(await heroIsAnimating(page), true, 'hero was not animating before navigating away');

      await page.goto(server.base + '/cv.html', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.goBack({ waitUntil: 'commit' }).catch(() => {});
      await page.waitForTimeout(1800);

      const lifecycle = await page.evaluate(() => window.__lifecycle);
      assert.ok(lifecycle.includes('pageshow:true'),
        `expected a bfcache restore, saw ${JSON.stringify(lifecycle)}`);

      await nudgePointer(page);
      await page.waitForTimeout(2000);
      assert.equal(await heroIsAnimating(page), true,
        'the hero canvas is dead after coming back');
      assert.equal(await paletteOpens(page), true, '⌘K is dead after coming back');
    } finally { await page.close(); }
  });

  test('a real unload still tears the page down', async () => {
    /* The other half of the contract: skipping teardown on a bfcache freeze
       must not turn into never tearing down at all. */
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const destroyed = await page.evaluate(() => new Promise((resolve) => {
        let called = false;
        addEventListener('pagehide', (e) => { if (!e.persisted) called = true; });
        dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        setTimeout(() => resolve(called), 50);
      }));
      assert.equal(destroyed, true, 'a non-persisted pagehide must still fire teardown');
    } finally { await page.close(); }
  });
});
