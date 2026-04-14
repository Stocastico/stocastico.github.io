const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  splitFrontmatter,
  parseFrontmatter,
  validateProjectFrontmatter,
  markdownToHtml,
  buildProjectPage,
  updateProjectsJs,
  slugify,
  parseTags,
  deriveOutputPath,
} = require('../scripts/new-project.js');

// ─── splitFrontmatter ─────────────────────────────────────────────────────────

test('project: splitFrontmatter splits YAML block from body', () => {
  const raw = `---
id: my-project
title: "My Project"
year: "2024"
---
Some body text.
`;
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.match(frontmatter, /title: "My Project"/);
  assert.match(body, /Some body text\./);
});

test('project: splitFrontmatter returns empty frontmatter when no delimiter present', () => {
  const raw = 'Just some text without frontmatter.';
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.equal(frontmatter, '');
  assert.match(body, /Just some text/);
});

test('project: splitFrontmatter handles Windows-style line endings', () => {
  const raw = '---\r\nid: test\r\ntitle: "Test"\r\n---\r\nBody here.';
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.match(frontmatter, /title/);
  assert.match(body, /Body here/);
});

// ─── parseFrontmatter ─────────────────────────────────────────────────────────

test('project: parseFrontmatter parses string values', () => {
  const fm = parseFrontmatter(`id: my-project\ntitle: "My Project"\nyear: "2024"`);
  assert.equal(fm.id, 'my-project');
  assert.equal(fm.title, 'My Project');
  // Numeric-looking strings are parsed as numbers (same as new-post.js)
  assert.equal(fm.year, 2024);
});

test('project: parseFrontmatter parses tags as comma-separated string', () => {
  const fm = parseFrontmatter(`tags: "AR, Education, Unity"`);
  assert.equal(fm.tags, 'AR, Education, Unity');
});

test('project: parseFrontmatter ignores comment lines', () => {
  const fm = parseFrontmatter(`# comment\nid: test`);
  assert.equal(fm.id, 'test');
  assert.equal(fm['# comment'], undefined);
});

// ─── validateProjectFrontmatter ───────────────────────────────────────────────

test('project: validateProjectFrontmatter passes with all required fields', () => {
  const fm = {
    id: 'my-project',
    title: 'My Project',
    year: '2024',
    tags: 'AR, CV',
    thumb: 'img/projects/my-thumb.jpg',
    description: 'A test project.',
  };
  validateProjectFrontmatter(fm, 'test.md');
});

test('project: validateProjectFrontmatter throws on missing id', () => {
  const fm = { title: 'X', year: '2024', tags: 'A', thumb: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /id/);
});

test('project: validateProjectFrontmatter throws on missing thumb', () => {
  const fm = { id: 'x', title: 'X', year: '2024', tags: 'A', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /thumb/);
});

test('project: validateProjectFrontmatter throws on missing description', () => {
  const fm = { id: 'x', title: 'X', year: '2024', tags: 'A', thumb: 'x.jpg' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /description/);
});

// ─── slugify ──────────────────────────────────────────────────────────────────

test('project: slugify converts title to kebab-case', () => {
  assert.equal(slugify('My Cool Project'), 'my-cool-project');
});

test('project: slugify strips special characters', () => {
  assert.equal(slugify('CleAR: Multi-user AR!'), 'clear-multi-user-ar');
});

// ─── markdownToHtml ───────────────────────────────────────────────────────────

test('project: markdownToHtml converts paragraph text', () => {
  const html = markdownToHtml('Hello world.');
  assert.match(html, /<p>/);
  assert.match(html, /Hello world\./);
});

test('project: markdownToHtml converts headings', () => {
  const html = markdownToHtml('## Section Title');
  assert.match(html, /<h2>Section Title<\/h2>/);
});

test('project: markdownToHtml converts bold text', () => {
  const html = markdownToHtml('This is **bold** text.');
  assert.match(html, /<strong>bold<\/strong>/);
});

test('project: markdownToHtml converts links', () => {
  const html = markdownToHtml('[click](https://example.com)');
  assert.match(html, /href="https:\/\/example\.com"/);
});

