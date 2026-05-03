'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   SEO regression tests.

   Asserts that every entry-point HTML page ships with:
   - a non-empty <meta name="description">
   - the home page has a JSON-LD Person schema
   - the stat counters in index.html have non-zero numeric content
     (the JS animation resets them to 0 at runtime, but crawlers /
      no-JS users must see the real values)

   Run:  node --test test/seo.test.js
──────────────────────────────────────────────────────────────────────────────*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function metaDescription(html) {
  /* Tolerates attribute order and single/double quotes; matches
     the first <meta name="description" content="..."> found. */
  const m = html.match(/<meta\s+(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/i)
    || html.match(/<meta\s+(?=[^>]*\bcontent=["']([^"']+)["'])(?=[^>]*\bname=["']description["'])[^>]*>/i);
  return m ? m[1].trim() : null;
}

const pages = [
  { rel: 'index.html',    label: 'home' },
  { rel: 'cv.html',       label: 'cv' },
  { rel: 'projects.html', label: 'projects' },
];

for (const { rel, label } of pages) {
  test(`SEO: ${label} (${rel}) has a non-empty <meta name="description">`, () => {
    const html = read(rel);
    const desc = metaDescription(html);
    assert.ok(desc, `<meta name="description"> missing in ${rel}`);
    assert.ok(desc.length > 20, `<meta name="description"> in ${rel} is too short: "${desc}"`);
  });
}

test('SEO: index.html includes a JSON-LD Person schema', () => {
  const html = read('index.html');
  const m = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(m, 'No <script type="application/ld+json"> block found in index.html');
  /* Allow either a single object or an array of structured-data objects. */
  const json = JSON.parse(m[1]);
  const items = Array.isArray(json) ? json : [json];
  const person = items.find((it) => it && it['@type'] === 'Person');
  assert.ok(person, 'JSON-LD does not contain a Person entry');
  assert.equal(typeof person.name, 'string', 'Person.name must be a string');
  assert.ok(person.name.length > 0, 'Person.name must be non-empty');
});

test('SEO: index.html stat counters have non-zero values baked into HTML', () => {
  const html = read('index.html');
  /* Capture each <span class="stat-number" data-count="N">M</span> pair. */
  const re = /<span[^>]*class=["'][^"']*\bstat-number\b[^"']*["'][^>]*data-count=["'](\d+)["'][^>]*>([^<]*)<\/span>/g;
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push({ dataCount: m[1], textContent: m[2].trim() });
  }
  assert.ok(matches.length >= 3, `expected at least 3 stat counters, found ${matches.length}`);
  for (const { dataCount, textContent } of matches) {
    assert.notEqual(textContent, '0', `stat counter (data-count="${dataCount}") still ships with "0" textContent`);
    assert.equal(textContent, dataCount, `stat counter textContent should match data-count (got "${textContent}", expected "${dataCount}")`);
  }
});
