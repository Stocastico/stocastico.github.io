# stocastico.github.io

Personal website of **Stefano Masneri** — Senior AI Engineer based in San Sebastián, Spain — hosted at [stocastico.github.io](https://stocastico.github.io/).

## About this site

A single-page portfolio that doubles as a small showcase of real-time WebGL effects. The content is organised across four pages:

- **`index.html`** — the main page, with the following sections:
  - **Hero** — animated name rendered through a custom GLSL iridescence shader, layered over a domain-warped noise gradient and a Three.js neural-network particle field.
  - **About** — short bio, key stats, and a split layout featuring an interactive 3-D globe (Three.js) and an interactive 2-D Canvas map of Europe. Both visualise the same set of "lived / work / travel" pins, animated trip routes, and highlighted regions.
  - **Research** — horizontal-scroll carousel of research topics (computer vision, AR, video understanding, generative AI, etc.).
  - **Publications** — filterable list of selected papers, generated from `data/publications.js`.
  - **Skills** — Apple-style sticky-scroll section where each skill category pins to the viewport in turn.
  - **Projects** — up to three project cards from `data/projects.js`, with a link to the full listing.
  - **Contact** — 2 × 2 grid of contact cards; the email address is base64-encoded and revealed on click.
- **`projects.html`** — full project listing, with one detail page per project under `projects/`.
- **`cv.html`** — two-column CV (work experience / education) plus a skills tag cloud, generated from `data/cv.yaml`.
- **`404.html`** — custom not-found page with the standard navbar.

Site-wide UX touches include a ⌘K / Ctrl-K command palette, side-dot section navigation, a reading-progress bar, magnetic buttons, 3-D tilt-and-gloss cards, a back-to-top button, and full `prefers-reduced-motion` support throughout.

## Tech stack

- Vanilla HTML / CSS / JavaScript bundled by [Vite](https://vitejs.dev/) (multi-page input, no framework)
- [Three.js](https://threejs.org/) (single runtime dependency, bundled by Vite) for the 3-D neural-network background and interactive globe
- Raw WebGL (GLSL) for the hero name iridescence shader and noise-gradient hero background
- Centralised theme system — one YAML palette drives every colour across CSS, the WebGL/Canvas modules, the GLSL shaders, and the favicon (`npm run generate-theme`)
- Node.js ≥ 18 for scripts and tests (built-in test runner, no extra test dependencies)
- [Playwright](https://playwright.dev/) and [sharp](https://sharp.pixelplumbing.com/) as dev dependencies (E2E tests + favicon rasterisation)
- Self-hosted fonts: Inter (body) and Playfair Display (display / hero)

## Project structure

```text
.
├── index.html                 Main single-page site
├── projects.html              Dedicated projects listing page
├── cv.html                    Dedicated CV page (two-column: work | education)
├── 404.html                   Custom 404 page
├── css/
│   └── styles.css             All styles, including shared project-page rules
├── vite.config.js             Multi-page Vite config (index, projects, cv, 404, project pages)
├── js/
│   ├── main.js                ESM entry — orchestrates DOMContentLoaded init
│   ├── three-context.js       Shared THREE binding + test mocking hook
│   ├── utils.js               isLowPowerDevice, prefersReducedMotion, hasWebGLSupport
│   ├── neural-net.js          NeuralNetwork (Three.js) + Canvas2D fallback
│   ├── hero-shader.js         HeroNameShader (raw WebGL iridescent text)
│   ├── globe.js               Globe3D + GlobeFallback2D + geocodeLocations
│   ├── animations.js          Scroll reveal, card tilt, magnetic buttons, parallax
│   ├── europe-map.js          Interactive 2D Canvas map of Europe
│   └── theme.js               Generated — active palette (hex/int/glvec) + helpers (do not edit manually)
├── data/
│   ├── cv.yaml                Source of truth for CV — edit this, then run generate-cv
│   ├── cv.js                  Generated CV data (do not edit manually)
│   ├── projects.js            PROJECTS array — edit to add/update project cards
│   ├── publications.js        PUBLICATIONS array — edit to add/update papers
│   ├── locations.yaml         Source of truth for globe pins/trips/regions
│   ├── locations.js           Generated file (do not edit manually)
│   ├── palettes.yaml          Source of truth for the colour palette — edit then run generate-theme
│   ├── world-110m.json        TopoJSON world map data (110m resolution)
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
│   ├── sitemap.xml            Generated sitemap (copied verbatim into dist/)
│   └── robots.txt             SEO robot rules
├── scripts/
│   ├── new-project.js               Convert a Markdown draft → project HTML + update projects.js
│   ├── generate-cv.js               Build data/cv.js from data/cv.yaml
│   ├── generate-locations.js        Generate data/locations.js from data/locations.yaml
│   ├── generate-theme.js            Propagate data/palettes.yaml across CSS, js/theme.js, HTML + favicon
│   ├── generate-sitemap.mjs         Rebuild public/sitemap.xml from projects.js + git mtimes
│   ├── generate-project-jsonld.mjs  Inject/refresh BreadcrumbList + Article JSON-LD on every projects/*.html
│   ├── generate-csp-meta.mjs        Inject/refresh the CSP meta tag on every HTML page
│   ├── generate-favicons.mjs        Rasterise public/favicon.svg → ico + apple-touch + 192/512 PNGs (uses sharp)
│   ├── update-locations.sh          Convenience wrapper for generate-locations.js
│   ├── update-locations.ps1         PowerShell wrapper for generate-locations.js
│   └── lib/
│       └── yaml.js                  Minimal YAML parser (no external dependencies)
├── test/
│   ├── main.node.test.mjs          Tests for js/main.js
│   ├── cv.test.mjs                 Tests for CV rendering
│   ├── europe-map.test.mjs         Tests for js/europe-map.js
│   ├── generate-cv.test.js         Tests for scripts/generate-cv.js
│   ├── generate-theme.test.js      Tests for scripts/generate-theme.js
│   ├── locations-generator.test.js Tests for scripts/generate-locations.js
│   ├── new-project.test.js         Tests for scripts/new-project.js
│   ├── seo.test.js                 SEO regression tests (meta description, JSON-LD, stat counters)
│   ├── sitemap.test.mjs            Regression tests for the generated sitemap.xml
│   ├── project-jsonld.test.mjs     Regression tests for BreadcrumbList + Article JSON-LD on project pages
│   ├── html-quality.test.mjs       html-validate / a11y regression checks on every HTML page
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
npm test                       # run all tests
npm run test:main              # js/main.js tests only
npm run test:cv                # CV rendering tests only
npm run test:generate-cv       # generate-cv.js tests only
npm run test:generate-theme    # generate-theme.js tests only
npm run test:locations         # locations generator tests only
npm run test:project           # new-project.js tests only
npm run test:seo               # SEO regression tests only
npm run test:sitemap           # sitemap.xml regression tests only
npm run test:project-jsonld    # project-page JSON-LD regression tests only
npm run test:html-quality      # html-validate / a11y checks only
# europe-map.test.mjs is included in `npm test` but has no dedicated shorthand
```

The Playwright suites (`playwright.ui.test.mjs`, `playwright.iphone.test.mjs`) are not wired into `npm test` — run them manually with `npx playwright test test/playwright.ui.test.mjs` once the dev server is up.

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

### `generate-theme` — apply a colour palette site-wide

Reads `data/palettes.yaml`, takes the `active` palette, and regenerates every place a colour is baked in — in one pass:

- the `:root` colour block in `css/styles.css` (between the `@theme-generated` markers)
- `js/theme.js` — the ESM module the WebGL / Canvas2D modules and GLSL shaders import
- `<meta theme-color>`, the inline data-URI favicon, and the nav-logo gradient in every `*.html` page + the `scripts/new-project.js` template
- `public/favicon.svg`

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

Injects (or replaces) the CSP `<meta http-equiv="Content-Security-Policy">` tag on every indexable HTML page. Edit the policy constant at the top of the script and re-run.

```bash
npm run generate-csp-meta
# or:
node scripts/generate-csp-meta.mjs --dry-run
```

### `generate-favicons` — rasterise the favicon

Uses [sharp](https://sharp.pixelplumbing.com/) to rasterise `public/favicon.svg` into the PNG + ICO sizes browsers expect (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`).

```bash
npm run generate-favicons
```

Run only when the SVG source changes — the rasterised files are committed and reused otherwise.

### `dev` / `build` / `preview` — Vite

```bash
npm run dev        # local dev server with HMR
npm run build      # production build → dist/
npm run preview    # serve dist/ locally
```

GitHub Actions runs `npm test`, then `generate-sitemap`, then `generate-project-jsonld`, then `npm run build`, and finally publishes `dist/` on every push to `main` (see `.github/workflows/deploy.yml`).

---

## Data formats

Full YAML format reference is in **[docs/DATA-FORMATS.md](docs/DATA-FORMATS.md)**.

Quick summary:

- **`data/cv.yaml`** — career, education, and skills. Edit then run `npm run generate-cv`.
- **`data/locations.yaml`** — globe pins (`lived` / `work` / `travel`), animated trip routes, and highlighted regions. Edit then run `npm run generate-locations`.
- **`data/palettes.yaml`** — named colour palettes plus an `active` key. Edit then run `npm run generate-theme`.
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
   - Create `projects/<id>.html` from the template (with OG tags, canonical, and syntax highlighting already included)
   - Register the entry in `data/projects.js` so the card appears on the homepage (up to 4) and on `projects.html`

3. Preview locally by opening `index.html` in a browser, then commit both generated files.

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
| `1. item` | `<ol><li>` |
| ` ```lang … ``` ` | `<pre><code class="language-lang">` (syntax-highlighted by highlight.js) |
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
  year:    "2025",
  title:   "Paper title",
  authors: "A. Author et al.",
  venue:   "Conference / Journal",
  url:     "https://doi.org/..."   // omit to suppress link
}
```

---

## Site layout

### Navigation

The navbar contains three items: **About**, **Projects**, and **Contact**. The CV is accessible via the command palette or by navigating directly to `cv.html`. On scroll, the navbar gains a frosted-glass background. The active section is tracked and highlighted automatically.

### Pages

| Page | Description |
| ------ | ------------- |
| `index.html` | Single-page application — Hero, About, Research, Skills, Publications, Projects, Contact sections |
| `projects.html` | Dedicated projects listing page — all project cards from `data/projects.js` |
| `cv.html` | Dedicated CV page with a two-column layout: Work experience on the left, Education on the right. Skills are rendered as a tag cloud below. |
| `404.html` | Custom 404 error page. |

### Sections (index.html)

| Section | Description |
| --------- | ------------- |
| Hero | Left-aligned layout with iridescent name shader, animated tagline, hero CTAs |
| About | Photo + stats and bio text in a split layout; the interactive Europe 2D map spans full-width below; the 3-D globe fills the right half of the split |
| Research | Horizontal-scroll carousel of research topic cards with prominent scroll arrows |
| Publications | Filterable list of papers, rendered from `data/publications.js` |
| Skills | Sticky-scroll section (Apple-style) — each skill category pins to the viewport as you scroll through it |
| Projects | Up to 3 project cards rendered from `data/projects.js`, with a "View all projects" link to `projects.html` |
| Contact | 2×2 grid of contact cards; email address is obfuscated and revealed on click |

---

## Visual effects

The site uses several layers of real-time rendering, all progressive-enhancement: each effect degrades gracefully on low-power devices, and respects `prefers-reduced-motion`.

### Neural network (hero background)

A Three.js particle system of ~120 glowing nodes connected by dynamic line segments. Particles drift with random velocities and are attracted toward the mouse cursor within a 220 px radius. Lines are drawn between every pair within 170 px using additive blending and vertex-coloured `LineBasicMaterial`, creating the "glowing wire" look. On low-power devices the count drops to 84 nodes and line updates are frame-skipped. A Canvas2D fallback renders the same network without WebGL.

### Interactive 3-D globe (About section)

A Three.js `Phong`-shaded sphere textured with satellite imagery, lit by a warm directional sun and a cyan rim light for branding consistency. On top of the base sphere:

- **Atmospheric shells**: two semi-transparent overlapping spheres simulate atmospheric haze.
- **Location pins**: cyan pulsing rings (home / work) and coral spikes (travel) rendered as `LineSegments` + `Mesh` geometries with staggered phase-offset animation.
- **Trip paths**: quadratic Bézier curves with a dual-layer glow (soft outer + bright core via additive blending) and an animated comet traveller with a fading particle trail.
- **Star field**: 1 400 randomly-distributed points in world space.
- **Grid lines**: latitude / longitude lines with the equator and tropics brightened.

Mouse dragging rotates the globe with inertia; auto-spin resumes when idle. Raycasting handles pin hover tooltips. A Canvas2D flat-map fallback is used when `prefers-reduced-motion` is set.

### Hero name iridescence shader

The "Stefano / Masneri" heading is rendered by a raw GLSL fragment shader layered over the accessible `<h1>`. The shader:

1. Rasterises the text into an alpha-only WebGL texture each frame using `Canvas2D`.
2. Applies **fractional Brownian motion** (three octaves of value noise drifting at different speeds) to compute a per-pixel UV displacement.
3. Samples the red, green, and blue channels at slightly different offsets to produce **chromatic aberration** (colour fringing).
4. Applies **mouse-repulsion warping**: the distortion field bends away from the cursor using inverse-square falloff, so moving the mouse visibly deforms the text.
5. Computes an **iridescent colour sweep** — a cosine-based RGB palette with phase offsets, blended with a bright blue-white bias to give a glass / crystal appearance.

FPS is capped at 30 fps (20 fps on low-power devices) to conserve battery.

### Animated GLSL noise gradient (hero background)

A full-screen WebGL canvas sits behind the neural-network layer in the hero. Its fragment shader generates an organic, flowing colour field using **domain-warped fractional Brownian motion** (fbm-of-fbm): the input UV coordinates are first displaced by one fbm evaluation, then fed into a second, creating the folded, turbulent look characteristic of fluid simulations. The resulting scalar field drives a colour palette that cycles between the site's accent colours (indigo-violet `#6c63ff`, cyan `#00d4ff`) and deep black. To save battery, the gradient renders only 3 frames at startup and then stops — the last rendered frame persists as a static background.

### 3-D card tilt with specular gloss

Cards (research, blog, contact, publication) track the cursor position relative to their bounding box and apply a CSS `perspective` + `rotateX` / `rotateY` transform so the card physically tilts toward the cursor. A pseudo-element with a radial-gradient overlay moves to simulate a specular highlight — the "gloss" spot that travels across the surface as you move the mouse. Transforms are spring-lerped (exponential decay toward the target value each frame) for organic, lag-free tracking. On pointer-leave the card springs back to flat. Disabled for `prefers-reduced-motion` and touch devices.

### Magnetic button pull

Interactive buttons (hero CTAs, social links, contact cards) exert a magnetic attraction on the cursor when it enters a configurable proximity radius (~80 px). The button translates toward the cursor by a fraction of the cursor-to-centre offset, producing the feeling that the button is trying to "catch" the pointer. The translation is spring-lerped so motion is smooth and natural. On leave, the button spring-snaps back to its resting position.

### Scroll-driven effects

As the user scrolls, elements respond with transforms calculated from their position in the viewport:

- **Hero parallax**: the hero content translates at ~28 % of scroll speed, giving depth separation from the canvas background.
- **Section entrance animations**: elements with `data-animate` fade and slide in as they enter the viewport.
- **Research carousel**: cards enter with a `translateX` animation as they scroll into view.
- **Skills sticky scroll**: each skill category pins to the viewport while active, then scrolls away as the next one takes over.

All transforms are throttled to `requestAnimationFrame` and are disabled for `prefers-reduced-motion`.

### Interactive 2D Europe map (About section)

A Canvas2D flat map of Europe rendered from `data/land-50m.json` (TopoJSON, 50m resolution for fine coastline detail). Country outlines are drawn with a neon cyan stroke on a dark background, matching the globe's visual style. Location pins from `data/locations.js` are plotted as pulsing rings or spikes using the same pin types as the 3D globe (`lived` / `work` / `travel`). Hovering a pin shows a tooltip with the location name and trip name (for trip waypoints). The map is loaded from `js/europe-map.js` and displayed full-width below the split layout in the About section.

### Reading progress bar

A thin bar at the very top of the page fills from left to right as the user scrolls through the document. It is updated inside the existing scroll listener — no additional overhead.

---

## UI controls

### Command palette (⌘K / Ctrl+K)

Press **⌘K** (macOS) or **Ctrl+K** (Windows / Linux) from anywhere on the page to open a spotlight-style command palette. Available actions:

| Command | Action |
| --------- | -------- |
| About | Scroll to About section |
| Research | Scroll to Research section |
| Skills | Scroll to Skills section |
| Projects | Scroll to Projects section |
| Contact | Scroll to Contact section |
| CV | Navigate to `cv.html` |
| Copy email | Copy email address to clipboard |
| GitHub | Open GitHub profile |
| LinkedIn | Open LinkedIn profile |

Type to filter commands. Press **Enter** to run the selected command, **Escape** to close.

### Side-dot navigation

A vertical row of small dots on the right edge of the viewport indicates the current section and lets the user jump directly to any section by clicking. Each dot is labelled with the section name via a tooltip that appears on hover.

### Back-to-top button

A floating button appears in the bottom-right corner once the user has scrolled past one viewport height. Clicking it smooth-scrolls back to the top.

---

## Performance notes

Several optimisations were made to keep the page fast on low-power and mobile devices:

| Change | Impact |
| -------- | -------- |
| NoiseGradient renders 3 frames then stops | Eliminates continuous GPU draw for the hero background |
| Cursor glow removed | Removes the per-frame radial gradient draw on the overlay canvas |
| Hero orbs are static (no animation) | Eliminates CSS animation on large blurred elements |
| HeroNameShader FPS capped at 30/20 | Halves GPU work on mid/low-power devices |
| Animated favicon replaced with static render | Removes per-frame Canvas2D draw in the background tab |
| Orb blur reduced from 100 px to 40 px | Reduces GPU rasterisation cost |

---

## Session start hook

A `.claude/hooks/session-start.sh` hook verifies Node.js is available at the start of every Claude Code web session. Tests can be run immediately without any manual setup.

Outstanding tasks and audit findings live in [`TODO.md`](TODO.md).
