/* Project tag vocabulary — a closed set of six facets.
 
   The tags used to be free text, and free text is what they became: 14
   projects carried 32 distinct tags, 28 of which were used exactly once.
   As badges that was merely noisy; as a filter vocabulary it was useless,
   because almost every facet would have returned a single card. A filter
   that returns one of fourteen entries is a control that only disappoints
   — the same reasoning that keeps a work/personal facet off projects.html.

   So the vocabulary is closed and declared once, in data/projects.js, and
   the chips on projects.html read from that same constant. Three rules,
   asserted below, are what keep it a vocabulary rather than a list:

     * every tag on a project is a member of PROJECT_TAGS;
     * no project carries more than 2 (a card badge row is a glance, not an
       index, and three facets on one card means the facets are too narrow);
     * no facet is used by fewer than 2 projects — the rule that stops the
       singleton drift from starting again. Adding a seventh facet therefore
       costs two projects, which is the point. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS, PROJECT_TAGS } from '../data/projects.js';

const MAX_TAGS_PER_PROJECT = 2;
const MIN_PROJECTS_PER_TAG = 2;
const VOCAB_SIZE = 6;

test('project-tags: the vocabulary is a closed set of six labelled facets', () => {
  assert.ok(Array.isArray(PROJECT_TAGS), 'PROJECT_TAGS must be an array');
  assert.equal(PROJECT_TAGS.length, VOCAB_SIZE,
    `expected ${VOCAB_SIZE} facets, found ${PROJECT_TAGS.length}`);

  const slugs = new Set();
  const labels = new Set();
  for (const tag of PROJECT_TAGS) {
    assert.match(tag.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/,
      `facet slug "${tag.slug}" is not kebab-case`);
    assert.ok(tag.label && tag.label.trim() === tag.label && tag.label.length > 1,
      `facet "${tag.slug}" has no usable label`);
    assert.ok(!slugs.has(tag.slug), `duplicate facet slug "${tag.slug}"`);
    assert.ok(!labels.has(tag.label), `duplicate facet label "${tag.label}"`);
    slugs.add(tag.slug);
    labels.add(tag.label);
  }
});

test('project-tags: every project tag belongs to the vocabulary', () => {
  const known = new Set(PROJECT_TAGS.map(t => t.label));
  const strays = [];
  for (const p of PROJECTS) {
    for (const tag of (p.tags || [])) {
      if (!known.has(tag)) strays.push(`${p.id}: "${tag}"`);
    }
  }
  assert.deepEqual(strays, [],
    'these tags are not in PROJECT_TAGS — add the facet or re-file the project:\n'
    + strays.join('\n'));
});

test(`project-tags: no project carries more than ${MAX_TAGS_PER_PROJECT} tags`, () => {
  const over = PROJECTS
    .filter(p => (p.tags || []).length > MAX_TAGS_PER_PROJECT)
    .map(p => `${p.id} (${p.tags.length})`);
  assert.deepEqual(over, [], `over the ${MAX_TAGS_PER_PROJECT}-tag cap: ${over.join(', ')}`);
});

test('project-tags: every project carries at least one tag', () => {
  const bare = PROJECTS.filter(p => !(p.tags || []).length).map(p => p.id);
  assert.deepEqual(bare, [], `untagged, so unreachable by every facet: ${bare.join(', ')}`);
});

test(`project-tags: every facet is used by at least ${MIN_PROJECTS_PER_TAG} projects`, () => {
  const count = new Map(PROJECT_TAGS.map(t => [t.label, 0]));
  for (const p of PROJECTS) {
    for (const tag of (p.tags || [])) {
      if (count.has(tag)) count.set(tag, count.get(tag) + 1);
    }
  }
  const thin = [...count.entries()]
    .filter(([, n]) => n < MIN_PROJECTS_PER_TAG)
    .map(([label, n]) => `${label} (${n})`);
  assert.deepEqual(thin, [],
    'a facet used by fewer than two projects is a filter that returns one card: '
    + thin.join(', '));
});

test('project-tags: the projects list is non-trivial', () => {
  assert.ok(PROJECTS.length >= 10,
    `only ${PROJECTS.length} projects loaded — the import is probably wrong`);
});

/* ── Detail-page badge drift ───────────────────────────────────────────────
   The `.project-detail__tags` badges on each projects/*.html are hand-written
   markup — the scaffold in scripts/new-project.js bakes them once at creation
   time and no generator touches them afterwards. So a project retagged in
   data/projects.js keeps its old badges on its own detail page, with the card
   on projects.html and the page it links to disagreeing about what the project
   is. That is not worth a generator (there is nothing to generate once the
   badges are just the tags), but it is worth an assertion. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unescapeHtml = s => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/* Not every project has one: an off-site entry links straight to its own
   deployment. Those are skipped by existence, and the count guard below keeps
   "skipped by existence" from quietly becoming "skipped entirely". */
const withDetailPages = PROJECTS
  .map(p => ({ p, file: path.join(ROOT, 'projects', `${p.id}.html`) }))
  .filter(({ file }) => fs.existsSync(file));

for (const { p, file } of withDetailPages) {
  test(`project-tags: projects/${p.id}.html badges match data/projects.js`, () => {
    const html = fs.readFileSync(file, 'utf8');
    const block = html.match(/<div class="project-detail__tags">([\s\S]*?)<\/div>/);
    assert.ok(block, `projects/${p.id}.html has no .project-detail__tags block`);
    const badges = [...block[1].matchAll(/<span class="project-tag">([\s\S]*?)<\/span>/g)]
      .map(m => unescapeHtml(m[1].trim()));
    assert.deepEqual(badges, p.tags,
      `projects/${p.id}.html shows [${badges.join(', ')}] but data/projects.js says `
      + `[${p.tags.join(', ')}] — update the detail page's badges.`);
  });
}

test('project-tags: most projects were checked for badge drift', () => {
  assert.ok(withDetailPages.length >= PROJECTS.length - 2,
    `only ${withDetailPages.length} of ${PROJECTS.length} projects have a detail page — `
    + 'if that is a path bug, the badge assertions above silently checked nothing');
});
