/* HTML quality tests — checks the high-value subset of an html-validate
   run without the devDependency / install-time cost. Catches the most
   common shipping regressions: missing alt on <img>, multi-h1 pages,
   external links without rel="noopener" (window-opener exploit), and
   unclosed <script> / <style> blocks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PAGES = [
  'index.html',
  'cv.html',
  'projects.html',
  '404.html',
  ...fs.readdirSync(path.join(ROOT, 'projects'))
       .filter(f => f.endsWith('.html'))
       .map(f => `projects/${f}`),
];

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

for (const rel of PAGES) {
  const html = read(rel);

  test(`html: ${rel} has exactly one <h1>`, () => {
    const matches = html.match(/<h1[\s>]/gi) || [];
    assert.equal(matches.length, 1,
      `${rel} should have exactly one <h1>, found ${matches.length}`);
  });

  test(`html: every <img> in ${rel} has an alt attribute`, () => {
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    const missing = imgs.filter(t => !/\balt=("[^"]*"|'[^']*')/i.test(t));
    assert.equal(missing.length, 0,
      `${rel} <img> without alt:\n  ${missing.join('\n  ')}`);
  });

  test(`html: external <a target="_blank"> in ${rel} use rel="noopener"`, () => {
    /* Anchor tags that open a new tab without rel="noopener" expose the
       previous page to window.opener tab-jacking on older browsers. */
    const anchors = html.match(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi) || [];
    const offenders = anchors.filter(a => !/\brel=("[^"]*\bnoopener\b[^"]*"|'[^']*\bnoopener\b[^']*')/i.test(a));
    assert.equal(offenders.length, 0,
      `${rel} target=_blank without rel="noopener":\n  ${offenders.join('\n  ')}`);
  });

  test(`html: balanced <script>/</script> tags in ${rel}`, () => {
    /* Self-closing or unclosed <script> / <style> are the single most common
       cause of "broken page below this line" in production HTML. */
    const open  = (html.match(/<script\b[^>]*>/gi) || []).length;
    /* Don't count <script src="..."/>-style self-closing — there are none in
       this codebase, but treat them as both open + close if encountered. */
    const close = (html.match(/<\/script>/gi) || []).length;
    assert.equal(open, close,
      `${rel}: ${open} <script> opens vs ${close} closes`);
  });

  test(`html: balanced <style>/</style> tags in ${rel}`, () => {
    const open  = (html.match(/<style\b[^>]*>/gi) || []).length;
    const close = (html.match(/<\/style>/gi) || []).length;
    assert.equal(open, close,
      `${rel}: ${open} <style> opens vs ${close} closes`);
  });

  test(`html: ${rel} declares <html lang="...">`, () => {
    assert.match(html, /<html\b[^>]*\blang=("[^"]+"|'[^']+')/i,
      `${rel} <html> tag is missing lang attribute`);
  });
}

test('html: <title> values are unique across indexable pages', () => {
  const indexable = PAGES.filter(r => r !== '404.html');
  const titles = new Map();
  for (const rel of indexable) {
    const m = read(rel).match(/<title>([^<]+)<\/title>/i);
    assert.ok(m, `${rel} missing <title>`);
    const t = m[1].trim();
    if (titles.has(t)) {
      assert.fail(`Duplicate title "${t}" in ${rel} and ${titles.get(t)}`);
    }
    titles.set(t, rel);
  }
});
