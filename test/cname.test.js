'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   CNAME tests — GitHub Pages custom domain.

   public/CNAME is the source of truth: GitHub Pages reads dist/CNAME to bind the
   custom domain. Vite copies everything under public/ to dist/ verbatim, so the
   built dist/CNAME must match. The file must contain exactly the bare apex domain
   with no scheme, no "www", and no trailing newline.

   - The source-file test always runs (part of `npm test`).
   - The dist test verifies the build output and only runs once dist/ exists
     (i.e. after `npm run build`); it stays skipped — not failed — beforehand so
     the suite is green without a build.

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

const distDir = path.join(ROOT, 'dist');
const distCname = path.join(distDir, 'CNAME');

test('CNAME: build output dist/CNAME is present and points to the custom domain', {
  skip: fs.existsSync(distDir) ? false : 'dist/ not built yet — run `npm run build` first',
}, () => {
  assert.ok(fs.existsSync(distCname), 'dist/CNAME missing — Vite did not copy public/CNAME into the build');
  const raw = fs.readFileSync(distCname, 'utf8').trim();
  assert.equal(raw, EXPECTED, `dist/CNAME must be "${EXPECTED}" (got ${JSON.stringify(raw)})`);
});
