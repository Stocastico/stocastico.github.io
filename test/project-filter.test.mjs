/* Filtering projects by facet.
 
   projects.html rendered tag badges that looked interactive and did nothing,
   while links.html two clicks away had real, working chips. This mirrors the
   links implementation rather than inventing a second one: the same chip
   shape, the same single-select rule, the same `hidden` attribute on the
   cards, the same polite live count.

   The invariant worth pinning hardest is the one at the bottom: cards are
   HIDDEN, never removed. The site's most important internal links are the
   CV's role -> project cross-links, and a filter that emptied the DOM would
   quietly break anything anchored into this page. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../data/projects.js';
import { PROJECT_TAGS, tagSlugsFor } from '../js/project-tags.js';
import { projectFilterLines, projectsCountLabel } from '../js/render-page.js';
import { projectCardHtml } from '../js/render-cards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectsHtml = fs.readFileSync(path.join(ROOT, 'projects.html'), 'utf8');

/* ── (a) chip markup ─────────────────────────────────────────────────────── */

test('project-filter: builds an "All" chip plus one per facet', () => {
  const html = projectFilterLines(PROJECTS, PROJECT_TAGS).join('\n');

  assert.match(html, /class="projects-toolbar"/);
  assert.match(html, /data-filter="all"[^>]*data-label="All"/);

  for (const tag of PROJECT_TAGS) {
    assert.ok(html.includes(`data-filter="${tag.slug}"`),
      `no chip for facet "${tag.slug}"`);
    assert.ok(html.includes(`data-label="${tag.label.replace(/&/g, '&amp;')}"`),
      `chip for "${tag.slug}" has no escaped data-label`);
  }

  const chips = [...html.matchAll(/<button class="project-chip[^"]*"/g)];
  assert.equal(chips.length, PROJECT_TAGS.length + 1,
    'expected one chip per facet plus "All"');
});

test('project-filter: "All" is the only chip pressed at rest', () => {
  const html = projectFilterLines(PROJECTS, PROJECT_TAGS).join('\n');
  const pressed = [...html.matchAll(/data-filter="([^"]+)"[^>]*aria-pressed="true"/g)]
    .map(m => m[1]);
  assert.deepEqual(pressed, ['all'],
    'exactly one chip may start pressed, and it must be "All"');
  const unpressed = [...html.matchAll(/aria-pressed="false"/g)];
  assert.equal(unpressed.length, PROJECT_TAGS.length);
});

test('project-filter: each chip carries the number of projects in its facet', () => {
  const html = projectFilterLines(PROJECTS, PROJECT_TAGS).join('\n');
  for (const tag of PROJECT_TAGS) {
    const n = PROJECTS.filter(p => (p.tags || []).includes(tag.label)).length;
    const chip = html.match(new RegExp(`data-filter="${tag.slug}"[^>]*>([\\s\\S]*?)</button>`));
    assert.ok(chip, `no chip found for "${tag.slug}"`);
    assert.match(chip[1], new RegExp(`>${n}<`),
      `chip "${tag.slug}" should show a count of ${n}, got: ${chip[1]}`);
  }
});

test('project-filter: the toolbar is labelled as a filter group', () => {
  const html = projectFilterLines(PROJECTS, PROJECT_TAGS).join('\n');
  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="[^"]*[Ff]ilter[^"]*"/);
  /* The live count is polite, not assertive — it narrates a result the
     visitor already asked for. */
  assert.match(html, /class="projects-count"[^>]*role="status"[^>]*aria-live="polite"/);
});

/* ── (b) the matcher ─────────────────────────────────────────────────────── */

test('project-filter: projectMatchesFilter returns the right subset per facet', async () => {
  const { projectMatchesFilter } = await import('../js/main.js');
  assert.equal(typeof projectMatchesFilter, 'function',
    'main.js must export projectMatchesFilter');

  assert.equal(projectMatchesFilter(['computer-vision'], 'all'), true);
  assert.equal(projectMatchesFilter([], 'all'), true);
  assert.equal(projectMatchesFilter([], ''), true, 'no filter means no filtering');
  assert.equal(projectMatchesFilter(['computer-vision', 'ar-3d'], 'ar-3d'), true);
  assert.equal(projectMatchesFilter(['computer-vision'], 'ar-3d'), false);
  assert.equal(projectMatchesFilter([], 'ar-3d'), false);
  assert.equal(projectMatchesFilter(null, 'ar-3d'), false);

  /* Against the real data, for every facet: the matcher must select exactly
     the projects the vocabulary says belong to it. */
  for (const tag of PROJECT_TAGS) {
    const byMatcher = PROJECTS
      .filter(p => projectMatchesFilter(tagSlugsFor(p.tags), tag.slug))
      .map(p => p.id).sort();
    const byData = PROJECTS
      .filter(p => (p.tags || []).includes(tag.label))
      .map(p => p.id).sort();
    assert.deepEqual(byMatcher, byData, `facet "${tag.slug}" selects the wrong set`);
    assert.ok(byData.length >= 2, `facet "${tag.slug}" would return fewer than 2 cards`);
  }

  /* "All" must reach every card — including any project whose tags somehow
     fell outside the vocabulary. */
  const all = PROJECTS.filter(p => projectMatchesFilter(tagSlugsFor(p.tags), 'all'));
  assert.equal(all.length, PROJECTS.length);
});

