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
   The reading-progress bar (and once the hero parallax) used to be JavaScript:
   a scroll listener, a rAF, and — for the bar — a document height memoised
   behind a resize listener, a load listener and a ResizeObserver, because
   reading scrollHeight per scroll event forces a synchronous layout. Both are
   CSS scroll-progress timelines now (the parallax has since been removed).

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

  /* Decoration, so reduced motion drops it entirely. This is a media query
     in the stylesheet now rather than a prefersReducedMotion() branch at the
     top of an init function. (The hero parallax this test also covered is
     gone; the hero no longer stages copy over a background scene.) */
  test('reduced motion leaves the progress bar alone', async () => {
    const page = await newPage(browser, server, {
      viewport: VIEWPORTS.desktop, reducedMotion: 'reduce',
    });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await scrollTo(page, 600);

      const bar = await page.evaluate(() => +new DOMMatrix(
        getComputedStyle(document.getElementById('reading-progress')).transform).a.toFixed(3));
      assert.equal(bar, 0, 'the progress bar animated under reduced motion');
    } finally { await page.close(); }
  });
});

/* ─── The hero: the name through a receptive field ───────────────────────
   js/receptive-field.js paints the name as a pixel grid and swaps the text
   <h1> out of sight once it has. Everything here is about that swap and the
   controls, because those are the parts a static test cannot see: whether the
   canvas painted anything, whether the name is still the page's heading for a
   screen reader, and whether choosing a filter or moving the window actually
   changes the picture. */
describe('hero: the receptive field', () => {
  const canvasHash = (page) => page.evaluate(() => {
    const c = document.getElementById('field-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0, ink = 0;
    for (let i = 0; i < d.length; i += 4 * 5) { h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 3]) | 0; if (d[i + 3] > 0) ink++; }
    return { h, ink };
  });

  {
    const [label, viewport] = ['desktop', VIEWPORTS.desktop];
    test(`${label}: the grid paints, the name stays the heading, the controls work`, async () => {
      const page = await newPage(browser, server, { viewport });
      try {
        await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
        await page.waitForSelector('#hero.is-drawn', { timeout: 8000 });

        const first = await canvasHash(page);
        assert.ok(first.ink > 500, `the hero canvas is nearly blank (${first.ink} painted samples)`);

        const h1 = await page.evaluate(() => {
          const el = document.querySelector('#hero h1');
          return { text: el.textContent.trim(), count: document.querySelectorAll('h1').length };
        });
        assert.equal(h1.text, 'Stefano Masneri');
        assert.equal(h1.count, 1);
        assert.equal(await page.isVisible('.field-controls'), true, 'the filter controls were not revealed');

        await page.click('[data-filter="corners"]');
        await page.waitForTimeout(150);
        assert.equal(await page.getAttribute('[data-filter="corners"]', 'aria-pressed'), 'true');
        const corners = await canvasHash(page);
        assert.notEqual(corners.h, first.h, 'choosing a filter did not change the picture');

        await page.click('[data-filter="learned"]');
        await page.waitForTimeout(400);
        assert.equal(await page.isVisible('.field-next'), true, 'the learned filter offers the next kernel');
        assert.match(await page.textContent('.field-caption'), /Filter \d of 6/);

        /* Keyboard path: the range input moves the window. */
        const before = await canvasHash(page);
        await page.focus('#field-pos');
        for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(100);
        assert.notEqual((await canvasHash(page)).h, before.h, 'moving the range did not move the window');

        /* Pointer path: a horizontal drag across the grid. */
        const box = await page.locator('#field-canvas').boundingBox();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5, { steps: 5 });
        await page.mouse.up();
        const pos = Number(await page.inputValue('#field-pos'));
        assert.ok(pos > 850, `dragging to 90% left the range at ${pos}`);
      } finally { await page.close(); }
    });
  }

  /* A phone gets a still frame: the window parks at 70%, a touch is a scroll,
     and the move/kernel controls are gone — but the filter chips still work. */
  test('phone: a still frame at 70% whose filters still switch', async () => {
    const page = await newPage(browser, server, { viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await page.waitForSelector('#hero.is-drawn', { timeout: 8000 });
      await page.waitForTimeout(1900); // the intro sweep
      assert.equal(await page.inputValue('#field-pos'), '700', 'the window should park at 70%');
      assert.equal(await page.isVisible('#field-pos'), false, 'the range input should be hidden on a phone');
      assert.equal(await page.isVisible('.field-kernel'), false, 'the kernel readout should be hidden on a phone');

      const before = await canvasHash(page);
      assert.ok(before.ink > 500, `the hero canvas is nearly blank (${before.ink} painted samples)`);
      await page.tap('[data-filter="corners"]');
      await page.waitForTimeout(150);
      assert.notEqual((await canvasHash(page)).h, before.h, 'tapping a filter did not change the picture');

      const box = await page.locator('#field-canvas').boundingBox();
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      assert.equal(await page.inputValue('#field-pos'), '700', 'a drag moved the window on a phone');
    } finally { await page.close(); }
  });

  test('without JavaScript the name is plain text and no dead controls show', async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    try {
      await page.goto(server.base + '/index.html');
      assert.equal(await page.isVisible('#hero h1'), true, 'the name is hidden with JS off');
      assert.equal(await page.isVisible('.field-controls'), false, 'filter buttons showed with nothing to drive them');
    } finally { await ctx.close(); }
  });
});


/* ─── Career timeline (#191) ─────────────────────────────────────────────
   Two things only a browser can answer. On a desktop the whole edit must fit
   — a timeline you have to scroll to see 2024 on a 1440px screen has lost
   the one thing it is for, a career read at a glance. On a phone it cannot
   fit, so it must open on the present: the scroller is direction: rtl for
   exactly that, and a stylesheet change that dropped it would leave a phone
   visitor looking at 2000 and four empty lanes. */
describe('career timeline', () => {
  test('desktop: the whole edit fits without scrolling', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const m = await page.$eval('.edit-scroll', (el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      assert.ok(m.sw <= m.cw + 1, `the timeline scrolls at 1440 (${m.sw} in ${m.cw})`);
    } finally { await page.close(); }
  });

  test('phone: it opens on the present, with the lane names still in view', async () => {
    const page = await newPage(browser, server, { viewport: { width: 390, height: 844 } });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const r = await page.evaluate(() => {
        const box = document.querySelector('.edit-scroll').getBoundingClientRect();
        const latest = [...document.querySelectorAll('.edit-lane[data-lane="work"] .edit-clip')]
          .map((c) => c.getBoundingClientRect())
          .sort((a, b) => b.right - a.right)[0];
        const name = document.querySelector('.edit-lane-name').getBoundingClientRect();
        return { boxL: box.left, boxR: box.right, clipL: latest.left, clipR: latest.right, nameL: name.left };
      });
      assert.ok(r.clipR <= r.boxR + 1 && r.clipL >= r.boxL,
        `the latest role is not in view on load (${Math.round(r.clipL)}–${Math.round(r.clipR)} in ${Math.round(r.boxL)}–${Math.round(r.boxR)})`);
      assert.ok(Math.abs(r.nameL - r.boxL) <= 2, 'the lane names should be pinned to the left edge');
    } finally { await page.close(); }
  });
});
