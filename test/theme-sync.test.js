'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Theme-sync regression test.

   `generate-theme` rewrites the <meta theme-color>, the inline data: SVG
   favicon, and the nav-logo gradient stops across EVERY *.html page. If a page
   is added (or hand-edited) carrying a different palette's values, it silently
   drifts out of sync until the next regeneration touches it — exactly what
   happened to links.html.

   This guards against that: for every committed HTML page, running the real
   generator's rewriteHtml() with the active palette must be a no-op. A drifted
   page makes rewriteHtml() return changed text → the test fails and names the
   offending file, before the deploy.

   This test mattered most while a weekly job rotated the palette unattended.
   That job is gone and `active` is pinned (see data/palettes.yaml), so the
   drift it catches now comes from a hand-edit or a new page rather than from
   a scheduled run — a slower path to the same wrong colours, and still one
   with no human looking at all 21 pages.

   Run:  node --test test/theme-sync.test.js
──────────────────────────────────────────────────────────────────────────────*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseYaml } = require('../scripts/lib/yaml');
const { rewriteHtml, rewriteFaviconSvg, rewriteManifest, tameAccent } = require('../scripts/generate-theme.js');

const ROOT = path.resolve(__dirname, '..');

function activePalette() {
  const data = parseYaml(fs.readFileSync(path.join(ROOT, 'data/palettes.yaml'), 'utf8'));
  const id = data.active;
  const p = data.palettes[id];
  assert.ok(p, `active palette "${id}" is not defined in data/palettes.yaml`);
  /* generate-theme tames the accent chroma before writing the HTML, so the
     guard must compare against the same tamed palette. */
  return tameAccent(p);
}

/** The active palette's *id* — `activePalette()` returns the body, which
    carries a display `name` but not the key it was stored under. */
function activePaletteId() {
  return parseYaml(fs.readFileSync(path.join(ROOT, 'data/palettes.yaml'), 'utf8')).active;
}

/** Every *.html in the repo root + projects/ (the set generate-theme rewrites). */
function htmlFiles() {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f));
  const projDir = path.join(ROOT, 'projects');
  if (fs.existsSync(projDir)) {
    for (const f of fs.readdirSync(projDir)) {
      if (f.endsWith('.html')) files.push(path.join(projDir, f));
    }
  }
  return files.sort();
}

const palette = activePalette();
const paletteId = activePaletteId();

for (const file of htmlFiles()) {
  const rel = path.relative(ROOT, file);
  test(`theme-sync: ${rel} matches the active palette (${palette.name})`, () => {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(rewriteHtml(text, palette), text,
      `${rel} has stale theme values (theme-color / inline favicon / nav-grad stops). ` +
      `Run \`npm run generate-theme\` to resync it with the active palette "${palette.name}".`);
  });
}

test('theme-sync: public/favicon.svg matches the active palette', () => {
  const svgPath = path.join(ROOT, 'public/favicon.svg');
  if (!fs.existsSync(svgPath)) return; // tolerated — covered elsewhere if absent
  const text = fs.readFileSync(svgPath, 'utf8');
  assert.equal(rewriteFaviconSvg(text, palette), text,
    'public/favicon.svg is out of sync — run `npm run generate-theme`.');
});

test('theme-sync: public/manifest.webmanifest matches the active palette', () => {
  const manifestPath = path.join(ROOT, 'public/manifest.webmanifest');
  if (!fs.existsSync(manifestPath)) return; // tolerated — covered elsewhere if absent
  const text = fs.readFileSync(manifestPath, 'utf8');
  assert.equal(rewriteManifest(text, palette), text,
    'public/manifest.webmanifest theme_color/background_color are out of sync — ' +
    'run `npm run generate-theme`.');
});

/* ─────────────────────────────────────────────────────────────────────────────
   Keep the palette-owned <head> lines together.

   A weekly job used to commit a rotated palette straight to main, so any
   branch open across a Monday had to merge that commit. That was a conflict
   rather than a
   fast-forward because the four lines the rotation rewrites were scattered
   through the head, two of them directly beneath lines a human edits all the
   time: og:image sat one line under og:description, twitter:image one line
   under twitter:description. Git needs three lines of matching context to
   treat two changes as separate hunks; one line apart, an ordinary copy edit
   and a palette rotation collide.

   They now live in one block between `theme:start` and `theme:end`, with the
   font links above and the icon/manifest links below — static neighbours. This
   asserts they stayed there, because the fix is only a layout convention and
   nothing else would notice it being undone.

   Project pages are exempt: their og:image/twitter:image point at per-project
   .webp art that the generator never touches, and their theme-color and
   favicon already sit in static surroundings.
──────────────────────────────────────────────────────────────────────────────*/
const BRAND_PAGES = [
  'index.html', 'cv.html', 'projects.html', 'publications.html',
  'travel.html', 'links.html', 'now.html', '404.html',
];

for (const rel of BRAND_PAGES) {
  test(`theme-sync: ${rel} keeps the rotated lines inside the theme block`, () => {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');

    const m = html.match(/<!-- theme:start[\s\S]*?<!-- theme:end -->/);
    assert.ok(m, `${rel}: no theme:start/theme:end block — the palette rotation ` +
      'will conflict with ordinary head edits again');
    const block = m[0];

    /* Every line generate-theme rewrites has to be inside it. */
    for (const [label, re] of [
      ['<meta name="theme-color">', /<meta name="theme-color"/],
      ['og:image', /property="og:image"/],
      ['twitter:image', /name="twitter:image"/],
      ['the inline data: favicon', /href="data:image\/svg\+xml,/],
    ]) {
      const inBlock = (block.match(re) || []).length;
      const inPage = (html.match(new RegExp(re.source, 'g')) || []).length;
      assert.equal(inBlock, 1, `${rel}: ${label} is not inside the theme block`);
      assert.equal(inPage, 1, `${rel}: ${label} appears ${inPage} times, expected once`);
    }

    /* And the lines a human edits have to be outside it — putting the copy in
       the block would recreate the adjacency from the other direction. */
    for (const [label, re] of [
      ['og:title', /property="og:title"/],
      ['og:description', /property="og:description"/],
      ['twitter:description', /name="twitter:description"/],
      ['<title>', /<title>/],
    ]) {
      assert.ok(!re.test(block), `${rel}: ${label} must stay outside the theme block`);
    }
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   One theme, so no switch. The navbar used to carry a palette picker and a
   light/dark toggle, injected into every page by generate-theme-toggle along
   with a <head> bootstrap that re-applied a stored choice before paint. All of
   it went with the Montaggio redesign (#188). A page that still carries any of
   it has a control that does nothing — or, for the bootstrap, a script that
   pins a data-theme no stylesheet answers any more — so this fails on it.
──────────────────────────────────────────────────────────────────────────────*/
for (const file of htmlFiles()) {
  const rel = path.relative(ROOT, file);
  test(`theme-sync: ${rel} carries no theme or palette switch`, () => {
    const html = fs.readFileSync(file, 'utf8');
    for (const [what, re] of [
      ['palette dots', /class="palette-dot"/],
      ['a light/dark toggle', /id="theme-toggle"/],
      ['the theme bootstrap script', /theme-bootstrap|localStorage\.getItem\('theme'\)/],
      ['a data-theme / data-palette pin', /<html[^>]*data-(theme|palette)=/],
    ]) {
      assert.doesNotMatch(html, re, `${rel} still carries ${what}`);
    }
  });
}
