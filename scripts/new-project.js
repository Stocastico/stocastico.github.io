#!/usr/bin/env node
'use strict';

/**
 * new-project.js — Convert a Markdown file into a standalone project detail
 * page (projects/<id>.html) and register it in data/projects.js so the card
 * appears on the homepage and on the projects listing page.
 *
 * Each project gets its own HTML file, mirroring the blog-post workflow.
 *
 * Usage:
 *   node scripts/new-project.js path/to/project.md [options]
 *
 * Options:
 *   --out-dir <dir>   Output directory for the HTML file (default: projects/)
 *   --dry-run         Print generated HTML and data entry without writing files
 *   -h, --help        Show this help
 *
 * Markdown frontmatter (required fields):
 *   ---
 *   id:          my-project              # kebab-case, used as filename
 *   kind:        work                    # work | personal — 'personal' is
 *                                        # badged and kept off the homepage
 *   title:       "My Project Title"
 *   year:        "2024"
 *   tags:        "Computer Vision, AR & 3D"  # 1–2 labels, closed vocabulary
 *   bg:          "img/projects/my-bg.webp"   # project-page hero (+ og:image
 *                                            # unless `og` overrides it)
 *   description: "Short 2–3 sentence summary for the homepage card."
 *   ---
 *
 * Optional frontmatter:
 *   og:          "img/projects/my-og.png"  # social card, when the hero image
 *                                          # is the wrong shape for one
 *   link_paper:  "https://..."
 *   link_github: "https://..."
 *   link_demo:   "https://..."
 *   link_video:  "https://..."
 *
 * Body images:
 *   ![alt text](img/projects/x.webp)
 *   ![alt text](img/projects/x.webp "Optional caption")
 */

const fs = require('node:fs');
const path = require('node:path');

// Single source of truth for the site origin — see scripts/lib/site.json.
// Run `npm run set-domain -- <new-domain>` to migrate to a custom domain.
const { url: SITE_URL } = require('./lib/site.json');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    input: null,
    outDir: 'projects',
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out-dir') out.outDir = argv[++i];
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (!arg.startsWith('-')) out.input = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/new-project.js <markdown-file> [options]

Generates a standalone project detail page (projects/<id>.html) and
registers the project in data/projects.js so the card shows on the
homepage and on projects.html.

Options:
  --out-dir <dir>       Output directory (default: projects)
  --dry-run             Print output without writing files
  -h, --help            Show this help

Frontmatter fields (YAML between --- delimiters):
  id           (required)  kebab-case identifier, becomes filename
  kind         (required)  work | personal — personal projects get a card
                           badge and never appear on the homepage
  title        (required)  Project title
  year         (required)  Project year
  tags         (required)  1–2 labels from the closed facet vocabulary:
                             ${PROJECT_TAG_LABELS.join(' | ')}
  bg           (required)  Project detail hero image (also the og:image
                           unless "og" overrides it)
  description  (required)  Short summary for the homepage card
  og                      Social card image, when the hero is the wrong
                          shape or format for one (optional)
  link_paper              URL to paper (optional)
  link_github             URL to GitHub repo (optional)
  link_demo               URL to live demo (optional)
  link_video              URL to video (optional)

Body images support an optional caption:
  ![alt text](img/projects/x.webp "Caption shown under the figure")
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

/* Mirrors PROJECT_KINDS in js/render-cards.js. Duplicated rather than imported
   because this script is CJS and that module is ESM; test/generate-cards.test.mjs
   asserts the two lists stay identical, so the copy cannot drift. */
const PROJECT_KINDS = ['work', 'personal'];

/* Mirrors PROJECT_TAGS in js/project-tags.js, for the same CJS/ESM reason as
   PROJECT_KINDS above, and guarded the same way (test/new-project.test.js
   asserts the two lists are identical).

   The vocabulary is validated HERE, at the source, rather than left to
   test/project-tags.test.mjs to report afterwards. Both catch a stray label,
   but only one of them catches it before it has been written into
   data/projects.js and baked into a page: `kind` has been rejected at this
   point since issue #136 and `tags` was not, so the generator would happily
   accept "AI, CV, Unity" — which is what its own --help suggested — and the
   first sign of trouble was three unrelated assertions going red on the next
   `npm test`. A closed vocabulary that is only enforced downstream of the tool
   that writes it is a naming convention, not a vocabulary. */
