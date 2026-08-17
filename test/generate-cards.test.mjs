/* Regression tests for the static card/publication generator.

   The point of server-rendering these grids is that crawlers and no-JS
   visitors see real content, and that the committed HTML never drifts from
   data/projects.js + data/publications.js. These tests assert both. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequire } from 'node:module';

import { renderAll, TARGETS } from '../scripts/generate-cards.mjs';
import { PROJECT_KINDS, homepageProjects, assertProjectKinds } from '../js/render-cards.js';
import { PROJECTS } from '../data/projects.js';
import { PUBLICATIONS } from '../data/publications.js';
import { CV_CAREER, CV_EDUCATION, CV_SKILLS } from '../data/cv.js';
import { UNESCO } from '../data/unesco.js';
import { LINKS } from '../data/links.js';
import { escapeHtml } from '../js/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('generate-cards: committed HTML is in sync with the data (no drift)', () => {
  const rendered = renderAll();
  for (const rel of Object.keys(TARGETS)) {
    assert.equal(rendered[rel], read(rel),
      `${rel} is stale — run \`npm run generate-cards\` and commit the result`);
  }
});

test('generate-cards: homepage ships the 3 newest work project cards statically', () => {
  const html = read('index.html');
  for (const p of homepageProjects(PROJECTS).slice(0, 3)) {
    assert.ok(html.includes(p.title), `index.html missing static project card: ${p.title}`);
  }
});

/* ── kind ─────────────────────────────────────────────────────────────────
   The invariant below is the kind that is invisible once it breaks: a
   personal project on the homepage renders a perfectly good-looking page,
   just with the wrong three cards. Nothing errors, nothing looks broken. */

test('every project declares a valid kind', () => {
  assert.doesNotThrow(() => assertProjectKinds(PROJECTS));
});

test('generate-cards: no personal project reaches the homepage', () => {
  const personal = PROJECTS.filter((p) => p.kind === 'personal');
  assert.ok(personal.length >= 1, 'expected at least one personal project to guard against');

  /* Checked against the committed HTML, not against homepageProjects() — a bug
     in the filter would make a test that reuses it pass while the shipped page
     is wrong. This asserts what a visitor is actually served. */
  const html = read('index.html');
  const start = html.indexOf('<!-- generated:project-cards -->');
  const end = html.indexOf('<!-- /generated:project-cards -->');
  assert.ok(start !== -1 && end > start, 'index.html: project-cards markers missing');
  const block = html.slice(start, end);

  for (const p of personal) {
    assert.ok(!block.includes(p.title),
      `index.html shows personal project "${p.id}" — the homepage is work only`);
    assert.ok(!block.includes(p.url),
      `index.html links personal project "${p.id}" — the homepage is work only`);
  }
});

test('generate-cards: projects.html badges the personal projects and only those', () => {
  const html = read('projects.html');
  const badges = (html.match(/class="project-card__kind"/g) || []).length;
  const personal = PROJECTS.filter((p) => p.kind === 'personal').length;
  assert.equal(badges, personal,
    'projects.html badge count should equal the number of personal projects');
});

/* Off-site entries. One project (the Donostia dataviz) links out of the Vite
   build to a page served from the same domain by another repo, in another
   language. Two things have to hold for that to be honest: the anchor declares
   the language it is sending you to, and every sitemap entry is a page the
   domain actually serves. Both are cheap to get wrong silently.

   The second rule used to read "this build never produces it", which barred
   the off-site page outright — and so left the strongest piece of the
   portfolio as the only page never declared to a search engine. The honest
   line is the domain, not the build: GitHub Pages serves a project repo at
   /<repo>/ under this same custom domain, so /donostia-dataviz/ is as real a
   page of this site as /cv.html. What the rule still has to catch is an entry
   backed by nothing at all — a typo, or a page since deleted — so the check
   below now runs the stronger direction: every <loc> must be either a file
   this build produces or an off-site page declared in data/projects.js.
   (Liveness of the sibling repo is not asserted here: no unit test in this
   repo reaches the network, and check-links.mjs covers the curated outbound
   links only.) */
test('generate-cards: an entry with `lang` renders hreflang on its card', () => {
  const tagged = PROJECTS.filter((p) => p.lang);
  assert.ok(tagged.length >= 1, 'expected at least one off-site entry to guard against');
  const html = read('projects.html');
  for (const p of tagged) {
    assert.match(html, new RegExp(`href="${p.url}" hreflang="${p.lang}"`),
      `projects.html card for "${p.id}" must carry hreflang="${p.lang}"`);
  }
});

test('sitemap: every entry is a page this domain serves', () => {
  const sitemap = read('public/sitemap.xml');
  const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(paths.length >= 12, `expected >=12 <loc> entries, got ${paths.length}`);
  const offSite = new Set(
    PROJECTS.filter((p) => p.url && p.url.startsWith('/')).map((p) => p.url),
  );
  for (const p of paths) {
    if (offSite.has(p)) continue; // sibling repo, same domain — declared in data/projects.js
    const rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)),
      `sitemap.xml lists "${p}", which is neither built here nor a declared off-site project`);
  }
});

test('generate-cards: the generator refuses a project with no kind', () => {
  assert.throws(
    () => assertProjectKinds([{ id: 'forgot-it', title: 'X' }]),
    /forgot-it/,
    'a missing kind must fail the build, not default to work',
  );
});

/* new-project.js is CJS and cannot import the ESM module, so it keeps its own
   copy of the list. This is what stops the copy drifting. */
