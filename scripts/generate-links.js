#!/usr/bin/env node
'use strict';

/*
  generate-links.js

  Compiles data/links.yaml — a flat, curated list of high-quality sites and
  technical blogs Stefano follows — into the generated ESM module data/links.js,
  consumed by renderLinks() in js/main.js on the links page.

  Each entry carries one or more `categories` (and optional `tags`). The same
  site is listed once; this generator:
    • validates names + restricts URLs to https:// (so a rendered link can never
      become a javascript:/data:/protocol-relative injection vector),
    • de-duplicates by URL, merging the categories/tags of any duplicate entry,
    • emits the ordered set of categories actually in use (slug + display label)
      so the page can build its filter chips.

  Output shape:
    LINKS = {
      categories: [ { slug, label }, ... ],   // in CATEGORY_ORDER, only those used
      links:      [ { name, url, description?, categories: [slug...], tags: [...] } ]
    }
*/

const fs = require('node:fs');
const path = require('node:path');

const { parseYaml } = require('./lib/yaml');
const { toPosix } = require('./lib/paths');

/* Canonical category order + human-readable labels for the filter chips.
   Unknown slugs are tolerated (humanised + appended) so no link silently
   loses a category, but keeping a link's categories within this set keeps the
   chip bar tidy. */
const CATEGORY_LABELS = {
  'ai': 'AI',
  'engineering-math-physics': 'Engineering, Math & Physics',
  'visual-explanation': 'Visual Explanations',
  'beautiful-websites': 'Beautiful Websites',
  'misc': 'Miscellany',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

function isSafeHttpsUrl(url) {
  return typeof url === 'string' && /^https:\/\/\S+$/i.test(url.trim());
}

/* Title-case a slug as a fallback label (e.g. "tools-for-thought" → "Tools For
   Thought") for categories not in CATEGORY_LABELS. */
function humanizeSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function labelFor(slug) {
  return CATEGORY_LABELS[slug] || humanizeSlug(slug);
}

/* Coerce a YAML scalar/array field into a clean, de-duplicated array of
   non-empty trimmed strings, order preserved. */
function toStringList(value) {
  const arr = Array.isArray(value) ? value : (value == null ? [] : [value]);
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function compileLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!name || !isSafeHttpsUrl(url)) return null;

  const categories = toStringList(raw.categories);
  if (!categories.length) return null; /* every link needs at least one category */

  const link = { name, url, categories };
  if (typeof raw.description === 'string' && raw.description.trim() !== '') {
    link.description = raw.description.trim();
  }
  const tags = toStringList(raw.tags);
  if (tags.length) link.tags = tags;
  return link;
}

/* A stable key for URL de-duplication: scheme + host + path (trailing slash
   stripped) + query, lower-cased. Falls back to a trimmed/lower-cased string
   if the URL cannot be parsed. */
function dedupeKey(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase();
  } catch (_) {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

function mergeInto(existing, incoming) {
  for (const c of incoming.categories) {
    if (!existing.categories.includes(c)) existing.categories.push(c);
  }
  if (incoming.tags && incoming.tags.length) {
    const tags = existing.tags || [];
    for (const t of incoming.tags) if (!tags.includes(t)) tags.push(t);
    if (tags.length) existing.tags = tags;
  }
  if (!existing.description && incoming.description) existing.description = incoming.description;
}

function compileLinks(source) {
  const rawLinks = (source && Array.isArray(source.links)) ? source.links : [];

  const byKey = new Map();
  const links = [];
  let duplicates = 0;

  for (const rawLink of rawLinks) {
    const link = compileLink(rawLink);
    if (!link) continue;
    const key = dedupeKey(link.url);
    if (byKey.has(key)) {
      mergeInto(byKey.get(key), link);
      duplicates += 1;
      continue;
    }
    byKey.set(key, link);
    links.push(link);
  }

  /* Ordered list of categories actually in use: known ones first (in
     CATEGORY_ORDER), then any unknown slugs in first-appearance order. */
  const used = new Set();
  for (const link of links) for (const c of link.categories) used.add(c);

  const ordered = [];
  for (const slug of CATEGORY_ORDER) if (used.has(slug)) ordered.push(slug);
  for (const link of links) {
    for (const c of link.categories) {
      if (!CATEGORY_ORDER.includes(c) && !ordered.includes(c)) ordered.push(c);
    }
  }
  const categories = ordered.map((slug) => ({ slug, label: labelFor(slug) }));

  return { categories, links, _duplicates: duplicates };
}

function toLinksJs(data, sourcePath) {
  const payload = JSON.stringify({ categories: data.categories, links: data.links }, null, 2);
  return `/* eslint-disable */
/* Generated by scripts/generate-links.js from ${sourcePath} */
export const LINKS = ${payload};

if (typeof globalThis !== 'undefined') globalThis.LINKS = LINKS;
`;
}

function parseArgs(argv) {
  const out = { input: 'data/links.yaml', output: 'data/links.js', dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') out.input = argv[++i];
    else if (arg === '--output' || arg === '-o') out.output = argv[++i];
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-links.js [options]

Options:
  -i, --input <path>    YAML source (default: data/links.yaml)
  -o, --output <path>   generated JS output (default: data/links.js)
      --dry-run         print the module without writing it
  -h, --help            show this help
`);
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);

  const source = parseYaml(fs.readFileSync(inputPath, 'utf8'));
  const data = compileLinks(source);
  const js = toLinksJs(data, toPosix(path.relative(process.cwd(), inputPath)));

  if (options.dryRun) {
    console.log(js);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, js, 'utf8');
  console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Categories: ${data.categories.length}, Links: ${data.links.length}` +
    (data._duplicates ? `, merged ${data._duplicates} duplicate URL(s)` : ''));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  compileLinks,
  compileLink,
  isSafeHttpsUrl,
  toLinksJs,
  dedupeKey,
  labelFor,
  humanizeSlug,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  parseYaml,
};
