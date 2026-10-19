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

        /* Only a dropdown: no kernel readout, no caption, no range input. */
        for (const gone of ['.field-kernel', '.field-caption', '#field-pos', '.field-next', '[data-filter]']) {
          assert.equal(await page.locator(gone).count(), 0, `${gone} is back in the hero`);
        }
        const options = await page.$$eval('#field-filter option', (os) => os.map((o) => o.value));
        assert.ok(!options.includes('corners'), 'Corners is back in the menu');

        await page.selectOption('#field-filter', 'vertical');
        await page.waitForTimeout(150);
        const vertical = await canvasHash(page);
        assert.notEqual(vertical.h, first.h, 'choosing a filter did not change the picture');

        await page.selectOption('#field-filter', 'learned');
        await page.waitForTimeout(400);
        assert.notEqual((await canvasHash(page)).h, vertical.h, 'the learned filter did not change the picture');

        /* Pointer path: a horizontal drag across the grid moves the window. */
        const before = await canvasHash(page);
        const box = await page.locator('#field-canvas').boundingBox();
        await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 5 });
        await page.mouse.up();
        assert.notEqual((await canvasHash(page)).h, before.h, 'dragging did not move the window');

        /* A small menu, and no link out of the hero (cut in review). */
        const menu = await page.locator('#field-filter').boundingBox();
        assert.ok(menu.height <= 30, `the filter menu is ${Math.round(menu.height)}px tall`);
        assert.equal(await page.locator('#hero a[href*="mnist-lenet"]').count(), 0, 'the hero links to the CNN page again');
      } finally { await page.close(); }
    });
  }

  /* A phone gets a still frame: the window parks at 70%, a touch is a scroll,
     and the move/kernel controls are gone — but the filter chips still work. */
  test('phone: a still frame whose filter still switches, and a drag does not move it', async () => {
    const page = await newPage(browser, server, { viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await page.waitForSelector('#hero.is-drawn', { timeout: 8000 });
      await page.waitForTimeout(1900); // the intro sweep

      const before = await canvasHash(page);
      assert.ok(before.ink > 500, `the hero canvas is nearly blank (${before.ink} painted samples)`);
      const box = await page.locator('#field-canvas').boundingBox();
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 4 });
      await page.mouse.up();
      assert.equal((await canvasHash(page)).h, before.h, 'a drag moved the window on a phone');

      await page.selectOption('#field-filter', 'horizontal');
      await page.waitForTimeout(150);
      assert.notEqual((await canvasHash(page)).h, before.h, 'choosing a filter did not change the picture');
    } finally { await page.close(); }
  });

  test('without JavaScript the name is plain text and no dead controls show', async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    try {
      await page.goto(server.base + '/index.html');
      assert.equal(await page.isVisible('#hero h1'), true, 'the name is hidden with JS off');
      assert.equal(await page.isVisible('.field-controls'), false, 'the filter menu showed with nothing to drive it');
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

/* ─── Career timeline, pinned and scrubbed (desktop) ─────────────────────
   On a wide screen with motion allowed, the timeline section pins to the
   viewport and the vertical scroll drives the edit sideways — three screens
   of timeline, explored from 2000 to the present — and then lets go. Pure
   CSS (position: sticky + a view timeline), so every claim here is about what
   the browser resolved: what is on screen at each point of the scroll. */
describe('career timeline: pinned horizontal scrub', () => {
  const settle = async (page, y) => {
    await page.evaluate((to) => window.scrollTo({ top: to, behavior: 'instant' }), y);
    await page.waitForTimeout(250);
  };
  const state = (page) => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const track = document.querySelector('.edit-lane[data-lane="work"] .edit-track').getBoundingClientRect();
    const win = document.querySelector('.edit').getBoundingClientRect();
    const clips = [...document.querySelectorAll('.edit-lane[data-lane="work"] .edit-clip')]
      .map((c) => c.getBoundingClientRect());
    const first = clips.sort((a, b) => a.left - b.left)[0];
    const last = clips[clips.length - 1];
    const stage = document.querySelector('.edit-stage').getBoundingClientRect();
    const inWin = (r) => r.right > win.left + 120 && r.left < win.right;
    return { vw, trackW: track.width, winW: win.width, firstIn: inWin(first), lastIn: inWin(last), stageTop: stage.top };
  });

  test('pins, scrubs from 2000 to the present, and lets go', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const pin = await page.$eval('.edit-pin', (el) => ({ top: el.getBoundingClientRect().top + scrollY, h: el.offsetHeight }));
      assert.ok(pin.h >= 2.5 * 900, `the pinned run is only ${pin.h}px — it should give the scrub ~3 screens`);

      await settle(page, pin.top);
      const start = await state(page);
      assert.ok(start.trackW > 2.5 * start.winW, 'the edit should be ~3 windows wide while pinned');
      assert.ok(start.firstIn && !start.lastIn, 'at the start the past is on screen and the present is not');

      await settle(page, pin.top + (pin.h - 900) / 2);
      const mid = await state(page);
      assert.ok(Math.abs(mid.stageTop) <= 2, `the stage should be pinned mid-scrub (top ${mid.stageTop})`);

      /* Bold, not boxed: mid-run the edit is the whole screen — edge to edge,
         and most of the height under the navbar. */
      const fill = await page.evaluate(() => {
        const r = document.querySelector('.edit').getBoundingClientRect();
        const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68;
        return { l: r.left, r: r.right, h: r.height, vw: document.documentElement.clientWidth, avail: innerHeight - nav };
      });
      assert.ok(fill.l <= 1 && fill.r >= fill.vw - 1,
        `the edit spans ${Math.round(fill.l)}–${Math.round(fill.r)} of a ${fill.vw}px screen`);
      assert.ok(fill.h >= 0.8 * fill.avail, `the edit is ${Math.round(fill.h)}px of ${Math.round(fill.avail)}px`);

      await settle(page, pin.top + pin.h - 900);
      const end = await state(page);
      assert.ok(end.lastIn && !end.firstIn, 'at the end the present is on screen and 2000 has gone by');

      await settle(page, pin.top + pin.h + 200);
      const after = await state(page);
      assert.ok(after.stageTop < -100, 'after the run the stage scrolls away with the page');
    } finally { await page.close(); }
  });

  test('reduced motion: no pin, the whole edit in one window', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop, reducedMotion: 'reduce' });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const h = await page.$eval('.edit-pin', (el) => el.offsetHeight);
      assert.ok(h < 900, `the timeline is still pinned under reduced motion (${h}px)`);
      const s = await state(page);
      assert.ok(s.firstIn && s.lastIn, 'the whole edit should be visible at once');
    } finally { await page.close(); }
  });

  test('keyboard: focusing a clip un-pins the edit so the clip is on screen', async () => {
    /* A clip translated out of the window would take focus while invisible
       (WCAG 2.4.7). Tabbing into the edit switches it back to the whole-edit
       layout, where every clip is in view. */
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const last = page.locator('.edit-lane[data-lane="projects"] .edit-clip a').last();
      await last.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
      const box = await last.boundingBox();
      const win = await page.locator('.edit').boundingBox();
      assert.ok(box && box.x >= win.x && box.x + box.width <= win.x + win.width + 1,
        'the focused clip is outside the visible edit');
    } finally { await page.close(); }
  });
});

