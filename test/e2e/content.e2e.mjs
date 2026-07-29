/* ─────────────────────────────────────────────────────────────────────────────
   content.e2e.mjs — is the content actually on the screen?

   This is the file that would have caught the bug everyone noticed. The site
   hides `[data-animate]` at `opacity: 0` and reveals it from JavaScript, which
   means "the markup is present" and "the visitor can see it" are two different
   claims, and only the second one matters. Every assertion here is about the
   second.

   The entry modes are deliberate. A section can reveal correctly when you
   scroll to it and still be blank when you *land* on it from a nav link,
   because an element that is already past the viewport never triggers an
   entering-the-viewport callback. Both paths are exercised, at desktop and
   mobile widths, because the failure only showed at mobile widths.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';

import {
  VIEWPORTS, blockExternalRequests, launchBrowser, newPage, scrollThrough, settleReveal, startServer,
} from './harness.mjs';

let server, browser;

before(async () => {
  server = await startServer();
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

/* Everything the reveal is responsible for, and whether it is painted. */
const hiddenAnimated = (page, scope = 'document') => page.evaluate((sel) => {
  const root = sel === 'document' ? document : document.querySelector(sel);
  if (!root) return { total: 0, hidden: [] };
  const els = [...root.querySelectorAll('[data-animate]')];
  const hidden = els
    .filter((el) => {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) >= 0.9) return false;
      /* Below the fold is legitimate — it has not been reached yet. */
      return el.getBoundingClientRect().top < window.innerHeight;
    })
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: el.className.toString().split(' ').slice(0, 2).join('.'),
      top: Math.round(el.getBoundingClientRect().top),
      opacity: getComputedStyle(el).opacity,
    }));
  return { total: els.length, hidden };
}, scope);

const PAGES_WITH_SECTIONS = ['/index.html', '/publications.html', '/projects.html', '/links.html'];

describe('reveal: nothing on screen stays invisible', () => {
  /* Three widths, not five: desktop and mobile are where the reveal actually
     behaves differently, plus the narrowest phone as the worst case. */
  const WIDTHS = { desktop: VIEWPORTS.desktop, mobile: VIEWPORTS.mobile, small: VIEWPORTS.small };
  for (const [label, viewport] of Object.entries(WIDTHS)) {
    for (const path of PAGES_WITH_SECTIONS) {
      test(`${path} at ${label} (${viewport.width}px) after scrolling`, async () => {
        const page = await newPage(browser, server, { viewport });
        try {
          await page.goto(server.base + path, { waitUntil: 'networkidle' });
          await scrollThrough(page);
          await settleReveal(page);
          const { total, hidden } = await hiddenAnimated(page);
          assert.ok(total > 0, `${path} has no [data-animate] content — check the selector`);
          assert.deepEqual(hidden, [],
            `${hidden.length} element(s) on screen but invisible on ${path} @ ${viewport.width}px`);
        } finally { await page.close(); }
      });
    }
  }
});

describe('reveal: landing directly on a section shows it', () => {
  /* Clicking a nav item, or opening a shared deep link. Before the fix this
     left the whole target section at opacity 0 on mobile. */
  const ANCHORS = ['#about', '#projects', '#publications', '#places', '#contact'];
  for (const [label, viewport] of [['desktop', VIEWPORTS.desktop], ['mobile', VIEWPORTS.mobile]]) {
    for (const hash of ANCHORS) {
      test(`landing on ${hash} at ${label}`, async () => {
        const page = await newPage(browser, server, { viewport });
        try {
          await page.goto(server.base + '/index.html' + hash, { waitUntil: 'networkidle' });
          await settleReveal(page);
          const { hidden } = await hiddenAnimated(page, hash);
          assert.deepEqual(hidden, [],
            `${hash} rendered as a blank band at ${viewport.width}px`);
        } finally { await page.close(); }
      });
    }
  }
});

describe('reveal: clicking the nav shows the destination', () => {
  test('every in-page nav link lands on visible content (mobile)', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.mobile });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const hrefs = await page.$$eval('#navbar a[href^="#"]', (as) => as.map((a) => a.getAttribute('href')));
      assert.ok(hrefs.length > 0, 'expected in-page nav links');
      for (const href of hrefs) {
        await page.evaluate((h) => { window.location.hash = h; }, href);
        await settleReveal(page);
        const { hidden } = await hiddenAnimated(page, href);
        assert.deepEqual(hidden, [], `nav link ${href} lands on invisible content`);
      }
    } finally { await page.close(); }
  });
});

describe('reveal: degraded environments still show content', () => {
  test('with JavaScript disabled the server-rendered content is painted', async () => {
    /* The cards are rendered into the HTML precisely so a no-JS visitor and a
       crawler see real content. An unconditional `opacity: 0` would throw that
       away silently. */
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    await blockExternalRequests(page, server.base);
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'domcontentloaded' });
      const hidden = await page.$$eval('[data-animate]', (els) =>
        els.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
      assert.equal(hidden, 0, 'content is hidden when JavaScript is unavailable');

      const cards = await page.$$eval('.project-card', (els) => els.length);
      assert.ok(cards > 0, 'no server-rendered project cards without JS');
    } finally { await ctx.close(); }
  });

  test('with reduced motion everything is revealed immediately', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop, reducedMotion: 'reduce' });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await settleReveal(page);
      const hidden = await page.$$eval('[data-animate]', (els) =>
        els.filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.9).length);
      assert.equal(hidden, 0,
        'reduced motion must drop the entrance, not the content');
    } finally { await page.close(); }
  });
});

describe('content: the sections that carry the substance are populated', () => {
  test('homepage renders cards, publications and the world map', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await scrollThrough(page);
      const counts = await page.evaluate(() => ({
        projects: document.querySelectorAll('.project-card').length,
        publications: document.querySelectorAll('.pub-item').length,
        contacts: document.querySelectorAll('.contact-card').length,
        mapCountries: document.querySelectorAll('.world-map .wm-country').length,
        mapLand: document.querySelectorAll('.world-map .wm-land').length,
      }));
      assert.ok(counts.projects >= 3, `project cards: ${counts.projects}`);
      assert.ok(counts.publications >= 3, `publication items: ${counts.publications}`);
      assert.ok(counts.contacts >= 3, `contact cards: ${counts.contacts}`);
      assert.ok(counts.mapCountries > 10, `highlighted countries: ${counts.mapCountries}`);
      assert.ok(counts.mapLand > 0, 'the world map has no land silhouette');
    } finally { await page.close(); }
  });

  test('publications.html lists every paper', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/publications.html', { waitUntil: 'networkidle' });
      await scrollThrough(page);
      await settleReveal(page);
      const { total, visible } = await page.evaluate(() => {
        const items = [...document.querySelectorAll('.pub-item')];
        return {
          total: items.length,
          visible: items.filter((e) => parseFloat(getComputedStyle(e).opacity) >= 0.9).length,
        };
      });
      assert.ok(total >= 20, `expected the full publication list, got ${total}`);
      assert.equal(visible, total, `${total - visible} papers never became visible`);
    } finally { await page.close(); }
  });
});
