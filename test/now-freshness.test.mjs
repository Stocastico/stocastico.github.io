/* Is the /now page still true?

   A now-page's entire contract is currency — now-now-now.com exists to say
   "this is what I am doing at the moment". A stale one is worse than no page
   at all, because it makes a confident claim that has quietly stopped being
   true: this one spent two months counting down to summer holidays that had
   already happened.

   Staleness is invisible by construction. Nothing errors, nothing looks
   broken, the prose reads perfectly well; only a reader who checks the date
   notices, and they are the person you least want to disappoint. So the date
   is asserted rather than trusted, in the same spirit as every other drift
   check in this repo.

   The threshold is deliberately generous — a quarter. This is not a blog with
   a cadence, it is a snapshot that wants re-reading a few times a year, and a
   test that nags monthly is a test that gets switched off.

   What this cannot check is whether the *prose* is still true. The date can be
   fresh while the text talks about a trip that already happened; only a human
   re-reading it fixes that. The date is the part a machine can hold you to. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_AGE_DAYS = 90;

/* "Last updated 5 June 2026 · San Sebastián" — the string a reader sees, so
   the test cannot pass while the visible date says something else. */
const META = /Last updated\s+(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function parseNowDate(html) {
  const m = META.exec(html);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month === -1) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

test('now.html states when it was last updated', () => {
  const html = fs.readFileSync(path.join(ROOT, 'now.html'), 'utf8');
  const date = parseNowDate(html);
  assert.ok(date, 'now.html has no parseable "Last updated <d> <Month> <yyyy>" line');
  assert.ok(!Number.isNaN(date.getTime()), 'the "Last updated" date is not a real date');
});

test(`now.html was updated within the last ${MAX_AGE_DAYS} days`, () => {
  const html = fs.readFileSync(path.join(ROOT, 'now.html'), 'utf8');
  const date = parseNowDate(html);
  const ageDays = Math.floor((Date.now() - date.getTime()) / 86400000);

  assert.ok(ageDays >= 0,
    `now.html claims to have been updated in the future (${ageDays} days ahead)`);
  assert.ok(ageDays <= MAX_AGE_DAYS,
    `now.html is ${ageDays} days old (limit ${MAX_AGE_DAYS}). Rewrite it to say what is `
    + 'true now and bump the date — a stale now-page is worse than none.');
});
