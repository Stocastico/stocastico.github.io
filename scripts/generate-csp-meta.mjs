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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CSP = [
  "default-src 'self'",
  /* JSON-LD + speculationrules need 'unsafe-inline' even though they're
     non-executable; the script-src directive applies to all <script> tags
     regardless of type. */
  "script-src 'self' 'unsafe-inline'",
  /* 404.html keeps an inline <style>; many pages use style="" attributes. */
  "style-src 'self' 'unsafe-inline'",
  /* GoatCounter no-JS analytics pixel (cookieless) loads from this origin. */
  "img-src 'self' data: blob: https://stocastico.goatcounter.com",
  "font-src 'self'",
  /* Geocoder calls nominatim.openstreetmap.org over fetch(). */
  "connect-src 'self' https://nominatim.openstreetmap.org",
  "media-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

const START_MARKER = '<!-- generated:csp-meta -->';
const END_MARKER   = '<!-- /generated:csp-meta -->';

const TARGETS = [
  'index.html',
  'cv.html',
  'projects.html',
  'travel.html',
  'links.html',
  '404.html',
  ...fs.readdirSync(path.join(ROOT, 'projects'))
       .filter(f => f.endsWith('.html'))
       .map(f => `projects/${f}`),
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function block() {
  return [
    START_MARKER,
    `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
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
