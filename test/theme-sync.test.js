'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Theme-sync regression test.

   The weekly palette rotation (.github/workflows/rotate-palette.yml) runs
   `generate-theme`, which rewrites the <meta theme-color>, the inline data:
   SVG favicon, and the nav-logo gradient stops across EVERY *.html page. If a
   page is added (or hand-edited) carrying a different palette's values, it
   silently drifts out of sync until the next regeneration touches it — exactly
   what happened to links.html.

   This guards against that: for every committed HTML page, running the real
   generator's rewriteHtml() with the active palette must be a no-op. A drifted
   page makes rewriteHtml() return changed text → the test fails and names the
   offending file, before the rotation workflow's deploy.

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

   The rotation commits straight to main every Monday, so any branch open
   across it has to merge that commit. That was a conflict rather than a
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
   The navbar palette dots must agree with the active palette.

   `generate-theme-toggle` bakes `aria-pressed="true"` onto the dot whose id
   equals `active:` in data/palettes.yaml. Nothing re-ran it after a rotation:
   the workflow's recipe — echoed in README.md and CLAUDE.md — was
   "generate-theme, then generate-favicons", written before the dots existed.
   So the palette rotated to crimson and all 21 pages went on claiming apricot
   was the selected one, 42 lines of drift that no test could see.

   It is only briefly visible (initTheme()'s syncDots() corrects the attribute
   on load, and a no-JS visitor cannot operate the dots anyway), which is
   precisely why it needed a test rather than an eye: this is a generated
   artefact that stopped matching its source, and every other generated
   artefact here is pinned against drift.

   Guarded from the committed HTML rather than by calling the builder, for the
   same reason the generate-cards tests read the shipped markup: comparing a
   builder to itself passes whether or not the page was ever regenerated.
──────────────────────────────────────────────────────────────────────────────*/
const DOT_RE = /<button[^>]*class="palette-dot"[^>]*data-palette="([a-z0-9-]+)"[^>]*aria-pressed="(true|false)"[^>]*>/g;

for (const file of htmlFiles()) {
  const rel = path.relative(ROOT, file);
  test(`theme-sync: ${rel} marks the active palette dot as pressed`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const dots = [...html.matchAll(DOT_RE)].map(m => ({ id: m[1], pressed: m[2] === 'true' }));
    assert.ok(dots.length, `${rel}: no .palette-dot buttons found — run \`npm run generate-theme-toggle\``);

    const pressed = dots.filter(d => d.pressed).map(d => d.id);
    assert.deepEqual(pressed, [paletteId],
      `${rel}: aria-pressed="true" is on [${pressed.join(', ') || 'nothing'}] but the active ` +
      `palette is "${paletteId}". Run \`npm run generate-theme-toggle\` — and note the ` +
      'rotation workflow must run it too, or this comes straight back next Monday.');
  });
}
