/* CSP regression tests.

   The script-src directive uses per-page 'sha256-…' hashes instead of
   'unsafe-inline', so every inline <script> (JSON-LD, speculationrules) must be
   covered by a hash and the committed policy must match what generate-csp-meta
   would emit. These tests fail on drift — a stale hash would silently block a
   page's structured data in the browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGETS, cspFor, inlineScriptHashes } from '../scripts/generate-csp-meta.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function cspMeta(html) {
  const m = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content="([^"]+)"/i);
  return m ? m[1] : null;
}

for (const rel of TARGETS) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const csp = cspMeta(html);

  test(`csp: ${rel} policy is in sync with generate-csp-meta`, () => {
    assert.ok(csp, `${rel} has no CSP meta`);
    assert.equal(csp, cspFor(html),
      `${rel} CSP is stale — run \`npm run generate-csp-meta\` and commit`);
  });

  test(`csp: ${rel} script-src drops 'unsafe-inline' and covers every inline script`, () => {
    const m = csp.match(/script-src ([^;]*)/);
    assert.ok(m, `${rel} CSP missing script-src`);
    const tokens = m[1].trim().split(/\s+/);
    assert.ok(tokens.includes("'self'"), `${rel} script-src missing 'self'`);
    assert.ok(!tokens.includes("'unsafe-inline'"),
      `${rel} script-src still allows 'unsafe-inline'`);
    const hashes = inlineScriptHashes(html);
    for (const h of hashes) {
      assert.ok(tokens.includes(h), `${rel} script-src missing hash for an inline script: ${h}`);
    }
    /* No stale hashes either: every sha256 token must correspond to a script. */
    const declared = tokens.filter((t) => t.startsWith("'sha256-"));
    assert.deepEqual(declared.sort(), hashes.slice().sort(),
      `${rel} script-src has stale/extra hashes`);
  });
}
