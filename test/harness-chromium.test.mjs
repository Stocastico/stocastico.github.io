/* The harness falls back to whatever Chromium is on disk. Playwright has
   shipped two layouts for it (chrome-linux/, chrome-linux64/); knowing only
   one kills the whole browser suite at launch on a machine with the other. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChromium } from '../scripts/lib/chromium.mjs';

test('findChromium: prefers the newest build, then chrome-linux64 within it', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pw-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [build, layout] of [['1200', 'chrome-linux64'], ['1243', 'chrome-linux'], ['1243', 'chrome-linux64']]) {
    mkdirSync(join(dir, `chromium-${build}`, layout), { recursive: true });
    writeFileSync(join(dir, `chromium-${build}`, layout, 'chrome'), '');
  }
  delete process.env.CHROMIUM_EXECUTABLE;
  assert.equal(findChromium(dir), join(dir, 'chromium-1243', 'chrome-linux64', 'chrome'));
});

for (const layout of ['chrome-linux', 'chrome-linux64']) {
  test(`findChromium: finds the binary under ${layout}/`, (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'pw-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const exe = join(dir, 'chromium-1243', layout, 'chrome');
    mkdirSync(join(dir, 'chromium-1243', layout), { recursive: true });
    writeFileSync(exe, '');
    delete process.env.CHROMIUM_EXECUTABLE;
    assert.equal(findChromium(dir), exe);
  });
}
