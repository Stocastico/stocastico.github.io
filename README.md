# stocastico.github.io

Personal website of **Stefano Masneri** — Senior AI Engineer specialising in Machine Learning, Computer Vision, and Augmented Reality.

## Tech stack

- Pure HTML / CSS / JavaScript — no build step, no bundler
- [Three.js](https://threejs.org/) (CDN) for the 3-D neural-network background and interactive globe
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
│   └── generate-locations.js  Generate data/locations.js from data/locations.yaml
│   └── update-locations.sh   Convenience wrapper for generate-locations.js
├── test/
│   ├── main.node.test.js      Tests for js/main.js
│   ├── locations-generator.test.js  Tests for scripts/generate-locations.js
│   └── new-post.test.js       Tests for scripts/new-post.js
└── package.json               npm scripts (no runtime dependencies)
```

## Running tests

```bash
npm test                  # run all 51 tests
npm run test:main         # js/main.js tests only
npm run test:locations    # locations generator tests only
npm run test:post         # new-post.js tests only
```

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
   - Create `blog/<slug>.html` from the template
   - Prepend the new entry to `data/blog.js`

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
| ` ```lang … ``` ` | `<pre><code class="language-lang">` |
| `> quote` | `<blockquote>` |

## Updating the globe

Edit `data/locations.yaml`, then regenerate:

```bash
npm run generate-locations
# or:
./scripts/update-locations.sh
```

Missing coordinates are looked up automatically via the Nominatim API (one request per second) and cached in `.cache/locations-geocode-cache.json`.

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

## Suggested improvements

- **RSS feed** — generate an `rss.xml` from `data/blog.js` for readers to subscribe
- **Open Graph / Twitter Card meta tags** — add per-post OG tags for better social previews
- **Syntax highlighting** — integrate [highlight.js](https://highlightjs.org/) (CDN) for coloured code blocks in posts
- **Reading progress bar** — a thin bar at the top of blog posts indicating scroll progress
- **Search** — client-side full-text search across blog posts (e.g. [Pagefind](https://pagefind.app/))
- **`sitemap.xml`** — helps search engines discover all pages
- **Dark/light theme toggle** — CSS variables are already wired up; just needs a toggle button
- **`rel="canonical"`** on blog posts — prevents duplicate-content issues if pages are mirrored

## Session start hook

A `.claude/hooks/session-start.sh` hook verifies Node.js is available at the start of every Claude Code web session. Tests can be run immediately without any manual setup.
