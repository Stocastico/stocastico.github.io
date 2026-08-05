#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   generate-europe-land.mjs — data/land-50m.json → data/europe-land.json

   Why this exists.

   The travel page's 2-D Europe map used to `fetch('/data/land-50m.json')` —
   545 KB of world coastline TopoJSON — decode all 1,419 rings of it in the
   browser, and then throw away everything outside a Europe bounding box. It
   downloaded the whole planet to draw one corner of it, on a page that already
   pays for Three.js.

   Everything that filter did is knowable at build time, so it happens here
   instead. Three reductions, in order, each one the same decision the runtime
   was already making:

     1. Keep only rings with at least one vertex inside EUROPE_BOUNDS.
        1,419 rings → 176. (This was `_loadTopoJSON`'s filter.)

     2. Split each ring into the polylines the renderer would actually stroke.
        Coastlines here are stroke-only — never filled — and the draw code
        further clipped "global" rings (longitude span ≥ 90°: Eurasia, Africa)
        to a padded box, emitting a fresh subpath every time the outline came
        back into range. Replaying that split here is not an approximation: it
        produces the identical set of subpaths, so the rendered pixels are
        unchanged and the runtime loses a branch. 16,551 points → 10,152.

     3. Douglas-Peucker at a sub-pixel epsilon, then round to 2 decimals.
        The map is ~600 px wide across 65° of longitude at cos(49°), so one
        degree of longitude is ~9 px and one of latitude ~14 px. EPSILON of
        0.015° is therefore under a sixth of a pixel — still sub-pixel at a
        3× device pixel ratio. 10,152 points → 6,873.

   Net: 545 KB → ~95 KB (30 KB gzip), with nothing visibly different.

   The bounds are imported from js/europe-map.js rather than restated, because
   they are already shared with the globe (isEuropeanSecondaryPin) and a second
   copy here would be a third place to keep in step.

   Usage:
     node scripts/generate-europe-land.mjs [--dry-run] [--help]
──────────────────────────────────────────────────────────────────────────────*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EUROPE_BOUNDS } from '../js/europe-map.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'land-50m.json');
const OUTPUT = path.join(ROOT, 'data', 'europe-land.json');

/* Padding around EUROPE_BOUNDS for the global-ring split. Must match the
   renderer's old `pad`, or a coastline that used to run a little past the
   frame's edge would now stop at it — visible, because the canvas clip sits
   at the frame and a line ending exactly there reads as a cut. */
export const NEAR_PAD = 8;
/* Longitude span above which a ring counts as a continent rather than an
   island. Was `isLocal()` in the renderer. */
export const GLOBAL_SPAN = 90;
/* Sub-pixel at the display scale — see the header.

   0.015, not the 0.02 first tried, and the difference is not taste. Douglas-
   Peucker bounds the perpendicular distance to the segment under test, but a
   *closed* ring arrives with first === last, so the top-level segment has zero
   length and that first split measures distance-from-a-point instead. On a few
   long closed coastlines that let the result drift to 0.0375° at eps 0.02 —
   past the epsilon it was supposed to respect. At 0.015 the measured worst
   case is exactly 0.0150°, i.e. the bound holds, and the test in
   test/generate-europe-land.test.mjs measures it rather than assuming it. */
export const EPSILON = 0.015;
/* 0.01° ≈ 0.1 px of longitude here, so two decimals costs nothing visible and
   is worth ~40% of the remaining bytes. */
export const DECIMALS = 2;

/* ─── Pure helpers (unit-tested) ─────────────────────────────────────────── */

/** Decode a TopoJSON `land` object into absolute [lon, lat] rings. */
export function decodeTopoJSON(topo) {
  const { scale, translate } = topo.transform;
  const decodeArc = (idx) => {
    const rev = idx < 0;
    const raw = topo.arcs[rev ? ~idx : idx];
    let cx = 0;
    let cy = 0;
    const pts = raw.map(([dx, dy]) => {
      cx += dx;
      cy += dy;
      return [cx * scale[0] + translate[0], cy * scale[1] + translate[1]];
    });
    return rev ? pts.reverse() : pts;
  };
  const rings = [];
  for (const geom of topo.objects.land.geometries) {
    const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
    for (const poly of polys) {
      const ring = [];
      for (const arcIdx of poly[0]) ring.push(...decodeArc(arcIdx));
      rings.push(ring);
    }
  }
  return rings;
}

/** True when the ring has any vertex inside the map's frame. */
export function touchesBounds(ring, b) {
  return ring.some(([lon, lat]) =>
    lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat);
}

/** A ring narrow enough to be an island/country rather than a continent. */
export function isLocalRing(ring) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [lon] of ring) {
    if (lon < lo) lo = lon;
    if (lon > hi) hi = lon;
  }
  return (hi - lo) < GLOBAL_SPAN;
}

