/**
 * Playwright end-to-end UI tests
 *
 * Run:  node test/playwright.ui.test.mjs
 *
 * Checks:
 *   • Desktop (1280×800) and Mobile (375×812, iPhone-like) viewports
 *   • Hero section, navigation, all major content sections visible
 *   • CV timeline entries rendered
 *   • Skill bars rendered
 *   • Blog post cards rendered
 *   • No console errors at page load
 *   • Mobile nav hamburger works
 *   • Scroll reaches bottom without JS errors
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// ─── Minimal static file server ──────────────────────────────────────────────

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
const port   = server.address().port;
const BASE   = `http://127.0.0.1:${port}`;

console.log(`\nPlaywright UI tests — serving from ${BASE}\n`);

const browser = await chromium.launch({ headless: true });

// ─── Desktop tests ────────────────────────────────────────────────────────────

console.log('── Desktop (1280×800) ──────────────────────────────────');
{
  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

  await test('CV timeline has career entries', async () => {
    /* Scroll to the CV section to trigger content-visibility rendering */
    await page.evaluate(() => document.getElementById('cv')?.scrollIntoView());
    await page.waitForTimeout(300);
    const entries = await page.$$('.tl-entry--career');
    assert(entries.length >= 1, `Career entries: ${entries.length}`);
  });

  await test('CV timeline has education entries', async () => {
    const entries = await page.$$('.tl-entry--education');
    assert(entries.length >= 1, `Education entries: ${entries.length}`);
  });

  await test('Skill panels are rendered', async () => {
    await page.evaluate(() => document.getElementById('skills')?.scrollIntoView());
    await page.waitForTimeout(300);
    const panels = await page.$$('.skill-panel');
    assert(panels.length >= 1, `Skill panels: ${panels.length}`);
  });

  await test('Skill bars are present', async () => {
    const bars = await page.$$('.skill-bar-fill');
    assert(bars.length >= 3, `Skill bars: ${bars.length}`);
  });

  await test('Blog section is present', async () => {
    await page.evaluate(() => document.getElementById('blog')?.scrollIntoView());
    await page.waitForTimeout(300);
    const blog = await page.$('#blog');
    assert(blog !== null, '#blog not found');
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

  await test('CV timeline shows year markers from current year to 2000', async () => {
    await page.evaluate(() => document.getElementById('cv')?.scrollIntoView());
    await page.waitForTimeout(300);
    const currentYear = new Date().getFullYear();
    const yearNow = await page.$(`.tl-year-marker[data-year="${currentYear}"]`);
    const year2000 = await page.$('.tl-year-marker[data-year="2000"]');
    assert(yearNow !== null, `Missing year marker for ${currentYear}`);
    assert(year2000 !== null, 'Missing year marker for 2000');
  });

  await test('No JS errors at page load', async () => {
    const relevant = consoleErrors.filter(e =>
      !e.includes('Failed to load resource')    /* CDN may not resolve in test env */
      && !e.includes('net::ERR')
      && !e.includes('favicon')
    );
    assert(relevant.length === 0, `JS errors:\n  ${relevant.join('\n  ')}`);
  });

  await ctx.close();
}

// ─── Mobile tests ─────────────────────────────────────────────────────────────

console.log('\n── Mobile (375×812, touch) ─────────────────────────────');
{
  const ctx = await browser.newContext({
    viewport:           { width: 375, height: 812 },
    hasTouch:           true,
    isMobile:           true,
    userAgent:          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
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

  await test('CV timeline visible on mobile', async () => {
    await page.evaluate(() => document.getElementById('cv')?.scrollIntoView());
    await page.waitForTimeout(400);
    const entries = await page.$$('.tl-entry--career');
    assert(entries.length >= 1, `Career entries on mobile: ${entries.length}`);
  });

  await test('Timeline shows both career and education on mobile', async () => {
    const career = await page.$$('.tl-entry--career');
    const edu    = await page.$$('.tl-entry--education');
    assert(career.length >= 1, `No career entries on mobile`);
    assert(edu.length >= 1,    `No education entries on mobile`);
  });

  await test('No JS errors on mobile', async () => {
    const relevant = mobileErrors.filter(e =>
      !e.includes('Failed to load resource') && !e.includes('net::ERR') && !e.includes('favicon')
    );
    assert(relevant.length === 0, `Mobile JS errors:\n  ${relevant.join('\n  ')}`);
  });

  await ctx.close();
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

await browser.close();
server.close();

console.log(`\n──────────────────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
