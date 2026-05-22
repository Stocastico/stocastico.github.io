/* CSS + asset regression tests.
   - Every var(--x) referenced in styles.css must resolve to a definition
     (undefined custom properties fail silently in CSS and produce wrong
     rendering, e.g. square cards or invisible hover states).
   - Project card/hero backgrounds are CSS background-image URLs, so the
     browser can't auto-negotiate format: guard that they use the existing
     .webp sibling and stay light (they render decoratively, often dimmed). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../data/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* Custom properties injected at runtime — via JS .style.setProperty() or an
   inline style="" attribute — so they legitimately have no :root definition. */
const RUNTIME_VARS = new Set([
  '--card-bg',          // js/main.js renderProjectCard (lazy bg)
  '--pct',              // js/main.js skill bars
  '--gloss-x',          // js/animations.js card tilt gloss
  '--gloss-y',
  '--project-hero-img', // inline style on project detail hero
]);

test('css: every var(--x) in styles.css resolves to a definition', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const defined = new Set();
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
  const offenders = new Set();
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    const name = m[1];
    if (!defined.has(name) && !RUNTIME_VARS.has(name)) offenders.add(name);
  }
  assert.deepEqual([...offenders].sort(), [],
    `Undefined CSS custom properties referenced via var():\n  ${[...offenders].sort().join('\n  ')}`);
});

test('assets: project bg images use the .webp sibling when one exists', () => {
  const offenders = [];
  for (const p of PROJECTS) {
    if (!p.bg) continue;
    const ext = path.extname(p.bg);
    if (ext === '.webp' || ext === '.svg') continue;
    const webpSibling = p.bg.slice(0, -ext.length) + '.webp';
    if (fs.existsSync(path.join(ROOT, webpSibling))) {
      offenders.push(`${p.id}: bg "${p.bg}" but "${webpSibling}" exists (smaller)`);
    }
  }
  assert.deepEqual(offenders, [],
    `Project bg should reference the existing .webp sibling:\n  ${offenders.join('\n  ')}`);
});

const MAX_BG_KB = 150;
test(`assets: each project bg image is <= ${MAX_BG_KB}KB`, () => {
  const offenders = [];
  for (const p of PROJECTS) {
    if (!p.bg) continue;
    const abs = path.join(ROOT, p.bg);
    if (!fs.existsSync(abs)) { offenders.push(`${p.id}: missing "${p.bg}"`); continue; }
    const kb = fs.statSync(abs).size / 1024;
    if (kb > MAX_BG_KB) offenders.push(`${p.id}: "${p.bg}" is ${Math.round(kb)}KB`);
  }
  assert.deepEqual(offenders, [],
    `Decorative project bg images should stay light:\n  ${offenders.join('\n  ')}`);
});