test('project: markdownToHtml converts unordered lists', () => {
  const html = markdownToHtml('- item one\n- item two');
  assert.match(html, /<ul>/);
  assert.match(html, /<li>item one<\/li>/);
});

// ─── deriveOutputPath ─────────────────────────────────────────────────────────

test('project: deriveOutputPath defaults to projects/<id>.html', () => {
  assert.equal(deriveOutputPath('my-project'), path.join('projects', 'my-project.html'));
});

// ─── buildProjectPage ─────────────────────────────────────────────────────────
// Each project now gets its own standalone HTML page (similar to blog posts).

test('project: buildProjectPage produces a full HTML document', () => {
  const fm = {
    id: 'test-project',
    title: 'Test Project',
    year: '2024',
    tags: 'AI, CV',
    thumb: 'img/projects/test.jpg',
    description: 'A short description.',
  };
  const html = buildProjectPage(fm, '<p>Full body.</p>');
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /<\/html>/);
  assert.match(html, /<title>[^<]*Test Project[^<]*<\/title>/);
});

test('project: buildProjectPage uses relative asset paths (one level up)', () => {
  // Pages live at projects/<slug>.html so must reach css/js via ../
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'img/projects/x.jpg', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>body</p>');
  assert.match(html, /href="\.\.\/css\/styles\.css"/);
  assert.match(html, /href="\.\.\/css\/fonts\.css"/);
  assert.match(html, /src="\.\.\/js\/main\.min\.js"/);
});

test('project: buildProjectPage includes title, year, tags, and body', () => {
  const fm = {
    id: 'y', title: 'Cool Project', year: '2023', tags: 'AR, Unity',
    thumb: 'img/projects/y.jpg', description: 'Description.',
  };
  const html = buildProjectPage(fm, '<p>Inner body.</p>');
  assert.match(html, /Cool Project/);
  assert.match(html, /2023/);
  assert.match(html, /AR/);
  assert.match(html, /Unity/);
  assert.match(html, /Inner body/);
});

test('project: buildProjectPage renders bg as hero banner when provided', () => {
  const fm = {
    id: 'z', title: 'Z', year: '2024', tags: 'A',
    thumb: 'img/projects/z.jpg',
    bg: 'img/projects/z-bg.jpg',
    description: 'D',
  };
  const html = buildProjectPage(fm, '<p>b</p>');
  // Hero banner should reference the bg image
  assert.match(html, /img\/projects\/z-bg\.jpg/);
  assert.match(html, /project-hero/);
});

test('project: buildProjectPage falls back to thumb when bg is not set', () => {
  const fm = {
    id: 'w', title: 'W', year: '2024', tags: 'A',
    thumb: 'img/projects/w.jpg',
    description: 'D',
  };
  const html = buildProjectPage(fm, '<p>b</p>');
  // No bg → hero uses the thumb
  assert.match(html, /img\/projects\/w\.jpg/);
});

test('project: buildProjectPage includes optional link_paper', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'x.jpg', description: 'D',
    link_paper: 'https://example.com/paper',
  };
  const html = buildProjectPage(fm, '<p>Body</p>');
  assert.match(html, /https:\/\/example\.com\/paper/);
  assert.match(html, /Paper/);
});

test('project: buildProjectPage includes optional link_github', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'x.jpg', description: 'D',
    link_github: 'https://github.com/user/repo',
  };
  const html = buildProjectPage(fm, '<p>Body</p>');
  assert.match(html, /https:\/\/github\.com\/user\/repo/);
  assert.match(html, /GitHub/);
});

test('project: buildProjectPage includes a back-to-projects link', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'x.jpg', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>Body</p>');
  // Relative link back to projects listing
  assert.match(html, /href="\.\.\/projects\.html"/);
});

