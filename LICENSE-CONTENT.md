# Content licence — CC BY 4.0

The **code** in this repository is MIT — see [`LICENSE`](LICENSE).
The **content** is licensed separately, under the terms below.

## Creative Commons Attribution 4.0 International (CC BY 4.0)

Copyright © 2026 Stefano Masneri.

The written content of this site is licensed under the
[Creative Commons Attribution 4.0 International License][deed].
You are free to share and adapt it, for any purpose, including commercially,
**provided you give appropriate credit**, link to the licence, and indicate
whether changes were made.

- Human-readable summary: <https://creativecommons.org/licenses/by/4.0/>
- Full legal code: <https://creativecommons.org/licenses/by/4.0/legalcode>

CC BY is the most permissive Creative Commons licence that still requires
attribution: no non-commercial clause, no share-alike, no no-derivatives.

### What it covers

- The prose on every page — homepage copy, `/now`, the About and Contact
  sections, the project write-ups in `projects/*.html` and their Markdown
  sources in `drafts/`.
- The project documentation in `README.md`, `CLAUDE.md` and `docs/*.md`.
- The hand-curated data: `data/cv.yaml`, `data/locations.yaml`,
  `data/unesco.yaml`, `data/links.yaml`, `data/countries.yaml`,
  `data/projects.js` and `data/publications.js` — the text and the selection,
  as a compilation.

### What it does not cover

Some material in this repository belongs to someone else, or is deliberately
reserved. None of it is covered by either licence here:

- **Photographs of the author** — `img/photo.webp`. All rights reserved.
- **The CV and the thesis PDFs** — `docs/cv.pdf`, `docs/CV_web.pdf`,
  `docs/dissertation.pdf`, `docs/defense.pdf`, `docs/defense-hq.pdf`.
  Free to read; not licensed for redistribution or reuse.
- **The publications themselves.** `data/publications.js` lists papers whose
  copyright sits with their publishers; the entries here are metadata and
  links, not the papers.
- **Fonts** — `fonts/*.woff2` are latin subsets of Source Serif 4 and
  JetBrains Mono, both under the [SIL Open Font Licence 1.1][ofl], which
  travels with the files. See the provenance note at the top of
  `css/fonts.css`.
- **Map data** — `data/countries-110m.json` and `data/land-50m.json` come from
  [world-atlas][wa] (ISC), built from [Natural Earth][ne], which is public
  domain. The derived `data/europe-land.json` and the inline world-map SVG in
  `index.html` inherit that status.
- **MNIST** — the training set is downloaded into `.cache/` at training time
  and is not part of this repository. The trained weights in
  `data/cnn-model.json` and everything generated from them are MIT, like the
  rest of the code.

### How to attribute

> "Title of the piece" by [Stefano Masneri](https://stefanomasneri.com),
> licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

A link back to the page you took it from is the appropriate credit; say so if
you changed anything.

[deed]: https://creativecommons.org/licenses/by/4.0/
[ofl]: https://openfontlicense.org/
[wa]: https://github.com/topojson/world-atlas
[ne]: https://www.naturalearthdata.com/about/terms-of-use/
