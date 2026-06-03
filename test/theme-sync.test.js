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
const { rewriteHtml, rewriteFaviconSvg, tameAccent } = require('../scripts/generate-theme.js');

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
