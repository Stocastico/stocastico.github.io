# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Future ideas

- **Dedicated "Publications" page.** The homepage shows only the top 3 papers
  with a "View all on Google Scholar" link. A standalone page (like
  `projects.html`) could list the full set of papers, each with a link to its
  Google Scholar entry and a direct PDF download link. (Owner: Stefano — to
  tackle later.)

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
