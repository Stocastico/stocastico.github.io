# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Content — needs your words, not mine

- **Refresh `docs/cv.pdf`.** It dates from June and has drifted from the site:
  it claims "40+ publications" where the site says 30+ (37 listed), titles the
  role "Senior AI/ML Leader" vs. the site's "Senior AI Engineer", and predates
  the `cv.yaml` skills rework (percentages → proficiency tiers). Reconcile the
  numbers and regenerate — recruiters read both.

- **Update `now.html`.** "Counting down to the summer holidays: a trip to
  Toulouse" is now in the past; the page is dated 5 June and `npm run test:now`
  starts failing once it is 90 days old (~3 September).

- **The CV goes quiet for 2009–2018.** `data/cv.yaml` gives a `description` to
  Mediapro, NTT DATA and Vicomtech and none to AGT International, MPI for Brain
  Research or Fraunhofer HHI — so nine years of the timeline render as a job
  title, a company and three tags on the page recruiters read most carefully.
  The material already exists in `projects/mpi-brain-research.html`,
  `projects/inevent.html` and `projects/avatech.html`; it needs two or three
  sentences each, lifted and trimmed. Re-run `npm run generate-cv` then
  `npm run generate-cards` afterwards.

- **Check the WebP social cards actually preview.** Most `projects/*.html` point
  `og:image` at a `.webp`; LinkedIn and WhatsApp have historically been
  unreliable with WebP previews, and LinkedIn is where these get shared. Run a
  couple through LinkedIn's Post Inspector — if they come back blank, render PNG
  cards for them (the `generate-og` machinery already exists). The two pages
  that ship PNGs (`mnist-lenet`, `rag-document-qa`) are unaffected.

## Test coverage — known gaps, deliberately left

Written down after a sweep that mutated every generated artefact and ran the
whole suite against each. Everything that could be closed cheaply was closed;
these are what is left, with the reason.

- **`js/cnn-hero.js` (691 lines) has no unit coverage.** Only its *loading* is
  asserted (`test/cnn-activations.test.mjs` checks `js/main.js` imports it
  dynamically and gates on `supportsCnnHero()`), plus whatever the homepage
  reveal tests happen to exercise. The projection maths — `_view()`,
  `_project()`, the turntable, the signed depth parallax — is pure and testable
  in principle; nothing tests it. A regression there degrades the hero's sense
  of depth without failing anything or throwing.

- **The dev/analysis scripts still run at import time.** `train-cnn.mjs`, the
  `eval-*` and `diagnose-*` pair, `screenshots.mjs` and `ingest-digit-capture.mjs`
  have no main guard, and `test/generator-main-guard.test.mjs` deliberately
  excludes them: nothing imports them, they write to `.cache/` or to gitignored
  output, and `train-cnn` downloads MNIST on import — which is exactly why no
  test should import it either. If one ever needs importing, guard it first.

- **`js/render-page.js` is never imported by a test.** That is deliberate and
  documented: its output is checked as *committed markup* by
  `test/generate-cards.test.mjs` rather than by calling the builder and
  comparing it to itself. Noted here only so the zero does not look like an
  oversight next time someone counts.

## Future ideas

- **Container queries.** The one genuinely modern CSS feature this site does not
  use (it already has view transitions, speculation rules, scroll-driven
  animations, cascade layers, `<dialog>`, oklch, `text-wrap: balance/pretty`).
  The card grids are the textbook case: a `.project-card` takes its layout from
  viewport media queries even though what actually determines it is the card's
  own column width, which differs between the three-up homepage grid and the
  full-width mobile stack. Not a bug — a way to delete a class of breakpoint.

- **Revisit the work/personal filter on `projects.html` at four or five personal
  projects.** There are two now, and a facet returning two of fourteen mostly
  disappoints. (For why the homepage ends at 2025, see the first entry under
  Decisions — it is not a data problem and does not need solving here.)

## Decisions (reviewed, deliberately not changed)

- **"The newest publication is 2024" is not a gap, and neither is "the newest
  work project is 2025".** An audit will keep finding both and they are both
  expected. Stefano no longer works in research, so the publication list is a
  closed record rather than a stalled one — it is complete as of the end of that
  career, and 37 papers is the number. And professional projects cannot be
  written up until they ship, so there is a structural lag of a year or more
  between doing the work and being allowed to describe it. Neither is fixable by
  editing this repository. **Do not re-raise them.**

  The one consequence worth keeping an eye on: `homepageProjects()` filters to
  `kind: 'work'`, and both 2026 entries are personal, so the homepage portfolio
  currently ends in 2025 through no fault of the data. If the confidentiality lag
  ever makes that gap embarrassing, the lever is letting the homepage fall back
  to personal projects when the work set is thin — not weakening the filter.

- **Link rot is checked monthly and advisorily, never in CI.** `npm run
  check-links` (`.github/workflows/link-check.yml`, first of the month) probes
  the blogroll and the publication URLs and opens an issue if anything is
  genuinely dead. It deliberately treats 401/403/405/429 as bot-blocking rather
  than breakage — without that filter `whc.unesco.org` alone would file 130 false
  positives a month — and retries three times, because an egress proxy that
  cannot reach an origin answers on the origin's behalf. Gating a pull request on
  80 third-party hosts would buy flakiness for no safety: a dead link
  disappoints a visitor, it does not break a build, and that is a much slower
  clock than a merge.

- **`docs/defense.pdf` is kept but no longer deployed.** The About section used
  to offer the defence slides twice at two file sizes — a bandwidth choice
  dressed up as a content choice — and now offers the dissertation (5 MB) and
  the HQ slides (12 MB), two different documents. That leaves the 3.8 MB
  downsampled deck referenced by nothing. It stays in `docs/` because it costs
  nothing in a repository and is exactly what you want back the day someone
  asks for a lighter download; `copyDocsPdfs()` in `vite.config.js` copies only
  the PDFs the built HTML links to, so it simply stops shipping. That plugin
  used to sweep the whole directory, which is the same mistake
  `copyReferencedImages()` was written to fix for `img/`.

- The public contact email is intentional; leave the obfuscated address as-is.
- Globe land texture (2048×1024) is rebuilt per construction / theme switch
  rather than cached across instances. Considered and skipped: the colours are
  theme-dependent and the rebuild path is the one behind past "blank globe
  after theme switch" bugs — not worth the GL-lifetime risk for a cost only
  paid on a manual (infrequent) theme toggle.
- `public/feed.xml` is checked by shape, not bytes — entry count, every project
  present, RFC 3339 dates, https-only, the `/now` date in sync, and (since the
  date policy changed) that project dates come from `data/projects.js` rather
  than git. A byte-exact drift guard would need the feed-level `<updated>` to
  be stable too, and that tracks the `/now` page date, which is content.
