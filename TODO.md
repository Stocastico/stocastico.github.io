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

- **Continue extracting from `js/main.js`.** It is ~1450 lines and still owns
  most UI logic plus the `NoiseGradient` class. The Three.js classes have
  already moved into their own modules (`globe.js`, `neural-net.js`,
  `hero-shader.js`). Remaining candidate splits:
  - `js/noise-gradient.js` — pull `NoiseGradient` out of main.js
  - `js/ui.js` — navigation, command palette, scroll effects, etc.
