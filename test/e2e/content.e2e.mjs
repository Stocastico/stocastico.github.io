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

  /* The stats used to be zeroed at DOMContentLoaded so the count-up had a
     starting point, and only restored when the observer fired at 60%
     visibility. Printing scrolls nothing, so Ctrl+P on a freshly-landed page
     printed "0 Countries / 0+ Publications / 0+ Years Exp." — the same shape as
     the reveal-on-print bug the CSS already guards, but on textContent, which
     no stylesheet can restore. Asserted without scrolling, which is the whole
     point: scrolling first would fire the observer and hide the bug. */
  test('the About stats never show zero, even unscrolled (print path)', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await page.emulateMedia({ media: 'print' });
      await page.waitForTimeout(300);
      const values = await page.$$eval('.stat-number[data-count]', (els) =>
        els.map((e) => ({ shown: e.textContent.trim(), want: e.dataset.count })));
      assert.ok(values.length >= 3, `expected 3 stats, got ${values.length}`);
      for (const { shown, want } of values) {
        assert.equal(shown, want, `a stat printed as "${shown}" instead of "${want}"`);
      }
    } finally { await page.close(); }
  });
});

/* ─── Scroll-driven animations ────────────────────────────────────────────
   The reading-progress bar and the hero parallax used to be JavaScript: a
   scroll listener, a rAF, and — for the bar — a document height memoised
   behind a resize listener, a load listener and a ResizeObserver, because
   reading scrollHeight per scroll event forces a synchronous layout. Both are
   CSS scroll-progress timelines now.

   That move is only safe if the effects actually still happen, and nothing in
   the static suite can tell: `animation-timeline: scroll(root block)` is a
   string in a stylesheet until a browser resolves it against a real scroll
   position. These assert the resolved values. */
describe('scroll-driven animations replace the old scroll handlers', () => {
  /* html has `scroll-behavior: smooth`, so window.scrollTo() animates and a
     fixed timeout lands mid-flight — which reads as the effect being wrong by
     a few percent rather than as a measurement taken too early. Wait for
     scrollY to stop moving before reading anything off the timeline. */
  const scrollTo = async (page, y) => {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    let last = -1;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(50);
      const now = await page.evaluate(() => Math.round(window.scrollY));
      if (now === last) return now;
      last = now;
    }
    return last;
  };
  test('the reading-progress bar tracks scroll and reaches 100% at the bottom', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });

      const scaleX = () => page.evaluate(() => {
        const el = document.getElementById('reading-progress');
        return +new DOMMatrix(getComputedStyle(el).transform).a.toFixed(3);
      });

      assert.equal(await scaleX(), 0, 'the bar should be empty at the top');

      await scrollTo(page, 600);
      const mid = await scaleX();
      assert.ok(mid > 0 && mid < 1, `the bar read ${mid} part-way down the page`);

      /* Repeated, because the page grows as the scroll reveal fires and the
         lazy renders land. Self-correcting is the point: the JS version cached
         the document height and needed a ResizeObserver on <body> to notice
         exactly this, and showed 100% early whenever that cache went stale. */
      for (let i = 0; i < 4; i++) {
        const target = await page.evaluate(() => document.documentElement.scrollHeight);
        await scrollTo(page, target);
      }
      assert.equal(await scaleX(), 1, 'the bar should be full at the bottom of the page');
    } finally { await page.close(); }
  });

  /* The keyframe is `translate: 0 var(--hero-drift)` over a 0→100dvh range, so
     the copy should have moved that fraction of the scroll. Read the fraction
     off the element rather than hard-coding it: this used to assert a literal
     0.28 — "the ratio the JS used" — which made the number look like the
     invariant when the real one is the test below it. 0.28 was in fact the bug. */
  test('the hero copy parallaxes by the drift the stylesheet declares', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });

      const translateY = () => page.evaluate(() => {
        const t = getComputedStyle(document.querySelector('.hero-content')).translate;
        const parts = String(t).split(/\s+/);
        return parts.length > 1 ? parseFloat(parts[1]) : 0;
      });

      assert.equal(await translateY(), 0, 'the hero copy should start unmoved');

      /* A custom property is not resolved at computed-value time, so this comes
         back as the authored token ("20dvh") and the number in front of it is
         the percentage of the range. */
      const rate = await page.evaluate(() => parseFloat(
        getComputedStyle(document.querySelector('.hero-content'))
          .getPropertyValue('--hero-drift')) / 100);
      assert.ok(rate > 0, 'the stylesheet should declare a non-zero --hero-drift');

      const at = await scrollTo(page, 300);
      const y = await translateY();
      const expected = at * rate;
      assert.ok(Math.abs(y - expected) < 1,
        `hero translated ${y}px at ${at}px of scroll, expected about ${expected}px`);
    } finally { await page.close(); }
  });

  /* The invariant that actually matters, and the one nothing was asserting.

     #hero clips (overflow: hidden) and the copy inside it is vertically centred
     and drifting *down*, so the drift is bounded by the space underneath — and
     28dvh was past that bound on any window shorter than about 1100px. A
     visitor on a 650px-tall laptop window, a few hundred pixels down the page,
     got the "draw it a digit" aside cut in half and then the Download CV button
     after it. Every static assertion in the repo was green, because the markup
     was perfect; the pixels were not.

     Short viewport, several scroll positions, and the question asked of the
     elements rather than of the effect: is the bottom of this still inside the
     box that clips it. */
  test('nothing in the hero is clipped by the hero at any scroll position', async () => {
    const page = await newPage(browser, server, { viewport: { width: 1440, height: 650 } });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      /* The aside is revealed only once a hero scene has painted. */
      await page.waitForSelector('.hero-cnn-link:not([hidden])', { timeout: 8000 }).catch(() => {});

      for (const to of [0, 150, 300, 450, 600]) {
        await scrollTo(page, to);
        const spill = await page.evaluate(() => {
          const heroBottom = document.getElementById('hero').getBoundingClientRect().bottom;
          return ['.hero-actions', '.hero-cnn-link', '.hero-tagline', '.hero-location']
            .map((sel) => {
              const el = document.querySelector(sel);
              if (!el || el.hidden || getComputedStyle(el).display === 'none') return null;
              const over = el.getBoundingClientRect().bottom - heroBottom;
              return over > 1 ? `${sel} hangs ${Math.round(over)}px below the hero` : null;
            })
            .filter(Boolean);
        });
        assert.deepEqual(spill, [], `at ${to}px of scroll: ${spill.join('; ')}`);
      }
    } finally { await page.close(); }
  });

  /* Both effects are decoration, so reduced motion drops them entirely. This
     is a media query in the stylesheet now rather than a prefersReducedMotion()
     branch at the top of two init functions. */
  test('reduced motion leaves both of them alone', async () => {
    const page = await newPage(browser, server, {
      viewport: VIEWPORTS.desktop, reducedMotion: 'reduce',
    });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await scrollTo(page, 600);

      const state = await page.evaluate(() => ({
        bar: +new DOMMatrix(
          getComputedStyle(document.getElementById('reading-progress')).transform).a.toFixed(3),
        hero: getComputedStyle(document.querySelector('.hero-content')).translate,
      }));
      assert.equal(state.bar, 0, 'the progress bar animated under reduced motion');
      assert.equal(state.hero, 'none', 'the hero parallaxed under reduced motion');
    } finally { await page.close(); }
  });
});
