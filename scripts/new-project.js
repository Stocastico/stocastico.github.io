#!/usr/bin/env node
'use strict';

/**
 * new-project.js — Convert a Markdown file into a project detail section
 * in projects.html and register it in data/projects.js.
 *
 * Usage:
 *   node scripts/new-project.js path/to/project.md [options]
 *
 * Options:
 *   --dry-run         Print generated HTML and data entry without writing files
 *   -h, --help        Show this help
 *
 * Markdown frontmatter (required fields):
 *   ---
 *   id:          my-project              # kebab-case, used as HTML anchor
 *   title:       "My Project Title"
 *   year:        "2024"
 *   tags:        "AI, CV, Unity"         # comma-separated
 *   thumb:       "img/projects/my.jpg"   # 16:9 thumbnail
 *   description: "Short 2–3 sentence summary for the homepage card."
 *   ---
 *
 * Optional frontmatter:
 *   link_paper:  "https://..."
 *   link_github: "https://..."
 *   link_demo:   "https://..."
 *   link_video:  "https://..."
 */

const fs = require('node:fs');
const path = require('node:path');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    input: null,
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (!arg.startsWith('-')) out.input = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/new-project.js <markdown-file> [options]

Generates a project detail section in projects.html and registers
the entry in data/projects.js for the homepage cards.

Options:
  --dry-run             Print output without writing files
  -h, --help            Show this help

Frontmatter fields (YAML between --- delimiters):
  id           (required)  kebab-case identifier, becomes HTML anchor
  title        (required)  Project title
  year         (required)  Project year
  tags         (required)  Comma-separated tag keywords
  thumb        (required)  Path to 16:9 thumbnail image
  description  (required)  Short summary for the homepage card
  link_paper              URL to paper (optional)
  link_github             URL to GitHub repo (optional)
  link_demo               URL to live demo (optional)
  link_video              URL to video (optional)
`);
}

// ─── Frontmatter parser ───────────────────────────────────────────────────────

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

function validateProjectFrontmatter(fm, filePath) {
  const required = ['id', 'title', 'year', 'tags', 'thumb', 'description'];
  for (const field of required) {
    if (fm[field] === undefined || fm[field] === '') {
      throw new Error(`Missing required frontmatter field "${field}" in ${filePath}`);
    }
  }
}

// ─── Markdown → HTML converter ────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInline(text) {
  text = text.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`);
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

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

    if (/^>\s?/.test(raw)) {
      closeParagraph(); closeUl(); closeOl();
      bqLines.push(raw.replace(/^>\s?/, ''));
      inBlockquote = true;
      continue;
    }
    if (inBlockquote) closeBlockquote();

    if (raw.trim() === '') {
      closeParagraph(); closeUl(); closeOl();
      continue;
    }

    const h3 = raw.match(/^### (.+)/);
    if (h3) { closeParagraph(); closeUl(); closeOl(); out.push(`<h3>${applyInline(escapeHtml(h3[1]))}</h3>`); continue; }
    const h2 = raw.match(/^## (.+)/);
    if (h2) { closeParagraph(); closeUl(); closeOl(); out.push(`<h2>${applyInline(escapeHtml(h2[1]))}</h2>`); continue; }
    const h1 = raw.match(/^# (.+)/);
    if (h1) { closeParagraph(); closeUl(); closeOl(); out.push(`<h1>${applyInline(escapeHtml(h1[1]))}</h1>`); continue; }

    const imgBlock = raw.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgBlock) {
      closeParagraph(); closeUl(); closeOl();
      const alt = escapeHtml(imgBlock[1]);
      const src = escapeHtml(imgBlock[2]);
      out.push(`<figure>\n  <img src="${src}" alt="${alt}" loading="lazy" />\n</figure>`);
      continue;
    }

    const ulItem = raw.match(/^[-*+] (.+)/);
    if (ulItem) {
      closeParagraph(); closeOl();
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`  <li>${applyInline(escapeHtml(ulItem[1]))}</li>`);
      continue;
    }

    const olItem = raw.match(/^\d+\. (.+)/);
    if (olItem) {
      closeParagraph(); closeUl();
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`  <li>${applyInline(escapeHtml(olItem[1]))}</li>`);
      continue;
    }

    closeUl(); closeOl();
    if (!inParagraph) { out.push('<p>'); inParagraph = true; }
    else out.push(' ');
    out.push(applyInline(escapeHtml(raw)));
  }

  closeParagraph();
  closeUl();
  closeOl();
  if (inPre) out.push('</code></pre>');
  if (inBlockquote) closeBlockquote();

  return out.join('\n');
}

// ─── HTML section builder ─────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTags(tagsStr) {
  return String(tagsStr).split(',').map(t => t.trim()).filter(Boolean);
}

