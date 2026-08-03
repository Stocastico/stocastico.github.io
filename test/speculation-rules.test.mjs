import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { RULES, TARGETS, block } from '../scripts/generate-speculation-rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* The block lived on index.html alone, and only for /projects/*, which meant
   projects.html — the page that lists all fourteen of them — speculated
   nothing at all. These assertions are about coverage rather than syntax: a
   rules block that exists on one page out of twenty-one is the failure mode
   worth catching. */

test('speculation: every page is a target, including projects.html', () => {
  assert.ok(TARGETS.includes('projects.html'),
    'projects.html must carry rules — it is where project clicks originate');
  assert.ok(TARGETS.includes('index.html'));
  assert.ok(TARGETS.length >= 20, `only ${TARGETS.length} pages targeted`);
});

/* The pixel is a no-JS <img> (see generate-analytics.mjs). A prerender loads
   subresources, so it fires that pixel and records a visit for a page nobody
   opened; GoatCounter filters speculative loads in count.js, which this site
   does not use. A prefetch fetches the document only, so it cannot. Keeping
   the broad rule on `prefetch` is what makes site-wide speculation safe here,
   and flipping it to `prerender` would silently start inflating the stats. */
test('speculation: only /projects/* prerenders; everything else prefetches', () => {
  assert.equal(RULES.prerender.length, 1);
  assert.equal(RULES.prerender[0].where.href_matches, '/projects/*',
    'prerender must stay scoped to project detail pages');

  assert.equal(RULES.prefetch.length, 1);
  const clauses = RULES.prefetch[0].where.and;
  assert.ok(Array.isArray(clauses), 'the prefetch rule should be an `and` of clauses');
  assert.ok(clauses.some((c) => c.href_matches === '/*.html'),
    'prefetch should cover the site\'s pages');
  /* `*` crosses path segments in a URL pattern, so /*.html matches
     /projects/foo.html too — without this the same URL is both prefetched and
     prerendered, i.e. fetched twice. */
  assert.ok(clauses.some((c) => c.not && c.not.href_matches === '/projects/*'),
    'prefetch must exclude /projects/*, which the prerender rule already covers');
});

test('speculation: both rules wait for intent rather than firing on load', () => {
  for (const rule of [...RULES.prerender, ...RULES.prefetch]) {
    assert.equal(rule.eagerness, 'moderate',
      'eagerness must stay `moderate` (hover/pointerdown), never `eager` or `immediate`');
  }
});

for (const rel of TARGETS) {
  test(`speculation: ${rel} ships the rules block, in sync`, () => {
    const html = read(rel);

    const m = html.match(
      /<!-- generated:speculation-rules -->([\s\S]*?)<!-- \/generated:speculation-rules -->/);
    assert.ok(m, `${rel} missing or malformed speculation-rules markers — ` +
      'run `npm run generate-speculation-rules`');

    const parsed = JSON.parse(
      m[1].match(/<script type="speculationrules">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(parsed, RULES, `${rel} rules differ from the generator`);

    /* Exactly one block: the hand-written one on index.html was removed when
       the generator took over, and two would mean it came back. */
    const count = (html.match(/type="speculationrules"/g) || []).length;
    assert.equal(count, 1, `${rel} has ${count} speculationrules blocks, expected 1`);

    assert.ok(html.includes(block()),
      `${rel} block is out of sync — run \`npm run generate-speculation-rules\``);
  });

  /* script-src uses per-page sha256 hashes instead of 'unsafe-inline', so a
     regenerated rules block whose CSP was not refreshed is a script the
     browser refuses to parse — the rules silently stop applying. */
  test(`speculation: ${rel} CSP hash covers the inline rules block`, () => {
    const html = read(rel);
    const script = html.match(
      /<!-- generated:speculation-rules -->\s*<script type="speculationrules">([\s\S]*?)<\/script>/)[1];
    const hash = crypto.createHash('sha256').update(script, 'utf8').digest('base64');

    const csp = html.match(/Content-Security-Policy["']\s+content="([^"]+)"/i)?.[1];
    assert.ok(csp, `${rel} missing a CSP meta tag`);
    assert.ok(csp.includes(`'sha256-${hash}'`),
      `${rel} CSP is missing the hash for its speculation-rules script — ` +
      'run `npm run generate-csp-meta`');
  });
}
