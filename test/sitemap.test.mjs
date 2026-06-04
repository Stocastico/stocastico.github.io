import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const mod = await import(path.join(ROOT, 'data/projects.js'));
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

test('sitemap: every <url> entry has a <lastmod> in YYYY-MM-DD form', () => {
  const xml = readSitemap();
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
  assert.ok(blocks.length >= 11, `expected >=11 <url> blocks, got ${blocks.length}`);
  for (const b of blocks) {
    const m = b.match(/<lastmod>([^<]+)<\/lastmod>/);
    assert.ok(m, `missing <lastmod> in block: ${b}`);
    assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, `bad lastmod date: ${m[1]}`);
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
