'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Tests for scripts/generate-theme.js
   Run:  npm run test:generate-theme
──────────────────────────────────────────────────────────────────────────────*/
const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs, validate,
  hexToChannelList, faviconDataUri,
  generateCssBlock, generateThemeJs,
  rewriteHtml, rewriteFaviconSvg, spliceCssBlock,
} = require('../scripts/generate-theme');

// ─── A complete, valid sample palette ────────────────────────────────────────

function samplePalette(overrides = {}) {
  return {
    name: 'Test Palette',
    bg: '#0a120e', bgAlt: '#0f1a14',
    text: '#e8eee5', textMuted: '#8a948b', textFaint: '#5e6862',
    accent: '#c8a44d', accentHi: '#dcb968',
    accent2: '#6db088', accent2Hi: '#9bd4b0', onAccent: '#1a1408',
    heroGradFrom: '#e6d4a4', heroGradTo: '#6db088',
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
    noise: { dark: '#0a120e', mid: '#2c5e42', bright: '#7a9e4a' },
    ...overrides,
  };
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

// ─── generateCssBlock ────────────────────────────────────────────────────────

test('generateCssBlock: emits markers, hex vars, channel lists and pin vars', () => {
  const css = generateCssBlock(samplePalette(), 'test');
  assert.match(css, /@theme-generated-start/);
  assert.match(css, /@theme-generated-end/);
  assert.match(css, /--bg: #0a120e;/);
  assert.match(css, /--bg-rgb: 10 18 14;/);
  assert.match(css, /--accent: #c8a44d;/);
  assert.match(css, /--accent-rgb: 200 164 77;/);
  assert.match(css, /--accent-glow: #c8a44d55;/);
  assert.match(css, /--pin-holiday: #d98e54;/);
  /* card / border surfaces are derived from the text channels */
  assert.match(css, /--bg-card: rgb\(232 238 229 \/ 0\.04\);/);
  assert.match(css, /--border-hov: rgb\(200 164 77 \/ 0\.45\);/);
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
  assert.match(js, /noise: \{/);
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
  assert.match(out, /id="nav-grad"><stop offset="0%" stop-color="#c8a44d"\/><stop offset="100%" stop-color="#6db088"\/>/);
  /* a non-nav-grad gradient must be left untouched */
  assert.match(out, /id="other"><stop offset="0%" stop-color="#123456"\/>/);
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
