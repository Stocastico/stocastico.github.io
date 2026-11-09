/* The e2e harness falls back to whatever Chromium is on disk when the pinned
   one is missing. Playwright has shipped two layouts for that binary
   (chrome-linux/ and chrome-linux64/); a lookup that knows only one finds
   nothing on a machine with the other, and the whole browser suite dies at
   launch with "Executable doesn't exist". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChromium } from './e2e/harness.mjs';

function fakeBrowsers(layout, build) {
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  mkdirSync(join(dir, `chromium-${build}`, layout), { recursive: true });
  writeFileSync(join(dir, `chromium-${build}`, layout, 'chrome'), '');
  return dir;
}

for (const layout of ['chrome-linux', 'chrome-linux64']) {
  test(`findChromium: finds the binary under ${layout}/`, () => {
    const dir = fakeBrowsers(layout, '1243');
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.CHROMIUM_EXECUTABLE;
    process.env.PLAYWRIGHT_BROWSERS_PATH = dir;
    try {
      assert.equal(findChromium(), join(dir, 'chromium-1243', layout, 'chrome'));
    } finally {
      if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
      else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
    }
  });
}
