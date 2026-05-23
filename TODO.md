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

## Decisions (reviewed, deliberately not changed)

- `--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.
- The public contact email is intentional; leave the obfuscated address as-is.
