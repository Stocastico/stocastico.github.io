# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Future ideas

- **Light theme + toggle.** The theme pipeline already supports multiple
  palettes, but the site is hard-locked to `data-theme="dark"`. Add a light
  palette and an OS-preference-aware toggle (`prefers-color-scheme`).

- **Remove the leftover dead flip/carousel JS.** The homepage research
  focus-cards were removed, so `initCardFlip` (js/animations.js) and
  `initResearchCarousel` (js/ui.js) are now no-ops (their DOM is gone). The dead
  flip/carousel CSS was already deleted; drop the JS (and its main.js wiring +
  unit tests) too. Keep `initCardTilt` — project/contact/publication cards still
  use it.

- **Per-paper PDF/DOI links on the publications page.** `publications.html` now
  lists every paper, but only a few carry a `url`. Backfill DOIs / open-access
  PDFs in `data/publications.js` (then `npm run generate-cards`) so more entries
  link out. (Owner: Stefano — to tackle later.)

- **UNESCO World Heritage sites map.** A page that lists the UNESCO World
  Heritage sites and lets me mark the ones I've visited — a natural extension
  of the existing "Where I've Been" globe. Reuse the globe/`locations` aesthetic
  and data pipeline so it feels integrated; ship the ~1,200-site list as a
  static data file and frame it as a personal map/checklist (not a score).
  (Owner: Stefano — to tackle later.)

## Decisions (reviewed, deliberately not changed)

- `--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.
- The public contact email is intentional; leave the obfuscated address as-is.
