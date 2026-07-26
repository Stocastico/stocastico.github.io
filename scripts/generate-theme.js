#!/usr/bin/env node
'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   generate-theme.js — Propagate a colour palette across the whole site.

   Reads data/palettes.yaml, picks the `active` palette, and regenerates — in a
   single pass — every place a colour is baked in:

     • css/styles.css   — the :root colour block (between @theme-generated markers)
     • js/theme.js      — ESM module consumed by the WebGL / Canvas2D modules
                          and the GLSL shaders
     • *.html           — <meta theme-color>, the inline data: favicon, and the
       projects/*.html     nav-logo <linearGradient> stops
     • scripts/new-project.js — the same three things in its HTML template
     • public/favicon.svg
     • public/manifest.webmanifest — theme_color / background_color (PWA chrome)

   Usage:
     node scripts/generate-theme.js [options]

   Options:
     -i, --input   <path>   YAML source         (default: data/palettes.yaml)
     -p, --palette <id>     Override the active palette for this run
     --dry-run              Print what would change; write nothing
     --validate             Validate the YAML and exit
     -h, --help             Show this help

   After switching palettes you still need to rebuild raster favicons:
     npm run generate-favicons
──────────────────────────────────────────────────────────────────────────────*/

const fs   = require('node:fs');
const path = require('node:path');

const { parseYaml } = require('./lib/yaml');

const ROOT          = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'palettes.yaml');
const CSS_FILE      = path.join(ROOT, 'css', 'styles.css');
const THEME_FILE    = path.join(ROOT, 'js', 'theme.js');
const FAVICON_SVG   = path.join(ROOT, 'public', 'favicon.svg');
const MANIFEST      = path.join(ROOT, 'public', 'manifest.webmanifest');
const NEW_PROJECT   = path.join(ROOT, 'scripts', 'new-project.js');

const CSS_START = '/* @theme-generated-start';
const CSS_END   = '/* @theme-generated-end */';
/* Second marked region — the light-theme override block. Lives outside :root
   (it carries its own @media + [data-theme] selectors), so it gets its own
   marker pair spliced independently of the dark :root block above. */
const CSS_LIGHT_START = '/* @theme-generated-light-start';
const CSS_LIGHT_END   = '/* @theme-generated-light-end */';

/* Every palette that is NOT the active one, scoped to [data-palette="…"] so a
   visitor can switch at runtime. The active palette is deliberately absent:
   it already *is* the unscoped :root block, and emitting it twice would put
   the same values in two places in one stylesheet. With no attribute set the
   :root default applies, which is the active palette — so selecting it is
   simply "no override". */
const CSS_ALT_START = '/* @theme-generated-alt-start';
const CSS_ALT_END   = '/* @theme-generated-alt-end */';

