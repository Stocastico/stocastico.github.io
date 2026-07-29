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
