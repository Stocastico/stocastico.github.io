'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Tests for scripts/generate-theme.js
   Run:  npm run test:generate-theme
──────────────────────────────────────────────────────────────────────────────*/
const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  SURFACE_ALPHA,
  parseArgs, validate,
  hexToChannelList, hexToOklch, hexToLch, lchToHex, desaturate, tameAccent, faviconDataUri,
  generateCssBlock, generateThemeJs,
  rewriteHtml, rewriteFaviconSvg, spliceCssBlock,
} = require('../scripts/generate-theme');

// ─── A complete, valid sample palette ────────────────────────────────────────

/* A valid palette body. */
function paletteBody(overrides = {}) {
  return {
    name: 'Test Palette',
    bg: '#0a120e', bgAlt: '#0f1a14',
    text: '#e8eee5', textMuted: '#8a948b', textFaint: '#5e6862',
    accent: '#c8a44d', accentHi: '#dcb968',
    accent2: '#6db088', accent2Hi: '#9bd4b0',
    accentText: '#dcb968', accent2Text: '#9bd4b0', onAccent: '#1a1408',
    mapBg: '#08100c', themeColor: '#0a120e', faviconBg: '#0a120e', faviconFg: '#c8a44d',
    pins: { lived: '#6db088', current: '#e8c468', worktrip: '#4a9e8f', holiday: '#d98e54' },
    globe: {
      ocean: '#07140d', land: '#13251a', landEurope: '#2e3d1c',
      coast: '#2f8f6e', coastBright: '#b8e8cf',
      ambient: '#10241a', keyLight: '#2f5a3e', rimLight: '#6db088', fillLight: '#c8a44d',
      atmInner: '#6db088', atmShell: '#1f4a33', atmHalo: '#c8a44d',
      grid: '#3f8f72', gridBright: '#6dd0a8', stars: '#e8eee5',
      fallback1: '#46785a', fallback2: '#163424', fallback3: '#08140d',
    },
    ...overrides,
  };
}

function samplePalette(overrides = {}) {
  return paletteBody(overrides);
}

function sampleDoc(overrides = {}) {
  return { active: 'test', palettes: { test: samplePalette(overrides) } };
}

// ─── hexToChannelList ────────────────────────────────────────────────────────

test('hexToChannelList: converts #rrggbb to a space-separated channel list', () => {
  assert.equal(hexToChannelList('#0a120e'), '10 18 14');
  assert.equal(hexToChannelList('#ffffff'), '255 255 255');
  assert.equal(hexToChannelList('#000000'), '0 0 0');
});

// ─── validate ────────────────────────────────────────────────────────────────

test('validate: a complete palette has no errors', () => {
  assert.deepEqual(validate(sampleDoc()), []);
});

test('validate: missing active palette is reported', () => {
  const doc = { active: 'nope', palettes: { test: samplePalette() } };
  const errors = validate(doc);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /active palette "nope"/);
});

test('validate: a missing colour key is reported', () => {
  const p = samplePalette();
  delete p.accent;
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.accent is missing/.test(e)));
});

test('validate: a non-hex colour value is reported', () => {
  const errors = validate(sampleDoc({ accent: 'rebeccapurple' }));
  assert.ok(errors.some(e => /test\.accent must be a #rrggbb hex/.test(e)));
});

test('validate: a missing pin colour is reported', () => {
  const p = samplePalette();
  delete p.pins.current;
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.pins\.current is missing/.test(e)));
});

test('validate: a bad globe colour is reported', () => {
  const p = samplePalette();
  p.globe.ocean = '#xyz';
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.globe\.ocean must be a #rrggbb hex/.test(e)));
});

test('validate: the --palette override is honoured', () => {
  const doc = { active: 'test', palettes: { test: samplePalette(), other: samplePalette() } };
  assert.deepEqual(validate(doc, 'other'), []);
  assert.ok(validate(doc, 'missing').some(e => /missing/.test(e)));
});

// ─── validate: one theme ─────────────────────────────────────────────────────

test('validate: a `light` variant is rejected, not silently ignored', () => {
  /* The site ships one theme since the Montaggio redesign (#188). A light
     block left in the YAML would be colours nobody ships and no contrast test
     measures, so the generator refuses it. */
  const p = samplePalette({ light: paletteBody({ name: 'Light' }) });
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.light is no longer supported/.test(e)),
    `expected a light-rejected error, got: ${JSON.stringify(errors)}`);
});

// ─── generateCssBlock ────────────────────────────────────────────────────────