test('project-filter: tagSlugsFor maps labels to slugs and drops strays', () => {
  assert.deepEqual(tagSlugsFor(['Computer Vision', 'AR & 3D']), ['computer-vision', 'ar-3d']);
  assert.deepEqual(tagSlugsFor(['Not A Facet']), [],
    'an unknown label must be dropped, not slugified into a facet no chip selects');
  assert.deepEqual(tagSlugsFor(undefined), []);
});

test('project-filter: the count label reads the same server-side and client-side', () => {
  assert.equal(projectsCountLabel(14, 14, ''), 'Showing all 14 projects');
  assert.match(projectsCountLabel(6, 14, 'Computer Vision'), /6 projects in Computer Vision/);
  assert.match(projectsCountLabel(1, 14, 'Computer Vision'), /1 project in Computer Vision/,
    'singular for one result');
});

/* ── (c) what a no-JS visitor and a crawler are served ───────────────────── */

test('project-filter: projects.html ships the chips server-rendered', () => {
  assert.match(projectsHtml, /class="projects-toolbar"/,
    'projects.html has no filter toolbar — run `npm run generate-cards`');
  for (const tag of PROJECT_TAGS) {
    assert.ok(projectsHtml.includes(`data-filter="${tag.slug}"`),
      `projects.html is missing the "${tag.slug}" chip`);
  }
  assert.match(projectsHtml, /class="projects-count"/);
});

test('project-filter: every card in projects.html carries its facets in data-tags', () => {
  const cards = [...projectsHtml.matchAll(/<a [^>]*class="project-card"[^>]*>/g)]
    .map(m => m[0]);
  assert.equal(cards.length, PROJECTS.length,
    `expected ${PROJECTS.length} cards in projects.html, found ${cards.length}`);

  for (const p of PROJECTS) {
    const expected = tagSlugsFor(p.tags).join(' ');
    const card = cards.find(c => c.includes(`href="${p.url.replace(/&/g, '&amp;')}"`));
    assert.ok(card, `no card found for ${p.id}`);
    assert.ok(card.includes(`data-tags="${expected}"`),
      `${p.id}'s card should carry data-tags="${expected}"\n  got: ${card}`);
  }
});

test('project-filter: a card built without JS is identical to the one shipped', () => {
  /* Same builder both sides — the chips are the only new markup, and they are
     inert without JS, which is correct: the full list is what a no-JS visitor
     should see and the chips only ever remove entries from it. */
  const built = projectCardHtml(PROJECTS[0], 0, { level: 2 });
  assert.ok(projectsHtml.includes(built),
    'the committed card markup has drifted from projectCardHtml() — run `npm run generate-cards`');
});

/* ── (d) hidden, never removed ───────────────────────────────────────────── */

test('project-filter: .project-card has a [hidden] companion rule', () => {
  /* .project-card declares `display: flex`, and an author declaration beats
     the UA stylesheet's `[hidden] { display: none }` on origin. Without the
     companion rule the filter would set the attribute and change nothing on
     screen — the same trap .cmd-item hit (see css/styles.css). */
  const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
  assert.match(css, /\.project-card\[hidden\]\s*\{[^}]*display:\s*none/,
    'add `.project-card[hidden] { display: none; }` or the filter hides nothing');
});

test('project-filter: the CV cross-links point at pages the filter cannot touch', () => {
  /* The CV's role -> project links are the site's most important internal
     links. They resolve to projects/<id>.html detail pages, NOT to anchors on
     projects.html, so hiding a card cannot break one. This test pins that:
     if a cross-link is ever pointed at `projects.html#id`, filtering would be
     able to hide its target and this goes red. */
  const cv = fs.readFileSync(path.join(ROOT, 'data', 'cv.yaml'), 'utf8');
  const urls = [...cv.matchAll(/^\s*url:\s*(\S+)\s*$/gm)].map(m => m[1]);
  assert.ok(urls.length >= 10, `only ${urls.length} cv.yaml links found — regex drift?`);

  for (const url of urls) {
    assert.ok(!url.startsWith('projects.html#') && !url.startsWith('/projects.html#'),
      `${url} anchors into the filterable card grid; the filter could hide its target`);
    if (url.startsWith('/projects/')) {
      assert.ok(fs.existsSync(path.join(ROOT, url.slice(1))),
        `cv.yaml links ${url}, which does not exist`);
    }
  }
});
