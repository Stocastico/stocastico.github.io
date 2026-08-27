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
  imageSize,
  PROJECT_TAG_LABELS,
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
    kind: 'work',
    title: 'My Project',
    year: '2024',
    tags: 'AR & 3D, Computer Vision',
    bg: 'img/projects/my-bg.jpg',
    description: 'A test project.',
  };
  validateProjectFrontmatter(fm, 'test.md');
});

test('project: validateProjectFrontmatter throws on missing id', () => {
  const fm = { kind: 'work', title: 'X', year: '2024', tags: 'A', bg: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /id/);
});

test('project: validateProjectFrontmatter throws on missing bg', () => {
  const fm = { id: 'x', kind: 'work', title: 'X', year: '2024', tags: 'A', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /bg/);
});

test('project: validateProjectFrontmatter throws on missing description', () => {
  const fm = { id: 'x', kind: 'work', title: 'X', year: '2024', tags: 'A', bg: 'x.jpg' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /description/);
});

/* `kind` decides whether a project can reach the homepage, so a drafter who
   forgets it must be stopped rather than defaulted. These two pin that: a
   missing field and a plausible-but-wrong value both throw. */
test('project: validateProjectFrontmatter throws on missing kind', () => {
  const fm = { id: 'x', title: 'X', year: '2024', tags: 'A', bg: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /kind/);
});

test('project: validateProjectFrontmatter throws on an unknown kind', () => {
  const fm = { id: 'x', kind: 'side', title: 'X', year: '2024', tags: 'A', bg: 'x.jpg', description: 'D' };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /kind/);
});

test('project: updateProjectsJs writes the kind into the new entry', () => {
  const src = 'const PROJECTS = [];\n';
  const entry = {
    id: 'weekend-thing', kind: 'personal', title: 'Weekend Thing', year: '2026',
    tags: ['JS'], bg: 'img/projects/w.jpg', description: 'D', url: 'projects/weekend-thing.html',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  assert.match(result, /kind: "personal"/);
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
  assert.match(html, /rel="noopener noreferrer"/);
});

test('project: markdownToHtml refuses javascript: links', () => {
  const html = markdownToHtml('[click](javascript:alert(1))');
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /<a /);
});

test('project: markdownToHtml converts unordered lists', () => {
  const html = markdownToHtml('- item one\n- item two');
  assert.match(html, /<ul>/);
  assert.match(html, /<li>item one<\/li>/);
});

test('project: markdownToHtml keeps a loose ordered list as one <ol>', () => {
  /* Blank lines between numbered items must not restart the list at 1. */
  const html = markdownToHtml('1. first\n\n2. second\n\n3. third');
  assert.equal((html.match(/<ol>/g) || []).length, 1);
  assert.equal((html.match(/<li>/g) || []).length, 3);
});

test('project: markdownToHtml renders a Markdown table as an HTML table', () => {
  const md = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
  const html = markdownToHtml(md);
  assert.match(html, /<table>/);
  assert.match(html, /<thead>[\s\S]*<th>A<\/th><th>B<\/th>[\s\S]*<\/thead>/);
  assert.match(html, /<td>1<\/td><td>2<\/td>/);
  assert.match(html, /<td>3<\/td><td>4<\/td>/);
  assert.doesNotMatch(html, /\|/); // no raw pipes leak through
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
    bg: 'img/projects/test.jpg',
    description: 'A short description.',
  };
  const html = buildProjectPage(fm, '<p>Full body.</p>');
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /<\/html>/);
  assert.match(html, /<title>[^<]*Test Project[^<]*<\/title>/);
});

