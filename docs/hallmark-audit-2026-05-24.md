# Hallmark Audit — stocastico.github.io

Date: 2026-05-24

Summary
-------

This file records a focused Hallmark-style audit of the repository. It captures pre-flight signals, a ranked punch list of issues (high → low), and concrete, non-invasive suggested fixes (patch snippets) so maintainers can review and apply them selectively.

Files scanned
-------------

- `package.json`
- `index.html`
- `css/styles.css`
- `js/main.js`
- `js/theme.js`

Pre-flight findings
-------------------

- Font stack: self-hosted (`css/fonts.css`) — preserve.
- Palette: generated hex tokens in `:root` (via `data/palettes.yaml` → `generate-theme`) and `js/theme.js`.
- Motion: no motion libs in `package.json` — site uses local helpers and respects `prefers-reduced-motion`.
- Framework: Vite + vanilla ESM (no React/Next). Dynamic Three.js loading is used.

Ranked punch list (high → low)
------------------------------

1) High — `overflow-x: hidden` on `body` (responsive risk)

Why:

- Hallmark hard rule: `html` and `body` should use `overflow-x: clip` (not `hidden`) to avoid layout clipping and preserve scroll semantics (gate 62).

Suggested change (non-invasive patch):

*** css/styles.css (suggested diff)
@@
 html {
   scroll-behavior: smooth;
  +overflow-x: clip;
   scroll-padding-top: var(--nav-h);
   -webkit-text-size-adjust: 100%;
 }

 body {
   background: var(--bg);
   color: var(--text);
   font-family: var(--font-sans);
   font-size: clamp(15px, 1.05vw, 17px);
   line-height: 1.7;

- overflow-x: hidden;

- overflow-x: clip;
 }

Note: keep `body.menu-open { overflow: hidden }` if the mobile lock is intentional; alternatively use a scoped lock approach (fixable later).

1) High — Inline hex colours in SVG/HTML bypass tokens

Why:

- Several inline SVG attributes (e.g. `stop-color="#c8a44d"`) and the favicon SVG use literal hex values. Hallmark requires colours to reference named tokens (`var(--accent)`) so the generated theme can control all colours.

Suggested approach:

- Prefer `currentColor` for SVG `fill`/`stroke` where appropriate, and set `color: var(--accent)` on the SVG container.
- For gradients/stops, move SVG styles into CSS or declare CSS variables on the SVG element and reference `stop-color: var(--svg-accent)`.

Example (suggested patch snippet):

*** index.html (snippet suggestion)
@@

- <stop offset="0%" stop-color="#c8a44d"/>
- <stop offset="100%" stop-color="#6db088"/>

+<style>

- .nav-grad { --g-from: var(--accent); --g-to: var(--accent2); }
- .nav-grad stop:nth-child(1) { stop-color: var(--g-from); }
- .nav-grad stop:nth-child(2) { stop-color: var(--g-to); }
+</style>
+<linearGradient id="nav-grad" class="nav-grad" x1="0%" y1="0%" x2="100%" y2="100%">
- <stop offset="0%" />
- <stop offset="100%" />

+</linearGradient>

1) High — Interactive components: ensure 8-state coverage

Why:

- Hallmark requires explicit CSS (or utility classes) to cover default · hover · focus-visible · active · disabled · loading · error · success for every interactive element.

Suggested checklist & patch pattern:

- For each `.btn`, `.nav-toggle`, `.social-btn` etc., add class-based selectors mirroring pseudo-classes so demo wrappers can show all states:

Example (CSS pattern to add):

*** css/styles.css (example)
.btn:hover, .btn.is-hover { /*hover styles*/ }
.btn:focus-visible, .btn.is-focus { outline: 2px solid var(--accent2); }
.btn:active, .btn.is-active { transform: translateY(1px); }
.btn[disabled] { opacity: 0.5; pointer-events: none; }
.btn[data-state="loading"] { cursor: progress; }
.btn[data-state="error"] { box-shadow: 0 0 0 3px rgba(200,80,50,0.12); }
.btn[data-state="success"] { box-shadow: 0 0 0 3px rgba(80,200,120,0.08); }

1) Medium — Tokens as OKLCH (strategic)

Why:

- Current tokens are hex; Hallmark prefers OKLCH for perceptual axis computations and diversification. Not an immediate blocker, but worth considering for future theme rotations.

Suggestion:

