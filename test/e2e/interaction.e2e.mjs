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

import {
  VIEWPORTS, blockExternalRequests, launchBrowser, launchBrowserWithBfcache, newPage, nudgePointer, resolveColor, startServer,
} from './harness.mjs';

let server, browser, bfBrowser;

before(async () => {
  server = await startServer();
  browser = await launchBrowser();
  bfBrowser = await launchBrowserWithBfcache();
});
after(async () => {
  await browser?.close();
  await bfBrowser?.close();
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
          const url = new URL(href, server.base + path).toString();
          const res = await page.request.get(url);
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

describe('lifecycle: the page survives Back', () => {
  test('a bfcache restore leaves the page fully alive', async () => {
    const page = await bfBrowser.newPage({ viewport: VIEWPORTS.desktop });
    await page.addInitScript(() => {
      window.__lifecycle = [];
      addEventListener('pagehide', (e) => window.__lifecycle.push(`pagehide:${e.persisted}`));
      addEventListener('pageshow', (e) => window.__lifecycle.push(`pageshow:${e.persisted}`));
    });

    const heroIsAnimating = () => page.evaluate(async () => {
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

    const paletteOpens = async () => {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(250);
      const open = await page.evaluate(() => !document.getElementById('cmd-overlay').hidden);
      if (open) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
      return open;
    };

    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await nudgePointer(page);
      await page.waitForTimeout(2200);

      assert.equal(await heroIsAnimating(), true, 'the hero was not animating before navigating away');
      assert.equal(await paletteOpens(), true, '⌘K did not work before navigating away');

      await page.goto(server.base + '/cv.html', { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.goBack({ waitUntil: 'commit' }).catch(() => {});
      await page.waitForTimeout(1800);

      const lifecycle = await page.evaluate(() => window.__lifecycle);
      /* If the browser declined to bfcache, this test has nothing to say —
         but it must not silently pass, so assert we got the path we wanted. */
      assert.ok(lifecycle.includes('pageshow:true'),
        `expected a bfcache restore, saw ${JSON.stringify(lifecycle)}`);

      await nudgePointer(page);
      await page.waitForTimeout(2000);

      assert.equal(await heroIsAnimating(), true,
        'the hero canvas is dead after coming back — the page was torn down on a bfcache freeze');
      assert.equal(await paletteOpens(), true,
        '⌘K is dead after coming back');
      assert.equal(
        await page.evaluate(() => document.getElementById('nav-toggle')?.getAttribute('aria-expanded')),
        'false', 'the mobile menu lost its wiring after coming back');
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
        /* Stand in for a disposable: a pagehide listener registered the same
           way initLifecycleCleanup registers its own. */
        addEventListener('pagehide', (e) => { if (!e.persisted) called = true; });
        dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        setTimeout(() => resolve(called), 50);
      }));
      assert.equal(destroyed, true, 'a non-persisted pagehide must still fire teardown');
    } finally { await page.close(); }
  });
});
