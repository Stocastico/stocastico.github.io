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
-  overflow-x: hidden;
+  overflow-x: clip;
 }

Note: keep `body.menu-open { overflow: hidden }` if the mobile lock is intentional; alternatively use a scoped lock approach (fixable later).

2) High — Inline hex colours in SVG/HTML bypass tokens

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
+  .nav-grad { --g-from: var(--accent); --g-to: var(--accent2); }
+  .nav-grad stop:nth-child(1) { stop-color: var(--g-from); }
+  .nav-grad stop:nth-child(2) { stop-color: var(--g-to); }
+</style>
+<linearGradient id="nav-grad" class="nav-grad" x1="0%" y1="0%" x2="100%" y2="100%">
+  <stop offset="0%" />
+  <stop offset="100%" />
+</linearGradient>

3) High — Interactive components: ensure 8-state coverage

Why:
- Hallmark requires explicit CSS (or utility classes) to cover default · hover · focus-visible · active · disabled · loading · error · success for every interactive element.

Suggested checklist & patch pattern:
- For each `.btn`, `.nav-toggle`, `.social-btn` etc., add class-based selectors mirroring pseudo-classes so demo wrappers can show all states:

Example (CSS pattern to add):

*** css/styles.css (example)
.btn:hover, .btn.is-hover { /* hover styles */ }
.btn:focus-visible, .btn.is-focus { outline: 2px solid var(--accent2); }
.btn:active, .btn.is-active { transform: translateY(1px); }
.btn[disabled] { opacity: 0.5; pointer-events: none; }
.btn[data-state="loading"] { cursor: progress; }
.btn[data-state="error"] { box-shadow: 0 0 0 3px rgba(200,80,50,0.12); }
.btn[data-state="success"] { box-shadow: 0 0 0 3px rgba(80,200,120,0.08); }

4) Medium — Tokens as OKLCH (strategic)

Why:
- Current tokens are hex; Hallmark prefers OKLCH for perceptual axis computations and diversification. Not an immediate blocker, but worth considering for future theme rotations.

Suggestion:
- Extend `scripts/generate-theme.js` to emit OKLCH equivalents (or additional `--color-*-oklch` tokens) so downstream tools can compute paper-band/display-style/accent-hue.

5) Medium — Named easing tokens

Why:
- Hallmark names `--ease-out`, `--ease-in`, `--ease-in-out`. Current root defines `--ease` and `--t-*` tokens.

Suggestion:
- Add the three named easings to `:root` and start referencing them in component motion rules.

6) Medium — CSP contains `'unsafe-inline'` for script/style

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

Record
------
Created by automated Hallmark-style audit agent on 2026-05-24.
