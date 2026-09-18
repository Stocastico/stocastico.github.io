Source images for the project detail pages.

Not thumbnails, and no fixed aspect ratio — project cards have carried no
image since the artwork proved illegible behind the body copy (the reasoning
is in `js/render-cards.js`). What is in here is:

* **Hero banners** — the `bg` field of an entry in `data/projects.js`, painted
  full-bleed behind a scrim by `.project-hero`. Wide, and large enough not to
  be upscaled: at a 1440px viewport `background-size: cover` needs at least
  1440px of width, so anything much under that is visibly soft.
* **Body figures** — referenced from the page's draft in `drafts/`.
* **Social cards** — the optional `og` field, for when the hero is the wrong
  shape or format to be one. 1200x630 is what the platforms want; under
  600x315 the preview degrades to a thumbnail or disappears, and an SVG is not
  rendered by scrapers at all.

`test/css-assets.test.mjs` fails on any file in here that nothing references,
so a replaced image must have its old version deleted in the same commit.
