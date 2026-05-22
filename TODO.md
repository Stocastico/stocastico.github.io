# TODO

Outstanding items. Completed work and accepted trade-offs have been removed —
see git history if you need the audit context.

## Code structure

- **Continue extracting from `js/main.js`.** It is ~1450 lines and still owns
  most UI logic plus the `NoiseGradient` class. The Three.js classes have
  already moved into their own modules (`globe.js`, `neural-net.js`,
  `hero-shader.js`). Remaining candidate splits:
  - `js/noise-gradient.js` — pull `NoiseGradient` out of main.js
  - `js/ui.js` — navigation, command palette, scroll effects, etc.
