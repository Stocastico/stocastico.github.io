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
const NEW_PROJECT   = path.join(ROOT, 'scripts', 'new-project.js');

const CSS_START = '/* @theme-generated-start';
const CSS_END   = '/* @theme-generated-end */';

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

  const checkHex = (obj, key, ctx) => {
    if (obj[key] === undefined) { errors.push(`${ctx}.${key} is missing`); return; }
    if (key === 'name') {
      if (typeof obj[key] !== 'string' || !obj[key].trim()) errors.push(`${ctx}.${key} must be a non-empty string`);
      return;
    }
    if (!isHex(obj[key])) errors.push(`${ctx}.${key} must be a #rrggbb hex string (got "${obj[key]}")`);
  };

  for (const k of REQUIRED_KEYS) checkHex(p, k, id);
  if (typeof p.pins !== 'object' || p.pins === null) errors.push(`${id}.pins must be a mapping`);
  else for (const k of REQUIRED_PINS) checkHex(p.pins, k, `${id}.pins`);
  if (typeof p.globe !== 'object' || p.globe === null) errors.push(`${id}.globe must be a mapping`);
  else for (const k of REQUIRED_GLOBE) checkHex(p.globe, k, `${id}.globe`);
  if (typeof p.noise !== 'object' || p.noise === null) errors.push(`${id}.noise must be a mapping`);
  else for (const k of REQUIRED_NOISE) checkHex(p.noise, k, `${id}.noise`);

  return errors;
}

// ─── css/styles.css :root block ───────────────────────────────────────────────

function generateCssBlock(p, id) {
  const ch = hexToChannelList;
  const ok = hexToOklch;
  /* Solid colours ship as oklch() (perceptual, wide-gamut-ready); they
     round-trip from the palette hex so rendering is unchanged. The `*-rgb`
     channel lists stay sRGB so `rgb(var(--x-rgb) / <alpha>)` keeps working,
     and the `*-glow` tokens stay hex8 (used directly in box-shadows).
     Lines carry their final 2-space :root indent already. */
  return [
    `  ${CSS_START} — DO NOT EDIT.`,
    `     Generated by scripts/generate-theme.js from data/palettes.yaml.`,
    `     Run \`npm run generate-theme\` to update. Active palette: ${p.name} */`,
    `  --bg: ${ok(p.bg)};`,
    `  --bg-rgb: ${ch(p.bg)};`,
    `  --bg-alt: ${ok(p.bgAlt)};`,
    `  --bg-alt-rgb: ${ch(p.bgAlt)};`,
    `  --bg-card: rgb(${ch(p.text)} / 0.04);`,
    `  --bg-card-hov: rgb(${ch(p.text)} / 0.07);`,
    `  --border: rgb(${ch(p.text)} / 0.08);`,
    `  --border-hov: rgb(${ch(p.accent)} / 0.45);`,
    ``,
    `  --accent: ${ok(p.accent)};`,
    `  --accent-rgb: ${ch(p.accent)};`,
    `  --accent-hi: ${ok(p.accentHi)};`,
    `  --accent-glow: ${p.accent}55;`,
    `  --accent2: ${ok(p.accent2)};`,
    `  --accent2-rgb: ${ch(p.accent2)};`,
    `  --accent2-hi: ${ok(p.accent2Hi)};`,
    `  --accent2-glow: ${p.accent2}44;`,
    `  --on-accent: ${ok(p.onAccent)};`,
    ``,
    `  --text: ${ok(p.text)};`,
    `  --text-rgb: ${ch(p.text)};`,
    `  --text-muted: ${ok(p.textMuted)};`,
    `  --text-faint: ${ok(p.textFaint)};`,
    ``,
    `  --hero-grad-from: ${ok(p.heroGradFrom)};`,
    `  --hero-grad-to: ${ok(p.heroGradTo)};`,
    `  --map-bg: ${ok(p.mapBg)};`,
    ``,
    `  --pin-lived: ${ok(p.pins.lived)};`,
    `  --pin-current: ${ok(p.pins.current)};`,
    `  --pin-worktrip: ${ok(p.pins.worktrip)};`,
    `  --pin-holiday: ${ok(p.pins.holiday)};`,
    `  ${CSS_END}`,
  ].join('\n');
}

