#!/usr/bin/env node
/* now.html → now-archive/now-YYYY-MM-DD.md
 *
 * The /now page is overwritten in place, so each update erases the last. This
 * keeps the prose of every version as Markdown — an unpublished blog for the
 * author. Only the body is archived (not the page chrome or the fixed lead);
 * the file date is the page's own "Last updated" date.
 *
 * Idempotent: same date + same text = no write. Same date, different text (a
 * same-day edit) overwrites that day's file. Run by .github/workflows/
 * archive-now.yml on every push to main that touches now.html.
 *
 * Usage: node scripts/archive-now.mjs [--dry-run] [--help]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARCHIVE_DIR = 'now-archive';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  middot: '·', mdash: '—', ndash: '–', rarr: '→', larr: '←', hellip: '…' };

export function nowDate(html) {
  const m = /Last updated\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(html);
  const mi = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || mi < 0) throw new Error('now.html: could not find a "Last updated D Month YYYY" line');
  return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export const archiveName = (iso) => `now-${iso}.md`;

/** Everything between the fixed lead and </main> — the part the author writes. */
export function extractNowBody(html) {
  const m = /<div class="post-lead">[\s\S]*?<\/div>([\s\S]*?)<\/main>/.exec(html);
  if (!m) throw new Error('now.html: could not find .post-lead followed by </main>');
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const inline = (s) => {
  let out = s.replace(/<a\s[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    (_, href, text) => `[${inline(text)}](${href})`);
  out = out.replace(/<(em|i)>([\s\S]*?)<\/\1>/g, '*$2*')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<br\s*\/?>/g, '  \n');
  return out;
};

/** Minimal converter for the markup the page uses; throws on anything else so
 *  an archive can never silently lose content. */
export function htmlToMarkdown(html) {
  const blocks = [];
  const re = /<(p|ul|ol|h[2-4])(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let last = 0, m;
  const gap = (s) => {
    if (s.replace(/\s+/g, '')) throw new Error(`unsupported content outside a block: ${s.trim().slice(0, 40)}`);
  };
  const clean = (s) => decode(inline(s).replace(/[ \t\r\n]+/g, ' ').replace(/ ?  \n ?/g, '  \n').trim());
  while ((m = re.exec(html))) {
    gap(html.slice(last, m.index)); last = re.lastIndex;
    const [, tag, inner] = m;
    if (tag === 'p') blocks.push(clean(inner));
    else if (tag[0] === 'h') blocks.push(`${'#'.repeat(+tag[1])} ${clean(inner)}`);
    else {
      let i = 0;
      blocks.push([...inner.matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/g)]
        .map((l) => `${tag === 'ul' ? '-' : `${++i}.`} ${clean(l[1])}`).join('\n'));
    }
  }
  gap(html.slice(last));
  const md = blocks.join('\n\n');
  const stray = /<\/?([a-z][a-z0-9]*)/i.exec(md);
  if (stray) throw new Error(`unsupported element <${stray[1]}>`);
  return md;
}

export function renderArchive(html) {
  const date = nowDate(html);
  return `---\ndate: ${date}\nsource: now.html\n---\n\n${htmlToMarkdown(extractNowBody(html))}\n`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/archive-now.mjs [--dry-run]\nArchives now.html prose to now-archive/now-<date>.md');
    return;
  }
  const html = fs.readFileSync(path.join(ROOT, 'now.html'), 'utf8');
  const out = path.join(ROOT, ARCHIVE_DIR, archiveName(nowDate(html)));
  const next = renderArchive(html);
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === next;
  console.log(`${same ? 'unchanged' : 'write'}: ${path.relative(ROOT, out)}`);
  if (same || args.includes('--dry-run')) return;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, next);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
