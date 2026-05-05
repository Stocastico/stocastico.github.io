/**
 * Playwright iPhone Safari regression tests
 *
 * Run:  node test/playwright.iphone.test.mjs
 *
 * Reproduces layout bugs reported by the user when viewing the site on
 * iPhone + Safari ("text overflowing the small rectangles").  Each test
 * targets one concrete bug and asserts the fixed behaviour.
 *
 * Viewports exercised:
 *   • iPhone SE / iPhone 8 — 375 × 667  (worst-case width)
 *   • iPhone 13 / 14       — 390 × 844
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff2':'font/woff2',
};

function serveFile(res, filePath) {
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext  = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(filePath));
}

function startServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let url = req.url.split('?')[0];
      if (url === '/') url = '/index.html';
      serveFile(res, join(ROOT, url));
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'Assertion failed');
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
                 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const server = await startServer();
const port   = server.address().port;
const BASE   = `http://127.0.0.1:${port}`;

console.log(`\niPhone Safari UI tests — serving from ${BASE}\n`);

const browser = await chromium.launch({ headless: true });

// ─── iPhone SE / iPhone 8 — 375 × 667 ─────────────────────────────────────────

console.log('── iPhone SE (375×667, touch, Safari UA) ─────────────');
{
  const ctx = await browser.newContext({
    viewport:  { width: 375, height: 667 },
    hasTouch:  true,
    isMobile:  true,
    userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Bug 1: contact card values use `white-space: nowrap` + ellipsis,
  // truncating email/handle text instead of wrapping on narrow screens.
  await test('contact-value wraps instead of being truncated by ellipsis', async () => {
    await page.evaluate(() => document.getElementById('contact')?.scrollIntoView());
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const values = Array.from(document.querySelectorAll('.contact-value'));
      return values.map(el => {
        const cs = getComputedStyle(el);
        return {
          text: el.textContent.trim(),
          whiteSpace: cs.whiteSpace,
          textOverflow: cs.textOverflow,
          truncated: el.scrollWidth > el.clientWidth + 1,
        };
      });
    });
    const failures = result.filter(r =>
      r.whiteSpace === 'nowrap' || r.textOverflow === 'ellipsis' || r.truncated,
    );
    assert(
      failures.length === 0,
      `contact-value still truncating: ${JSON.stringify(failures)}`,
    );
  });

  // Bug 2: page must not introduce horizontal scrolling on iPhone width.
  await test('no horizontal overflow on document body at 375px', async () => {
    const overflow = await page.evaluate(() => ({
      bodyScroll: document.body.scrollWidth,
      htmlScroll: document.documentElement.scrollWidth,
      viewport:   window.innerWidth,
    }));
    assert(
      overflow.bodyScroll <= overflow.viewport + 1,
      `body horizontally overflows: ${JSON.stringify(overflow)}`,
    );
  });

  // Bug 3: project-card titles must wrap (no text bursting out of the card)
  await page.goto(`${BASE}/projects.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await test('project-card titles do not overflow card width', async () => {
    const overflows = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.project-card'));
      const bad = [];
      for (const card of cards) {
        const title = card.querySelector('.project-card__title');
        if (!title) continue;
        if (title.scrollWidth > card.clientWidth + 1) {
          bad.push({ text: title.textContent.trim(), scroll: title.scrollWidth, card: card.clientWidth });
        }
      }
      return bad;
    });
    assert(overflows.length === 0, `project titles overflow: ${JSON.stringify(overflows)}`);
  });

  // Bug 4: timeline "location" label uses `white-space: nowrap` even on mobile
  await page.goto(`${BASE}/cv.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await test('timeline location wraps on mobile (no nowrap)', async () => {
    const result = await page.evaluate(() => {
      const locs = Array.from(document.querySelectorAll('.tl-location'));
      return locs.slice(0, 5).map(el => ({
        text: el.textContent.trim(),
        whiteSpace: getComputedStyle(el).whiteSpace,
      }));
    });
    const stillNowrap = result.filter(r => r.whiteSpace === 'nowrap');
    assert(
      stillNowrap.length === 0,
      `tl-location still nowrap on mobile: ${JSON.stringify(stillNowrap)}`,
    );
  });

  // Bug 5: timeline rows must not horizontally overflow the page on narrow phones
  await test('timeline rows do not horizontally overflow viewport', async () => {
    const overflows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.tl-row'));
      const bad = [];
      for (const r of rows) {
        if (r.scrollWidth > document.documentElement.clientWidth + 1) {
          bad.push({ scroll: r.scrollWidth, viewport: document.documentElement.clientWidth });
        }
      }
      return bad;
    });
    assert(overflows.length === 0, `tl-row overflows viewport: ${JSON.stringify(overflows)}`);
  });

  // Bug 6: hero must use 100dvh (dynamic viewport) so iOS Safari's collapsing
  // bottom bar does not cause a layout shift / clipped content.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await test('#hero uses dynamic viewport units (100dvh)', async () => {
    // Read the rule directly from the stylesheet so we are robust against UA
    // resolution of dvh (Playwright reports computed px, which is identical
    // for svh/dvh/vh in headless).  A small inline probe element is the most
    // portable way to confirm the source declaration uses dvh.
    const usesDvh = await page.evaluate(async () => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.selectorText === '#hero' && rule.style.height) {
            return /dvh\b/.test(rule.style.height) ||
                   /dvh\b/.test(rule.cssText);
          }
        }
      }
      return false;
    });
    assert(usesDvh, '#hero { height } should use 100dvh, not 100svh');
  });

  // Bug 8: when a research-card (#research-grid) is flipped to its back side,
  // the long description + footer must not spill past the rounded card border.
  // The two faces are absolutely positioned inside .card-inner, so before the
  // grid-stack fix the parent card kept its 260px min-height and back-side
  // text overflowed vertically on narrow phone widths.
  await test('flipped research-card back content stays inside card bounds', async () => {
    await page.evaluate(() => document.getElementById('research')?.scrollIntoView());
    await page.waitForTimeout(300);
    // Flip every card so we cover all back-side text variants.
    await page.evaluate(() => {
      document.querySelectorAll('#research-grid .research-card')
        .forEach(c => c.classList.add('is-flipped'));
    });
    await page.waitForTimeout(800); // wait for flip transition
    const overflows = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#research-grid .research-card'));
      const bad = [];
      for (const card of cards) {
        const cardRect = card.getBoundingClientRect();
        const back     = card.querySelector('.card-back');
        const body     = card.querySelector('.card-back-body');
        const hint     = card.querySelector('.card-back-hint');
        if (!back) continue;
        const backRect = back.getBoundingClientRect();
        const bodyRect = body?.getBoundingClientRect();
        const hintRect = hint?.getBoundingClientRect();
        // The back panel itself, the body text and the footer must all sit
        // within the visible card rectangle (1px tolerance for sub-pixel).
        const bottomOverflow = Math.max(
          backRect.bottom - cardRect.bottom,
          (bodyRect?.bottom ?? 0) - cardRect.bottom,
          (hintRect?.bottom ?? 0) - cardRect.bottom,
        );
        if (bottomOverflow > 1) {
          bad.push({
            title: card.querySelector('.card-back-title')?.textContent.trim(),
            cardBottom: Math.round(cardRect.bottom),
            backBottom: Math.round(backRect.bottom),
            bodyBottom: bodyRect ? Math.round(bodyRect.bottom) : null,
            hintBottom: hintRect ? Math.round(hintRect.bottom) : null,
            overflowPx: Math.round(bottomOverflow),
          });
        }
      }
      return bad;
    });
    assert(
      overflows.length === 0,
      `card-back content overflows research-card on iPhone: ${JSON.stringify(overflows)}`,
    );
  });

  // Bug 9: on portrait iPhone widths the about-section profile photo was
  // capped at 180px while sitting in a row next to the 3-up stats grid,
  // making it look tiny.  The photo card should render at a comfortable
  // size (>=220px wide) on a 375px-wide viewport.
  await test('about-section photo-card is reasonably sized on portrait iPhone', async () => {
    await page.evaluate(() => document.getElementById('about')?.scrollIntoView());
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const card = document.querySelector('.about-photo-col .photo-card');
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    assert(m, '.about-photo-col .photo-card not found');
    assert(
      m.width >= 220,
      `photo-card too small on portrait iPhone: rendered ${m.width}px wide (expected >=220)`,
    );
  });

  // Bug 7: tap targets for inline tag-pills should be >=32px tall on touch
  // devices (Apple HIG suggests 44, but inline pills can be smaller; we
  // enforce a softer 32 to ensure reasonable touch comfort).
  await test('tag-style touch targets are at least 32px tall', async () => {
    await page.evaluate(() => document.getElementById('skills')?.scrollIntoView());
    await page.waitForTimeout(300);
    const tooSmall = await page.evaluate(() => {
      const tags = Array.from(document.querySelectorAll('.skill-tag, .project-tag, .tl-tag'));
      const bad = [];
      for (const t of tags.slice(0, 30)) {
        const r = t.getBoundingClientRect();
        if (r.height > 0 && r.height < 32) {
          bad.push({ cls: t.className, h: Math.round(r.height) });
        }
      }
      return bad;
    });
    assert(
      tooSmall.length === 0,
      `tap targets <32px tall: ${JSON.stringify(tooSmall.slice(0, 5))}`,
    );
  });

  await ctx.close();
}

// ─── iPhone 13 — 390 × 844 ───────────────────────────────────────────────────

console.log('\n── iPhone 13 (390×844, touch, Safari UA) ─────────────');
{
  const ctx = await browser.newContext({
    viewport:  { width: 390, height: 844 },
    hasTouch:  true,
    isMobile:  true,
    userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await test('no horizontal overflow at 390px', async () => {
    const m = await page.evaluate(() => ({
      bodyScroll: document.body.scrollWidth,
      viewport:   window.innerWidth,
    }));
    assert(m.bodyScroll <= m.viewport + 1, `body overflows: ${JSON.stringify(m)}`);
  });

  await test('contact-value not truncated at 390px', async () => {
    await page.evaluate(() => document.getElementById('contact')?.scrollIntoView());
    await page.waitForTimeout(300);
    const truncated = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.contact-value'))
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => el.textContent.trim()));
    assert(truncated.length === 0, `truncated: ${JSON.stringify(truncated)}`);
  });

  await ctx.close();
}

await browser.close();
server.close();

console.log(`\n──────────────────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
