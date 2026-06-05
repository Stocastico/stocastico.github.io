#!/usr/bin/env node
/* ============================================================
   generate-sitemap  —  write sitemap.xml from data/projects.js +
                        HTML file mtimes.

   Listed pages:
     /                  (index.html)
     /projects.html
     /cv.html
     /projects/<id>.html  for every entry in PROJECTS that points
                          at a per-project detail page.

   <lastmod> is the file's git commit date if available, else its
   filesystem mtime. Format is YYYY-MM-DD.

   Run:  node scripts/generate-sitemap.mjs [--dry-run]
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../data/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Single source of truth for the site origin — see scripts/lib/site.json.
const SITE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lib', 'site.json'), 'utf8'),
).url;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`Usage: node scripts/generate-sitemap.mjs [--dry-run]\n`);
  process.exit(0);
}

function lastmodFor(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  /* Prefer the most recent git commit date; fall back to mtime when
     not in a git repo or file is untracked. */
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch { /* fall through */ }
  return fs.statSync(abs).mtime.toISOString().slice(0, 10);
}

async function main() {
  const projects = PROJECTS;

  /* Top-level pages with curated priority and changefreq. */
  const entries = [
    { rel: 'index.html',    loc: `${SITE}/`,             changefreq: 'weekly',  priority: '1.0' },
    { rel: 'projects.html', loc: `${SITE}/projects.html`, changefreq: 'weekly',  priority: '0.8' },
    { rel: 'publications.html', loc: `${SITE}/publications.html`, changefreq: 'monthly', priority: '0.6' },
    { rel: 'travel.html',   loc: `${SITE}/travel.html`,   changefreq: 'monthly', priority: '0.6' },
    { rel: 'links.html',    loc: `${SITE}/links.html`,    changefreq: 'monthly', priority: '0.5' },
    { rel: 'cv.html',       loc: `${SITE}/cv.html`,       changefreq: 'monthly', priority: '0.7' },
  ];

  /* One entry per project detail page. */
  for (const p of projects) {
    if (!p.url || !p.url.startsWith('projects/')) continue;
    entries.push({
      rel: p.url,
      loc: `${SITE}/${p.url}`,
      changefreq: 'yearly',
      priority: '0.6',
    });
  }

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const e of entries) {
    const mod = lastmodFor(e.rel) || new Date().toISOString().slice(0, 10);
    lines.push('  <url>');
    lines.push(`    <loc>${e.loc}</loc>`);
    lines.push(`    <lastmod>${mod}</lastmod>`);
    lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    lines.push(`    <priority>${e.priority}</priority>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  lines.push('');
  const xml = lines.join('\n');

  const outPath = path.join(ROOT, 'public', 'sitemap.xml');
  if (DRY_RUN) {
    process.stdout.write(xml);
    return;
  }
  fs.writeFileSync(outPath, xml);
  process.stdout.write(`✓ wrote ${path.relative(ROOT, outPath)} (${entries.length} URLs)\n`);
}

main().catch((err) => {
  process.stderr.write(`generate-sitemap failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