test('generateCssBlock: emits markers, oklch vars, channel lists and pin vars', () => {
  const css = generateCssBlock(samplePalette(), 'test');
  assert.match(css, /@theme-generated-start/);
  assert.match(css, /@theme-generated-end/);
  /* Solid colours ship as oklch(), computed from the palette hex. */
  assert.ok(css.includes(`--bg: ${hexToOklch('#0a120e')};`), 'bg should be oklch');
  assert.ok(css.includes(`--accent: ${hexToOklch('#c8a44d')};`), 'accent should be oklch');
  assert.ok(css.includes(`--pin-holiday: ${hexToOklch('#d98e54')};`), 'pin-holiday should be oklch');
  assert.match(css, /--accent: oklch\(/);
  /* sRGB channel lists stay sRGB for the rgb(var(--x-rgb) / a) alpha pattern. */
  assert.match(css, /--bg-rgb: 10 18 14;/);
  assert.match(css, /--accent-rgb: 200 164 77;/);
  /* Glow tokens stay hex8 (used directly in box-shadows). */
  assert.match(css, /--accent-glow: #c8a44d55;/);
  /* card / border surfaces are derived from the text channels */
  /* Alphas come from SURFACE_ALPHA in the generator rather than being repeated
     here — the values themselves are audited by test/contrast.test.mjs, and a
     literal copy would only mean two places to edit. */
  assert.match(css, new RegExp(`--bg-card: rgb\\(232 238 229 / ${SURFACE_ALPHA.card}\\);`));
  assert.match(css, new RegExp(`--map-land: rgb\\(232 238 229 / ${SURFACE_ALPHA.mapLand}\\);`));
  assert.match(css, new RegExp(`--border-hov: rgb\\(200 164 77 / ${SURFACE_ALPHA.borderHover}\\);`));
});

test('hexToOklch: round-trips to oklch() and is deterministic', () => {
  assert.match(hexToOklch('#000000'), /^oklch\(0% 0 0\)$/);
  assert.match(hexToOklch('#ffffff'), /^oklch\(100% 0 0\)$/);
  assert.match(hexToOklch('#c8a44d'), /^oklch\([\d.]+% [\d.]+ [\d.]+\)$/);
  assert.equal(hexToOklch('#d64550'), hexToOklch('#d64550'));
});

test('lchToHex: inverts hexToLch within rounding for in-gamut colours', () => {
  for (const hex of ['#d64550', '#c2632e', '#120a0a', '#f0e6e3', '#6db088']) {
    assert.equal(lchToHex(hexToLch(hex)), hex, `${hex} should round-trip`);
  }
});

test('desaturate: lowers OKLCH chroma but preserves lightness and hue', () => {
  const before = hexToLch('#d64550');
  const after = hexToLch(desaturate('#d64550'));
  assert.ok(after.C < before.C, 'chroma should drop');
  assert.ok(Math.abs(after.L - before.L) < 0.01, 'lightness preserved');
  assert.ok(Math.abs(after.H - before.H) < 1.0, 'hue preserved');
});

test('tameAccent: tames only the accent family, leaving bg/text/pins intact', () => {
  const p = samplePalette();
  const t = tameAccent(p);
  for (const k of ['accent', 'accentHi', 'accent2', 'accent2Hi']) {
    assert.ok(hexToLch(t[k]).C < hexToLch(p[k]).C, `${k} chroma should drop`);
  }
  assert.equal(t.bg, p.bg);
  assert.equal(t.text, p.text);
  assert.deepEqual(t.pins, p.pins);
});

// ─── generateThemeJs ─────────────────────────────────────────────────────────

test('generateThemeJs: emits a THEME object plus int/rgba/glvec helpers', () => {
  const js = generateThemeJs(samplePalette(), 'test');
  assert.match(js, /export const THEME = \{/);
  assert.match(js, /id: 'test'/);
  assert.match(js, /accent: '#c8a44d'/);
  assert.match(js, /export function int\(/);
  assert.match(js, /export function rgba\(/);
  assert.match(js, /export function glvec\(/);
  assert.match(js, /pins: \{/);
  assert.match(js, /globe: \{/);
  /* heroGradFrom/To and the noise block fed the gradient headings and the
     WebGL hero; both are gone (#189, #190), and the keys went with them (#195). */
  assert.doesNotMatch(js, /noise: \{|heroGrad/);
});

test('generateCssBlock: no --hero-grad-* vars (nothing reads them since #190)', () => {
  assert.doesNotMatch(generateCssBlock(samplePalette()), /--hero-grad/);
});

test('generateThemeJs: getTheme() returns the one theme, whatever the document says', () => {
  const body = generateThemeJs(samplePalette(), 'test').replace(/export /g, '');
  const vm = require('node:vm');
  assert.doesNotMatch(body, /THEME_LIGHT|PALETTES|data-theme|data-palette/,
    'no light variant or palette table should survive into js/theme.js');
  /* A stale data-theme from an old visit's bootstrap must not matter. */
  const sandbox = { document: { documentElement: { dataset: { theme: 'light', palette: 'forest' } } } };
  vm.runInNewContext(body + '\nthis.getTheme = getTheme; this.THEME = THEME;', sandbox);
  assert.equal(sandbox.getTheme(), sandbox.THEME);
  assert.equal(sandbox.getTheme().bg, '#0a120e');
});

test('generateThemeJs: the emitted helpers behave correctly', () => {
  /* Strip the ESM `export` keywords so the module body can run under vm. */
  const body = generateThemeJs(samplePalette(), 'test').replace(/export /g, '');
  const sandbox = {};
  const vm = require('node:vm');
  vm.runInNewContext(body + '\nthis.THEME = THEME; this.int = int; this.rgba = rgba; this.glvec = glvec;', sandbox);

  assert.equal(sandbox.THEME.accent, '#c8a44d');
  assert.equal(sandbox.int('#6db088'), 0x6db088);
  assert.equal(sandbox.rgba('#6db088', 0.5), 'rgba(109, 176, 136, 0.5)');
  /* Array.from — the vm sandbox returns cross-realm arrays. */
  assert.deepEqual(Array.from(sandbox.glvec('#ffffff')), [1, 1, 1]);
  assert.deepEqual(Array.from(sandbox.glvec('#000000')), [0, 0, 0]);
});

// ─── faviconDataUri ──────────────────────────────────────────────────────────

test('faviconDataUri: URL-encodes both fills into an SVG data URI', () => {
  const uri = faviconDataUri('#0a120e', '#c8a44d');
  assert.match(uri, /^data:image\/svg\+xml,/);
  assert.match(uri, /fill='%230a120e'/);
  assert.match(uri, /fill='%23c8a44d'/);
  assert.match(uri, /%3ESM%3C\/text%3E/);
});

// ─── rewriteHtml ─────────────────────────────────────────────────────────────

test('rewriteHtml: rewrites theme-color, favicon and nav-gradient stops', () => {
  const html = [
    '<meta name="theme-color" content="#080c14" />',
    `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='x' viewBox='0 0 64 64'%3E%3Crect fill='%23080c14'/%3E%3Ctext fill='%2300d4ff'%3ESM%3C/text%3E%3C/svg%3E" />`,
    '<linearGradient id="nav-grad"><stop offset="0%" stop-color="#6c63ff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient>',
    '<linearGradient id="other"><stop offset="0%" stop-color="#123456"/></linearGradient>',
  ].join('\n');

  const out = rewriteHtml(html, samplePalette());

  assert.match(out, /content="#0a120e"/);
  assert.match(out, /fill='%230a120e'/);
  assert.match(out, /fill='%23c8a44d'/);
  /* The nav mark points at the custom properties, not baked hex, so it follows
     a runtime palette switch (js/ui.js applyPalette) instead of freezing on
     whichever palette was active at build time. */
  assert.match(out, /id="nav-grad"><stop offset="0%" stop-color="var\(--accent\)"\/><stop offset="100%" stop-color="var\(--accent2\)"\/>/);
  /* a non-nav-grad gradient must be left untouched */
  assert.match(out, /id="other"><stop offset="0%" stop-color="#123456"\/>/);
});

test('rewriteHtml: rewrites nav-gradient stops idempotently', () => {
  const html = '<linearGradient id="nav-grad"><stop offset="0%" stop-color="#6c63ff"/><stop offset="100%" stop-color="#00d4ff"/></linearGradient>';
  const once = rewriteHtml(html, samplePalette());
  assert.equal(rewriteHtml(once, samplePalette()), once,
    'a second run must not double-rewrite the already-var() stops');
});

test('rewriteHtml: is idempotent', () => {
  const html = '<meta name="theme-color" content="#080c14" />';
  const once = rewriteHtml(html, samplePalette());
  assert.equal(rewriteHtml(once, samplePalette()), once);
});

// ─── rewriteFaviconSvg ───────────────────────────────────────────────────────

test('rewriteFaviconSvg: rewrites the rect and text fills', () => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '  <rect width="64" height="64" rx="12" fill="#080c14"/>',
    '  <text x="50%" y="56%" fill="#00d4ff">SM</text>',
    '</svg>',
  ].join('\n');
  const out = rewriteFaviconSvg(svg, samplePalette());
  assert.match(out, /<rect[^>]*fill="#0a120e"/);
  assert.match(out, /<text[^>]*fill="#c8a44d"/);
});

// ─── spliceCssBlock ──────────────────────────────────────────────────────────

test('spliceCssBlock: replaces content between the markers', () => {
  const css = ':root {\n  /* @theme-generated-start */\n  --old: red;\n  /* @theme-generated-end */\n  --keep: blue;\n}';
  const block = '  /* @theme-generated-start — new */\n  --bg: #000;\n  /* @theme-generated-end */';
  const out = spliceCssBlock(css, block);
  assert.match(out, /--bg: #000;/);
  assert.doesNotMatch(out, /--old: red;/);
  assert.match(out, /--keep: blue;/);
});

test('spliceCssBlock: throws when the markers are missing', () => {
  assert.throws(() => spliceCssBlock(':root { --x: 1; }', 'block'), /missing the/);
});

// ─── parseArgs ───────────────────────────────────────────────────────────────

test('parseArgs: defaults', () => {
  const o = parseArgs(['node', 'generate-theme.js']);
  assert.equal(o.dryRun, false);
  assert.equal(o.validate, false);
  assert.equal(o.palette, null);
});

test('parseArgs: flags', () => {
  const o = parseArgs(['node', 'generate-theme.js', '--dry-run', '--palette', 'apricot']);
  assert.equal(o.dryRun, true);
  assert.equal(o.palette, 'apricot');
});

test('parseArgs: unknown argument throws', () => {
  assert.throws(() => parseArgs(['node', 'generate-theme.js', '--wat']), /Unknown argument/);
});

/* ─────────────────────────────────────────────────────────────────────────────
   DRIFT: the committed artefacts match what the generator would emit today.

   Everything above tests the generator's functions against fixtures. Nothing
   tested the generator's *output* — the `@theme-generated` blocks actually
   sitting in css/styles.css and the js/theme.js actually imported by the
   canvases. Measured: changing the active palette's --accent in the committed
   stylesheet by one digit left all 33 tests in this file green.

   That is the one file CLAUDE.md says most emphatically never to hand-edit,
   and the one that used to be rewritten by an unattended weekly workflow. The
   failure it leaves is quiet in a specific way: css/styles.css paints the page,
   js/theme.js colours the WebGL hero and the globe, and data/palettes.yaml is
   what test/contrast.test.mjs measures for WCAG. Let the first drift from the
   third and the site ships colours no contrast test ever looked at, while the
   suite reports on colours the site does not use.

   Splicing a fresh generation into the committed file and requiring it to be a
   no-op is the same shape as the drift guards on generate-cards, llms.txt, the
   Europe coastline and the CNN activations — this was the gap in the set.
──────────────────────────────────────────────────────────────────────────────*/
const fs   = require('node:fs');
const path = require('node:path');
const { parseYaml } = require('../scripts/lib/yaml');

const ROOT = path.resolve(__dirname, '..');
const livePalettes = () => {
  const data = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
  const id = data.active;
  return { id, p: tameAccent(data.palettes[id]) };
};

test('drift: css/styles.css theme blocks match data/palettes.yaml', () => {
  const { id, p } = livePalettes();
  const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

  const next = spliceCssBlock(css, generateCssBlock(p, id));
  assert.doesNotMatch(css, /@theme-generated-(light|alt)-start/,
    'the light and alternate-palette blocks were retired with the toggle (#188)');

  assert.equal(next, css,
    'css/styles.css disagrees with data/palettes.yaml — run `npm run generate-theme`. '
    + 'The stylesheet is generated; a hand edit here ships colours that no palette '
    + 'test has measured.');
});

test('drift: js/theme.js matches data/palettes.yaml', () => {
  const { id, p } = livePalettes();
  const committed = fs.readFileSync(path.join(ROOT, 'js', 'theme.js'), 'utf8');
  assert.equal(generateThemeJs(p, id), committed,
    'js/theme.js disagrees with data/palettes.yaml — run `npm run generate-theme`. '
    + 'This module is what the hero shader, the globe and the Europe map read '
    + 'their colours from, so drift here repaints the canvases and nothing else.');
});
