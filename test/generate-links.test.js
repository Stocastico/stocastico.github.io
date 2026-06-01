'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compileLinks,
  compileLink,
  isSafeHttpsUrl,
  dedupeKey,
  labelFor,
  toLinksJs,
  parseYaml,
} = require('../scripts/generate-links.js');

const SAMPLE = {
  links: [
    {
      name: "Lil'Log",
      url: 'https://lilianweng.github.io',
      description: 'Deep, careful explainers.',
      categories: ['ai'],
      tags: ['research'],
    },
    {
      name: 'Chris Olah',
      url: 'https://colah.github.io',
      categories: ['ai', 'visual-explanation'],
      tags: ['interpretability'],
    },
    {
      name: '3Blue1Brown',
      url: 'https://www.3blue1brown.com',
      categories: ['engineering-math-physics', 'visual-explanation'],
    },
  ],
};

test('compileLinks flattens the list and preserves entry order', () => {
  const out = compileLinks(SAMPLE);
  assert.equal(out.links.length, 3);
  assert.equal(out.links[0].name, "Lil'Log");
  assert.equal(out.links[1].name, 'Chris Olah');
  assert.equal(out.links[2].name, '3Blue1Brown');
});

test('compileLinks keeps each link\'s multiple categories', () => {
  const out = compileLinks(SAMPLE);
  assert.deepEqual(out.links[1].categories, ['ai', 'visual-explanation']);
});

test('compileLinks emits used categories in canonical order with labels', () => {
  const out = compileLinks(SAMPLE);
  assert.deepEqual(out.categories, [
    { slug: 'ai', label: 'AI' },
    { slug: 'engineering-math-physics', label: 'Engineering, Math & Physics' },
    { slug: 'visual-explanation', label: 'Visual Explanations' },
  ]);
});

test('compileLinks de-duplicates by URL, merging categories and tags', () => {
  const out = compileLinks({
    links: [
      { name: 'Site', url: 'https://example.com', categories: ['ai'], tags: ['x'] },
      { name: 'Site (again)', url: 'https://example.com/', categories: ['misc'], tags: ['y'], description: 'Filled in.' },
    ],
  });
  assert.equal(out.links.length, 1, 'duplicate URL collapses to one card');
  assert.deepEqual(out.links[0].categories, ['ai', 'misc'], 'categories are unioned');
  assert.deepEqual(out.links[0].tags, ['x', 'y'], 'tags are unioned');
  assert.equal(out.links[0].name, 'Site', 'first occurrence wins for name');
  assert.equal(out.links[0].description, 'Filled in.', 'missing description filled from duplicate');
});

test('compileLink requires a name, an https url, and at least one category', () => {
  assert.equal(compileLink({ url: 'https://x.example', categories: ['ai'] }), null, 'no name');
  assert.equal(compileLink({ name: 'No url', categories: ['ai'] }), null, 'no url');
  assert.equal(compileLink({ name: 'No cat', url: 'https://x.example' }), null, 'no category');
  assert.equal(compileLink({ name: 'No cat', url: 'https://x.example', categories: [] }), null, 'empty category');
  const ok = compileLink({ name: 'Ok', url: 'https://x.example', categories: ['ai'] });
  assert.equal(ok.name, 'Ok');
});

test('compileLinks rejects http (non-https), javascript: and protocol-relative URLs', () => {
  const out = compileLinks({
    links: [
      { name: 'evil', url: 'javascript:alert(1)', categories: ['ai'] },
      { name: 'insecure', url: 'http://example.com', categories: ['ai'] },
      { name: 'schemeless', url: '//example.com', categories: ['ai'] },
      { name: 'good', url: 'https://example.com', categories: ['ai'] },
    ],
  });
  assert.equal(out.links.length, 1);
  assert.equal(out.links[0].name, 'good');
});

test('isSafeHttpsUrl accepts https only', () => {
  assert.ok(isSafeHttpsUrl('https://example.com'));
  assert.ok(!isSafeHttpsUrl('http://example.com'));
  assert.ok(!isSafeHttpsUrl('ftp://example.com'));
  assert.ok(!isSafeHttpsUrl('//example.com'));
});

test('unknown category slugs are tolerated, humanised and appended after known ones', () => {
  const out = compileLinks({
    links: [{ name: 'X', url: 'https://x.example', categories: ['ai', 'tools-for-thought'] }],
  });
  assert.deepEqual(out.categories, [
    { slug: 'ai', label: 'AI' },
    { slug: 'tools-for-thought', label: 'Tools For Thought' },
  ]);
});

test('dedupeKey normalises trailing slashes and case', () => {
  assert.equal(dedupeKey('https://Example.com/Foo/'), dedupeKey('https://example.com/Foo'));
  assert.notEqual(dedupeKey('https://example.com/a'), dedupeKey('https://example.com/b'));
});

test('labelFor uses the known map and falls back to humanising', () => {
  assert.equal(labelFor('ai'), 'AI');
  assert.equal(labelFor('beautiful-websites'), 'Beautiful Websites');
  assert.equal(labelFor('some-new-thing'), 'Some New Thing');
});

test('compileLink trims whitespace and drops an empty tag list', () => {
  const link = compileLink({ name: '  Spaced  ', url: '  https://example.com  ', categories: [' ai '], tags: ['', '  '] });
  assert.equal(link.name, 'Spaced');
  assert.equal(link.url, 'https://example.com');
  assert.deepEqual(link.categories, ['ai']);
  assert.ok(!('tags' in link), 'all-empty tags are omitted');
});

test('compileLinks tolerates an empty / malformed source', () => {
  assert.deepEqual(compileLinks({}).links, []);
  assert.deepEqual(compileLinks({}).categories, []);
  assert.deepEqual(compileLinks(null).links, []);
  assert.deepEqual(compileLinks({ links: 'nope' }).links, []);
});

test('toLinksJs emits an ESM module exporting LINKS with categories and links', () => {
  const js = toLinksJs(compileLinks(SAMPLE), 'data/links.yaml');
  assert.match(js, /export const LINKS =/);
  assert.match(js, /"categories":/);
  assert.match(js, /"links":/);
  assert.match(js, /globalThis\.LINKS/);
  assert.ok(!js.includes('_duplicates'), 'internal counter is not serialised');
});

test('parseYaml reads inline flow sequences ([a, b]) into arrays', () => {
  const doc = parseYaml([
    'links:',
    '  - name: "X"',
    '    url: "https://x.example"',
    '    categories: [ai, visual-explanation]',
    '    tags: ["a", "b"]',
    '  - name: "Y"',
    '    url: "https://y.example"',
    '    categories: [misc]',
    '    tags: []',
  ].join('\n'));
  assert.deepEqual(doc.links[0].categories, ['ai', 'visual-explanation']);
  assert.deepEqual(doc.links[0].tags, ['a', 'b']);
  assert.deepEqual(doc.links[1].categories, ['misc']);
  assert.deepEqual(doc.links[1].tags, []);
});
