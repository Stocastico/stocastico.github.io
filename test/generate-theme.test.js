'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Tests for scripts/generate-theme.js
   Run:  npm run test:generate-theme
──────────────────────────────────────────────────────────────────────────────*/
const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs, validate,
  hexToChannelList, hexToOklch, hexToLch, lchToHex, desaturate, tameAccent, faviconDataUri,
  generateCssBlock, generateCssLightBlock, generateThemeJs,
  rewriteHtml, rewriteFaviconSvg, spliceCssBlock, spliceMarked,
} = require('../scripts/generate-theme');

// ─── A complete, valid sample palette ────────────────────────────────────────

/* A valid flat palette body (no nested `light`) — used both as the dark
   palette and, on its own, as a light variant. */
function paletteBody(overrides = {}) {
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

/* A light-theme variant body. Surfaces light, text dark — a plausible
   counterpart so the paired-palette validation has something valid to chew. */
function sampleLight(overrides = {}) {
  return paletteBody({
    name: 'Test Palette Light',
    bg: '#faf6f3', bgAlt: '#f2e9e5',
    text: '#1d2620', textMuted: '#55605a', textFaint: '#7a857e',
    onAccent: '#fdfdfb',
    themeColor: '#faf6f3', faviconBg: '#faf6f3',
    mapBg: '#eef3ec',
    ...overrides,
  });
}

/* Full palette: dark body + nested `light` variant (the new required shape). */
function samplePalette(overrides = {}) {
  return paletteBody({ light: sampleLight(), ...overrides });
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

// ─── validate: light-theme variant ───────────────────────────────────────────

test('validate: a missing `light` variant is reported', () => {
  const p = samplePalette();
  delete p.light;
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.light must be a mapping/.test(e)),
    `expected a light-missing error, got: ${JSON.stringify(errors)}`);
});

test('validate: a bad colour inside the `light` variant is reported', () => {
  const p = samplePalette();
  p.light.accent = 'rebeccapurple';
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.light\.accent must be a #rrggbb hex/.test(e)),
    `expected a light.accent error, got: ${JSON.stringify(errors)}`);
});

test('validate: a missing globe colour inside `light` is reported', () => {
  const p = samplePalette();
  delete p.light.globe.ocean;
  const errors = validate({ active: 'test', palettes: { test: p } });
  assert.ok(errors.some(e => /test\.light\.globe\.ocean is missing/.test(e)));
});

test('validate: the `light` variant does not itself require a nested light', () => {
  /* light bodies are leaf palettes — no infinite light.light.light nesting. */
  assert.deepEqual(validate(sampleDoc()), []);
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
  assert.match(css, /--bg-card: rgb\(232 238 229 \/ 0\.04\);/);
  assert.match(css, /--border-hov: rgb\(200 164 77 \/ 0\.45\);/);
});

// ─── generateCssLightBlock ───────────────────────────────────────────────────

test('generateCssLightBlock: emits OS-preference + explicit-override selectors', () => {
  const css = generateCssLightBlock(sampleLight(), 'test');
  assert.match(css, /@theme-generated-light-start/);
  assert.match(css, /@theme-generated-light-end/);
  /* Auto-apply when the OS prefers light AND the user hasn't pinned dark. */
  assert.match(css, /@media \(prefers-color-scheme: light\)/);
  assert.match(css, /:root:not\(\[data-theme="dark"\]\)/);
  /* Explicit manual override always wins. */
  assert.match(css, /:root\[data-theme="light"\]/);
  /* Native UI flips to light too. */
  assert.match(css, /color-scheme: light;/);
  /* Light surfaces present as oklch, derived from the light palette hex. */
  assert.ok(css.includes(`--bg: ${hexToOklch('#faf6f3')};`), 'light --bg should be oklch of light surface');
});

test('generateCssLightBlock: shares the same token set as the dark block', () => {
  const light = generateCssLightBlock(sampleLight(), 'test');
  /* Every custom property the dark block defines must also be overridden in
     light, or a token would silently keep its dark value under light. */
  const dark = generateCssBlock(samplePalette(), 'test');
  const darkTokens = [...dark.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map(m => m[1]).sort();
  const lightTokens = [...new Set([...light.matchAll(/(--[a-z0-9-]+):/g)].map(m => m[1]))].sort();
  assert.deepEqual(lightTokens, darkTokens,
    'light block must override exactly the dark token set');
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
  assert.match(js, /noise: \{/);
});

test('generateThemeJs: emits THEME_LIGHT and a getTheme() accessor', () => {
  const js = generateThemeJs(samplePalette(), 'test', sampleLight());
  assert.match(js, /export const THEME_LIGHT = \{/);
  assert.match(js, /export function getTheme\(/);
  /* THEME stays the dark default; THEME_LIGHT carries the light surfaces. */
  assert.match(js, /export const THEME = \{/);
  assert.match(js, /bg: '#faf6f3'/);
});

test('generateThemeJs: getTheme() returns dark by default and light when pinned', () => {
  const body = generateThemeJs(samplePalette(), 'test', sampleLight()).replace(/export /g, '');
  const vm = require('node:vm');

  /* No document → SSR/test default is the dark theme. */
  const ssr = {};
  vm.runInNewContext(body + '\nthis.getTheme = getTheme;', ssr);
  assert.equal(ssr.getTheme().bg, '#0a120e', 'no document defaults to dark');

  /* documentElement pinned to light → light palette. */
  const pinnedLight = { document: { documentElement: { dataset: { theme: 'light' } } } };
  vm.runInNewContext(body + '\nthis.getTheme = getTheme;', pinnedLight);
  assert.equal(pinnedLight.getTheme().bg, '#faf6f3', 'data-theme=light selects light');

  /* documentElement pinned to dark → dark palette even if OS prefers light. */
  const pinnedDark = {
    document: { documentElement: { dataset: { theme: 'dark' } } },
    matchMedia: () => ({ matches: true }),
  };
  vm.runInNewContext(body + '\nthis.getTheme = getTheme;', pinnedDark);
  assert.equal(pinnedDark.getTheme().bg, '#0a120e', 'data-theme=dark pins dark');

  /* No pin, OS prefers light → light palette. */
  const osLight = {
    document: { documentElement: { dataset: {} } },
    matchMedia: (q) => ({ matches: /light/.test(q) }),
  };
  vm.runInNewContext(body + '\nthis.getTheme = getTheme;', osLight);
  assert.equal(osLight.getTheme().bg, '#faf6f3', 'OS light pref selects light');
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
