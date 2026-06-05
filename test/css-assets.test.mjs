/* CSS + asset regression tests.
   - Every var(--x) referenced in styles.css must resolve to a definition
     (undefined custom properties fail silently in CSS and produce wrong
     rendering, e.g. square cards or invisible hover states).
   - Project card/hero backgrounds are CSS background-image URLs, so the
     browser can't auto-negotiate format: guard that they use the existing
     .webp sibling and stay light (they render decoratively, often dimmed). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
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

test('css: html and body use overflow-x: clip', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  assert(css.includes('overflow-x: clip;'), 'Expected html/body overflow-x to be clip');
});

test('css: named easing tokens are defined', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  for (const token of ['--ease-out', '--ease-in', '--ease-in-out']) {
    assert(css.includes(`${token}:`), `Missing CSS custom property ${token}`);
  }
});

/* Return the declaration block (text between { and }) for a top-level rule
   whose selector is exactly `selector`. Card rules contain no nested braces. */
function ruleBlock(css, selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  return m ? m[1] : null;
}

test('css: project cards top-align their content', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const card = ruleBlock(css, '.project-card');
  assert(card, '.project-card rule not found');
  assert.match(card, /justify-content:\s*flex-start/,
    '.project-card should top-align its body (justify-content: flex-start)');
});

test('css: project card overlay is darkest at the top to match top-aligned content', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const overlay = ruleBlock(css, '.project-card__overlay');
  assert(overlay, '.project-card__overlay rule not found');
  assert.match(overlay, /linear-gradient\(\s*to bottom/,
    '.project-card__overlay gradient should be darkest at the top (to bottom)');
});

test('css: button state helper selectors are present', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const selectors = [
    '.btn:hover',
    '.btn.is-hover',
    '.btn:focus-visible',
    '.btn.is-focus',
    '.btn:active',
    '.btn.is-active',
    '.btn[disabled]',
    '.btn.is-disabled',
    '.btn[data-state="loading"]',
    '.btn[data-state="error"]',
  ];
  const missing = selectors.filter(s => !css.includes(s));
  assert.deepEqual(missing, [], `Missing button state helper selectors:\n  ${missing.join('\n  ')}`);
});
