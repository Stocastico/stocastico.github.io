# CLAUDE.md — Project Guide

## Project Overview

Personal website of **Stefano Masneri** (Senior AI Engineer), hosted on GitHub Pages at `stocastico.github.io`. ES-modules-based site bundled with Vite; no framework.

## Tech Stack

- **HTML/CSS/JS** — vanilla, no framework
- **Vite** — dev server + production bundler (multi-page input)
- **Three.js** (npm, bundled by Vite) — 3D globe (travel page only). Both hero backgrounds are Canvas2D, so the homepage ships no Three.js
- **Raw WebGL/GLSL** — noise-gradient hero background
- **Node.js >= 18** — scripts and tests (built-in test runner, zero test dependencies)
- **Playwright** — E2E UI tests (dev dependency)

## Key Commands

```bash
npm run dev                 # Vite dev server (HMR, serves source unbundled)
npm run build               # Vite build → dist/
npm run preview             # Preview the dist/ build locally

npm test                    # Run all tests (Node built-in runner)
npm run test:main           # js/main.js tests only
npm run test:cv             # CV rendering tests only
npm run test:project        # new-project.js tests only
npm run test:locations      # locations generator tests only
npm run test:seo            # SEO regression tests only
npm run test:generate-cv    # generate-cv.js tests only
npm run test:generate-theme # generate-theme.js tests only
npm run test:cnn            # CNN hero activation-pipeline tests only

npm run generate-cv         # data/cv.yaml → data/cv.js
npm run generate-locations  # data/locations.yaml → data/locations.js
npm run generate-theme      # data/palettes.yaml → theme across CSS + JS + HTML (dark + paired light)
npm run generate-theme-toggle # inject the light/dark toggle button + FOUC bootstrap into every page
npm run screenshots         # capture every page in dark + light (visual QA → screenshots/, gitignored)
npm run generate-countries  # data/locations.yaml → data/countries.yaml (editable) → data/countries.js
npm run generate-world-map  # data/countries-110m.json + data/countries.js → inline SVG in index.html
npm run generate-unesco     # data/unesco.yaml → data/unesco.js
npm run generate-links      # data/links.yaml → data/links.js
npm run generate-cards      # data/projects.js + data/publications.js → static cards in index/projects/publications.html
npm run train-cnn           # trains the LeNet-5 on MNIST → data/cnn-model.json + data/cnn-samples.json (slow, run by hand)
npm run generate-cnn-activations  # cnn-model.json + cnn-samples.json → data/cnn-activations.js
npm run generate-csp-meta   # refresh the CSP <meta> across every HTML page
npm run generate-analytics  # refresh the cookieless GoatCounter no-JS pixel across every HTML page
npm run new-project -- file.md  # Markdown → projects/<slug>.html + updates data/projects.js
```

## Project Structure

