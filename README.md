# stocastico.github.io

Personal website of **Stefano Masneri** — Senior AI Engineer in San Sebastián, Spain.
Live at **[stefanomasneri.com](https://stefanomasneri.com/)**, served by GitHub Pages from this repository.

No framework. Vanilla HTML, CSS and ES modules, bundled by Vite as a multi-page app. Every page is
server-rendered static HTML that reads without JavaScript; the JS is enhancement.

```bash
npm install
npm run dev      # Vite dev server with HMR
npm run build    # → dist/
npm test         # static suite, ~3s
```

Requires Node `^20.19 || >=22.12` (the range Vite 8 needs). CI runs 24.

---

## How it works

Three ideas explain most of the repository.

**Content lives in data files, not markup.** The CV, travel pins, blogroll, UNESCO list, projects and
publications are YAML or ESM data. A generator turns each into a `data/*.js` module and, where it
matters, bakes the result straight into the HTML — so crawlers and no-JS visitors get real content,
not an empty `<div>`. Every generated artefact has a drift test that fails if you edit the source and
forget to re-run its generator.

**One palette drives every colour.** `data/palettes.yaml` has one `active:` key. `npm run generate-theme`
rewrites the CSS custom properties, `js/theme.js`, the `<meta theme-color>` on every page, the inline
favicon and the manifest. CSS reads `var(--*)`; the WebGL shaders and Canvas modules import `THEME`.
A scheduled job rotates the palette weekly and deploys it.

**Push to `main` deploys.** `.github/workflows/deploy.yml` runs both test suites, builds, and publishes
to Pages. There is no release step — the deploy is the release.

## Layout

```text
├── *.html              8 top-level pages (home, cv, projects, publications, travel, links, now, 404)
├── projects/           13 project detail pages
├── css/                styles.css (@layer, nesting, oklch) + self-hosted fonts.css
├── js/                 ESM. main.js orchestrates; ui.js, animations.js, globe.js,
│                       cnn-hero.js, mnist-lab.js, europe-map.js are the behaviours
├── data/               YAML sources of truth + their generated .js modules
├── scripts/            the generators (all support --help and --dry-run)
├── test/               static suite; test/e2e/ is the Playwright suite
├── public/             copied verbatim to dist/ (sitemap, robots, llms.txt, feed.xml, CNAME, icons)
└── docs/               deeper reference + the CV and thesis PDFs
```

## Editing content

Edit the source on the left, run the command on the right. The drift tests will tell you if you forget.

| To change | Edit | Then run |
|---|---|---|
| Career, education, skills | `data/cv.yaml` | `generate-cv`, then `generate-cards` |
| Projects | `data/projects.js` | `generate-cards`, `generate-llms`, `generate-feed` |
| Publications | `data/publications.js` | `generate-cards` |
| Globe pins and trips | `data/locations.yaml` | `generate-locations` |
| Homepage world map | `data/countries.yaml` | `generate-countries`, then `generate-world-map` |
| UNESCO accordion | `data/unesco.yaml` | `generate-unesco`, then `generate-cards` |
| Blogroll | `data/links.yaml` | `generate-links`, then `generate-cards` |
| Colour palette | `data/palettes.yaml` | `generate-theme`, `generate-theme-toggle`, `generate-favicons` |
| A new project page | a Markdown file | `npm run new-project -- file.md` |
| Adding any HTML page | — | `generate-analytics`, `generate-speculation-rules`, then `generate-csp-meta` **last** |

`generate-csp-meta` goes last whenever inline `<script>` content changed: the CSP hashes each inline
script, so a rewritten JSON-LD or speculation-rules block invalidates the hash.

Field-by-field reference for the YAML formats: **[`docs/DATA-FORMATS.md`](docs/DATA-FORMATS.md)**.
Project frontmatter and supported Markdown: **[`docs/project-template.md`](docs/project-template.md)**.

## Scripts

72 npm scripts, but they fall into a few groups. **Every generator supports `--help` and `--dry-run`**,
which is the authoritative reference for flags — this table is only a map.

| Group | Scripts |
|---|---|
| Build | `dev`, `build`, `preview` |
| Content | `generate-cv`, `generate-locations`, `generate-countries`, `generate-world-map`, `generate-unesco`, `generate-links`, `generate-cards`, `new-project` |
| Theme | `generate-theme`, `generate-theme-toggle`, `generate-favicons`, `generate-og`, `rotate-palette` |
| SEO / metadata | `generate-sitemap`, `generate-llms`, `generate-feed`, `generate-project-jsonld`, `generate-csp-meta`, `generate-analytics`, `generate-speculation-rules` |
| ML pipeline | `train-cnn`, `generate-cnn-activations`, `generate-lenet-weights` |
| Maintenance | `check-links`, `screenshots`, `set-domain`, `generate-europe-land` |
| Tests | `test`, `test:e2e`, `test:e2e:a11y`, `test:e2e:budget`, `test:contrast`, and a `test:*` shorthand per suite |

A note that has bitten this repo twice: **a generator must never run when it is imported.** Two of them
did, which made their own test suites unable to fail and let `npm test` write to the working tree. They
all sit behind a main guard now, and `test/generator-main-guard.test.mjs` enforces it.

## Testing

```bash
npm test           # ~980 assertions, ~3s, no browser
npm run test:e2e   # builds dist/, then drives real Chromium (~5 min)
```

Two layers, deliberately. The fast one answers anything you can learn by reading a file — pure
functions, generator round-trips, drift checks, static analysis. The browser one answers what only a
rendered page can: what painted, what colour it was, where it landed, what the browser's own lifecycle
did. Both gate every pull request, the deploy, and the weekly palette rotation.

**A CSS change needs a picture, not just a green suite.** Run `npm run screenshots` and look at 390,
768 and 1440 before opening a PR — the last two bugs to reach visitors were both visual and passed
every assertion in the repo.

Full rationale, the layer boundaries, and how to decide where a new test belongs:
**[`docs/TESTING.md`](docs/TESTING.md)**.

## Deploying

Push to `main`. `deploy.yml` runs both suites, refreshes the sitemap, feed and project JSON-LD, builds
and publishes. `public/CNAME` binds the custom domain; `npm run set-domain -- example.com` migrates it
everywhere at once.

Hosting alternatives and the manual path: **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

## Further reading

- **[`CLAUDE.md`](CLAUDE.md)** — the working notes. Every non-obvious decision, the invariants that are
  load-bearing, and the traps that have already been fallen into once. If you are about to change
  something and want to know why it is the way it is, it is in there.
- **[`docs/TESTING.md`](docs/TESTING.md)** — the test layers and their blind spots.
- **[`docs/DATA-FORMATS.md`](docs/DATA-FORMATS.md)** — YAML schemas, field by field.
- **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)** — Pages setup, custom domains, other hosts.

This file is the map; `CLAUDE.md` is the reasoning. It used to be both, at 52 KB, and the duplication
was not free — the same incorrect claim about a test once sat in both files and was corrected in
neither for weeks. One fact, one home.

## Licence

MIT — see [`LICENSE`](LICENSE). The prose, images and CV are © Stefano Masneri and not covered by it.
