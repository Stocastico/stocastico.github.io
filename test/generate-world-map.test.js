'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildWorldMapSvg,
  replaceBlock,
  encodeSubpath,
  decodePath,
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

test('buildWorldMapSvg simplifies the silhouette to keep the inline markup small', () => {
  const svg = buildWorldMapSvg(topo, { lived: ['Germany'], visited: ['France', 'Spain'] });
  // The land silhouette dominates the byte budget. Douglas-Peucker
  // simplification + dropping speck-sized islands keeps the whole inline SVG
  // well under its pre-simplification size (~78 KB) at this display scale.
  assert.ok(svg.length < 90000, `expected simplified SVG < 90 KB, got ${svg.length}`);
  const land = svg.match(/class="wm-land" d="([^"]*)"/)[1];
  const verts = decodePath(land).filter((p) => p.cmd !== 'Z').length;
  // Detailed enough to meet the highlighted countries, which are drawn at
  // full detail on top of it: at eps 0.4° (~1,600 vertices) the grey coast
  // visibly missed the coloured ones — the review's "sgranata" — so the floor
  // is set above that. Still well under the unsimplified ~78 KB of land.
  assert.ok(verts > 4000, `silhouette too coarse to meet the country outlines, got ${verts}`);
  assert.ok(verts < 9000, `silhouette should still be simplified, got ${verts}`);
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

/* ─────────────────────────────────────────────────────────────────────────────
   DRIFT: the world-map block committed in index.html matches data/countries.js.

   The tests above build SVG from fixture country lists. None of them looked at
   the SVG actually on the homepage, so the committed block could disagree with
   the data it was generated from and nothing failed — measured by flipping a
   country's class from wm-lived to wm-visited in index.html and running the
   whole suite green.

   Concretely that means a country painted in the wrong category on the front
   page: somewhere marked lived-in that was only visited, or the reverse. It is
   invisible as a bug because a coloured country looks exactly as intentional as
   any other coloured country, and the only person who can spot it is the one
   who has lived there.

   The generator is deterministic (a projection of committed TopoJSON through a
   committed country list), so regenerating and comparing is exact.
──────────────────────────────────────────────────────────────────────────────*/
const { readCountriesModule } = require('../scripts/generate-world-map.js');

test('drift: the index.html world map matches data/countries.js', () => {
  const ROOT = path.resolve(__dirname, '..');
  const countries = readCountriesModule(path.join(ROOT, 'data', 'countries.js'));
  const svg = buildWorldMapSvg(topo, countries);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.ok(html.includes(BLOCK_START) && html.includes(BLOCK_END),
    'index.html has lost its world-map markers');
  assert.equal(replaceBlock(html, svg), html,
    'the world-map SVG in index.html is stale — run `npm run generate-world-map`. '
    + 'A country is being drawn in a category data/countries.js no longer gives it.');
});

/* Path data is written relative (l/h/v from the previous vertex): the same
   geometry as absolute coordinates in about 60% of the bytes and under half
   the gzip. The encoding is only acceptable if it is exact, so these tests
   decode what the generator writes and compare it vertex for vertex. */

// Integer tenths of a degree: the generator's own resolution.
const ring = (...pts) => pts.map(([x, y]) => ({ x, y }));

test('encodeSubpath round-trips exactly, including the awkward deltas', () => {
  const cases = [
    // plain diagonal steps, mixed signs
    ring([1781, 175], [1784, 173], [1787, 176], [1786, 182]),
    // purely horizontal and vertical steps (h / v)
    ring([0, 0], [30, 0], [30, -20], [-10, -20], [-10, 0]),
    // sub-1 deltas: leading-zero and sign formatting (.3, -.3, -.1 -.2)
    ring([-1800, 161], [-1798, 160], [-1800, 166], [-1806, 168]),
    // zero crossing and large jumps
    ring([-5, 5], [5, -5], [1800, -900], [-1800, 900]),
  ];
  for (const pts of cases) {
    const d = encodeSubpath(pts);
    const back = decodePath(d).filter((p) => p.cmd !== 'Z').map(({ x, y }) => ({ x, y }));
    assert.deepEqual(back, pts, `round trip failed for ${d}`);
    assert.ok(d.endsWith('Z') || d.endsWith('z'), 'subpath must be closed');
  }
});

test('encodeSubpath output has no absolute L and is shorter than the absolute form', () => {
  const pts = ring([1781, 175], [1784, 173], [1787, 176], [1786, 182], [1779, 183], [1774, 182]);
  const d = encodeSubpath(pts);
  assert.ok(!/L/.test(d), `absolute L left in ${d}`);
  const absolute = 'M' + pts.map((p) => `${p.x / 10} ${p.y / 10}`).join('L') + 'Z';
  assert.ok(d.length < absolute.length, `${d.length} !< ${absolute.length}`);
});

test('two subpaths decode independently (each starts from its own absolute M)', () => {
  const a = ring([100, 100], [110, 105], [95, 120]);
  const b = ring([-50, 20], [-40, 20], [-40, 30]);
  const back = decodePath(encodeSubpath(a) + encodeSubpath(b))
    .filter((p) => p.cmd !== 'Z').map(({ x, y }) => ({ x, y }));
  assert.deepEqual(back, [...a, ...b]);
});

test('the shipped map uses relative path data throughout', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const block = html.slice(html.indexOf(BLOCK_START), html.indexOf(BLOCK_END));
  const ds = [...block.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ds.length > 20, 'expected the land silhouette plus the highlighted countries');
  for (const d of ds) assert.ok(!/L/.test(d), `absolute L in committed map path: ${d.slice(0, 60)}`);
  const total = ds.reduce((n, d) => n + d.length, 0);
  assert.ok(total < 45000, `path data should be ~38 KB relative (was ~64 KB absolute), got ${total}`);
});
