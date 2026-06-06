# TODO

Outstanding items. Completed work has been removed — see git history if you
need the audit context.

## Future ideas

- Optional polish (low priority, deliberately left for now): per-page footer
  links to LinkedIn/GitHub/Scholar on standalone pages; making the title
  role-suffix fully uniform (cv / projects / publications carry a role, others
  don't — treated as page-appropriate, not drift).

## Decisions (reviewed, deliberately not changed)

- `--text-faint` contrast (~3.4:1) sits below WCAG AA for small text — kept as
  an intentional aesthetic choice.
- The public contact email is intentional; leave the obfuscated address as-is.
- Globe land texture (2048×1024) is rebuilt per construction / theme switch
  rather than cached across instances. Considered and skipped: the colours are
  theme-dependent and the rebuild path is the one behind past "blank globe
  after theme switch" bugs — not worth the GL-lifetime risk for a cost only
  paid on a manual (infrequent) theme toggle.
