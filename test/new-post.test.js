const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  splitFrontmatter,
  parseFrontmatter,
  validateFrontmatter,
  markdownToHtml,
  buildHtml,
  updateBlogJs,
  slugify,
  formatHumanDate,
} = require('../scripts/new-post.js');

// ─── splitFrontmatter ─────────────────────────────────────────────────────────

test('splitFrontmatter splits YAML block from body', () => {
  const raw = `---
title: "Hello"
date: "2024-01-01"
---
Some body text.
`;
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.match(frontmatter, /title: "Hello"/);
  assert.match(body, /Some body text\./);
});

test('splitFrontmatter returns empty frontmatter when no delimiter present', () => {
  const raw = 'Just some text without frontmatter.';
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.equal(frontmatter, '');
  assert.match(body, /Just some text/);
});

test('splitFrontmatter handles Windows-style line endings', () => {
  const raw = '---\r\ntitle: "Test"\r\n---\r\nBody here.';
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.match(frontmatter, /title/);
  assert.match(body, /Body here/);
});

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

test('parseFrontmatter parses string and numeric values', () => {
  const fm = parseFrontmatter(`title: "My Post"\ndate: 2024-03-15\nreadMin: 5`);
  assert.equal(fm.title, 'My Post');
  assert.equal(fm.date, '2024-03-15');
  assert.equal(fm.readMin, 5);
});

test('parseFrontmatter strips single-quoted strings', () => {
  const fm = parseFrontmatter(`tag: 'Research'`);
  assert.equal(fm.tag, 'Research');
});

test('parseFrontmatter ignores comment lines', () => {
  const fm = parseFrontmatter(`# This is a comment\ntitle: "Post"`);
  assert.equal(fm.title, 'Post');
  assert.equal(fm['# This is a comment'], undefined);
});

// ─── validateFrontmatter ──────────────────────────────────────────────────────

test('validateFrontmatter passes with all required fields', () => {
  const fm = { title: 'T', date: '2024-01-01', excerpt: 'E', tag: 'AI', readMin: 3 };
  assert.doesNotThrow(() => validateFrontmatter(fm, 'test.md'));
});

test('validateFrontmatter throws when a required field is missing', () => {
  const fm = { title: 'T', date: '2024-01-01', excerpt: 'E', tag: 'AI' }; // readMin missing
  assert.throws(() => validateFrontmatter(fm, 'test.md'), /readMin/);
});

test('validateFrontmatter throws on invalid date format', () => {
  const fm = { title: 'T', date: '01-01-2024', excerpt: 'E', tag: 'AI', readMin: 3 };
  assert.throws(() => validateFrontmatter(fm, 'test.md'), /date/);
});

// ─── slugify ──────────────────────────────────────────────────────────────────

test('slugify converts title to lowercase hyphenated slug', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Vision Transformers in Production: A Guide'), 'vision-transformers-in-production-a-guide');
  assert.equal(slugify('  Leading & trailing  '), 'leading-trailing');
});

// ─── formatHumanDate ──────────────────────────────────────────────────────────

test('formatHumanDate converts ISO date to human-readable string', () => {
  assert.equal(formatHumanDate('2024-11-20'), '20 November 2024');
  assert.equal(formatHumanDate('2024-07-18'), '18 July 2024');
  assert.equal(formatHumanDate('2024-01-01'), '1 January 2024');
});

// ─── markdownToHtml ───────────────────────────────────────────────────────────

test('markdownToHtml converts headings', () => {
  const html = markdownToHtml('## Section\n\nParagraph.');
  assert.match(html, /<h2>Section<\/h2>/);
  assert.match(html, /<p>/);
});

test('markdownToHtml wraps paragraphs', () => {
  const html = markdownToHtml('First paragraph.\n\nSecond paragraph.');
  assert.match(html, /<p>/);
  assert.match(html, /First paragraph/);
  assert.match(html, /Second paragraph/);
});

test('markdownToHtml converts bold and italic inline', () => {
  const html = markdownToHtml('This is **bold** and *italic* text.');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
});

test('markdownToHtml converts inline code', () => {
  const html = markdownToHtml('Use `npm test` to run tests.');
  assert.match(html, /<code>npm test<\/code>/);
});

test('markdownToHtml converts links', () => {
  const html = markdownToHtml('See [the docs](https://example.com) for more.');
  assert.match(html, /<a href="https:\/\/example\.com">the docs<\/a>/);
});

test('markdownToHtml converts unordered lists', () => {
  const html = markdownToHtml('- Item one\n- Item two\n- Item three');
  assert.match(html, /<ul>/);
  assert.match(html, /<li>Item one<\/li>/);
  assert.match(html, /<li>Item three<\/li>/);
  assert.match(html, /<\/ul>/);
});

