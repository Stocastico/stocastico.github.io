const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeXml,
  isoToRfc822,
  resolveItemUrl,
  buildRss,
} = require('../scripts/generate-rss.js');

// ─── escapeXml ────────────────────────────────────────────────────────────────

test('escapeXml escapes all five XML special characters', () => {
  assert.equal(escapeXml('a & b < c > d " e \' f'), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
});

test('escapeXml is a no-op for plain ASCII text', () => {
  assert.equal(escapeXml('Hello World'), 'Hello World');
});

test('escapeXml coerces non-string input to string', () => {
  assert.equal(escapeXml(42), '42');
});

// ─── isoToRfc822 ─────────────────────────────────────────────────────────────

test('isoToRfc822 converts an ISO date string to RFC 822 UTC format', () => {
  const result = isoToRfc822('2024-11-20');
  assert.match(result, /^Wed, 20 Nov 2024/);
  assert.match(result, /GMT$/);
});

test('isoToRfc822 does not shift dates by timezone', () => {
  // Any valid ISO date should parse without off-by-one day errors
  const result = isoToRfc822('2024-01-01');
  assert.match(result, /01 Jan 2024/);
});

// ─── resolveItemUrl ───────────────────────────────────────────────────────────

test('resolveItemUrl prepends baseUrl to relative paths', () => {
  assert.equal(
    resolveItemUrl('blog/my-post.html', 'https://stocastico.github.io'),
    'https://stocastico.github.io/blog/my-post.html',
  );
});

test('resolveItemUrl strips leading slash from relative path', () => {
  assert.equal(
    resolveItemUrl('/blog/my-post.html', 'https://example.com'),
    'https://example.com/blog/my-post.html',
  );
});

test('resolveItemUrl leaves absolute URLs unchanged', () => {
  const url = 'https://external.com/article';
  assert.equal(resolveItemUrl(url, 'https://stocastico.github.io'), url);
});

// ─── buildRss ─────────────────────────────────────────────────────────────────

const samplePosts = [
  {
    title: 'First Post',
    date: '2024-11-20',
    excerpt: 'A summary of the first post.',
    tag: 'Research',
    readMin: 5,
    url: 'blog/first-post.html',
  },
  {
    title: 'Second Post',
    date: '2024-09-10',
    excerpt: 'A summary of the second post.',
    tag: 'Engineering',
    readMin: 8,
    url: 'blog/second-post.html',
  },
];

test('buildRss produces a valid RSS 2.0 XML document', () => {
  const xml = buildRss(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /<rss version="2\.0"/);
  assert.match(xml, /<\/rss>$/m);
});

test('buildRss includes all post titles', () => {
  const xml = buildRss(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /First Post/);
  assert.match(xml, /Second Post/);
});

test('buildRss generates correct item links', () => {
  const xml = buildRss(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /https:\/\/stocastico\.github\.io\/blog\/first-post\.html/);
});

test('buildRss includes excerpt in description', () => {
  const xml = buildRss(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /A summary of the first post\./);
});

test('buildRss includes category from tag', () => {
  const xml = buildRss(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /<category>Research<\/category>/);
});

test('buildRss includes atom:link self-reference', () => {
  const xml = buildRss(samplePosts, 'https://stocastico.github.io');
  assert.match(xml, /rel="self"/);
  assert.match(xml, /rss\.xml/);
});

test('buildRss handles empty posts array', () => {
  const xml = buildRss([], 'https://stocastico.github.io');
  assert.match(xml, /<channel>/);
  assert.doesNotMatch(xml, /<item>/);
});

test('buildRss escapes special characters in title and excerpt', () => {
  const posts = [{
    title: 'Post with <special> & "characters"',
    date: '2024-01-01',
    excerpt: 'Excerpt & "more".',
    tag: 'AI',
    readMin: 3,
    url: 'blog/special.html',
  }];
  const xml = buildRss(posts, 'https://example.com');
  assert.match(xml, /&lt;special&gt;/);
  assert.match(xml, /&amp;/);
});
