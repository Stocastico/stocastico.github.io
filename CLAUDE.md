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

npm test                    # Run all 212 tests (Node built-in runner)
npm run test:main           # js/main.js tests only
npm run test:cv             # CV rendering tests only
npm run test:project        # new-project.js tests only
npm run test:locations      # locations generator tests only
npm run test:seo            # SEO regression tests only
npm run test:generate-cv    # generate-cv.js tests only

npm run generate-cv         # data/cv.yaml → data/cv.js
npm run generate-locations  # data/locations.yaml → data/locations.js
npm run new-project -- file.md  # Markdown → projects/<slug>.html + updates data/projects.js
```

## Project Structure

```
index.html          Single-page site (hero, about, research, skills, publications, projects, contact)
cv.html             Dedicated CV page (two-column layout)
projects.html       Projects listing page
404.html            Custom 404 page
projects/*.html     Per-project detail pages
vite.config.js      Multi-page Vite config (index, cv, projects, 404, project pages)
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
data/projects.js    Project entries — ESM (edit directly or via `npm run new-project`)
data/publications.js Publication entries — ESM (edit directly)
scripts/            Generator scripts (new-project, generate-cv, generate-locations)
test/               Tests for each script + main.js + europe-map.js + SEO + Playwright E2E
docs/               DATA-FORMATS.md, DEPLOYMENT.md, project-template.md, cv.pdf, defense.pdf
drafts/             Markdown source for projects/*.html — feed into `npm run new-project`. Not deployed.
```

## Coding Conventions

- **ES modules everywhere** — `js/` and `data/` directories have nested `package.json` with `"type": "module"`. Generator scripts and tests for them stay CJS.
- **Test mocking for Three.js** — modules subscribe to `onChange` from `js/three-context.js`; tests call `__setThreeForTests(mock)` / `__resetThreeForTests()` (re-exported from `js/main.js`) to swap the active THREE.
- All generator scripts support `--dry-run`, `--help`, and standard CLI flags
- Generated files (`data/cv.js`, `data/locations.js`) should never be edited manually
- Tests use Node.js built-in test runner (`node --test`) — no Jest, no Mocha
- YAML source files → JS ESM data files via generator scripts
- Self-hosted fonts (no Google Fonts CDN)
- `prefers-reduced-motion` is respected everywhere — all animations degrade gracefully

## Workflow Rules

1. **Always run `npm test` after changes** to verify nothing breaks (212 tests, ~2s)
2. **After editing `data/cv.yaml`**, run `npm run generate-cv`
3. **After editing `data/locations.yaml`**, run `npm run generate-locations`
4. Production builds are produced by GitHub Actions (`.github/workflows/deploy.yml`) on push to `main` — Vite builds `dist/` and the official Pages action publishes it.

## Important Patterns

- **Email obfuscation**: Contact email is base64-encoded in HTML `data-*` attributes, revealed by JS on click
- **Globe data pipeline**: `locations.yaml` → geocode via Nominatim API (cached in `.cache/`) → `locations.js` (ESM module that also assigns `globalThis.LOCATIONS` so legacy bare-global reads keep working)
- **Project pipeline**: Write Markdown with YAML frontmatter → `node scripts/new-project.js file.md` → generates HTML + updates `data/projects.js`
- **THREE module bindings**: `js/neural-net.js` and `js/globe.js` use named-import destructuring (`let { Scene, WebGLRenderer, ... } = _THREE`) re-bound by `onChange` so test mocks still take effect
- **Performance**: NoiseGradient renders 3 frames then stops; HeroNameShader capped at 30fps; favicon is static

## Things to Avoid

- Don't bypass Vite — production HTML uses `<script type="module" src="/js/main.js">`; data files are imported by main.js, not loaded as standalone scripts
- Don't edit generated files (`data/cv.js`, `data/locations.js`)
- Don't load external fonts or analytics — privacy-first, no tracking
- Don't remove `prefers-reduced-motion` checks or accessibility attributes
- Don't commit `.cache/` changes without verifying geocoding results
- Don't add `module.exports` / CJS to anything under `js/` or `data/` — they're ESM
