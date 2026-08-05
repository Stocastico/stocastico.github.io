/* ─────────────────────────────────────────────────────────────────────────────
   generate-europe-land.mjs — drift + invariants.

   The committed data/europe-land.json is what the travel page downloads, so
   the first test is the one that matters: regenerate from data/land-50m.json
   and fail if the result differs. Same contract as the cnn-activations and
   generate-cards guards — a generated artefact that stops matching its source
   is a bug even when nothing looks wrong.

   The rest pin the two properties that make the build-time move *safe* rather
   than merely smaller: the split has to reproduce what the renderer used to do
   at draw time, and the simplification has to stay sub-pixel. If either drifts
   the map degrades silently — a coastline that ends mid-frame, or a Norway
   made of straight lines — and no other test on the site would notice.

   Run:  node --test test/generate-europe-land.test.mjs
──────────────────────────────────────────────────────────────────────────────*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generate, buildEuropeLines, ringToLines, simplifyLine, quantiseLine,
  isLocalRing, touchesBounds, decodeTopoJSON, EPSILON, DECIMALS, NEAR_PAD,
} from '../scripts/generate-europe-land.mjs';
import { EUROPE_BOUNDS } from '../js/europe-map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'europe-land.json');

test('generate-europe-land: committed data/europe-land.json is up to date', () => {
  const committed = fs.readFileSync(OUT, 'utf8');
  assert.equal(generate(), committed,
    'data/europe-land.json has drifted from data/land-50m.json — '
    + 'run `npm run generate-europe-land`');
});

test('generate-europe-land: the shipped file is a fraction of the world file', () => {
  const shipped = fs.statSync(OUT).size;
  const source = fs.statSync(path.join(ROOT, 'data', 'land-50m.json')).size;
  /* The whole point of the generator. Deliberately a loose ceiling: this is a
     guard against someone quietly reverting to shipping the world, not a byte
     budget (test/e2e/budget.e2e.mjs is where budgets live). */
  assert.ok(shipped < source * 0.25,
    `europe-land.json is ${shipped} bytes against a ${source}-byte source — `
    + 'that is most of the world again; check the bounds filter still runs');
});

test('generate-europe-land: every vertex is quantised and every line drawable', () => {
  const { lines } = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.ok(lines.length > 100, 'suspiciously few polylines');
  for (const line of lines) {
    assert.ok(line.length >= 2, 'a 1-point polyline strokes nothing');
    for (const [lon, lat] of line) {
      assert.equal(typeof lon, 'number');
      assert.equal(typeof lat, 'number');
      assert.equal(Number(lon.toFixed(DECIMALS)), lon, `${lon} carries more than ${DECIMALS} decimals`);
      assert.equal(Number(lat.toFixed(DECIMALS)), lat, `${lat} carries more than ${DECIMALS} decimals`);
    }
  }
});

test('generate-europe-land: the file records the bounds it was built for', () => {
  const { bounds } = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  assert.deepEqual(bounds, EUROPE_BOUNDS,
    'europe-land.json was built for different bounds than js/europe-map.js uses — '
    + 'EUROPE_BOUNDS changed without a regeneration');
});

/* ─── The split reproduces the old draw-time behaviour ───────────────────── */

test('ringToLines: an island passes through as one polyline', () => {
  const gb = [[-5, 50], [-3, 51], [-1, 53], [0, 55], [-2, 57], [-4, 58], [-5, 56], [-5, 50]];
  assert.ok(isLocalRing(gb));
  assert.deepEqual(ringToLines(gb, EUROPE_BOUNDS), [gb]);
});

test('ringToLines: a continent is cut into its near-Europe runs', () => {
  /* Spans >90° of longitude, so it is "global": in-frame, far east, back in. */
  const eurasia = [
    [0, 50], [10, 52], [20, 54],        /* near */
    [90, 60], [120, 55],                /* far away */
    [30, 50], [10, 45],                 /* near again */
  ];
  assert.ok(!isLocalRing(eurasia));
  const lines = ringToLines(eurasia, EUROPE_BOUNDS);
  assert.equal(lines.length, 2, 'two separate near-Europe runs → two subpaths');

  /* Each run must carry one vertex of context past its edge, exactly as the
     old loop did (moveTo the previous point / lineTo the next). Without it a
     coastline would start and stop at the padded boundary instead of running
     off-frame, which the canvas clip would show as a cut end. */
  assert.deepEqual(lines[0][lines[0].length - 1], [90, 60], 'run should exit through the first far vertex');
  assert.deepEqual(lines[1][0], [120, 55], 'run should enter from the last far vertex');
});

