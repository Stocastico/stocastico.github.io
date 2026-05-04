# TODO

Outstanding items. Completed work and accepted trade-offs have been removed —
see git history if you need the audit context.

## Accessibility

- **Globe canvas is not keyboard-navigable.** Interactive pins on the 3-D
  globe can't be reached with Tab. Consider exposing the same data as a
  visually-hidden description list so screen-reader / keyboard users can still
  read the locations.
- **Verify side-dot nav `aria-label`s.** Confirm the JS sets `aria-label` on
  each dot (not just `data-label`) so screen readers announce the section name.

## Code structure

- **Split `js/main.js`.** It is ~3000 lines containing 5 WebGL classes plus
  most UI logic. As the site grows, consider splitting into separate modules
  (no bundler needed — `<script defer>` tags preserve execution order):
  - `js/neural-network.js` — hero animation
  - `js/globe.js` — `Globe3D` + `GlobeFallback2D`
  - `js/hero-shader.js` — `HeroNameShader` + `NoiseGradient`
  - `js/ui.js` — navigation, command palette, scroll effects, etc.
