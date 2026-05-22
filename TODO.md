# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Code structure

- **Continue extracting from `js/main.js`.** It is ~1670 lines and still owns
  most UI logic plus the `NoiseGradient` class. The Three.js classes already
  live in their own modules (`globe.js`, `neural-net.js`, `hero-shader.js`).
  Remaining candidate splits:
  - `js/noise-gradient.js` — pull `NoiseGradient` out of main.js
  - `js/ui.js` — navigation, command palette, scroll effects, etc.

## Polish / nice-to-have

- Add `color-scheme: dark` to `:root` so native form controls, scrollbars and
  the text caret match the dark theme.
- PWA manifest: add a stable `"id"` and a `maskable` icon variant so Android
  adaptive icons aren't letterboxed.
- Declare `og:image:width` / `og:image:height` (1200×630) on the social cards.
- Generate `.webp` siblings for the project backgrounds still served as JPEG
  (`clear-architecture`, `traction`, `avatech`) and point `data/projects.js` at
  them, matching the rest of the cards.

## Decisions (reviewed, deliberately not changed)

- `--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.
- The public contact email is intentional; leave the obfuscated address as-is.
