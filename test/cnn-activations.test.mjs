/* Regression tests for the CNN hero pipeline.

   Three things matter here and none of them are visual:
     1. data/cnn-activations.js must not drift from the committed weights +
        showcase digits (the generator is deterministic, so this is exact);
     2. the baked blobs must actually describe the layers that js/cnn-hero.js
        indexes into — a wrong offset silently paints garbage;
     3. the CNN hero must stay off the critical path and off small screens,
        which means main.js may only reach it through a dynamic import. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, build, LAYERS, OUT_FILE } from '../scripts/generate-cnn-activations.mjs';
import { CNN } from '../data/cnn-activations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('cnn: committed activations are in sync with the model (no drift)', () => {
  assert.equal(render(), read(OUT_FILE),
    `${OUT_FILE} is stale — run \`npm run generate-cnn-activations\` and commit it`);
});

test('cnn: the generator is deterministic', () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});

test('cnn: layer slices tile the sample blob exactly', () => {
  let expected = 0;
  assert.equal(CNN.layers.length, LAYERS.length);
  for (const layer of CNN.layers) {
    const size = layer.kind === 'map' ? layer.maps * layer.w * layer.h : layer.n;
    assert.equal(layer.size, size, `${layer.id}: size does not match its shape`);
    assert.equal(layer.offset, expected, `${layer.id}: offset is not contiguous`);
    assert.ok(layer.max > 0, `${layer.id}: quantisation max must be positive`);
    expected += size;
  }
  assert.equal(CNN.meta.stride, expected, 'meta.stride must cover every layer');
});

test('cnn: every sample decodes to a full-stride blob', () => {
  assert.equal(CNN.samples.length, 10);
  for (const sample of CNN.samples) {
    const bytes = Buffer.from(sample.data, 'base64');
    assert.equal(bytes.length, CNN.meta.stride,
      `digit ${sample.digit}: blob is ${bytes.length} B, expected ${CNN.meta.stride}`);
  }
});

test('cnn: the showcase digits are all classified correctly', () => {
  const seen = new Set();
  for (const sample of CNN.samples) {
    seen.add(sample.digit);
    assert.equal(sample.predicted, sample.digit,
      `digit ${sample.digit} is misclassified — the hero would show the wrong answer`);
    assert.ok(sample.confidence > 0.5, `digit ${sample.digit}: confidence too low`);
    const total = sample.probs.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 0.01, `digit ${sample.digit}: probs do not sum to 1`);
    const winner = sample.probs.indexOf(Math.max(...sample.probs));
    assert.equal(winner, sample.predicted);
  }
  assert.equal(seen.size, 10, 'expected one showcase sample per class');
});

test('cnn: the output layer of each blob matches the stated probabilities', () => {
  const out = CNN.layers.find((l) => l.id === 'out');
  for (const sample of CNN.samples) {
    const bytes = Buffer.from(sample.data, 'base64');
    let best = 0;
    for (let i = 1; i < out.n; i++) {
      if (bytes[out.offset + i] > bytes[out.offset + best]) best = i;
    }
    assert.equal(best, sample.predicted,
      `digit ${sample.digit}: the brightest output neuron is not the prediction`);
  }
});

test('cnn: the trained model is actually good', () => {
  assert.ok(CNN.meta.testAccuracy > 0.97,
    `test accuracy ${CNN.meta.testAccuracy} — retrain with \`npm run train-cnn\``);
});

test('cnn: the hero chunk is dynamically imported, never statically linked', () => {
  const main = read('js/main.js');
  assert.ok(!/^import[^\n]*['"]\.\/cnn-hero\.js['"]/m.test(main),
    'js/main.js must not statically import cnn-hero.js — it would land in the main chunk');
  assert.ok(main.includes("import('./cnn-hero.js')"),
    'js/main.js should reach the CNN hero through a dynamic import');
  assert.ok(main.includes('supportsCnnHero()'),
    'the CNN hero must stay gated behind supportsCnnHero()');
});

test('cnn: the hero renderer ships no ML runtime and cleans up after itself', () => {
  const hero = read('js/cnn-hero.js');
  /* Only import specifiers, not prose — the header comment names the
     libraries this module deliberately does *not* use. */
  const specifiers = [...hero.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of specifiers) {
    assert.ok(!/three|tensorflow|tfjs|tensorspace/i.test(spec),
      `cnn-hero.js must not import an ML/3D runtime — found "${spec}"`);
  }
  assert.deepEqual(specifiers.sort(), ['../data/cnn-activations.js', './theme.js'],
    'cnn-hero.js should depend on nothing but the theme and the baked activations');
  assert.ok(hero.includes('destroy()'), 'cnn-hero.js must expose destroy() for page teardown');
});
