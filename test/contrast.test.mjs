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

/* ─── Text on the surfaces it is actually painted on ────────────────────────
   The tests above measure against `bg` and `bgAlt`. Almost none of this site's
   small text sits on either — it sits on cards, and `--bg-card` is `text` at 12%
   over `bg`, which in dark mode is *lighter* than the page. So a colour that
   just clears the bar against the page falls below it on a card, and measuring
   only against the page could not see that:

     apricot/dark textFaint    4.52:1 on bg   →   3.36:1 on a card
     apricot/light textFaint   3.48:1 on bg   →   2.74:1 on a card

   The second column is what a reader gets. A browser audit over all 21 pages
   × 4 palettes × 2 themes found 72–446 failing elements per configuration, and
   every recurring one was small metadata on a card: .link-card-host,
   .contact-label, .tl-location, .unesco-count, .project-tag, .tl-tag,
   .pub-venue.

   `textFaint` used to be exempted to 3:1 here, justified as "large/incidental".
   It is not: it renders at 10.9–13.1px (.link-card-host 0.74rem,
   .tl-location 0.7rem, .contact-label 0.7rem). WCAG's 3:1 large-text exemption
   needs ≥24px, or ≥18.66px bold. None of those qualify, so the exemption was
   simply wrong and is gone.
   ───────────────────────────────────────────────────────────────────────────── */

/* The surfaces each token actually lands on.

   Two corrections live here, both learned by measuring the rendered page and
   both invisible to a simpler model:

   1. **Translucent surfaces stack.** `.unesco-count` is a `--bg-card-hov` chip
      inside a `--bg-card` <details>, i.e. 0.17·text over (0.12·text over bg).
      In apricot/dark the browser paints that at rgb(82,77,72) where a lone card
      is rgb(49,44,41) — so even "text on a card" was the wrong surface for it.
   2. **Tag chips add an accent tint.** `.tl-tag` and `.project-tag` sit on
      `rgb(var(--accent-rgb) / 0.11)` over a card, which lightens the backdrop in
      dark mode and darkens it in light.

   The mapping is per token rather than the cartesian product, deliberately.
   Requiring `textMuted` to survive a tag tint it never touches cost real chroma
   in the accents for nothing — the constraint has to match where the colour is
   actually painted, which is the whole lesson of this file. */
const TINT_ALPHA = 0.11; /* .tl-tag / .project-tag chip fill */

function textSurfaces(p, token) {
  const s = surfaces(p);
  const bgAlt = channels(p.bgAlt);
  const base = [
    ['bg', s.bg],
    ['bgAlt', bgAlt],
    ['card', s.card],
    ['card-hover', s.cardHover],
    /* Cards sit on the alternate band too, and a card over bgAlt is lighter than
       a card over bg in dark mode. crimson/dark .pub-venue lands on the
       browser-measured rgb(71,57,57) for exactly this reason — composing cards
       only over `bg` still missed it. */
    ['card over bgAlt', over(channels(p.text), SURFACE_ALPHA.card, bgAlt)],
    ['card-hover over bgAlt', over(channels(p.text), SURFACE_ALPHA.cardHover, bgAlt)],
  ];
  /* The accent *text* tokens land on tag chips, and measurably nowhere deeper:
     walking every text node on all 21 pages and compositing its real ancestor
     backgrounds, the worst backdrop behind --accent-text is rgb(72,59,50) in
     apricot/dark (.project-tag), which is the tint over a card. The nested
     card-hover stack below reaches rgb(82,77,72) and no accent-coloured text
     ever sits on it. Adding it "to be safe" cost the crimson accent 35 % of its
     chroma to satisfy a surface that does not exist, which is the same mistake
     as measuring against the page instead of the card — just in the other
     direction. Constrain to what is painted, no more and no less. */
  if (token === 'accentText') {
    return base.concat([['accent tint over card', over(channels(p.accent), TINT_ALPHA, s.card)]]);
  }
  if (token === 'accent2Text') {
    return base.concat([['accent2 tint over card', over(channels(p.accent2), TINT_ALPHA, s.card)]]);
  }
  /* The plain text tiers do reach the nested stack: .unesco-count is a
     --bg-card-hov chip inside a --bg-card <details>, measured at rgb(82,77,72). */
  return base.concat([
    ['card-hover over card', over(channels(p.text), SURFACE_ALPHA.cardHover, s.card)],
  ]);
}

test('contrast: every text tier meets WCAG AA on every surface it lands on', () => {
  for (const { name, p } of variants()) {
    for (const token of ['text', 'textMuted', 'textFaint']) {
      for (const [label, surface] of textSurfaces(p, token)) {
        const got = contrast(channels(p[token]), surface);
        assert.ok(got >= 4.5,
          `${name} — ${report(`${token} on ${label}`, got, 4.5)}`);
      }
    }
  }
});

