/* ─────────────────────────────────────────────────────────────────────────────
   budget.e2e.mjs — a byte ceiling on what every page is made to download.

   The build already gates on E2E behaviour, CSP hashes, card drift and the
   analytics pixel. Nothing gated on size, and the cost of that was concrete:
   all six data modules were static imports in js/main.js, so 21.3 KB gzip of
   UNESCO sites, blogroll entries, travel pins, CV history, publications and
   projects sat in the one chunk that all 21 pages fetch — 68% of the shared
   JavaScript, on a page that is three paragraphs about a baby and Dostoevsky.
   Nothing failed. Nothing could have.

   The budgets below are gzip, because that is what the wire carries and what
   GitHub Pages serves. They are set roughly 25% above the current figures:
   loose enough that ordinary work does not trip them, tight enough that
   another data module or another copy of a library cannot arrive unnoticed.
   A deliberate increase means editing the number here, which is the point —
   it makes the trade explicit instead of invisible.

   This lives in the browser suite only because it needs dist/ to exist; it is
   a file-size check, not a browser test, and it runs in milliseconds.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { DIST } from './harness.mjs';

const gzipKB = (file) => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length / 1024;

/* Matched by prefix, so the content hash in the filename does not matter. */
const BUDGETS = [
  /* The shared entry chunk — every page pays for this one, so it is the
     number that actually matters. 15.8 KB at the time of writing, down from
     32.5 KB before the data modules moved behind their DOM gates. */
  { prefix: 'main-', ext: '.js', maxKB: 20, what: 'shared entry chunk (every page)' },
  /* One stylesheet for the whole site. 13.0 KB. */
  { prefix: 'main-', ext: '.css', maxKB: 17, what: 'stylesheet (every page)' },
];

/* Chunks that are legitimately large but lazily loaded. Listed so that a
   regression which drags one onto the critical path shows up as the entry
   chunk blowing its budget above, rather than being hidden here. */
const LAZY_ALLOWED = ['globe-', 'lenet-weights-', 'cnn-hero-', 'cnn-samples-', 'mnist-lab-'];

function assetsMatching({ prefix, ext }) {
  const dir = path.join(DIST, 'assets');
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .map((f) => path.join(dir, f));
}

describe('budget: the shared bundle stays small', () => {
  for (const budget of BUDGETS) {
    test(`${budget.prefix}*${budget.ext} — ${budget.what} — is under ${budget.maxKB} KB gzip`, () => {
      const files = assetsMatching(budget);
      assert.equal(files.length, 1,
        `expected exactly one ${budget.prefix}*${budget.ext}, found ${files.length}`);
      const kb = gzipKB(files[0]);
      assert.ok(kb <= budget.maxKB,
        `${path.basename(files[0])} is ${kb.toFixed(1)} KB gzip, over the ${budget.maxKB} KB budget.\n`
        + '      If the growth is deliberate, raise the number in test/e2e/budget.e2e.mjs and say why in the commit.\n'
        + '      If it is not, check for a static import of something only one page needs — that is how the last 21 KB got in.');
    });
  }

  test('no data module rides along in the shared chunk', () => {
    /* The byte budget is the safety net; this is the specific trap. A string
       probe is cruder than reading the import graph and far harder to fool:
       whatever the bundler does with the module, the content ends up in the
       chunk or it does not. */
    const [entry] = assetsMatching({ prefix: 'main-', ext: '.js' });
    const src = fs.readFileSync(entry, 'utf8');
    const probes = {
      'data/unesco.js': 'Gjirokastra',
      'data/links.js': 'Andrej Karpathy',
      'data/cv.js': 'Vicomtech',
      'data/publications.js': 'Mediapro',
      'data/projects.js': 'gaussian-nerf',
      'data/locations.js': 'Brescia',
    };
    const leaked = Object.entries(probes)
      .filter(([, needle]) => src.includes(needle))
      .map(([mod]) => mod);
    assert.deepEqual(leaked, [],
      `these data modules are in the shared chunk every page downloads: ${leaked.join(', ')}.\n`
      + '      Import them with a dynamic import() inside the DOM gate that needs them.');
  });

  test('the heavy lazy chunks are still separate files', () => {
    const dir = path.join(DIST, 'assets');
    const names = fs.readdirSync(dir);
    for (const prefix of LAZY_ALLOWED) {
      assert.ok(names.some((f) => f.startsWith(prefix)),
        `${prefix}* is missing from dist/assets — if it was merged into another chunk, `
        + 'something that should be lazy is now eager');
    }
  });
});