/* Every flat #rrggbb key a palette must define. */
const REQUIRED_KEYS = [
  'name',
  'bg', 'bgAlt',
  'text', 'textMuted', 'textFaint',
  'accent', 'accentHi', 'accent2', 'accent2Hi', 'onAccent',
  'heroGradFrom', 'heroGradTo',
  'mapBg', 'themeColor', 'faviconBg', 'faviconFg',
];
const REQUIRED_PINS  = ['lived', 'current', 'worktrip', 'holiday'];
const REQUIRED_GLOBE = [
  'ocean', 'land', 'landEurope', 'coast', 'coastBright',
  'ambient', 'keyLight', 'rimLight', 'fillLight',
  'atmInner', 'atmShell', 'atmHalo',
  'grid', 'gridBright', 'stars',
  'fallback1', 'fallback2', 'fallback3',
];
const REQUIRED_NOISE = ['dark', 'mid', 'bright'];

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { input: DEFAULT_INPUT, palette: null, dryRun: false, validate: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if      (arg === '--input'   || arg === '-i') opts.input   = argv[++i];
    else if (arg === '--palette' || arg === '-p') opts.palette = argv[++i];
    else if (arg === '--dry-run')                 opts.dryRun  = true;
    else if (arg === '--validate')                opts.validate = true;
    else if (arg === '--help'    || arg === '-h') opts.help    = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/generate-theme.js [options]

Options:
  -i, --input   <path>   YAML source        (default: data/palettes.yaml)
  -p, --palette <id>     Override the active palette for this run
  --dry-run              Print what would change; write nothing
  --validate             Validate the YAML and exit
  -h, --help             Show this help

Examples:
  npm run generate-theme
  node scripts/generate-theme.js --palette apricot --dry-run
`);
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHex(v) { return typeof v === 'string' && HEX_RE.test(v); }

function hexChannels(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** '#rrggbb' → 'r g b' (space-separated channel list for modern rgb()/CSS). */
function hexToChannelList(hex) {
  const { r, g, b } = hexChannels(hex);
  return `${r} ${g} ${b}`;
}

/* '#rrggbb' → { L, C, H } in OKLCH (L 0..1, H degrees).
   sRGB → linear → OKLab → OKLCH (Björn Ottosson's matrices). */
function hexToLch(hex) {
  const { r, g, b } = hexChannels(hex);
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);

  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  let H = Math.atan2(bb, a) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L, C: Math.sqrt(a * a + bb * bb), H };
}

/* { L, C, H } in OKLCH → '#rrggbb' (OKLab → linear sRGB → sRGB, clamped). */
function lchToHex({ L, C, H }) {
  const hr = H * Math.PI / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const enc = (c) => {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return '#' + [enc(R), enc(G), enc(B)].map(n => n.toString(16).padStart(2, '0')).join('');
}

/* '#rrggbb' → 'oklch(L% C H)'. Output carries enough precision to round-trip
   back to the same sRGB byte values, so switching the emitted tokens from hex
   to oklch is a no-op on screen while giving the shipped CSS a perceptual,
   wide-gamut-ready colour space. */
function hexToOklch(hex) {
  const { L, C, H } = hexToLch(hex);
  const Cp = +C.toFixed(4);
  return `oklch(${+(L * 100).toFixed(3)}% ${Cp} ${Cp === 0 ? 0 : +H.toFixed(3)})`;
}

/* Slightly tame the accent chroma (OKLCH) for a more sophisticated, less
   "alert" accent — applied uniformly to every palette so a rotation never
   reintroduces a hot accent. Lightness + hue are preserved; only chroma is
   scaled. data/palettes.yaml stays the authored source (full chroma); this is
   the single knob that softens it site-wide (CSS, JS canvas, HTML, favicons). */
const ACCENT_CHROMA = 0.86;

function desaturate(hex, scale = ACCENT_CHROMA) {
  const lch = hexToLch(hex);
  return lchToHex({ ...lch, C: lch.C * scale });
}

/* Return a palette clone with the accent family chroma tamed. */
function tameAccent(p) {
  return {
    ...p,
    accent: desaturate(p.accent),
    accentHi: desaturate(p.accentHi),
    accent2: desaturate(p.accent2),
    accent2Hi: desaturate(p.accent2Hi),
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(data, paletteId) {
  const errors = [];
  if (!data || typeof data !== 'object') { return ['palettes file is not an object']; }
  if (typeof data.active !== 'string' || !data.active.trim()) {
    errors.push('`active` must be a non-empty string');
  }
  if (typeof data.palettes !== 'object' || data.palettes === null) {
    errors.push('`palettes` must be a mapping');
    return errors;
  }

  const id = paletteId || data.active;
  const p  = data.palettes[id];
  if (!p) {
    errors.push(`active palette "${id}" is not defined under \`palettes\``);
    return errors;
  }

  /* Validate the dark body, then its required light-theme counterpart. The
     light variant is itself a full palette body (same keys), but it is a leaf —
     it must NOT carry its own nested `light`, so we never recurse on it. */
  validatePaletteBody(p, id, errors);

  if (typeof p.light !== 'object' || p.light === null) {
    errors.push(`${id}.light must be a mapping (the light-theme colour variant)`);
  } else {
    validatePaletteBody(p.light, `${id}.light`, errors);
  }

  return errors;
}

