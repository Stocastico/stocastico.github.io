# Website Pre-Launch TODO

Items that require manual action or decisions before publishing.

## Must Do (Before Launch)

### 1. Create or remove the CV PDF download
The CV page (`cv.html:78`) has a "Download PDF" button linking to `docs/cv.pdf`,
but this file does not exist. Either:
- Generate a PDF version of your CV and place it at `docs/cv.pdf`
- Remove the download button from `cv.html`

### 2. Add PhD defense slides link (optional)
The defense slides link was removed from the About section because it pointed
to `href="#"`. If you have a URL for the slides (e.g. on SlideShare or Google
Slides), add it back to `index.html` in the About bio paragraph:
```html
researched collaborative, multi-user augmented reality experiences for education
(<a href="YOUR_URL_HERE" class="inline-link" target="_blank" rel="noopener">defense slides</a>).
```

## Recommended Improvements

### 3. Upgrade Three.js
Currently using `r134` (2022). Consider upgrading to `r160+` for performance
improvements and bug fixes. The CDN link is in `index.html:687`:
```html
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
```
**Note:** Test the globe, neural network, and hero name shader after upgrading —
API changes between versions may require minor adjustments.

### 4. Consider self-hosting Google Fonts
The fonts (Inter + Playfair Display) are loaded from Google's CDN. Self-hosting
them would:
- Eliminate the DNS lookup + connection to `fonts.googleapis.com`
- Improve privacy (no Google tracking)
- Allow full control over `font-display` and subset loading

Tools like [google-webfonts-helper](https://gwfh.mranftl.com/) can generate the
font files and CSS needed.

### 5. Blog post template improvements
When creating future blog posts, ensure the template (`docs/blog-post-template.md`)
includes:
- The hamburger toggle button in the nav (now added to the first post)
- The site footer (now added to the first post)
- The home icon SVG in the nav logo (now added to the first post)
- Open Graph / Twitter Card meta tags
- Only load highlight.js on posts that actually contain code blocks

### 6. Consider reducing hero CTA buttons
The hero section has 4 CTA buttons (About, Work, Writing, Contact). This may
dilute the primary call-to-action. Consider keeping just 2 (e.g. "About" as
primary + "Contact" as ghost) and letting the navbar handle the rest.

### 7. Add copy-email feedback
The command palette's "Copy email address" action silently copies to clipboard.
Consider adding a brief toast/snackbar notification (e.g. "Email copied!") so
users know the action succeeded.

### 8. Consider splitting main.js
`js/main.js` is ~3000 lines containing 5 WebGL classes and dozens of UI functions.
As the site grows, consider splitting into separate modules:
- `js/neural-network.js` — hero animation
- `js/globe.js` — Globe3D + GlobeFallback2D
- `js/hero-shader.js` — HeroNameShader + NoiseGradient
- `js/ui.js` — navigation, command palette, scroll effects, etc.

Even without a bundler, separate `<script defer>` tags maintain execution order.

## Audit Findings (March 2026)

Comprehensive UI/UX, accessibility, performance, and code audit results.

### Priority Fix Summary

| Priority | Issue | Effort |
|----------|-------|--------|
| **High** | Footer claims "React" — should be removed/corrected | 1 min |
| **High** | Command palette CV PDF path wrong (`cv.pdf` → `docs/cv.pdf`) | 1 min |
| **Medium** | `--text-faint` (#6a7788) fails WCAG AA contrast on dark bg | 10 min |
| **Medium** | Sitemap missing `cv.html` | 2 min |
| **Medium** | Blog post inline styles → CSS class | 2 min |
| **Low** | Mobile nav focus trapping | 20 min |
| **Low** | Print stylesheet | 10 min |
| **Low** | Add `loading="lazy"` to photo.jpg | 1 min |
| **Low** | Dead theme script in `cv.html` | 1 min |

### Accessibility

- **`--text-faint` fails WCAG AA**: `#6a7788` on `#080c14` is ~3.7:1 contrast
  (needs 4.5:1). Affects stat labels, footer text, globe subtitles, scroll hint.
  Lighten to ~`#8a97a8` or similar to reach 4.5:1.
- **Email reveal pattern**: Screen readers just hear "Click to reveal". Add
  `aria-description` explaining the anti-spam behavior.
- **Globe canvas inaccessible to keyboard**: Interactive pins can't be
  tab-navigated. Consider a visually-hidden description list as fallback.
- **Side dots nav**: Verify JS sets `aria-label` on each dot (not just
  `data-label`).
- **Mobile hamburger menu doesn't trap focus**: Keyboard users can tab past the
  open menu overlay into content behind it.

### Performance

- **Three.js from CDN (~640KB gzipped)**: Only a fraction of Three.js is used.
  A tree-shaken ESM import would cut size dramatically, but requires a bundler.
  Pragmatic trade-off for GitHub Pages.
- **`world-110m.json` fetched twice**: Once by `Globe3D._buildGlobe()` and once
  by `EuropeMap2D._loadTopoJSON()`. Share a data promise to avoid double-parse.
- **Scroll handler reads `offsetTop`**: `setActiveLink()` reads
  `section.offsetTop` on every scroll event, which can cause forced layout.
  Consider IntersectionObserver for section tracking instead.
- **`photo.jpg` served at 1088×1088 but displayed at ~200px**: Add
  `loading="lazy"` and consider serving a smaller version.
- **Verify `main.min.js` is up to date** with `main.js` source before publishing.

### UI / UX

- **Footer says "Built with React"**: No React in the codebase — this is vanilla
  JS + Three.js. Remove or correct.
- **Command palette CV PDF path**: `window.open('cv.pdf')` should be
  `window.open('docs/cv.pdf')`.
- **Defense slides link** (`docs/defense.pdf`): File does not exist in repo.
  (Already known.)
- **Blog post inline styles**: `a-personal-website.html:83` uses inline
  `style="display:flex;..."` — should be a CSS class.
- **No active nav indicator on blog post pages**: Nav links point to
  `../index.html#blog` but nothing highlights "Writing" as current.
- **Dead theme script in `cv.html:6`**: Reads from localStorage but theme
  switching is disabled. `index.html` doesn't have it. Remove for consistency.

### SEO

- **Sitemap missing `cv.html`**: Add it to `sitemap.xml`.
- **Blog structured data**: Could add `"image"` and `"wordCount"` properties to
  the BlogPosting JSON-LD.
- **Twitter creator**: Add `<meta name="twitter:creator">` if you have a handle.

### Code / Misc

- **No print styles**: Dark background + light text wastes ink and may be
  unreadable. Add at minimum:
  ```css
  @media print { body { background: white; color: black; } }
  ```
- **`#nav-grad` SVG gradient ID** is repeated across pages. Not a current issue
  (one nav per page) but technically invalid if multiple navs were ever present.
- **`EuropeMap2D._loadTopoJSON()`** uses relative path `'./data/world-110m.json'`
  — works from root only. Fine since it's only loaded on `index.html`.
- **`100svh` on `#hero`**: Well-supported now, with `min-height: 600px` fallback.
  No action needed.
- **Geocoding function** sends requests to Nominatim without a User-Agent (ToS
  violation). But since all coordinates are pre-generated, this never runs in
  production. No action needed.

## Nice-to-Have

### 9. Add a 404 page navbar
The 404 page currently has no navigation — just a "Back to Home" button.
Adding the standard navbar would help users find their way.

### 10. OG image for blog posts
Each blog post should ideally have its own OG image for social sharing.
The first post now falls back to `screenshot-hero.png`, but a post-specific
image (e.g. a generated card with the title) would be better for social media.