const PROJECT_TAG_LABELS = [
  'Computer Vision',
  'AR & 3D',
  'LLMs & MLOps',
  'Media & Live Events',
  'Education & Research',
  'Data & Interactive',
];
const MAX_TAGS_PER_PROJECT = 2;

function validateProjectFrontmatter(fm, filePath) {
  const required = ['id', 'kind', 'title', 'year', 'tags', 'bg', 'description'];
  for (const field of required) {
    if (fm[field] === undefined || fm[field] === '') {
      throw new Error(`Missing required frontmatter field "${field}" in ${filePath}`);
    }
  }
  /* Caught here rather than defaulted: a typo'd kind that quietly became
     'work' would put a side project on the front page, which is the whole
     reason the field exists. */
  if (!PROJECT_KINDS.includes(String(fm.kind))) {
    throw new Error(
      `Invalid frontmatter field "kind" in ${filePath}: got ${JSON.stringify(String(fm.kind))}, ` +
      `expected one of ${PROJECT_KINDS.map((k) => `'${k}'`).join(' | ')}`,
    );
  }

  const tags = parseTags(fm.tags);
  const strays = tags.filter((t) => !PROJECT_TAG_LABELS.includes(t));
  if (strays.length) {
    throw new Error(
      `Invalid frontmatter field "tags" in ${filePath}: ` +
      `${strays.map((t) => JSON.stringify(t)).join(', ')} ` +
      `${strays.length === 1 ? 'is not a facet' : 'are not facets'} in the project vocabulary.\n` +
      `Pick from: ${PROJECT_TAG_LABELS.join(' | ')}\n` +
      `(The vocabulary is closed on purpose — see the header of data/projects.js.)`,
    );
  }
  if (tags.length > MAX_TAGS_PER_PROJECT) {
    throw new Error(
      `Too many tags in ${filePath}: ${tags.length} given, at most ${MAX_TAGS_PER_PROJECT} allowed.\n` +
      `A card badge row is a glance, not an index.`,
    );
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
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    /* The text is already HTML-escaped, so quotes can't break out of the
       attribute, but the protocol still has to be vetted to keep
       javascript: and data: links out of the generated href.

       The rule is "reject dangerous schemes", not "allow a list of prefixes".
       The allowlist version required http(s), mailto, `/` or `#`, which meant
       a plain sibling link like [cleAR architecture](clear-architecture.html)
       fell through and was emitted as literal Markdown — visible bracket-and-
       parenthesis soup in the middle of a paragraph. Three project pages
       cross-link each other that way, so regenerating any of them printed the
       source instead of a link. A relative path cannot carry a scheme, which
       is the only thing that was ever being guarded against. */
    const raw = url.trim();
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
    if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) return `[${label}](${url})`;
    const rel = /^https?:\/\//i.test(raw) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${raw}"${rel}>${label}</a>`;
  });
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
      closeParagraph();
      /* Keep an open list alive across a blank line when the next non-blank
         line continues it (loose lists), so 1./2./3. don't each become a new
         <ol> that restarts at 1. */
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j += 1;
      const after = j < lines.length ? lines[j] : '';
      if (inUl && !/^[-*+] /.test(after)) closeUl();
      if (inOl && !/^\d+\. /.test(after)) closeOl();
      continue;
    }

    /* Markdown table: a header row, a |---|---| delimiter, then body rows. */
    if (
      /^\s*\|.*\|\s*$/.test(raw) &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      closeParagraph(); closeUl(); closeOl();
      const splitRow = (line) =>
        line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const headers = splitRow(raw);
      i += 1; // consume the delimiter row
      const bodyRows = [];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) {
        i += 1;
        bodyRows.push(splitRow(lines[i]));
      }
      const thead = `  <thead>\n    <tr>${headers
        .map((h) => `<th>${applyInline(escapeHtml(h))}</th>`)
        .join('')}</tr>\n  </thead>`;
      const tbody = `  <tbody>\n${bodyRows
        .map((r) => `    <tr>${r.map((c) => `<td>${applyInline(escapeHtml(c))}</td>`).join('')}</tr>`)
        .join('\n')}\n  </tbody>`;
      /* Wrapped in a focusable scroll container, always — a table's width is
         the sum of its columns' min-content widths and cannot be wrapped
         narrower, so on a phone a wide one runs off the right edge with no
         scrollbar to say so (html/body are `overflow-x: clip`). tabindex="0"
         is required, not cosmetic: an unfocusable scroll region is
         unreachable by keyboard (WCAG 2.1.1, and axe's
         scrollable-region-focusable is tagged wcag2a). The wrapper costs
         nothing when the table already fits. */
      out.push(
        `<div class="table-scroll" tabindex="0" role="region" aria-label="Table, scrollable">\n`
        + `<table>\n${thead}\n${tbody}\n</table>\n`
        + `</div>`
      );
      continue;
    }

    const h3 = raw.match(/^### (.+)/);
    if (h3) { closeParagraph(); closeUl(); closeOl(); out.push(`<h3>${applyInline(escapeHtml(h3[1]))}</h3>`); continue; }
    const h2 = raw.match(/^## (.+)/);
    if (h2) { closeParagraph(); closeUl(); closeOl(); out.push(`<h2>${applyInline(escapeHtml(h2[1]))}</h2>`); continue; }
    const h1 = raw.match(/^# (.+)/);
    if (h1) { closeParagraph(); closeUl(); closeOl(); out.push(`<h1>${applyInline(escapeHtml(h1[1]))}</h1>`); continue; }

    /* !svg(path.svg) — inline the file's contents inside a <figure>.

       Architecture diagrams on this site are inline <svg class="diagram">, not
       <img src="…svg">, because an external SVG is its own document and cannot
       read the page's custom properties: its colours have to be baked in, and
       when they were, they sat in three superseded palettes at once (see the
       note above `.post figure .diagram` in css/styles.css).

       Inlining them fixed the colours and broke the drafts. The two SVG files
       were deleted once their contents lived in the HTML, so brand-stadium.md
       and rag-document-qa.md were left pointing at paths that no longer
       resolved, and neither page could be regenerated at all. The source files
       are back under drafts/diagrams/ — build-time input like data/land-50m.json,
       never deployed, and still authored with `fill="var(--accent)"` so the
       inlined result follows the palette and the light/dark toggle exactly as
       before. There is deliberately no generator: this copies bytes.

       An <img> here would be caught by test/css-assets.test.mjs, which fails on
       a diagram reverting to one — which is the other reason this directive
       exists rather than a plain image reference. */
    const svgBlock = raw.match(/^!svg\(([^)\s]+)\)$/);
    if (svgBlock) {
      closeParagraph(); closeUl(); closeOl();
      const svgPath = path.resolve(svgBlock[1]);
      let markup;
      try { markup = fs.readFileSync(svgPath, 'utf8').trim(); } catch {
        throw new Error(
          `!svg(${svgBlock[1]}) — file not found.\n`
          + `Inline diagrams are read from disk at generate time; the path is `
          + `relative to the repo root.`,
        );
      }
      if (!/^<svg[\s>]/.test(markup)) {
        throw new Error(`!svg(${svgBlock[1]}) — file does not start with an <svg> element.`);
      }
      /* Only the opening tag is indented into the <figure>; the rest of the
         file is emitted verbatim. That is how the diagrams already sit in the
         committed pages, and re-indenting the whole block instead would make
         every line of a regenerated page differ from the one it replaces —
         which is exactly the noise that hides a real change in a diff. */
      const [open, ...rest] = markup.split('\n');
      out.push(`<figure>\n  ${[open, ...rest].join('\n')}\n</figure>`);
      continue;
    }

    /* ![alt](src) or ![alt](src "caption") — the optional quoted third part
       becomes a <figcaption>. It is worth having for two reasons. `.post figure
       figcaption` has been styled in css/styles.css all along with no consumer
       on any project page, because this converter had no syntax that could
       produce one; and a caption is not a duplicate of the alt text, which
       describes the picture for someone who cannot see it, where a caption
       tells every reader what to look at in it. */
    const imgBlock = raw.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (imgBlock) {
      closeParagraph(); closeUl(); closeOl();
      const alt = escapeHtml(imgBlock[1]);
      const rawSrc = imgBlock[2];
      const external = /^https?:\/\/|^\//.test(rawSrc);
      const src = escapeHtml(external ? rawSrc : `../${rawSrc}`);
      /* Intrinsic width/height, read off the file on disk. Every figure in the
         committed pages carries them and this converter did not, so any page
         regenerated from its draft silently lost its CLS protection and the
         layout shifted on load. Skipped for a remote or unreadable file — an
         attribute pair that is a guess is worse than none. */
      const dims = external ? null : imageSize(path.resolve(rawSrc));
      const sizeAttr = dims ? ` width="${dims.width}" height="${dims.height}"` : '';
      const caption = imgBlock[3]
        ? `\n  <figcaption>${applyInline(escapeHtml(imgBlock[3]))}</figcaption>`
        : '';
      out.push(
        `<figure>\n  <img src="${src}" alt="${alt}"${sizeAttr} loading="lazy" decoding="async" />`
        + `${caption}\n</figure>`,
      );
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTags(tagsStr) {
  return String(tagsStr).split(',').map(t => t.trim()).filter(Boolean);
}

function deriveOutputPath(id, outDir = 'projects') {
  return path.join(outDir, `${id}.html`);
}

// ─── Image dimensions (for og:image:width / :height) ──────────────────────────
// Reads PNG / JPEG / WebP headers synchronously so generated pages can declare
// accurate social-card dimensions. Returns { width, height } or null when the
// file is missing or its format isn't recognised (callers then omit the tags).
function imageSize(filePath) {
  let buf;
  try { buf = fs.readFileSync(filePath); } catch { return null; }
  if (buf.length < 24) return null;

  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (buf.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: scan segments for a Start-Of-Frame marker (0xFFC0–0xFFCF, minus
  // DHT/JPG/DAC) and read the frame dimensions.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }

  // WebP: RIFF container with a VP8 / VP8L / VP8X chunk.
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const fourcc = buf.toString('latin1', 12, 16);
    if (fourcc === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
      const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
      return { width: w, height: h };
    }
  }

  return null;
}

// ─── Standalone project page builder ──────────────────────────────────────────

function buildProjectPage(fm, bodyHtml, ogDims = null) {
  const tags = parseTags(fm.tags);
  const heroImg = fm.bg;
  /* `og` is optional and defaults to `bg`. They are the same picture on most
     pages, but not on all: a hero wants a wide, light file the page can stretch
     under a scrim, while a social card wants 1200x630 PNG that survives being
     shrunk into a LinkedIn preview. Three pages already split the two by hand
     (aroundtheworld, mnist-lenet, rag-document-qa) and the generator had no way
     to say so, so regenerating any of them would have collapsed the pair back
     onto the hero — which for the two SVG heroes means an og:image no scraper
     renders. */
  const ogImg = fm.og || fm.bg;
  const tagsHtml = tags
    .map(t => `        <span class="project-tag">${escapeHtml(t)}</span>`)
    .join('\n');

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

  const titleEsc = escapeHtml(fm.title);
  const descEsc = escapeHtml(fm.description);
  const yearEsc = escapeHtml(fm.year);
  const heroImgEsc = escapeHtml(heroImg);
  const ogImgEsc = escapeHtml(ogImg);
  const ogDimsHtml = (ogDims && ogDims.width && ogDims.height)
    ? `\n  <meta property="og:image:width"  content="${ogDims.width}" />` +
      `\n  <meta property="og:image:height" content="${ogDims.height}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${descEsc}" />
  <meta name="author" content="Stefano Masneri" />
  <meta name="robots" content="index, follow" />
  <title>${titleEsc} — Stefano Masneri</title>
  <link rel="canonical" href="${SITE_URL}/projects/${escapeHtml(fm.id)}.html" />

  <meta property="og:type"        content="article" />
  <meta property="og:site_name"   content="Stefano Masneri" />
  <meta property="og:locale"      content="en_GB" />
  <meta property="og:url"         content="${SITE_URL}/projects/${escapeHtml(fm.id)}.html" />
  <meta property="og:title"       content="${titleEsc} — Stefano Masneri" />
  <meta property="og:description" content="${descEsc}" />
  <meta property="og:image"       content="${SITE_URL}/${ogImgEsc}" />${ogDimsHtml}
  <meta property="og:image:alt"   content="${titleEsc}" />
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${titleEsc} — Stefano Masneri" />
  <meta name="twitter:description" content="${descEsc}" />
  <meta name="twitter:image"       content="${SITE_URL}/${ogImgEsc}" />
  <meta name="twitter:image:alt"   content="${titleEsc}" />

  <meta name="theme-color" content="#1a1010" />

  <link rel="preload" href="../fonts/source-serif-4-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="../fonts/jetbrains-mono-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="../css/fonts.css" />
  <link rel="icon"
    href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%231a1010'/%3E%3Ctext x='50%25' y='56%25' text-anchor='middle' font-size='32' fill='%23d64550' font-family='Georgia,serif'%3ESM%3C/text%3E%3C/svg%3E" />
  <link rel="icon" type="image/x-icon" sizes="any" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="alternate" type="application/atom+xml" title="Stefano Masneri — projects &amp; now" href="/feed.xml" />
  <link rel="stylesheet" href="../css/styles.css" />
</head>
<body>
  <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>
  <a class="skip-link" href="#project-content">Skip to project</a>

  <nav id="navbar" role="navigation" aria-label="Main navigation">
    <div class="nav-inner">
      <a href="../index.html" class="nav-logo" aria-label="Home">
        <svg class="nav-home-icon" viewBox="0 0 24 24" fill="none" stroke="url(#nav-grad)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <defs>
            <linearGradient id="nav-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="var(--accent)"/>
              <stop offset="100%" stop-color="var(--accent2)"/>
            </linearGradient>
          </defs>
          <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
          <path d="M9 22V12h6v10"/>
        </svg>
      </a>
      <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>
      <ul class="nav-links" id="nav-links">
        <li><a href="../index.html#about">About</a></li>
        <li><a href="../now.html">Now</a></li>
        <li><a href="../cv.html">CV</a></li>
        <li><a href="../projects.html">Projects</a></li>
        <li><a href="../publications.html">Publications</a></li>
        <li><a href="../travel.html">Travel</a></li>
        <li><a href="../links.html">Links</a></li>
        <li><a href="../index.html#contact">Contact</a></li>
      </ul>
      <button type="button" class="cmd-trigger-hint" id="cmd-trigger" aria-label="Open command palette">
        <span class="cmd-trigger-key"></span>K
      </button>
    </div>
  </nav>

  <!-- Project hero banner (semi-transparent image + title overlay) -->
  <header class="project-hero" style="--project-hero-img: url('../${heroImgEsc}');" aria-label="${titleEsc}">
    <div class="project-hero__overlay" aria-hidden="true"></div>
    <div class="project-hero__inner">
      <p class="post-back-row">
        <a href="../projects.html" class="cv-back-link">&larr; All projects</a>
      </p>
      <p class="project-detail__year">${yearEsc}</p>
      <h1 class="project-detail__title">${titleEsc}</h1>
      <div class="project-detail__tags">
${tagsHtml}
      </div>
    </div>
  </header>

  <main id="project-content" class="post">
    <div class="post-lead">${descEsc}</div>

    ${bodyHtml}

${linksHtml}
  </main>

  <footer class="site-footer">
    <div class="container">
      <nav class="footer-social" aria-label="Profiles">
        <a href="https://www.linkedin.com/in/stefanomasneri/" target="_blank" rel="me noopener">LinkedIn</a>
        <a href="https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en" target="_blank" rel="me noopener">Google Scholar</a>
        <a href="https://github.com/Stocastico" target="_blank" rel="me noopener">GitHub</a>
      </nav>
      <p>&copy; <span id="footer-year"></span> Stefano Masneri &nbsp;&middot;&nbsp; Written by me, coded with <a href="https://claude.ai" target="_blank" rel="noopener">Claude</a> and plenty of ☕ in San Sebasti&aacute;n</p>
    </div>
  </footer>

  <button class="back-to-top" id="back-to-top" aria-label="Back to top">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </button>

  <!-- Command palette — opened with ⌘K / Ctrl+K.

       This block is the reason the navbar's ⌘K chip does anything.
       initCommandPalette() returns early when #cmd-overlay is absent, so a page
       born without it advertises a shortcut in the navbar that silently does
       nothing — the exact bug the palette was rolled out to all 21 pages to
       fix. No generator owns this markup, so if the scaffold does not carry it,
       nothing will put it back; test/new-project.test.js asserts it is here. -->
  <dialog class="cmd-overlay" id="cmd-overlay" aria-label="Command palette">
    <div class="cmd-box">
      <div class="cmd-search-row">
        <svg class="cmd-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
          <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <input
          class="cmd-input" id="cmd-input"
          type="text" placeholder="Jump to section, open CV, copy email…"
          autocomplete="off" spellcheck="false" aria-autocomplete="list"
          aria-controls="cmd-list" aria-label="Search commands"
        />
        <kbd class="cmd-esc-hint">Esc</kbd>
      </div>
      <ul class="cmd-list" id="cmd-list" role="listbox" aria-label="Commands"></ul>
    </div>
  </dialog>

  <script type="module" src="/js/main.js"></script>
</body>
</html>
`;
}

// ─── data/projects.js updater ─────────────────────────────────────────────────

function updateProjectsJs(projectsJsPath, entry, src) {
  if (src === undefined) src = fs.readFileSync(projectsJsPath, 'utf8');
  const arrayStart = src.search(/(?:export\s+)?const PROJECTS\s*=\s*\[/);
  if (arrayStart === -1) throw new Error(`Could not find PROJECTS array in ${projectsJsPath}`);

  // Skip if an entry with this id is already registered
  const idPattern = new RegExp(`id:\\s*${JSON.stringify(entry.id)}`);
  if (idPattern.test(src)) return src;

  const insertAt = src.indexOf('[', arrayStart) + 1;

  const tagsStr = JSON.stringify(entry.tags);
  const lines = [
    '{',
    `        id: ${JSON.stringify(entry.id)},`,
    `        kind: ${JSON.stringify(entry.kind)},`,
    `        title: ${JSON.stringify(entry.title)},`,
    `        year: ${JSON.stringify(entry.year)},`,
    `        tags: ${tagsStr},`,
    `        bg: ${JSON.stringify(entry.bg)},`,
  ];
  lines.push(`        description: ${JSON.stringify(entry.description)},`);
  lines.push(`        url: ${JSON.stringify(entry.url)},`);
  lines.push('    }');

  const entryBlock = lines.map((l) => `\n    ${l}`).join('');
  const before = src.slice(0, insertAt);
  const after = src.slice(insertAt);
  const separator = after.trimStart().startsWith(']') ? '' : ',';
  return `${before}${entryBlock}${separator}${after}`;
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
  /* Read the social image's dimensions so the page can declare an accurate
     og:image:width/height (better social-card rendering). Resolved relative
     to the repo root; silently skipped if the file isn't found/readable. */
  const ogSrc = fm.og || fm.bg;
  const ogDims = ogSrc ? imageSize(path.resolve(String(ogSrc))) : null;
  /* A social card below 300px wide is not rendered as one: X drops a
     summary_large_image card back to the small summary layout, and Facebook
     and LinkedIn fall back to a thumbnail or to nothing. That is invisible
     from here — the page is valid, the file exists, the tags are present —
     so it is worth one line of warning at the moment the page is written. */
  if (ogDims && (ogDims.width < 600 || ogDims.height < 315)) {
    console.warn(
      `Warning: ${ogSrc} is ${ogDims.width}x${ogDims.height} — too small for a social card.\n` +
      `         Under 600x315 the preview degrades; 1200x630 is what the platforms want.\n` +
      `         Set an "og:" frontmatter field pointing at a purpose-built card.`,
    );
  }
  const pageHtml = buildProjectPage(fm, bodyHtml, ogDims);

  const projectEntry = {
    id: String(fm.id),
    kind: String(fm.kind),
    title: String(fm.title),
    year: String(fm.year),
    tags: tags,
    bg: String(fm.bg),
    description: String(fm.description),
    url: `${opts.outDir.replace(/\\/g, '/')}/${fm.id}.html`,
  };

  if (opts.dryRun) {
    console.log('=== Generated project page HTML ===');
    console.log(pageHtml);
    console.log('\n=== projects.js entry ===');
    console.log(JSON.stringify(projectEntry, null, 2));
    return;
  }

  // Write standalone project HTML page
  const outPath = path.resolve(deriveOutputPath(String(fm.id), opts.outDir));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, pageHtml, 'utf8');
  console.log(`Wrote:   ${path.relative(process.cwd(), outPath)}`);

  // Update data/projects.js
  const projectsJsPath = path.resolve('data/projects.js');
  if (fs.existsSync(projectsJsPath)) {
    const updated = updateProjectsJs(projectsJsPath, projectEntry);
    fs.writeFileSync(projectsJsPath, updated, 'utf8');
    console.log(`Updated: ${path.relative(process.cwd(), projectsJsPath)}`);
  } else {
    console.warn(`Warning: ${projectsJsPath} not found — skipped projects.js update.`);
  }

  console.log(`\nProject added: ${fm.title} → ${projectEntry.url}`);
  console.log('Next steps:');
  console.log('  npm run generate-project-jsonld   # add Article + BreadcrumbList JSON-LD');
  console.log('  npm run generate-sitemap          # add the new page to sitemap.xml');
}

if (require.main === module) {
  main();
}

module.exports = {
  PROJECT_KINDS,
  PROJECT_TAG_LABELS,
  MAX_TAGS_PER_PROJECT,
  splitFrontmatter,
  parseFrontmatter,
  validateProjectFrontmatter,
  markdownToHtml,
  buildProjectPage,
  updateProjectsJs,
  slugify,
  parseTags,
  parseArgs,
  deriveOutputPath,
  imageSize,
};