/* Check every required hex/name key on one palette body (dark or light). */
function validatePaletteBody(p, ctx, errors) {
  const checkHex = (obj, key, c) => {
    if (obj[key] === undefined) { errors.push(`${c}.${key} is missing`); return; }
    if (key === 'name') {
      if (typeof obj[key] !== 'string' || !obj[key].trim()) errors.push(`${c}.${key} must be a non-empty string`);
      return;
    }
    if (!isHex(obj[key])) errors.push(`${c}.${key} must be a #rrggbb hex string (got "${obj[key]}")`);
  };

  for (const k of REQUIRED_KEYS) checkHex(p, k, ctx);
  if (typeof p.pins !== 'object' || p.pins === null) errors.push(`${ctx}.pins must be a mapping`);
  else for (const k of REQUIRED_PINS) checkHex(p.pins, k, `${ctx}.pins`);
  if (typeof p.globe !== 'object' || p.globe === null) errors.push(`${ctx}.globe must be a mapping`);
  else for (const k of REQUIRED_GLOBE) checkHex(p.globe, k, `${ctx}.globe`);
  if (typeof p.noise !== 'object' || p.noise === null) errors.push(`${ctx}.noise must be a mapping`);
  else for (const k of REQUIRED_NOISE) checkHex(p.noise, k, `${ctx}.noise`);
}

// ─── css/styles.css :root block ───────────────────────────────────────────────

/* The colour custom-property declarations for one palette body, each line
   prefixed with `indent`. Blank separators stay truly empty (no trailing
   indent). Shared by the dark :root block and the light override block so the
   two can never drift in which tokens they define.

   Solid colours ship as oklch() (perceptual, wide-gamut-ready); they round-trip
   from the palette hex so rendering is unchanged. The `*-rgb` channel lists stay
   sRGB so `rgb(var(--x-rgb) / <alpha>)` keeps working, and the `*-glow` tokens
   stay hex8 (used directly in box-shadows). */
function cssVarLines(p, indent) {
  const ch = hexToChannelList;
  const ok = hexToOklch;
  const I = indent;
  return [
    `${I}--bg: ${ok(p.bg)};`,
    `${I}--bg-rgb: ${ch(p.bg)};`,
    `${I}--bg-alt: ${ok(p.bgAlt)};`,
    `${I}--bg-alt-rgb: ${ch(p.bgAlt)};`,
    `${I}--bg-card: rgb(${ch(p.text)} / 0.04);`,
    `${I}--bg-card-hov: rgb(${ch(p.text)} / 0.07);`,
    `${I}--border: rgb(${ch(p.text)} / 0.08);`,
    `${I}--border-hov: rgb(${ch(p.accent)} / 0.45);`,
    ``,
    `${I}--accent: ${ok(p.accent)};`,
    `${I}--accent-rgb: ${ch(p.accent)};`,
    `${I}--accent-hi: ${ok(p.accentHi)};`,
    `${I}--accent-glow: ${p.accent}55;`,
    `${I}--accent2: ${ok(p.accent2)};`,
    `${I}--accent2-rgb: ${ch(p.accent2)};`,
    `${I}--accent2-hi: ${ok(p.accent2Hi)};`,
    `${I}--accent2-glow: ${p.accent2}44;`,
    `${I}--on-accent: ${ok(p.onAccent)};`,
    ``,
    `${I}--text: ${ok(p.text)};`,
    `${I}--text-rgb: ${ch(p.text)};`,
    `${I}--text-muted: ${ok(p.textMuted)};`,
    `${I}--text-faint: ${ok(p.textFaint)};`,
    ``,
    `${I}--hero-grad-from: ${ok(p.heroGradFrom)};`,
    `${I}--hero-grad-to: ${ok(p.heroGradTo)};`,
    `${I}--map-bg: ${ok(p.mapBg)};`,
    ``,
    `${I}--pin-lived: ${ok(p.pins.lived)};`,
    `${I}--pin-current: ${ok(p.pins.current)};`,
    `${I}--pin-worktrip: ${ok(p.pins.worktrip)};`,
    `${I}--pin-holiday: ${ok(p.pins.holiday)};`,
  ];
}

/* Dark theme — the default :root colour block (lines carry their 2-space
   :root indent already). */
function generateCssBlock(p, id) {
  return [
    `  ${CSS_START} — DO NOT EDIT.`,
    `     Generated by scripts/generate-theme.js from data/palettes.yaml.`,
    `     Run \`npm run generate-theme\` to update. Active palette: ${p.name} */`,
    ...cssVarLines(p, '  '),
    `  ${CSS_END}`,
  ].join('\n');
}

