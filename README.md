# stocastico.github.io

Personal website of **Stefano Masneri** — Senior AI Engineer based in San Sebastián, Spain — live at [stefanomasneri.com](https://stefanomasneri.com/) (hosted on GitHub Pages from this repository).

## About this site

A single-page portfolio that doubles as a small showcase of real-time WebGL effects. The content is organised across seven pages:

- **`index.html`** — the main page, with the following sections:
  - **Hero** — palette-gradient name over a domain-warped GLSL noise gradient and a Three.js neural-network particle field.
  - **About** — short bio and key stats.
  - **Research** — horizontal-scroll carousel of research topics (computer vision, AR, video understanding, generative AI, etc.).
  - **Skills** — Apple-style sticky-scroll section where each skill category pins to the viewport in turn.
  - **Publications** — filterable list of selected papers, generated from `data/publications.js`.
  - **Projects** — up to three project cards from `data/projects.js`, with a link to the full listing.
  - **Places** — a static inline-SVG world map highlighting lived / visited countries (a teaser that links to the travel page).
  - **Contact** — 2 × 2 grid of contact cards; the email address is base64-encoded and revealed on click.
- **`projects.html`** — full project listing, with one detail page per project under `projects/`.
- **`publications.html`** — the full (30+) publication list, rendered from `data/publications.js`.
- **`cv.html`** — two-column CV (work experience / education) plus a skills tag cloud, generated from `data/cv.yaml`.
- **`travel.html`** — interactive 3-D globe (Three.js) + 2-D Canvas map of Europe + a UNESCO World Heritage accordion. The globe and map visualise the same set of "lived / work / travel" pins, animated trip routes, and highlighted regions.
- **`links.html`** — a curated, category-filterable blogroll generated from `data/links.yaml`.
- **`404.html`** — custom not-found page with the standard navbar.

Site-wide UX touches include a ⌘K / Ctrl-K command palette, a reading-progress bar, 3-D tilt-and-gloss cards, click-to-flip research cards, a back-to-top button, cross-document View Transitions, and full `prefers-reduced-motion` support throughout.

## Tech stack

- Vanilla HTML / CSS / JavaScript bundled by [Vite](https://vitejs.dev/) (multi-page input, no framework)
- Modern CSS — `@layer` cascade, native nesting, `oklch()` colours, and a design-token scale (spacing / tracking / elevation / easing)
- [Three.js](https://threejs.org/) (single runtime dependency, bundled by Vite) for the neural-network hero background and the interactive globe — lazily code-split so it stays off the initial critical path
- Raw WebGL (GLSL) for the noise-gradient hero background
- Centralised theme system — one YAML palette drives every colour across CSS, the WebGL/Canvas modules, the GLSL shaders, and the favicon (`npm run generate-theme`); a weekly GitHub Actions job rotates the active palette
- Node.js ≥ 18 for scripts and tests (built-in test runner, no extra test dependencies); CI runs on Node 24
- [Playwright](https://playwright.dev/) and [sharp](https://sharp.pixelplumbing.com/) as dev dependencies (E2E tests + favicon rasterisation)
- Self-hosted fonts: Inter (body) and Outfit (headings + the hero name)
- Privacy-first: no third-party scripts, no cookies. The only external request is a cookieless [GoatCounter](https://www.goatcounter.com/) no-JS analytics pixel (aggregate counts, no personal data)

## Project structure

```text
.
├── index.html                 Main single-page site
├── projects.html              Dedicated projects listing page
├── publications.html          Full publication list (all papers)
├── cv.html                    Dedicated CV page (two-column: work | education)
├── travel.html                Travel page — 3D globe + 2D Europe map + UNESCO accordion
├── links.html                 Curated, category-filterable blogroll
├── 404.html                   Custom 404 page
├── css/
│   ├── styles.css             All styles (@layer + nesting + oklch), including shared project-page + print rules
│   └── fonts.css              Self-hosted @font-face declarations
├── vite.config.js             Multi-page Vite config (index, projects, cv, travel, links, 404, project pages)
├── js/
│   ├── main.js                ESM entry — orchestrates DOMContentLoaded init + pagehide teardown
│   ├── render-cards.js        Pure HTML builders for project cards + publication items (shared with generate-cards)
│   ├── ui.js                  Chrome/UI — navbar, mobile menu, command palette, counters, toast, back-to-top, carousel
│   ├── three-context.js       Shared THREE binding + test mocking hook
│   ├── utils.js               isLowPowerDevice, prefersReducedMotion, hasWebGLSupport, getTopoJSON
│   ├── neural-net.js          NeuralNetwork (Three.js) + NeuralNetwork2D (Canvas2D fallback)
│   ├── noise-gradient.js      NoiseGradient (raw WebGL/GLSL hero background — renders a few frames then stops)
│   ├── globe.js               Globe3D + GlobeFallback2D + geocodeLocations
│   ├── animations.js          Scroll reveal, card tilt, card flip, parallax, skill bars, timeline entrance
│   ├── europe-map.js          Interactive 2D Canvas map of Europe
│   └── theme.js               Generated — active palette (hex/int/glvec) + helpers (do not edit manually)
├── data/
│   ├── cv.yaml / cv.js        CV source (YAML) → generated ESM (run generate-cv)
│   ├── projects.js            PROJECTS array — edit directly or via new-project
│   ├── publications.js        PUBLICATIONS array — edit to add/update papers
│   ├── locations.yaml / .js   Globe pins/trips/regions source → generated ESM (run generate-locations)
│   ├── countries.yaml / .js   Homepage-map lived/visited highlights → generated ESM (run generate-countries)
│   ├── unesco.yaml / .js      Travel-page UNESCO accordion source → generated ESM (run generate-unesco)
│   ├── links.yaml / .js       Blogroll source → generated ESM (run generate-links)
│   ├── palettes.yaml          Source of truth for the colour palettes — edit then run generate-theme
│   ├── world-110m.json        TopoJSON world map data (110m resolution)
│   ├── countries-110m.json    world-atlas TopoJSON (borders + names) for the homepage world map
│   └── land-50m.json          TopoJSON land data for Europe 2D map (50m, finer coastlines)
├── projects/
│   └── *.html                 Individual project detail pages
├── drafts/
│   └── *.md                   Markdown sources for projects/*.html (not deployed)
├── public/
│   ├── favicon.svg            Inline-friendly primary favicon
│   ├── favicon.ico            Multi-resolution 16/32/48 fallback
│   ├── apple-touch-icon.png   iOS Add-to-Home-Screen icon (180×180)
│   ├── icon-192.png           Android / PWA manifest (192×192)
│   ├── icon-512.png           Android splash / PWA manifest (512×512)
│   ├── icon-maskable-192.png  Android adaptive (maskable) icon (192×192)
│   ├── icon-maskable-512.png  Android adaptive (maskable) icon (512×512)
│   ├── manifest.webmanifest   PWA web app manifest (id, icons, theme colour)
│   ├── sitemap.xml            Generated sitemap (copied verbatim into dist/)
│   └── robots.txt             SEO robot rules
├── scripts/
│   ├── new-project.js               Convert a Markdown draft → project HTML + update projects.js
│   ├── generate-cards.mjs           Server-render project cards + publication items into static HTML (index/projects/publications)
│   ├── generate-cv.js               Build data/cv.js from data/cv.yaml
│   ├── generate-locations.js        Generate data/locations.js from data/locations.yaml
│   ├── generate-countries.js        Generate data/countries.js from data/countries.yaml (lived/visited)
│   ├── generate-world-map.js        Project countries-110m.json → inline SVG block in index.html
│   ├── generate-unesco.js           Generate data/unesco.js from data/unesco.yaml
│   ├── generate-links.js            Generate data/links.js from data/links.yaml (de-dupes by URL)
│   ├── generate-theme.js            Propagate data/palettes.yaml across CSS, js/theme.js, HTML + favicon (oklch + accent taming)
│   ├── generate-sitemap.mjs         Rebuild public/sitemap.xml from projects.js + git mtimes
│   ├── generate-project-jsonld.mjs  Inject/refresh BreadcrumbList + Article JSON-LD on every projects/*.html
│   ├── generate-csp-meta.mjs        Inject/refresh the CSP meta tag on every HTML page
│   ├── generate-analytics.mjs       Inject/refresh the cookieless GoatCounter no-JS pixel on every HTML page
│   ├── generate-favicons.mjs        Rasterise public/favicon.svg → ico + apple-touch + 192/512 PNGs (uses sharp)
│   ├── generate-og.mjs              Render one social-card PNG per palette → img/og/og-<key>.png (uses sharp)
│   ├── rotate-palette.js            Advance data/palettes.yaml `active` to the next palette (used by CI)
│   ├── set-domain.mjs               Migrate the site to a custom domain (rewrites URLs + writes public/CNAME)
│   ├── update-locations.sh          Convenience wrapper for generate-locations.js
│   ├── update-locations.ps1         PowerShell wrapper for generate-locations.js
│   └── lib/
│       ├── yaml.js                  Minimal YAML parser (no external dependencies)
│       └── site.json                Single source of truth for the site origin (used by the URL generators)
├── test/
│   ├── main.node.test.mjs          Tests for js/main.js + js/animations.js
│   ├── cv.test.mjs                 Tests for CV rendering
│   ├── europe-map.test.mjs         Tests for js/europe-map.js
│   ├── generate-cv.test.js         Tests for scripts/generate-cv.js
│   ├── generate-theme.test.js      Tests for scripts/generate-theme.js (oklch math + accent taming)
│   ├── rotate-palette.test.js      Tests for scripts/rotate-palette.js
│   ├── generate-countries.test.js  Tests for scripts/generate-countries.js
│   ├── generate-world-map.test.js  Tests for scripts/generate-world-map.js
│   ├── generate-unesco.test.js     Tests for scripts/generate-unesco.js
│   ├── generate-links.test.js      Tests for scripts/generate-links.js
│   ├── locations-generator.test.js Tests for scripts/generate-locations.js
│   ├── new-project.test.js         Tests for scripts/new-project.js
│   ├── seo.test.js                 SEO regression tests (meta description, JSON-LD, stat counters)
│   ├── sitemap.test.mjs            Regression tests for the generated sitemap.xml
│   ├── project-jsonld.test.mjs     Regression tests for BreadcrumbList + Article JSON-LD on project pages
│   ├── html-quality.test.mjs       html-validate / a11y regression checks on every HTML page
│   ├── css-assets.test.mjs         Regression checks on CSS structure + referenced assets
│   ├── theme-sync.test.js          Guards every HTML page against palette drift (theme-color / favicon / nav-grad)
│   ├── cname.test.js               Guards public/CNAME ↔ site origin consistency
│   ├── analytics.test.mjs          Guards the GoatCounter pixel + its CSP origin on every page
│   ├── csp.test.mjs                Guards the per-page CSP script-src hashes (no 'unsafe-inline'; no drift)
│   ├── globe.test.html             Interactive globe visualisation tests
│   ├── playwright.ui.test.mjs      End-to-end UI tests (Playwright)
│   └── playwright.iphone.test.mjs  iPhone Safari regression tests (Playwright)
├── .cache/
│   └── locations-geocode-cache.json  Geocoding cache (auto-created; commit this to avoid re-querying the API in CI)
└── package.json               three.js as the only runtime dependency
```

---

## Running tests

```bash
npm test                        # run all tests
npm run test:main               # js/main.js + animations tests only
npm run test:cv                 # CV rendering tests only
npm run test:generate-cv        # generate-cv.js tests only
npm run test:generate-theme     # generate-theme.js tests only
npm run test:rotate-palette     # rotate-palette.js tests only
npm run test:generate-countries # generate-countries.js tests only
npm run test:generate-world-map # generate-world-map.js tests only
npm run test:generate-unesco    # generate-unesco.js tests only
npm run test:generate-links     # generate-links.js tests only
npm run test:locations          # locations generator tests only
npm run test:project            # new-project.js tests only
npm run test:seo                # SEO regression tests only
npm run test:sitemap            # sitemap.xml regression tests only
npm run test:project-jsonld     # project-page JSON-LD regression tests only
npm run test:html-quality       # html-validate / a11y checks only
npm run test:css-assets         # CSS structure / asset regression checks only
npm run test:theme-sync         # palette-drift guard across every HTML page
npm run test:cname              # CNAME ↔ site-origin consistency
npm run test:analytics          # GoatCounter pixel + CSP-origin guard
npm run test:csp                # per-page CSP script-src hash guard
# europe-map.test.mjs is included in `npm test` but has no dedicated shorthand
```

The Playwright suite is not wired into `npm test` — run it manually with `npm run test:playwright` once the dev server is up.

No external test dependencies are required — the Node.js built-in test runner (Node ≥ 18) handles everything.

---

## Scripts reference

All scripts live in `scripts/` and are wired up as `npm run` commands.

### `generate-cv` — rebuild CV data

Reads `data/cv.yaml` and writes `data/cv.js`.

```bash
npm run generate-cv
# or directly:
node scripts/generate-cv.js

# Options:
node scripts/generate-cv.js --input my-cv.yaml --output data/cv.js
node scripts/generate-cv.js --dry-run          # print output, do not write
node scripts/generate-cv.js --validate         # check YAML structure, exit
node scripts/generate-cv.js --help
```

Run this every time you edit `data/cv.yaml`.

### `generate-locations` — rebuild globe data

Reads `data/locations.yaml`, auto-geocodes missing coordinates via OpenStreetMap Nominatim, and writes `data/locations.js`.

```bash
npm run generate-locations
# or:
./scripts/update-locations.sh
# Windows PowerShell:
.\scripts\update-locations.ps1
# npm wrapper for PowerShell:
npm run update-locations:ps
# or directly:
node scripts/generate-locations.js

# Options:
node scripts/generate-locations.js --input data/locations.yaml --output data/locations.js
node scripts/generate-locations.js --cache .cache/my-cache.json
node scripts/generate-locations.js --no-geocode   # fail if coordinates missing
node scripts/generate-locations.js --help
```

Geocoding results are cached in `.cache/locations-geocode-cache.json` so subsequent runs do not re-query the API. The Nominatim API has a 1-request-per-second rate limit; the script respects this automatically.

### Content generators — countries, world map, UNESCO, links

Each reads a YAML source of truth and emits a generated ESM module (or, for the world map, rewrites an inline SVG block). All support `--dry-run` / `--help`.

```bash
npm run generate-countries     # data/countries.yaml → data/countries.js (lived/visited)
npm run generate-world-map     # data/countries-110m.json + countries.js → inline SVG in index.html
npm run generate-unesco        # data/unesco.yaml → data/unesco.js  (travel-page accordion)
npm run generate-links         # data/links.yaml  → data/links.js   (de-duped by URL)
```

`countries.yaml` is derived from `locations.yaml` on first run (`generate-countries --refresh`) and is hand-editable thereafter. After editing it, run `generate-countries` then `generate-world-map` to rewrite the `<!-- world-map:start … -->` block in `index.html`. The map's fills use CSS `var(--pin-*)` classes, so a palette switch needs **no** world-map regeneration.

### `generate-theme` — apply a colour palette site-wide

Reads `data/palettes.yaml`, takes the `active` palette, and regenerates every place a colour is baked in — in one pass:

- the `:root` colour block in `css/styles.css` (between the `@theme-generated` markers) — solid colours ship as `oklch()`, with sRGB channel lists kept for the `rgb(var(--x-rgb) / a)` alpha pattern
- `js/theme.js` — the ESM module the WebGL / Canvas2D modules and GLSL shaders import
- `<meta theme-color>`, the inline data-URI favicon, and the nav-logo gradient in every `*.html` page + the `scripts/new-project.js` template
- `public/favicon.svg`

The accent family is **chroma-tamed** in OKLCH before it is written out (lightness and hue preserved), so accents read as refined rather than neon. The `theme-sync` test guards every HTML page against palette drift.

```bash
npm run generate-theme
# or directly:
node scripts/generate-theme.js

# Options:
node scripts/generate-theme.js --palette crimson   # preview a palette other than `active`
node scripts/generate-theme.js --dry-run           # print what would change, write nothing
node scripts/generate-theme.js --validate          # check palettes.yaml structure, exit
node scripts/generate-theme.js --help
```

Switching the whole site to another palette = change the `active:` key in `data/palettes.yaml` (or add a new palette), run `npm run generate-theme`, then `npm run generate-favicons` to rebuild the raster icons.

### `rotate-palette` — cycle to the next palette

Rewrites only the `active:` key in `data/palettes.yaml` to the next palette in document order (wrapping at the end); every palette definition and comment is preserved byte-for-byte. A scheduled GitHub Actions workflow (`.github/workflows/rotate-palette.yml`) uses this to rotate the site's colours automatically.

```bash
npm run rotate-palette
# or directly:
node scripts/rotate-palette.js --palette crimson   # force a specific palette
node scripts/rotate-palette.js --dry-run
```

After rotating, run `npm run generate-theme` then `npm run generate-favicons` to propagate the colours.

### `new-project` — create a project page from Markdown

Converts a Markdown file to a styled `projects/<id>.html` and registers the entry in `data/projects.js` so the card appears on the homepage and on `projects.html`.

```bash
npm run new-project -- path/to/my-project.md
# or directly:
node scripts/new-project.js path/to/my-project.md

# Options:
node scripts/new-project.js project.md --out-dir projects/
node scripts/new-project.js project.md --dry-run    # preview without writing
node scripts/new-project.js --help
```

### `generate-sitemap` — rebuild sitemap.xml

Reads `data/projects.js` and the HTML files in the repo, writes `public/sitemap.xml`. `<lastmod>` is taken from the git commit date of each file (filesystem mtime as fallback).

```bash
npm run generate-sitemap
# or:
node scripts/generate-sitemap.mjs --dry-run
```

Run after adding new project pages so the sitemap stays in sync. CI re-runs this before every deploy so `<lastmod>` reflects the latest commit dates.

### `generate-project-jsonld` — refresh project-page JSON-LD

Walks every `projects/*.html` and injects (or replaces) a `<script type="application/ld+json">` block containing both a `BreadcrumbList` and an `Article` schema, sourced from the page's existing canonical URL, title, description, OG image and `<p class="project-detail__year">`.

```bash
npm run generate-project-jsonld
# or:
node scripts/generate-project-jsonld.mjs --dry-run
```

The block is wrapped in `<!-- generated:project-jsonld -->` markers so re-runs replace in place instead of appending duplicates. CI re-runs this before every deploy.

### `generate-csp-meta` — refresh Content-Security-Policy meta tags

Injects (or replaces) the CSP `<meta http-equiv="Content-Security-Policy">` tag on every indexable HTML page. `script-src` lists a per-page `'sha256-…'` hash for each inline `<script>` (JSON-LD + speculationrules) rather than `'unsafe-inline'`, so re-run this **after** any generator that touches inline scripts (`generate-project-jsonld`, `generate-cards`). Edit the policy in `cspFor()` and re-run; `test/csp.test.mjs` fails on drift.

```bash
npm run generate-csp-meta
# or:
node scripts/generate-csp-meta.mjs --dry-run
```

### `generate-analytics` — refresh the cookieless analytics pixel

Injects (or replaces) a **GoatCounter no-JS tracking pixel** on every indexable HTML page, wrapped in `<!-- generated:analytics -->` markers. It is a plain `<img>` to `https://stocastico.goatcounter.com/count` — **no external `<script>`, no cookies, no personal data** — so it only needs `img-src` loosened in the CSP (handled by `generate-csp-meta`). The recorded path (`p`) mirrors each page's canonical URL and the title (`t`) is taken from its `<title>`.

```bash
npm run generate-analytics
# or:
node scripts/generate-analytics.mjs --dry-run
```

View aggregate stats (pageviews, top pages, referrers, countries, browsers) at **https://stocastico.goatcounter.com**. `test/analytics.test.mjs` guards the pixel + its CSP origin on every page and fails on drift.

### `generate-favicons` — rasterise the favicon

Uses [sharp](https://sharp.pixelplumbing.com/) to rasterise `public/favicon.svg` into the PNG + ICO sizes browsers expect (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) plus full-bleed `maskable` variants (`icon-maskable-192.png`, `icon-maskable-512.png`) for Android adaptive icons.

```bash
npm run generate-favicons
```

Run only when the SVG source changes — the rasterised files are committed and reused otherwise.

### `set-domain` — migrate to a custom domain

The site origin lives in one place — `scripts/lib/site.json` — which the sitemap, project-JSON-LD and `new-project` generators read. `set-domain` flips it and rewrites the hardcoded origin (canonical, Open Graph, JSON-LD, sitemap, robots) across every static page in one step, then writes `public/CNAME` for GitHub Pages. The GitHub repository URL is deliberately left untouched.

```bash
npm run set-domain -- example.com
# accepts a bare domain or full URL:
npm run set-domain -- https://www.example.com
```

After running, refresh the generated files and verify:

```bash
npm run generate-sitemap
npm run generate-project-jsonld
npm test
```

### `dev` / `build` / `preview` — Vite

```bash
npm run dev        # local dev server with HMR
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
```

The build also copies `img/`, `data/*.json` and `docs/*.pdf` into `dist/` verbatim (via small Vite plugins in `vite.config.js`). These are referenced by absolute URL — `og:image`/`twitter:image`, runtime `fetch()` of the TopoJSON, and the CV/defence PDF links — so they are not part of the Rollup graph and Vite would otherwise drop them from the deploy.

GitHub Actions runs `npm test`, then `generate-sitemap`, then `generate-project-jsonld`, then `npm run build`, and finally publishes `dist/` on every push to `main` (see `.github/workflows/deploy.yml`).

---

## Data formats

Full YAML format reference is in **[docs/DATA-FORMATS.md](docs/DATA-FORMATS.md)**.

Quick summary:

- **`data/cv.yaml`** — career, education, and skills (each skill has a `level` 0–100 driving its CV bar). Edit then run `npm run generate-cv`.
- **`data/locations.yaml`** — globe pins (`lived` / `work` / `travel`), animated trip routes, and highlighted regions. Edit then run `npm run generate-locations`.
- **`data/countries.yaml`** — homepage world-map highlights (`lived` / `visited`); derived from `locations.yaml` on first run, then hand-editable. Edit then run `npm run generate-countries` and `npm run generate-world-map`.
- **`data/unesco.yaml`** — travel-page UNESCO accordion (continent → country → site, https-only links). Edit then run `npm run generate-unesco`.
- **`data/links.yaml`** — blogroll entries (name, https-only url, optional description, categories, tags). Edit then run `npm run generate-links`.
- **`data/palettes.yaml`** — named colour palettes (Forest & Brass, Mocha & Apricot, Crimson & Rust) plus an `active` key. Edit then run `npm run generate-theme`.
- **`data/projects.js`** — project card entries. Edit directly, or use `npm run new-project` to generate from Markdown.

---

## Adding a new project from Markdown

1. Write your project as a Markdown file with a YAML frontmatter block:

   ```markdown
   ---
   id:          my-project
   title:       "My Project Title"
   year:        "2024"
   tags:        "AI, CV, Python"
   bg:          "img/projects/my-bg.jpg"
   description: "Short 2–3 sentence summary shown on the homepage card."
   ---

   ## Overview

   Your content here. Supports **bold**, *italic*, `inline code`,
   [links](https://example.com), lists, fenced code blocks, and blockquotes.
   ```

2. Run the generator:

   ```bash
   node scripts/new-project.js path/to/my-project.md
   # or via npm:
   npm run new-project -- path/to/my-project.md
   ```

   This will:
   - Create `projects/<id>.html` from the template (with OG/Twitter tags, canonical, theme-color and the PWA manifest link already included)
   - Register the entry in `data/projects.js` so the card appears on the homepage (up to 4) and on `projects.html`

3. Refresh the per-page generators so the new page carries a CSP meta tag and the analytics pixel (the `seo` / `html-quality` / `analytics` tests gate this in CI):

   ```bash
   npm run generate-csp-meta
   npm run generate-analytics
   ```

4. Preview locally by opening `index.html` in a browser, then commit the generated files.

### Dry-run mode

```bash
node scripts/new-project.js path/to/my-project.md --dry-run
```

Prints the generated HTML and the `data/projects.js` entry without writing any files.

### Project frontmatter fields

| Field         | Type   | Required | Description                                          |
|---------------|--------|----------|------------------------------------------------------|
| `id`          | string | Yes      | Kebab-case identifier, used as filename              |
| `title`       | string | Yes      | Project title                                        |
| `year`        | string | Yes      | Year of the project, e.g. `"2024"`                   |
| `tags`        | string | Yes      | Comma-separated keyword badges, e.g. `"AI, CV"`      |
| `bg`          | string | Yes      | Card background + hero image on the detail page      |
| `description` | string | Yes      | Short summary shown on the homepage and listing card |
| `url`         | string | No       | Override the output URL path                         |

### Supported Markdown syntax

| Syntax | Output |
| -------- | -------- |
| `# H1` / `## H2` / `### H3` | `<h1>` / `<h2>` / `<h3>` |
| `**bold**` | `<strong>` |
| `*italic*` or `_italic_` | `<em>` |
| `` `inline code` `` | `<code>` |
| `[text](url)` | `<a>` |
| `- item` | `<ul><li>` |
| `1. item` | `<ol><li>` (blank lines between items are kept in one list) |
| `\| a \| b \|` + `\|---\|---\|` row | `<table>` with `<thead>` / `<tbody>` |
| ` ```lang … ``` ` | `<pre><code class="language-lang">` |
| `> quote` | `<blockquote>` |

---

## Updating the CV

Edit `data/cv.yaml`, then regenerate:

```bash
npm run generate-cv
```

The YAML file has three top-level sections — `career`, `education`, and `skills`. See [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md) for the complete field reference and examples.

### Validate without generating

```bash
node scripts/generate-cv.js --validate
```

Reports any structural errors (missing required fields, wrong types) and exits without writing output.

---

## Updating the globe

Edit `data/locations.yaml`, then regenerate:

```bash
npm run generate-locations
# or:
./scripts/update-locations.sh
# Windows PowerShell:
.\scripts\update-locations.ps1
```

The YAML file supports three kinds of content:

- **`pins`** — individual location markers (`lived` / `work` / `travel`)
- **`trips`** — animated round-trip routes drawn as Bézier curves
- **`regions`** — circular disc overlays for islands / countries

Missing coordinates are looked up automatically via the Nominatim API (one request per second) and cached in `.cache/locations-geocode-cache.json`. See [docs/DATA-FORMATS.md](docs/DATA-FORMATS.md) for the full field reference.

---

## Adding publications

Edit `data/publications.js` directly. Each entry:

```js
{
  year:     "2025",
  title:    "Paper title",
  authors:  "A. Author et al.",
  venue:    "Conference / Journal",
  url:      "https://doi.org/...",  // optional; omit to render a non-link entry
  featured: true                    // optional; surfaces it in the homepage section
}
```

Then run `npm run generate-cards` to refresh the static publication items baked
into `index.html` (featured subset) and `publications.html` (all). The
`generate-cards` test fails on drift, so committing without regenerating is
caught in CI.

---

## Site layout

### Navigation

The navbar contains: **About**, **Work** (the Research section), **Projects**, **Travel**, **Links**, and **Contact**. The CV is accessible via the command palette or by navigating directly to `cv.html`. On scroll, the navbar gains a frosted-glass background. The active section is tracked and highlighted automatically. A hamburger menu replaces the links on small viewports.

### Pages

| Page | Description |
| ------ | ------------- |
| `index.html` | Single-page application — Hero, About, Research, Skills, Publications, Projects, Places, Contact sections |
| `projects.html` | Dedicated projects listing page — all project cards from `data/projects.js` |
| `publications.html` | Full publication list — all papers from `data/publications.js` |
| `cv.html` | Dedicated CV page with a two-column layout: Work experience on the left, Education on the right. Skills are rendered as a tag cloud below. |
| `travel.html` | 3-D globe + 2-D Europe map + UNESCO World Heritage accordion |
| `links.html` | Curated, category-filterable blogroll from `data/links.yaml` |
| `404.html` | Custom 404 error page. |

### Sections (index.html)

| Section | Description |
| --------- | ------------- |
| Hero | Left-aligned layout with a palette-gradient name, animated tagline, hero CTAs |
| About | Photo + stats and bio text in a split layout |
| Research | Horizontal-scroll carousel of research topic cards with prominent scroll arrows; cards flip to a back face on click |
| Skills | Sticky-scroll section (Apple-style) — each skill category pins to the viewport as you scroll through it |
| Publications | Filterable list of papers, rendered from `data/publications.js` |
| Projects | Up to 3 project cards rendered from `data/projects.js`, with a "View all projects" link to `projects.html` |
| Places | Static inline-SVG world map of lived / visited countries; links to the travel page |
| Contact | 2×2 grid of contact cards; email address is obfuscated and revealed on click |

---

## Visual effects

The site uses several layers of real-time rendering, all progressive-enhancement: each effect degrades gracefully on low-power devices, and respects `prefers-reduced-motion`.

### Neural network (hero background)

A Three.js particle system of glowing nodes connected by dynamic line segments. Particles drift with random velocities and are attracted toward the mouse cursor. Lines are drawn between nearby pairs using additive blending and vertex-coloured `LineBasicMaterial`, creating the "glowing wire" look. On low-power devices the node count drops and line updates are frame-skipped. A Canvas2D fallback (`NeuralNetwork2D`) renders the same network without WebGL.

The module (and, through it, Three.js — ~130 KB gzipped) is **code-split and lazily imported on the first user interaction** (`mousemove` / `scroll` / `touchstart`), so it stays off the initial critical path; the noise gradient fills the hero until it loads. Hidden entirely under `prefers-reduced-motion`.

### Interactive 3-D globe (travel page)

A Three.js `Phong`-shaded sphere textured with satellite imagery, lit by a warm directional sun and a cyan rim light for branding consistency. On top of the base sphere:

- **Atmospheric shells**: two semi-transparent overlapping spheres simulate atmospheric haze.
- **Location pins**: cyan pulsing rings (home / work) and coral spikes (travel) rendered as `LineSegments` + `Mesh` geometries with staggered phase-offset animation.
- **Trip paths**: quadratic Bézier curves with a dual-layer glow (soft outer + bright core via additive blending) and an animated comet traveller with a fading particle trail.
- **Star field**: 1 400 randomly-distributed points in world space.
- **Grid lines**: latitude / longitude lines with the equator and tropics brightened.

Mouse dragging rotates the globe with inertia; auto-spin resumes when idle. Raycasting handles pin hover tooltips. A Canvas2D flat-map fallback is used when `prefers-reduced-motion` is set.

### Animated GLSL noise gradient (hero background)

A full-screen WebGL canvas sits behind the neural-network layer in the hero. Its fragment shader generates an organic, flowing colour field using **domain-warped fractional Brownian motion** (fbm-of-fbm): the input UV coordinates are first displaced by one fbm evaluation, then fed into a second, creating the folded, turbulent look characteristic of fluid simulations. The resulting scalar field drives a colour palette built from the active palette's `noise` stops (dark / mid / bright). To save battery, the gradient renders only 3 frames at startup and then stops — the last rendered frame persists as a static background.

### 3-D card tilt with specular gloss

Cards (research, project, contact, skill-group, publication) track the cursor position relative to their bounding box and apply a CSS `perspective` + `rotateX` / `rotateY` transform so the card physically tilts toward the cursor. A pseudo-element with a radial-gradient overlay moves to simulate a specular highlight — the "gloss" spot that travels across the surface as you move the mouse. The card's bounding rect is cached once per hover (read on `mouseenter`, not on every `mousemove`) to avoid layout thrashing. Transforms are spring-lerped (exponential decay toward the target value each frame) for organic, lag-free tracking. On pointer-leave the card springs back to flat. Disabled for `prefers-reduced-motion` and touch devices, and torn down on `pagehide` (bfcache-friendly).

### Click-to-flip research cards

Each research card is a keyboard-operable button (`role="button"`, `tabindex`, `aria-expanded`) that flips on click / Enter / Space to reveal a back face with extra links. The back face's links stay out of the tab order until the card is expanded.

### Scroll-driven effects

As the user scrolls, elements respond with transforms calculated from their position in the viewport:

- **Hero parallax**: the hero content translates at ~28 % of scroll speed, giving depth separation from the canvas background.
- **Section entrance animations**: elements with `data-animate` fade and slide in as they enter the viewport.
- **Research carousel**: cards enter with a `translateX` animation as they scroll into view.
- **Skills sticky scroll**: each skill category pins to the viewport while active, then scrolls away as the next one takes over.

All transforms are throttled to `requestAnimationFrame` and are disabled for `prefers-reduced-motion`.

### Homepage world map (Places teaser)

The home page's **Places** section shows a static inline-SVG world map: a silhouette of every country plus highlighted lived / visited countries. It is generated offline — `data/countries.yaml` → `generate-countries` → `data/countries.js`, then `generate-world-map` projects `data/countries-110m.json` into the `<!-- world-map:start … -->` SVG block in `index.html`. Fills use CSS `var(--pin-*)` classes, so a palette switch needs no regeneration. It links through to the full travel page.

### Interactive 2D Europe map (travel page)

A Canvas2D flat map of Europe rendered from `data/land-50m.json` (TopoJSON, 50m resolution for fine coastline detail). Country outlines are drawn with the palette's coast colour on a dark background, matching the globe's visual style. Location pins from `data/locations.js` are plotted as pulsing rings or spikes using the same pin types as the 3D globe (`lived` / `work` / `travel`). Hovering a pin shows a tooltip with the location name and trip name (for trip waypoints). The map is loaded from `js/europe-map.js` on the travel page.

### UNESCO World Heritage accordion (travel page)

A nested `<details>` disclosure tree (continent → country → site) built by `renderUnescoAccordion()` from `data/unesco.js`, gated on the travel page only. Source data lives in `data/unesco.yaml` (https-only links) → `generate-unesco`.

### Reading progress bar

A thin bar at the very top of the page fills from left to right as the user scrolls through the document. It is updated inside the existing scroll listener — no additional overhead.

---

## UI controls

### Command palette (⌘K / Ctrl+K)

Press **⌘K** (macOS) or **Ctrl+K** (Windows / Linux) from anywhere on the page to open a spotlight-style command palette. Available actions:

| Command | Action |
| --------- | -------- |
| About / Research / Skills / Publications / Projects / Places / Contact | Scroll to that section |
| CV | Navigate to `cv.html` |
| Links | Navigate to `links.html` |
| Open CV PDF | Open the CV PDF |
| Copy email address | Copy email address to clipboard |
| LinkedIn profile | Open LinkedIn profile |
| Google Scholar | Open Google Scholar profile |

Type to filter commands. Press **Enter** to run the selected command, **Escape** to close.

### Back-to-top button

A floating button appears in the bottom-right corner once the user has scrolled past one viewport height. Clicking it smooth-scrolls back to the top.

---

## Performance notes

Several optimisations were made to keep the page fast on low-power and mobile devices:

| Change | Impact |
| -------- | -------- |
| Three.js neural-net lazily imported on first interaction | Keeps the ~130 KB Three.js chunk off the initial critical path |
| Globe / Europe map built only when their canvas nears the viewport | Defers Three.js + the 545 KB TopoJSON fetch until the user scrolls there |
| Homepage world map is a static inline SVG | No runtime projection or TopoJSON fetch on the home page |
| NoiseGradient renders 3 frames then stops | Eliminates continuous GPU draw for the hero background |
| Cursor glow removed; hero orbs removed | Removes per-frame radial-gradient draws and large blurred animated elements |
| Card-tilt rect cached per hover | Removes a layout read on every `mousemove` |
| Animated favicon replaced with static render | Removes per-frame Canvas2D draw in the background tab |
| All WebGL/Canvas instances + pointer listeners torn down on `pagehide` | Releases GL contexts and avoids leaks on bfcache eviction |

---

## Session start hook

A `.claude/hooks/session-start.sh` hook verifies Node.js is available at the start of every Claude Code web session. Tests can be run immediately without any manual setup.

Outstanding tasks and audit findings live in [`TODO.md`](TODO.md).
