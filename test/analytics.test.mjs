import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pathFor, titleOf, block, ENDPOINT, TARGETS } from '../scripts/generate-analytics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* The GoatCounter pixel is cookieless + scriptless: it must stay an <img>,
   never a <script>. Guard the origin too so a typo can't silently send
   traffic elsewhere. */
const GC_ORIGIN = 'https://stocastico.goatcounter.com';

test('analytics: GoatCounter endpoint is the cookieless count pixel', () => {
  assert.equal(ENDPOINT, `${GC_ORIGIN}/count`);
});

test('analytics: pathFor maps root, 404 and inner pages correctly', () => {
  assert.equal(pathFor('index.html'), '/');
  assert.equal(pathFor('404.html'), '/404');
  assert.equal(pathFor('cv.html'), '/cv.html');
  assert.equal(pathFor('projects/rag-document-qa.html'), '/projects/rag-document-qa.html');
});

test('analytics: titleOf extracts and entity-decodes the <title>', () => {
  assert.equal(titleOf('<title>A &amp; B</title>'), 'A & B');
  assert.equal(titleOf('<head><title>  Spaced  </title></head>'), 'Spaced');
});


for (const rel of TARGETS) {
  test(`analytics: ${rel} ships the cookieless GoatCounter pixel`, () => {
    const html = read(rel);

    assert.match(html, /<!-- generated:analytics -->/,
      `${rel} missing the analytics marker — run \`npm run generate-analytics\``);

    /* Pull the marker block and assert on its contents. */
    const m = html.match(/<!-- generated:analytics -->([\s\S]*?)<!-- \/generated:analytics -->/);
    assert.ok(m, `${rel} analytics markers are malformed`);
    const blk = m[1];

    /* It must be an <img> to the GoatCounter count endpoint — never a script. */
    assert.match(blk, /<img\b/i, `${rel} analytics block should be an <img> pixel`);
    assert.doesNotMatch(blk, /<script/i, `${rel} analytics must not inject a <script>`);
    assert.ok(blk.includes(`${GC_ORIGIN}/count?p=`),
      `${rel} pixel must point at ${GC_ORIGIN}/count`);
    assert.ok(blk.includes(`p=${pathFor(rel)}`),
      `${rel} pixel should record its own path (${pathFor(rel)})`);

    /* html-quality regressions: every <img> needs alt + width + height. */
    assert.match(blk, /\balt=("|')\1/, `${rel} pixel needs an empty alt=""`);
    assert.match(blk, /\bwidth=("?1"?)/, `${rel} pixel needs width="1"`);
    assert.match(blk, /\bheight=("?1"?)/, `${rel} pixel needs height="1"`);

    /* Drift guard: the committed block must equal a fresh generation, so a
       stale page (or a manual edit) fails here before deploy. */
    assert.ok(html.includes(block(rel, html)),
      `${rel} analytics block is out of sync — run \`npm run generate-analytics\``);
  });

  test(`analytics: ${rel} CSP allows the GoatCounter image origin`, () => {
    const html = read(rel);
    const csp = html.match(/Content-Security-Policy["']\s+content="([^"]+)"/i)?.[1]
      || html.match(/content="([^"]+)"[^>]*Content-Security-Policy/i)?.[1];
    assert.ok(csp, `${rel} missing a CSP meta tag`);
    assert.match(csp, /img-src[^;]*https:\/\/stocastico\.goatcounter\.com/,
      `${rel} CSP img-src must allow ${GC_ORIGIN} for the pixel`);
  });
}
