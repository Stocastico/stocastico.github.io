#!/usr/bin/env node
/* ============================================================
   generate-project-jsonld
   --------------------------------------------------------------
   For each projects/<id>.html, inject (or replace) a
   <script type="application/ld+json"> block containing:

     - BreadcrumbList   Home > Projects > <project title>
     - Article          headline, description, image, author,
                        datePublished, url, mainEntityOfPage

   Source-of-truth fields are read directly from the page:
     <link rel="canonical">                         → url
     <title>                                        → headline
     <meta name="description">                      → description
     <meta property="og:image">                     → image
     <p class="project-detail__year">YYYY[ – YYYY]</p>  → datePublished

   The block is wrapped in HTML comment markers so a re-run finds
   and replaces it rather than appending duplicates:

     <!-- generated:project-jsonld --> ... <!-- /generated:project-jsonld -->

   Run:  node scripts/generate-project-jsonld.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT, 'projects');

// Single source of truth for the site origin — see scripts/lib/site.json.
const SITE_URL = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lib', 'site.json'), 'utf8'),
).url;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`Usage: node scripts/generate-project-jsonld.mjs [--dry-run]\n`);
  process.exit(0);
}

const START_MARKER = '<!-- generated:project-jsonld -->';
const END_MARKER   = '<!-- /generated:project-jsonld -->';

function attrLookup(html, regex, group = 1) {
  const m = html.match(regex);
  return m ? m[group].trim() : null;
}

function parsePage(html) {
  const canonical = attrLookup(html,
    /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  const title = attrLookup(html, /<title>([^<]+)<\/title>/i);
  /* Capture the content up to the matching quote (group 2) so apostrophes
     inside the description — e.g. "Gilles Laurent's department" — aren't
     truncated, which a [^"'] class would do. */
  const description = attrLookup(html,
    /<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1/i, 2);
  const ogImage = attrLookup(html,
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  const yearText = attrLookup(html,
    /<p\s+class=["']project-detail__year["']>\s*([^<]+?)\s*<\/p>/i);

  /* Year may be "2020", "2024", or a range like "2015 – 2017" / "2009 – 2014".
     For Article.datePublished use the first 4-digit segment, normalised to a
     full ISO-8601 date (YYYY-01-01) — Google's Article guidelines prefer a
     complete date over a bare year, and we only know the year. */
  let year = null;
  if (yearText) {
    const m = yearText.match(/(\d{4})/);
    if (m) year = `${m[1]}-01-01`;
  }

  /* Strip the " — Stefano Masneri" suffix from the headline. Tolerate either
     the em-dash or pipe separator so a stray "|" in a page <title> can't leak
     the site suffix into the structured-data headline/breadcrumb. */
  const headline = title ? title.replace(/\s+[—|]\s+Stefano Masneri\s*$/, '') : null;

  return { canonical, title, headline, description, ogImage, yearText, year };
}

function buildJsonLd({ canonical, headline, description, ogImage, year }) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',     item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE_URL}/projects.html` },
      { '@type': 'ListItem', position: 3, name: headline,   item: canonical },
    ],
  };
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    image: ogImage,
    author: {
      '@type': 'Person',
      name: 'Stefano Masneri',
      url: `${SITE_URL}/`,
    },
    publisher: {
      '@type': 'Person',
      name: 'Stefano Masneri',
    },
    datePublished: year,
    url: canonical,
    mainEntityOfPage: canonical,
  };
  /* Two separate <script> tags is the recommended form when you want both
     entities; Google parses each independently. */
  const indent = '  ';
  return [
    START_MARKER,
    `<script type="application/ld+json">`,
    JSON.stringify(breadcrumb, null, 2).split('\n').map(l => indent + l).join('\n').trimStart(),
    `</script>`,
    `<script type="application/ld+json">`,
    JSON.stringify(article, null, 2).split('\n').map(l => indent + l).join('\n').trimStart(),
    `</script>`,
    END_MARKER,
  ].join('\n');
}

function injectIntoHead(html, block) {
  const startIdx = html.indexOf(START_MARKER);
  const endIdx = html.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    return html.slice(0, startIdx) + block + html.slice(endIdx + END_MARKER.length);
  }
  /* Insert before </head>. */
  const headClose = html.indexOf('</head>');
  if (headClose === -1) {
    throw new Error('Could not find </head> to inject JSON-LD');
  }
  return html.slice(0, headClose) + block + '\n' + html.slice(headClose);
}

function processFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const meta = parsePage(html);
  const missing = [];
  if (!meta.canonical)   missing.push('canonical');
  if (!meta.headline)    missing.push('title');
  if (!meta.description) missing.push('description');
  if (!meta.ogImage)     missing.push('og:image');
  if (!meta.year)        missing.push('project-detail__year');
  if (missing.length) {
    throw new Error(`${path.basename(filePath)}: missing ${missing.join(', ')}`);
  }
  const block = buildJsonLd(meta);
  const next = injectIntoHead(html, block);
  if (next === html) return { changed: false };
  if (!DRY_RUN) fs.writeFileSync(filePath, next);
  return { changed: true };
}

function main() {
  const files = fs.readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(PROJECTS_DIR, f));
  let changed = 0;
  for (const f of files) {
    const r = processFile(f);
    if (r.changed) {
      changed += 1;
      process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}updated ${path.relative(ROOT, f)}\n`);
    }
  }
  process.stdout.write(`Done. ${changed}/${files.length} project pages ${DRY_RUN ? 'would be ' : ''}updated.\n`);
}

main();
