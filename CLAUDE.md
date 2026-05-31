# CLAUDE.md — Project Guide

## Project Overview

Personal website of **Stefano Masneri** (Senior AI Engineer), hosted on GitHub Pages at `stocastico.github.io`. ES-modules-based site bundled with Vite; no framework.

## Tech Stack

- **HTML/CSS/JS** — vanilla, no framework
- **Vite** — dev server + production bundler (multi-page input)
- **Three.js** (npm, bundled by Vite) — 3D globe, neural-network hero
- **Raw WebGL/GLSL** — iridescent hero name shader, noise-gradient background
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

npm run generate-cv         # data/cv.yaml → data/cv.js
npm run generate-locations  # data/locations.yaml → data/locations.js
npm run generate-theme      # data/palettes.yaml → theme across CSS + JS + HTML
npm run generate-countries  # data/locations.yaml → data/countries.yaml (editable) → data/countries.js
npm run generate-world-map  # data/countries-110m.json + data/countries.js → inline SVG in index.html
npm run generate-unesco     # data/unesco.yaml → data/unesco.js
npm run generate-links      # data/links.yaml → data/links.js
npm run new-project -- file.md  # Markdown → projects/<slug>.html + updates data/projects.js
```

## Project Structure

```
index.html          Single-page site (hero, about, research, skills, publications, projects, places-teaser, contact)
cv.html             Dedicated CV page (two-column layout)
projects.html       Projects listing page
travel.html         Travel page (3D globe + 2D Europe map + UNESCO World Heritage accordion)
links.html          Links page (curated blogroll, grouped by category)
404.html            Custom 404 page
projects/*.html     Per-project detail pages
vite.config.js      Multi-page Vite config (index, cv, projects, travel, links, 404, project pages)
css/styles.css      All styles including print styles
css/fonts.css       Self-hosted fonts
js/main.js          ESM entry — orchestrates DOMContentLoaded init
js/three-context.js Shared THREE binding + test mocking hook
js/utils.js         isLowPowerDevice, prefersReducedMotion, hasWebGLSupport, getTopoJSON
js/neural-net.js    NeuralNetwork (Three.js) + NeuralNetwork2D (Canvas2D fallback)
js/hero-shader.js   HeroNameShader (raw WebGL iridescent text)
js/globe.js         Globe3D + GlobeFallback2D + geocodeLocations
js/animations.js    Scroll-driven effects, card tilt, magnetic buttons, parallax
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
data/links.js       Generated ESM module — LINKS { categories } (do not edit manually)
data/projects.js    Project entries — ESM (edit directly or via `npm run new-project`)
data/publications.js Publication entries — ESM (edit directly)
js/theme.js         Generated ESM module — active palette in hex/int/glvec forms (do not edit manually)
scripts/            Generator scripts (new-project, generate-cv, generate-locations, generate-theme, generate-countries, generate-world-map, generate-unesco, generate-links)
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
- Self-hosted fonts (no Google Fonts CDN)
- `prefers-reduced-motion` is respected everywhere — all animations degrade gracefully

## Workflow Rules

1. **Always run `npm test` after changes** to verify nothing breaks
2. **After editing `data/cv.yaml`**, run `npm run generate-cv`
3. **After editing `data/locations.yaml`**, run `npm run generate-locations`. If countries changed, also `npm run generate-countries --refresh` then `npm run generate-world-map` (and review `data/countries.yaml`).
4. **After editing `data/palettes.yaml`** (or switching the `active` palette), run `npm run generate-theme`, then `npm run generate-favicons` to rebuild the raster icons. The homepage world map needs no regeneration — it uses CSS `var(--*)` classes.
5. **After editing `data/countries.yaml`**, run `npm run generate-countries` then `npm run generate-world-map` (rewrites the inline SVG block in `index.html`).
6. **After editing `data/unesco.yaml`**, run `npm run generate-unesco`.
7. **After editing `data/links.yaml`**, run `npm run generate-links`.
8. Production builds are produced by GitHub Actions (`.github/workflows/deploy.yml`) on push to `main` — Vite builds `dist/` and the official Pages action publishes it.

## Important Patterns

- **Email obfuscation**: Contact email is base64-encoded in HTML `data-*` attributes, revealed by JS on click
- **Globe data pipeline**: `locations.yaml` → geocode via Nominatim API (cached in `.cache/`) → `locations.js` (ESM module that also assigns `globalThis.LOCATIONS` so legacy bare-global reads keep working)
- **Project pipeline**: Write Markdown with YAML frontmatter → `node scripts/new-project.js file.md` → generates HTML + updates `data/projects.js`
- **Homepage world map**: `data/countries.yaml` (lived/visited, derived from `locations.yaml` but hand-editable) → `generate-countries` → `data/countries.js`; then `generate-world-map` projects `data/countries-110m.json` to a static inline SVG (silhouette + highlighted-country paths) and rewrites the `<!-- world-map:start … -->` block in `index.html`. Fills use CSS `var(--pin-lived)` / `var(--pin-holiday)` classes, so a palette switch needs no regen. Micro-states absent from the 110m TopoJSON (e.g. Malta, San Marino, North Macedonia) stay in the data but don't render at world scale.
- **UNESCO accordion**: `data/unesco.yaml` (continent → country → site, https-only links) → `generate-unesco` → `data/unesco.js`; `renderUnescoAccordion()` in `js/main.js` builds a `<details>` disclosure tree, gated on `#unesco-accordion` (travel page only). The globe + Europe map init the same way — keyed off `#globe-canvas` / `#europe-canvas`, which now live only on `travel.html`.
- **Links blogroll**: `data/links.yaml` (category → link, https-only urls, optional per-link `description` + per-category `blurb`) → `generate-links` → `data/links.js`; `renderLinks()` in `js/main.js` builds a grid of category sections of `.link-card`s, gated on `#links-grid` (links page only). Same shape as the UNESCO pipeline — https-only validation in the generator, HTML-escaped again at render. Keep the list short and curated.
- **THREE module bindings**: `js/neural-net.js` and `js/globe.js` use named-import destructuring (`let { Scene, WebGLRenderer, ... } = _THREE`) re-bound by `onChange` so test mocks still take effect
- **Theme pipeline**: `data/palettes.yaml` (one `active` key + named palettes) → `npm run generate-theme` → rewrites the `@theme-generated` `:root` block in `css/styles.css`, regenerates `js/theme.js`, and updates `<meta theme-color>` / inline favicon / nav-logo gradient across every `*.html` + `public/favicon.svg`. CSS reads `var(--*)`; the WebGL/Canvas2D modules and GLSL shaders import `THEME` + the `int()` / `rgba()` / `glvec()` helpers from `js/theme.js` (the shader source is a JS template literal, so colours are interpolated at module load — no recompile, no uniforms). Switching the whole site's palette = edit one YAML key + run one command.
- **Performance**: NoiseGradient renders 3 frames then stops; HeroNameShader capped at 30fps; favicon is static

## Things to Avoid

- Don't bypass Vite — production HTML uses `<script type="module" src="/js/main.js">`; data files are imported by main.js, not loaded as standalone scripts
- Don't edit generated files (`data/cv.js`, `data/locations.js`, `js/theme.js`, `data/countries.js`, `data/unesco.js`, `data/links.js`) or the `<!-- world-map:start … -->` SVG block in `index.html` — regenerate via the relevant script
- Don't hardcode colours — add them to `data/palettes.yaml` and consume via `var(--*)` (CSS) or `THEME` from `js/theme.js` (JS/shaders), so palette switching stays consistent
- Don't edit the `@theme-generated` block inside `css/styles.css` by hand — it's overwritten by `generate-theme`
- Don't load external fonts or analytics — privacy-first, no tracking
- Don't remove `prefers-reduced-motion` checks or accessibility attributes
- Don't commit `.cache/` changes without verifying geocoding results
- Don't add `module.exports` / CJS to anything under `js/` or `data/` — they're ESM