test('ringToLines: pad admits vertices just outside the frame', () => {
  const b = EUROPE_BOUNDS;
  const justOutside = b.maxLon + NEAR_PAD - 1;
  const ring = [[0, 50], [justOutside, 50], [b.maxLon + NEAR_PAD + 20, 50], [0, 45], [-120, 10], [0, 50]];
  const lines = ringToLines(ring, b);
  assert.ok(lines.some(l => l.some(([lon]) => lon === justOutside)),
    'a vertex inside the pad must still be drawn — it is what makes coastlines leave the frame');
});

test('touchesBounds: rings entirely outside Europe are dropped', () => {
  const australia = [[115, -35], [150, -35], [150, -10], [115, -10], [115, -35]];
  assert.equal(touchesBounds(australia, EUROPE_BOUNDS), false);
  assert.equal(buildEuropeLines(
    { transform: { scale: [1, 1], translate: [0, 0] }, arcs: [], objects: { land: { geometries: [] } } },
  ).length, 0);
});

/* ─── Simplification stays invisible ─────────────────────────────────────── */

test('simplifyLine: drops collinear vertices, keeps the endpoints', () => {
  const straight = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
  assert.deepEqual(simplifyLine(straight, EPSILON), [[0, 0], [4, 0]]);
});

test('simplifyLine: keeps a deviation larger than epsilon', () => {
  const bent = [[0, 0], [2, EPSILON * 10], [4, 0]];
  assert.equal(simplifyLine(bent, EPSILON).length, 3);
});

/** Shortest distance from p to the polyline `line`, in degrees. */
function distanceToPolyline(p, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const seg2 = dx * dx + dy * dy;
    let t = seg2 === 0 ? 0 : ((p[0] - ax) * dx + (p[1] - ay) * dy) / seg2;
    t = Math.max(0, Math.min(1, t));
    const ex = p[0] - (ax + t * dx);
    const ey = p[1] - (ay + t * dy);
    const d = Math.hypot(ex, ey);
    if (d < best) best = d;
  }
  return best;
}

test('simplifyLine: no original vertex ends up further than the budget from the kept line', () => {
  /* The claim EPSILON rests on, measured against the real coastline rather
     than a synthetic curve: every vertex the pipeline discards must still lie
     within EPSILON (plus what rounding to DECIMALS can add) of the polyline
     that ships. At the map's scale — ~9 px per degree of longitude, ~14 per
     degree of latitude — that budget is under a third of a pixel, so "we
     dropped 32% of the vertices" and "nothing moved" are both true.

     Rebuilt from data/land-50m.json here rather than read back from the
     output, because the output is the thing under test. */
  const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'land-50m.json'), 'utf8'));
  const raw = [];
  for (const ring of decodeTopoJSON(topo)) {
    if (!touchesBounds(ring, EUROPE_BOUNDS)) continue;
    for (const line of ringToLines(ring, EUROPE_BOUNDS)) raw.push(line);
  }
  assert.ok(raw.length > 100, 'expected the full set of near-Europe polylines');

  /* Half a unit in the last decimal, on each axis, on top of epsilon. */
  const budget = EPSILON + Math.SQRT2 * (0.5 * 10 ** -DECIMALS);
  assert.ok(budget < 0.025, 'epsilon plus rounding must stay well under a pixel');

  let worst = 0;
  let dropped = 0;
  let total = 0;
  for (const line of raw) {
    const kept = quantiseLine(simplifyLine(line, EPSILON));
    if (kept.length < 2) continue;
    total += line.length;
    dropped += line.length - kept.length;
    for (const point of line) {
      const d = distanceToPolyline(point, kept);
      if (d > worst) worst = d;
    }
  }
  assert.ok(dropped / total > 0.25, `expected a real reduction, dropped only ${dropped}/${total}`);
  assert.ok(worst <= budget,
    `simplification moved the coastline by ${worst.toFixed(4)}°, over the ${budget.toFixed(4)}° budget`);
});

test('quantiseLine: collapses points that rounding made identical', () => {
  const jittery = [[1.001, 2.001], [1.002, 2.002], [3, 4]];
  assert.deepEqual(quantiseLine(jittery, 2), [[1, 2], [3, 4]]);
});
