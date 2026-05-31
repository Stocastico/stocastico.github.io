'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildWorldMapSvg,
  replaceBlock,
  BLOCK_START,
  BLOCK_END,
} = require('../scripts/generate-world-map.js');

const topo = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../data/countries-110m.json'), 'utf8'),
);

test('buildWorldMapSvg returns an inline SVG with a viewBox and accessible title', () => {
  const svg = buildWorldMapSvg(topo, { lived: ['Germany'], visited: ['France'] });
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /viewBox="/);
  assert.match(svg, /<title[^>]*>/);
  assert.match(svg, /role="img"/);
});

test('buildWorldMapSvg draws a base silhouette plus tagged highlight paths', () => {
  const svg = buildWorldMapSvg(topo, { lived: ['Germany'], visited: ['France'] });
  // Always a single land silhouette.
  assert.match(svg, /class="wm-land"/);
  // Germany path carries the lived modifier, France the visited one.
  assert.match(svg, /class="wm-country wm-lived"[^>]*data-name="Germany"/);
  assert.match(svg, /class="wm-country wm-visited"[^>]*data-name="France"/);
  // A country in neither list is not drawn individually (it is in the silhouette).
  assert.doesNotMatch(svg, /data-name="Canada"/);
});

test('buildWorldMapSvg emits silhouette + one path per highlighted country', () => {
  const svg = buildWorldMapSvg(topo, { lived: ['Germany'], visited: ['France', 'Spain'] });
  const pathCount = (svg.match(/<path /g) || []).length;
  // 1 silhouette + 3 highlighted countries.
  assert.equal(pathCount, 4);
});

test('buildWorldMapSvg with no highlights still renders the silhouette', () => {
  const svg = buildWorldMapSvg(topo, { lived: [], visited: [] });
  assert.equal((svg.match(/<path /g) || []).length, 1);
  assert.match(svg, /class="wm-land"/);
});

test('replaceBlock swaps content between the generated markers', () => {
  const html = `<div>\n${BLOCK_START}\nOLD\n${BLOCK_END}\n</div>`;
  const out = replaceBlock(html, 'NEW');
  assert.match(out, /NEW/);
  assert.doesNotMatch(out, /OLD/);
  assert.ok(out.includes(BLOCK_START) && out.includes(BLOCK_END));
});

test('replaceBlock throws when markers are missing', () => {
  assert.throws(() => replaceBlock('<div>no markers</div>', 'NEW'));
});