/* Light theme — top-level override block (sits outside :root). The site
   defaults to dark regardless of OS preference; light is strictly opt-in via
   the toggle, which pins [data-theme="light"] (persisted in localStorage and
   re-applied before paint by the <head> bootstrap). `color-scheme` flips so
   native form controls, scrollbars and the caret track the theme too. */
function generateCssLightBlock(p, id) {
  const pinned = cssVarLines(p, '    ').join('\n');
  return [
    `${CSS_LIGHT_START} — DO NOT EDIT.`,
    `   Generated by scripts/generate-theme.js from data/palettes.yaml (light variant).`,
    `   Run \`npm run generate-theme\` to update. Light palette: ${p.name} */`,
    `:root[data-theme="light"] {`,
    pinned,
    `  color-scheme: light;`,
    `}`,
    `${CSS_LIGHT_END}`,
  ].join('\n');
}

/* The non-active palettes, each as a [data-palette] scoped pair. Specificity
   does the work: :root[data-palette="x"] (0,2,0) outranks the :root default,
   and :root[data-palette="x"][data-theme="light"] (0,3,0) outranks the plain
   light override — so the two axes compose without !important. */
function generateCssAltBlock(palettes, activeId) {
  const ids = Object.keys(palettes).filter((id) => id !== activeId);
  const out = [
    `${CSS_ALT_START} — DO NOT EDIT.`,
    `   Generated by scripts/generate-theme.js from data/palettes.yaml.`,
    `   Run \`npm run generate-theme\` to update.`,
    `   The alternate palettes, applied when the document carries`,
    `   data-palette="…" (set by the palette picker in js/ui.js, and re-applied`,
    `   before first paint by the <head> bootstrap). */`,
  ];
  for (const id of ids) {
    const dark = tameAccent(palettes[id]);
    const light = tameAccent(palettes[id].light);
    out.push('');
    out.push(`:root[data-palette="${id}"] {`);
    out.push(cssVarLines(dark, '  ').join('\n'));
    out.push('}');
    out.push('');
    out.push(`:root[data-palette="${id}"][data-theme="light"] {`);
    out.push(cssVarLines(light, '  ').join('\n'));
    out.push('  color-scheme: light;');
    out.push('}');
  }
  out.push(CSS_ALT_END);
  return out.join('\n');
}

/* Replace the text between a marker pair (inclusive) with `block`. The start
   marker is rewound to the beginning of its line so any leading indentation is
   replaced cleanly. */
function spliceMarked(text, block, startMark, endMark) {
  const startIdx = text.indexOf(startMark);
  const endPos   = text.indexOf(endMark);
  if (startIdx === -1 || endPos === -1) {
    throw new Error(
      `css/styles.css is missing the "${startMark} ... ${endMark}" markers. ` +
      `Add them around the colour custom properties.`,
    );
  }
  let lineStart = startIdx;
  while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
  const endIdx = endPos + endMark.length;
  return text.slice(0, lineStart) + block + text.slice(endIdx);
}

function spliceCssBlock(cssText, block) {
  return spliceMarked(cssText, block, CSS_START, CSS_END);
}

// ─── js/theme.js ──────────────────────────────────────────────────────────────

/* Serialise one palette body to a THEME-shaped object literal (the `name:`
   line through the closing brace). `indent` is the base indent of the literal. */
function themeObjectBody(p, id, name) {
  const q = (v) => `'${v}'`;
  const flat = [
    'bg', 'bgAlt', 'text', 'textMuted', 'textFaint',
    'accent', 'accentHi', 'accent2', 'accent2Hi', 'onAccent',
    'heroGradFrom', 'heroGradTo', 'mapBg', 'themeColor', 'faviconBg', 'faviconFg',
  ];
  const flatLines = flat.map(k => `  ${k}: ${q(p[k])},`).join('\n');
  const pinLines  = REQUIRED_PINS.map(k => `    ${k}: ${q(p.pins[k])},`).join('\n');
  const globeLines = REQUIRED_GLOBE.map(k => `    ${k}: ${q(p.globe[k])},`).join('\n');
  const noiseLines = REQUIRED_NOISE.map(k => `    ${k}: ${q(p.noise[k])},`).join('\n');
  return `{
  id: '${id}',
  name: '${name}',
${flatLines}
  pins: {
${pinLines}
  },
  globe: {
${globeLines}
  },
  noise: {
${noiseLines}
  },
}`;
}

