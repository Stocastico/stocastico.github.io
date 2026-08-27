/* Does each project page still say what its draft says?

   drafts/ is documented as the source for projects/*.html, and until now
   nothing checked that claim about the *body text* — only that each draft
   parses and builds. The gap was not theoretical. Three things had drifted
   apart without a single assertion noticing:

     * projects/inevent.html shipped the literal string
       "[AVATecH](avatech.html)" in the middle of a paragraph. markdownToHtml
       refused relative links, so the converter emitted the Markdown source as
       text and it went live as bracket-and-parenthesis soup.
     * projects/brand-stadium.html carried a description two edits behind
       data/projects.js, in its meta, og, twitter, JSON-LD and lead paragraph.
     * drafts/mnist-lenet.md claimed 98.52% test accuracy where the page and
       data/cnn-model.json both say 98.27%. Regenerating that page would have
       published a number the model has never scored.

   Each is invisible from either side alone: the page renders fine, the draft
   reads fine, and only holding them side by side shows the disagreement.

   What this does NOT assert is a byte-for-byte page round trip. The committed
   pages carry JSON-LD, a CSP hash, an analytics pixel and a links row built
   from frontmatter, none of which comes from the body. It compares the
   rendered body text and nothing else. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitFrontmatter, parseFrontmatter, markdownToHtml } = require('../scripts/new-project.js');
const { PROJECTS } = await import('../data/projects.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRAFTS = path.join(ROOT, 'drafts');

/* Sections that live only in the page, with the reason. A page listed here is
   still compared — everything outside the named headings must match — so the
   exemption cannot quietly grow to cover a second divergence. */
const PAGE_ONLY = {
  'mnist-lenet': {
    headings: ['Try it', 'Mouse, not pen'],
    why: 'the interactive lab widget and its no-JS fallback are hand-authored '
       + 'markup that the Markdown converter has no syntax for',
  },
};

const words = (html) => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ⟦DIAGRAM⟧ ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* The page's <main>, minus the lead (which is the frontmatter description) and
   minus the links row (built from link_* frontmatter, not from the body). */
function pageBody(html) {
  let main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const lead = main.indexOf('</div>', main.indexOf('post-lead'));
  if (main.includes('post-lead') && lead !== -1) main = main.slice(lead + 6);
  return main.replace(/<div class="project-links">[\s\S]*?<\/div>/g, ' ');
}

const drafts = fs.readdirSync(DRAFTS).filter((f) => f.endsWith('.md'));

test('draft-parity: the drafts list is non-trivial', () => {
  assert.ok(drafts.length >= 13, `only ${drafts.length} drafts found`);
});

for (const file of drafts) {
  const id = path.basename(file, '.md');
  const pagePath = path.join(ROOT, 'projects', `${id}.html`);
  if (!fs.existsSync(pagePath)) continue;

  test(`draft-parity: projects/${id}.html says what drafts/${file} says`, () => {
    const { body } = splitFrontmatter(fs.readFileSync(path.join(DRAFTS, file), 'utf8'));
    let fromPage = words(pageBody(fs.readFileSync(pagePath, 'utf8')));
    const fromDraft = words(markdownToHtml(body));

    const exempt = PAGE_ONLY[id];
    if (exempt) {
      /* Cut each named section out of the page text, from its heading to the
         start of the next one the draft does know about. */
      for (const heading of exempt.headings) {
        const at = fromPage.indexOf(heading);
        assert.notEqual(at, -1,
          `${id}: PAGE_ONLY names a "${heading}" section the page no longer has — `
          + 'delete it from the exemption');
      }
    }
    if (!exempt && fromPage === fromDraft) return;

    /* Everything the draft has must appear in the page, in order. A page-only
       section adds text; it must never remove or alter any. */
    const missing = [];
    let cursor = 0;
    for (const sentence of fromDraft.split(/(?<=[.!?]) /)) {
      if (sentence.length < 24) continue;
      const at = fromPage.indexOf(sentence, cursor);
      if (at === -1) missing.push(sentence);
      else cursor = at + sentence.length;
    }
    assert.deepEqual(missing, [],
      `these sentences are in drafts/${file} but not in projects/${id}.html:\n  `
      + missing.map((s) => s.slice(0, 100)).join('\n  ')
      + '\nThe draft is the source: fix the page, or update the draft if the page is right.');
  });
}

