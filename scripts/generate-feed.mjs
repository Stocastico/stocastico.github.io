#!/usr/bin/env node
/* ============================================================
   generate-feed  —  write public/feed.xml (Atom)

   The site courts the personal-web crowd — a blogroll, a /now page, an
   llms.txt — and a feed is the one staple of that world it was missing.
   There is no blog, so the feed carries what does change: one entry per
   project, plus one for the current state of the /now page.

   Like the sitemap, entry timestamps come from each page's last git commit
   date, so the feed cannot claim freshness the repository doesn't have.
   And like llms.txt, the /now entry lifts its date from the page's own
   "Last updated" line — one place to edit.

   Run:  node scripts/generate-feed.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PROJECTS } from '../data/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lib', 'site.json'), 'utf8'),
).url;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: node scripts/generate-feed.mjs [--dry-run]\n');
  process.exit(0);
}

const OUT = path.join(ROOT, 'public', 'feed.xml');

function escapeXml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* Last git commit date of a file as RFC 3339, falling back to mtime for an
   untracked file — same policy as generate-sitemap's <lastmod>. */
function lastmodFor(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch { /* fall through */ }
  return fs.statSync(abs).mtime.toISOString();
}

/* A project's URL may point off-site (the Donostia dataviz lives in another
   repo on the same origin), so resolve rather than assume projects/*.html. */
function projectUrl(p) {
  if (/^https?:\/\//.test(p.url)) return p.url;
  return `${SITE}/${String(p.url).replace(/^\//, '')}`;
}

/* The "Last updated 5 June 2026" line the /now page shows its readers. */
function nowPageDate() {
  const html = fs.readFileSync(path.join(ROOT, 'now.html'), 'utf8');
  const m = /Last updated\s+(\d{1,2}\s+\w+\s+\d{4})/.exec(html);
  if (!m) return null;
  const d = new Date(`${m[1]} UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function build() {
  const entries = [];

  const nowDate = nowPageDate() || lastmodFor('now.html');
  entries.push({
    /* The id carries the date so each /now update surfaces as a new entry
       in a reader instead of silently mutating an old one. */
    id: `${SITE}/now.html#${nowDate.slice(0, 10)}`,
    link: `${SITE}/now.html`,
    title: `Now — ${nowDate.slice(0, 10)}`,
    updated: nowDate,
    summary: 'What I’m focused on at the moment — work, reading, hobbies and life in Gipuzkoa.',
  });

  for (const p of PROJECTS) {
    const url = projectUrl(p);
    const page = /^projects\//.test(p.url) ? p.url : null;
    const updated = (page && lastmodFor(page)) || `${parseInt(p.year, 10)}-01-01T00:00:00Z`;
    entries.push({
      id: url,
      link: url,
      title: p.title,
      updated,
      summary: (p.description || '').replace(/\s+/g, ' ').trim(),
    });
  }

  const feedUpdated = entries.map((e) => e.updated).sort().at(-1);

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<feed xmlns="http://www.w3.org/2005/Atom">');
  lines.push(`  <title>Stefano Masneri</title>`);
  lines.push(`  <subtitle>Projects and now-page updates from stefanomasneri.com</subtitle>`);
  lines.push(`  <id>${SITE}/feed.xml</id>`);
  lines.push(`  <link href="${SITE}/feed.xml" rel="self" type="application/atom+xml"/>`);
  lines.push(`  <link href="${SITE}/" rel="alternate" type="text/html"/>`);
  lines.push(`  <updated>${feedUpdated}</updated>`);
  lines.push('  <author><name>Stefano Masneri</name><uri>' + SITE + '/</uri></author>');
  for (const e of entries) {
    lines.push('  <entry>');
    lines.push(`    <id>${escapeXml(e.id)}</id>`);
    lines.push(`    <title>${escapeXml(e.title)}</title>`);
    lines.push(`    <link href="${escapeXml(e.link)}" rel="alternate" type="text/html"/>`);
    lines.push(`    <updated>${e.updated}</updated>`);
    if (e.summary) lines.push(`    <summary>${escapeXml(e.summary)}</summary>`);
    lines.push('  </entry>');
  }
  lines.push('</feed>');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const text = build();
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (current === text) {
    process.stdout.write('feed.xml already up to date.\n');
    return;
  }
  if (!DRY_RUN) fs.writeFileSync(OUT, text);
  process.stdout.write(`✓ ${DRY_RUN ? '[dry] ' : ''}wrote public/feed.xml (${text.length} bytes)\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

export { build, OUT };