function generateThemeJs(p, id, pLight, allPalettes) {
  const light = pLight || p.light || p;
  const darkObj  = themeObjectBody(p, id, p.name);
  const lightObj = themeObjectBody(light, `${id}-light`, light.name);

  const indent = (text) => text.split('\n').map((l) => (l ? `    ${l}` : l)).join('\n').trimStart();
  const altEntries = Object.keys(allPalettes || { [id]: p }).map((pid) => {
    if (pid === id) {
      return `  ${pid}: { id: '${pid}', name: '${p.name}', dark: THEME, light: THEME_LIGHT },\n`;
    }
    const d = tameAccent(allPalettes[pid]);
    const l = tameAccent(allPalettes[pid].light);
    return `  ${pid}: {\n    id: '${pid}',\n    name: '${d.name}',\n`
      + `    dark: ${indent(themeObjectBody(d, pid, d.name))},\n`
      + `    light: ${indent(themeObjectBody(l, `${pid}-light`, l.name))},\n  },\n`;
  }).join('');

  return `/* ${'-'.repeat(74)}
   Theme colours — active palette: ${p.name}  (+ light variant: ${light.name})
   GENERATED by scripts/generate-theme.js — edit data/palettes.yaml to update.

   Run:  npm run generate-theme

   THEME holds the dark palette (the default); THEME_LIGHT holds the light
   variant. The site defaults to dark regardless of OS preference — light is
   opt-in, applied only when the document is explicitly pinned to
   data-theme="light". All values are #rrggbb hex strings; the helpers convert
   to the formats each layer needs:
     int(hex)        → 0xRRGGBB integer   (Three.js Color / material colours)
     rgba(hex, a)    → 'rgba(r, g, b, a)' (Canvas2D fill/stroke styles)
     glvec(hex)      → [r, g, b] 0..1     (GLSL vec3 literals / uniforms)
${'-'.repeat(78)} */

export const THEME = ${darkObj};

export const THEME_LIGHT = ${lightObj};

/* The palette shipped as the CSS :root default. */
export const ACTIVE_PALETTE = '${id}';

/* Every palette, so the picker can recolour the canvases live. The active one
   reuses THEME / THEME_LIGHT rather than repeating them. */
export const PALETTES = {
${altEntries}};

/* Resolve the palette in effect for the current document, along both axes:
   which palette (data-palette, default ACTIVE_PALETTE) and which variant
   (light only when explicitly pinned to data-theme="light" — everything else,
   including no pin and SSR, is dark). */
export function getTheme() {
  let paletteId = ACTIVE_PALETTE;
  let variant = 'dark';
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (root) {
    /* getAttribute first, dataset second: js/ui.js reads the same attributes
       that way, and it keeps this working against the minimal document stubs
       the tests use. */
    const read = (attr, key) => (typeof root.getAttribute === 'function'
      ? root.getAttribute(attr)
      : (root.dataset || {})[key]);
    const pid = read('data-palette', 'palette');
    if (pid && PALETTES[pid]) paletteId = pid;
    if (read('data-theme', 'theme') === 'light') variant = 'light';
  }
  const entry = PALETTES[paletteId] || PALETTES[ACTIVE_PALETTE];
  return variant === 'light' ? entry.light : entry.dark;
}

/* '#rrggbb' → 0xRRGGBB integer. */
export function int(hex) {
  return parseInt(String(hex).replace('#', ''), 16);
}

/* '#rrggbb' (+ alpha 0..1) → 'rgba(r, g, b, a)' string. */
export function rgba(hex, alpha = 1) {
  const n = int(hex);
  return \`rgba(\${(n >> 16) & 255}, \${(n >> 8) & 255}, \${n & 255}, \${alpha})\`;
}

/* '#rrggbb' → [r, g, b] floats 0..1, rounded for tidy GLSL source. */
export function glvec(hex) {
  const n = int(hex);
  const f = (c) => Math.round((c / 255) * 1e4) / 1e4;
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
`;
}

// ─── HTML / favicon rewriting ─────────────────────────────────────────────────

