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

## Nice-to-Have

### 9. Add a 404 page navbar
The 404 page currently has no navigation — just a "Back to Home" button.
Adding the standard navbar would help users find their way.

### 10. OG image for blog posts
Each blog post should ideally have its own OG image for social sharing.
The first post now falls back to `screenshot-hero.png`, but a post-specific
image (e.g. a generated card with the title) would be better for social media.
