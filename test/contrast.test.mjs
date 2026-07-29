/* ─────────────────────────────────────────────────────────────────────────────
   contrast.test.mjs — every palette must actually be legible.

   The site shipped a dark palette whose surfaces were white at 4–8% alpha over
   a #0c0908 background. Measured against the page, that is 1.07:1 for a card,
   1.16:1 for a border and 1.13:1 for the world map's land silhouette — which is
   to say the cards had no edge and the map showed only its highlighted
   countries floating on black. Nothing caught it, because nothing was
   measuring: every colour decision lived in YAML and was reviewed by eye, on a
   bright screen.

   So this file measures. It derives the same tokens generate-theme.js emits —
   importing SURFACE_ALPHA from the generator itself so the two cannot drift —
   and asserts a floor for every meaningful pair, in **every** palette and in
   **both** the dark and light variant. A new palette that looks fine to its
   author but hides its own borders now fails here rather than in a message
   from someone's brother.

   The thresholds are deliberately of two kinds:

     · Text and icons are held to WCAG 2.1 AA (4.5:1 body, 3:1 large/graphic).
       These are not negotiable — they are the accessibility floor.
     · Surfaces, borders and banding are held to a *design* floor (1.25–1.5:1).
       WCAG has nothing to say about a card being distinguishable from the page
       behind it, but a visitor with the brightness down certainly does. These
       numbers come from where mainstream dark UIs sit, and from the measured
       point at which the map's land stops disappearing.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parseYaml } = require('../scripts/lib/yaml');
const { SURFACE_ALPHA } = require('../scripts/generate-theme.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const palettes = parseYaml(fs.readFileSync(path.join(ROOT, 'data/palettes.yaml'), 'utf8')).palettes;

/* ─── Colour maths (WCAG 2.1 relative luminance) ─────────────────────────── */