test('new-project.js and render-cards.js agree on the valid kinds', () => {
  const require = createRequire(import.meta.url);
  const { PROJECT_KINDS: SCRIPT_KINDS } = require('../scripts/new-project.js');
  assert.deepEqual(SCRIPT_KINDS, PROJECT_KINDS);
});

test('generate-cards: homepage ships the featured publications statically', () => {
  const html = read('index.html');
  const featured = PUBLICATIONS.filter((p) => p.featured);
  assert.ok(featured.length >= 1, 'expected at least one featured publication');
  for (const pub of featured) {
    assert.ok(html.includes(pub.title), `index.html missing featured paper: ${pub.title}`);
  }
});

test('generate-cards: projects.html lists every project statically', () => {
  const html = read('projects.html');
  for (const p of PROJECTS) {
    assert.ok(html.includes(p.title), `projects.html missing project: ${p.title}`);
  }
});

test('generate-cards: publications.html lists every paper statically', () => {
  const html = read('publications.html');
  assert.ok(PUBLICATIONS.length >= 30, 'expected the full (30+) publication list');
  for (const pub of PUBLICATIONS) {
    assert.ok(html.includes(pub.title), `publications.html missing paper: ${pub.title}`);
  }
});

/* ── the three pages that used to ship empty ──────────────────────────────
   cv.html, links.html and travel.html rendered their content only in the
   browser, so the built HTML carried a navbar, a footer, meta tags and
   nothing else. That is invisible in every way that matters day to day —
   the pages look perfect to anyone running JS — which is exactly why it
   survived so long, and why the check has to read the committed markup
   rather than call the builder and compare it to itself. */

test('cv.html ships the full career and education history statically', () => {
  const html = read('cv.html');
  assert.ok(CV_CAREER.length >= 3, 'expected a career history to guard');
  for (const job of CV_CAREER) {
    assert.ok(html.includes(escapeHtml(job.company)), `cv.html missing employer: ${job.company}`);
    assert.ok(html.includes(escapeHtml(job.role)), `cv.html missing role: ${job.role}`);
  }
  for (const deg of CV_EDUCATION) {
    assert.ok(html.includes(escapeHtml(deg.institution)), `cv.html missing institution: ${deg.institution}`);
  }
});

test('cv.html ships the skills panels statically', () => {
  const html = read('cv.html');
  for (const skill of (CV_SKILLS.technical || [])) {
    assert.ok(html.includes(escapeHtml(skill.name)), `cv.html missing technical skill: ${skill.name}`);
  }
  for (const lang of (CV_SKILLS.languages || [])) {
    assert.ok(html.includes(escapeHtml(lang.name)), `cv.html missing language: ${lang.name}`);
  }
});

test('links.html ships every link statically', () => {
  const html = read('links.html');
  assert.ok(LINKS.links.length >= 20, 'expected the full blogroll');
  for (const link of LINKS.links) {
    assert.ok(html.includes(escapeHtml(link.url)), `links.html missing link: ${link.url}`);
  }
});

test('travel.html ships every UNESCO site statically', () => {
  const html = read('travel.html');
  let sites = 0;
  for (const cont of UNESCO.continents) {
    for (const country of (cont.countries || [])) {
      for (const site of (country.sites || [])) {
        sites += 1;
        assert.ok(html.includes(escapeHtml(site.url)), `travel.html missing UNESCO site: ${site.name}`);
      }
    }
  }
  assert.ok(sites >= 10, `expected a populated UNESCO list, found ${sites}`);
});

/* The failure this guards is a container that renders but stays empty — the
   markers present, the block between them blank. Byte count is a blunt but
   honest proxy: an empty shell cannot reach these sizes.

   The floor is per-block rather than one global number because the blocks are
   not one kind of thing. Every original block was a list — cards, papers,
   accordion rows — where 200 chars is comfortably below a single entry.
   `unesco-total` is one sentence, and a single number is the whole point of
   it; it renders at ~139 chars and always will. Lowering the global floor to
   fit it would have quietly halved the protection on the six list blocks,
   which is the opposite of what this test is for. */
const MIN_BLOCK_CHARS = { 'generated:unesco-total': 60 };

test('no page ships an empty generated block', () => {
  for (const [rel, blocks] of Object.entries(TARGETS)) {
    const html = read(rel);
    for (const name of Object.keys(blocks)) {
      const start = html.indexOf(`<!-- ${name} -->`);
      const end = html.indexOf(`<!-- /${name} -->`);
      assert.ok(start !== -1 && end > start, `${rel}: ${name} markers missing`);
      const body = html.slice(start + name.length + 8, end).trim();
      const floor = MIN_BLOCK_CHARS[name] ?? 200;
      assert.ok(body.length > floor,
        `${rel}: ${name} is empty or near-empty (${body.length} chars, floor ${floor}) — run \`npm run generate-cards\``);
    }
  }
});

/* The total is the one number the travel page exists to report, so it gets a
   check of its own rather than riding on a byte count: it must equal the
   number of sites actually in the data. A hand-typed 100 sat on that page
   through the whole period the United States was filed under Europe. */
test('travel.html reports the true visited-site total', () => {
  const html = read('travel.html');
  const sites = UNESCO.continents.reduce(
    (n, cont) => n + (cont.countries || []).reduce(
      (m, country) => m + (country.sites || []).length, 0,
    ), 0,
  );
  assert.match(html, new RegExp(`<strong class="unesco-total-num">${sites}</strong>`),
    `travel.html should report ${sites} visited sites — run \`npm run generate-cards\``);
});