/* ─── Projects as a media bin (#192) ────────────────────────────────────
   Every card opens on a 16:9 frame. The thumbnails are served from public/ at
   the URL the card names — a missing one is a broken-image icon on the
   portfolio page that no static test can see. The homepage is checked after
   the client-side reshuffle too: it builds the same URLs in JS, which is what
   broke when the files sat under img/ and the build hashed only the HTML. */
describe('projects: the media bin', () => {
  test('every frame is 16:9 and painted: a loaded thumbnail or the colour bars', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/projects.html', { waitUntil: 'networkidle' });
      await page.$$eval('.project-card__thumb img', (imgs) => imgs.forEach((i) => { i.loading = 'eager'; }));
      await page.waitForFunction(() => [...document.querySelectorAll('.project-card__thumb img')].every((i) => i.complete));
      const frames = await page.$$eval('#projects-grid .project-card__thumb', (els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        const img = el.querySelector('img');
        return {
          ratio: r.width / r.height,
          img: img ? img.naturalWidth : null,
          bars: getComputedStyle(el, '::before').backgroundImage.includes('gradient'),
        };
      }));
      assert.ok(frames.length >= 15, `only ${frames.length} frames`);
      for (const [i, f] of frames.entries()) {
        assert.ok(Math.abs(f.ratio - 16 / 9) < 0.02, `frame ${i} is ${f.ratio.toFixed(3)}:1`);
        assert.ok(f.img === null ? f.bars : f.img > 0, `frame ${i} painted nothing (img ${f.img}, bars ${f.bars})`);
      }
      assert.ok(frames.some((f) => f.img === null), 'expected at least one colour-bars frame');
    } finally { await page.close(); }
  });

  test('homepage: the reshuffled cards load their thumbnails as well', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await page.$$eval('#projects-grid img', (imgs) => imgs.forEach((i) => { i.loading = 'eager'; }));
      await page.waitForFunction(() => [...document.querySelectorAll('#projects-grid img')].every((i) => i.complete));
      const widths = await page.$$eval('#projects-grid img', (imgs) => imgs.map((i) => [i.getAttribute('src'), i.naturalWidth]));
      assert.equal(widths.length, 3);
      for (const [src, w] of widths) assert.ok(w > 0, `${src} did not load`);
    } finally { await page.close(); }
  });
});

