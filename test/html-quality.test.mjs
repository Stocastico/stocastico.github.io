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

/* `npm test` is a glob on purpose — a hand-written list of test files drifted
   once and left three assertions in the repo that CI never executed (see the
   note in CLAUDE.md). The per-suite `test:*` aliases are a different thing:
   pure convenience, and nothing forces one to exist. But an alias that points
   at a file which has been renamed or deleted is worse than a missing one,
   because it fails with a Node error that reads like a broken test rather than
   like a stale script. Seven suites had no alias at all and one more named a
   file under a path that had moved. */
test('html: every test:* script points at a file that exists', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const dangling = [];
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (!name.startsWith('test:')) continue;
    for (const m of cmd.matchAll(/\btest\/[\w./-]+\.(?:test\.)?m?js\b/g)) {
      if (m[0].includes('*')) continue;
      if (!fs.existsSync(path.join(ROOT, m[0]))) dangling.push(`${name} -> ${m[0]}`);
    }
  }
  assert.deepEqual(dangling, [], `package.json test aliases naming missing files:\n  ${dangling.join('\n  ')}`);
});

/* ─── Heading structure ───────────────────────────────────────────────────────

   Two checks that nothing else in this repo makes. axe classes `heading-order`
   as best-practice and test/e2e/a11y.e2e.mjs excludes best-practice rules on
   purpose, so the browser layer is deliberately blind here — and heading
   structure has now been got wrong three separate times: the globe a11y list
   sat at <h4> under an <h1>, projects.html shipped fourteen project cards whose
   titles were <span>s (one heading on the page), and links.html shipped
   forty-eight blogroll entries the same way. The first two were found by
   reading; the third survived every suite in the repo.

   Comments are stripped first. The <h1> count above does not strip them, which
   is why CLAUDE.md carries a warning about never writing a literal heading tag
   inside an HTML comment — a rule a reader has to remember. Stripping is two
   characters of regex and removes the trap instead of documenting it, so these
   two checks strip and the note in CLAUDE.md is narrowed to the older test. */
function stripComments(html) { return html.replace(/<!--[\s\S]*?-->/g, ''); }

for (const rel of PAGES) {
  const html = stripComments(read(rel));

  test(`html: ${rel} heading levels never skip a rank`, () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/gi)].map(m => Number(m[1]));
    const skips = [];
    let prev = null;
    for (const level of levels) {
      if (prev !== null && level > prev + 1) skips.push(`h${prev} -> h${level}`);
      prev = level;
    }
    assert.deepEqual(skips, [],
      `${rel} skips a heading rank (${skips.join(', ')}). The ladder is `
      + `${levels.map(l => `h${l}`).join(' ')} — a screen reader announces the gap as a `
      + 'missing section. Add the intermediate rank, visually-hidden if the page already '
      + 'says it visually (cv.html does exactly that).');
  });

  /* A repeated collection of linked cards has to be skimmable by heading —
     jumping heading to heading is how a screen-reader user reads a list of
     forty-eight things without tabbing through forty-eight links.

     Grouped by card class rather than counted per page, and thresholded, so
     that a handful of one-off cards is not swept in: index.html carries three
     .contact-card anchors (LinkedIn, Scholar, GitHub) which are chrome under an
     existing <h2>, and a heading apiece would be noise. Five is the line — well
     under the fourteen that made this worth fixing on projects.html, well over
     the three that are fine as they are.

     Deliberately NOT "every element whose class ends in -name/-title must be a
     heading". That rule was written first and is wrong: it fires on
     .unesco-name (inside a <summary>, which is already a navigation stop),
     .skill-item-name and .lang-name, none of which are destinations. What makes
     a link card different is that it *is* one. */
  const CARD_MIN = 5;

  test(`html: repeated linked cards in ${rel} carry a heading`, () => {
    const groups = new Map();
    for (const m of html.matchAll(/<a\b[^>]*\bclass="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const cls = m[1].trim();
      if (!/(^|\s)[\w-]*card[\w-]*(\s|$)/.test(cls)) continue;
      if (!groups.has(cls)) groups.set(cls, []);
      groups.get(cls).push(m[2]);
    }
    const offenders = [];
    for (const [cls, bodies] of groups) {
      if (bodies.length < CARD_MIN) continue;
      const without = bodies.filter(b => !/<h[1-6][\s>]/i.test(b)).length;
      if (without) offenders.push(`.${cls}: ${without} of ${bodies.length} have no heading`);
    }
    assert.deepEqual(offenders, [],
      `${rel} repeats a linked card ${CARD_MIN}+ times with no heading inside it:\n  `
      + `${offenders.join('\n  ')}\n`
      + 'The card title should be a heading element, not a <span> — see the `level` '
      + 'argument threaded through projectCardHtml() in js/render-cards.js for the '
      + 'shape of the fix (the rank has to vary by page, so it is a parameter).');
  });
}