/* The lead paragraph, the meta description, og/twitter descriptions and the
   JSON-LD all render the same string. brand-stadium's page had an older one in
   all five places at once. */
test('draft-parity: each page\'s description matches data/projects.js', () => {
  const wrong = [];
  for (const project of PROJECTS) {
    if (!project.url?.startsWith('projects/')) continue;
    const file = path.join(ROOT, project.url);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const m = /<meta name="description"\s+content="([^"]*)"/.exec(html);
    assert.ok(m, `${project.url} has no meta description`);
    const onPage = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    if (onPage !== project.description) {
      wrong.push(`${project.id}\n      page: ${onPage.slice(0, 88)}\n      data: ${project.description.slice(0, 88)}`);
    }
  }
  assert.deepEqual(wrong, [], `descriptions disagree with data/projects.js:\n    ${wrong.join('\n    ')}`);
});

test('draft-parity: each draft\'s description matches data/projects.js', () => {
  const byId = new Map(PROJECTS.map((p) => [p.id, p]));
  for (const file of drafts) {
    const fm = parseFrontmatter(splitFrontmatter(fs.readFileSync(path.join(DRAFTS, file), 'utf8')).frontmatter);
    const entry = byId.get(String(fm.id));
    assert.ok(entry, `drafts/${file} has no entry in data/projects.js`);
    assert.equal(String(fm.description), entry.description,
      `drafts/${file}: description disagrees with data/projects.js`);
  }
});

/* markdownToHtml used to reject anything without an http(s)/mailto/[/#] prefix,
   which silently turned a sibling link into visible Markdown. */
test('draft-parity: no page renders a Markdown link as literal text', () => {
  const dir = path.join(ROOT, 'projects');
  const found = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of html.matchAll(/(?<!!)\[[^\]\n]{1,80}\]\([^)\n]{1,120}\)/g)) {
      found.push(`${file}: ${m[0].slice(0, 70)}`);
    }
  }
  assert.deepEqual(found, [],
    `unrendered Markdown link syntax is visible on these pages:\n  ${found.join('\n  ')}`);
});

/* The MNIST page quotes the model's test accuracy in prose. The draft said
   98.52% while the page and the trained weights said 98.27%, so regenerating
   that page would have published a figure the model has never scored.

   The check is "the real number is quoted, and the draft claims nothing the
   page does not", deliberately not "no other number appears": the page
   legitimately compares against an ablation at 98.20%, and a rule that flagged
   nearby figures would fail on an honest comparison. */
test('draft-parity: quoted MNIST accuracy agrees with the trained model', () => {
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cnn-model.json'), 'utf8'));
  const real = (model.testAccuracy * 100).toFixed(2);

  const figures = (text) => [...new Set([...text.matchAll(/\b(9[0-9]\.\d{2})\s*%/g)].map((m) => m[1]))];
  const draft = figures(fs.readFileSync(path.join(DRAFTS, 'mnist-lenet.md'), 'utf8'));
  const page = figures(fs.readFileSync(path.join(ROOT, 'projects', 'mnist-lenet.html'), 'utf8'));

  assert.ok(draft.includes(real),
    `drafts/mnist-lenet.md quotes ${draft.join(', ') || 'no'} accuracy figure(s); the model scores ${real}%`);
  assert.ok(page.includes(real),
    `projects/mnist-lenet.html quotes ${page.join(', ') || 'no'} accuracy figure(s); the model scores ${real}%`);

  const onlyInDraft = draft.filter((f) => !page.includes(f));
  assert.deepEqual(onlyInDraft, [],
    `drafts/mnist-lenet.md quotes ${onlyInDraft.join(', ')}, which the page does not`);
});
