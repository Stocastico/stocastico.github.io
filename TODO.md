# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Content — do before end of August 2026

- **Refresh `docs/cv.pdf`.** It dates from June and has drifted from the site:
  it claims "40+ publications" where the site says 30+ (37 listed), titles the
  role "Senior AI/ML Leader" vs. the site's "Senior AI Engineer", and predates
  the `cv.yaml` skills rework (percentages → proficiency tiers). Reconcile the
  numbers and regenerate — recruiters read both.
- **Update `now.html`.** "Counting down to the summer holidays: a trip to
  Toulouse" is now in the past; the page is dated 5 June and `npm run test:now`
  starts failing once it is 90 days old (~3 September).

- **Two blogroll links need a human eye.** `https://julian.ac` is fixed (it is
  `https://www.julian.ac` now — the apex serves no certificate). The other two
  could not be settled from a sandbox whose proxy returns its own 503s, so they
  need one click each:
  - `https://vihart.com` (`data/links.yaml`) — TLS handshake reset; the site may
    simply be gone. If so, drop the entry or point it at the YouTube channel,
    which is where that work lives now.
  - `https://addi.ehu.eus/handle/10810/68721` — the thesis link, used in both
    `data/publications.js` and the JSON-LD on `publications.html`. Every other
    DOI and IEEE link on the site resolved; only this one did not. If ADDI has
    moved the record, both places need the new handle.
  Nothing guards these automatically and nothing should — a link checker across
  49 third-party sites on every PR would be flaky and slow. Worth a manual sweep
  once or twice a year.

- **The CV goes quiet for 2009–2018.** `data/cv.yaml` gives a `description` to
  Mediapro, NTT DATA and Vicomtech and none to AGT International, MPI for Brain
  Research or Fraunhofer HHI — so nine years of the timeline render as a job
  title, a company and three tags on the page recruiters read most carefully.
  The material already exists in `projects/mpi-brain-research.html`,
  `projects/inevent.html` and `projects/avatech.html`; it needs two or three
  sentences each, lifted and trimmed. Re-run `npm run generate-cv` then
  `npm run generate-cards` afterwards.

- **The Atom feed republishes the back catalogue whenever a project page is
  touched.** `scripts/generate-feed.mjs` takes each entry's `<updated>` from the
  page's last git commit date, and `deploy.yml` regenerates on every push to
  main. The committed `public/feed.xml` shows the effect: eight of fourteen
  project entries carry `2026-07-29` or `2026-08-02`, the dates of two audits
  that changed no prose. `<updated>` is what a reader uses to mark an item
  unread, so fixing a duplicate SVG marker id pushed that project back to the
  top of every subscriber's feed. The `<id>`s are stable, so nothing duplicates
  — it is noise, not corruption. Fix would be an explicit `updated:` field in
  `data/projects.js` (falling back to `year`), decoupling "the file changed"
  from "the writing changed". Note the feed's own tests check shape rather than
  bytes on purpose, so this is a design choice to make, not a drift to repair.

- **CI runs three workflows on every push to `main`, two of which build.**
  `build.yml` fires alongside `deploy.yml`, re-runs the tests, runs
  `generate-cv` and `generate-locations` (the latter reaching for Nominatim over
  the network) and then **discards all of it** — `deploy.yml` already tests,
  builds and publishes. Deleting `build.yml` costs nothing. Separately,
  `rotate-palette.yml` claims in a comment to "mirror deploy.yml's build-time
  refresh steps" but omits `npm run generate-feed`, which `deploy.yml` runs.