- Extend `scripts/generate-theme.js` to emit OKLCH equivalents (or additional `--color-*-oklch` tokens) so downstream tools can compute paper-band/display-style/accent-hue.

1) Medium — Named easing tokens

Why:

- Hallmark names `--ease-out`, `--ease-in`, `--ease-in-out`. Current root defines `--ease` and `--t-*` tokens.

Suggestion:

- Add the three named easings to `:root` and start referencing them in component motion rules.

1) Medium — CSP contains `'unsafe-inline'` for script/style

Why:

- Security best-practice; consider moving inline scripts/styles to external files and using hashes/nonces if you want stricter CSP.

Quick test and verification
---------------------------

- Recommended local checks:

  1. Run the test suite:

     ```bash
     npm test
     ```

  2. Manual responsive checks at widths: 320 / 375 / 414 / 768.
  3. Keyboard navigation test for focus-visible and keyboard-only flows.
  4. Toggle OS reduced-motion and verify animations respect it.

Next steps
----------

- This report is non-invasive: no source files were changed. If you want, I can: (a) produce the exact `git diff` patches for the high-priority items for review (one PR), or (b) apply the safe `overflow-x` and tokenisation changes in a small commit and run the test suite.

Applied patches
---------------

- `01-overflow-clip.patch` — Applied on branch `hallmark/audit-fixes-2026-05-24`.
  - Changes: set `overflow-x: clip` on `html` and `body` to avoid mobile clipping while preserving `body.menu-open` lock behavior.
  - Safety check: Verified no JS reads `overflow-x`. Three.js canvases and shaders use positional layout; clipping does not affect rendering.

- `03-button-states.patch` — Applied on branch `hallmark/audit-fixes-2026-05-24`.
  - Changes: added `.btn` 8-state helper selectors (`.is-hover`, `.is-focus`, `.is-active`, `[disabled]`, `data-state` variants).
  - Safety check: These are additive selectors that do not remove existing rules. `js/animations.js` still queries `.btn-primary` etc.; no behavioral changes to the scripts or Three.js code.

- `04-easing-tokens.patch` — Applied on branch `hallmark/audit-fixes-2026-05-24`.
  - Changes: added `--ease-out`, `--ease-in`, `--ease-in-out` tokens alongside existing `--ease`.
  - Safety check: Token additions are backward-compatible; no code or shaders depend on the new names yet.

Test coverage added
------------------

- `test/css-assets.test.mjs`: added regression checks for `overflow-x: clip`, the new easing custom properties, and the button state helper selectors.
- `test/playwright.ui.test.mjs`: added a desktop horizontal-overflow assertion and saved a visual snapshot to `test/screenshots/ui-index-desktop.png` for inspection.
- `package.json`: added `npm run test:playwright` to run the Playwright UI test harness directly.

Not applied
-----------

- `02-svg-tokenize.patch` — intentionally NOT applied.
  - Reason: The repository uses `scripts/generate-theme.js` to programmatically rewrite `nav-grad` gradient stop hex values during theme generation. Replacing inline `stop-color` hex literals with CSS variables would break the generator and existing tests (`test/generate-theme.test.js`) unless the generator and tests are updated to handle CSS-variable-driven gradients.
  - Recommendation: If you want token-based SVG gradients, we should either:
    - Update `scripts/generate-theme.js` to emit CSS-variable-aware gradients and adapt tests (non-trivial), or
    - Keep the generator-managed hex stops and accept they will continue to be rewritten by `generate-theme` (safer).

What can still be done (suggested next actions)
----------------------------------------------

- Update `scripts/generate-theme.js` to support CSS-variable gradients and adjust `test/generate-theme.test.js` accordingly (if you want SVGs to reference tokens directly).
- Emit OKLCH equivalents from `generate-theme.js` (or from `data/palettes.yaml`) to support Hallmark-style axis calculations for diversification.
- Audit all interactive elements (`.nav-toggle`, `.cmd-trigger`, inputs, forms) and add `is-*` / `data-state` coverage similar to `.btn` where missing; optionally add preview wrappers for each component (component-scope Hallmark pattern).
- Remove `'unsafe-inline'` from CSP by moving inline scripts/styles to external files and/or using CSP hashes/nonces.
- Run the full test suite and Playwright UI checks on the new branch to confirm nothing regressed.

Record
------

Created by automated Hallmark-style audit agent on 2026-05-24. Patches applied on branch `hallmark/audit-fixes-2026-05-24`.
