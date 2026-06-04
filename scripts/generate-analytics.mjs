#!/usr/bin/env node
/* ============================================================
   generate-analytics
   --------------------------------------------------------------
   Injects (or replaces) a cookieless GoatCounter "no-JS" tracking
   pixel in every indexable HTML page, wrapped in marker comments
   so a re-run replaces in place rather than appending duplicates:

     <!-- generated:analytics -->
     <img src="https://stocastico.goatcounter.com/count?p=/&amp;t=…" … />
     <!-- /generated:analytics -->

   Why a pixel and not the JS beacon: it adds no external <script>
   (nothing on script-src), sets no cookies, and collects no personal
   data — it only needs img-src loosened to the GoatCounter origin.
   The `p` (path) and `t` (title) are derived per page so the
   dashboard shows real page identifiers.

   The endpoint returns a 1×1 transparent GIF, so the pixel is
   invisible; it carries alt="" + width/height to satisfy the
   html-quality regressions.

   Run:  node scripts/generate-analytics.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* GoatCounter site endpoint — cookieless, no personal data. */
const ENDPOINT = 'https://stocastico.goatcounter.com/count';

const START_MARKER = '<!-- generated:analytics -->';
const END_MARKER   = '<!-- /generated:analytics -->';

const TARGETS = [
  'index.html',
  'cv.html',
  'projects.html',
  'publications.html',
  'travel.html',
  'links.html',
  '404.html',
  ...fs.readdirSync(path.join(ROOT, 'projects'))
       .filter(f => f.endsWith('.html'))
       .map(f => `projects/${f}`),
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

/* Decode the handful of HTML entities that show up in <title> values
   (notably &amp;) so the dashboard title reads naturally. */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/* Map a repo-relative file to the path GoatCounter should record. Mirrors the
   canonical URLs (which keep the .html extension); root + 404 are special. */
function pathFor(rel) {
  if (rel === 'index.html') return '/';
  if (rel === '404.html') return '/404';
  return '/' + rel;
}

function titleOf(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : '';
}

function block(rel, html) {
  const p = pathFor(rel);
  const t = titleOf(html);
  /* encodeURI keeps the path's slashes/dots literal (GoatCounter's documented
     form, e.g. ?p=/cv.html); the title is a free-text value so it gets the
     stricter encodeURIComponent. */
  let qs = `p=${encodeURI(p)}`;
  if (t) qs += `&t=${encodeURIComponent(t)}`;
  /* A literal '&' is invalid inside an HTML attribute value — write '&amp;';
     the browser decodes it back to '&' before requesting the pixel. */
  const src = `${ENDPOINT}?${qs}`.replace(/&/g, '&amp;');
  return [
    START_MARKER,
    `<img src="${src}" alt="" width="1" height="1" referrerpolicy="no-referrer-when-downgrade" style="position:absolute;left:-9999px;width:1px;height:1px" />`,
    END_MARKER,
  ].join('\n  ');
}

function injectInto(html, blk) {
  const startIdx = html.indexOf(START_MARKER);
  const endIdx   = html.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    return html.slice(0, startIdx) + blk + html.slice(endIdx + END_MARKER.length);
  }
  /* Insert right before </body> — present on every page in this repo. */
  const m = /<\/body>/i.exec(html);
  if (!m) throw new Error(`no </body> anchor`);
  return html.slice(0, m.index) + blk + '\n' + html.slice(m.index);
}

let changed = 0;
for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  const html = fs.readFileSync(abs, 'utf8');
  const next = injectInto(html, block(rel, html));
  if (next === html) continue;
  changed += 1;
  if (!DRY_RUN) fs.writeFileSync(abs, next);
  process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}updated ${rel}\n`);
}
process.stdout.write(`Done. ${changed}/${TARGETS.length} pages ${DRY_RUN ? 'would be ' : ''}updated.\n`);

export { pathFor, titleOf, block, ENDPOINT, TARGETS };
