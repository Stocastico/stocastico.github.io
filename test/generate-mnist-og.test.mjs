/* The MNIST page's social card (scripts/generate-mnist-og.mjs).

   It replaced a hand-drawn PNG that quoted an accuracy the retrained model
   no longer had. What is held here is that the card cannot do that again:
   its numbers come from the model, its colours from the palette, and the
   committed PNG is the size the page declares. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { htmlFor, readDigit } from '../scripts/generate-mnist-og.mjs';

const require = createRequire(import.meta.url);
const { parseYaml } = require('../scripts/lib/yaml.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pal = parseYaml(fs.readFileSync(path.join(ROOT, 'data', 'palettes.yaml'), 'utf8'));
const P = pal.palettes[pal.active];
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cnn-model.json'), 'utf8'));

test('mnist-og: the accuracy on the card is the model\'s own', () => {
  const html = htmlFor(P);
  assert.ok(html.includes(`${(model.testAccuracy * 100).toFixed(2)}% test accuracy`));
});

test('mnist-og: the verdict is what forward() reads, and it reads the digit right', () => {
  const d = readDigit();
  assert.equal(d.verdict, 3);
  assert.ok(d.p > 0.5);
  assert.match(htmlFor(P, d), new RegExp(`class="digit">${d.verdict}<`));
});

test('mnist-og: the template reads no hard-coded colour', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'generate-mnist-og.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export function htmlFor'), src.indexOf('async function main'));
  assert.deepEqual(body.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
});

test('mnist-og: the page points at the card, and the card is 1200x630', () => {
  const page = fs.readFileSync(path.join(ROOT, 'projects', 'mnist-lenet.html'), 'utf8');
  assert.match(page, /og:image"\s+content="https:\/\/stefanomasneri\.com\/img\/projects\/mnist-lenet-og\.png"/);
  const buf = fs.readFileSync(path.join(ROOT, 'img', 'projects', 'mnist-lenet-og.png'));
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
});
