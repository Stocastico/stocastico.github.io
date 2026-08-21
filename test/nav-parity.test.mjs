/* Navbar parity — the navbar is hand-duplicated into every top-level page,
   every projects/*.html and the scaffold template inside scripts/new-project.js.
   There is no shared template, so nothing but this file stops a page from
   quietly losing a link: the markup is still valid, nothing throws, and the
   only symptom is a destination that has become unreachable from one page.
   That is the same silent-failure shape as the reveal invariant — the page
   looks finished, it is just missing something.

   Two per-page differences are legitimate and are normalised away rather than
   special-cased, because special-casing a page is how a page opts itself out:

     * `aria-current="page"` on the active item.
     * The href prefix. Top-level pages link `cv.html`, project pages link
       `../cv.html`, 404.html links `/cv.html` (it is served from any path, so
       it cannot use a relative one), and index.html links its own sections as
       bare `#about` / `#contact`. All four spellings mean the same page.

   The count guards at the bottom are the other half: a glob or a regex that
   silently matches nothing generates zero assertions, and zero assertions
   still reports success. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { buildProjectPage } = require('../scripts/new-project.js');

/* Derived from the directory, never listed — see the note in
   test/html-quality.test.mjs for why a typed list of pages goes stale. */
const PAGES = [
  ...fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort(),
  ...fs.readdirSync(path.join(ROOT, 'projects'))
       .filter(f => f.endsWith('.html')).sort()
       .map(f => `projects/${f}`),
];

/* Canonical form of a nav href: '../cv.html', '/cv.html' and 'cv.html' are the
   same destination, and index.html's own-section links drop the filename. */
function normaliseHref(href) {
  let h = href.replace(/^(\.\.\/)+/, '').replace(/^\//, '');
  if (h.startsWith('#')) h = `index.html${h}`;
  if (h === '') h = 'index.html';
  return h;
}

/* The ordered (href, label) sequence inside #navbar's .nav-links list. */
function navItems(html, source) {
  const nav = html.match(/<nav[^>]*id="navbar"[\s\S]*?<\/nav>/);
  assert.ok(nav, `${source}: no <nav id="navbar"> found`);
  const list = nav[0].match(/<ul[^>]*class="nav-links"[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(list, `${source}: no <ul class="nav-links"> inside #navbar`);

  const items = [];
  const anchor = /<a\s+([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = anchor.exec(list[1])) !== null) {
    const href = m[1].match(/href="([^"]*)"/);
    assert.ok(href, `${source}: nav anchor without an href`);
    items.push({
      href: normaliseHref(href[1]),
      label: m[2].replace(/\s+/g, ' ').trim(),
    });
  }
  return items;
}

const seq = items => items.map(i => `${i.label} -> ${i.href}`).join('\n');

/* index.html is the reference copy: it is the page the nav was written on and
   the one every other copy was pasted from. */
const REFERENCE = navItems(
  fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'index.html');

test('nav-parity: the reference nav is a non-trivial list', () => {
  assert.ok(REFERENCE.length >= 6,
    `index.html has only ${REFERENCE.length} nav links — the parser is probably broken`);
  for (const item of REFERENCE) {
    assert.ok(item.label.length > 0, 'nav item with an empty label');
    assert.ok(item.href.length > 0, 'nav item with an empty href');
  }
});

for (const page of PAGES) {
  test(`nav-parity: ${page} carries the identical nav sequence`, () => {
    const items = navItems(fs.readFileSync(path.join(ROOT, page), 'utf8'), page);
    assert.equal(seq(items), seq(REFERENCE),
      `${page}'s navbar has drifted from index.html's.\n` +
      `Fix the page — every copy of the nav must carry the same links in the same order.`);
  });
}

test('nav-parity: the new-project scaffold produces the same nav sequence', () => {
  const html = buildProjectPage({
    id: 'scaffold-probe',
    title: 'Scaffold Probe',
    year: '2026',
    description: 'A probe page, never written to disk.',
    bg: 'img/projects/probe.webp',
    tags: 'One, Two',
    kind: 'personal',
  }, '<p>Body.</p>');

  const items = navItems(html, 'scripts/new-project.js scaffold');
  assert.equal(seq(items), seq(REFERENCE),
    'The nav in the scaffold template inside scripts/new-project.js has drifted ' +
    'from index.html\'s — a new project page would be born with the wrong nav.');
});

test('nav-parity: every page in the repo was checked', () => {
  assert.ok(PAGES.length >= 20,
    `only ${PAGES.length} pages globbed — the directory read is probably wrong`);
  assert.ok(PAGES.includes('index.html') && PAGES.includes('404.html'));
  assert.ok(PAGES.some(p => p.startsWith('projects/')));
});
