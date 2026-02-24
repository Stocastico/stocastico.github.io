#!/usr/bin/env node
'use strict';

/**
 * new-post.js — Convert a Markdown file into a blog post HTML file and register
 * it in data/blog.js.
 *
 * Usage:
 *   node scripts/new-post.js path/to/post.md [options]
 *
 * Options:
 *   --out-dir <dir>   Output directory for the HTML file (default: blog/)
 *   --dry-run         Print generated HTML and blog.js entry without writing files
 *   -h, --help        Show this help
 *
 * Markdown frontmatter (required fields):
 *   ---
 *   title:   "My Post Title"
 *   date:    "2024-12-01"
 *   excerpt: "Short summary shown on the blog index."
 *   tag:     "Research"          # badge colour key
 *   readMin: 7                   # estimated read time in minutes
 *   ---
 *
 * Optional frontmatter:
 *   lead:    "Opening sentence displayed in large type."
 *   url:     "blog/custom-name.html"   # override auto-generated filename
 *
 * Supported Markdown syntax:
 *   # Heading 1   →  <h1>
 *   ## Heading 2  →  <h2>
 *   ### Heading 3 →  <h3>
 *   **bold**      →  <strong>
 *   *italic*      →  <em>
 *   `inline code` →  <code>
 *   [text](url)   →  <a>
 *   - item        →  <ul><li>
 *   1. item       →  <ol><li>
 *   ```lang ... ```  →  <pre><code>
 *   > quote       →  <blockquote>
 *   Blank line    →  closes/opens <p>
 */

const fs = require('node:fs');
const path = require('node:path');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    input: null,
    outDir: 'blog',
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out-dir' || arg === '-o') out.outDir = argv[++i];
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (!arg.startsWith('-')) out.input = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/new-post.js <markdown-file> [options]

Options:
  -o, --out-dir <dir>   Output directory for HTML (default: blog/)
  --dry-run             Print output without writing files
  -h, --help            Show this help

Frontmatter fields (YAML between --- delimiters):
  title    (required)  Post title
  date     (required)  ISO date, e.g. 2024-12-01
  excerpt  (required)  Short summary for the blog index card
  tag      (required)  Badge label, e.g. Research / Engineering / AI
  readMin  (required)  Estimated reading time in minutes
  lead               Optional opening sentence in large type
  url                Override the auto-generated blog/slug.html path
`);
}

// ─── Frontmatter parser ───────────────────────────────────────────────────────

/**
 * Split raw file content into { frontmatter: string, body: string }.
 * Frontmatter is the YAML text between the two `---` delimiters.
 * Returns null for frontmatter if the file does not start with `---`.
 */
function splitFrontmatter(raw) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.startsWith('---')) {
    return { frontmatter: '', body: normalized };
  }
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: '', body: normalized };
  }
  const frontmatter = normalized.slice(4, end).trim();
  const body = normalized.slice(end + 4).trimStart();
  return { frontmatter, body };
}

/**
 * Parse a minimal subset of YAML sufficient for frontmatter:
 * key: value pairs (strings, numbers).  Quoted and unquoted values.
 */
function parseFrontmatter(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonAt = trimmed.indexOf(':');
    if (colonAt === -1) continue;
    const key = trimmed.slice(0, colonAt).trim();
    const rawVal = trimmed.slice(colonAt + 1).trim();
    let value = rawVal;
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    const num = Number(value);
    result[key] = Number.isNaN(num) || value === '' ? value : num;
  }
  return result;
}

function validateFrontmatter(fm, filePath) {
  const required = ['title', 'date', 'excerpt', 'tag', 'readMin'];
  for (const field of required) {
    if (fm[field] === undefined || fm[field] === '') {
      throw new Error(`Missing required frontmatter field "${field}" in ${filePath}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
    throw new Error(`frontmatter "date" must be YYYY-MM-DD, got: ${fm.date}`);
  }
}

