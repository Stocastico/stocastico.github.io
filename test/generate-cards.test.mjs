/* Regression tests for the static card/publication generator.

   The point of server-rendering these grids is that crawlers and no-JS
   visitors see real content, and that the committed HTML never drifts from
   data/projects.js + data/publications.js. These tests assert both. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderAll, TARGETS } from '../scripts/generate-cards.mjs';
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

test('generate-cards: homepage ships the 3 newest project cards statically', () => {
  const html = read('index.html');
  for (const p of PROJECTS.slice(0, 3)) {
    assert.ok(html.includes(p.title), `index.html missing static project card: ${p.title}`);
  }
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
