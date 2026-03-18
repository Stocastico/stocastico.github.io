#!/usr/bin/env node
'use strict';

/**
 * generate-sitemap.js — Build sitemap.xml from the static pages + data/blog.js
 *
 * Usage:
 *   node scripts/generate-sitemap.js [options]
 *
 * Options:
 *   -o, --output <path>   Output file (default: sitemap.xml)
 *   --base-url <url>      Site root URL (default: https://stocastico.github.io)
 *   --dry-run             Print XML without writing
 *   -h, --help            Show help
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_BASE_URL = 'https://stocastico.github.io';
const DEFAULT_OUTPUT = 'sitemap.xml';

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    output: DEFAULT_OUTPUT,
    baseUrl: DEFAULT_BASE_URL,
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') out.output = argv[++i];
    else if (arg === '--base-url') out.baseUrl = argv[++i].replace(/\/$/, '');
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-sitemap.js [options]

Options:
  -o, --output <path>   Output sitemap file (default: sitemap.xml)
  --base-url <url>      Site root URL (default: ${DEFAULT_BASE_URL})
  --dry-run             Print generated XML without writing
  -h, --help            Show this help
`);
}

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadBlogPosts(blogJsPath) {
  const code = fs.readFileSync(blogJsPath, 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${code}\n;globalThis.__out = BLOG_POSTS;`, ctx, { filename: blogJsPath });
  if (!Array.isArray(ctx.__out)) throw new Error('BLOG_POSTS is not an array');
  return ctx.__out;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Sitemap builder ──────────────────────────────────────────────────────────

/**
 * Build a list of URL entries: { loc, lastmod, changefreq, priority }.
 */
function buildEntries(posts, baseUrl) {
  const today = todayIso();

  const entries = [
    // Main page — highest priority, changes frequently
    { loc: `${baseUrl}/`, lastmod: today, changefreq: 'weekly', priority: '1.0' },
    // Blog listing page — updates whenever a new post is added
    { loc: `${baseUrl}/blog.html`, lastmod: today, changefreq: 'weekly', priority: '0.8' },
  ];

  for (const post of posts) {
    if (/^https?:\/\//.test(post.url)) continue; // skip external links
    const loc = `${baseUrl}/${post.url.replace(/^\//, '')}`;
    entries.push({
      loc,
      lastmod: post.date,
      changefreq: 'yearly',
      priority: '0.7',
    });
  }

  return entries;
}

function buildSitemap(posts, baseUrl) {
  const entries = buildEntries(posts, baseUrl);
  const urlNodes = entries.map((e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <lastmod>${escapeXml(e.lastmod)}</lastmod>
    <changefreq>${escapeXml(e.changefreq)}</changefreq>
    <priority>${escapeXml(e.priority)}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlNodes}
</urlset>
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { printHelp(); return; }

  const blogJsPath = path.resolve('data/blog.js');
  if (!fs.existsSync(blogJsPath)) throw new Error(`Not found: ${blogJsPath}`);

  const posts = loadBlogPosts(blogJsPath);
  const xml = buildSitemap(posts, opts.baseUrl);

  if (opts.dryRun) {
    console.log(xml);
    return;
  }

  const outputPath = path.resolve(opts.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${posts.length + 1} URLs)`);
}

if (require.main === module) {
  main().catch((err) => { console.error(`Error: ${err.message}`); process.exitCode = 1; });
}

module.exports = { loadBlogPosts, buildSitemap, buildEntries, escapeXml, todayIso };