// ─── Markdown → HTML converter ────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Apply inline formatting: bold, italic, code, links. */
function applyInline(text) {
  // Inline code (must come before bold/italic to avoid re-processing)
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic (single asterisk or underscore, not inside words)
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

/**
 * Convert Markdown body text to an HTML fragment.
 * Returns a string of HTML (no doctype / head / body wrapper).
 */
function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inParagraph = false;
  let inUl = false;
  let inOl = false;
  let inPre = false;
  let preLines = [];
  let inBlockquote = false;
  let bqLines = [];

  function closeParagraph() {
    if (inParagraph) { out.push('</p>'); inParagraph = false; }
  }
  function closeUl() {
    if (inUl) { out.push('</ul>'); inUl = false; }
  }
  function closeOl() {
    if (inOl) { out.push('</ol>'); inOl = false; }
  }
  function closeBlockquote() {
    if (inBlockquote) {
      const inner = bqLines.join('\n');
      out.push(`<blockquote>\n  <p>${applyInline(escapeHtml(inner))}</p>\n</blockquote>`);
      bqLines = [];
      inBlockquote = false;
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];

    // ── Fenced code block ─────────────────────────────────────────────────────
    if (!inPre && /^```/.test(raw)) {
      closeParagraph(); closeUl(); closeOl(); closeBlockquote();
      const lang = raw.slice(3).trim();
      inPre = true;
      preLines = [];
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      out.push(`<pre><code${langAttr}>`);
      continue;
    }
    if (inPre) {
      if (/^```/.test(raw)) {
        out.push(preLines.map(escapeHtml).join('\n'));
        out.push('</code></pre>');
        inPre = false;
        preLines = [];
      } else {
        preLines.push(raw);
      }
      continue;
    }

    // ── Blockquote ────────────────────────────────────────────────────────────
    if (/^>\s?/.test(raw)) {
      closeParagraph(); closeUl(); closeOl();
      bqLines.push(raw.replace(/^>\s?/, ''));
      inBlockquote = true;
      continue;
    }
    if (inBlockquote) closeBlockquote();

    // ── Blank line ────────────────────────────────────────────────────────────
    if (raw.trim() === '') {
      closeParagraph(); closeUl(); closeOl();
      continue;
    }

    // ── ATX headings ─────────────────────────────────────────────────────────
    const h3 = raw.match(/^### (.+)/);
    if (h3) { closeParagraph(); closeUl(); closeOl(); out.push(`<h3>${applyInline(escapeHtml(h3[1]))}</h3>`); continue; }
    const h2 = raw.match(/^## (.+)/);
    if (h2) { closeParagraph(); closeUl(); closeOl(); out.push(`<h2>${applyInline(escapeHtml(h2[1]))}</h2>`); continue; }
    const h1 = raw.match(/^# (.+)/);
    if (h1) { closeParagraph(); closeUl(); closeOl(); out.push(`<h1>${applyInline(escapeHtml(h1[1]))}</h1>`); continue; }

    // ── Unordered list ────────────────────────────────────────────────────────
    const ulItem = raw.match(/^[-*+] (.+)/);
    if (ulItem) {
      closeParagraph(); closeOl();
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`  <li>${applyInline(escapeHtml(ulItem[1]))}</li>`);
      continue;
    }

    // ── Ordered list ──────────────────────────────────────────────────────────
    const olItem = raw.match(/^\d+\. (.+)/);
    if (olItem) {
      closeParagraph(); closeUl();
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`  <li>${applyInline(escapeHtml(olItem[1]))}</li>`);
      continue;
    }

    // ── Paragraph text ────────────────────────────────────────────────────────
    closeUl(); closeOl();
    if (!inParagraph) { out.push('<p>'); inParagraph = true; }
    else out.push(' ');
    out.push(applyInline(escapeHtml(raw)));
  }

  // Flush any open blocks
  closeParagraph();
  closeUl();
  closeOl();
  if (inPre) out.push('</code></pre>');
  if (inBlockquote) closeBlockquote();

  return out.join('\n');
}

// ─── HTML template ────────────────────────────────────────────────────────────

function formatHumanDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SITE_BASE_URL = 'https://stocastico.github.io';

