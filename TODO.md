# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Future ideas

- **"Now" page.** A `/now` page (now-now-now.com style) for current focus —
  what I'm working on, reading, and thinking about — kept deliberately short
  and updated occasionally. (Owner: Stefano — planned.)

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
