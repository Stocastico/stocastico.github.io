import test from 'node:test';
import assert from 'node:assert/strict';
import { injectThemeToggle } from '../scripts/generate-theme-toggle.mjs';

const HAMBURGER = [
  '      <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-label="Toggle menu">',
  '        <span></span><span></span><span></span>',
  '      </button>',
].join('\n');

function sampleDoc() {
  return [
    '<!DOCTYPE html>',
    '<html lang="en" data-theme="dark">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <!-- generated:csp-meta -->',
    '  <meta http-equiv="Content-Security-Policy" content="..." />',
    '  <!-- /generated:csp-meta -->',
    '  <title>X</title>',
    '</head>',
    '<body>',
    '  <nav id="navbar"><div class="nav-inner">',
    HAMBURGER,
    '      <ul class="nav-links" id="nav-links"></ul>',
    '  </div></nav>',
    '</body>',
    '</html>',
  ].join('\n');
}

test('injectThemeToggle: strips hard-coded data-theme="dark" from <html>', () => {
  const { html, changed } = injectThemeToggle(sampleDoc());
  assert.ok(changed);
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /data-theme="dark"/);
});

test('injectThemeToggle: inserts the bootstrap script after the CSP meta', () => {
  const { html } = injectThemeToggle(sampleDoc());
  assert.match(html, /<!-- theme-bootstrap -->/);
  assert.match(html, /localStorage\.getItem\('theme'\)/);
  /* must come after the CSP meta so the CSP hash can cover it */
  assert.ok(html.indexOf('/generated:csp-meta') < html.indexOf('theme-bootstrap'));
});

test('injectThemeToggle: inserts the toggle button after the hamburger', () => {
  const { html } = injectThemeToggle(sampleDoc());
  assert.match(html, /<!-- theme-toggle -->/);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /icon-sun/);
  assert.match(html, /icon-moon/);
  assert.ok(html.indexOf('id="nav-toggle"') < html.indexOf('id="theme-toggle"'));
});

test('injectThemeToggle: is idempotent (second pass is a no-op)', () => {
  const once = injectThemeToggle(sampleDoc()).html;
  const twice = injectThemeToggle(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.html, once);
});

test('injectThemeToggle: a page without a navbar still gets bootstrap, no button', () => {
  const noNav = [
    '<html lang="en" data-theme="dark">',
    '<head>',
    '  <!-- generated:csp-meta -->',
    '  <meta http-equiv="Content-Security-Policy" content="..." />',
    '  <!-- /generated:csp-meta -->',
    '</head><body>404</body></html>',
  ].join('\n');
  const { html, changed } = injectThemeToggle(noNav);
  assert.ok(changed);
  assert.match(html, /theme-bootstrap/);
  assert.doesNotMatch(html, /theme-toggle/);
  assert.doesNotMatch(html, /data-theme="dark"/);
});

/* ─────────────────────────────────────────────────────────────────────────────
   DRIFT: every committed page carries the block this generator would inject.

   The tests above run injectThemeToggle over a synthetic document and check it
   is idempotent. Nothing read the pages, so a page whose theme controls had
   been damaged passed — measured by deleting the Forest palette dot from
   travel.html outright and running the whole suite green.

   test/theme-sync.test.js covers one specific attribute (aria-pressed pointing
   at the active palette) on the eight brand pages. That is the drift a palette
   rotation causes. It is not the drift a hand edit, a bad merge or a
   half-finished generator run causes, and it does not look at the thirteen
   project pages at all — where the navbar is the same navbar.

   Idempotence is what makes this checkable: re-running the injector over a page
   that already has the block must be a no-op, so any difference is the page
   being out of date. Same shape as the world-map and countries guards.
──────────────────────────────────────────────────────────────────────────────*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TT_PAGES = [
  ...fs.readdirSync(TT_ROOT).filter((f) => f.endsWith('.html')).sort(),
  ...fs.readdirSync(path.join(TT_ROOT, 'projects'))
    .filter((f) => f.endsWith('.html')).sort()
    .map((f) => `projects/${f}`),
];

test('theme-toggle: the page list found the site', () => {
  assert.ok(TT_PAGES.length >= 18,
    `found only ${TT_PAGES.length} pages — the per-page checks below generate nothing`);
});

for (const rel of TT_PAGES) {
  test(`drift: ${rel} carries the generated theme-toggle block`, () => {
    const html = fs.readFileSync(path.join(TT_ROOT, rel), 'utf8');
    assert.equal(injectThemeToggle(html).html, html,
      `${rel} theme controls are stale or damaged — run \`npm run generate-theme-toggle\`, `
      + 'then `npm run generate-csp-meta` (the FOUC bootstrap script is CSP-hashed)');
  });
}
