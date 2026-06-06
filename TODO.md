# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Future ideas

- **Light theme + toggle.** The theme pipeline already supports multiple
  palettes, but the site is hard-locked to `data-theme="dark"`. Add a light
  palette and an OS-preference-aware toggle (`prefers-color-scheme`).

## Decisions (reviewed, deliberately not changed)

- `--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.
- The public contact email is intentional; leave the obfuscated address as-is.
