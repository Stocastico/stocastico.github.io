#!/usr/bin/env node
/* ============================================================
   generate-speculation-rules
   --------------------------------------------------------------
   Injects (or replaces) the Speculation Rules block in every HTML
   page, wrapped in marker comments so a re-run replaces in place:

     <!-- generated:speculation-rules -->
     <script type="speculationrules">…</script>
     <!-- /generated:speculation-rules -->

   Why a generator and not 21 hand-written blocks: the block used to
   live only in index.html, and only for /projects/*. So the page that
   actually lists all fourteen projects — projects.html — speculated
   nothing, and neither did any nav destination from any page. The CSS
   comment above @view-transition meanwhile claimed that home ↔ projects
   ↔ detail ↔ cv ↔ travel ↔ links all prerendered on hover. One block
   maintained by hand on one page out of twenty-one is how that gap
   opened; this is the same treatment the analytics pixel and the CSP
   meta already get.

   ── Why two rule types ───────────────────────────────────────────
   `prerender` runs the page: it fetches subresources, executes script,
   and paints into a hidden tab. `prefetch` fetches the *document only*.
   That difference decides the split here, because this site measures
   traffic with a no-JS <img> pixel (see generate-analytics.mjs).

   A prerender loads that pixel, so hovering a link for 200 ms records a
   visit to a page nobody opened. GoatCounter does filter speculative
   loads — but in `filter()` inside count.js, the JS integration this
   site deliberately does not use. The pixel has no such hook, and the
   pixel docs note the backend has less to work with. So:

     · prerender — /projects/* only. That is the pre-existing rule and
       the pre-existing caveat: project detail pages are the heavy ones
       (a hero image, sometimes an inline diagram) and the intent signal
       is strong, since the cards are the main thing on projects.html.
     · prefetch — every other page on the site. No subresources means no
       pixel, no Three.js on travel.html, no int8 weights on the MNIST
       page: just the HTML, which is the part that blocks first paint.

   `eagerness: "moderate"` on both — hover (~200 ms) or pointerdown, not
   page load. Nothing speculative happens until the visitor aims at
   something, and the browser drops the whole thing on slow connections,
   low battery or data-saver, so no JS guard is needed.

   The prefetch rule excludes /projects/* explicitly. `*` in a URL
   pattern crosses path segments, so `/*.html` matches
   /projects/foo.html too, and a URL matching both a prefetch and a
   prerender rule would be fetched twice.

   Inline <script> content is hashed into the CSP, so run
   `npm run generate-csp-meta` after this. (CLAUDE.md workflow rule 10.)

   Run:  node scripts/generate-speculation-rules.mjs [--dry-run] [--help]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const START_MARKER = '<!-- generated:speculation-rules -->';
const END_MARKER   = '<!-- /generated:speculation-rules -->';

const TARGETS = [
  'index.html',
  'cv.html',
  'projects.html',
  'publications.html',
  'travel.html',
  'links.html',
  'now.html',
  '404.html',
  ...fs.readdirSync(path.join(ROOT, 'projects'))
       .filter(f => f.endsWith('.html'))
       .map(f => `projects/${f}`),
];

/* The rules are identical on every page because every pattern is
   root-absolute. A relative href resolves before matching, so
   `projects/foo.html` on the homepage and `../projects/foo.html` on a
   detail page both test as /projects/foo.html. */
const RULES = {
  prerender: [
    { where: { href_matches: '/projects/*' }, eagerness: 'moderate' },
  ],
  prefetch: [
    {
      where: {
        and: [
          { href_matches: '/*.html' },
          /* Already covered by the prerender rule above. */
          { not: { href_matches: '/projects/*' } },
          /* Nothing links to it; it is reached by 404ing. */
          { not: { href_matches: '/404.html' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
};

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    'Usage: node scripts/generate-speculation-rules.mjs [--dry-run]\n\n' +
    '  --dry-run  Report what would change without writing.\n' +
    '  --help     Show this message.\n\n' +
    'Run `npm run generate-csp-meta` afterwards — the block is an inline\n' +
    '<script> and its sha256 is pinned in each page\'s CSP.\n');
  process.exit(0);
}
const DRY_RUN = args.includes('--dry-run');
for (const a of args) {
  if (!['--dry-run', '--help', '-h'].includes(a)) {
    process.stderr.write(`Unknown argument: ${a}\n`);
    process.exit(1);
  }
}

/* Two-space base indent, matching the other generated blocks so the
   committed HTML stays diffable. */
function block() {
  /* join('\n  ') below indents every line after the first, so the JSON is
     spread into its own elements rather than embedded as one multi-line
     string — otherwise only its first line would pick the indent up. */
  const json = JSON.stringify(RULES, null, 2).split('\n').map((l) => '  ' + l);
  return [
    START_MARKER,
    '<script type="speculationrules">',
    ...json,
    '</script>',
    END_MARKER,
  ].join('\n  ');
}

function injectInto(html, blk) {
  const startIdx = html.indexOf(START_MARKER);
  const endIdx   = html.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    return html.slice(0, startIdx) + blk + html.slice(endIdx + END_MARKER.length);
  }
  /* Insert before the analytics block if present (so the pixel stays the
     last thing in <body>), else before </body>. */
  const anchor = html.indexOf('<!-- generated:analytics -->');
  if (anchor !== -1) {
    const lineStart = html.lastIndexOf('\n', anchor) + 1;
    return html.slice(0, lineStart) + '  ' + blk + '\n' + html.slice(lineStart);
  }
  const m = /<\/body>/i.exec(html);
  if (!m) throw new Error('no </body> anchor');
  return html.slice(0, m.index) + '  ' + blk + '\n' + html.slice(m.index);
}

let changed = 0;
for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const next = injectInto(html, block());
  if (next === html) continue;
  changed += 1;
  if (!DRY_RUN) fs.writeFileSync(abs, next);
  process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}updated ${rel}\n`);
}
process.stdout.write(`Done. ${changed}/${TARGETS.length} pages ${DRY_RUN ? 'would be ' : ''}updated.\n`);
if (changed && !DRY_RUN) {
  process.stdout.write('Now run `npm run generate-csp-meta` — the inline script hash changed.\n');
}

export { RULES, TARGETS, block, START_MARKER, END_MARKER };
