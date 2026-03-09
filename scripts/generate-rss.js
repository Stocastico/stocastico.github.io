#!/usr/bin/env node
'use strict';

/**
 * generate-rss.js — Build rss.xml from data/blog.js
 *
 * Usage:
 *   node scripts/generate-rss.js [options]
 *
 * Options:
 *   -o, --output <path>   Output file (default: rss.xml)
 *   --base-url <url>      Site root URL (default: https://stocastico.github.io)
 *   --dry-run             Print XML without writing a file
 *   -h, --help            Show help
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SITE_TITLE = 'Stefano Masneri';
const SITE_DESCRIPTION = 'Senior AI Engineer — Machine Learning, Computer Vision, Augmented Reality';
const DEFAULT_BASE_URL = 'https://stocastico.github.io';
const DEFAULT_OUTPUT = 'rss.xml';

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
  node scripts/generate-rss.js [options]

Options:
  -o, --output <path>   Output RSS file (default: rss.xml)
  --base-url <url>      Site root URL (default: ${DEFAULT_BASE_URL})
  --dry-run             Print generated XML without writing
  -h, --help            Show this help
`);
}

// ─── Data loading ─────────────────────────────────────────────────────────────

/**
 * Load BLOG_POSTS from data/blog.js without requiring the module system
 * to handle the bare `const BLOG_POSTS = [...]` declaration format.
 */
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoToRfc822(isoDate) {
  // Parse YYYY-MM-DD without timezone shift
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toUTCString();
}

// ─── RSS builder ─────────────────────────────────────────────────────────────

function resolveItemUrl(postUrl, baseUrl) {
  if (/^https?:\/\//.test(postUrl)) return postUrl;
  return `${baseUrl}/${postUrl.replace(/^\//, '')}`;
}

function buildRss(posts, baseUrl) {
  const now = new Date().toUTCString();

  const items = posts.map((post) => {
    const link = resolveItemUrl(post.url, baseUrl);
    const pubDate = isoToRfc822(post.date);
    return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(post.excerpt)}</description>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(post.tag)}</category>
    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(baseUrl)}/</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-gb</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl)}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) { printHelp(); return; }

  const blogJsPath = path.resolve('data/blog.js');
  if (!fs.existsSync(blogJsPath)) throw new Error(`Not found: ${blogJsPath}`);

  const posts = loadBlogPosts(blogJsPath);
  const xml = buildRss(posts, opts.baseUrl);

  if (opts.dryRun) {
    console.log(xml);
    return;
  }

  const outputPath = path.resolve(opts.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, xml, 'utf8');
  console.log(`Generated ${path.relative(process.cwd(), outputPath)} (${posts.length} items)`);
}

if (require.main === module) {
  main().catch((err) => { console.error(`Error: ${err.message}`); process.exitCode = 1; });
}

module.exports = { loadBlogPosts, buildRss, escapeXml, isoToRfc822, resolveItemUrl };
