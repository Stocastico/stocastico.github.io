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

describe('layout: nothing is pushed outside the viewport', () => {
  /* This asserted `doc.scrollWidth <= doc.clientWidth` for most of its life,
     which made it a test that could not fail.

     css/styles.css puts `overflow-x: clip` on both html and body (§2). A clip
     container is not a scroll container, so its scrollWidth is its clientWidth
     no matter what sticks out of it — the early return on line 1 was therefore
     always taken and the per-element loop below it was unreachable code.
     Measured directly: injecting a 3000px-wide <div> into a 390px viewport
     left scrollWidth at 390 and the assertion green. Fifteen pages times three
     viewports of assertions, none of which could ever go red.

     Two real bugs went through the gap, and both are the same shape — content
     pushed off the right edge with no scrollbar to admit it:

       · the navbar between 681 and 835px (the ⌘K chip up to 146px off-screen,
         "Contact" entirely gone below ~705px, both still keyboard-focusable);
       · the five-column table on projects/aroundtheworld.html at 390px, whose
         last column started 15px past the right edge.

     So the question has to be asked of each element about the viewport, never
     of the document about itself: `overflow-x: clip` converts every horizontal
     overflow from a visible scrollbar into silent truncation, which is exactly
     the failure mode a layout test exists to catch. Clipping is not overflow.

     What is deliberately not a failure: an element sticking out of an ancestor
     that clips or scrolls on purpose (.table-scroll, a rounded card, a canvas
     box). The ancestor walk below stops *before* body precisely because
     html/body carry the clip — including them would make every element
     "handled by an ancestor" and hand the test straight back its no-op. */
  const BANDS = [
    ['mobile', VIEWPORTS.mobile],
    ['small', VIEWPORTS.small],
    ['tablet', VIEWPORTS.tablet],
    /* 820px is iPad portrait and the widest width at which the navbar used to
       clip. It is here because a breakpoint set slightly too low looks
       identical to a correct one at every other width in this list. */
    ['tablet-wide', { width: 820, height: 1180 }],
  ];

  for (const [label, viewport] of BANDS) {
    test(`nothing sits outside the viewport at ${label} (${viewport.width}px)`, async () => {
      const failures = [];
      for (const path of allPages()) {
        const page = await newPage(browser, server, { viewport });
        try {
          await page.goto(server.base + path, { waitUntil: 'networkidle' });
          await scrollThrough(page);
          const offenders = await page.evaluate(() => {
            const vw = document.documentElement.clientWidth;
            const slack = 2;   /* sub-pixel rounding */
            const out = [];

            /* True when something between el and <body> deliberately clips or
               scrolls, so the overflow is contained and reachable. */
            const containedByAncestor = (el) => {
              for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                const ox = getComputedStyle(p).overflowX;
                if (ox && ox !== 'visible') return true;
              }
              return false;
            };

            for (const el of document.querySelectorAll('body *')) {
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden') continue;
              const r = el.getBoundingClientRect();
              /* Tracking pixels and 1x1 .visually-hidden clips are parked
                 off-canvas on purpose. */
              if (r.width <= 2 || r.height <= 2) continue;
              if (el.closest('.visually-hidden')) continue;
              const over = Math.max(r.right - vw, -r.left);
              if (over <= slack) continue;
              if (containedByAncestor(el)) continue;
              out.push({
                over: Math.round(over),
                side: (r.right - vw) >= -r.left ? 'right' : 'left',
                tag: el.tagName.toLowerCase(),
                cls: el.className.toString().slice(0, 50),
                text: (el.textContent || '').trim().slice(0, 30),
              });
            }
            /* Widest first — the outermost offender is usually the cause and
               the rest are its children riding along. */
            out.sort((a, b) => b.over - a.over);
            return out.slice(0, 5);
          });
          if (offenders.length) failures.push(`${path}: ${JSON.stringify(offenders)}`);
        } finally { await page.close(); }
      }
      assert.deepEqual(failures, []);
    });
  }

  /* The guard on the guard. The assertion above is only meaningful while it
     can still see an element that leaves the viewport — and the reason it
     stopped being meaningful last time was a stylesheet change nowhere near
     this file. So plant one and require the detector to find it. */
  test('the detector actually detects (canary)', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.mobile });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'load' });
      const found = await page.evaluate(() => {
        const canary = document.createElement('div');
        canary.style.cssText = 'width:3000px;height:80px';
        canary.className = 'overflow-canary';
        document.body.appendChild(canary);
        const vw = document.documentElement.clientWidth;
        const r = canary.getBoundingClientRect();
        const seen = (r.right - vw) > 2;
        canary.remove();
        return { seen, right: Math.round(r.right), viewport: vw };
      });
      assert.ok(
        found.seen,
        `a 3000px-wide element was not registered as leaving the ${found.viewport}px viewport `
        + `(measured right edge ${found.right}) — the overflow detector above is a no-op`,
      );
    } finally { await page.close(); }
  });
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
