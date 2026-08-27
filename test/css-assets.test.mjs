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
import { createRequire } from 'node:module';
import { PROJECTS } from '../data/projects.js';

/* new-project.js already reads PNG/JPEG/WebP headers for og:image:width;
   it is CJS, hence the require. */
const { imageSize } = createRequire(import.meta.url)('../scripts/new-project.js');

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

/* ─── Inline diagrams must stay theme-driven ──────────────────
   The architecture diagrams were <img src="…svg"> for a long time, and an
   external SVG is its own document: it cannot read this page's custom
   properties, so every colour had to be baked in. Three of them were, in three
   different palettes, all of them superseded — near-black panels in a cream
   page in light mode, cold blue-black on warm brown in dark. Inlining is what
   lets them read var(--*); a hex literal creeping back in silently undoes
   that, and only in the theme nobody happened to screenshot. */
test('inline project diagrams carry no hardcoded colours', () => {
  const dir = path.join(ROOT, 'projects');
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const svg of html.match(/<svg class="diagram"[\s\S]*?<\/svg>/g) || []) {
      /* #rrggbb / #rgb in a colour position. Fragment refs (url(#ah),
         href="#x") are not colours and must not be flagged. */
      for (const m of svg.match(/(?:fill|stroke|stop-color|color)="#[0-9a-fA-F]{3,8}"/g) || []) {
        offenders.push(`${file}: ${m}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'inline diagrams must use var(--*) so they follow the palette and the light/dark toggle:\n'
    + offenders.join('\n'));
});

test('every page with an inline diagram actually inlines it', () => {
  /* The point of inlining is lost the moment one goes back to <img src>.

     The name list is derived from drafts/diagrams/ rather than written out, so
     a diagram added there is covered without editing this test — the previous
     version hardcoded three names and would have said nothing about the four
     added since. */
  const names = fs.readdirSync(path.join(ROOT, 'drafts', 'diagrams'))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => path.basename(f, '.svg'));
  assert.ok(names.length >= 7, `only ${names.length} diagram source(s) found`);

  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const asImg = new RegExp(`<img[^>]+src="[^"]*\\/(${alt})\\.(svg|webp|png)"`, 'g');

  const dir = path.join(ROOT, 'projects');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.deepEqual(html.match(asImg) || [], [],
      `${file} references a diagram as <img>; inline it so var(--*) resolves`);
  }
});

/* Every diagram source must actually reach a page. A file in drafts/diagrams/
   that nothing inlines is the same kind of invisible dead weight as an
   unreferenced image — it is never deployed, so nothing breaks, and it rots. */
test('every diagram source is inlined by some page', () => {
  const dir = path.join(ROOT, 'projects');
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

  const orphans = [];
  for (const file of fs.readdirSync(path.join(ROOT, 'drafts', 'diagrams'))) {
    if (!file.endsWith('.svg')) continue;
    const svg = fs.readFileSync(path.join(ROOT, 'drafts', 'diagrams', file), 'utf8');
    /* Match on the <title>, which is unique per diagram and survives the
       inlining verbatim. */
    const title = /<title>([\s\S]*?)<\/title>/.exec(svg);
    assert.ok(title, `drafts/diagrams/${file} has no <title> — it needs one for screen readers`);
    if (!pages.includes(title[1].trim())) orphans.push(file);
  }
  assert.deepEqual(orphans, [],
    `these diagram sources are inlined nowhere: ${orphans.join(', ')}`);
});

