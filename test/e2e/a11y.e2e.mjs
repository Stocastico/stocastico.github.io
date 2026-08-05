/* ─────────────────────────────────────────────────────────────────────────────
   a11y.e2e.mjs — axe-core over every built page, in both themes.

   Why here and not in `npm test`: the interesting accessibility failures are
   computed, not written. Contrast depends on what actually composited, a name
   depends on what the accessibility tree resolved, and "is this control
   focusable" depends on layout. None of that can be read out of a source file,
   which is the line CLAUDE.md draws between the two suites.

   This is a floor, not a ceiling. axe catches perhaps a third of real barriers
   and cannot tell you whether the heading text is *useful* — the project's own
   contrast harness (test/contrast.test.mjs) still does the more demanding
   colour work, measuring composited surfaces against WCAG AA rather than
   trusting --bg. What axe adds is everything nobody thought to write a test
   for: a duplicated id, a control that lost its name, a list whose children
   stopped being list items, a heading rank skipped by a refactor.

   Both themes are checked because they are different colour systems, not one
   with a filter over it — a pairing that passes in dark can fail in light, and
   light is the one nobody looks at.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

import {
  VIEWPORTS, allPages, launchBrowser, newPage, scrollThrough, settleReveal, startServer,
} from './harness.mjs';

const require = createRequire(import.meta.url);
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/* WCAG 2.1 A + AA. Best-practice rules are deliberately excluded: they encode
   opinions (such as "content must live in a landmark") that are worth reading
   once but not worth failing a deploy over. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

let server, browser;

before(async () => {
  server = await startServer();
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function analyse(path, theme, viewport = VIEWPORTS.desktop) {
  const page = await newPage(browser, server, { viewport });
  try {
    /* The site ignores prefers-color-scheme by design — light is a stored
       choice, re-applied by the <head> bootstrap before first paint. Emulating
       the media feature would silently test dark twice, which is exactly the
       bug the screenshot harness had. */
    if (theme === 'light') {
      await page.addInitScript(() => {
        try { localStorage.setItem('theme', 'light'); } catch { /* private mode */ }
      });
    }
    await page.goto(server.base + path, { waitUntil: 'networkidle' });
    /* Reveal first. Everything inside [data-animate] is opacity 0 until the
       scroll reveal runs, and axe skips what it considers hidden — so an
       unscrolled page would report a clean bill of health for content it never
       looked at. */
    await scrollThrough(page);
    await settleReveal(page);

    await page.evaluate(AXE_SOURCE);
    /* `return await`, not `return`: the finally below closes the page, and a
       bare return hands back a pending promise that the close then kills. */
    return await page.evaluate(async (tags) => {
      const res = await window.axe.run(document, {
        runOnly: { type: 'tag', values: tags },
        resultTypes: ['violations'],
      });
      return res.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
    }, TAGS);
  } finally {
    await page.close();
  }
}

describe('a11y: axe-core finds no WCAG A/AA violations', () => {
  for (const theme of ['dark', 'light']) {
    test(`every page passes in ${theme} mode`, async () => {
      const failures = [];
      for (const path of allPages()) {
        for (const v of await analyse(path, theme)) {
          failures.push(`${path} [${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.join('\n      ')}`);
        }
      }
      assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`);
    });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   The same sweep at phone width, with the mobile menu open.

   Everything above ran at 1440×900 and only at 1440×900, which left the two
   things most likely to break unaudited. The layout below 680px is a different
   one — the nav collapses behind a burger, the ⌘K chip is display:none, the
   theme controls move — and the open menu is the site's only hand-rolled focus
   trap. axe cannot see any of it in a viewport where the burger does not exist.

   Dark only, and a smaller page set: this is about the mobile *layout*, and the
   colour tokens it uses are the ones the pass above already measured in both
   themes on every page. Opening the menu is the point, so it is opened.
   ───────────────────────────────────────────────────────────────────────────── */
const MOBILE_PAGES = ['/index.html', '/cv.html', '/projects.html', '/travel.html', '/links.html'];

describe('a11y: the mobile layout passes too', () => {
  test('every main page passes at 390px', async () => {
    const failures = [];
    for (const path of MOBILE_PAGES) {
      for (const v of await analyse(path, 'dark', VIEWPORTS.mobile)) {
        failures.push(`${path} [${v.impact}] ${v.id}: ${v.help}\n      ${v.nodes.join('\n      ')}`);
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`);
  });

  test('the open mobile menu passes', async () => {
    const page = await newPage(browser, server, { viewport: VIEWPORTS.mobile });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await page.click('#nav-toggle');
      await page.waitForSelector('#nav-links.open');

      await page.evaluate(AXE_SOURCE);
      const violations = await page.evaluate(async (tags) => {
        const res = await window.axe.run(document, {
          runOnly: { type: 'tag', values: tags },
          resultTypes: ['violations'],
        });
        return res.violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} — `
          + v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', '));
      }, TAGS);
      assert.deepEqual(violations, [], `\n  ${violations.join('\n  ')}\n`);

      /* The trap itself, which axe cannot judge: Tab from the last item has to
         come back to the burger rather than escaping into the page behind. */
      const trapped = await page.evaluate(() => {
        const links = [...document.querySelectorAll('#nav-links a')];
        links[links.length - 1].focus();
        return document.activeElement === links[links.length - 1];
      });
      assert.ok(trapped, 'could not focus the last menu link');
      await page.keyboard.press('Tab');
      const backAtToggle = await page.evaluate(() => document.activeElement?.id);
      assert.equal(backAtToggle, 'nav-toggle',
        'Tab from the last menu link escaped the open menu instead of wrapping to the burger');
    } finally {
      await page.close();
    }
  });
});