test('project: buildProjectPage includes social-card meta (twitter:image, og:site_name)', () => {
  const fm = {
    id: 'social', title: 'Social', year: '2024', tags: 'A',
    bg: 'img/projects/social.webp', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>body</p>');
  assert.match(html, /<meta property="og:site_name"\s+content="Stefano Masneri"/);
  assert.match(html, /<meta property="og:locale"\s+content="en_GB"/);
  assert.match(html, /<meta property="og:image:alt"\s+content="Social"/);
  assert.match(html, /<meta name="twitter:image"\s+content="[^"]+img\/projects\/social\.webp"/);
  assert.match(html, /<meta name="twitter:image:alt"\s+content="Social"/);
});

test('project: buildProjectPage emits og:image:width/height when dimensions are provided', () => {
  const fm = {
    id: 'dims', title: 'Dims', year: '2024', tags: 'A',
    bg: 'img/projects/dims.webp', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>body</p>', { width: 1600, height: 840 });
  assert.match(html, /<meta property="og:image:width"\s+content="1600"/);
  assert.match(html, /<meta property="og:image:height"\s+content="840"/);
  /* width/height must sit between og:image and og:image:alt */
  assert.match(html, /og:image"[^]*og:image:width[^]*og:image:height[^]*og:image:alt/);
});

test('project: buildProjectPage omits og:image:width/height when dimensions are absent', () => {
  const fm = {
    id: 'nodims', title: 'NoDims', year: '2024', tags: 'A',
    bg: 'img/projects/nodims.webp', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>body</p>');
  assert.doesNotMatch(html, /og:image:width/);
  assert.doesNotMatch(html, /og:image:height/);
});

test('project: imageSize reads PNG and WebP dimensions, returns null when missing', () => {
  /* Real repo assets with known dimensions cover the PNG + WebP code paths. */
  assert.deepEqual(imageSize('img/projects/rag-document-qa-og.png'), { width: 1200, height: 630 });
  assert.deepEqual(imageSize('img/projects/mlops-bg.webp'), { width: 1600, height: 840 });
  assert.deepEqual(imageSize('img/projects/avatech-bg.webp'), { width: 270, height: 187 });
  assert.equal(imageSize('img/projects/__does_not_exist__.webp'), null);
});

test('project: buildProjectPage uses correct asset paths for project subdir', () => {
  // CSS lives at the repo root, so pages under projects/<slug>.html reach it
  // via ../.  The JS entry is loaded as a Vite ES module from the absolute
  // path /js/main.js (Vite resolves the same path on every page).
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    bg: 'img/projects/x.jpg', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>body</p>');
  assert.match(html, /href="\.\.\/css\/styles\.css"/);
  assert.match(html, /href="\.\.\/css\/fonts\.css"/);
  assert.match(html, /<script\s+type="module"\s+src="\/js\/main\.js"/);
});

test('project: buildProjectPage includes title, year, tags, and body', () => {
  const fm = {
    id: 'y', title: 'Cool Project', year: '2023', tags: 'AR, Unity',
    bg: 'img/projects/y.jpg', description: 'Description.',
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
    bg: 'img/projects/z-bg.jpg',
    description: 'D',
  };
  const html = buildProjectPage(fm, '<p>b</p>');
  // Hero banner should reference the bg image
  assert.match(html, /img\/projects\/z-bg\.jpg/);
  assert.match(html, /project-hero/);
});

test('project: buildProjectPage includes optional link_paper', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    bg: 'x.jpg', description: 'D',
    link_paper: 'https://example.com/paper',
  };
  const html = buildProjectPage(fm, '<p>Body</p>');
  assert.match(html, /https:\/\/example\.com\/paper/);
  assert.match(html, /Paper/);
});

test('project: buildProjectPage includes optional link_github', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    bg: 'x.jpg', description: 'D',
    link_github: 'https://github.com/user/repo',
  };
  const html = buildProjectPage(fm, '<p>Body</p>');
  assert.match(html, /https:\/\/github\.com\/user\/repo/);
  assert.match(html, /GitHub/);
});

test('project: buildProjectPage includes a back-to-projects link', () => {
  const fm = {
    id: 'x', title: 'X', year: '2024', tags: 'A',
    bg: 'x.jpg', description: 'D',
  };
  const html = buildProjectPage(fm, '<p>Body</p>');
  // Relative link back to projects listing
  assert.match(html, /href="\.\.\/projects\.html"/);
});