test('project: buildProjectPage escapes HTML in tags/title', () => {
  const fm = {
    id: 'x', title: 'A & B <script>', year: '2024', tags: 'Tag<x>',
    thumb: 'x.jpg', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>body</p>');
  assert.ok(!html.includes('<script>A'), 'Title should be escaped');
  assert.match(html, /A &amp; B/);
});

// ─── updateProjectsJs ────────────────────────────────────────────────────────

test('project: updateProjectsJs prepends entry to empty PROJECTS array', () => {
  const src = `const PROJECTS = [];\n`;
  const entry = {
    id: 'new-proj',
    title: 'New Project',
    year: '2024',
    tags: ['AI', 'CV'],
    thumb: 'img/projects/new.jpg',
    bg: 'img/projects/new-bg.jpg',
    description: 'A new project.',
    url: 'projects/new-proj.html',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  assert.match(result, /new-proj/);
  assert.match(result, /New Project/);
  assert.match(result, /const PROJECTS = \[/);
  // The bg field should be serialised when present
  assert.match(result, /bg:/);
});

test('project: updateProjectsJs omits bg key when not provided', () => {
  const src = `const PROJECTS = [];\n`;
  const entry = {
    id: 'new-proj',
    title: 'New Project',
    year: '2024',
    tags: ['AI'],
    thumb: 'img/projects/new.jpg',
    description: 'A new project.',
    url: 'projects/new-proj.html',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  assert.ok(!/bg:/.test(result), 'bg should not appear when undefined');
});

test('project: updateProjectsJs entry url points to projects/<slug>.html', () => {
  const src = `const PROJECTS = [];\n`;
  const entry = {
    id: 'slug-x',
    title: 'T',
    year: '2024',
    tags: ['AI'],
    thumb: 't.jpg',
    description: 'D',
    url: 'projects/slug-x.html',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  assert.match(result, /projects\/slug-x\.html/);
});

test('project: updateProjectsJs prepends entry before existing entries', () => {
  const src = `const PROJECTS = [
    {
        id: 'old-proj',
        title: 'Old Project',
    },
];\n`;
  const entry = {
    id: 'new-proj',
    title: 'New Project',
    year: '2024',
    tags: ['AI'],
    thumb: 'img/projects/new.jpg',
    description: 'A new project.',
    url: 'projects/new-proj.html',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  const newIdx = result.indexOf('new-proj');
  const oldIdx = result.indexOf('old-proj');
  assert.ok(newIdx < oldIdx, 'New entry should appear before old entry');
});

test('project: updateProjectsJs throws when PROJECTS array not found', () => {
  const src = 'const SOMETHING_ELSE = [];';
  const entry = { id: 'x', title: 'X', year: '2024', tags: [], thumb: '', description: '', url: '' };
  assert.throws(() => updateProjectsJs('data/projects.js', entry, src), /PROJECTS/);
});

// ─── end-to-end: parse markdown file and generate outputs ─────────────────────

test('project: end-to-end: parse markdown and generate a standalone HTML page', () => {
  const md = `---
id: e2e-test
title: "End-to-End Test Project"
year: "2024"
tags: "AI, Testing"
thumb: "img/projects/e2e.jpg"
bg:    "img/projects/e2e-bg.jpg"
description: "An end-to-end test project."
link_github: "https://github.com/test/repo"
---

This is the full project description.

It has **multiple** paragraphs and a [link](https://example.com).
`;
  const { frontmatter, body } = splitFrontmatter(md);
  const fm = parseFrontmatter(frontmatter);
  validateProjectFrontmatter(fm, 'test.md');
  const bodyHtml = markdownToHtml(body);
  const pageHtml = buildProjectPage(fm, bodyHtml);

  assert.match(pageHtml, /<!DOCTYPE html>/i);
  assert.match(pageHtml, /End-to-End Test Project/);
  assert.match(pageHtml, /AI/);
  assert.match(pageHtml, /Testing/);
  assert.match(pageHtml, /full project description/);
  assert.match(pageHtml, /<strong>multiple<\/strong>/);
  assert.match(pageHtml, /href="https:\/\/example\.com"/);
  assert.match(pageHtml, /https:\/\/github\.com\/test\/repo/);
  assert.match(pageHtml, /img\/projects\/e2e-bg\.jpg/);
});