function faviconDataUri(bgHex, fgHex) {
  const bg = bgHex.slice(1);
  const fg = fgHex.slice(1);
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E` +
         `%3Crect width='64' height='64' rx='12' fill='%23${bg}'/%3E` +
         `%3Ctext x='50%25' y='56%25' text-anchor='middle' font-size='32' fill='%23${fg}' ` +
         `font-family='Georgia,serif'%3ESM%3C/text%3E%3C/svg%3E`;
}

/** Apply the theme-colour / favicon / nav-gradient / OG-image rewrites to an
 *  HTML-ish document string. Returns the new string (unchanged if nothing
 *  matched). `id` is the active palette key (used for the OG card filename). */
function rewriteHtml(text, p, id) {
  let out = text;

  /* 1. <meta name="theme-color" content="#rrggbb"> */
  out = out.replace(
    /(<meta\s+name="theme-color"\s+content=")#[0-9a-fA-F]{6}(")/g,
    `$1${p.themeColor}$2`,
  );

  /* 2. Inline data: SVG favicon */
  out = out.replace(
    /href="data:image\/svg\+xml,%3Csvg[^"]*%3C\/svg%3E"/g,
    `href="${faviconDataUri(p.faviconBg, p.faviconFg)}"`,
  );

  /* 3. nav-logo <linearGradient> stops — scoped to the nav-grad block so no
        other gradient is touched. These point at the CSS custom properties
        rather than baked hex, so the mark follows a *runtime* palette switch
        (js/ui.js applyPalette) the same way the rest of the chrome does.
        Literal hex from older revisions is rewritten on the next run. */
  out = out.replace(
    /<linearGradient id="nav-grad"[\s\S]*?<\/linearGradient>/g,
    (block) => {
      let i = 0;
      return block.replace(/stop-color="(?:#[0-9a-fA-F]{6}|var\(--accent2?\))"/g, () => {
        i++;
        return `stop-color="${i === 1 ? 'var(--accent)' : 'var(--accent2)'}"`;
      });
    },
  );

  /* 4. Social-card image (og:image / twitter:image) — brand pages point at the
        active palette's OG card. Matches the legacy screenshot-hero.png and any
        prior og-*.png; project pages use bespoke .webp images, left untouched. */
  if (id) {
    out = out.replace(
      /(content=")(https:\/\/[^"]+?)\/img\/(?:screenshot-hero\.png|og\/og-[a-z0-9-]+\.png)(")/g,
      `$1$2/img/og/og-${id}.png$3`,
    );
  }

  return out;
}

/** public/favicon.svg — rect fill = faviconBg, text fill = faviconFg. */
function rewriteFaviconSvg(text, p) {
  return text
    .replace(/(<rect\b[^>]*\bfill=")#[0-9a-fA-F]{6}(")/, `$1${p.faviconBg}$2`)
    .replace(/(<text\b[^>]*\bfill=")#[0-9a-fA-F]{6}(")/, `$1${p.faviconFg}$2`);
}

/** public/manifest.webmanifest — PWA chrome colours. theme_color drives the
 *  Android status/task-switcher bar (mirrors the HTML <meta theme-color>);
 *  background_color is the install splash screen, so it tracks the page bg. */
function rewriteManifest(text, p) {
  return text
    .replace(/("theme_color"\s*:\s*")#[0-9a-fA-F]{6}(")/, `$1${p.themeColor}$2`)
    .replace(/("background_color"\s*:\s*")#[0-9a-fA-F]{6}(")/, `$1${p.bg}$2`);
}

function listHtmlFiles() {
  const files = [];
  for (const entry of fs.readdirSync(ROOT)) {
    if (entry.endsWith('.html')) files.push(path.join(ROOT, entry));
  }
  const projDir = path.join(ROOT, 'projects');
  if (fs.existsSync(projDir)) {
    for (const entry of fs.readdirSync(projDir)) {
      if (entry.endsWith('.html')) files.push(path.join(projDir, entry));
    }
  }
  return files.sort();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { printHelp(); return; }

  if (!fs.existsSync(opts.input)) {
    console.error(`Error: input file not found: ${opts.input}`);
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = parseYaml(fs.readFileSync(opts.input, 'utf8'));
  } catch (err) {
    console.error(`YAML parse error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const errors = validate(data, opts.palette);
  if (errors.length) {
    console.error('Validation errors:');
    errors.forEach(e => console.error(`  • ${e}`));
    process.exitCode = 1;
    return;
  }

  if (opts.validate) {
    console.log(`✓ ${path.relative(ROOT, opts.input)} is valid.`);
    return;
  }

  const id = opts.palette || data.active;
  const p  = tameAccent(data.palettes[id]);
  /* The light variant gets the same accent-chroma taming as the dark palette. */
  const pLight = tameAccent(data.palettes[id].light);

  const themeJs   = generateThemeJs(p, id, pLight, data.palettes);
  const cssBlock  = generateCssBlock(p, id);
  const cssLight  = generateCssLightBlock(pLight, id);
  const cssAlt    = generateCssAltBlock(data.palettes, id);
  const htmlFiles = listHtmlFiles();

  if (opts.dryRun) {
    console.log(`── Active palette: ${p.name} (${id}) — light: ${pLight.name} ──\n`);
    console.log(`── js/theme.js ${'─'.repeat(50)}`);
    console.log(themeJs);
    console.log(`── css/styles.css :root block (dark) ${'─'.repeat(26)}`);
    console.log(cssBlock);
    console.log(`── css/styles.css light override block ${'─'.repeat(24)}`);
    console.log(cssLight);
    console.log(`\n── would rewrite ${'─'.repeat(45)}`);
    [...htmlFiles, NEW_PROJECT, FAVICON_SVG, MANIFEST].forEach(f => console.log(`  • ${path.relative(ROOT, f)}`));
    return;
  }

  const written = [];

  /* js/theme.js */
  fs.writeFileSync(THEME_FILE, themeJs, 'utf8');
  written.push(path.relative(ROOT, THEME_FILE));

  /* css/styles.css — dark :root block + light override block */
  const css = fs.readFileSync(CSS_FILE, 'utf8');
  let nextCss = spliceCssBlock(css, cssBlock);
  nextCss = spliceMarked(nextCss, cssLight, CSS_LIGHT_START, CSS_LIGHT_END);
  nextCss = spliceMarked(nextCss, cssAlt, CSS_ALT_START, CSS_ALT_END);
  if (nextCss !== css) {
    fs.writeFileSync(CSS_FILE, nextCss, 'utf8');
    written.push(path.relative(ROOT, CSS_FILE));
  }

  /* HTML files + new-project.js template */
  for (const file of [...htmlFiles, NEW_PROJECT]) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const next = rewriteHtml(src, p, id);
    if (next !== src) {
      fs.writeFileSync(file, next, 'utf8');
      written.push(path.relative(ROOT, file));
    }
  }

  /* public/favicon.svg */
  if (fs.existsSync(FAVICON_SVG)) {
    const src = fs.readFileSync(FAVICON_SVG, 'utf8');
    const next = rewriteFaviconSvg(src, p);
    if (next !== src) {
      fs.writeFileSync(FAVICON_SVG, next, 'utf8');
      written.push(path.relative(ROOT, FAVICON_SVG));
    }
  }

  /* public/manifest.webmanifest — PWA theme/background colours */
  if (fs.existsSync(MANIFEST)) {
    const src = fs.readFileSync(MANIFEST, 'utf8');
    const next = rewriteManifest(src, p);
    if (next !== src) {
      fs.writeFileSync(MANIFEST, next, 'utf8');
      written.push(path.relative(ROOT, MANIFEST));
    }
  }

  console.log(`✓ Applied palette "${p.name}" (${id}) — ${written.length} file(s) updated:`);
  written.forEach(f => console.log(`    ${f}`));
  console.log(`\n  Raster favicons are not regenerated automatically — run:`);
  console.log(`    npm run generate-favicons`);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = {
  parseArgs, validate, validatePaletteBody,
  hexToChannelList, hexToOklch, hexToLch, lchToHex, desaturate, tameAccent, faviconDataUri,
  cssVarLines, generateCssBlock, generateCssLightBlock, generateThemeJs, themeObjectBody,
  rewriteHtml, rewriteFaviconSvg, rewriteManifest,
  spliceCssBlock, spliceMarked,
};
