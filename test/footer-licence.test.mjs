/* The content licence by notice. CC BY 4.0 works by telling the reader, and
   LICENSE-CONTENT.md only tells someone who clones the repo, so every page's
   footer carries it — on all of them or it says nothing (the footer wording is
   identical everywhere by convention). new-project.js writes the footer of
   every future project page, so its template is held to the same line. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CC_BY = /<a href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/" target="_blank" rel="license noopener">CC BY 4\.0<\/a>/;

const pages = execFileSync('git', ['ls-files', '*.html'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)
  .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('class="site-footer"'));

test('there are footers to check', () => {
  assert.ok(pages.length >= 20, `only ${pages.length} pages with a footer`);
});

for (const f of pages) {
  test(`${f}: the footer states the content licence`, () => {
    const footer = fs.readFileSync(path.join(ROOT, f), 'utf8').split('class="site-footer"')[1].split('</footer>')[0];
    assert.match(footer.replace(/\s+/g, ' '), CC_BY);
  });
}

test('new-project.js writes the licence into new pages', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/new-project.js'), 'utf8'), CC_BY);
});
