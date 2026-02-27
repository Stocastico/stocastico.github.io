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
├── css/
│   └── styles.css             All styles, including shared blog-post rules
├── js/
│   ├── main.js                Three.js animations, UI init, renderBlog/Publications
│   └── locations.js           Globe geocoding helper (browser)
├── data/
│   ├── blog.js                BLOG_POSTS array — edit to add/update posts
│   ├── publications.js        PUBLICATIONS array — edit to add/update papers
│   ├── locations.yaml         Source of truth for globe pins/trips/regions
│   └── locations.js           Generated file (do not edit manually)
├── blog/
│   └── *.html                 Individual blog post pages
├── scripts/
│   ├── new-post.js            Convert a Markdown file → blog post HTML + update blog.js
│   ├── generate-locations.js  Generate data/locations.js from data/locations.yaml
│   ├── generate-rss.js        Generate rss.xml from data/blog.js
│   ├── generate-sitemap.js    Generate sitemap.xml from data/blog.js + static pages
│   └── update-locations.sh    Convenience wrapper for generate-locations.js
├── test/
│   ├── main.node.test.js           Tests for js/main.js
│   ├── locations-generator.test.js Tests for scripts/generate-locations.js
│   ├── new-post.test.js            Tests for scripts/new-post.js
│   ├── generate-rss.test.js        Tests for scripts/generate-rss.js
│   └── generate-sitemap.test.js    Tests for scripts/generate-sitemap.js
└── package.json               npm scripts (no runtime dependencies)
```

## Running tests

```bash
npm test                  # run all tests
npm run test:main         # js/main.js tests only
npm run test:locations    # locations generator tests only
npm run test:post         # new-post.js tests only
npm run test:rss          # generate-rss.js tests only
npm run test:sitemap      # generate-sitemap.js tests only
```

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

### 3-D card tilt with specular gloss

Cards (research, blog, contact, publication) track the cursor position relative to their bounding box and apply a CSS `perspective` + `rotateX` / `rotateY` transform so the card physically tilts toward the cursor. A pseudo-element with a radial-gradient overlay moves to simulate a specular highlight — the "gloss" spot that travels across the surface as you move the mouse. Transforms are spring-lerped (exponential decay toward the target value each frame) for organic, lag-free tracking. On pointer-leave the card springs back to flat. Disabled for `prefers-reduced-motion` and touch devices.

**Why it matters**: even a subtle ±12 ° tilt makes every card feel like a physical object rather than a flat rectangle. Combined with the gloss, it creates the impression of depth and material — a significant perceived-quality jump for zero GPU cost.

### Magnetic button pull

Interactive buttons (hero CTAs, social links, contact cards) exert a magnetic attraction on the cursor when it enters a configurable proximity radius (~80 px). The button translates toward the cursor by a fraction of the cursor-to-centre offset, producing the feeling that the button is trying to "catch" the pointer. The translation is spring-lerped so motion is smooth and natural. On leave, the button spring-snaps back to its resting position.

**Why it matters**: magnetic pull elevates buttons from passive targets to active, haptic-feeling elements. It telegraphs interactivity without animation, and the spring-back on leave provides satisfying physical feedback.

### Animated GLSL noise gradient (hero background)

A second full-screen WebGL canvas sits behind the neural-network layer in the hero. Its fragment shader generates an organic, flowing colour field using **domain-warped fractional Brownian motion** (fbm-of-fbm): the input UV coordinates are first displaced by one fbm evaluation, then fed into a second, creating the folded, turbulent look characteristic of fluid simulations. The resulting scalar field drives a colour palette that cycles smoothly between the site's accent colours (indigo-violet `#6c63ff`, cyan `#00d4ff`) and deep black, so the gradient always feels on-brand. Time evolves slowly (~0.06 units/second) to keep motion calm rather than distracting.

**Why it matters**: the noise gradient makes the hero feel alive even before any interaction — it is the ambient "breathing" of the page. It replaces the plain black background behind the particles and gives the section a distinctive, painterly quality that is hard to achieve with CSS gradients.

### Scroll-driven 3-D transforms

As the user scrolls, elements respond with perspective-correct 3-D transforms calculated from their position in the viewport:

- **Research cards**: each card starts with a `rotateY(18 deg)` slant toward the centre and straightens to 0 ° as it enters the viewport, creating a "deck of cards fanning open" effect.
- **Section titles**: translate along a subtle Z-axis parallax so headings appear to float at a different depth than the cards beneath them.
- **Hero parallax**: the hero name and tagline move at 40 % of scroll speed, giving a depth separation between the text and the canvas behind it.
- **Globe section**: the globe container gets a slight `rotateX` tilt based on scroll position so it appears to pivot toward the viewer.

All transforms are throttled to `requestAnimationFrame`, use `will-change: transform` on participating elements, and are disabled for `prefers-reduced-motion`.

**Why it matters**: scroll-driven 3-D replaces the generic "fade-up on enter" pattern with spatial storytelling — the page feels like a 3-D environment being explored rather than a document being read.

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

## Updating the globe

Edit `data/locations.yaml`, then regenerate:

```bash
npm run generate-locations
# or:
./scripts/update-locations.sh
```

Missing coordinates are looked up automatically via the Nominatim API (one request per second) and cached in `.cache/locations-geocode-cache.json`.

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

## Session start hook

A `.claude/hooks/session-start.sh` hook verifies Node.js is available at the start of every Claude Code web session. Tests can be run immediately without any manual setup.
