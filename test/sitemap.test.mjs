import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
/* Single source of truth for the site origin — see scripts/lib/site.json. */
const SITE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'site.json'), 'utf8'),
).url;

function readSitemap() {
  return fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
}

async function loadProjects() {
  const mod = await import(pathToFileURL(path.join(ROOT, 'data/projects.js')).href);
  return mod.PROJECTS;
}

test('sitemap: includes the top-level pages', () => {
  const xml = readSitemap();
  for (const loc of [
    `${SITE}/`,
    `${SITE}/projects.html`,
    `${SITE}/publications.html`,
    `${SITE}/travel.html`,
    `${SITE}/links.html`,
    `${SITE}/cv.html`,
  ]) {
    assert.ok(xml.includes(`<loc>${loc}</loc>`), `missing <loc>${loc}</loc>`);
  }
});

test('sitemap: includes every project detail page from data/projects.js', async () => {
  const projects = await loadProjects();
  const xml = readSitemap();
  /* projects with url like "projects/foo.html" map to /projects/foo.html;
     the legacy "projects.html#anchor" form should not appear in the loop. */
  const projectPages = projects
    .filter(p => p.url && p.url.startsWith('projects/'))
    .map(p => `${SITE}/${p.url}`);
  assert.ok(projectPages.length >= 8, `expected >=8 project pages, got ${projectPages.length}`);
  for (const loc of projectPages) {
    assert.ok(xml.includes(`<loc>${loc}</loc>`), `missing <loc>${loc}</loc>`);
  }
});

/* Some projects are pages this domain serves, but from another repo: GitHub
   Pages puts a project page at /<repo>/ under the same custom domain, so
   data/projects.js points at it with a root-relative url ("/donostia-dataviz/").
   They are real, indexable pages of this site and belong in the sitemap — the
   old `startsWith('projects/')` filter dropped the one page that is the whole
   portfolio piece. */
async function externalPageLocs() {
  const projects = await loadProjects();
  return projects.filter(p => p.url && p.url.startsWith('/')).map(p => `${SITE}${p.url}`);
}

test('sitemap: includes project pages served from another repo', async () => {
  const locs = await externalPageLocs();
  assert.ok(locs.length >= 1, 'expected at least one root-relative project url');
  const xml = readSitemap();
  for (const loc of locs) {
    assert.ok(xml.includes(`<loc>${loc}</loc>`), `missing <loc>${loc}</loc>`);
  }
});

test('sitemap: every <url> entry has a <lastmod> in YYYY-MM-DD form', () => {
  const xml = readSitemap();
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  assert.ok(blocks.length >= 12, `expected >=12 <url> blocks, got ${blocks.length}`);
  for (const b of blocks) {
    const m = b.match(/<lastmod>([^<]+)<\/lastmod>/);
    if (!m) continue; // cross-repo pages carry no date — see the test below
    assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, `bad lastmod date: ${m[1]}`);
  }
});

test('sitemap: local pages all carry a <lastmod>, cross-repo pages carry none', async () => {
  /* <lastmod> comes from this repo's git history, so it can only be told the
     truth about files this repo owns. Guessing a date for a page built and
     deployed elsewhere would be worse than omitting it: Google discards
     lastmod site-wide once it catches inaccurate ones, and the tag is
     optional precisely for this case. */
  const xml = readSitemap();
  const external = new Set(await externalPageLocs());
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  for (const b of blocks) {
    const loc = b.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const hasLastmod = /<lastmod>/.test(b);
    if (external.has(loc)) {
      assert.ok(!hasLastmod, `${loc} is built in another repo — it must not claim a <lastmod>`);
    } else {
      assert.ok(hasLastmod, `missing <lastmod> for ${loc}`);
    }
  }
});

test('sitemap: 404.html is NOT listed', () => {
  const xml = readSitemap();
  assert.ok(!xml.includes('404.html'), '404.html must not appear in sitemap.xml');
});

test('projects.html ItemList JSON-LD lists every entry from data/projects.js', async () => {
  const projects = await loadProjects();
  const html = fs.readFileSync(path.join(ROOT, 'projects.html'), 'utf8');
  const expected = projects
    .filter(p => p.url && p.url.startsWith('projects/'))
    .map(p => `${SITE}/${p.url}`);
  for (const url of expected) {
    assert.ok(html.includes(`"url": "${url}"`),
      `projects.html ItemList missing "${url}" — regenerate JSON-LD or update data/projects.js`);
  }
});