```
index.html          Single-page site (hero, about, skills, projects, publications, places-teaser, contact)
cv.html             Dedicated CV page (two-column layout)
projects.html       Projects listing page
publications.html   Full publication list (all papers from data/publications.js)
travel.html         Travel page (3D globe + 2D Europe map + UNESCO World Heritage accordion)
links.html          Links page (curated blogroll, filterable by category)
now.html            "Now" page (now-now-now.com style — current focus; .post prose layout, sections to fill in)
404.html            Custom 404 page
projects/*.html     Per-project detail pages
vite.config.js      Multi-page Vite config (index, cv, projects, publications, travel, links, now, 404, project pages)
css/styles.css      All styles including print styles
css/fonts.css       Self-hosted fonts
js/main.js          ESM entry — orchestrates DOMContentLoaded init + page-teardown (pagehide) cleanup
js/render-cards.js  Pure HTML builders for project cards + publication items (shared by main.js and generate-cards)
js/ui.js            Chrome/UI behaviours — navbar, mobile menu, command palette, counters, toast, back-to-top, carousel
js/three-context.js Shared THREE binding + test mocking hook
js/utils.js         isLowPowerDevice, prefersReducedMotion, hasWebGLSupport, getTopoJSON
js/neural-net.js    NeuralNetwork2D (Canvas2D hero background for narrow/touch viewports; Three-free)
js/cnn-hero.js      CnnHero — Canvas2D LeNet-5 forward-pass hero background (desktop only; replays precomputed activations)
js/noise-gradient.js NoiseGradient (raw WebGL/GLSL hero background — renders a few frames then stops)
js/globe.js         Globe3D + GlobeFallback2D + geocodeLocations
js/animations.js    Scroll-driven effects, card tilt (rect cached per hover), card flip, parallax, skill bars, timeline entrance
js/europe-map.js    Interactive 2D Canvas map of Europe
data/cv.yaml        Source of truth for CV → run generate-cv after editing
data/cv.js          Generated ESM module (do not edit manually)
data/locations.yaml Source of truth for globe pins/trips → run generate-locations after editing
data/locations.js   Generated ESM module (do not edit manually)
data/palettes.yaml  Source of truth for the colour palette → run generate-theme after editing
data/countries.yaml Source of truth for homepage map highlights (lived/visited); derived from locations.yaml on first run, then hand-editable → run generate-countries after editing
data/countries.js   Generated ESM module — COUNTRIES { lived, visited } (do not edit manually)
data/countries-110m.json  world-atlas TopoJSON (country borders + names) for the homepage map
data/unesco.yaml    Source of truth for the travel-page UNESCO accordion → run generate-unesco after editing
data/unesco.js      Generated ESM module — UNESCO { continents } (do not edit manually)
data/links.yaml     Source of truth for the links-page blogroll → run generate-links after editing
data/links.js       Generated ESM module — LINKS { categories, links } (do not edit manually)
data/cnn-model.json Trained LeNet-5 weights + test accuracy (generated by train-cnn; used only at build time)
data/cnn-samples.json Ten MNIST test digits, one per class, chosen by train-cnn
data/cnn-activations.js Generated ESM module — CNN { meta, layers, samples } (do not edit manually)
data/projects.js    Project entries — ESM (edit directly or via `npm run new-project`)
data/publications.js Publication entries — ESM (edit directly; `featured: true` surfaces a paper on the homepage). Run generate-cards after editing.
js/theme.js         Generated ESM module — active palette in hex/int/glvec forms (do not edit manually)
scripts/            Generator scripts (new-project, generate-cv, generate-locations, generate-theme, generate-countries, generate-world-map, generate-unesco, generate-links, generate-cards, generate-og, train-cnn, generate-cnn-activations)
scripts/lib/lenet.mjs  Dependency-free LeNet-5 (forward + backward) shared by train-cnn and generate-cnn-activations
test/               Tests for each script + main.js + europe-map.js + SEO + Playwright E2E
docs/               DATA-FORMATS.md, DEPLOYMENT.md, project-template.md, cv.pdf, defense.pdf
drafts/             Markdown source for projects/*.html — feed into `npm run new-project`. Not deployed.
public/             Vite copies these straight to dist/ (sitemap.xml, robots.txt).
```

## Coding Conventions

- **ES modules everywhere** — `js/` and `data/` directories have nested `package.json` with `"type": "module"`. Generator scripts and tests for them stay CJS.
- **Test mocking for Three.js** — modules subscribe to `onChange` from `js/three-context.js`; tests call `__setThreeForTests(mock)` / `__resetThreeForTests()` (re-exported from `js/main.js`) to swap the active THREE.
- All generator scripts support `--dry-run`, `--help`, and standard CLI flags
- Generated files (`data/cv.js`, `data/locations.js`, `js/theme.js`, and the `@theme-generated` block in `css/styles.css`) should never be edited manually
- Tests use Node.js built-in test runner (`node --test`) — no Jest, no Mocha
- YAML source files → JS ESM data files via generator scripts
- Self-hosted fonts (no Google Fonts CDN). Three faces, split by kind of content: **Outfit** display, **Inter** prose, **JetBrains Mono** metadata (`--font-mono`: eyebrows, tags, years, domains, stat labels, keyboard hints, CNN hero captions). Prose never gets the mono
- `prefers-reduced-motion` is respected everywhere — all animations degrade gracefully