test('markdownToHtml converts ordered lists', () => {
  const html = markdownToHtml('1. First\n2. Second');
  assert.match(html, /<ol>/);
  assert.match(html, /<li>First<\/li>/);
  assert.match(html, /<\/ol>/);
});

test('markdownToHtml converts fenced code blocks', () => {
  const html = markdownToHtml('```python\ndef hello():\n    return "world"\n```');
  assert.match(html, /<pre><code class="language-python">/);
  assert.match(html, /def hello/);
  assert.match(html, /<\/code><\/pre>/);
});

test('markdownToHtml converts blockquotes', () => {
  const html = markdownToHtml('> This is a quote.');
  assert.match(html, /<blockquote>/);
  assert.match(html, /This is a quote/);
});

test('markdownToHtml escapes HTML special characters', () => {
  const html = markdownToHtml('A < B & C > D in "quotes"');
  assert.match(html, /&lt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&gt;/);
});

// ─── buildHtml ────────────────────────────────────────────────────────────────

test('buildHtml produces valid HTML structure', () => {
  const fm = { title: 'My Post', date: '2024-06-15', tag: 'Research', readMin: 5, excerpt: 'A test post.' };
  const html = buildHtml(fm, '<p>Body content.</p>');
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /My Post/);
  assert.match(html, /15 June 2024/);
  assert.match(html, /Research/);
  assert.match(html, /5 min read/);
  assert.match(html, /Body content\./);
  assert.match(html, /rel="stylesheet" href="\.\.\/css\/styles\.css"/);
  assert.match(html, /Back to blog/);
});

test('buildHtml includes lead paragraph when provided', () => {
  const fm = {
    title: 'Post', date: '2024-01-01', tag: 'AI', readMin: 3,
    excerpt: 'Excerpt.', lead: 'Opening sentence.',
  };
  const html = buildHtml(fm, '<p>Body.</p>');
  assert.match(html, /class="post-lead"/);
  assert.match(html, /Opening sentence\./);
});

test('buildHtml omits lead paragraph when not provided', () => {
  const fm = { title: 'Post', date: '2024-01-01', tag: 'AI', readMin: 3, excerpt: 'E.' };
  const html = buildHtml(fm, '<p>Body.</p>');
  assert.doesNotMatch(html, /post-lead/);
});

// ─── updateBlogJs ─────────────────────────────────────────────────────────────

test('updateBlogJs prepends entry to existing BLOG_POSTS array', () => {
  const original = `const BLOG_POSTS = [\n    {\n        title: 'Old Post',\n        date: '2024-01-01',\n        excerpt: 'Old.',\n        tag: 'AI',\n        readMin: 3,\n        url: 'blog/old.html',\n    },\n];\n`;
  const entry = { title: 'New Post', date: '2024-12-01', excerpt: 'New.', tag: 'Research', readMin: 7, url: 'blog/new.html' };
  const updated = updateBlogJs('/fake/blog.js', entry, original);
  // New entry should appear before old one
  const newIdx = updated.indexOf('New Post');
  const oldIdx = updated.indexOf('Old Post');
  assert.ok(newIdx < oldIdx, 'New post should appear before old post');
});

test('updateBlogJs throws if BLOG_POSTS array is not found', () => {
  assert.throws(
    () => updateBlogJs('/fake/blog.js', {}, 'const FOO = [];'),
    /BLOG_POSTS/,
  );
});

// ─── Integration: write + read a full markdown file ──────────────────────────

test('end-to-end: parse markdown file and generate correct HTML', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'new-post-test-'));
  const mdFile = path.join(tmpDir, 'test-post.md');
  const mdContent = `---
title: "End to End Test Post"
date: "2024-12-15"
excerpt: "A comprehensive test of the full pipeline."
tag: "Engineering"
readMin: 4
lead: "This is the opening sentence."
---
## Introduction

This is a paragraph with **bold** and *italic* text.

- Item A
- Item B

\`\`\`js
console.log('hello');
\`\`\`
`;
  fs.writeFileSync(mdFile, mdContent, 'utf8');

  const raw = fs.readFileSync(mdFile, 'utf8');
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = parseFrontmatter(frontmatter);
  validateFrontmatter(fm, mdFile);

  const bodyHtml = markdownToHtml(body);
  const html = buildHtml(fm, bodyHtml);

  assert.match(html, /End to End Test Post/);
  assert.match(html, /15 December 2024/);
  assert.match(html, /This is the opening sentence\./);
  assert.match(html, /<h2>Introduction<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<ul>/);
  assert.match(html, /language-js/);

  fs.rmSync(tmpDir, { recursive: true });
});
