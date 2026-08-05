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

/* ─────────────────────────────────────────────────────────────────────────────
   Forced colours: nothing that has text may be painted with invisible ink.

   Windows High Contrast (and any `forced-colors: active` mode) replaces the
   author palette with the user's own. It overrides `color`, `fill`, `stroke`
   and the rest — but **not** `-webkit-text-fill-color`. This site sets that to
   `transparent` on every gradient-clipped heading, painting the letterforms
   from a `background-clip: text` gradient instead. Take the background away
   and the text is not restyled, it is gone: the hero name, every section
   title, and the 404 page's giant "404" rendered as blank space.

   css/styles.css carries the reset, next to the print block that fixes the
   identical failure for the identical reason (backgrounds are not printed
   either). This test is what keeps that from rotting.

   It derives the set instead of listing it. Hardcoding `.hero-name`,
   `.section-title`, `.globe-title` is what the CSS already does, and asserting
   the same three names back would only prove the rule was copied correctly —
   it would say nothing about a fourth heading someone adds later. So the page
   is measured twice: once normally, to find every element that actually paints
   its text transparently, and again under forced colours, to insist none of
   them still does. That is how `.error-code` was caught: it lives in
   404.html's own inline <style>, so it was never going to appear in a list
   derived from the stylesheet — and being inline and later in the document, it
   would have beaten a rule added to css/styles.css at equal specificity.
   ───────────────────────────────────────────────────────────────────────────── */
/* Tag every element whose text is painted with a transparent fill, and return
   how they can be identified in a failure message.

   The transparency test is written out inside each function rather than shared
   from a const: these run in the page, not here, so nothing in this file's
   scope is reachable from them. */
const PROBE = () => {
  const found = [];
  for (const el of document.querySelectorAll('*')) {
    if (!el.textContent.trim()) continue;
    if (!/^rgba\(.*,\s*0\)$/.test(getComputedStyle(el).webkitTextFillColor)) continue;
    el.setAttribute('data-fc-probe', '');
    found.push(el.className || el.tagName.toLowerCase());
  }
  return found;
};

const RECHECK = () => [...document.querySelectorAll('[data-fc-probe]')]
  .filter((el) => /^rgba\(.*,\s*0\)$/.test(getComputedStyle(el).webkitTextFillColor))
  .map((el) => `${el.className || el.tagName.toLowerCase()}: "${el.textContent.trim().slice(0, 40)}"`);

describe('a11y: forced colours', () => {
  test('no gradient-clipped text stays invisible', async () => {
    const invisible = [];
    let probed = 0;
    for (const path of allPages()) {
      const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
      try {
        await page.goto(server.base + path, { waitUntil: 'domcontentloaded' });
        probed += (await page.evaluate(PROBE)).length;
        await page.emulateMedia({ forcedColors: 'active' });
        for (const hit of await page.evaluate(RECHECK)) invisible.push(`${path} → ${hit}`);
      } finally { await page.close(); }
    }
    /* If this drops to zero the probe has stopped finding anything — either
       the gradient headings are gone (fine, delete this test) or the selector
       walk broke (not fine, and it would otherwise pass silently). */
    assert.ok(probed > 0,
      'found no gradient-clipped text at all — the probe is no longer measuring anything');
    assert.deepEqual(invisible, [],
      '\n  these paint their text from a background that forced-colors removes, '
      + 'without resetting -webkit-text-fill-color:\n  ' + invisible.join('\n  ') + '\n');
  });

  test('the world map still distinguishes lived from visited', async () => {
    /* Two fills that flatten to one colour is WCAG 1.4.1 — the legend stops
       meaning anything. Under forced colours the distinction has to survive as
       something other than hue, so the visited countries drop to a Canvas fill
       with a CanvasText outline. */
    const page = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    try {
      await page.goto(server.base + '/index.html', { waitUntil: 'domcontentloaded' });
      await page.emulateMedia({ forcedColors: 'active' });
      const paint = await page.evaluate(() => {
        const read = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { fill: cs.fill, stroke: cs.stroke };
        };
        return { lived: read('.wm-lived'), visited: read('.wm-visited') };
      });
      assert.ok(paint.lived && paint.visited, 'world map has no .wm-lived / .wm-visited paths');
      assert.notEqual(paint.lived.fill, paint.visited.fill,
        'lived and visited countries paint the same fill under forced colours — '
        + 'the legend distinguishes nothing');
      assert.notEqual(paint.visited.stroke, 'none',
        'visited countries need an outline to carry the distinction once fill cannot');
    } finally { await page.close(); }
  });
});
