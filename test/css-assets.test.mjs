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

test('css: project cards carry no background artwork', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  for (const selector of ['.project-card__overlay', '.project-card--has-bg']) {
    assert(!css.includes(selector),
      `${selector} should be gone — card artwork was removed, see js/render-cards.js`);
  }
});

test('css: button interactive-state selectors are present', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  /* The real, used states — hover/focus/active/disabled. (The previous
     speculative `.is-*` mirror classes + `[data-state]` helpers were unused
     dead code and were removed; the JS never sets them.) */
  const selectors = [
    '.btn:hover',
    '.btn:focus-visible',
    '.btn:active',
    '.btn[disabled]',
  ];
  const missing = selectors.filter(s => !css.includes(s));
  assert.deepEqual(missing, [], `Missing button state selectors:\n  ${missing.join('\n  ')}`);
});

/* ─── The reveal must not be re-broken from the CSS side ─────
   `[data-animate]` is invisible until JS adds `.visible`, which makes two CSS
   decisions load-bearing rather than cosmetic. Both were wrong at once, and
   between them they left whole sections rendering as empty bands. */

test('css: no content-visibility on sections holding [data-animate] content', () => {
  /* Comments stripped first — the note explaining why this property was
     removed names both the property and the sections, and would match. */
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  /* A skipped content-visibility subtree is not rendered, and
     IntersectionObserver cannot see into one — so the reveal never fired for
     anything inside #projects / #publications / #contact, and at 390px the
     entire contact section stayed at opacity 0 permanently. */
  const rules = css.match(/[^}]*content-visibility\s*:\s*auto[^}]*}/g) || [];
  const offenders = rules.filter(r => /#projects|#publications|#contact/.test(r));
  assert.equal(offenders.length, 0,
    'content-visibility: auto on an animated section hides its content forever:\n' + offenders.join('\n'));
});

test('css: the [data-animate] hidden state is gated on scripting being enabled', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');

  /* Only JS ever adds `.visible`. An unhidden `opacity: 0` therefore blanks
     the page for anyone whose JS is off or whose module failed to load —
     including the server-rendered cards that exist precisely for them. */
  const hidingRules = [
    /\[data-animate\]\s*{[^}]*opacity:\s*0/,
    /\.research-card\[data-animate\]:not\(\.visible\)\s*{[^}]*opacity:\s*0/,
  ];

  /* Collect the @media (scripting: enabled) blocks and check each hiding rule
     lives inside one. Brace-matched rather than regexed, since these blocks
     nest. */
  const guarded = [];
  const marker = '@media (scripting: enabled)';
  let from = 0;
  for (;;) {
    const start = css.indexOf(marker, from);
    if (start === -1) break;
    let i = css.indexOf('{', start);
    let depth = 0;
    let end = i;
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}' && --depth === 0) break;
    }
    guarded.push(css.slice(i, end));
    from = end;
  }
  assert.ok(guarded.length, 'expected at least one @media (scripting: enabled) block');

  for (const rule of hidingRules) {
    assert.ok(
      guarded.some(block => rule.test(block)),
      `a rule matching ${rule} must sit inside @media (scripting: enabled) — ` +
      'otherwise a no-JS visitor gets a blank page');
  }
});

test('css: the print stylesheet reveals [data-animate]', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');

  /* Printing scrolls nothing, so none of the events initScrollReveal() sweeps
     on ever fire: scroll, resize, hashchange, load. Land on a page, press
     Ctrl+P, and everything below the fold printed as blank space — 21 of 21
     animated elements on the homepage, 9 of 12 on the CV. The layout and the
     page count were right, so the only symptom was missing ink, which is easy
     to read as a rendering quirk rather than a bug.

     Brace-matched rather than regexed: the print block contains nested rules
     and a palette override, so a lazy /@media print{[^}]*}/ stops early. */
  const start = css.indexOf('@media print');
  assert.ok(start !== -1, 'no @media print block');
  let depth = 0;
  let end = css.indexOf('{', start);
  for (; end < css.length; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}' && --depth === 0) break;
  }
  const block = css.slice(start, end);

  const rule = block.match(/\[data-animate\]\s*{[^}]*}/);
  assert.ok(rule, '@media print does not reveal [data-animate] — printing loses every unrevealed element');
  assert.match(rule[0], /opacity:\s*1\s*!important/,
    'the print reveal must beat the @media (scripting: enabled) opacity: 0');
});