test('project: buildProjectPage escapes HTML in tags/title', () => {
  const fm = {
    id: 'x', title: 'A & B <script>', year: '2024', tags: 'Tag<x>',
    bg: 'x.jpg', description: 'D',
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

test('project: updateProjectsJs entry url points to projects/<slug>.html', () => {
  const src = `const PROJECTS = [];\n`;
  const entry = {
    id: 'slug-x',
    title: 'T',
    year: '2024',
    tags: ['AI'],
    bg: 't.jpg',
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
    bg: 'img/projects/new.jpg',
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
  const entry = { id: 'x', title: 'X', year: '2024', tags: [], bg: '', description: '', url: '' };
  assert.throws(() => updateProjectsJs('data/projects.js', entry, src), /PROJECTS/);
});

test('project: updateProjectsJs accepts ES module export form', () => {
  const src = `export const PROJECTS = [];\n`;
  const entry = {
    id: 'esm-proj',
    title: 'ESM Project',
    year: '2024',
    tags: ['ESM'],
    bg: 'img/projects/esm.jpg',
    description: 'ES module form.',
    url: 'projects/esm-proj.html',
  };
  const result = updateProjectsJs('data/projects.js', entry, src);
  assert.match(result, /export const PROJECTS = \[/);
  assert.match(result, /esm-proj/);
});

// ─── end-to-end: parse markdown file and generate outputs ─────────────────────

test('project: end-to-end: parse markdown and generate a standalone HTML page', () => {
  const md = `---
id: e2e-test
kind: work
title: "End-to-End Test Project"
year: "2024"
tags: "Computer Vision, Education & Research"
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
  assert.match(pageHtml, /Computer Vision/);
  assert.match(pageHtml, /Education &amp; Research/);
  assert.match(pageHtml, /full project description/);
  assert.match(pageHtml, /<strong>multiple<\/strong>/);
  assert.match(pageHtml, /href="https:\/\/example\.com"/);
  assert.match(pageHtml, /https:\/\/github\.com\/test\/repo/);
  assert.match(pageHtml, /img\/projects\/e2e-bg\.jpg/);
});

// ─── the closed tag vocabulary is enforced by the generator ───────────────────

/* Rejecting a stray tag downstream, in test/project-tags.test.mjs, is not the
   same as rejecting it here. That test can only speak after the tag has been
   written into data/projects.js and baked into a page, and it reports the
   damage as three unrelated assertions rather than as "that is not a facet".
   `kind` has been validated at this point since issue #136; `tags` was not,
   and this script's own --help was recommending values the vocabulary had
   never contained. */

test('project: PROJECT_TAG_LABELS mirrors the vocabulary in js/project-tags.js', async () => {
  const { PROJECT_TAGS } = await import('../js/project-tags.js');
  assert.deepEqual(
    PROJECT_TAG_LABELS,
    PROJECT_TAGS.map((t) => t.label),
    'the CJS copy of the facet vocabulary has drifted from js/project-tags.js — '
    + 'update PROJECT_TAG_LABELS in scripts/new-project.js',
  );
});

test('project: validateProjectFrontmatter rejects a tag outside the vocabulary', () => {
  const fm = {
    id: 'x', kind: 'work', title: 'X', year: '2024',
    tags: 'AI, CV, Unity', bg: 'x.webp', description: 'D',
  };
  assert.throws(
    () => validateProjectFrontmatter(fm, 'test.md'),
    /not facets in the project vocabulary/,
  );
});

test('project: validateProjectFrontmatter rejects more than two tags', () => {
  const fm = {
    id: 'x', kind: 'work', title: 'X', year: '2024',
    tags: 'Computer Vision, AR & 3D, LLMs & MLOps', bg: 'x.webp', description: 'D',
  };
  assert.throws(() => validateProjectFrontmatter(fm, 'test.md'), /at most 2 allowed/);
});

test('project: validateProjectFrontmatter accepts the real vocabulary labels', () => {
  for (const label of PROJECT_TAG_LABELS) {
    validateProjectFrontmatter({
      id: 'x', kind: 'work', title: 'X', year: '2024',
      tags: label, bg: 'x.webp', description: 'D',
    }, 'test.md');
  }
});

// ─── body images ──────────────────────────────────────────────────────────────

test('project: markdownToHtml wraps an image in a figure with lazy loading', () => {
  const html = markdownToHtml('![A diagram](img/projects/mlops-bg.webp)');
  assert.match(html, /<figure>/);
  assert.match(html, /src="\.\.\/img\/projects\/mlops-bg\.webp"/);
  assert.match(html, /alt="A diagram"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
});

/* Every figure in the committed pages carries width/height; this converter did
   not, so regenerating a page from its draft silently dropped the intrinsic
   size and the layout shifted as each image arrived. The dimensions are read
   off the file rather than declared in the Markdown, because a number a human
   retypes is a number that goes stale when the image is re-exported. */
test('project: markdownToHtml reads intrinsic width/height off the image file', () => {
  const html = markdownToHtml('![MLOps](img/projects/mlops-bg.webp)');
  assert.match(html, /width="1600" height="840"/,
    'expected the real dimensions of img/projects/mlops-bg.webp');
});

test('project: markdownToHtml omits dimensions it cannot read', () => {
  const missing = markdownToHtml('![X](img/projects/does-not-exist.webp)');
  assert.doesNotMatch(missing, /width=/, 'a guessed size is worse than none');
  const remote = markdownToHtml('![X](https://example.com/x.png)');
  assert.match(remote, /src="https:\/\/example\.com\/x\.png"/);
  assert.doesNotMatch(remote, /width=/);
});

/* `.post figure figcaption` has been styled in css/styles.css the whole time
   with no consumer on any project page, because there was no Markdown syntax
   that could produce one. */
test('project: markdownToHtml turns a quoted title into a figcaption', () => {
  const html = markdownToHtml('![Alt text](img/projects/mlops-bg.webp "The **pipeline** as deployed")');
  assert.match(html, /<figcaption>The <strong>pipeline<\/strong> as deployed<\/figcaption>/);
  assert.match(html, /alt="Alt text"/, 'the caption must not displace the alt text');
});

test('project: markdownToHtml emits no figcaption when none is given', () => {
  assert.doesNotMatch(markdownToHtml('![A](img/projects/mlops-bg.webp)'), /figcaption/);
});

// ─── the scaffold cannot silently lose site-wide chrome ───────────────────────

/* test/nav-parity.test.mjs already checks this template's nav <ul>, and that
   turned out to be a trap: it made the scaffold look guarded while everything
   around the nav rotted. The ⌘K palette, the theme controls and the feed link
   all arrived after this template was written and none of them reached it, so
   `npm run new-project` produced a page with a dead ⌘K chip and no feed
   autodiscovery.
   
   Only some of that self-heals. generate-theme-toggle injects the theme
   controls and the FOUC bootstrap, and generate-analytics / -speculation-rules
   / -csp-meta add their own blocks (Workflow Rule 11), so those are deliberately
   NOT asserted here — they are not the scaffold's job. The overlay and the feed
   link have no generator at all: if the template does not carry them, nothing
   will ever put them back. */

const SCAFFOLD = buildProjectPage({
  id: 'scaffold-probe', kind: 'work', title: 'Scaffold Probe', year: '2026',
  tags: 'Computer Vision', bg: 'img/projects/probe.webp',
  description: 'A probe page, never written to disk.',
}, '<p>Body.</p>');

test('project: the scaffold carries the ⌘K command palette', () => {
  assert.match(SCAFFOLD, /id="cmd-trigger"/,
    'the navbar ⌘K chip is missing from the scaffold');
  assert.match(SCAFFOLD, /<dialog class="cmd-overlay" id="cmd-overlay"/,
    'initCommandPalette() returns early without #cmd-overlay — a new page would '
    + 'advertise ⌘K in the navbar and do nothing when it is pressed');
  assert.match(SCAFFOLD, /id="cmd-input"/);
  assert.match(SCAFFOLD, /id="cmd-list"/);
});

test('project: the scaffold advertises the Atom feed', () => {
  assert.match(
    SCAFFOLD,
    /<link rel="alternate" type="application\/atom\+xml"[^>]*href="\/feed\.xml"/,
    'a feed reader pointed at any URL on the site should find the feed',
  );
});

test('project: the scaffold marks its social profiles with rel="me"', () => {
  const me = SCAFFOLD.match(/rel="me noopener"/g) || [];
  assert.equal(me.length, 3, 'expected LinkedIn, Google Scholar and GitHub to carry rel="me"');
});

/* generate-theme-toggle strips this attribute and injects the bootstrap that
   replaces it. The scaffold keeps it so a page is dark before that runs rather
   than un-themed, but it must not survive into a committed page — hence the
   assertion in test/theme-sync.test.js on the real files. */
test('project: the scaffold leaves data-theme for generate-theme-toggle to strip', () => {
  assert.match(SCAFFOLD, /<html lang="en" data-theme="dark">/);
});

// ─── every draft still builds ─────────────────────────────────────────────────

/* drafts/ is documented as the source for projects/*.html, and it silently
   stopped being one: `kind` became required for issue #136 and not a single
   draft was updated, so `npm run new-project` threw for all thirteen. Nothing
   noticed, because nothing ever ran them. The frontmatter had rotted in other
   ways too — a duplicate `bg:` key naming files that no longer exist, and a
   `link_code:` that this script has never understood, which is why the
   AudienceEngagement repo link lived only in hand-edited HTML.
   
   This does NOT assert a byte-for-byte round trip. The committed pages carry
   JSON-LD, a CSP hash, an analytics pixel and (on one page) an interactive
   widget, all added after generation by other tools. What it asserts is that
   the documented command still runs, which is the part that was untrue. */
test('project: every draft in drafts/ parses, validates and builds', () => {
  const draftsDir = path.join(__dirname, '..', 'drafts');
  const files = fs.readdirSync(draftsDir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 13, `only ${files.length} drafts found — the directory read is wrong`);

  for (const file of files) {
    const raw = fs.readFileSync(path.join(draftsDir, file), 'utf8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const fm = parseFrontmatter(frontmatter);
    assert.doesNotThrow(
      () => validateProjectFrontmatter(fm, `drafts/${file}`),
      `drafts/${file} no longer satisfies new-project.js — run it and fix the frontmatter`,
    );
    const html = buildProjectPage(fm, markdownToHtml(body));
    assert.match(html, /<!DOCTYPE html>/i, `drafts/${file} produced no page`);
    assert.equal(path.basename(file, '.md'), String(fm.id),
      `drafts/${file} is named for a different id than its frontmatter declares`);
  }
});

/* The drafts are the source, so their frontmatter has to agree with the data
   the site actually renders. It did not: the tags in every draft predated the
   closed vocabulary. */
test('project: each draft agrees with its data/projects.js entry', async () => {
  const { PROJECTS } = await import('../data/projects.js');
  const byId = new Map(PROJECTS.map((p) => [p.id, p]));
  const draftsDir = path.join(__dirname, '..', 'drafts');

  for (const file of fs.readdirSync(draftsDir).filter((f) => f.endsWith('.md'))) {
    const { frontmatter } = splitFrontmatter(fs.readFileSync(path.join(draftsDir, file), 'utf8'));
    const fm = parseFrontmatter(frontmatter);
    const entry = byId.get(String(fm.id));
    assert.ok(entry, `drafts/${file} declares id "${fm.id}", which data/projects.js does not have`);
    assert.equal(String(fm.kind), entry.kind, `drafts/${file}: kind disagrees with data/projects.js`);
    assert.equal(String(fm.title), entry.title, `drafts/${file}: title disagrees`);
    assert.equal(String(fm.year), entry.year, `drafts/${file}: year disagrees`);
    assert.equal(String(fm.bg), entry.bg, `drafts/${file}: bg disagrees`);
    assert.deepEqual(parseTags(fm.tags), entry.tags, `drafts/${file}: tags disagree`);
  }
});

/* The frontmatter must not name an image that is not there. The duplicate
   `bg:` lines that this cleaned up pointed at four *-thumb.* files which have
   not existed since project cards stopped carrying thumbnails; the parser took
   the last key and nobody saw the first one rot. */
test('project: every image a draft names exists on disk', () => {
  const ROOT = path.join(__dirname, '..');
  const draftsDir = path.join(ROOT, 'drafts');

  for (const file of fs.readdirSync(draftsDir).filter((f) => f.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(draftsDir, file), 'utf8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const fm = parseFrontmatter(frontmatter);

    for (const key of ['bg', 'og']) {
      if (!fm[key]) continue;
      assert.ok(fs.existsSync(path.join(ROOT, String(fm[key]))),
        `drafts/${file}: ${key} names ${fm[key]}, which does not exist`);
    }
    for (const [, src] of body.matchAll(/^!\[[^\]]*\]\(([^)\s]+)/gm)) {
      if (/^https?:\/\//.test(src)) continue;
      assert.ok(fs.existsSync(path.join(ROOT, src)),
        `drafts/${file}: body image ${src} does not exist`);
    }
  }
});

// ─── inline diagrams round-trip ───────────────────────────────────────────────

/* The two diagram pages could not be regenerated at all: their SVGs were
   inlined into the HTML (so they could read the page's custom properties) and
   the source files were deleted in the same move, leaving the drafts pointing
   at paths that no longer resolved. The sources are back under
   drafts/diagrams/, and this asserts that inlining them reproduces the
   committed markup byte for byte — the only reason to believe the drafts are
   a real source rather than a plausible-looking one. */

const DIAGRAM_FIGURE = /^([ \t]*)<figure>\n[ \t]*<svg class="diagram"[\s\S]*?<\/svg>\n[ \t]*<\/figure>/gm;

/* Pages disagree about body indentation — clear-architecture.html has been
   through a formatter and sits at four spaces, mlops-vertex-media.html at
   zero — and that is not what this test is about. Strip the block's own
   leading indent before comparing so it asks about the diagram, not about
   whitespace the generator never controlled. */
function dedentFigures(html) {
  return (html.match(DIAGRAM_FIGURE) || []).map((block) => {
    const lines = block.split('\n');
    const pad = (lines[0].match(/^[ \t]*/) || [''])[0].length;
    return lines.map((l) => (l.startsWith(' '.repeat(pad)) ? l.slice(pad) : l)).join('\n');
  });
}

test('project: !svg() inlines a diagram exactly as the committed pages carry it', () => {
  const ROOT = path.join(__dirname, '..');
  const cases = [
    ['drafts/brand-stadium.md', 'projects/brand-stadium.html'],
    ['drafts/rag-document-qa.md', 'projects/rag-document-qa.html'],
    ['drafts/mlops-vertex-media.md', 'projects/mlops-vertex-media.html'],
    ['drafts/clear-architecture.md', 'projects/clear-architecture.html'],
  ];
  for (const [draft, page] of cases) {
    const { body } = splitFrontmatter(fs.readFileSync(path.join(ROOT, draft), 'utf8'));
    const generated = dedentFigures(markdownToHtml(body));
    const committed = dedentFigures(fs.readFileSync(path.join(ROOT, page), 'utf8'));
    assert.ok(committed.length > 0, `${page} has no inline diagram to compare against`);
    assert.deepEqual(generated, committed,
      `regenerating ${page} from ${draft} would not reproduce its diagram(s)`);
  }
});

test('project: !svg() emits inline SVG, never an <img>', () => {
  const html = markdownToHtml('!svg(drafts/diagrams/rag-query.svg)');
  assert.match(html, /<figure>\n {2}<svg class="diagram"/);
  assert.doesNotMatch(html, /<img/,
    'test/css-assets.test.mjs fails on a diagram that reverts to <img> — and it '
    + 'would be right to: an external SVG cannot read the page\'s palette');
});

test('project: !svg() fails loudly on a missing or non-SVG file', () => {
  assert.throws(() => markdownToHtml('!svg(drafts/diagrams/nope.svg)'), /file not found/i);
  assert.throws(() => markdownToHtml('!svg(package.json)'), /does not start with an <svg>/);
});

/* Every diagram source must still be palette-driven. A hex literal creeping
   back in here would survive into the page and reintroduce exactly the bug
   inlining was meant to fix — a diagram frozen in a superseded palette that
   ignores the light/dark toggle. css-assets.test.mjs guards the pages; this
   guards the files they are generated from. */
test('project: diagram sources carry no baked-in colours', () => {
  const dir = path.join(__dirname, '..', 'drafts', 'diagrams');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));
  assert.ok(files.length >= 3, `only ${files.length} diagram sources found`);
  for (const file of files) {
    const svg = fs.readFileSync(path.join(dir, file), 'utf8');
    const hex = svg.match(/[:="']\s*#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(hex, [],
      `drafts/diagrams/${file} has hard-coded colours — use var(--accent) etc.`);
    assert.match(svg, /var\(--/, `drafts/diagrams/${file} reads no palette variable`);
  }
});
