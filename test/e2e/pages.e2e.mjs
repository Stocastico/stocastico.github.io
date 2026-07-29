/* ─────────────────────────────────────────────────────────────────────────────
   pages.e2e.mjs — every page, at every width, loads clean.

   The page list is read from dist/ rather than hard-coded, so adding a page
   adds coverage automatically instead of quietly shipping untested.

   The layout assertions here are the cheap kind that catch expensive bugs: a
   page that scrolls sideways, text that has overflowed its box, an element
   pushed off-screen. None of these can be seen without a layout engine, which
   is why none of the 780 static tests can see them.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';

import {
  VIEWPORTS, allPages, blockExternalRequests, collectPageErrors, launchBrowser, newPage, scrollThrough, startServer,
} from './harness.mjs';

let server, browser, PAGES;

before(async () => {
  server = await startServer();
  browser = await launchBrowser();
  PAGES = allPages();
  assert.ok(PAGES.length >= 8, `expected the built site, found ${PAGES.length} pages`);
});
after(async () => {
  await browser?.close();
  await server?.close();
});

describe('smoke: every page loads without errors', () => {
  test('no console errors or uncaught exceptions on any page', async () => {
    const failures = [];
    for (const path of allPages()) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
      const errors = collectPageErrors(page);
      try {
        const res = await page.goto(server.base + path, { waitUntil: 'networkidle' });
        if (path !== '/404.html' && res && res.status() >= 400) {
          failures.push(`${path}: HTTP ${res.status()}`);
        }
        await scrollThrough(page);
        if (errors.length) failures.push(`${path}: ${errors.join(' | ')}`);
      } finally { await page.close(); }
    }
    assert.deepEqual(failures, []);
  });

  test('every page has a non-empty, unique title', async () => {
    const titles = new Map();
    for (const path of allPages()) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
      try {
        await page.goto(server.base + path, { waitUntil: 'domcontentloaded' });
        const title = (await page.title()).trim();
        assert.ok(title.length > 0, `${path} has an empty <title>`);
        assert.ok(!titles.has(title), `${path} duplicates the title of ${titles.get(title)}: "${title}"`);
        titles.set(title, path);
      } finally { await page.close(); }
    }
  });

  test('every page renders a main landmark and a level-1 heading', async () => {
    for (const path of allPages()) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
      try {
        await page.goto(server.base + path, { waitUntil: 'domcontentloaded' });
        const shape = await page.evaluate(() => ({
          main: !!document.querySelector('main, [role="main"]'),
          h1: document.querySelectorAll('h1').length,
        }));
        assert.ok(shape.main, `${path} has no <main> landmark`);
        assert.equal(shape.h1, 1, `${path} has ${shape.h1} <h1> elements, expected exactly 1`);
      } finally { await page.close(); }
    }
  });
});

describe('layout: nothing overflows sideways', () => {
  /* A horizontal scrollbar on a phone is the single most common CSS
     regression, and it is invisible to any test that does not do layout. */
  for (const [label, viewport] of [['mobile', VIEWPORTS.mobile], ['small', VIEWPORTS.small], ['tablet', VIEWPORTS.tablet]]) {
    test(`no horizontal overflow at ${label} (${viewport.width}px)`, async () => {
      const failures = [];
      for (const path of allPages()) {
        const page = await newPage(browser, server, { viewport });
        try {
          await page.goto(server.base + path, { waitUntil: 'networkidle' });
          await scrollThrough(page);
          const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            const slack = 2;   /* sub-pixel rounding */
            if (doc.scrollWidth <= doc.clientWidth + slack) return null;
            /* Name the widest offender, so a failure is actionable. */
            let worst = null;
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              const over = r.right - doc.clientWidth;
              if (over > slack && (!worst || over > worst.over)) {
                worst = { over: Math.round(over), tag: el.tagName.toLowerCase(), cls: el.className.toString().slice(0, 60) };
              }
            }
            return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, worst };
          });
          if (overflow) failures.push(`${path}: ${JSON.stringify(overflow)}`);
        } finally { await page.close(); }
      }
      assert.deepEqual(failures, []);
    });
  }
});

describe('layout: text is not clipped by its container', () => {
  test('no visible text overflows its box at 375px', async () => {
    /* The narrowest common phone. Reported once already as "text overflowing
       the small rectangles" on iPhone. */
    const failures = [];
    for (const path of allPages()) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.small });
      try {
        await page.goto(server.base + path, { waitUntil: 'networkidle' });
        await scrollThrough(page);
        const clipped = await page.evaluate(() => {
          const bad = [];
          const SELECTORS = '.project-card, .pub-item, .contact-card, .link-card, .btn, .skill-tag, .project-tag';
          for (const el of document.querySelectorAll(SELECTORS)) {
            const cs = getComputedStyle(el);
            if (cs.overflow === 'hidden' || cs.overflowX === 'hidden') continue;
            if (el.scrollWidth > el.clientWidth + 2) {
              bad.push(`${el.className.toString().split(' ')[0]} (${el.scrollWidth} > ${el.clientWidth})`);
            }
          }
          return bad;
        });
        if (clipped.length) failures.push(`${path}: ${clipped.join(', ')}`);
      } finally { await page.close(); }
    }
    assert.deepEqual(failures, []);
  });
});

describe('assets: nothing 404s', () => {
  test('every request a page makes succeeds', async () => {
    const failures = [];
    for (const path of allPages()) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
      const bad = [];
      page.on('response', (res) => {
        const url = res.url();
        if (url.includes('goatcounter')) return;      /* external, offline in CI */
        if (res.status() >= 400) bad.push(`${res.status()} ${url.replace(server.base, '')}`);
      });
      try {
        await page.goto(server.base + path, { waitUntil: 'networkidle' });
        await scrollThrough(page);
        if (bad.length) failures.push(`${path}: ${bad.join(', ')}`);
      } finally { await page.close(); }
    }
    assert.deepEqual(failures, []);
  });
});