/**
 * Split one ring into the polylines the renderer would stroke.
 *
 * Local rings pass through whole. Global rings are walked exactly as the old
 * draw loop walked them: a subpath opens at the first vertex inside the padded
 * box (preceded by the vertex before it, so the coastline enters from off-frame
 * rather than appearing at the boundary) and closes on the first vertex back
 * outside it (which is included, for the same reason at the other end).
 */
export function ringToLines(ring, b, pad = NEAR_PAD) {
  if (isLocalRing(ring)) return [ring];

  const near = ([lon, lat]) =>
    lon >= b.minLon - pad && lon <= b.maxLon + pad
    && lat >= b.minLat - pad && lat <= b.maxLat + pad;

  const lines = [];
  let current = null;
  let prevNear = false;
  for (let i = 0; i < ring.length; i += 1) {
    const isNear = near(ring[i]);
    if (isNear) {
      if (!prevNear) {
        current = [];
        if (i > 0) current.push(ring[i - 1]);
        current.push(ring[i]);
        lines.push(current);
      } else {
        current.push(ring[i]);
      }
    } else if (prevNear) {
      current.push(ring[i]);
      current = null;
    }
    prevNear = isNear;
  }
  return lines;
}

/**
 * Douglas-Peucker on a [lon, lat] polyline: drop vertices whose perpendicular
 * distance to the retained line is under `epsilon` degrees. Endpoints are
 * always kept. Same algorithm as simplifyRing() in generate-world-map.js —
 * duplicated rather than shared because that file is CJS and this one is ESM,
 * and a shim for twenty lines of arithmetic is worse than the twenty lines.
 */
export function simplifyLine(points, epsilon) {
  if (points.length < 3) return points;
  const eps2 = epsilon * epsilon;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax;
    const dy = by - ay;
    const segLen2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i];
      let d2;
      if (segLen2 === 0) {
        const ex = px - ax;
        const ey = py - ay;
        d2 = ex * ex + ey * ey;
      } else {
        const t = ((px - ax) * dx + (py - ay) * dy) / segLen2;
        const jx = ax + t * dx;
        const jy = ay + t * dy;
        const ex = px - jx;
        const ey = py - jy;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > maxD) { maxD = d2; idx = i; }
    }
    if (maxD > eps2 && idx !== -1) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push(points[i]);
  return out;
}

/** Round to DECIMALS and drop vertices the rounding made duplicates of. */
export function quantiseLine(points, decimals = DECIMALS) {
  const out = [];
  let px = null;
  let py = null;
  for (const [lon, lat] of points) {
    const x = Number(lon.toFixed(decimals));
    const y = Number(lat.toFixed(decimals));
    if (x === px && y === py) continue;
    out.push([x, y]);
    px = x;
    py = y;
  }
  return out;
}

/** The whole pipeline: world TopoJSON → the polylines the map strokes. */
export function buildEuropeLines(topo, bounds = EUROPE_BOUNDS) {
  const lines = [];
  for (const ring of decodeTopoJSON(topo)) {
    if (!touchesBounds(ring, bounds)) continue;
    for (const line of ringToLines(ring, bounds)) lines.push(line);
  }
  return lines
    .map((line) => quantiseLine(simplifyLine(line, EPSILON)))
    /* A polyline needs two points to stroke anything. */
    .filter((line) => line.length >= 2);
}

/** Serialise one polyline per line so the file stays diffable. */
export function serialise(payload) {
  const head = `{\n  "bounds": ${JSON.stringify(payload.bounds)},\n  "lines": [\n`;
  const body = payload.lines.map((l) => `    ${JSON.stringify(l)}`).join(',\n');
  return `${head}${body}\n  ]\n}\n`;
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export function generate() {
  const topo = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const lines = buildEuropeLines(topo);
  return serialise({ bounds: EUROPE_BOUNDS, lines });
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage:
  node scripts/generate-europe-land.mjs [options]

Reads  data/land-50m.json  (world coastlines, not deployed)
Writes data/europe-land.json (Europe only, simplified — this is what ships)

Options:
  --dry-run   Report the sizes; write nothing
  -h, --help  Show this help
`);
    return;
  }

  const text = generate();
  const before = fs.statSync(INPUT).size;
  const lineCount = (text.match(/^ {4}\[/gm) || []).length;

  if (argv.includes('--dry-run')) {
    console.log(`would write ${OUTPUT}`);
    console.log(`  ${lineCount} polylines, ${text.length} bytes (source ${before} bytes)`);
    return;
  }

  fs.writeFileSync(OUTPUT, text, 'utf8');
  const pct = Math.round((1 - text.length / before) * 100);
  console.log(`✓ data/europe-land.json — ${lineCount} polylines, ${text.length} bytes `
    + `(${pct}% smaller than the ${before}-byte world file it replaces at runtime)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
