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
      if (text.includes(`${before}, ${after}`)) {             // flattened
        flattened.push(`…${before} [— → ,] ${after}…`);
      }
    }
    assert.deepEqual(flattened, [],
      `${flattened.length} em-dash(es) in drafts/${file} appear as commas in the page. `
      + 'A bracketing dash pair flattened to commas usually stops the sentence parsing. '
      + 'Fix the page, or change the draft if the comma is what you meant.');
  });
}
