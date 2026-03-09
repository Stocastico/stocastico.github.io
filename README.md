# stocastico.github.io

Personal website of **Stefano Masneri** — Senior AI Engineer specialising in Machine Learning, Computer Vision, and Augmented Reality.

## Tech stack

- Pure HTML / CSS / JavaScript — no build step, no bundler
- [Three.js](https://threejs.org/) (CDN) for the 3-D neural-network background and interactive globe
- Raw WebGL (GLSL) for the hero name iridescence shader and noise-gradient hero background
- Node.js ≥ 18 for scripts and tests (built-in test runner, no extra dependencies)

## Project structure

```
.
├── index.html                 Main single-page site
├── cv.html                    Dedicated CV page (two-column: work | education)
├── css/
│   └── styles.css             All styles, including shared blog-post rules
├── js/
│   ├── main.js                Three.js animations, UI init, renderBlog/Publications
│   ├── main.min.js            Minified production build (auto-generated)
│   └── locations.js           Globe geocoding helper (browser)
├── data/
│   ├── cv.yaml                Source of truth for CV — edit this, then run generate-cv
│   ├── cv.js                  Generated CV data (do not edit manually)
│   ├── blog.js                BLOG_POSTS array — edit to add/update posts
│   ├── publications.js        PUBLICATIONS array — edit to add/update papers
│   ├── locations.yaml         Source of truth for globe pins/trips/regions
│   └── locations.js           Generated file (do not edit manually)
├── blog/
│   └── *.html                 Individual blog post pages
├── scripts/
│   ├── new-post.js            Convert a Markdown file → blog post HTML + update blog.js
│   ├── generate-cv.js         Build data/cv.js from data/cv.yaml
│   ├── generate-locations.js  Generate data/locations.js from data/locations.yaml
│   ├── generate-rss.js        Generate rss.xml from data/blog.js
│   ├── generate-sitemap.js    Generate sitemap.xml from data/blog.js + static pages
│   ├── update-locations.sh    Convenience wrapper for generate-locations.js
│   └── lib/
│       └── yaml.js            Minimal YAML parser (no external dependencies)
├── test/
│   ├── main.node.test.js           Tests for js/main.js
│   ├── cv.test.js                  Tests for CV rendering
│   ├── generate-cv.test.js         Tests for scripts/generate-cv.js
│   ├── locations-generator.test.js Tests for scripts/generate-locations.js
│   ├── new-post.test.js            Tests for scripts/new-post.js
│   ├── generate-rss.test.js        Tests for scripts/generate-rss.js
│   ├── generate-sitemap.test.js    Tests for scripts/generate-sitemap.js
│   ├── globe.test.html             Interactive globe visualisation tests
│   └── playwright.ui.test.mjs      End-to-end UI tests (Playwright)
├── .cache/
│   └── locations-geocode-cache.json  Geocoding cache (auto-created, do not commit)
├── rss.xml                    Generated RSS feed
├── sitemap.xml                Generated sitemap
├── robots.txt                 SEO robot rules
└── package.json               npm scripts (no runtime dependencies)
```

---

## Running tests

```bash
npm test                       # run all tests
npm run test:main              # js/main.js tests only
npm run test:cv                # CV rendering tests only
npm run test:generate-cv       # generate-cv.js tests only
npm run test:locations         # locations generator tests only
npm run test:post              # new-post.js tests only
npm run test:rss               # generate-rss.js tests only
npm run test:sitemap           # generate-sitemap.js tests only
```

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
# or directly:
node scripts/generate-locations.js

# Options:
node scripts/generate-locations.js --input data/locations.yaml --output data/locations.js
node scripts/generate-locations.js --cache .cache/my-cache.json
node scripts/generate-locations.js --no-geocode   # fail if coordinates missing
node scripts/generate-locations.js --help
```

Geocoding results are cached in `.cache/locations-geocode-cache.json` so subsequent runs do not re-query the API. The Nominatim API has a 1-request-per-second rate limit; the script respects this automatically.

### `new-post` — create a blog post from Markdown

Converts a Markdown file to a styled `blog/<slug>.html` and prepends the entry to `data/blog.js`.

```bash
npm run new-post -- path/to/my-post.md
# or directly:
node scripts/new-post.js path/to/my-post.md

# Options:
node scripts/new-post.js post.md --out-dir blog/
node scripts/new-post.js post.md --dry-run    # preview without writing
node scripts/new-post.js --help
```

### `generate-rss` — rebuild RSS feed

Reads `data/blog.js` and writes `rss.xml`.

```bash
npm run generate-rss
# Options:
node scripts/generate-rss.js --base-url https://yourdomain.com
node scripts/generate-rss.js --output dist/rss.xml
node scripts/generate-rss.js --dry-run
```

### `generate-sitemap` — rebuild sitemap

Reads `data/blog.js` and writes `sitemap.xml`. External post URLs are skipped automatically.

```bash
npm run generate-sitemap
# Options:
node scripts/generate-sitemap.js --base-url https://yourdomain.com
node scripts/generate-sitemap.js --dry-run
```

### `minify` — minify JavaScript for production

```bash
npm run minify
```

Runs `terser` on `js/main.js` → `js/main.min.js` with `--compress --mangle`. See [DEPLOYMENT.md](DEPLOYMENT.md) for how to switch the HTML to use the minified file.

---

## Data formats

Full YAML format reference is in **[DATA-FORMATS.md](DATA-FORMATS.md)**.

Quick summary:

- **`data/cv.yaml`** — career, education, and skills. Edit then run `npm run generate-cv`.
- **`data/locations.yaml`** — globe pins (`lived` / `work` / `travel`), animated trip routes, and highlighted regions. Edit then run `npm run generate-locations`.

---

## Adding a new blog post from Markdown

1. Write your post as a Markdown file with a YAML frontmatter block:

   ```markdown
   ---
   title:   "My Post Title"
   date:    "2025-03-01"
   excerpt: "One-sentence summary shown on the blog index."
   tag:     "Research"
   readMin: 6
   lead:    "Optional opening sentence in large type."
   ---

   ## Introduction

   Your content here. Supports **bold**, *italic*, `inline code`,
   [links](https://example.com), lists, fenced code blocks, and blockquotes.
   ```

2. Run the generator:

   ```bash
   node scripts/new-post.js path/to/my-post.md
   # or via npm:
   npm run new-post -- path/to/my-post.md
   ```

   This will:
   - Create `blog/<slug>.html` from the template (with OG tags, canonical, reading progress bar, theme toggle, and syntax highlighting already included)
   - Prepend the new entry to `data/blog.js` so the card appears automatically on the homepage

3. Preview locally by opening `index.html` in a browser, then commit both generated files.

### Dry-run mode

```bash
node scripts/new-post.js path/to/my-post.md --dry-run
```

Prints the generated HTML and the `data/blog.js` entry without writing any files.

### Blog post frontmatter fields

| Field     | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `title`   | string | Yes      | Post title |
| `date`    | string | Yes      | ISO date, e.g. `"2025-03-01"` |
| `excerpt` | string | Yes      | Short summary shown on the index card |
| `tag`     | string | No       | Badge label, e.g. `"Research"`, `"Engineering"`, `"AI"` |
| `readMin` | number | No       | Estimated read time in minutes |
| `lead`    | string | No       | Opening sentence displayed in large type |
| `url`     | string | No       | Override the output filename / URL path |

### Supported Markdown syntax

| Syntax | Output |
|--------|--------|
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

The YAML file has three top-level sections — `career`, `education`, and `skills`. See [DATA-FORMATS.md](DATA-FORMATS.md) for the complete field reference and examples.

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
```

The YAML file supports three kinds of content:

- **`pins`** — individual location markers (`lived` / `work` / `travel`)
- **`trips`** — animated round-trip routes drawn as Bézier curves
- **`regions`** — circular disc overlays for islands / countries

Missing coordinates are looked up automatically via the Nominatim API (one request per second) and cached in `.cache/locations-geocode-cache.json`. See [DATA-FORMATS.md](DATA-FORMATS.md) for the full field reference.

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

## Generating the RSS feed and sitemap

```bash
npm run generate-rss        # → rss.xml  (all blog posts)
npm run generate-sitemap    # → sitemap.xml  (homepage + all blog posts)

# Preview without writing files:
npm run generate-rss -- --dry-run
npm run generate-sitemap -- --dry-run

# Custom output path or base URL:
npm run generate-rss -- -o dist/rss.xml --base-url https://mysite.com
```

Both scripts read `data/blog.js` at runtime and skip external post URLs in the sitemap.

---

## Site layout

### Navigation

The navbar contains four items: **About**, **Research** (linked from hero), **Writing** (blog), and **Contact**. The CV is accessible via the command palette or by navigating directly to `cv.html`. On scroll, the navbar gains a frosted-glass background. The active section is tracked and highlighted automatically.

### Pages

| Page | Description |
|------|-------------|
| `index.html` | Single-page application — Hero, About, Research, Publications, Skills, Contact, Blog sections |
| `cv.html` | Dedicated CV page with a two-column layout: Work experience on the left, Education on the right. Skills are rendered as a tag cloud below. |

### Sections (index.html)

| Section | Description |
|---------|-------------|
| Hero | Left-aligned layout with iridescent name shader, animated tagline, hero CTAs |
| About | Asymmetric layout — photo + stats on the left, bio text on the right; interactive 3-D globe fills the right half |
| Research | Horizontal-scroll carousel of research topic cards (Stripe-style) |
| Publications | Filterable list of papers, rendered from `data/publications.js` |
| Skills | Sticky-scroll section (Apple-style) — each skill category pins to the viewport as you scroll through it |
| Contact | Contact cards with social links |
| Blog | Post cards rendered from `data/blog.js` |

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

### Reading progress bar

A thin bar at the very top of the page fills from left to right as the user scrolls through the document. It is updated inside the existing scroll listener — no additional overhead.

---

## UI controls

### Command palette (⌘K / Ctrl+K)

Press **⌘K** (macOS) or **Ctrl+K** (Windows / Linux) from anywhere on the page to open a spotlight-style command palette. Available actions:

| Command | Action |
|---------|--------|
| About | Scroll to About section |
| Research | Scroll to Research section |
| Skills | Scroll to Skills section |
| Contact | Scroll to Contact section |
| CV | Navigate to `cv.html` |
| Writing | Scroll to Blog section |
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
|--------|--------|
| NoiseGradient renders 3 frames then stops | Eliminates continuous GPU draw for the hero background |
| Cursor glow removed | Removes the per-frame radial gradient draw on the overlay canvas |
| Hero orbs are static (no animation) | Eliminates CSS animation on large blurred elements |
| HeroNameShader FPS capped at 30/20 | Halves GPU work on mid/low-power devices |
| Animated favicon replaced with static render | Removes per-frame Canvas2D draw in the background tab |
| Orb blur reduced from 100 px to 40 px | Reduces GPU rasterisation cost |

---

## Session start hook

A `.claude/hooks/session-start.sh` hook verifies Node.js is available at the start of every Claude Code web session. Tests can be run immediately without any manual setup.
