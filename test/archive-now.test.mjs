/* The /now archive: every version of the page's prose, kept as Markdown.

   The page is overwritten in place, so without this each update destroys the
   previous one. The archive is for the author, not the site — it is never
   deployed. Tests read; the script writes (and only under its main guard). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractNowBody, htmlToMarkdown, nowDate, archiveName, renderArchive, ARCHIVE_DIR,
} from '../scripts/archive-now.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nowHtml = fs.readFileSync(path.join(ROOT, 'now.html'), 'utf8');

test('nowDate parses the "Last updated" line to ISO', () => {
  assert.equal(nowDate(nowHtml), '2026-08-17');
  assert.equal(nowDate('<p class="post-meta">Last updated 3 January 2027 &middot; X</p>'), '2027-01-03');
});

test('nowDate throws when the date is missing', () => {
  assert.throws(() => nowDate('<p>nothing</p>'), /Last updated/);
});

test('archiveName embeds the date', () => {
  assert.equal(archiveName('2026-08-17'), 'now-2026-08-17.md');
});

test('htmlToMarkdown converts paragraphs, emphasis and links', () => {
  const md = htmlToMarkdown(`
    <p>Hello <em>there</em> &amp; <strong>you</strong>,
      see <a href="https://x.org/a" target="_blank" rel="noopener">this <em>one</em></a>.</p>
    <p>Second.</p>`);
  assert.equal(md, 'Hello *there* & **you**, see [this *one*](https://x.org/a).\n\nSecond.');
});

test('htmlToMarkdown refuses markup it cannot represent', () => {
  assert.throws(() => htmlToMarkdown('<p>a <video></video></p>'), /video/);
});

test('extractNowBody drops chrome and the lead, keeps the prose', () => {
  const body = extractNowBody(nowHtml);
  assert.match(body, /<p>\s*I am still very much affected/);
  assert.doesNotMatch(body, /post-lead|Back to Home|post-title/);
});

test('the committed archive holds the current page verbatim (drift guard)', () => {
  const file = path.join(ROOT, ARCHIVE_DIR, archiveName(nowDate(nowHtml)));
  assert.ok(fs.existsSync(file), `missing ${path.relative(ROOT, file)} — run: npm run archive-now`);
  assert.equal(fs.readFileSync(file, 'utf8'), renderArchive(nowHtml),
    'archive out of date — run: npm run archive-now');
});

test('the archive has no near-empty entries', () => {
  const dir = path.join(ROOT, ARCHIVE_DIR);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    assert.match(f, /^now-\d{4}-\d{2}-\d{2}\.md$/);
    assert.ok(fs.readFileSync(path.join(dir, f), 'utf8').length > 200, f);
  }
});
