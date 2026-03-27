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
  buildProjectHtml,
  updateProjectsJs,
  slugify,
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

test('project: parseFrontmatter parses unquoted year as number', () => {
  const fm = parseFrontmatter(`year: 2024`);
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
  // Should not throw
  validateProjectFrontmatter(fm, 'test.md');
});

test('project: validateProjectFrontmatter throws on missing id', () => {
  const fm = { title: 'X', year: '2024', tags: 'A', thumb: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /id/);
});

test('project: validateProjectFrontmatter throws on missing title', () => {
  const fm = { id: 'x', year: '2024', tags: 'A', thumb: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /title/);
});

test('project: validateProjectFrontmatter throws on missing year', () => {
  const fm = { id: 'x', title: 'X', tags: 'A', thumb: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /year/);
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

// ─── buildProjectHtml ─────────────────────────────────────────────────────────

test('project: buildProjectHtml produces a valid section with id', () => {
  const fm = {
    id: 'test-project',
    title: 'Test Project',
    year: '2024',
    tags: 'AI, CV',
    thumb: 'img/projects/test.jpg',
    description: 'A test.',
  };
  const html = buildProjectHtml(fm, '<p>Full description.</p>');
  assert.match(html, /id="test-project"/);
  assert.match(html, /class="project-detail"/);
  assert.match(html, /Test Project/);
  assert.match(html, /2024/);
  assert.match(html, /AI/);
  assert.match(html, /CV/);
  assert.match(html, /Full description\./);
});

test('project: buildProjectHtml includes optional link_paper', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'x.jpg', description: 'D',
    link_paper: 'https://example.com/paper',
  };
  const html = buildProjectHtml(fm, '<p>Body</p>');
  assert.match(html, /https:\/\/example\.com\/paper/);
  assert.match(html, /Paper/);
});

test('project: buildProjectHtml includes optional link_github', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'x.jpg', description: 'D',
    link_github: 'https://github.com/user/repo',
  };
  const html = buildProjectHtml(fm, '<p>Body</p>');
  assert.match(html, /https:\/\/github\.com\/user\/repo/);
  assert.match(html, /GitHub/);
});

test('project: buildProjectHtml omits link row when no links provided', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'x.jpg', description: 'D',
  };
  const html = buildProjectHtml(fm, '<p>Body</p>');
  assert.ok(!html.includes('project-links'));
});

test('project: buildProjectHtml includes media image from thumb', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    thumb: 'img/projects/test.jpg', description: 'D',
  };
  const html = buildProjectHtml(fm, '<p>Body</p>');
  assert.match(html, /project-detail__media/);
  assert.match(html, /img\/projects\/test\.jpg/);
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
    description: 'A new project.',
    url: 'projects.html#new-proj',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  assert.match(result, /new-proj/);
  assert.match(result, /New Project/);
  assert.match(result, /const PROJECTS = \[/);
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
    url: 'projects.html#new-proj',
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

test('project: end-to-end: parse markdown and generate section HTML', () => {
  const md = `---
id: e2e-test
title: "End-to-End Test Project"
year: "2024"
tags: "AI, Testing"
thumb: "img/projects/e2e.jpg"
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
  const sectionHtml = buildProjectHtml(fm, bodyHtml);

  assert.match(sectionHtml, /id="e2e-test"/);
  assert.match(sectionHtml, /End-to-End Test Project/);
  assert.match(sectionHtml, /AI/);
  assert.match(sectionHtml, /Testing/);
  assert.match(sectionHtml, /full project description/);
  assert.match(sectionHtml, /<strong>multiple<\/strong>/);
  assert.match(sectionHtml, /href="https:\/\/example\.com"/);
  assert.match(sectionHtml, /https:\/\/github\.com\/test\/repo/);
});
