#!/usr/bin/env node
/* ============================================================
   generate-llms  —  write public/llms.txt

   robots.txt goes out of its way to welcome AI crawlers ("so the site stays
   discoverable through AI assistants and AI-powered search, not just classic
   search engines"). llms.txt is the emerging convention for telling them what
   is actually here rather than making them infer it from markup.

   It is deliberately GENERATED rather than hand-written, for the same reason
   the sitemap is: a hand-maintained index of a site that gains a project page
   every few months is an index that is wrong within the year, and being
   confidently wrong to a machine reader is worse than being absent. Page
   descriptions are lifted from each page's own <meta name="description">, so
   there is exactly one place to edit them and this file cannot disagree with
   what a browser is told.

   Run:  node scripts/generate-llms.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECTS } from '../data/projects.js';
import { PUBLICATIONS } from '../data/publications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lib', 'site.json'), 'utf8'),
).url;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-llms.mjs [--dry-run]\n');
  process.exit(0);
}

const OUT = path.join(ROOT, 'public', 'llms.txt');

/* Top-level pages, in the order a reader should meet them. */
const PAGES = [
  { rel: 'index.html', loc: '/', label: 'Home' },
  { rel: 'cv.html', loc: '/cv.html', label: 'CV' },
  { rel: 'projects.html', loc: '/projects.html', label: 'Projects' },
  { rel: 'publications.html', loc: '/publications.html', label: 'Publications' },
  { rel: 'now.html', loc: '/now.html', label: 'Now' },
  { rel: 'travel.html', loc: '/travel.html', label: 'Travel' },
  { rel: 'links.html', loc: '/links.html', label: 'Links' },
];

/* The <meta name="description"> a browser is served. The attribute is
   line-wrapped in the source, so this cannot be a single-line regex — that
   mistake reads as "every page has an empty description". */
function descriptionOf(rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const m = /<meta\s+name="description"\s+content="([\s\S]*?)"/i.exec(html);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

/* Entity-decode the handful of escapes the HTML descriptions use. llms.txt is
   plain text, so &amp; there would be an error rather than an encoding. */
function decode(s) {
  return s
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&mdash;', '—')
    .replaceAll('&ndash;', '–')
    .replaceAll('&aacute;', 'á');
}

/* A project's URL may point off-site (the Donostia dataviz lives in another
   repo on the same origin), so resolve rather than assume projects/*.html. */
function projectUrl(p) {
  if (/^https?:\/\//.test(p.url)) return p.url;
  return `${SITE}/${String(p.url).replace(/^\//, '')}`;
}

function build() {
  const years = PUBLICATIONS.map((p) => Number(p.year)).filter(Number.isFinite);
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '';

  const lines = [];
  lines.push('# Stefano Masneri');
  lines.push('');
  /* Kept in step with the homepage's own <title> and description — an index
     that describes the site differently from the site is worse than none. */
  lines.push('> Senior AI Engineer at Mediapro, in San Sebastián, Spain. Builds AI that '
    + 'understands video and AI that generates it: computer vision, generative AI and '
    + '3D reconstruction, with a research background in augmented reality. This is a '
    + 'personal site: CV, project write-ups, peer-reviewed publications, and a few '
    + 'things built for their own sake.');
  lines.push('');
  lines.push('All content is written by Stefano Masneri unless a page says otherwise. '
    + 'Every page is server-rendered static HTML — nothing here needs JavaScript to read.');
  lines.push('');

  lines.push('## Pages');
  lines.push('');
  for (const page of PAGES) {
    const desc = decode(descriptionOf(page.rel));
    lines.push(`- [${page.label}](${SITE}${page.loc})${desc ? `: ${desc}` : ''}`);
  }
  lines.push('');

  lines.push('## Projects');
  lines.push('');
  for (const p of PROJECTS) {
    const kind = p.kind === 'personal' ? 'Personal project' : 'Professional work';
    const desc = (p.description || '').replace(/\s+/g, ' ').trim();
    lines.push(`- [${p.title}](${projectUrl(p)}): ${kind}, ${p.year}. ${desc}`);
  }
  lines.push('');

  lines.push('## Publications');
  lines.push('');
  lines.push(`- [Full publication list](${SITE}/publications.html): `
    + `${PUBLICATIONS.length} peer-reviewed papers${span ? `, ${span}` : ''}. `
    + 'Titles, authors and venues, with links to the canonical version where one exists.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const text = build();
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (current === text) {
    process.stdout.write('llms.txt already up to date.\n');
    return;
  }
  if (!DRY_RUN) fs.writeFileSync(OUT, text);
  process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}wrote public/llms.txt (${text.length} bytes)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

export { build, OUT };