function spliceCssBlock(cssText, block) {
  const startIdx = cssText.indexOf(CSS_START);
  const endMark  = cssText.indexOf(CSS_END);
  if (startIdx === -1 || endMark === -1) {
    throw new Error(
      `css/styles.css is missing the "${CSS_START} ... ${CSS_END}" markers. ` +
      `Add them inside :root around the colour custom properties.`,
    );
  }
  /* startIdx points at the "  /* @theme-generated-start" — back up to the
     start of that line so indentation is replaced cleanly. */
  let lineStart = startIdx;
  while (lineStart > 0 && cssText[lineStart - 1] !== '\n') lineStart--;
  const endIdx = endMark + CSS_END.length;
  return cssText.slice(0, lineStart) + block + cssText.slice(endIdx);
}

// ─── js/theme.js ──────────────────────────────────────────────────────────────

function generateThemeJs(p, id) {
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

  return `/* ${'-'.repeat(74)}
   Theme colours — active palette: ${p.name}
   GENERATED by scripts/generate-theme.js — edit data/palettes.yaml to update.

   Run:  npm run generate-theme

   THEME holds #rrggbb hex strings. The helpers convert to the formats each
   rendering layer needs:
     int(hex)        → 0xRRGGBB integer   (Three.js Color / material colours)
     rgba(hex, a)    → 'rgba(r, g, b, a)' (Canvas2D fill/stroke styles)
     glvec(hex)      → [r, g, b] 0..1     (GLSL vec3 literals / uniforms)
${'-'.repeat(78)} */

export const THEME = {
  id: '${id}',
  name: '${p.name}',
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
};

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
        other gradient is touched. First stop → accent, second → accent2. */
  out = out.replace(
    /<linearGradient id="nav-grad"[\s\S]*?<\/linearGradient>/g,
    (block) => {
      let i = 0;
      return block.replace(/stop-color="#[0-9a-fA-F]{6}"/g, () => {
        i++;
        return `stop-color="${i === 1 ? p.accent : p.accent2}"`;
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

  const themeJs  = generateThemeJs(p, id);
  const cssBlock = generateCssBlock(p, id);
  const htmlFiles = listHtmlFiles();

  if (opts.dryRun) {
    console.log(`── Active palette: ${p.name} (${id}) ──\n`);
    console.log(`── js/theme.js ${'─'.repeat(50)}`);
    console.log(themeJs);
    console.log(`── css/styles.css :root block ${'─'.repeat(33)}`);
    console.log(cssBlock);
    console.log(`\n── would rewrite ${'─'.repeat(45)}`);
    [...htmlFiles, NEW_PROJECT, FAVICON_SVG].forEach(f => console.log(`  • ${path.relative(ROOT, f)}`));
    return;
  }

  const written = [];

  /* js/theme.js */
  fs.writeFileSync(THEME_FILE, themeJs, 'utf8');
  written.push(path.relative(ROOT, THEME_FILE));

  /* css/styles.css :root block */
  const css = fs.readFileSync(CSS_FILE, 'utf8');
  const nextCss = spliceCssBlock(css, cssBlock);
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

  console.log(`✓ Applied palette "${p.name}" (${id}) — ${written.length} file(s) updated:`);
  written.forEach(f => console.log(`    ${f}`));
  console.log(`\n  Raster favicons are not regenerated automatically — run:`);
  console.log(`    npm run generate-favicons`);
}

if (require.main === module) {
  main(process.argv);
}

module.exports = {
  parseArgs, validate,
  hexToChannelList, hexToOklch, hexToLch, lchToHex, desaturate, tameAccent, faviconDataUri,
  generateCssBlock, generateThemeJs,
  rewriteHtml, rewriteFaviconSvg,
  spliceCssBlock,
};
