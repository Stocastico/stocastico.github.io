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

/* Derived, not listed. The project pages were already globbed; the top-level
   ones were typed out — 'index', 'cv', 'projects', 'publications', '404' — and
   the list then stayed exactly that size while the site grew. travel.html,
   links.html and now.html were added afterwards and none of the eleven checks
   below had ever run against any of them: not one <h1>, not an alt attribute,
   not a rel="noopener", not a lang attribute.

   This is the third time a hand-maintained list of files has quietly stopped
   matching the files (see the notes on `npm test`'s enumerated filenames and
   on e2e.yml naming four of six suites). The pattern is the same every time:
   the list is right when written, nothing fails when it goes stale, and the
   loss is invisible because a test that does not exist cannot go red. So this
   one reads the directory, and a new page is covered the moment it lands.

   The count guard below is the other half. A glob that silently matches
   nothing degrades to zero generated tests, and a file that generates no tests
   still reports success — which is the same failure wearing a different hat. */
const PAGES = [
  ...fs.readdirSync(ROOT)
       .filter(f => f.endsWith('.html'))
       .sort(),
  ...fs.readdirSync(path.join(ROOT, 'projects'))
       .filter(f => f.endsWith('.html'))
       .sort()
       .map(f => `projects/${f}`),
];

test('html: the page list actually found the site', () => {
  assert.ok(PAGES.length >= 18,
    `expected at least 18 HTML pages, found ${PAGES.length} — the glob below is not `
    + 'seeing the site, so every per-page check in this file is generating nothing');
  for (const required of ['index.html', 'travel.html', 'links.html', 'now.html', '404.html']) {
    assert.ok(PAGES.includes(required), `page list is missing ${required}`);
  }
});

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

  test(`html: every <img> in ${rel} declares width and height`, () => {
    /* Intrinsic width/height (or aspect-ratio) lets the browser reserve space
       before the image loads — without them lazy images cause layout shift. */
    const imgs = html.match(/<img\b[^>]*>/gi) || [];
    const missing = imgs.filter(t =>
      !/\bwidth=("?\d+"?)/i.test(t) || !/\bheight=("?\d+"?)/i.test(t));
    assert.equal(missing.length, 0,
      `${rel} <img> missing width/height:\n  ${missing.join('\n  ')}`);
  });

  test(`html: external <a href="http..."> in ${rel} use rel="noopener"`, () => {
    /* Covers in-prose external links that don't carry target="_blank" too —
       rel="noopener" is harmless there and keeps the site convention uniform. */
    const anchors = html.match(/<a\b[^>]*\bhref=("https?:\/\/[^"]*"|'https?:\/\/[^']*')[^>]*>/gi) || [];
    const offenders = anchors.filter(a =>
      !/\brel=("[^"]*\bnoopener\b[^"]*"|'[^']*\bnoopener\b[^']*')/i.test(a));
    assert.equal(offenders.length, 0,
      `${rel} external <a> without rel="noopener":\n  ${offenders.join('\n  ')}`);
  });

  test(`html: ${rel} preloads the two above-the-fold web fonts`, () => {
    /* Every page loads css/fonts.css; preloading the two critical woff2 files
       avoids FOUT/layout shift. One missing page = an inconsistent flash. */
    for (const font of ['source-serif-4-latin-wght-normal.woff2', 'jetbrains-mono-latin-wght-normal.woff2']) {
      const re = new RegExp(
        `<link[^>]*rel="preload"[^>]*href="[^"]*${font.replace(/\./g, '\\.')}"[^>]*as="font"`, 'i');
      assert.match(html, re, `${rel} missing <link rel="preload"> for ${font}`);
    }
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

  test(`html: ${rel} ships favicon.ico and apple-touch-icon fallbacks`, () => {
    /* Modern browsers prefer the inline data: SVG icon, but Safari pinned
       tabs / iOS Add-to-Home-Screen / older Android need PNG + ICO files.
       Audit §6.2 — verify every page references both fallbacks. */
    assert.match(html, /<link[^>]+rel="icon"[^>]+href="\/favicon\.ico"/i,
      `${rel} missing <link rel="icon" href="/favicon.ico">`);
    assert.match(html, /<link[^>]+rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png"/i,
      `${rel} missing <link rel="apple-touch-icon" href="/apple-touch-icon.png">`);
  });
}

test('html: favicon assets exist in public/ for Vite to copy at build', () => {
  for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', f)),
      `public/${f} is missing — run \`npm run generate-favicons\``);
  }
});

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

/* An alt attribute that exists is not the same as an alt attribute that says
   anything. The check above has always passed while four of the site's densest
   figures — two multi-layer GCP architecture diagrams, a three-tier client /
   server table and a system overview carrying two dozen labels — were described
   as "Architecture overview", "Vertex AI pipeline run", "Design objectives
   diagram" and "Hardware setup and data processing". Each of those names the
   file rather than the picture, so a screen-reader user got the heading above
   the figure repeated back to them and nothing else. axe cannot catch this:
   the attribute is present and non-empty, which is all it can measure.

   The floor is deliberately low and by content type. Photographs are often
   honestly described in a handful of words; a diagram carrying labelled boxes
   and arrows almost never is. Failing here means "say what is in it", never
   "pad this out". A decorative image should carry alt="" and is skipped, since
   an empty alt is a deliberate statement that the image adds nothing. */
const DIAGRAM_ALT_MIN = 120;
const DIAGRAM_HINT = /diagram|architecture|pipeline|objectives|overview|chart|flow/i;

for (const rel of PAGES) {
  test(`html: descriptive alt text on the figures in ${rel}`, () => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const thin = [];
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      if (/\balt=""/.test(tag)) continue;                       // deliberately decorative
      const src = (/\bsrc="([^"]*)"/.exec(tag) || [, ''])[1];
      if (!/^\.\.\/img\/|^img\//.test(src)) continue;           // skip the analytics pixel
      const alt = (/\balt="([^"]*)"/.exec(tag) || [, ''])[1];
      const looksLikeDiagram = DIAGRAM_HINT.test(src) || DIAGRAM_HINT.test(alt);
      if (looksLikeDiagram && alt.length < DIAGRAM_ALT_MIN) {
        thin.push(`${src}\n      alt="${alt}" (${alt.length} chars)`);
      }
    }
    assert.deepEqual(thin, [],
      `${rel}: these look like diagrams but their alt text only names the file.\n`
      + `    Describe what the picture shows — the boxes, the arrows, the flow:\n    `
      + thin.join('\n    '));
  });
}
