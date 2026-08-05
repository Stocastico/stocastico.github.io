#!/usr/bin/env node
/* ============================================================
   generate-csp-meta
   --------------------------------------------------------------
   Injects (or replaces) a Content-Security-Policy meta tag in
   every indexable HTML page. Wrapped in marker comments so a
   re-run replaces in place rather than appending duplicates:

     <!-- generated:csp-meta -->
     <meta http-equiv="Content-Security-Policy" content="..." />
     <!-- /generated:csp-meta -->

   Edit CSP below, re-run, commit.
   Run:  node scripts/generate-csp-meta.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* Every inline <script> (no src) on a page — JSON-LD + speculationrules — gets
   a 'sha256-…' hash so we can drop 'unsafe-inline' from script-src entirely.
   The browser hashes the exact text between <script…> and </script>; we hash
   the same bytes. Returns sorted, de-duplicated source-expression tokens. */
export function inlineScriptHashes(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const out = new Set();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/\bsrc\s*=/i.test(m[1])) continue; // external script — covered by 'self'
    const digest = crypto.createHash('sha256').update(m[2], 'utf8').digest('base64');
    out.add(`'sha256-${digest}'`);
  }
  return [...out].sort();
}

/* Build the policy for one page. script-src lists 'self' + the page's inline
   hashes (no 'unsafe-inline'). style-src keeps 'unsafe-inline' — inline style=""
   attributes (e.g. the project hero image, the analytics pixel) and 404.html's
   inline <style> can't be hashed without 'unsafe-hashes', and the trade-off
   isn't worth it for a static site. */
export function cspFor(html) {
  const scriptSrc = ["'self'", ...inlineScriptHashes(html)].join(' ');
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    /* GoatCounter no-JS analytics pixel (cookieless) loads from this origin. */
    "img-src 'self' data: blob: https://stocastico.goatcounter.com",
    "font-src 'self'",
    /* Same-origin only. This used to allow https://nominatim.openstreetmap.org
       for js/globe.js's runtime geocoder — a lookup that had long stopped being
       reachable, because scripts/generate-locations.js bakes every coordinate
       into data/locations.js at build time and the geocoder returned at its
       first guard every time. It was the one third-party origin in the policy
       of all 21 pages, on a site whose stated position is that it makes no
       third-party requests except the analytics pixel. The code is gone (see
       the note at the top of js/globe.js) and so is the allowance. */
    "connect-src 'self'",
    "media-src 'self'",
    "worker-src 'self'",
    /* No frame-ancestors: the CSP spec ignores it (with sandbox and
       report-uri) when delivered via a <meta> element, and GitHub Pages
       cannot send real headers — listing it here would only document
       protection the site doesn't have. */
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

const START_MARKER = '<!-- generated:csp-meta -->';
const END_MARKER   = '<!-- /generated:csp-meta -->';

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

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function block(csp) {
  return [
    START_MARKER,
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    END_MARKER,
  ].join('\n  ');
}

function injectInto(html, blk) {
  const startIdx = html.indexOf(START_MARKER);
  const endIdx   = html.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    return html.slice(0, startIdx) + blk + html.slice(endIdx + END_MARKER.length);
  }
  /* Insert immediately after the viewport meta — predictable anchor that
     every page in this repo carries. */
  const viewportRe = /<meta[^>]*name=["']viewport["'][^>]*>\s*\n/i;
  const m = viewportRe.exec(html);
  if (!m) throw new Error('no <meta name="viewport"> anchor');
  const insertPoint = m.index + m[0].length;
  return html.slice(0, insertPoint) + '  ' + blk + '\n' + html.slice(insertPoint);
}

function main() {
  let changed = 0;
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    const html = fs.readFileSync(abs, 'utf8');
    const next = injectInto(html, block(cspFor(html)));
    if (next === html) continue;
    changed += 1;
    if (!DRY_RUN) fs.writeFileSync(abs, next);
    process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}updated ${rel}\n`);
  }
  process.stdout.write(`Done. ${changed}/${TARGETS.length} pages ${DRY_RUN ? 'would be ' : ''}updated.\n`);
}

/* Only run the writer when invoked directly (so importing for tests is safe). */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

export { TARGETS };
