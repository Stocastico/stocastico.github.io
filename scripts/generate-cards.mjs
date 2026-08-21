#!/usr/bin/env node
/* ============================================================
   generate-cards
   --------------------------------------------------------------
   Server-renders the project cards and publication items into static HTML so
   they're visible to crawlers and no-JS visitors (previously these grids were
   empty <div>s filled only at runtime). js/main.js then re-hydrates them:
   the homepage shuffles its 3 project cards, publications.html lists them all.

   Markup comes from the SAME builders js/main.js uses
   (js/render-cards.js), so server- and client-rendered HTML can't drift.

   Replaces the content between marker comments, in place:
     <!-- generated:project-cards -->      … <!-- /generated:project-cards -->
     <!-- generated:publication-items -->  … <!-- /generated:publication-items -->
     <!-- generated:publications-jsonld --> … <!-- /generated:publications-jsonld -->

   Run:  node scripts/generate-cards.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  projectCardHtml, publicationsListLines, homepageProjects, assertProjectKinds,
} from '../js/render-cards.js';
import {
  cvTimelineLines, cvSkillsLines, unescoAccordionLines, unescoTotalLines, linksGridLines,
  projectFilterLines,
} from '../js/render-page.js';
import { PROJECT_TAGS } from '../js/project-tags.js';
import { PROJECTS } from '../data/projects.js';
import { PUBLICATIONS } from '../data/publications.js';
import { CV_CAREER, CV_EDUCATION, CV_SKILLS } from '../data/cv.js';
import { UNESCO } from '../data/unesco.js';
import { LINKS } from '../data/links.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE_URL = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lib', 'site.json'), 'utf8'),
).url;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-cards.mjs [--dry-run]\n');
  process.exit(0);
}

const HOMEPAGE_PROJECTS = 3;

/* Replace the lines between <!-- name --> and <!-- /name -->, preserving the
   indentation the start marker sits at. `lines` is an array of HTML strings,
   one per output line. */
function replaceBlock(html, name, lines, file) {
  const start = `<!-- ${name} -->`;
  const end = `<!-- /${name} -->`;
  const sIdx = html.indexOf(start);
  const eIdx = html.indexOf(end);
  if (sIdx === -1 || eIdx === -1) {
    throw new Error(`${file}: missing ${start} / ${end} markers`);
  }
  /* Indentation = whitespace between the previous newline and the start marker. */
  const lineStart = html.lastIndexOf('\n', sIdx) + 1;
  const indent = html.slice(lineStart, sIdx);
  const body = lines.length
    ? '\n' + lines.map((l) => indent + l).join('\n') + '\n' + indent
    : '\n' + indent;
  return html.slice(0, sIdx) + start + body + html.slice(eIdx);
}

/* JSON-LD CollectionPage listing every publication (name + optional url). */
function publicationsJsonLd() {
  const itemListElement = PUBLICATIONS.map((pub, i) => {
    const item = { '@type': 'ListItem', position: i + 1, name: pub.title };
    if (pub.url) item.url = pub.url;
    return item;
  });
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    url: `${SITE_URL}/publications.html`,
    name: 'Publications | Stefano Masneri',
    description: 'Full list of peer-reviewed publications by Stefano Masneri.',
    author: { '@type': 'Person', name: 'Stefano Masneri', url: `${SITE_URL}/` },
    mainEntity: { '@type': 'ItemList', itemListElement },
  };
  const json = JSON.stringify(obj, null, 2).split('\n');
  return ['<script type="application/ld+json">', ...json, '</script>'];
}

/* file → { markerName: () => string[] } */
const TARGETS = {
  'index.html': {
    /* Professional work only, and filtered BEFORE the cap — the homepage is a
       shop window. renderProjects() in js/main.js re-shuffles this same set on
       load; if only one of the two filtered, a no-JS visitor and a JS visitor
       would see different portfolios. Both call homepageProjects(). */
    'generated:project-cards': () =>
      homepageProjects(PROJECTS).slice(0, HOMEPAGE_PROJECTS).map((p, i) => projectCardHtml(p, i)),
    'generated:publication-items': () =>
      publicationsListLines(PUBLICATIONS.filter((p) => p.featured), { grouped: false }),
  },
  'projects.html': {
    'generated:project-filter': () => projectFilterLines(PROJECTS, PROJECT_TAGS),
    /* level 2, not 3: this page's only other heading is the <h1>, so h3 here
       would skip a rank. index.html above keeps the default 3 because its
       cards sit under an <h2> section title. */
    'generated:project-cards': () => PROJECTS.map((p, i) => projectCardHtml(p, i, { level: 2 })),
  },
  'publications.html': {
    'generated:publication-items': () =>
      publicationsListLines(PUBLICATIONS, { grouped: true }),
    'generated:publications-jsonld': () => publicationsJsonLd(),
  },
  /* The three pages below used to ship as empty <div>s — see the header of
     js/render-page.js for what that cost. Same machinery, same builders, same
     drift test; the only reason they were not here from the start is that
     nobody re-read the rule after writing it. */
  'cv.html': {
    'generated:cv-timeline': () => cvTimelineLines(CV_CAREER, CV_EDUCATION),
    'generated:cv-skills': () => cvSkillsLines(CV_SKILLS),
  },
  'travel.html': {
    'generated:unesco-total': () => unescoTotalLines(UNESCO),
    'generated:unesco-accordion': () => unescoAccordionLines(UNESCO),
  },
  'links.html': {
    'generated:links-grid': () => linksGridLines(LINKS),
  },
};

/* Apply every target's blocks to a fresh read of its file; returns the new
   HTML keyed by file (does not write). Pure — safe to call from tests. */
function renderAll() {
  assertProjectKinds(PROJECTS);
  const out = {};
  for (const [rel, blocks] of Object.entries(TARGETS)) {
    let html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const [name, build] of Object.entries(blocks)) {
      html = replaceBlock(html, name, build(), rel);
    }
    out[rel] = html;
  }
  return out;
}

function main() {
  const rendered = renderAll();
  let changed = 0;
  for (const [rel, html] of Object.entries(rendered)) {
    const abs = path.join(ROOT, rel);
    if (html === fs.readFileSync(abs, 'utf8')) continue;
    changed += 1;
    if (!DRY_RUN) fs.writeFileSync(abs, html);
    process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}updated ${rel}\n`);
  }
  process.stdout.write(`Done. ${changed}/${Object.keys(TARGETS).length} pages ${DRY_RUN ? 'would be ' : ''}updated.\n`);
}

/* Only run the writer when invoked directly (so importing for tests is safe). */
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

export { replaceBlock, publicationsJsonLd, renderAll, TARGETS };
