# Plan: Projects / Portfolio Section

## Problem

The current "What I Work On" (Research) section contains six flip-cards covering broad topic
areas (Computer Vision, AR, etc.). These are intentionally general — they describe *domains*,
not specific deliverables. There is nowhere on the site where a visitor can see a concrete
artefact of what has actually been built: a screenshot of an AR classroom, a model output, a
demo video, a GitHub repo.

A separate **Projects** section solves this without cluttering the Research cards.

---

## Proposed Structure

### 1. Homepage strip — "Projects" section

- Positioned between Publications and Writing (or between Research and Skills — TBD).
- A horizontally-scrollable row of compact project cards (similar cadence to the Research
  carousel but visually heavier, led by an image).
- Each card contains:
  - **Thumbnail image** (16:9 ratio, `img/projects/<slug>-thumb.jpg`)
  - **Title** (one short line)
  - **Year**
  - **Tag badges** (1–3 keywords, e.g. "AR", "Computer Vision", "LLM")
  - **Short description** (2–3 sentences max)
  - **"View project →"** link — jumps to the matching anchor in `projects.html`
- A "View all projects →" button after the row, linking to `projects.html`.
- The homepage shows a capped number (e.g. 4) of the most recent projects; the rest live only
  on `projects.html`.

### 2. `projects.html` — dedicated project detail page

- Same shell as `blog.html` / `cv.html` (shared nav, footer, styles).
- Each project is a self-contained section (`<section id="<slug}">`) so homepage cards can
  deep-link to it with `projects.html#ar-education`.
- Full-width layout per project:
  - Hero image **or** embedded video (YouTube/Vimeo `<iframe>`, lazy-loaded)
  - Title, year, tags
  - Full description (HTML, can include multiple paragraphs, lists, sub-images)
  - Link row: paper / GitHub / demo / video (only those that exist)
- Projects listed newest-first.

### 3. Data file — `data/projects.js`

```js
const PROJECTS = [
  {
    id:          'clear-ar-education',          // used as HTML anchor in projects.html
    title:       'CleAR: Multi-user AR for Education',
    year:        '2023',
    tags:        ['AR', 'Education', 'Unity'],
    thumb:       'img/projects/clear-thumb.jpg',
    description: 'Short 2–3 sentence summary shown on the homepage card.',
    url:         'projects.html#clear-ar-education',
  },
  // ...
];
```

`projects.html` content (the rich per-project HTML) is authored directly in the HTML file
rather than generated from data, because it is inherently freeform (mixed media, arbitrary
layout per project). The data file drives only the homepage cards.

### 4. Script — `scripts/new-project.js`

Automates the boilerplate of adding a new project:

- **Input**: a Markdown file with YAML frontmatter (see template below).
- **Output 1**: appends a new `<section id="<slug>">` block to `projects.html` inside a
  designated injection comment zone.
- **Output 2**: prepends a new entry to the `PROJECTS` array in `data/projects.js`.
- Flags: `--dry-run`, `--help` (consistent with other scripts).

#### Frontmatter fields

```yaml
---
id:          clear-ar-education        # kebab-case, becomes HTML anchor
title:       "CleAR: Multi-user AR for Education"
year:        "2023"
tags:        "AR, Education, Unity"    # comma-separated
thumb:       "img/projects/clear-thumb.jpg"
description: "Short 2–3 sentence summary for the homepage card."
# Optional links (omit any that don't apply):
link_paper:  "https://link.springer.com/..."
link_github: "https://github.com/..."
link_demo:   "https://..."
link_video:  "https://youtube.com/..."
---

Full project description in Markdown.
Can span multiple paragraphs, include images, lists, etc.
```

#### Template file

`docs/project-template.md` — a copy of the above frontmatter with inline comments explaining
each field, to be duplicated when starting a new project entry.

### 5. CSS additions (`css/styles.css`)

- `.project-card` — homepage card with thumbnail, matches general site aesthetic.
- `.project-card__thumb` — 16:9 image, `object-fit: cover`.
- `.project-detail` — per-project section on `projects.html`: full-width, comfortable reading
  width, generous spacing between projects.
- `.project-detail__media` — wraps `<img>` or `<iframe>` embed; `aspect-ratio: 16/9`.
- `.project-links` — horizontal row of pill-shaped links (paper, GitHub, demo…).
- All new components respect `prefers-reduced-motion` and are responsive.

### 6. JS additions (`js/main.js`)

Two new render functions (following the existing pattern):

```js
// Renders homepage project cards from PROJECTS (data/projects.js)
function renderProjects() { ... }

// No render needed for projects.html detail sections — they are static HTML.
// Only setFooterYear() and nav/scroll behaviours apply.
```

`renderProjects()` is called from the `DOMContentLoaded` handler, guarded by element existence
check (same pattern as `renderBlog`).

### 7. `package.json` additions

```json
"new-project": "node scripts/new-project.js"
```

### 8. Tests

- `test/new-project.test.js` — unit tests for frontmatter parsing, HTML generation, and
  `data/projects.js` update logic (mirrors `test/new-post.test.js` structure).
- `test/main.test.js` — add `renderProjects` to the exported-function tests.

---

## Implementation Order

1. Add `img/projects/` directory (placeholder `README` or first real thumbnail).
2. Create `data/projects.js` with the shape comment and an empty `PROJECTS = []` array.
3. Create `projects.html` skeleton (nav, footer, injection zone comment, script tags).
4. Add CSS for `.project-card` and `.project-detail` to `css/styles.css`.
5. Add `renderProjects()` to `js/main.js`; run `npm run minify`.
6. Add "Projects" section to `index.html`.
7. Write `scripts/new-project.js` with frontmatter parser, HTML generator, and data updater.
8. Write `docs/project-template.md`.
9. Add `npm run new-project` to `package.json`.
10. Write `test/new-project.test.js`; run `npm test` and confirm all 206+ tests pass.
11. Add 2–3 real project entries to validate the pipeline end-to-end.

---

## Decisions 

- **Section placement**: between Publications and Writing
- **Homepage card count cap**: 4 seems right (one row on wide screens)
- **Video embeds**: Prefer a "click to load" pattern (poster
   in the iframe on click) to keep the page privacy-first.
- **Thumbnail production**: what source material exists? Screenshots from papers, demo
  recordings, conference slides? could be anything, need to be flecible here
- **`projects.html` detail content**: hand-authored HTML gives full flexibility but is not
  scriptable... but let's keep it as it is for the moment.
