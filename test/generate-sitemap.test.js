const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeXml,
  buildSitemap,
  buildEntries,
  todayIso,
} = require('../scripts/generate-sitemap.js');

const samplePosts = [
  { title: 'Post A', date: '2024-11-20', excerpt: 'Excerpt A', tag: 'Research', readMin: 5, url: 'blog/post-a.html' },
  { title: 'Post B', date: '2024-09-10', excerpt: 'Excerpt B', tag: 'AI',       readMin: 7, url: 'blog/post-b.html' },
  { title: 'External', date: '2024-08-01', excerpt: 'Ext.', tag: 'AI', readMin: 4, url: 'https://external.com/paper' },
];

// ─── escapeXml ────────────────────────────────────────────────────────────────

test('escapeXml escapes XML special characters', () => {
  assert.equal(escapeXml('<b>&"'), '&lt;b&gt;&amp;&quot;');
});

// ─── todayIso ─────────────────────────────────────────────────────────────────

test('todayIso returns a YYYY-MM-DD string', () => {
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

// ─── buildEntries ─────────────────────────────────────────────────────────────

test('buildEntries always includes the homepage as first entry', () => {
  const entries = buildEntries([], 'https://stocastico.github.io');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].loc, 'https://stocastico.github.io/');
  assert.equal(entries[0].priority, '1.0');
});

test('buildEntries adds relative blog post URLs', () => {
  const entries = buildEntries(samplePosts, 'https://stocastico.github.io');
  const locs = entries.map((e) => e.loc);
  assert.ok(locs.includes('https://stocastico.github.io/blog/post-a.html'));
  assert.ok(locs.includes('https://stocastico.github.io/blog/post-b.html'));
});

test('buildEntries skips absolute/external post URLs', () => {
  const entries = buildEntries(samplePosts, 'https://stocastico.github.io');
  const locs = entries.map((e) => e.loc);
  assert.ok(!locs.includes('https://external.com/paper'), 'External URL should be skipped');
});

test('buildEntries sets blog post date as lastmod', () => {
  const entries = buildEntries(samplePosts, 'https://stocastico.github.io');
  const postA = entries.find((e) => e.loc.includes('post-a'));
  assert.equal(postA.lastmod, '2024-11-20');
});

// ─── buildSitemap ─────────────────────────────────────────────────────────────

test('buildSitemap produces valid XML with urlset element', () => {
  const xml = buildSitemap(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /<urlset xmlns=/);
  assert.match(xml, /<\/urlset>/);
});

test('buildSitemap includes homepage URL', () => {
  const xml = buildSitemap(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /<loc>https:\/\/stocastico\.github\.io\/<\/loc>/);
});

test('buildSitemap includes blog post URLs', () => {
  const xml = buildSitemap(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /blog\/post-a\.html/);
  assert.match(xml, /blog\/post-b\.html/);
});

test('buildSitemap omits external URLs', () => {
  const xml = buildSitemap(samplePosts, 'https://stocastico.github.io');
  assert.doesNotMatch(xml, /external\.com/);
});

test('buildSitemap uses post date as lastmod for blog entries', () => {
  const xml = buildSitemap(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /<lastmod>2024-11-20<\/lastmod>/);
});

test('buildSitemap respects a custom baseUrl', () => {
  const xml = buildSitemap([], 'https://my-custom-site.com');
  assert.match(xml, /https:\/\/my-custom-site\.com\//);
});