function buildHtml(fm, bodyHtml) {
  const humanDate = formatHumanDate(fm.date);
  const leadHtml = fm.lead
    ? `\n    <p class="post-lead">\n      ${escapeHtml(fm.lead)}\n    </p>`
    : '';
  const postUrl = fm.url
    ? (fm.url.startsWith('http') ? fm.url : `${SITE_BASE_URL}/${fm.url.replace(/^\//, '')}`)
    : '';
  const canonicalHtml = postUrl ? `\n  <link rel="canonical" href="${escapeHtml(postUrl)}" />` : '';
  const ogHtml = postUrl ? `
  <!-- Open Graph / Twitter Card -->
  <meta property="og:type"        content="article" />
  <meta property="og:url"         content="${escapeHtml(postUrl)}" />
  <meta property="og:title"       content="${escapeHtml(fm.title)}" />
  <meta property="og:description" content="${escapeHtml(fm.excerpt)}" />
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="${escapeHtml(fm.title)}" />
  <meta name="twitter:description" content="${escapeHtml(fm.excerpt)}" />` : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <script>(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();</script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(fm.excerpt)}" />${canonicalHtml}${ogHtml}
  <title>${escapeHtml(fm.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap"
    rel="stylesheet" />
  <link rel="stylesheet" href="../css/styles.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css" />
</head>
<body>
  <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>
  <main class="post">
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:2rem;">
      <a href="../index.html#blog" class="btn btn-ghost">← Back to blog</a>
      <button id="theme-toggle" class="theme-btn" aria-label="Toggle colour theme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
    </div>
    <p class="post-meta">${humanDate} · ${escapeHtml(String(fm.tag))} · ${fm.readMin} min read</p>
    <h1 class="post-title">${escapeHtml(fm.title)}</h1>${leadHtml}
    ${bodyHtml}
  </main>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script>
    hljs.highlightAll();
    (function () {
      var btn = document.getElementById('theme-toggle');
      if (btn) btn.addEventListener('click', function () {
        var curr = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = curr === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
      });
      var bar = document.getElementById('reading-progress');
      if (bar) window.addEventListener('scroll', function () {
        var total = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (total > 0 ? (window.scrollY / total) * 100 : 0) + '%';
      }, { passive: true });
    }());
  </script>
</body>
</html>
`;
}

// ─── blog.js updater ─────────────────────────────────────────────────────────

/**
 * Prepend a new entry to the BLOG_POSTS array in data/blog.js.
 * Uses a text-based approach to preserve the file's existing formatting.
 */
function updateBlogJs(blogJsPath, entry, src) {
  if (src === undefined) src = fs.readFileSync(blogJsPath, 'utf8');
  const arrayStart = src.indexOf('const BLOG_POSTS = [');
  if (arrayStart === -1) throw new Error(`Could not find BLOG_POSTS array in ${blogJsPath}`);
  const insertAt = src.indexOf('[', arrayStart) + 1;

  const entryLines = [
    '{',
    `        title: ${JSON.stringify(entry.title)},`,
    `        date: ${JSON.stringify(entry.date)},`,
    `        excerpt: ${JSON.stringify(entry.excerpt)},`,
    `        tag: ${JSON.stringify(entry.tag)},`,
    `        readMin: ${entry.readMin},`,
    `        url: ${JSON.stringify(entry.url)},`,
    '    }',
  ].map((l) => `\n    ${l}`).join('');

  const before = src.slice(0, insertAt);
  const after = src.slice(insertAt);
  // Only add a comma separator if there are existing entries
  const separator = after.trimStart().startsWith(']') ? '' : ',';
  return `${before}${entryLines}${separator}${after}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) { printHelp(); return; }
  if (!opts.input) {
    console.error('Error: No markdown file specified. Run with --help for usage.');
    process.exitCode = 1;
    return;
  }

  const inputPath = path.resolve(opts.input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = parseFrontmatter(frontmatter);
  validateFrontmatter(fm, opts.input);

  const slug = slugify(fm.title);
  const htmlFilename = `${slug}.html`;
  const outDir = path.resolve(opts.outDir);
  const outputPath = path.join(outDir, htmlFilename);
  const relativeUrl = `${opts.outDir}/${htmlFilename}`.replace(/\\/g, '/');
  const postUrl = fm.url || relativeUrl;

  const bodyHtml = markdownToHtml(body);
  const html = buildHtml(fm, bodyHtml);

  const blogJsPath = path.resolve('data/blog.js');
  const blogEntry = {
    title: String(fm.title),
    date: String(fm.date),
    excerpt: String(fm.excerpt),
    tag: String(fm.tag),
    readMin: Number(fm.readMin),
    url: postUrl,
  };

  if (opts.dryRun) {
    console.log('=== Generated HTML ===');
    console.log(html);
    console.log('\n=== blog.js entry ===');
    console.log(JSON.stringify(blogEntry, null, 2));
    return;
  }

  // Write HTML file
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`Created: ${path.relative(process.cwd(), outputPath)}`);

  // Update blog.js
  if (fs.existsSync(blogJsPath)) {
    const updated = updateBlogJs(blogJsPath, blogEntry);
    fs.writeFileSync(blogJsPath, updated, 'utf8');
    console.log(`Updated: ${path.relative(process.cwd(), blogJsPath)}`);
  } else {
    console.warn(`Warning: ${blogJsPath} not found — skipped blog.js update.`);
  }

  console.log(`\nPost URL: ${postUrl}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  splitFrontmatter,
  parseFrontmatter,
  validateFrontmatter,
  markdownToHtml,
  buildHtml,
  updateBlogJs,
  slugify,
  formatHumanDate,
};