function buildProjectHtml(fm, bodyHtml) {
  const tags = parseTags(fm.tags);
  const tagsHtml = tags
    .map(t => `          <span class="project-tag">${escapeHtml(t)}</span>`)
    .join('\n');

  const mediaHtml = fm.thumb
    ? `      <div class="project-detail__media">
        <img src="${escapeHtml(fm.thumb)}" alt="${escapeHtml(fm.title)}" loading="lazy" />
      </div>`
    : '';

  // Build optional links row
  const links = [];
  if (fm.link_paper) links.push({ label: 'Paper', url: fm.link_paper });
  if (fm.link_github) links.push({ label: 'GitHub', url: fm.link_github });
  if (fm.link_demo) links.push({ label: 'Demo', url: fm.link_demo });
  if (fm.link_video) links.push({ label: 'Video', url: fm.link_video });

  const linksHtml = links.length
    ? `      <div class="project-links">
${links.map(l => `        <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`).join('\n')}
      </div>`
    : '';

  return `      <section id="${escapeHtml(fm.id)}" class="project-detail" data-animate>
${mediaHtml}
        <div class="project-detail__header">
          <span class="project-detail__year">${escapeHtml(fm.year)}</span>
          <h2 class="project-detail__title">${escapeHtml(fm.title)}</h2>
          <div class="project-detail__tags">
${tagsHtml}
          </div>
        </div>
        <div class="project-detail__body">
          ${bodyHtml}
        </div>
${linksHtml}
      </section>`;
}

// ─── data/projects.js updater ─────────────────────────────────────────────────

function updateProjectsJs(projectsJsPath, entry, src) {
  if (src === undefined) src = fs.readFileSync(projectsJsPath, 'utf8');
  const arrayStart = src.indexOf('const PROJECTS = [');
  if (arrayStart === -1) throw new Error(`Could not find PROJECTS array in ${projectsJsPath}`);
  const insertAt = src.indexOf('[', arrayStart) + 1;

  const tagsStr = JSON.stringify(entry.tags);
  const entryLines = [
    '{',
    `        id: ${JSON.stringify(entry.id)},`,
    `        title: ${JSON.stringify(entry.title)},`,
    `        year: ${JSON.stringify(entry.year)},`,
    `        tags: ${tagsStr},`,
    `        thumb: ${JSON.stringify(entry.thumb)},`,
    `        description: ${JSON.stringify(entry.description)},`,
    `        url: ${JSON.stringify(entry.url)},`,
    '    }',
  ].map((l) => `\n    ${l}`).join('');

  const before = src.slice(0, insertAt);
  const after = src.slice(insertAt);
  const separator = after.trimStart().startsWith(']') ? '' : ',';
  return `${before}${entryLines}${separator}${after}`;
}

// ─── projects.html updater ────────────────────────────────────────────────────

const INJECT_MARKER = '<!-- ── INJECT NEW PROJECTS ABOVE THIS LINE ── -->';

function updateProjectsHtml(htmlPath, sectionHtml, src) {
  if (src === undefined) src = fs.readFileSync(htmlPath, 'utf8');
  const markerIdx = src.indexOf(INJECT_MARKER);
  if (markerIdx === -1) throw new Error(`Could not find injection marker in ${htmlPath}`);
  const before = src.slice(0, markerIdx);
  const after = src.slice(markerIdx);
  return `${before}${sectionHtml}\n\n      ${after}`;
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
  validateProjectFrontmatter(fm, opts.input);

  const tags = parseTags(fm.tags);
  const bodyHtml = markdownToHtml(body);
  const sectionHtml = buildProjectHtml(fm, bodyHtml);

  const projectEntry = {
    id: String(fm.id),
    title: String(fm.title),
    year: String(fm.year),
    tags: tags,
    thumb: String(fm.thumb),
    description: String(fm.description),
    url: `projects.html#${fm.id}`,
  };

  if (opts.dryRun) {
    console.log('=== Generated HTML section ===');
    console.log(sectionHtml);
    console.log('\n=== projects.js entry ===');
    console.log(JSON.stringify(projectEntry, null, 2));
    return;
  }

  // Update projects.html
  const projectsHtmlPath = path.resolve('projects.html');
  if (fs.existsSync(projectsHtmlPath)) {
    const updated = updateProjectsHtml(projectsHtmlPath, sectionHtml);
    fs.writeFileSync(projectsHtmlPath, updated, 'utf8');
    console.log(`Updated: ${path.relative(process.cwd(), projectsHtmlPath)}`);
  } else {
    console.warn(`Warning: ${projectsHtmlPath} not found — skipped projects.html update.`);
  }

  // Update data/projects.js
  const projectsJsPath = path.resolve('data/projects.js');
  if (fs.existsSync(projectsJsPath)) {
    const updated = updateProjectsJs(projectsJsPath, projectEntry);
    fs.writeFileSync(projectsJsPath, updated, 'utf8');
    console.log(`Updated: ${path.relative(process.cwd(), projectsJsPath)}`);
  } else {
    console.warn(`Warning: ${projectsJsPath} not found — skipped projects.js update.`);
  }

  console.log(`\nProject added: ${fm.title} → projects.html#${fm.id}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  splitFrontmatter,
  parseFrontmatter,
  validateProjectFrontmatter,
  markdownToHtml,
  buildProjectHtml,
  updateProjectsJs,
  updateProjectsHtml,
  slugify,
  parseTags,
  parseArgs,
};