## Workflow Rules

1. **Always run `npm test` after changes** to verify nothing breaks
2. **After editing `data/cv.yaml`**, run `npm run generate-cv`
3. **After editing `data/locations.yaml`**, run `npm run generate-locations`. If countries changed, also `npm run generate-countries --refresh` then `npm run generate-world-map` (and review `data/countries.yaml`).
4. **After editing `data/palettes.yaml`** (or switching the `active` palette), run `npm run generate-theme`, then `npm run generate-favicons` to rebuild the raster icons. Every palette must define a nested `light:` variant (validated by `generate-theme`); the active palette's dark + light pair is what ships. After structural HTML changes to the theme toggle, run `npm run generate-theme-toggle` then `npm run generate-csp-meta` (the bootstrap script is CSP-hashed). If you **added or recoloured a palette**, also run `npm run generate-og` to (re)render its social card. The homepage world map needs no regeneration — it uses CSS `var(--*)` classes; per-palette OG cards are committed static files and `generate-theme` just repoints `og:image` at the active one.
5. **After editing `data/countries.yaml`**, run `npm run generate-countries` then `npm run generate-world-map` (rewrites the inline SVG block in `index.html`).
6. **After editing `data/unesco.yaml`**, run `npm run generate-unesco`.
7. **After editing `data/links.yaml`**, run `npm run generate-links`.
8. **After editing `data/projects.js` or `data/publications.js`**, run `npm run generate-cards` to refresh the static cards/items baked into `index.html`, `projects.html` and `publications.html`. The `generate-cards` test fails on drift in CI.
9. **After re-running `npm run train-cnn`** (or editing `data/cnn-samples.json`), run `npm run generate-cnn-activations`. The `cnn` test fails on drift in CI. Training downloads MNIST into `.cache/mnist/` (gitignored); none of it ships to the browser.
10. **After adding/removing a project page** (or any HTML page), run `npm run generate-analytics` and then `npm run generate-csp-meta` so the new page carries the GoatCounter pixel and CSP `<meta>`. Run **generate-csp-meta last**, after anything that changes inline `<script>` content (`generate-project-jsonld`, `generate-cards`) — the CSP hashes each inline script (`script-src` uses per-page `'sha256-…'` instead of `'unsafe-inline'`), so a changed JSON-LD invalidates the hash. The `seo`/`html-quality`/`analytics`/`csp` tests gate this in CI.
11. Production builds are produced by GitHub Actions (`.github/workflows/deploy.yml`) on push to `main` — Vite builds `dist/` and the official Pages action publishes it.

## Important Patterns

