/* llms.txt is generated; this fails when the committed file drifts from the
   data it is built out of.

   The file exists because robots.txt goes out of its way to welcome AI
   crawlers, and until now there was nothing telling them what is here. The
   risk with any such index is that it rots into a confident description of a
   site that has moved on — worse than having none, because a machine reader
   has no way to tell. Hence a generator plus this check rather than prose
   somebody remembers to update. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { build, OUT } from '../scripts/generate-llms.mjs';
import { PROJECTS } from '../data/projects.js';

test('llms.txt is in sync with the data (no drift)', () => {
  assert.ok(fs.existsSync(OUT), 'public/llms.txt is missing — run `npm run generate-llms`');
  assert.equal(fs.readFileSync(OUT, 'utf8'), build(),
    'public/llms.txt is stale — run `npm run generate-llms` and commit the result');
});

test('llms.txt lists every project', () => {
  const txt = fs.readFileSync(OUT, 'utf8');
  for (const p of PROJECTS) {
    assert.ok(txt.includes(p.title), `llms.txt is missing project: ${p.title}`);
  }
});

test('llms.txt carries no HTML entities or markup', () => {
  const txt = fs.readFileSync(OUT, 'utf8');
  /* The page descriptions are lifted out of HTML meta tags, so an un-decoded
     &amp; or a stray tag would land here as literal text. It is a plain-text
     format; an entity in it is an error, not an encoding. */
  const entities = txt.match(/&[a-z]+;|&#\d+;/gi) || [];
  assert.deepEqual(entities, [], `llms.txt contains HTML entities: ${entities.join(', ')}`);
  const tags = txt.match(/<\/?[a-z][^>]*>/gi) || [];
  assert.deepEqual(tags, [], `llms.txt contains HTML tags: ${tags.join(', ')}`);
});

test('every llms.txt link is absolute and https', () => {
  const txt = fs.readFileSync(OUT, 'utf8');
  const urls = [...txt.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 8, `expected a populated link list, found ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /^https:\/\//, `llms.txt link is not an absolute https URL: ${u}`);
  }
});