test('contrast: the accent text shades meet WCAG AA on every surface', () => {
  /* accentText / accent2Text exist because `accent` and `accent2` are brand
     colours held to the 3:1 non-text floor (gradients, borders, pins, glows —
     64 of their 96 uses), while the site also tints 10–13px metadata with them,
     where the floor is 4.5:1. Darkening `accent` itself to satisfy the metadata
     would mute every one of those other uses to fix the text. */
  for (const { name, p } of variants()) {
    for (const token of ['accentText', 'accent2Text']) {
      for (const [label, surface] of textSurfaces(p, token)) {
        const got = contrast(channels(p[token]), surface);
        assert.ok(got >= 4.5,
          `${name} — ${report(`${token} on ${label}`, got, 4.5)}`);
      }
    }
  }
});

test('contrast: the three text tiers stay in order', () => {
  /* Holding all three tiers to AA at metadata sizes squeezes them together —
     solved independently, textMuted and textFaint land on the *same* hex in
     forest/light. Two identical tokens read as a copy-paste slip and quietly
     destroy the tier, so the ordering is asserted rather than hoped for. The
     remaining hierarchy comes from size, weight and case, not from fading the
     colour out; there is not room for three separately-legible text tiers. */
  for (const { name, p } of variants()) {
    const card = surfaces(p).card;
    const body = contrast(channels(p.text), card);
    const muted = contrast(channels(p.textMuted), card);
    const faint = contrast(channels(p.textFaint), card);
    assert.ok(body > muted + 0.2,
      `${name} — text (${body.toFixed(2)}:1) must read more clearly than ` +
      `textMuted (${muted.toFixed(2)}:1) on a card`);
    assert.ok(muted > faint + 0.2,
      `${name} — textMuted (${muted.toFixed(2)}:1) must read more clearly than ` +
      `textFaint (${faint.toFixed(2)}:1) on a card; they have collapsed into one tier`);
  }
});

test('contrast: the small-text CSS uses the accent *text* tokens, not the brand accents', () => {
  /* The tokens above are only worth anything if the rules that failed the audit
     actually consume them. Guards against a new small-text rule reaching for
     var(--accent) — which passes the palette tests and fails on the page. */
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const SMALL_TEXT_RULES = [
    ['.project-tag', '--accent-text'],
    ['.tl-tag', '--accent-text'],
    ['.section-tag', '--accent-text'],
    ['.skill-panel-title', '--accent-text'],
    ['.project-card__year', '--accent-text'],
    ['.unesco-site', '--accent-text'],
    ['.cv-back-link', '--accent-text'],
    ['.pub-year', '--accent-text'],
    ['.pub-venue', '--accent2-text'],
    ['.stat-suffix', '--accent2-text'],
    ['.inline-link', '--accent2-text'],
    ['.lang-prof', '--accent2-text'],
  ];
  for (const [selector, token] of SMALL_TEXT_RULES) {
    /* Match the rule whose selector list *begins* with this exact class, and
       require the next char to be space, comma or brace — otherwise
       `.unesco-site` matches `.unesco-sites` and the assertion checks the wrong
       rule (which is exactly what happened while writing this). */
    const re = new RegExp(`^\\${selector}(?=[\\s,{])[^{]*\\{([^}]*)\\}`, 'm');
    const m = css.match(re);
    assert.ok(m, `expected a ${selector} rule in css/styles.css`);
    assert.match(m[1], new RegExp(`color:\\s*var\\(${token}\\)`),
      `${selector} must take its colour from var(${token}) — small text on a card ` +
      'cannot use the brand accent, which is only held to the 3:1 non-text floor');
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
     fails the primary call to action is the unreadable element on the page.

     Sampled across the whole accent → accent2 ramp, not just `accent`, because
     the fills that actually ship are gradients (.link-chip.is-active, .btn). The
     midpoint can be the worst point and checking one end can miss it.

     This test is also why .link-chip.is-active had to stop using var(--bg) for
     its label: --bg is not validated against anything accent-shaped, and on the
     gradient it measured 4.31:1 in forest/light and 4.29:1 in crimson/dark. */
  for (const { name, p } of variants()) {
    const a = channels(p.accent), b = channels(p.accent2);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const stop = [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t);
      const got = contrast(channels(p.onAccent), stop);
      assert.ok(got >= 4.5,
        `${name} — ${report(`onAccent at ${t * 100}% along the accent gradient`, got, 4.5)}`);
    }
  }
});

test('contrast: the accent-filled chip labels itself with --on-accent', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const rule = css.match(/^\.link-chip\.is-active\s*\{([^}]*)\}/m);
  assert.ok(rule, 'expected a .link-chip.is-active rule');
  assert.match(rule[1], /color:\s*var\(--on-accent\)/,
    'text on an accent fill must use --on-accent, the only token measured against the accents');
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
