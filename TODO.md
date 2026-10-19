# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

**There is no content list at the moment**, which is a state worth stating
rather than leaving as a missing heading. All four entries closed on 2 September
after being checked against the repo rather than against this file, which had
gone stale in the reassuring direction: `now.html` was updated on 17 August
(`npm run test:now` passes; next expiry mid-November), the 2009–2018 gap in
`data/cv.yaml` is filled — AGT International, MPI and Fraunhofer HHI all carry a
`description` now — every one of the 13 project pages serves a PNG `og:image`,
and the last one was a decision rather than a defect: the CV PDF's header
subtitle stays "Senior AI/ML Leader", deliberately, because the summary beneath
it is built on that framing.

**A stale TODO costs more than an empty one**: it invites work that is already
done and hides the items that are real.

## Redesign "Montaggio" (#188) — what is left

**Where things stand.** Phases 1–5 are done on the branch
`redesign/montaggio-design-system`, open as **draft PR #196**. Work continues
on that branch; **nothing goes to `main`** and the PR is not merged until
Stefano has tried it locally (`README.md` → "Previewing without publishing").
After each phase: push to the branch and update the PR #196 description.
Working rules for every phase: tests first (red/green), `npm test` +
`npm run test:e2e` green, `npm run screenshots` checked at 390/768/1440,
CLAUDE.md updated, small commits.

Done: hero through a receptive field (#189), design system with one dark theme
(#190), career timeline as an edit with pinned scrub and title card (#191),
project cards as a media bin with generated thumbnails, plus title cards on
Projects and Publications (#192), travel page as a nautical chart with the
globe and UNESCO list restyled around it (#193). The reasoning for each is in
`CLAUDE.md`.

**Decided** (19 Oct): the 2D Europe map is gone. The chart carries its
European pins now; see "Travel page: the nautical chart" in `CLAUDE.md`.

**Waiting on Stefano after the local test** (do not decide alone):
- The title-card copy after the second review: "The story so far" with
  Stefano's subtitle, "Selected work" with "Three projects, picked at random
  on every visit. The full list has the rest.", and "On paper" with "The core
  of my PhD. All of it is on the publications page and Scholar." No media
  vocabulary in subtitles (an e2e test enforces it).
- "AI Production" is on the timeline as "2026 – present" (confirmed). Move it
  from `timeline_projects:` in `data/cv.yaml` to `data/projects.js` once the
  write-up is cleared.
- The copy written for the travel page: the cartouche intro (rewritten to
  mention the chart), "Further afield" as the globe's heading, "Route between
  homes" in the key, and the leg labels using the employer's full name
  ("Fraunhofer Heinrich Hertz Institut" wraps to two lines; a `short:` field
  in `data/cv.yaml` would be the clean way to say "Fraunhofer HHI").

### Phase 6 — sub-pages in the new system (#194)

Done on 19 Oct: headings in sentence case everywhere (incl. the project
drafts, guarded by `test/sentence-case.test.mjs`), one card radius
(`--r-md`), the filter chips' active state solid instead of a gradient,
project titles in the condensed display face, and a "no signal" 404 (the
last gradient text on the site).

Left for a look with Stefano before calling the phase done:
- the CV page: still large two-column cards with coloured left rules; it
  reads fine, but it is the least "Montaggio" page left — a candidate for
  the edit treatment, or for leaving alone.
- `now.html` and the MNIST page were checked and need nothing obvious.
- known traps still apply: navbar width at the burger breakpoint
  (1024/1025), the `aroundtheworld` table on phones.

### Phase 7 — cleanup and docs (#195)

Done on 19 Oct: `heroGradFrom`/`heroGradTo` and `noise` out of the palette
schema; the vestigial `refreshActiveTheme()` out of the globe; the card
tilt (and its gloss, and the render wait that existed only for it) gone;
the shared JS budget lowered 20 → 14 KB (10.7 KB now); the social cards —
site and projects — redrawn as Montaggio title cards and rendered by
Chromium so they are finally set in the site's own faces; favicons checked
(already current).

Left:
- The favicon set still draws "SM" in Georgia. It matches the palette, not
  the type; an Archivo "SM" would match both. Stefano's call.
- The MNIST page's hand-drawn social card (`img/projects/` — it pins its own
  `og:image`) is still the old style.
- Re-read `CLAUDE.md` and `README.md` end to end for paragraphs that describe
  things that no longer exist (light theme, palette picker, gradient headings,
  WebGL hero). Several were fixed in passing; a full read is still owed.
- Close #188–#195 when the PR is merged.

## Test coverage — known gaps, deliberately left

Written down after a sweep that mutated every generated artefact and ran the
whole suite against each. Everything that could be closed cheaply was closed;
these are what is left, with the reason.

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

- **The contact address is public in plain text on purpose — do not re-add
  obfuscation.** This line used to read "leave the obfuscated address as-is",
  and it survived the change that deleted the obfuscation, which is exactly the
  failure mode this file is supposed to avoid: a stale instruction is worse than
  no instruction, because it tells the next reader to restore something. The
  defence is that `hello@stefanomasneri.com` is a disposable forwarding alias
  swappable in one line (`js/contact.js`), not that the string is hidden — base64
  in an attribute named `data-email-user` stopped nobody. Full reasoning in
  `CLAUDE.md`.
- `public/feed.xml` is checked by shape, not bytes — entry count, every project
  present, RFC 3339 dates, https-only, the `/now` date in sync, and (since the
  date policy changed) that project dates come from `data/projects.js` rather
  than git. A byte-exact drift guard would need the feed-level `<updated>` to
  be stable too, and that tracks the `/now` page date, which is content.
