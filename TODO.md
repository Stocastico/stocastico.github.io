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

## Future ideas

- **Check the WebP social cards actually preview.** Most `projects/*.html` point
  `og:image` at a `.webp`; LinkedIn and WhatsApp have historically been
  unreliable with WebP previews, and LinkedIn is where these get shared. Run a
  couple through LinkedIn's Post Inspector — if they come back blank, render PNG
  cards for them (the `generate-og` machinery already exists). The two pages
  that ship PNGs (`mnist-lenet`, `rag-document-qa`) are unaffected.

## Decisions (reviewed, deliberately not changed)

- `--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.
- The public contact email is intentional; leave the obfuscated address as-is.
- Globe land texture (2048×1024) is rebuilt per construction / theme switch
  rather than cached across instances. Considered and skipped: the colours are
  theme-dependent and the rebuild path is the one behind past "blank globe
  after theme switch" bugs — not worth the GL-lifetime risk for a cost only
  paid on a manual (infrequent) theme toggle.
