'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   CNAME tests — GitHub Pages custom domain.

   public/CNAME is the source of truth: GitHub Pages reads dist/CNAME to bind the
   custom domain. Vite copies everything under public/ to dist/ verbatim, so the
   built dist/CNAME must match. The file must contain exactly the bare apex domain
   with no scheme, no "www", and no trailing newline.

   This file asserts the SOURCE file only, and does so unconditionally.

   It used to carry a second test for dist/CNAME, guarded by
   `skip: fs.existsSync(distDir) ? false : '...'`. That guard made it a test
   that never ran: every workflow executes `npm test` before `npm run build`
   (on purpose — a 2-second static failure should land before a 5-minute
   browser run), so dist/ was absent every time CI evaluated it. The build-side
   assertion now lives in test/e2e/build-output.e2e.mjs, which runs after the
   build in all four workflows and is therefore actually gated.

   The rule this file is now an example of: a test that skips itself based on
   whether an artefact happens to exist is indistinguishable from a deleted
   test, and reports success either way. Put it where the artefact is
   guaranteed instead.

   Run:  node --test test/cname.test.js
──────────────────────────────────────────────────────────────────────────────*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED = 'stefanomasneri.com';

test('CNAME: public/CNAME contains exactly the apex domain, no trailing newline', () => {
  const file = path.join(ROOT, 'public', 'CNAME');
  assert.ok(fs.existsSync(file), 'public/CNAME is missing');
  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw, EXPECTED, `public/CNAME must be exactly "${EXPECTED}" (got ${JSON.stringify(raw)})`);
});

/* public/CNAME has to be somewhere Vite copies verbatim, or the domain binding
   never reaches the build in the first place. Asserting the directory is the
   cheap half of the pair whose expensive half now lives in
   test/e2e/build-output.e2e.mjs. */
test('CNAME: lives in public/, the directory Vite copies verbatim into dist/', () => {
  assert.ok(
    fs.existsSync(path.join(ROOT, 'public', 'CNAME')),
    'public/CNAME must stay in public/ — Vite only copies that directory as-is, '
    + 'and dist/CNAME is what binds the custom domain',
  );
});
