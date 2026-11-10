/* Locate a Chromium on disk when Playwright's pinned revision is missing.
   Shared by the e2e harness and the social-card renderer so a change in
   Playwright's directory layout is fixed once. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function findChromium(dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers') {
  if (process.env.CHROMIUM_EXECUTABLE) return process.env.CHROMIUM_EXECUTABLE;
  if (!existsSync(dir)) return null;
  /* Newest build first; Playwright has shipped both chrome-linux64/ and
     chrome-linux/ inside it. */
  return readdirSync(dir)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse()
    .flatMap((d) => ['chrome-linux64', 'chrome-linux'].map((l) => join(dir, d, l, 'chrome')))
    .find(existsSync) ?? null;
}