function channels(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/* Source-over compositing — how a translucent surface actually renders. */
function over(fg, alpha, bg) {
  return fg.map((f, i) => alpha * f + (1 - alpha) * bg[i]);
}

/* OKLab lightness (0..1). Surfaces are measured with this rather than with a
   WCAG contrast ratio, because the ratio is the wrong instrument for a
   surface step: it is a ratio of luminances plus a constant, so the same
   *perceived* step scores wildly differently at the two ends of the range.
   GitHub's light-mode section banding (#ffffff on #f6f8fa) is 1.05:1 and
   perfectly visible; a 1.05:1 step near black is not visible at all. Demanding
   one number from both modes would either wash out the light theme or leave
   the dark theme exactly as broken as it was.

   OKLab lightness is perceptually uniform, so one threshold is meaningful in
   both. */
function okLightness(rgb) {
  const [R, G, B] = rgb.map(toLinear);
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;
  const cbrt = (v) => Math.cbrt(v);
  return 0.2104542553 * cbrt(l) + 0.7936177850 * cbrt(m) - 0.0040720468 * cbrt(s);
}
const lightnessStep = (a, b) => Math.abs(okLightness(a) - okLightness(b));

/* Every variant that ships: each palette's dark body and its nested light. */
function variants() {
  const out = [];
  for (const [id, p] of Object.entries(palettes)) {
    out.push({ name: `${id} (dark)`, p });
    out.push({ name: `${id} (light)`, p: p.light });
  }
  return out;
}

/* The derived surfaces, exactly as generate-theme.js composes them. */
function surfaces(p) {
  const bg = channels(p.bg);
  const text = channels(p.text);
  return {
    bg,
    card:     over(text, SURFACE_ALPHA.card, bg),
    cardHover: over(text, SURFACE_ALPHA.cardHover, bg),
    border:   over(text, SURFACE_ALPHA.border, bg),
    mapLand:  over(text, SURFACE_ALPHA.mapLand, bg),
  };
}

function report(label, got, min) {
  return `${label}: ${got.toFixed(2)}:1 (needs ≥ ${min}:1)`;
}

/* ─── Text: WCAG 2.1 AA ──────────────────────────────────────────────────── */

test('contrast: body and muted text meet WCAG AA (4.5:1) on the page background', () => {
  for (const { name, p } of variants()) {
    const bg = channels(p.bg);
    assert.ok(contrast(channels(p.text), bg) >= 4.5,
      `${name} — ${report('text on bg', contrast(channels(p.text), bg), 4.5)}`);
    assert.ok(contrast(channels(p.textMuted), bg) >= 4.5,
      `${name} — ${report('textMuted on bg', contrast(channels(p.textMuted), bg), 4.5)}`);
  }
});

test('contrast: faint text clears the large-text floor (3:1)', () => {
  /* textFaint is used for eyebrows, years, stat labels — uppercase mono at
     small sizes. It is genuinely secondary, so it gets the 3:1 large/incidental
     floor rather than 4.5, but it must not vanish. */
  for (const { name, p } of variants()) {
    const got = contrast(channels(p.textFaint), channels(p.bg));
    assert.ok(got >= 3, `${name} — ${report('textFaint on bg', got, 3)}`);
  }
});

test('contrast: text on the alternate section band also meets AA', () => {
  /* Half the page sits on bgAlt, not bg. A palette that only checks bg can
     ship a band its own body copy fails against. */
  for (const { name, p } of variants()) {
    const alt = channels(p.bgAlt);
    assert.ok(contrast(channels(p.text), alt) >= 4.5,
      `${name} — ${report('text on bgAlt', contrast(channels(p.text), alt), 4.5)}`);
    assert.ok(contrast(channels(p.textMuted), alt) >= 4.5,
      `${name} — ${report('textMuted on bgAlt', contrast(channels(p.textMuted), alt), 4.5)}`);
  }
});

test('contrast: accents are legible as text and as graphics (3:1)', () => {
  for (const { name, p } of variants()) {
    const bg = channels(p.bg);
    for (const key of ['accent', 'accentHi', 'accent2', 'accent2Hi']) {
      const got = contrast(channels(p[key]), bg);
      assert.ok(got >= 3, `${name} — ${report(`${key} on bg`, got, 3)}`);
    }
  }
});

test('contrast: label text on an accent-filled button meets AA', () => {
  /* onAccent is the foreground painted onto accent — a filled button. If this
     fails the primary call to action is the unreadable element on the page. */
  for (const { name, p } of variants()) {
    const got = contrast(channels(p.onAccent), channels(p.accent));
    assert.ok(got >= 4.5, `${name} — ${report('onAccent on accent', got, 4.5)}`);
  }
});

/* ─── Surfaces: the design floor ─────────────────────────────────────────── */

/* Minimum OKLab lightness step. Calibrated against the shipped bug: at the old
   alphas every card sat at ΔL ≈ 0.026–0.043 and every border at ΔL ≈ 0.05–0.08,
   in all three palettes and both modes. */
const MIN_CARD_DL   = 0.060;  /* a card must read as raised off the page      */
const MIN_BORDER_DL = 0.100;  /* a border must be findable without hunting    */
const MIN_LAND_DL   = 0.100;  /* the world map's land vs the page behind it   */
const MIN_BAND_DL   = 0.025;  /* section-alt must read as a distinct band     */

function stepReport(label, got, min) {
  return `${label}: ΔL ${got.toFixed(4)} (needs ≥ ${min})`;
}

test(`surfaces: cards are distinguishable from the page (ΔL ≥ ${MIN_CARD_DL})`, () => {
  for (const { name, p } of variants()) {
    const s = surfaces(p);
    const got = lightnessStep(s.card, s.bg);
    assert.ok(got >= MIN_CARD_DL, `${name} — ${stepReport('bg-card vs bg', got, MIN_CARD_DL)}`);
    /* Hover must be a perceptible step beyond rest, or the affordance is a lie. */
    const hover = lightnessStep(s.cardHover, s.card);
    assert.ok(hover >= 0.02,
      `${name} — ${stepReport('card hover vs card rest', hover, 0.02)}`);
  }
});

test(`surfaces: borders are visible against the page (ΔL ≥ ${MIN_BORDER_DL})`, () => {
  for (const { name, p } of variants()) {
    const s = surfaces(p);
    const got = lightnessStep(s.border, s.bg);
    assert.ok(got >= MIN_BORDER_DL, `${name} — ${stepReport('border vs bg', got, MIN_BORDER_DL)}`);
  }
});

test(`surfaces: the world map's land silhouette is visible (ΔL ≥ ${MIN_LAND_DL})`, () => {
  /* The reported symptom was "on the world map you only see the coloured
     countries" — the land underneath them sat at ΔL 0.046–0.073. */
  for (const { name, p } of variants()) {
    const s = surfaces(p);
    const got = lightnessStep(s.mapLand, s.bg);
    assert.ok(got >= MIN_LAND_DL, `${name} — ${stepReport('map land vs bg', got, MIN_LAND_DL)}`);
  }
});

test('surfaces: highlighted countries stand out from the land they sit on', () => {
  /* The map is only readable if lived/visited read against the land, not just
     against the page. These are meaningful graphics, so they get the WCAG
     1.4.11 non-text floor of 3:1 rather than a perceptual step. */
  for (const { name, p } of variants()) {
    const s = surfaces(p);
    for (const key of ['lived', 'holiday']) {
      const got = contrast(channels(p.pins[key]), s.mapLand);
      assert.ok(got >= 3, `${name} — ${report(`pin ${key} on map land`, got, 3)}`);
    }
  }
});

test(`surfaces: the alternate section band is perceptible (ΔL ≥ ${MIN_BAND_DL})`, () => {
  for (const { name, p } of variants()) {
    const got = lightnessStep(channels(p.bgAlt), channels(p.bg));
    assert.ok(got >= MIN_BAND_DL, `${name} — ${stepReport('bgAlt vs bg', got, MIN_BAND_DL)}`);
  }
});

/* ─── The page background itself ─────────────────────────────────────────── */

test('contrast: dark backgrounds sit in a sane luminance band', () => {
  /* Below ~0.4% the page is indistinguishable from a switched-off panel in a
     lit room, and every translucent surface built on it inherits the problem.
     The upper bound keeps "dark" meaning dark. Reference points: GitHub's
     #0d1117 is 0.61%, Linear's #08090a is 0.31%, VS Code's #1e1e1e is 1.86%. */
  for (const [id, p] of Object.entries(palettes)) {
    const pct = luminance(channels(p.bg)) * 100;
    assert.ok(pct >= 0.4 && pct <= 2.0,
      `${id} (dark) — background luminance ${pct.toFixed(2)}% is outside 0.40–2.00%`);
  }
});

test('contrast: light backgrounds sit in a sane luminance band', () => {
  for (const [id, p] of Object.entries(palettes)) {
    const pct = luminance(channels(p.light.bg)) * 100;
    assert.ok(pct >= 80, `${id} (light) — background luminance ${pct.toFixed(2)}% is below 80%`);
  }
});

/* ─── The CSS actually shipped ───────────────────────────────────────────── */

test('contrast: the generated stylesheet uses the audited surface alphas', () => {
  /* The tests above measure what the generator *would* emit. This one checks
     that css/styles.css was regenerated after the constants changed, so a
     stale committed stylesheet cannot quietly ship the old values. */
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const expect = [
    ['--bg-card:',     SURFACE_ALPHA.card],
    ['--bg-card-hov:', SURFACE_ALPHA.cardHover],
    ['--border:',      SURFACE_ALPHA.border],
    ['--map-land:',    SURFACE_ALPHA.mapLand],
  ];
  for (const [token, alpha] of expect) {
    const re = new RegExp(`${token.replace(/[-]/g, '\\-')}\\s*rgb\\([^)]*/\\s*${String(alpha)}\\s*\\)`);
    assert.ok(re.test(css),
      `${token} in css/styles.css does not use alpha ${alpha} — run \`npm run generate-theme\``);
  }
});

test('contrast: the world map paints its land with the dedicated token', () => {
  /* The land used to borrow --bg-card-hov, which coupled the map's legibility
     to a card hover state. */
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const rule = css.match(/\.world-map\s+\.wm-land\s*{[^}]*}/);
  assert.ok(rule, 'expected a .world-map .wm-land rule');
  assert.match(rule[0], /var\(--map-land\)/,
    '.wm-land must fill with var(--map-land), not a card token');
});
