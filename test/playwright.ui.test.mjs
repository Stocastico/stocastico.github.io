/**
 * Playwright end-to-end UI tests
 *
 * Run:  node test/playwright.ui.test.mjs
 *
 * Checks:
 *   • Desktop (1280×800) and Mobile (375×812, iPhone-like) viewports
 *   • Hero section, navigation, all major content sections visible
 *   • CV timeline entries rendered (on cv.html)
 *   • Skill groups rendered (on index.html)
 *   • Skill bars rendered (on cv.html)
 *   • Project cards rendered
 *   • No console errors at page load
 *   • Mobile nav hamburger works
 *   • Scroll reaches bottom without JS errors
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('playwright-core'));
}

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = join(SOURCE_ROOT, 'dist');
const ROOT = existsSync(DIST_ROOT) ? DIST_ROOT : SOURCE_ROOT;

// ─── Minimal static file server ──────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveFile(res, filePath) {
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = extname(filePath).toLowerCase();
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

// ─── Test runner helpers ──────────────────────────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

const server = await startServer();
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;

console.log(`\nPlaywright UI tests — serving from ${BASE}\n`);

const browser = await chromium.launch({ headless: true });

// ─── Desktop tests (index.html) ──────────────────────────────────────────────

console.log('── Desktop (1280×800) — index.html ────────────────────');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  /* Give deferred scripts and DOMContentLoaded callbacks time to execute */
  await page.waitForTimeout(1500);

  await test('Page title contains "Stefano"', async () => {
    const title = await page.title();
    assert(title.includes('Stefano'), `Got title: "${title}"`);
  });

  await test('Hero section is visible', async () => {
    const hero = await page.$('#hero');
    assert(hero !== null, '#hero not found');
    assert(await hero.isVisible(), '#hero not visible');
  });

  await test('Hero name is rendered', async () => {
    const h1 = await page.$('#hero-name');
    assert(h1 !== null, '#hero-name not found');
    const text = await h1.innerText();
    assert(text.includes('Stefano'), `Hero name text: "${text}"`);
  });

  await test('Navigation links are present', async () => {
    const links = await page.$$('.nav-links a');
    assert(links.length >= 4, `Only ${links.length} nav links found`);
  });

  await test('About section visible', async () => {
    const el = await page.$('#about');
    assert(el !== null, '#about not found');
  });

  await test('Skill groups are rendered', async () => {
    await page.evaluate(() => document.getElementById('skills')?.scrollIntoView());
    await page.waitForTimeout(300);
    const groups = await page.$$('.skill-group');
    assert(groups.length >= 1, `Skill groups: ${groups.length}`);
  });

  await test('2D Europe canvas is present and sized', async () => {
    await page.evaluate(() => document.getElementById('about')?.scrollIntoView());
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(() => {
      const canvas = document.getElementById('europe-canvas');
      if (!canvas) return null;
      return { width: canvas.width, height: canvas.height };
    });
    assert(metrics !== null, '#europe-canvas not found');
    assert(metrics.width > 0 && metrics.height > 0, `Invalid Europe canvas size: ${JSON.stringify(metrics)}`);
  });

  await test('2D Europe map initializes with tooltip DOM', async () => {
    await page.evaluate(() => document.getElementById('europe-canvas')?.scrollIntoView());
    await page.waitForTimeout(300);

    await page.waitForFunction(() => {
      const canvas = document.getElementById('europe-canvas');
      const tooltip = document.getElementById('europe-tooltip');
      return !!(canvas && canvas._europe && canvas._europe.filteredPins?.length > 0 && tooltip);
    }, { timeout: 5000 });

    const ready = await page.evaluate(() => {
      const canvas = document.getElementById('europe-canvas');
      const tooltip = document.getElementById('europe-tooltip');
      return !!(canvas && canvas._europe && canvas._europe.filteredPins?.length > 0 && tooltip);
    });

    assert(ready, 'Europe map did not initialize with pins and tooltip DOM');
  });

  await test('Location filter controls are hidden', async () => {
    const hidden = await page.evaluate(() => {
      const filters = document.querySelector('.location-filters');
      if (!filters) return true;
      const style = window.getComputedStyle(filters);
      return style.display === 'none';
    });
    assert(hidden, 'Location filter controls should be hidden');
  });

  await test('Skill tags are present', async () => {
    const tags = await page.$$('.skill-tag');
    assert(tags.length >= 3, `Skill tags: ${tags.length}`);
  });

  await test('Projects section renders project cards', async () => {
    await page.evaluate(() => document.getElementById('projects')?.scrollIntoView());
    await page.waitForTimeout(500); // allow JS to populate #projects-grid
    const result = await page.evaluate(() => ({
      sectionPresent: !!document.getElementById('projects'),
      cardCount: document.querySelectorAll('#projects-grid .project-card').length,
    }));
    assert(result.sectionPresent, '#projects not found');
    assert(result.cardCount > 0, `expected project cards, got ${result.cardCount}`);
  });

  await test('Contact section is present', async () => {
    await page.evaluate(() => document.getElementById('contact')?.scrollIntoView());
    await page.waitForTimeout(300);
    const contact = await page.$('#contact');
    assert(contact !== null, '#contact not found');
  });

  await test('Footer year is rendered', async () => {
    const footer = await page.$('footer');
    assert(footer !== null, 'footer not found');
    const text = await footer.innerText();
    assert(text.includes('202'), `Footer text: "${text}"`);
  });

  await test('Theme toggle button is removed', async () => {
    const btn = await page.$('.theme-btn');
    assert(btn === null, '.theme-btn should not exist');
  });

  await test('Desktop page has no horizontal overflow at 1280px', async () => {
    const overflow = await page.evaluate(() => ({
      bodyScroll: document.body.scrollWidth,
      htmlScroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    assert(
      overflow.bodyScroll <= overflow.viewport + 1,
      `Desktop horizontal overflow detected: ${JSON.stringify(overflow)}`,
    );
  });

  await test('Desktop visual snapshot saved for review', async () => {
    const screenshotDir = join(ROOT, 'test', 'screenshots');
    if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, 'ui-index-desktop.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    assert(existsSync(screenshotPath), `Screenshot not written to ${screenshotPath}`);
  });

  await test('No JS errors at page load', async () => {
    const relevant = consoleErrors.filter(e =>
      !e.includes('Failed to load resource')    /* CDN may not resolve in test env */
      && !e.includes('net::ERR')
      && !e.includes('favicon')
      && !e.includes('frame-ancestors')
    );
    assert(relevant.length === 0, `JS errors:\n  ${relevant.join('\n  ')}`);
  });

  await ctx.close();
}

// ─── Desktop tests (cv.html) ─────────────────────────────────────────────────

console.log('\n── Desktop (1280×800) — cv.html ────────────────────────');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto(`${BASE}/cv.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await test('CV page title contains "CV"', async () => {
    const title = await page.title();
    assert(title.includes('CV'), `Got title: "${title}"`);
  });

  await test('CV timeline has career entries', async () => {
    const entries = await page.$$('.tl-row--career');
    assert(entries.length >= 1, `Career entries: ${entries.length}`);
  });

  await test('CV timeline has education entries', async () => {
    const entries = await page.$$('.tl-row--education');
    assert(entries.length >= 1, `Education entries: ${entries.length}`);
  });

  await test('CV timeline uses two-column layout', async () => {
    const row = await page.$('.tl-row--career');
    assert(row !== null, 'No career row found');
    const left = await row.$('.tl-left');
    const right = await row.$('.tl-right');
    const spine = await row.$('.tl-spine');
    assert(left !== null, 'Missing .tl-left column');
    assert(right !== null, 'Missing .tl-right column');
    assert(spine !== null, 'Missing .tl-spine');
  });

  await test('CV timeline shows year labels', async () => {
    const years = await page.$$('.tl-year');
    assert(years.length >= 2, `Year labels found: ${years.length}`);
  });

  await test('Skill panels are rendered on CV page', async () => {
    await page.evaluate(() => document.getElementById('cv-skills')?.scrollIntoView());
    await page.waitForTimeout(300);
    const panels = await page.$$('.skill-panel');
    assert(panels.length >= 1, `Skill panels: ${panels.length}`);
  });

  await test('Skill bars are present on CV page', async () => {
    const bars = await page.$$('.skill-bar-fill');
    assert(bars.length >= 3, `Skill bars: ${bars.length}`);
  });

  await test('No JS errors on CV page', async () => {
    const relevant = consoleErrors.filter(e =>
      !e.includes('Failed to load resource')
      && !e.includes('net::ERR')
      && !e.includes('favicon')
      && !e.includes('frame-ancestors')
    );
    assert(relevant.length === 0, `JS errors:\n  ${relevant.join('\n  ')}`);
  });

  await ctx.close();
}

// ─── Mobile tests ─────────────────────────────────────────────────────────────

console.log('\n── Mobile (375×812, touch) ─────────────────────────────');
{
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await ctx.newPage();

  const mobileErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') mobileErrors.push(msg.text()); });
  page.on('pageerror', err => mobileErrors.push(err.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await test('Hero visible on mobile', async () => {
    const hero = await page.$('#hero');
    assert(hero !== null && await hero.isVisible(), '#hero not visible on mobile');
  });

  await test('Nav toggle button visible on mobile', async () => {
    const toggle = await page.$('.nav-toggle');
    assert(toggle !== null, '.nav-toggle not found');
    assert(await toggle.isVisible(), '.nav-toggle not visible');
  });

  await test('Nav links hidden by default on mobile', async () => {
    const links = await page.$('.nav-links');
    assert(links !== null, '.nav-links not found');
    /* On mobile the nav-links element exists but should not be blocking layout */
    const display = await links.evaluate(el => getComputedStyle(el).display);
    assert(display === 'none', `Expected display:none, got "${display}"`);
  });

  await test('Mobile nav hamburger opens menu', async () => {
    await page.click('.nav-toggle');
    await page.waitForTimeout(200);
    const links = await page.$('.nav-links');
    const display = await links.evaluate(el => getComputedStyle(el).display);
    assert(display !== 'none', `Nav links still hidden after toggle (display: ${display})`);
    /* Close menu */
    await page.click('.nav-toggle');
    await page.waitForTimeout(200);
  });

  await test('No JS errors on mobile', async () => {
    const relevant = mobileErrors.filter(e =>
      !e.includes('Failed to load resource') && !e.includes('net::ERR') && !e.includes('favicon')
      && !e.includes('frame-ancestors')
    );
    assert(relevant.length === 0, `Mobile JS errors:\n  ${relevant.join('\n  ')}`);
  });

  // ── Mobile CV page tests ──────────────────────────────────────────────────

  await page.goto(`${BASE}/cv.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await test('CV timeline visible on mobile', async () => {
    const entries = await page.$$('.tl-row--career');
    assert(entries.length >= 1, `Career entries on mobile: ${entries.length}`);
  });

  await test('Timeline shows both career and education on mobile', async () => {
    const career = await page.$$('.tl-row--career');
    const edu = await page.$$('.tl-row--education');
    assert(career.length >= 1, `No career entries on mobile`);
    assert(edu.length >= 1, `No education entries on mobile`);
  });

  await ctx.close();
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

await browser.close();
server.close();

console.log(`\n──────────────────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
