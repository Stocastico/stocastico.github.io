/* ============================================================
   check-links — the skip list.

   The network half of the script is deliberately untested: it is a
   scheduled advisory job whose whole purpose is to make real requests.
   What is testable, and what needs to be, is SKIP_HOSTS — an entry there
   silences a link permanently, so nothing but a test stops one from
   outliving the link it was written for.
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SKIP_HOSTS, skipReason, fromLinksYaml, fromPublications,
} from '../scripts/check-links.mjs';

test('SKIP_HOSTS carries a bare hostname and a reason for each entry', () => {
  assert.ok(SKIP_HOSTS instanceof Map, 'SKIP_HOSTS should be a Map of host → reason');
  for (const [host, reason] of SKIP_HOSTS) {
    assert.match(host, /^[a-z0-9.-]+$/, `${host} should be a bare hostname, no scheme or path`);
    assert.ok(reason.length > 20, `${host} needs a reason saying why it cannot be checked`);
  }
});

test('skipReason() matches a host and its subdomains, nothing else', () => {
  const host = 'addi.ehu.eus';
  assert.ok(SKIP_HOSTS.has(host), `${host} should be skipped — it is behind a human check`);
  assert.ok(skipReason(`https://${host}/handle/10810/68721`), 'should skip the listed host');
  assert.ok(skipReason(`https://sub.${host}/x`), 'should skip a subdomain of it');
  assert.equal(skipReason(`https://not${host}/x`), null, 'should not skip a lookalike host');
  assert.equal(skipReason('https://example.com/'), null, 'should not skip an unrelated host');
  assert.equal(skipReason('not a url'), null, 'should not throw on a malformed url');
});

test('every skipped host is still pointed at by a curated link', async () => {
  /* A skip entry outlives the link it was written for: drop the publication
     and the entry silently goes on excusing nothing. */
  const urls = [...fromLinksYaml(), ...(await fromPublications())].map((e) => e.url);
  for (const host of SKIP_HOSTS.keys()) {
    const used = urls.some((u) => {
      try {
        const h = new URL(u).hostname;
        return h === host || h.endsWith(`.${host}`);
      } catch { return false; }
    });
    assert.ok(used, `${host} is in SKIP_HOSTS but no curated link points at it — drop the entry`);
  }
});
