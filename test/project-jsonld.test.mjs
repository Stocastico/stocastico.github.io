import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT, 'projects');
/* Single source of truth for the site origin — see scripts/lib/site.json. */
const SITE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'site.json'), 'utf8'),
).url;

function readJsonLd(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1]);
      if (Array.isArray(json)) out.push(...json);
      else out.push(json);
    } catch (err) {
      throw new Error(`Invalid JSON-LD in block: ${err.message}\nblock:\n${m[1]}`);
    }
  }
  return out;
}

const projectFiles = fs.readdirSync(PROJECTS_DIR)
  .filter(f => f.endsWith('.html'));

test('every projects/*.html has at least one project file', () => {
  assert.ok(projectFiles.length >= 8,
    `expected >=8 project pages, got ${projectFiles.length}`);
});

for (const file of projectFiles) {
  const fullPath = path.join(PROJECTS_DIR, file);
  const html = fs.readFileSync(fullPath, 'utf8');
  const items = readJsonLd(html);

  test(`SEO: ${file} has a BreadcrumbList JSON-LD`, () => {
    const bc = items.find(it => it && it['@type'] === 'BreadcrumbList');
    assert.ok(bc, `${file} missing BreadcrumbList JSON-LD`);
    assert.ok(Array.isArray(bc.itemListElement) && bc.itemListElement.length === 3,
      `${file} BreadcrumbList must have exactly 3 items (Home > Projects > <name>)`);
    assert.equal(bc.itemListElement[0].item, `${SITE}/`);
    assert.equal(bc.itemListElement[1].item, `${SITE}/projects.html`);
    assert.ok(bc.itemListElement[2].item.startsWith(`${SITE}/projects/`),
      `${file} third crumb must point to a project page`);
  });

  test(`SEO: ${file} has an Article JSON-LD with required fields`, () => {
    const article = items.find(it => it && it['@type'] === 'Article');
    assert.ok(article, `${file} missing Article JSON-LD`);
    assert.ok(typeof article.headline === 'string' && article.headline.length > 0,
      `${file} Article.headline missing`);
    assert.ok(typeof article.description === 'string' && article.description.length > 0,
      `${file} Article.description missing`);
    assert.ok(typeof article.image === 'string' && article.image.startsWith('http'),
      `${file} Article.image missing or relative`);
    assert.ok(article.author && article.author.name,
      `${file} Article.author missing`);
    assert.ok(typeof article.datePublished === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(article.datePublished),
      `${file} Article.datePublished must be a full ISO-8601 date (YYYY-MM-DD)`);
    assert.ok(typeof article.url === 'string' && article.url.startsWith(`${SITE}/projects/`),
      `${file} Article.url missing or off-site`);
  });
}
