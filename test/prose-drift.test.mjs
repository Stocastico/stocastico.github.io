/* The drafts and the pages they generate must not disagree about punctuation.

   They did, on nine of the thirteen project pages: 42 em-dash pairs had been
   flattened to commas in the committed HTML while the drafts kept the dashes.
   A bracketing dash pair is the one case where the substitution is not
   cosmetic, because the enclosed span usually contains commas of its own and
   the result stops parsing:

     "Each model, churn, recommender, the rest, ended up as a Vertex AI Pipeline"
     "a DAG of containerised steps, ingest, validate, … register, and steps are"
     "a suite of audio and video recognizers, independent, pluggable modules, that"

   Nothing could see it. Every assertion in the repo was green, `npm run
   check-links` was clean, and the pages render perfectly — they just no longer
   say what the source says. Prose drift is invisible to a test suite that only
   ever reads one of the two copies.

   This is deliberately narrow. It does not compare the two documents (they
   legitimately differ: the pages carry JSON-LD, an analytics pixel, hand-added
   tables and one interactive widget). It asks one question per em-dash in each
   draft: does the page carry the same sentence with a comma where the draft has
   a dash? That is the specific edit that happened, and it is the one a byte
   comparison would drown in noise trying to find. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitFrontmatter } = require('../scripts/new-project.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS = path.join(ROOT, 'drafts');

/* The page as plain text: tags out, entities decoded, whitespace collapsed. */
function pageText(html) {
  return html
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/* The draft body as the same plain text: link targets and emphasis markers out. */
function draftText(body) {
  return body
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ');
}

const drafts = fs.readdirSync(DRAFTS).filter((f) => f.endsWith('.md'));

test('prose-drift: the drafts list is non-trivial', () => {
  assert.ok(drafts.length >= 13, `only ${drafts.length} drafts found`);
});

for (const file of drafts) {
  const id = path.basename(file, '.md');
  const page = path.join(ROOT, 'projects', `${id}.html`);
  if (!fs.existsSync(page)) continue;

  test(`prose-drift: projects/${id}.html keeps the em-dashes its draft has`, () => {
    const { body } = splitFrontmatter(fs.readFileSync(path.join(DRAFTS, file), 'utf8'));
    const draft = draftText(body);
    const text = pageText(fs.readFileSync(page, 'utf8'));

    const flattened = [];
    for (const m of draft.matchAll(/ — /g)) {
      const before = draft.slice(Math.max(0, m.index - 34), m.index);
      const after = draft.slice(m.index + 3, m.index + 37);
      if (text.includes(`${before} — ${after}`)) continue;    // intact
      for (const alt of [', ', ': ', '; ', '. ', ' (', ') ']) {
        if (text.includes(before + alt + after)) { flattened.push(`…${before} [— → ${alt.trim() || '('}] ${after}…`); break; }
      }
    }
    assert.deepEqual(flattened, [],
      `${flattened.length} em-dash(es) in drafts/${file} are punctuated differently in the page. `
      + 'Fix the page, or change the draft if the page is right.');
  });
}

/* The reverse direction, which matters now that the dashes have been reduced
   on purpose: a dash reappearing in a page that its draft does not have is the
   same drift running the other way, and 187 of them came down to 2 precisely
   so that this stays easy to see. Only the body is checked — inline diagram
   <title>s and the frontmatter-built lead are not draft body text. */
test('prose-drift: no page has grown an em-dash its draft does not have', () => {
  const extra = [];
  for (const file of drafts) {
    const id = path.basename(file, '.md');
    const page = path.join(ROOT, 'projects', `${id}.html`);
    if (!fs.existsSync(page)) continue;

    let html = fs.readFileSync(page, 'utf8').replace(/<svg[\s\S]*?<\/svg>/g, ' ');
    if (!html.includes('<main')) continue;
    let main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    const lead = main.indexOf('</div>', main.indexOf('post-lead'));
    if (main.includes('post-lead') && lead !== -1) main = main.slice(lead + 6);

    const text = pageText(main);
    const draft = draftText(splitFrontmatter(fs.readFileSync(path.join(DRAFTS, file), 'utf8')).body);
    for (const m of text.matchAll(/ — /g)) {
      /* Shrinking window: a wide one can straddle a list-item boundary, where
         the page joins two entries the draft keeps on separate lines, so the
         fragment legitimately differs while the dash itself is in both. */
      const seen = [30, 20, 12, 8].some((w) => {
        const frag = text.slice(Math.max(0, m.index - w), m.index + w + 3);
        return draft.includes(frag);
      });
      if (seen) continue;
      extra.push(`${id}: …${text.slice(Math.max(0, m.index - 30), m.index + 33)}…`);
    }
  }
  assert.deepEqual(extra, [],
    `these em-dashes are in a page but not in its draft:\n  ${extra.join('\n  ')}`);
});
