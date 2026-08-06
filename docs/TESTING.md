# Testing

## Why this document exists

The site shipped four visible defects in a row while the test suite was green:

| Defect | Suite result at the time |
|---|---|
| The contact section rendered as an empty band on mobile | 766 passing |
| Nav links landed on blank sections on mobile | 766 passing |
| Back from a link returned a page with dead JS | 766 passing |
| The world map showed only its coloured countries | 766 passing |

That is not a shortage of tests. It is a **coverage shape** problem: the suite
had one axis of depth and no breadth. Every test was either static analysis
(regex over a source file) or a unit test against a hand-written DOM stub, and
neither kind can observe a rendered page. Layout, compositing, the paint
pipeline and the browser's own page lifecycle are where all four bugs lived, and
all four were invisible by construction.

The fix was not "more tests". It was **a missing layer**.

## The layers

### 1. Unit — `npm test` (fast, no browser)

Node's built-in runner, ~780 assertions, runs in about three seconds.

- **Pure functions.** `js/lenet.js`, `js/mnist-preprocess.js`, `js/render-cards.js`,
  the colour maths in `scripts/generate-theme.js`. These are genuinely well
  served here: no DOM, deterministic, fast.
- **Generators.** Every `scripts/generate-*.js` gets a round-trip test, and the
  generated artefacts are checked for drift against their source so a stale
  commit fails CI rather than shipping.
- **Static analysis over source.** SEO tags, CSP hashes, the analytics pixel,
  `var(--x)` resolution, no `console.log` in `js/`.
- **DOM-stubbed behaviour.** `initScrollReveal`, `initLifecycleCleanup`,
  `initNavbar` and friends, against object literals standing in for elements.

**What this layer cannot see, ever:** whether an element is painted, where it
is, whether it overflows, whether it is on top of something else, whether an
observer fired, whether the browser froze the page. A stub returns whatever the
test author imagined; a browser returns what is true.

### 2. Palette — `npm run test:contrast`

Colour was the other place with no instrument. Every value lived in
`data/palettes.yaml` and was reviewed by eye, on a bright screen, by the person
who chose it. `test/contrast.test.mjs` measures instead:

- Text pairs against **WCAG 2.1 AA** (4.5:1 body, 3:1 large and non-text).
- Surface pairs against an **OKLab lightness step**, not a contrast ratio.
  The ratio is the wrong instrument for a surface — GitHub's light-mode
  section banding is 1.05:1 and perfectly visible, while 1.05:1 near black is
  nothing at all, so no single ratio threshold can serve both modes. OKLab
  lightness is perceptually uniform, so one number is meaningful in both.
- Every palette, in **both** its dark and light variant. Adding a palette adds
  coverage with no new test.

Writing it surfaced three accessibility bugs unrelated to the original report,
all pre-existing: two filled-button labels below AA, and two map fills below
the 1.4.11 non-text floor against the land they were painted on.

### 3. Browser — `npm run test:e2e` (real Chromium, serves `dist/`)

The missing layer. Runs against the **built artefact**, served over HTTP, so
module loading, the CSP `<meta>` and relative URLs behave as in production.

| File | Covers |
|---|---|
| `test/e2e/pages.e2e.mjs` | Every page loads clean: no console errors, no uncaught exceptions, no 404s, unique titles, one `<h1>`, a `<main>` landmark. No horizontal overflow at 375/390/768px. No text clipped out of its box. |
| `test/e2e/content.e2e.mjs` | **The reveal invariant**: nothing on screen may be invisible. Checked after scrolling, after landing directly on an anchor, and after clicking every in-page nav link — at three widths. Plus the degraded paths: JS disabled, reduced motion — and the print path, where the About stat counters must still show real numbers on an unscrolled page. |
| `test/e2e/interaction.e2e.mjs` | Links resolve, anchors have targets, mobile menu opens, ⌘K opens and closes **on every page in `dist/`, not just the homepage**, dark is the default regardless of OS, the light choice survives a reload, every palette dot repaints and persists. **And the bfcache round trip** — a real history navigation with the back/forward cache switched on. |
| `test/e2e/mnist.e2e.mjs` | The lab classifies real pointer strokes; predictions are stable across digit size and across a theme switch; clearing resets; and no other page downloads the 44 KB weights chunk. |

The page list in `pages.e2e.mjs` is **read from `dist/`**, not hard-coded — a
new page is covered the moment it is built.

## Running them

```bash
npm test                 # unit + static + contrast (~3s, no browser)
npm run test:contrast    # palette legibility only
npm run test:e2e         # builds, then runs the browser suite (~2 min)

npm run test:e2e:content       # one browser file at a time
npm run test:e2e:interaction
```

`npm run test:e2e` builds first, because the suite deliberately tests `dist/`
rather than the sources.

## In CI

- **Both layers run on every pull request**, from `.github/workflows/e2e.yml` —
  the only workflow with a `pull_request` trigger. `npm test` goes first, ahead
  of the Chromium install: it is ~2 s against ~25 s for the install and ~5 min
  for the browser run, so a drift check or a contrast regression fails the job
  almost immediately instead of after work nobody will read the result of.
- Both also gate **deploy** (`deploy.yml`) and the weekly **palette rotation**
  (`rotate-palette.yml`); `npm test` additionally gates `build.yml`.

`npm test` used to be gated *only* on `push: [main]`, which meant a pull
request could sit green with all ~890 static assertions red — the first sign
of it was the deploy gate refusing to publish, after the merge. Nothing broken
reached the site, so it was a safe failure, but it put the signal on the wrong
side of the merge button: acting on it meant a revert or a follow-up commit on
`main` rather than another push to the branch. The lesson generalises past this
one workflow: **check which trigger a test actually runs under, not which file
it lives in.** It is the same shape as the two deleted Playwright files below
and the hand-written `npm test` list further down — a test that exists but
never executes reads exactly like a test that passes.

Two Playwright files predated `test/e2e/` and have now been **deleted**:
`test/playwright.ui.test.mjs` and `test/playwright.iphone.test.mjs`. They were
excluded from `npm test` and ran in no workflow at all — precisely how a
browser-observable bug reached production with a green suite. The note here
used to say they were "kept for their iPhone-specific layout regressions",
which had quietly stopped being true twice over: `test/e2e/pages.e2e.mjs`
covers 375px and 390px overflow and text clipping, and the UI file asserted
`.skill-bar-fill`, a class deleted when the CV skill bars became proficiency
tiers. A suite nobody runs does not decay gracefully — it decays into a file
that fails for reasons that are no longer bugs.

`npm test` is a **glob** for the same family of reasons. It used to enumerate
33 filenames by hand, and `test/theme-rebuild.test.mjs` was never added to the
list, so its three assertions — guarding the blank-canvas-after-theme-switch
regression — had never run in CI. Adding a file to `test/` is now enough.

## Writing new tests

**Ask which layer the bug lives in.** If you can answer the question by reading
a file, it belongs in `npm test` and should run there — it is a hundred times
faster. If answering it requires knowing where something ended up on screen,
what colour it actually painted, or what the browser did to the page, it needs
`test/e2e/` and nothing else will do.

**The invariants worth pinning are the silent ones.** A crash announces itself.
A section at `opacity: 0` does not: the markup is present, the DOM is correct,
nothing throws, and the page simply has a hole in it. Those are the ones to
assert, because they are the ones nobody notices until someone else does.

**Never assert only the happy path of a reveal.** `[data-animate]` starts
invisible and is shown by JavaScript. Any code with that shape needs a test
that the content is *visible*, not merely that the class was added.
