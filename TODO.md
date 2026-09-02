# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

Three entries came out of the content list on 2 September after being checked
against the repo rather than against this file, which had gone stale in the
reassuring direction: `now.html` was updated on 17 August (`npm run test:now`
passes; next expiry mid-November), the 2009–2018 gap in `data/cv.yaml` is
filled — AGT International, MPI and Fraunhofer HHI all carry a `description`
now — and every one of the 13 project pages serves a PNG `og:image`, so the
WebP preview worry is moot. **A stale TODO costs more than an empty one**: it
invites work that is already done and buries the one item that is not.

## Content — needs your words, not mine

- **Decide whether `docs/cv.pdf` should say "Senior AI Engineer".** The PDF was
  regenerated on 19 August and most of the drift this entry used to describe is
  gone: it says "30+ publications" like the site, the role headings inside read
  SENIOR AI ENGINEER, and the skills are proficiency tiers with no percentages
  left. One line still differs — the header subtitle under the name reads
  **"Senior AI/ML Leader"** while the site says Senior AI Engineer.

  That is left as a decision rather than a defect, because it may well be
  deliberate: the summary directly beneath it is built on the leadership
  framing ("AI/ML Engineering Leader with 15+ years… teams of up to 9"), so
  changing the subtitle without the paragraph would read oddly. Either align it
  or delete this entry.

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
