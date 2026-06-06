/* ───────────────────────────────────────────────────────────
   Theme-switch rebuild — fresh-canvas regression tests.

   When the user toggles light/dark, js/main.js destroys the
   colour-baked WebGL surfaces (noise-gradient hero, Three.js globe)
   and rebuilds them with the now-active palette. destroy() force-loses
   the WebGL context (renderer.forceContextLoss() / WEBGL_lose_context),
   which permanently kills that <canvas>'s context: reusing the same
   node means getContext() returns the already-lost context and the
   surface renders blank.

   freshCanvasForRebuild() swaps the node for a pristine clone so the
   rebuilt instance can acquire a live context. These tests pin that
   behaviour and that the rebuild handlers actually use it.
   ─────────────────────────────────────────────────────────── */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { freshCanvasForRebuild } from '../js/main.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fakeCanvas(id) {
  const node = { id, parentNode: null };
  node.cloneNode = () => fakeCanvas(node.id);
  return node;
}

test('freshCanvasForRebuild swaps the canvas for a pristine clone', () => {
  const original = fakeCanvas('globe-canvas');
  let replaced = null;
  const parent = {
    replaceChild(newNode, oldNode) {
      assert.equal(oldNode, original, 'must replace the original node');
      replaced = newNode;
      newNode.parentNode = parent;
    },
  };
  original.parentNode = parent;

  const fresh = freshCanvasForRebuild(original);

  assert.notEqual(fresh, original,
    'must return a brand-new canvas node — reusing the force-lost one renders blank');
  assert.equal(fresh, replaced, 'returned node must be the one inserted into the DOM');
  assert.equal(fresh.id, 'globe-canvas', 'clone must keep the id so CSS/styling still applies');
});

test('freshCanvasForRebuild is a safe no-op when the canvas is null or detached', () => {
  assert.equal(freshCanvasForRebuild(null), null, 'null in → null out');
  assert.equal(freshCanvasForRebuild(undefined), undefined, 'undefined in → undefined out');

  const orphan = { id: 'x', parentNode: null, cloneNode() { return {}; } };
  assert.equal(freshCanvasForRebuild(orphan), orphan,
    'no parent node → return the original unchanged');
});

test('theme-change rebuilds obtain a fresh canvas before rebuilding the WebGL surfaces', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  /* The noise-gradient hero (home) and the Three.js globe (travel) are both
     WebGL and both force-lose their context on destroy — each rebuild path
     must swap in a fresh canvas first or it repaints onto a dead context. */
  assert.ok(/freshCanvasForRebuild\(\s*noiseCanvas\s*\)/.test(src),
    'noise-gradient rebuild must call freshCanvasForRebuild(noiseCanvas)');
  assert.ok(/freshCanvasForRebuild\(\s*globeCanvas\s*\)/.test(src),
    'globe rebuild must call freshCanvasForRebuild(globeCanvas)');
});
