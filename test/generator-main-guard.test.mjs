/* ─────────────────────────────────────────────────────────────────────────────
   Every generator must be inert when imported.

   Two of them were not, and the damage had two layers.

   `scripts/generate-analytics.mjs` and `scripts/generate-speculation-rules.mjs`
   ran their inject loops at the top level of the module, so `import` did
   exactly what `node scripts/generate-analytics.mjs` does — and both of their
   test files import them on the first line to get at `block()` and `TARGETS`.
   Every assertion those suites made was therefore about files the import had
   just rewritten, including the drift guards, whose whole job is to notice a
   file that has stopped matching a fresh generation. Measured: deleting the
   GoatCounter <img> from now.html outright left all 45 assertions green, and
   flipping both `eagerness` values in the same page to "eager" did too.

   The second layer is worse than a blind test. `npm test` was writing to the
   working tree. A suite that silently repairs the drift it exists to report
   will repair it in CI as well, so a page that had lost its pixel would have
   deployed with the pixel restored and nothing anywhere saying so.

   This test is the standing guard, because the fix is one line and the bug is
   invisible: a generator written without it works perfectly from the command
   line, and only misbehaves once something imports it — which may be months
   later, in a test that then passes for the wrong reason.

   Two forms are accepted, matching the two module systems in scripts/:
     ESM  ·  if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
     CJS  ·  if (require.main === module)

   Run:  node --test test/generator-main-guard.test.mjs
──────────────────────────────────────────────────────────────────────────────*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

/* Everything that writes into the repo as its job, plus check-links — which
   writes nothing, but would fire ~85 HTTP requests at third-party hosts if an
   import ran it, and "side effect" means more than "touched a file".

   The dev-only analysis and training scripts (train-cnn, the eval-* and
   diagnose-* pair, screenshots, ingest-digit-capture) are deliberately out of
   scope: nothing imports them, they write to .cache/ or to gitignored output,
   and train-cnn downloads MNIST on import — which is precisely why no test
   should ever import it either. */
const GENERATORS = fs.readdirSync(SCRIPTS)
  .filter((f) => /^(generate-.*|set-domain|new-project|check-links)\.(mjs|js)$/.test(f))
  .sort();

/* `path.resolve` or a destructured `resolve` — generate-lenet-weights.mjs
   imports the latter. What the pattern will NOT accept is the form two
   generators used to have, `import.meta.url === \`file://${process.argv[1]}\``:
   that concatenation skips URL encoding, so in a checkout under "/tmp/guard
   test/" it compares file:///tmp/guard%20test/... against
   file:///tmp/guard test/... and is always false. The generator then silently
   does nothing when run — exit 0, no output — and the first sign of it is a
   drift test failing in CI about an artefact nobody could regenerate. Spaces
   in a checkout path are ordinary. */
const ESM_GUARD = /fileURLToPath\(import\.meta\.url\)\s*===\s*(path\.)?resolve\(process\.argv\[1\]\)/;
const CJS_GUARD = /require\.main\s*===\s*module/;
const BAD_GUARD = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/;

test('the generator list is not empty', () => {
  assert.ok(GENERATORS.length >= 15,
    `found only ${GENERATORS.length} generators — this file is checking nothing`);
});

for (const file of GENERATORS) {
  test(`${file} only runs when it is the entry point`, () => {
    const src = fs.readFileSync(path.join(SCRIPTS, file), 'utf8');
    assert.ok(!BAD_GUARD.test(src),
      `scripts/${file} guards on \`import.meta.url === \\\`file://\${process.argv[1]}\\\`\`, `
      + 'which is false for any checkout path needing URL encoding (a space is enough) — '
      + 'the generator would silently do nothing. Use fileURLToPath() + resolve().');
    assert.ok(ESM_GUARD.test(src) || CJS_GUARD.test(src),
      `scripts/${file} has no main guard, so importing it runs it. Wrap the work in `
      + 'main() and call it behind `if (process.argv[1] && '
      + 'fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))` '
      + '(or `if (require.main === module)` in CJS).');
  });
}

/* The pattern check above can be satisfied by a guard that is present but
   bypassed — a stray top-level call above it, say. This runs the real thing:
   import each generator in a child process and require the repository to be
   byte-identical afterwards. It is the assertion the two broken generators
   would have failed, stated without reference to how the fix is spelled. */
test('importing every generator leaves the repository untouched', () => {
  const snapshot = () => execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  const before = snapshot();

  for (const file of GENERATORS) {
    const rel = `./scripts/${file}`;
    try {
      execFileSync(process.execPath, ['-e', `import(${JSON.stringify(rel)}).catch(() => {})`],
        { cwd: ROOT, stdio: 'ignore', timeout: 30_000 });
    } catch {
      /* A generator that throws on import is fine here — it just must not
         have written anything on the way. The `after` comparison covers it. */
    }
  }

  assert.equal(snapshot(), before,
    'importing a generator modified the working tree. A generator must not run at '
    + 'import time: tests import these modules for their pure helpers, and a suite '
    + 'that rewrites the files it is about to assert on cannot fail.');
});