- **`npm run screenshots` never captures the hero.** `scripts/screenshots.mjs`
  scrolls each page to fire the reveal, then calls `window.scrollTo(0, 0)` and
  waits 400 ms — but `html { scroll-behavior: smooth }`, so from the bottom of a
  5400px homepage the shutter fires mid-flight and `index-hero-*.png` is a
  picture of the Projects section. This is the same trap CLAUDE.md already
  records for `test/e2e/content.e2e.mjs` ("a fixed timeout after `scrollTo()`
  measures mid-flight"), learned there and not applied here. Fix is
  `behavior: 'instant'`, or polling until `scrollY === 0`.

- **`js/main.js` has one observer that escapes the teardown rule.**
  `_lazyOnViewport()` creates an `IntersectionObserver` that is only
  disconnected if its canvas actually intersects; it is the single observer in
  the file not routed through `_pushTeardown`, against the rule CLAUDE.md
  states. Small leak into the bfcache on travel.html, which is the one page with
  two of them.

- **Doc drift: "one personal project".** The note on work-vs-personal in
  CLAUDE.md argues against a filter control on `projects.html` because "with one
  personal project a 'Personal' facet is a control that mostly disappoints".
  There are two now, both from 2026. The conclusion probably still holds; the
  premise no longer does. Worth a look when a third arrives — and note the
  homepage is work-only, so it currently shows nothing newer than 2025.

- **`aria-current="page"` is used for two different things.** `js/ui.js` sets it
  from the homepage scroll-spy as sections come into view, where the ARIA token
  for "the part of the page you are in" is `location`; `page` is correct on the
  cross-page nav links (`now.html` uses it that way). Both readings currently
  ship. A nit, but the two uses mean different things to a screen reader.

## Test coverage — known gaps, deliberately left

Written down after a sweep that mutated every generated artefact and ran the
whole suite against each. Everything that could be closed cheaply was closed;
these are what is left, with the reason.

- **The raster favicons are not checked against the active palette.**
  `test/html-quality.test.mjs` asserts `public/favicon.ico`, `icon-192.png`,
  `icon-512.png` and the maskable pair *exist*; nothing asserts they were
  regenerated for the palette currently in `data/palettes.yaml`. A rotation that
  ran `generate-theme` but skipped `generate-favicons` therefore ships the
  previous palette's icons silently — which is precisely the failure that
  already happened once with `generate-theme-toggle` and the navbar dots.
  Checkable by decoding a PNG and sampling its background against
  `faviconBg`, but that means `sharp` inside the fast suite, and "zero test
  dependencies, ~3 seconds" is a property of `npm test` worth keeping. Better
  home is `test/e2e/build-output.e2e.mjs`, which already runs post-build and
  has no such constraint.

- **`js/cnn-hero.js` (691 lines) has no unit coverage.** Only its *loading*
  is asserted (`test/cnn-activations.test.mjs` checks `js/main.js` imports it
  dynamically and gates on `supportsCnnHero()`), plus whatever the homepage
  reveal tests happen to exercise. The projection maths — `_view()`,
  `_project()`, the turntable, the signed depth parallax — is pure and testable
  in principle; nothing tests it. A regression there degrades the hero's sense
  of depth without failing anything or throwing.

- **`scripts/generate-favicons.mjs`, `generate-og.mjs` and `set-domain.mjs`
  have no tests at all**, and none of the three has a main guard, so importing
  any of them from a future test would rewrite files as a side effect (the bug
  that made the analytics and speculation-rules tests unfalsifiable). The first
  two produce binaries; `set-domain.mjs` rewrites the domain across every file
  in the repo and is the one worth a guard first.

- **`js/render-page.js` is never imported by a test.** That is deliberate and
  documented: its output is checked as *committed markup* by
  `test/generate-cards.test.mjs` rather than by calling the builder and
  comparing it to itself. Noted here only so the zero does not look like an
  oversight next time someone counts.

- **`public/feed.xml` is checked by shape, not bytes** — entry count, every
  project present, RFC 3339 dates, https-only, the `/now` date in sync. Byte
  drift is not checkable while `<updated>` comes from git history, which is the
  same fact the feed item above is about.

## Future ideas

- **Container queries.** The one genuinely modern CSS feature this site does not
  use (it already has view transitions, speculation rules, scroll-driven
  animations, cascade layers, `<dialog>`, oklch, `text-wrap: balance/pretty`).
  The card grids are the textbook case: a `.project-card` takes its layout from
  viewport media queries even though what actually determines it is the card's
  own column width, which differs between the three-up homepage grid and the
  full-width mobile stack. Not a bug — a way to delete a class of breakpoint.

- **Check the WebP social cards actually preview.** Most `projects/*.html` point
  `og:image` at a `.webp`; LinkedIn and WhatsApp have historically been
  unreliable with WebP previews, and LinkedIn is where these get shared. Run a
  couple through LinkedIn's Post Inspector — if they come back blank, render PNG
  cards for them (the `generate-og` machinery already exists). The two pages
  that ship PNGs (`mnist-lenet`, `rag-document-qa`) are unaffected.

## Decisions (reviewed, deliberately not changed)

- ~~`--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.~~ **No longer true — entry retired.** The
  accent-text / three-tier rework moved it: measured against every surface it
  actually lands on, `--text-faint` is **6.3–10.1:1** across all six variants
  (worst case crimson/light on a card, 6.39:1), i.e. above AA everywhere and
  above AAA in most. `test/contrast.test.mjs` already holds it to 4.5:1 in
  "every text tier meets WCAG AA on every surface it lands on" — the token is
  in the asserted list, so the exemption this entry describes does not exist.
  A decisions log that records a limitation which has since been fixed is worse
  than an empty one: it argues against re-checking.
- The public contact email is intentional; leave the obfuscated address as-is.
- Globe land texture (2048×1024) is rebuilt per construction / theme switch
  rather than cached across instances. Considered and skipped: the colours are
  theme-dependent and the rebuild path is the one behind past "blank globe
  after theme switch" bugs — not worth the GL-lifetime risk for a cost only
  paid on a manual (infrequent) theme toggle.
