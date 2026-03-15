# CLAUDE.md — Project Guide

## Project Overview

Personal website of **Stefano Masneri** (Senior AI Engineer), hosted on GitHub Pages at `stocastico.github.io`. Pure HTML/CSS/JS — no build step, no bundler, no framework.

## Tech Stack

- **HTML/CSS/JS** — vanilla, no framework
- **Three.js r160** (CDN) — 3D globe, neural-network hero, hero name shader
- **Raw WebGL/GLSL** — iridescent text shader, noise-gradient background
- **Node.js >= 18** — scripts and tests (built-in test runner, zero test dependencies)
- **Playwright** — E2E UI tests (only dev dependency)

## Key Commands

```bash
npm test                    # Run all 206 tests (Node built-in runner)
npm run test:main           # js/main.js tests only
npm run test:cv             # CV rendering tests only
npm run test:post           # new-post.js tests only
npm run test:locations      # locations generator tests only
npm run test:rss            # RSS generator tests only
npm run test:sitemap        # sitemap generator tests only
npm run test:generate-cv    # generate-cv.js tests only

npm run minify              # terser js/main.js → js/main.min.js
npm run generate-cv         # data/cv.yaml → data/cv.js
npm run generate-locations  # data/locations.yaml → data/locations.js
npm run generate-rss        # data/blog.js → rss.xml
npm run generate-sitemap    # data/blog.js → sitemap.xml
npm run new-post -- file.md # Markdown → blog/<slug>.html + updates data/blog.js
```

## Project Structure

```
index.html          Single-page site (hero, about, research, skills, publications, blog, contact)
cv.html             Dedicated CV page (two-column layout)
404.html            Custom 404 page
css/styles.css      All styles including blog post rules and print styles
css/fonts.css       Self-hosted fonts (Inter + Playfair Display)
js/main.js          ~3000 lines: WebGL classes + all UI logic
js/main.min.js      Auto-generated minified build (do not edit)
js/europe-map.js    Interactive 2D Canvas map of Europe
data/cv.yaml        Source of truth for CV → run generate-cv after editing
data/cv.js          Generated (do not edit manually)
data/locations.yaml Source of truth for globe pins/trips → run generate-locations after editing
data/locations.js   Generated (do not edit manually)
data/blog.js        Blog post entries array (edit directly)
data/publications.js Publication entries array (edit directly)
scripts/            All generator scripts (new-post, generate-cv, generate-locations, etc.)
test/               Tests for each script + main.js + europe-map.js + Playwright E2E
docs/               DATA-FORMATS.md, DEPLOYMENT.md, blog-post-template.md, cv.pdf, defense.pdf
```

## Coding Conventions

- **No external runtime dependencies** — everything runs on vanilla JS and Node built-ins
- **No bundler** — separate `<script defer>` tags maintain execution order
- All generator scripts support `--dry-run`, `--help`, and standard CLI flags
- Generated files (cv.js, locations.js, main.min.js) should never be edited manually
- Tests use Node.js built-in test runner (`node --test`) — no Jest, no Mocha
- YAML source files → JS data files via generator scripts
- Self-hosted fonts (no Google Fonts CDN)
- `prefers-reduced-motion` is respected everywhere — all animations degrade gracefully

## Workflow Rules

1. **Always run `npm test` after changes** to verify nothing breaks (206 tests, ~4s)
2. **After editing `js/main.js`**, run `npm run minify` to update `main.min.js`
3. **After editing `data/cv.yaml`**, run `npm run generate-cv`
4. **After editing `data/locations.yaml`**, run `npm run generate-locations`
5. **After adding/editing blog posts**, run `npm run generate-rss` and `npm run generate-sitemap`
6. The site uses `js/main.min.js` in production — always keep it in sync with `main.js`

## Important Patterns

- **Email obfuscation**: Contact email is base64-encoded in HTML `data-*` attributes, revealed by JS on click
- **Globe data pipeline**: `locations.yaml` → geocode via Nominatim API (cached in `.cache/`) → `locations.js`
- **Blog pipeline**: Write Markdown with YAML frontmatter → `node scripts/new-post.js file.md` → generates HTML + updates `data/blog.js`
- **Three.js classes** in `main.js`: `NeuralNetwork`, `Globe3D`, `GlobeFallback2D`, `HeroNameShader`, `NoiseGradient`
- **Performance**: NoiseGradient renders 3 frames then stops; HeroNameShader capped at 30fps; favicon is static

## Things to Avoid

- Don't add npm runtime dependencies — this is a zero-dependency static site
- Don't introduce a build step or bundler — the simplicity is intentional
- Don't edit generated files (`data/cv.js`, `data/locations.js`, `js/main.min.js`)
- Don't load external fonts or analytics — privacy-first, no tracking
- Don't remove `prefers-reduced-motion` checks or accessibility attributes
- Don't commit `.cache/` changes without verifying geocoding results
