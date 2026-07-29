/* ─────────────────────────────────────────────────────────────────────────────
   harness.mjs — shared infrastructure for the browser-based suite.

   Why a browser suite exists at all: the 780 tests in `npm test` are static
   analysis (regex over source files) and unit tests against hand-written DOM
   stubs. Both are useful and neither can see a rendered page. Every bug that
   reached a real visitor — a section stuck at opacity 0, a page that came back
   dead from the back/forward cache, a map whose land was the same colour as
   the background — was invisible to that kind of test by construction, because
   each one needed layout, compositing, or the browser's own lifecycle to
   exist before it could be observed.

   These tests therefore run against **dist/**, the built artefact that
   actually ships, served over HTTP so module imports, the CSP meta and
   relative URLs behave as they do in production.
   ───────────────────────────────────────────────────────────────────────────── */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIST = join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

/* ─── Static server over dist/ ───────────────────────────────────────────── */

export function startServer(root = DIST) {
  if (!existsSync(root)) {
    throw new Error(`${root} does not exist — run \`npm run build\` first.`);
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    /* Contain path traversal — this serves the repo. */
    const file = join(root, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(file) || !file.startsWith(root)) {
      const custom = join(root, '404.html');
      res.writeHead(404, { 'Content-Type': MIME['.html'] });
      res.end(existsSync(custom) ? readFileSync(custom) : 'Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/* ─── Browser ────────────────────────────────────────────────────────────── */

/* Playwright pins a browser build to its own version. CI installs the matching
   one; a dev container often carries a different revision, and the resulting
   "Executable doesn't exist" is not a test failure worth debugging. Fall back
   to whatever chromium is actually on disk. */
function findChromium() {
  if (process.env.CHROMIUM_EXECUTABLE) return process.env.CHROMIUM_EXECUTABLE;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
    .map((d) => join(dir, d, 'chrome-linux', 'chrome'))
    .filter(existsSync);
  return candidates[0] ?? null;
}

export async function launchBrowser(opts = {}) {
  try {
    return await chromium.launch(opts);
  } catch (err) {
    const exe = findChromium();
    if (!exe) throw err;
    return chromium.launch({ ...opts, executablePath: exe });
  }
}

/* A browser with the back/forward cache switched on. Playwright disables it by
   default, which is exactly the feature whose interaction with `pagehide`
   shipped a broken page — so the lifecycle tests need it back. */
export function launchBrowserWithBfcache() {
  return launchBrowser({
    ignoreDefaultArgs: ['--disable-back-forward-cache', '--disable-features=BackForwardCache'],
    args: ['--enable-features=BackForwardCache:same_site_by_default/true/skip_same_site_if_unload_exists/false'],
  });
}

/* ─── Page helpers ───────────────────────────────────────────────────────── */

/* Cut the page off from the network. The only external request the site makes
   is the GoatCounter analytics pixel, and in a sandbox or on CI that request
   does not fail fast — it hangs until it times out, which `networkidle` dutifully
   waits for. That alone turned a sub-second page load into fifteen seconds.
   Aborting it also makes the suite hermetic: no test outcome can depend on a
   third party being reachable. */
export async function blockExternalRequests(page, origin) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
}

/* Open a page that is already cut off from the network. */
export async function newPage(browser, server, opts = {}) {
  const page = await browser.newPage(opts);
  await blockExternalRequests(page, server.base);
  return page;
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop:  { width: 1280, height: 800 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 390,  height: 844 },
  small:   { width: 375,  height: 667 },
};

/* Every page that ships, as a server-relative path. Derived from dist/ rather
   than hard-coded so a new page is covered the moment it is built. */
export function allPages(root = DIST) {
  const out = [];
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'assets' || entry.name === 'img' || entry.name === 'docs') continue;
        walk(join(dir, entry.name), `${prefix}/${entry.name}`);
      } else if (entry.name.endsWith('.html')) {
        out.push(`${prefix}/${entry.name}`);
      }
    }
  };
  walk(root);
  return out.sort();
}

/* Collect console errors and page exceptions for the lifetime of a page.
   Returns a live array plus a filter for the noise we cannot control. */
export function collectPageErrors(page) {
  const errors = [];
  const IGNORE = [
    /frame-ancestors.*ignored when delivered via a <meta> element/i,  /* by design; CSP meta */
    /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED/i, /* offline analytics pixel */
    /goatcounter/i,
    /Failed to load resource.*40[34]/i,
  ];
  const keep = (text) => !IGNORE.some((re) => re.test(text));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && keep(msg.text())) errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    if (keep(String(err.message))) errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

/* Scroll the whole page the way a reader does, so lazy work and scroll-driven
   behaviour actually run, then settle. */
export async function scrollThrough(page) {
  /* Driven inside the page rather than one round trip per step — a full-page
     scroll used to cost dozens of evaluate() calls and dominated the suite. */
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(400);
}

/* Wait for the reveal to finish *painting*, not merely to have been triggered.
   `[data-animate]` fades in over a CSS transition, so sampling opacity too
   early catches elements mid-fade and reports them as hidden. Poll until
   nothing is in between, rather than guessing a sleep long enough. */
export async function settleReveal(page, timeoutMs = 4000) {
  await page.waitForFunction(() => {
    const els = [...document.querySelectorAll('[data-animate]')];
    return !els.some((el) => {
      const o = parseFloat(getComputedStyle(el).opacity);
      return o > 0.01 && o < 0.9;      /* mid-transition */
    });
  }, null, { timeout: timeoutMs }).catch(() => { /* report the real state instead */ });
}

/* Resolve any CSS colour — including oklch(), which is what getComputedStyle
   returns for this site's tokens — to concrete sRGB channels. A canvas 2D
   context does the conversion the same way the compositor does; parsing the
   computed string by hand silently produces nonsense for anything that is not
   already rgb(). */
export function resolveColor(page, cssColor) {
  return page.evaluate((color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b };
  }, cssColor);
}

/* Wake the deferred hero import, which waits for the first real interaction. */
export async function nudgePointer(page) {
  await page.mouse.move(600, 380);
  await page.mouse.move(660, 420);
}