/* ─── Slides: About and the title cards hold while you scroll ────────────
   On a desktop the homepage reads like a deck. About is one screen that
   stays put for a couple of scrolls, with a bar under the navbar filling as
   you go; each title card (Career, Projects, Publications) is a screen with
   the title and one line of subtitle that stays put for one scroll. Then the
   page moves on. Pure CSS — a sticky stage in a taller pin, and a view
   timeline for the bar — so everything here asks what the browser resolved. */
describe('slides', () => {
  const nav = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68);
  const pinTop = (page, sel) => page.$eval(sel, (el) => el.getBoundingClientRect().top + scrollY);
  const go = async (page, y) => {
    await page.evaluate((to) => window.scrollTo({ top: to, behavior: 'instant' }), y);
    await page.waitForTimeout(350);
  };
  const progress = (page, sel) => page.$eval(`${sel} .slide-progress`, (el) => {
    const m = getComputedStyle(el).scale;
    return m === 'none' ? 1 : parseFloat(m);
  });

  for (const viewport of [{ width: 1920, height: 1080 }, VIEWPORTS.desktop, { width: 1440, height: 720 }, { width: 1280, height: 640 }, { width: 1100, height: 640 }]) {
    test(`desktop ${viewport.width}×${viewport.height}: About holds for a couple of screens, all of it in view`, async () => {
      const page = await newPage(browser, server, { viewport });
      try {
        await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
        const vh = viewport.height;
        const navH = await nav(page);
        const pin = '#about .slide-pin';
        const h = await page.$eval(pin, (el) => el.offsetHeight);
        assert.ok(h >= 2.4 * vh, `About holds for only ${Math.round(h / vh * 10) / 10} screens`);

        const top = await pinTop(page, pin);
        const look = () => page.evaluate((n) => {
          const parts = ['.section-title', '.photo-card', '.about-text-col p:last-of-type', '.social-links', '.stats-row']
            .map((q) => [q, document.querySelector(`#about ${q}`).getBoundingClientRect()]);
          return { stage: document.querySelector('#about .slide-stage').getBoundingClientRect().top,
            out: parts.filter(([, r]) => r.top < n - 1 || r.bottom > innerHeight + 1).map(([q, r]) => `${q} ${Math.round(r.top)}–${Math.round(r.bottom)}`),
            textW: document.querySelector('#about .about-text-col').getBoundingClientRect().width };
        }, navH);

        await go(page, top + 10);
        await page.waitForTimeout(900); // the reveal
        const first = await look();
        assert.equal(first.out.length, 0, `not all of About fits on the screen: ${first.out.join(', ')}`);
        const p0 = await progress(page, '#about');

        await go(page, top + vh);
        const held = await look();
        assert.ok(Math.abs(held.stage) <= 1, `About did not hold (stage at ${held.stage})`);
        assert.equal(held.out.length, 0, `About moved while held: ${held.out.join(', ')}`);
        assert.ok(await progress(page, '#about') > p0 + 0.2, 'the progress bar did not advance while held');
        if (viewport.width >= 1440) assert.ok(first.textW >= 640, `the text column is only ${Math.round(first.textW)}px wide`);
        /* An external display: the bio widens with it rather than sitting in a
           1180px strip in the middle of a 1920px screen. */
        if (viewport.width >= 1900) assert.ok(first.textW >= 1000, `the text column is only ${Math.round(first.textW)}px wide on a ${viewport.width}px display`);

        await go(page, top + h + 50);
        assert.ok((await look()).stage < -50, 'About never lets go');
      } finally { await page.close(); }
    });
  }

  for (const viewport of [VIEWPORTS.desktop, { width: 1100, height: 800 }]) {
    test(`desktop ${viewport.width}: Career, Projects and Publications open on a title card that holds for a scroll`, async () => {
      const page = await newPage(browser, server, { viewport });
      try {
        await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
        const vh = viewport.height;
        assert.equal((await page.textContent('#career .title-card .section-title')).trim(), 'The story so far');
        assert.equal((await page.textContent('#career .title-card .section-subtitle')).replace(/\s+/g, ' ').trim(),
          'Work, study and the cities they happened in. More details in my CV.');
        for (const id of ['career', 'projects', 'publications']) {
          const pin = `#${id} .slide-pin--title`;
          const top = await pinTop(page, pin);
          await go(page, top + 10);
          await page.waitForTimeout(900); // the reveal
          await go(page, top + vh * 0.6);
          const r = await page.evaluate((sel) => {
            const pinEl = document.querySelector(sel);
            const card = pinEl.querySelector('.title-card');
            const sub = card.querySelector('.section-subtitle');
            let next = pinEl.nextElementSibling;
            while (next && !next.getBoundingClientRect().height) next = next.nextElementSibling;
            return { cardTop: card.getBoundingClientRect().top, subH: sub.getBoundingClientRect().height,
              lh: parseFloat(getComputedStyle(sub).lineHeight), subText: sub.textContent,
              nextTop: next ? next.getBoundingClientRect().top : Infinity };
          }, pin);
          assert.ok(Math.abs(r.cardTop) <= 1, `#${id}'s title card did not hold (top ${Math.round(r.cardTop)})`);
          assert.ok(r.nextTop >= vh - 1, `#${id}: what follows the title card is on screen while it holds`);
          assert.ok(r.subH < r.lh * 1.5, `#${id}'s subtitle runs to ${Math.round(r.subH / r.lh)} lines`);
          assert.doesNotMatch(r.subText, /\b(bin|clips?|edit|cut|reel|footage)\b/i, `#${id}'s subtitle talks media again`);
        }
      } finally { await page.close(); }
    });
  }

  test('reduced motion: nothing holds', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop, reducedMotion: 'reduce' });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const hs = await page.$$eval('.slide-pin', (els) => els.map((el) => el.offsetHeight));
      for (const h of hs) assert.ok(h <= 900 * 1.2, `a ${h}px pin under reduced motion`);
    } finally { await page.close(); }
  });

  test('phone: no title card takes a screen', async () => {
    const page = await newPage(browser, server, { viewport: { width: 390, height: 844 } });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      const hs = await page.$$eval('.title-card', (els) => els.map((el) => el.getBoundingClientRect().height));
      for (const h of hs) assert.ok(h < 0.6 * 844, `a ${Math.round(h)}px title card on a phone`);
    } finally { await page.close(); }
  });
});