test('assets: no unreferenced images in img/', () => {
  /* 546 KB of images had accumulated that nothing on the site pointed at —
     inevent.png (363 KB), mpi-brain-thumb.webp (110 KB) and four orphaned
     thumbs — and the build copied img/ wholesale, so all of it shipped. They
     are invisible by nature: an unused file breaks nothing and shows up in no
     page. Only a check like this one notices.

     Two deliberate exemptions. img/og/ holds one social card per palette and
     only the active one is referenced; the others become referenced the moment
     `active:` changes in data/palettes.yaml. drafts/ is not deployed, so a
     reference from there does not count as one. */
  const IMG = path.join(ROOT, 'img');
  const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif']);

  const images = [];
  const walkImages = (dir, rel = '') => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, ent.name);
      const nextRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walkImages(next, nextRel);
      else if (exts.has(path.extname(ent.name).toLowerCase())) images.push(nextRel);
    }
  };
  walkImages(IMG);

  /* Every text source that could name an image. Deliberately not *.md — the
     review notes and drafts name files they do not ship. */
  const sources = [];
  const SKIP = new Set(['node_modules', 'dist', '.git', '.cache', 'screenshots', 'drafts', 'img']);
  const walkSources = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(ent.name)) continue;
      const next = path.join(dir, ent.name);
      if (ent.isDirectory()) walkSources(next);
      else if (/\.(html|css|js|mjs|cjs|json|yaml|yml|webmanifest|xml)$/.test(ent.name)) sources.push(next);
    }
  };
  walkSources(ROOT);
  const haystack = sources.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  const orphans = images.filter((rel) => {
    if (rel.startsWith('og/')) return false;
    return !haystack.includes(path.basename(rel));
  });

  assert.deepEqual(orphans, [],
    'these images are referenced nowhere and would still be deployed:\n  ' + orphans.join('\n  '));
});

/* Hero images have to survive being stretched.

   `.project-hero` paints `--project-hero-img` with `background-size: cover`
   across the full viewport width, so at a 1440px window the browser scales the
   file to at least 1440px wide whatever its intrinsic size. Two heroes are
   nowhere near it — avatech-bg is 270x187 and mpi-brain-bg is 292x173, so both
   are blown up more than 4.5x. The scrim hides some of it; it does not hide
   that avatech's is a dense ELAN screenshot whose text becomes mush, or that
   mpi-brain's is a multi-panel figure montage whose panel seam lands
   mid-banner and reads as a half-loaded image.

   Both need new source art, which is not something a test can produce. What it
   can do is stop the list growing, and notice when the debt is paid.

   The floor is 600px, and it is set by what actually looks wrong rather than
   by what would be ideal. Five other heroes sit between 673 and 800 — a 1.8x
   to 2.1x upscale — and under a 65-95% scrim that is genuinely fine; captured
   at 1440px they read as intended. The two below 300 do not. A floor at 1200
   would be the size a hero deserves and would pin seven files as debt, which
   is how a list like this stops being read. */
const HERO_MIN_WIDTH = 600;

/* Known too small. Replacing either file means deleting its line here — the
   test fails if a pinned file grows, so the list cannot quietly outlive the
   problem it records. */
const UNDERSIZED_HEROES = new Set([
  'img/projects/avatech-bg.webp',      // 270x187
  'img/projects/mpi-brain-bg.webp',    // 292x173
]);

test('assets: project hero images are large enough to be stretched across a hero', () => {
  const pagesDir = path.join(ROOT, 'projects');
  const tooSmall = [];
  const fixed = [];
  let checked = 0;

  for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(pagesDir, file), 'utf8');
    const m = /--project-hero-img:\s*url\('\.\.\/(img\/[^']+)'\)/.exec(html);
    if (!m) continue;
    const rel = m[1];
    /* An SVG hero has no intrinsic pixel size to be too small — it is drawn at
       whatever scale it is painted, and on these pages it is a stencil painted
       through mask-image. */
    if (rel.endsWith('.svg')) continue;

    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `projects/${file} names a hero image that does not exist: ${rel}`);
    const size = imageSize(abs);
    assert.ok(size, `could not read the dimensions of ${rel}`);
    checked += 1;

    if (size.width >= HERO_MIN_WIDTH) {
      if (UNDERSIZED_HEROES.has(rel)) fixed.push(`${rel} is now ${size.width}px wide`);
    } else if (!UNDERSIZED_HEROES.has(rel)) {
      tooSmall.push(`projects/${file}: ${rel} is ${size.width}px wide, needs ${HERO_MIN_WIDTH}`);
    }
  }

  assert.ok(checked >= 9, `only ${checked} raster hero(es) found — the page scan is probably wrong`);
  assert.deepEqual(fixed, [],
    `these heroes have been replaced — delete them from UNDERSIZED_HEROES:\n  ${fixed.join('\n  ')}`);
  assert.deepEqual(tooSmall, [],
    'these hero images will be visibly upscaled by background-size: cover:\n  '
    + tooSmall.join('\n  '));
});
