/* The published contact address.
 
   It used to be base64 in attributes literally named data-email-user /
   data-email-domain, revealed by JS on click. That bought nothing — one regex
   and one atob harvests it, and a headless scraper just runs the handler —
   while costing a click, an aria-describedby hint and a chunk of JS. Worse,
   what it was failing to protect was a personal address.

   The defence now is that the published address is DISPOSABLE: a forwarding
   alias that can be deleted at the registrar and replaced here in one line.
   That only holds if there is exactly one line to replace, which is what these
   tests are for. CONTACT_EMAIL (js/contact.js) is the single source; the
   markup on index.html is generated from it; the ⌘K palette imports it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTACT_EMAIL } from '../js/contact.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort(),
  ...fs.readdirSync(path.join(ROOT, 'projects')).filter((f) => f.endsWith('.html')).sort()
      .map((f) => `projects/${f}`),
];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const indexHtml = read('index.html');

test('contact: CONTACT_EMAIL is a single well-formed address', () => {
  assert.match(CONTACT_EMAIL, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/,
    `CONTACT_EMAIL is not an address: ${CONTACT_EMAIL}`);
  assert.ok(CONTACT_EMAIL.endsWith('@stefanomasneri.com'),
    'the published address must be an alias on the domain, so it stays disposable');
});

test('contact: the address is in the static HTML, readable without JS', () => {
  /* The whole point. A crawler, a no-JS visitor and `curl` all see the same
     address the browser does — there is no reveal step left to run. */
  assert.ok(indexHtml.includes(CONTACT_EMAIL),
    'index.html does not contain the address in plain text');
  const value = indexHtml.match(/<span class="contact-email-text">([^<]*)<\/span>/);
  assert.ok(value, 'no .contact-email-text element on index.html');
  assert.equal(value[1].trim(), CONTACT_EMAIL,
    'the visible address has drifted from CONTACT_EMAIL — run `npm run generate-cards`');
});

test('contact: the copy control is a real button with a descriptive name', () => {
  const btn = indexHtml.match(/<button[^>]*class="[^"]*contact-copy[^"]*"[^>]*>/);
  assert.ok(btn, 'the copy control must be a real <button>, not an <a href="#">');
  assert.match(btn[0], /type="button"/, 'a button inside no form still needs type="button"');
  assert.match(btn[0], new RegExp(`aria-label="[^"]*${CONTACT_EMAIL.replace('.', '\\.')}[^"]*"`),
    'the accessible name must say what it does and name the address');
  assert.match(btn[0], /aria-label="Copy email address/,
    'the accessible name must lead with the action');
  assert.ok(btn[0].includes(`data-email="${CONTACT_EMAIL}"`),
    'the button must carry the address it copies');
});

test('contact: a secondary mailto affordance sits beside the address', () => {
  /* Secondary on purpose: mailto: is unreliable on mobile, so copy is the
     primary action and the mail client is the fallback, not the reverse. */
  const link = indexHtml.match(/<a[^>]*class="[^"]*contact-mailto[^"]*"[^>]*>/);
  assert.ok(link, 'no .contact-mailto link on index.html');
  assert.ok(link[0].includes(`href="mailto:${CONTACT_EMAIL}"`),
    'the mailto link points somewhere other than CONTACT_EMAIL');
  assert.match(link[0], /aria-label="[^"]+"/,
    'an icon-only link needs an accessible name');
});

test('contact: the obfuscation machinery is gone from every file', () => {
  /* Matched as syntax rather than as words, so a comment explaining why the
     scheme was abandoned does not read as the scheme still being here. The
     history is worth keeping written down; the attributes are not. */
  const banned = [
    /data-email-(user|domain|revealed)\s*=/,   /* the attributes themselves   */
    /dataset\.email(User|Domain|Revealed)/,    /* ...and reads of them        */
    /\.contact-email-obfuscated/,              /* the selector, CSS or JS     */
    /class="[^"]*contact-email-obfuscated/,    /* ...and the class in markup  */
    /contact-email-hint/,                      /* the id and its aria-describedby */
  ];
  const offenders = [];
  const scan = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist', '.cache', 'screenshots'].includes(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(abs); continue; }
      if (!/\.(html|js|mjs|css|md|json|yaml)$/.test(entry.name)) continue;
      const rel = path.relative(ROOT, abs);
      /* This file necessarily spells out every pattern it bans. Excluded by
         exact path — not by a "skip the test directory" rule, which would let
         a real reference hide in any other test. */
      if (rel === path.join('test', 'contact-email.test.mjs')) continue;
      const text = fs.readFileSync(abs, 'utf8');
      for (const re of banned) {
        if (re.test(text)) offenders.push(`${rel}: ${re.source}`);
      }
    }
  };
  scan(ROOT);
  assert.deepEqual(offenders, [],
    'the obfuscation was deleted, not neutered — these still reference it:\n'
    + offenders.join('\n'));
});

test('contact: no page re-encodes an address into base64', () => {
  /* The specific regression: someone reintroduces "protection" by base64-ing
     the address back into an attribute. Checked by encoding the parts and
     looking for them, which is exactly what a scraper would undo. */
  const [user, domain] = CONTACT_EMAIL.split('@');
  const encoded = [user, domain, CONTACT_EMAIL].map((s) => Buffer.from(s).toString('base64'));
  for (const page of PAGES) {
    const html = read(page);
    for (const b64 of encoded) {
      assert.ok(!html.includes(b64), `${page} carries a base64-encoded address (${b64})`);
    }
  }
});

test('contact: CONTACT_EMAIL is the only address in any page', () => {
  /* Stated as "only this one" rather than "not that old one" on purpose. A
     test that names the address it is guarding against has to carry that
     address forever, which is the thing being removed. This form is also
     strictly stronger: it catches any second address, not one particular
     historical one. */
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  for (const page of PAGES) {
    for (const found of read(page).match(EMAIL) || []) {
      assert.equal(found, CONTACT_EMAIL,
        `${page} carries an address other than CONTACT_EMAIL: ${found}`);
    }
  }
});

test('contact: no attribute hides an address or a mail domain in base64', () => {
  /* The obfuscation split the address across two attributes, so neither half
     contained an "@" and a literal scan saw nothing — a grep for the old
     provider came back clean the entire time all 21 pages carried it. The only
     audit that would have caught it decodes first, so this one does. */
  const CANDIDATE = /="([A-Za-z0-9+/]{8,}={0,2})"/g;
  const DOMAINISH = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
  for (const page of PAGES) {
    for (const m of read(page).matchAll(CANDIDATE)) {
      let decoded = '';
      try { decoded = Buffer.from(m[1], 'base64').toString('utf8'); } catch (_) { continue; }
      if (!/^[\x20-\x7e]+$/.test(decoded)) continue;   /* binary — a hash, not text */
      assert.ok(!decoded.includes('@'),
        `${page}: attribute value "${m[1]}" decodes to an address (${decoded})`);
      assert.ok(!DOMAINISH.test(decoded),
        `${page}: attribute value "${m[1]}" decodes to a mail domain (${decoded})`);
    }
  }
});

test('contact: every page was scanned', () => {
  assert.ok(PAGES.length >= 20, `only ${PAGES.length} pages globbed`);
});