- **Email obfuscation**: Contact email is base64-encoded in HTML `data-*` attributes, revealed by JS on click
- **Globe data pipeline**: `locations.yaml` → geocode via Nominatim API (cached in `.cache/`) → `locations.js` (ESM module that also assigns `globalThis.LOCATIONS` so legacy bare-global reads keep working)
- **Project pipeline**: Write Markdown with YAML frontmatter → `node scripts/new-project.js file.md` → generates HTML + updates `data/projects.js`
- **Static card rendering**: Project cards and publication items are **server-rendered into static HTML** (not just JS-injected) so crawlers and no-JS visitors see real content. `generate-cards` (`scripts/generate-cards.mjs`) bakes them between `<!-- generated:project-cards -->` / `<!-- generated:publication-items -->` markers — newest 3 / featured on `index.html`, all on `projects.html` / `publications.html` — plus a `CollectionPage` JSON-LD on `publications.html`. Markup comes from the shared pure builders in `js/render-cards.js`, which `js/main.js` also uses, so SSR and client markup can't drift (`generate-cards` test guards it). On load, `renderProjects()` re-shuffles the homepage set; `renderPublications()` honours `data-render="all"` on `publications.html`.
- **Homepage world map**: `data/countries.yaml` (lived/visited, derived from `locations.yaml` but hand-editable) → `generate-countries` → `data/countries.js`; then `generate-world-map` projects `data/countries-110m.json` to a static inline SVG (silhouette + highlighted-country paths) and rewrites the `<!-- world-map:start … -->` block in `index.html`. The land silhouette holds ~80% of the bytes, so it is Douglas-Peucker simplified (eps 0.4°, sub-pixel at the ~820px display width) and speck-sized islands are dropped — ~48% smaller SVG with no visible quality loss; highlighted countries are left at full detail. Fills use CSS `var(--pin-lived)` / `var(--pin-holiday)` classes, so a palette switch needs no regen. Micro-states absent from the 110m TopoJSON (e.g. Malta, San Marino, North Macedonia) stay in the data but don't render at world scale.
- **UNESCO accordion**: `data/unesco.yaml` (continent → country → site, https-only links) → `generate-unesco` → `data/unesco.js`; `renderUnescoAccordion()` in `js/main.js` builds a `<details>` disclosure tree, gated on `#unesco-accordion` (travel page only). The globe + Europe map init the same way — keyed off `#globe-canvas` / `#europe-canvas`, which now live only on `travel.html`.
- **Links blogroll**: `data/links.yaml` (a flat list; each entry has a name, an https-only url, optional `description`, one or more `categories`, and optional `tags` — categories/tags written as inline YAML flow arrays, e.g. `[ai, visual-explanation]`) → `generate-links` → `data/links.js`. The generator de-duplicates by URL (merging the categories/tags of duplicates) and emits `LINKS { categories: [{slug,label}], links: [...] }` with the used categories in canonical order. `renderLinks()` in `js/main.js` builds a category filter bar plus a single de-duplicated grid of `.link-card`s, gated on `#links-grid` (links page only); `linkMatchesFilter()` drives the client-side show/hide. https-only validation in the generator, HTML-escaped again at render. Category labels live in `CATEGORY_LABELS` in `scripts/generate-links.js`; unknown slugs are tolerated (humanised). Keep the list short and curated.
- **CNN hero pipeline**: `scripts/train-cnn.mjs` trains a small LeNet-5 (28×28 → conv 6@5×5 → pool → conv 16@5×5 → pool → 120 → 84 → 10; ~44 k params, 98.5 % test accuracy) on MNIST in **plain JavaScript with no dependencies**, writing `data/cnn-model.json` + `data/cnn-samples.json`. `scripts/generate-cnn-activations.mjs` then replays ten forward passes, quantises every layer's activations to uint8 against a shared per-layer max and base64-packs them into `data/cnn-activations.js` (~42 KB source, ~11 KB gzip). `js/cnn-hero.js` is a *player* for that data — it draws the layers in oblique projection and animates the signal travelling through them — so **the browser runs no inference and downloads no ML runtime**. That is the reason the hero is hand-rolled rather than built on TensorSpace.js (Three.js + TensorFlow.js, several hundred KB, unmaintained). Training is deliberately a separate step from the generator, so the generator stays deterministic, network-free and CI-runnable; `test/cnn-activations.test.mjs` regenerates and fails on drift.
- **Hero background selection**: `supportsCnnHero()` (js/utils.js) gates the CNN scene on `(min-width: 1100px) and (pointer: fine)` plus data-saver / slow-connection checks — narrower or touch-first viewports get `NeuralNetwork2D` instead. The branch happens **before** the dynamic `import()` in `js/main.js`, so phones never download the activation chunk. `rebuildNeural()` re-runs the choice on `themechange` and whenever the window crosses the breakpoint.
- **THREE module bindings**: `js/globe.js` uses named-import destructuring (`let { Scene, WebGLRenderer, ... } = _THREE`) re-bound by `onChange` so test mocks still take effect. (`js/neural-net.js` is Canvas2D and imports no THREE at all — the hero never pulls Three.js onto the homepage.)
- **Theme pipeline**: `data/palettes.yaml` (one `active` key + named palettes) → `npm run generate-theme` → rewrites the `@theme-generated` `:root` block in `css/styles.css`, regenerates `js/theme.js`, and updates `<meta theme-color>` / inline favicon / nav-logo gradient across every `*.html` + `public/favicon.svg` + the `theme_color`/`background_color` in `public/manifest.webmanifest`. CSS reads `var(--*)`; the WebGL/Canvas2D modules and GLSL shaders import `THEME` + the `int()` / `rgba()` / `glvec()` helpers from `js/theme.js` (the shader source is a JS template literal, so colours are interpolated at module load — no recompile, no uniforms). Switching the whole site's palette = edit one YAML key + run one command. `generate-theme` also repoints every brand page's `og:image`/`twitter:image` at the active palette's social card (`img/og/og-<key>.png`, built by `scripts/generate-og.mjs` from the same palette colours via an SVG→PNG render with embedded fonts).
- **Light / dark theme**: every palette in `data/palettes.yaml` carries a **required nested `light:` variant** (a full palette body — light surfaces, dark text, accents darkened for WCAG AA). `generate-theme` emits **two** CSS blocks (the default dark `:root`, plus a `@theme-generated-light` override scoped to `:root[data-theme="light"]`) and exports `THEME` (dark default) + `THEME_LIGHT` + a `getTheme()` resolver from `js/theme.js`. **The site is dark by default regardless of OS preference** — light is strictly opt-in via the navbar toggle (no `prefers-color-scheme` auto-apply). The static HTML carries no `data-theme`; a `<head>` bootstrap script (injected by `scripts/generate-theme-toggle.mjs`, hashed into the CSP) re-applies a stored light/dark choice before first paint to avoid FOUC. `initTheme()` (js/ui.js) wires the navbar toggle (pins `data-theme`, persists to `localStorage`, updates `<meta theme-color>`, fires a `themechange` event). The colour-baked canvases — noise-gradient/neural-net hero and the travel-page globe/Europe map — resolve their palette via `getTheme()` at construction and are **rebuilt on `themechange`** (js/main.js) so they recolour live. Re-run `generate-theme-toggle` after adding a page (then `generate-csp-meta`).
- **CSP**: every page ships a `Content-Security-Policy` `<meta>` (generated by `scripts/generate-csp-meta.mjs`, marker-wrapped). `script-src` carries **per-page `'sha256-…'` hashes** of each inline `<script>` (JSON-LD + speculationrules) instead of `'unsafe-inline'`; `style-src` keeps `'unsafe-inline'` (inline `style=""` attributes can't be hashed). `test/csp.test.mjs` recomputes the hashes and fails on drift, so re-run `generate-csp-meta` after any change to inline scripts.
- **Analytics**: cookieless GoatCounter via a **no-JS `<img>` pixel** (no external `<script>`, no cookies, no personal data). `scripts/generate-analytics.mjs` injects a marker-wrapped `<img src="https://stocastico.goatcounter.com/count?p=…&t=…">` into every HTML page (`p` = canonical path, `t` = page `<title>`), wrapped in `<!-- generated:analytics -->` markers like the CSP/JSON-LD generators. The pixel's origin is allowlisted in the CSP `img-src` (`generate-csp-meta.mjs`). `test/analytics.test.mjs` guards the pixel + CSP origin on every page and fails on drift. View stats at `https://stocastico.goatcounter.com`.
- **Performance**: NoiseGradient renders 3 frames then stops; favicon is static. Globe/Europe-map cache their canvas bounding rect (invalidated on scroll/resize) rather than calling `getBoundingClientRect()` per `mousemove`.
- **Page teardown / bfcache**: `js/main.js` collects disposables in `_disposables` and runs `destroy()` on each at `pagehide` (`initLifecycleCleanup`). The chrome inits — `initNavbar`, `initMobileMenu`, `initBackToTop`, `initCommandPalette` (js/ui.js) and the observer inits `initScrollReveal`/`initCounters`/`initSkillBars`/`initTimelineScroll3D` — **return a teardown fn**, wired via `_pushTeardown(...)`. In ui.js they register every document/window listener + observer through a `listenerBag()` (`on()` / `add()` / `teardown()`) so nothing leaks into the bfcache. WebGL/Canvas classes (globe, europe-map, neural-net, noise-gradient) instead expose `destroy()` and track listeners in a `_listeners` array. **Any new init that adds a document/window listener or observer must return a teardown and be `_pushTeardown`-ed.**
- **Full-bleed world map**: the `<figure class="world-map-figure">` on the homepage lives **outside** `.container`, directly under `<section id="places">` — the one element allowed to break the frame. Every other section sits at the same width, so this is the single deliberate break in the rhythm. Capped at `max-width: 1600px` because the viewBox is ~2.5:1 and width drives height. If you re-run `generate-world-map`, the markers move with the figure; the generator keys off `<!-- world-map:start … -->` and re-indents to wherever they sit.
- **Section headers**: every `.section-header` is **left-aligned** and its `.section-tag` is a plain uppercase eyebrow — *not* a pill, and never centred. The centred kicker-pill-over-display-title pattern is the single strongest "generated landing page" tell, and the whole site was using it five times over. `.section-header--left` is now a historical no-op kept for the sticky skills header. Sub-page toolbars (`.links-toolbar`, `.links-count`) follow the same left edge.
- **Title + nav conventions**: `<title>`/`og:title`/`twitter:title` use ` — Stefano Masneri` (em-dash) on **project detail pages** and ` | Stefano Masneri` on the **homepage + top-level pages**; keep each tier consistent. `generate-project-jsonld` strips either separator before deriving the JSON-LD `headline`/breadcrumb. Secondary-page nav links to the homepage use `#skills` (label "Expertise") — **not** `#research` (a removed section id). Every page carries a "Now" nav item (`now.html`). Footer reads "Written by me, coded with Claude and plenty of ☕ in San Sebastián" — the wording deliberately separates authorship of the words from authorship of the code (no Three.js credit — the homepage ships none).

## Things to Avoid

- Don't bypass Vite — production HTML uses `<script type="module" src="/js/main.js">`; data files are imported by main.js, not loaded as standalone scripts
- Don't edit generated files (`data/cv.js`, `data/locations.js`, `js/theme.js`, `data/countries.js`, `data/unesco.js`, `data/links.js`, `data/cnn-activations.js`, `data/cnn-model.json`) or the `<!-- world-map:start … -->` SVG block in `index.html` — regenerate via the relevant script
- Don't hardcode colours — add them to `data/palettes.yaml` and consume via `var(--*)` (CSS) or `THEME` from `js/theme.js` (JS/shaders), so palette switching stays consistent
- Don't edit the `@theme-generated` block inside `css/styles.css` by hand — it's overwritten by `generate-theme`
- Don't load external fonts, third-party scripts, or any cookie-setting / cross-site tracker — privacy-first. The one permitted external request is the **GoatCounter no-JS analytics pixel** (cookieless, no personal data, image-only — `img-src https://stocastico.goatcounter.com`); keep analytics to that pixel.
- Don't remove `prefers-reduced-motion` checks or accessibility attributes
- Don't commit `.cache/` changes without verifying geocoding results
- Don't add `module.exports` / CJS to anything under `js/` or `data/` — they're ESM
- Don't add a document/window listener or observer in an init without returning a teardown and `_pushTeardown`-ing it (bfcache leak); use `listenerBag()` in js/ui.js
- Don't hand-edit `theme_color`/`background_color` in `public/manifest.webmanifest` — `generate-theme` owns them (guarded by `theme-sync`)
