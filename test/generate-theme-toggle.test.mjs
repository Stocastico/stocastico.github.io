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
