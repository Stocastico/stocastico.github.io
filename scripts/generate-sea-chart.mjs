#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   generate-sea-chart.mjs — the travel page's nautical chart (#193)

     data/land-50m.json  ─┐
     data/cv.js (places, career) ─┼─→ static <svg> between the
     data/locations.js (pins)  ─┘     <!-- generated:sea-chart --> markers
                                      in travel.html

   The travel page opens on a chart of Europe, drawn the way an Admiralty chart
   is: Mercator, a graticule, land as a flat fill, depth contours as rings
   around every coast, sea names in an italic serif, a compass rose, and the
   one route that matters — Brescia → Berlin → Frankfurt → San Sebastián —
   dashed in the hazard colour, each leg labelled with the year and the lab
   that started it. The European worktrips and holidays sit on it as ports of
   call (the globe hides them for exactly that reason; see CHART_BOUNDS).

   Why build time. All of it is static; a canvas would mean shipping coastline
   data and a renderer to draw a picture that never changes. Inlined, the
   chart reads `var(--…)` like any other markup, so the palette reaches it
   with no regeneration — the same reason the homepage world map is inline.

   Decisions worth keeping straight:

   · Land is CLOSED RINGS, clipped to the frame with Sutherland–Hodgman. The
     mock-up fed open coastline polylines to a fill and got a scribble; the
     Europe map's data was polylines because that map only stroked. Clipping a
     ring to a rectangle leaves edges running along the clip boundary, so the
     clip box is padded past the viewBox and those edges are never seen.
   · Depth contours are not separate data. The land path is defined once in
     <defs> and drawn by <use> at decreasing stroke widths, alternating a
     contour colour with the sea colour, then filled on top: what survives is
     a thin line at a fixed distance off every coast. One path, many rings.
   · Nothing about the route is typed here. Places and their order come from
     CV_PLACES, coordinates from the lived/current pins in LOCATIONS, and each
     leg's label from the CV_CAREER entry that starts in that city that year.
   · No colours. Every paint is a class; css/styles.css owns them.

   Usage:
     node scripts/generate-sea-chart.mjs [--dry-run] [--help]
──────────────────────────────────────────────────────────────────────────────*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHART_BOUNDS } from '../js/utils.js';
import { CV_PLACES, CV_CAREER } from '../data/cv.js';
import { LOCATIONS } from '../data/locations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAND = path.join(ROOT, 'data', 'land-50m.json');
const TRAVEL = path.join(ROOT, 'travel.html');
const MARKER = 'generated:sea-chart';

/* ─── Projection ─────────────────────────────────────────────────────────── */

/* User units per degree of longitude. 24 puts the 68° frame at 1632 units,
   i.e. roughly one unit per CSS pixel on a desktop. */
const K = 24;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
const TOP = mercY(CHART_BOUNDS.maxLat);

export const VIEW = {
  width: Math.round((CHART_BOUNDS.maxLon - CHART_BOUNDS.minLon) * K),
  height: Math.round((TOP - mercY(CHART_BOUNDS.minLat)) * K),
};

/** [lon, lat] → [x, y] in viewBox units. */
export function project(lon, lat) {
  return [(lon - CHART_BOUNDS.minLon) * K, (TOP - mercY(lat)) * K];
}

const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(r1(n));

/* ─── Land ───────────────────────────────────────────────────────────────── */

/* Degrees of land kept past each edge, so the clip seam stays off-canvas. */
const CLIP_PAD = 2;
/* Douglas–Peucker tolerance in viewBox units: a third of a pixel on desktop. */
const EPSILON = 0.35;
/* Rings smaller than this (units²) are specks no one can see. */
const MIN_AREA = 6;

function decodeRings(topo) {
  const { scale, translate } = topo.transform;
  const decodeArc = (idx) => {
    const rev = idx < 0;
    let cx = 0;
    let cy = 0;
    const pts = topo.arcs[rev ? ~idx : idx].map(([dx, dy]) => {
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

/** Sutherland–Hodgman: clip a closed ring to an axis-aligned box. */
export function clipRing(ring, box) {
  const edges = [
    [(p) => p[0] >= box.minLon, (a, b) => cross(a, b, 0, box.minLon)],
    [(p) => p[0] <= box.maxLon, (a, b) => cross(a, b, 0, box.maxLon)],
    [(p) => p[1] >= box.minLat, (a, b) => cross(a, b, 1, box.minLat)],
    [(p) => p[1] <= box.maxLat, (a, b) => cross(a, b, 1, box.maxLat)],
  ];
  let out = ring;
  for (const [inside, intersect] of edges) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i += 1) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(intersect(prev, cur));
      }
    }
  }
  return out;
}

function cross(a, b, axis, value) {
  const t = (value - a[axis]) / (b[axis] - a[axis]);
  return axis === 0
    ? [value, a[1] + t * (b[1] - a[1])]
    : [a[0] + t * (b[0] - a[0]), value];
}

function simplify(points, epsilon) {
  if (points.length < 4) return points;
  const eps2 = epsilon * epsilon;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const dx = points[last][0] - ax;
    const dy = points[last][1] - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = first + 1; i < last; i += 1) {
      const [px, py] = points[i];
      const t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD) { maxD = d2; idx = i; }
    }
    if (maxD > eps2) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a / 2);
}

/** The land as one SVG path of closed rings, in viewBox units. */
export function landPath(topo) {
  const box = {
    minLon: CHART_BOUNDS.minLon - CLIP_PAD,
    maxLon: CHART_BOUNDS.maxLon + CLIP_PAD,
    minLat: CHART_BOUNDS.minLat - CLIP_PAD,
    maxLat: CHART_BOUNDS.maxLat + CLIP_PAD,
  };
  const parts = [];
  for (const ring of decodeRings(topo)) {
    const clipped = clipRing(ring, box);
    if (clipped.length < 3) continue;
    /* Simplify the open form (first point repeated at the end) so DP keeps the
       ring's start fixed; the Z closes it again. */
    const projected = clipped.map(([lon, lat]) => project(lon, lat));
    projected.push(projected[0]);
    const pts = [];
    for (const [x, y] of simplify(projected, EPSILON).slice(0, -1)) {
      const p = [r1(x), r1(y)];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
    if (pts.length < 3 || area(pts) < MIN_AREA) continue;
    parts.push(`M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`);
  }
  return parts.join('');
}

/* ─── Route and ports ────────────────────────────────────────────────────── */

const cityOf = (name) => name.split(',')[0].trim();

function homePin(city) {
  const pin = LOCATIONS.pins.find((p) => (p.type === 'lived' || p.type === 'current')
    && cityOf(p.name) === city);
  if (!pin) throw new Error(`generate-sea-chart: no lived/current pin for "${city}" in data/locations.js`);
  return pin;
}

/** The places from the CV, in order, with their positions. */
export function chartHomes() {
  return CV_PLACES.map((p) => {
    const pin = homePin(p.city);
    const [x, y] = project(pin.lon, pin.lat);
    return { city: p.city, years: p.year, current: pin.type === 'current', x, y };
  });
}

/** One leg per move: where from, where to, when, and for which lab. */
export function chartLegs() {
  const homes = chartHomes();
  return homes.slice(1).map((to, i) => {
    const year = parseInt(to.years, 10);
    const role = CV_CAREER.find((c) => parseInt(c.year, 10) === year
      && String(c.location || '').startsWith(to.city));
    if (!role) {
      throw new Error(`generate-sea-chart: no CV_CAREER role starts in ${to.city} in ${year}`);
    }
    return { from: homes[i], to, year, lab: role.company };
  });
}

const inFrame = (p) => p.lat >= CHART_BOUNDS.minLat && p.lat <= CHART_BOUNDS.maxLat
  && p.lon >= CHART_BOUNDS.minLon && p.lon <= CHART_BOUNDS.maxLon;

/** The worktrips and holidays the chart carries (the globe leaves them out). */
export function chartPorts() {
  return LOCATIONS.pins
    .filter((p) => (p.type === 'worktrip' || p.type === 'holiday') && inFrame(p))
    .map((p) => {
      const [x, y] = project(p.lon, p.lat);
      return { name: p.name, info: p.info || '', type: p.type, x, y };
    });
}

/* ─── Furniture ──────────────────────────────────────────────────────────── */

/* Sea names, placed by hand: where a cartographer would letter them is a
   judgement, not a centroid. [name, lon, lat, rotation°, modifiers]:
   `ocean` sets a name larger and wider, `offshore` marks one that a phone's
   centred crop would cut in half, so it is hidden there. */
const SEAS = [
  ['Atlantic Ocean', -17, 42.4, 0, 'ocean offshore'],
  ['Bay of Biscay', -5.6, 45.4, 0, ''],
  ['North Sea', 3.4, 56.2, 0, ''],
  ['Baltic Sea', 18.4, 55.6, -18, ''],
  ['Mediterranean Sea', 5.2, 38.3, 0, 'ocean'],
  ['Tyrrhenian Sea', 11.9, 40.2, 0, ''],
  ['Adriatic Sea', 15.4, 43.1, -38, ''],
  ['Ionian Sea', 18.6, 37.6, 0, ''],
  ['Aegean Sea', 25.0, 38.9, 0, 'offshore'],
  ['Black Sea', 34.0, 43.2, 0, 'offshore'],
];

/* Compass rose, in open Atlantic at the bottom left — the top left is the
   cartouche's on a desktop. */
const COMPASS = { lon: -23.5, lat: 38.6, r: 54 };

function compass() {
  const [cx, cy] = project(COMPASS.lon, COMPASS.lat);
  const { r } = COMPASS;
  const point = (deg, len, w) => {
    const a = (deg * Math.PI) / 180;
    const tip = [Math.sin(a) * len, -Math.cos(a) * len];
    const l = [Math.sin(a - Math.PI / 2) * w, -Math.cos(a - Math.PI / 2) * w];
    const rr = [Math.sin(a + Math.PI / 2) * w, -Math.cos(a + Math.PI / 2) * w];
    return {
      dark: `M0 0L${fmt(l[0])} ${fmt(l[1])}L${fmt(tip[0])} ${fmt(tip[1])}Z`,
      light: `M0 0L${fmt(tip[0])} ${fmt(tip[1])}L${fmt(rr[0])} ${fmt(rr[1])}Z`,
    };
  };
  const dark = [];
  const light = [];
  for (const [deg, len, w] of [[45, r * 0.62, 5], [135, r * 0.62, 5], [225, r * 0.62, 5], [315, r * 0.62, 5],
    [0, r, 8], [90, r, 8], [180, r, 8], [270, r, 8]]) {
    const p = point(deg, len, w);
    dark.push(p.dark);
    light.push(p.light);
  }
  const ticks = [];
  for (let d = 0; d < 360; d += 10) {
    const a = (d * Math.PI) / 180;
    const r0 = d % 30 === 0 ? r * 0.8 : r * 0.86;
    ticks.push(`M${fmt(Math.sin(a) * r0)} ${fmt(-Math.cos(a) * r0)}L${fmt(Math.sin(a) * r * 0.92)} ${fmt(-Math.cos(a) * r * 0.92)}`);
  }
  return [
    `<g class="sea-chart-compass" transform="translate(${fmt(cx)} ${fmt(cy)})" aria-hidden="true">`,
    `  <circle class="sea-chart-compass-ring" r="${fmt(r * 0.92)}"/>`,
    `  <circle class="sea-chart-compass-ring" r="${fmt(r * 0.8)}"/>`,
    `  <path class="sea-chart-compass-tick" d="${ticks.join('')}"/>`,
    `  <path class="sea-chart-compass-dark" d="${dark.join('')}"/>`,
    `  <path class="sea-chart-compass-light" d="${light.join('')}"/>`,
    `  <text class="sea-chart-compass-n" x="0" y="${fmt(-r - 10)}">N</text>`,
    '</g>',
  ];
}

function graticule() {
  const lines = [];
  const labels = [];
  for (let lon = Math.ceil(CHART_BOUNDS.minLon / 5) * 5; lon <= CHART_BOUNDS.maxLon; lon += 5) {
    const [x] = project(lon, 0);
    lines.push(`M${fmt(x)} 0V${VIEW.height}`);
    const name = lon === 0 ? '0°' : `${Math.abs(lon)}°${lon < 0 ? 'W' : 'E'}`;
    labels.push(`<text class="sea-chart-degree" x="${fmt(x + 4)}" y="${VIEW.height - 8}">${name}</text>`);
  }
  /* Parallels from the first one above the bottom edge, so the corner keeps
     only the meridian's label. */
  for (let lat = Math.floor(CHART_BOUNDS.minLat / 5) * 5 + 5; lat < CHART_BOUNDS.maxLat; lat += 5) {
    const [, y] = project(0, lat);
    lines.push(`M0 ${fmt(y)}H${VIEW.width}`);
    labels.push(`<text class="sea-chart-degree sea-chart-degree--lat" x="${VIEW.width - 8}" y="${fmt(y - 5)}">${lat}°N</text>`);
  }
  return [
    `<g class="sea-chart-graticule" aria-hidden="true">`,
    `  <path d="${lines.join('')}"/>`,
    ...labels.map((l) => `  ${l}`),
    '</g>',
  ];
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Where a city's name sits relative to its anchor, so no label lands on the
   route or on another label. Keyed by city because it is a layout decision
   about that spot on the map, not a fact about the place. */
const HOME_LABEL = {
  Brescia: 's',
  Berlin: 'e',
  Frankfurt: 'w',
  'San Sebastián': 's',
};

function homeLabel(h) {
  const side = HOME_LABEL[h.city] || 'e';
  const dx = { e: 14, w: -14, s: 0 }[side];
  const anchor = { e: 'start', w: 'end', s: 'middle' }[side];
  /* Below the anchor, the drop is in em so it grows with the lettering on a
     phone instead of sliding the name over its own dot. */
  const y = side === 's' ? `${fmt(h.y + 14)}" dy="0.8em` : fmt(h.y - 2);
  return `<text class="sea-chart-home-label" x="${fmt(h.x + dx)}" y="${y}" text-anchor="${anchor}">`
    + `${esc(h.city)}<tspan class="sea-chart-home-years" x="${fmt(h.x + dx)}" dy="1.25em">${esc(h.years)}</tspan></text>`;
}

/* Where each leg's label sits, keyed by the city the leg arrives at: which
   side of the line is clear is a judgement about that stretch of map. The
   label is horizontal and beside the line rather than set along it — the
   Berlin–Frankfurt leg is too short to carry "MPI for Brain Research" along
   its length, and the three legs meet at Berlin, where text along each would
   collide. `side` is the compass direction from the leg's midpoint. */
const LEG_LABEL = {
  Berlin: { side: 'e', at: 0.5 },
  Frankfurt: { side: 'n', at: 0.62 },
  'San Sebastián': { side: 'nw', at: 0.5 },
};
const LEG_WRAP = 20;

/** Break a name into lines of at most `max` characters, on spaces. */
export function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && (line.length + 1 + word.length) > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The anchor point of a leg's label, beside the leg's line. */
export function legLabelAnchor(leg) {
  const { side, at } = LEG_LABEL[leg.to.city] || { side: 'e', at: 0.5 };
  const mx = leg.from.x + (leg.to.x - leg.from.x) * at;
  const my = leg.from.y + (leg.to.y - leg.from.y) * at;
  const GAP = 16;
  const lines = 1 + wrap(leg.lab, LEG_WRAP).length;
  /* The block is ~1.2em per line; a label above its line rises by its height. */
  const rise = lines * 1.2 * 14;
  switch (side) {
    case 'n': return { x: mx, y: my - GAP - rise + 14, anchor: 'middle' };
    case 'nw': return { x: mx - GAP, y: my - rise + 4, anchor: 'end' };
    case 'w': return { x: mx - GAP, y: my - rise / 2 + 10, anchor: 'end' };
    default: return { x: mx + GAP, y: my - rise / 2 + 10, anchor: 'start' };
  }
}

/* ─── Assembly ───────────────────────────────────────────────────────────── */

export function buildSeaChart(topo = JSON.parse(fs.readFileSync(LAND, 'utf8'))) {
  const homes = chartHomes();
  const legs = chartLegs();
  const ports = chartPorts();

  const desc = `A nautical chart of Europe. The route runs ${homes.map((h) => h.city).join(' to ')}: `
    + legs.map((l) => `${l.to.city} in ${l.year}, for ${l.lab}`).join('; ')
    + `. ${ports.length} other places visited for work or on holiday are marked along the way.`;

  const route = `M${homes.map((h) => `${fmt(h.x)} ${fmt(h.y)}`).join('L')}`;

  const legLines = legs.map((leg) => {
    const { x, y, anchor } = legLabelAnchor(leg);
    const lab = wrap(leg.lab, LEG_WRAP);
    return `  <text class="sea-chart-leg-label" data-leg="${esc(leg.to.city)}" x="${fmt(x)}" y="${fmt(y)}" text-anchor="${anchor}">`
      + `<tspan class="sea-chart-leg-year">${leg.year}</tspan>`
      + lab.map((line) => `<tspan x="${fmt(x)}" dy="1.2em">${esc(line)}</tspan>`).join('')
      + '</text>';
  });

  const portLines = ports.map((p) => {
    const shape = p.type === 'worktrip'
      ? `<rect x="${fmt(p.x - 3.5)}" y="${fmt(p.y - 3.5)}" width="7" height="7" transform="rotate(45 ${fmt(p.x)} ${fmt(p.y)})"/>`
      : `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="3.5"/>`;
    const info = p.info ? ` — ${esc(p.info)}` : '';
    return `  <g class="sea-chart-port sea-chart-port--${p.type}"><title>${esc(p.name)}${info}</title>${shape}</g>`;
  });

  const homeLines = homes.map((h) => [
    `  <g class="sea-chart-home${h.current ? ' sea-chart-home--current' : ''}" data-city="${esc(h.city)}">`,
    `    <circle class="sea-chart-home-ring" cx="${fmt(h.x)}" cy="${fmt(h.y)}" r="11"/>`,
    `    <circle class="sea-chart-home-dot" cx="${fmt(h.x)}" cy="${fmt(h.y)}" r="5"/>`,
    `    ${homeLabel(h)}`,
    '  </g>',
  ].join('\n'));

  const seaLines = SEAS.map(([name, lon, lat, rot, size]) => {
    const [x, y] = project(lon, lat);
    const transform = rot ? ` transform="rotate(${rot} ${fmt(x)} ${fmt(y)})"` : '';
    const cls = size ? size.split(' ').map((m) => ` sea-chart-sea--${m}`).join('') : '';
    return `  <text class="sea-chart-sea${cls}" x="${fmt(x)}" y="${fmt(y)}"${transform}>${esc(name)}</text>`;
  });

  /* Depth contours: widest first, alternating contour and sea. */
  const DEPTHS = [26, 11];
  const depthLines = [];
  for (const w of DEPTHS) {
    depthLines.push(`  <use href="#sea-chart-land" class="sea-chart-contour" stroke-width="${w}"/>`);
    depthLines.push(`  <use href="#sea-chart-land" class="sea-chart-water" stroke-width="${w - 2}"/>`);
  }

  return [
    `<svg class="sea-chart-svg" viewBox="0 0 ${VIEW.width} ${VIEW.height}" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="sea-chart-title sea-chart-desc">`,
    `<title id="sea-chart-title">Chart of Europe: from Brescia to San Sebastián</title>`,
    `<desc id="sea-chart-desc">${esc(desc)}</desc>`,
    `<defs><path id="sea-chart-land" d="${landPath(topo)}"/></defs>`,
    `<rect class="sea-chart-sea-fill" width="${VIEW.width}" height="${VIEW.height}"/>`,
    '<g class="sea-chart-depths" aria-hidden="true">',
    ...depthLines,
    '</g>',
    `<use href="#sea-chart-land" class="sea-chart-land"/>`,
    ...graticule(),
    '<g class="sea-chart-seas" aria-hidden="true">',
    ...seaLines,
    '</g>',
    ...compass(),
    '<g class="sea-chart-ports">',
    ...portLines,
    '</g>',
    '<g class="sea-chart-route">',
    `  <path class="sea-chart-route-line" d="${route}"/>`,
    ...legLines,
    '</g>',
    '<g class="sea-chart-homes">',
    ...homeLines,
    '</g>',
    '</svg>',
  ].join('\n');
}

/* ─── travel.html ────────────────────────────────────────────────────────── */

export function renderTravelHtml(html, svg = buildSeaChart()) {
  const start = `<!-- ${MARKER} -->`;
  const end = `<!-- /${MARKER} -->`;
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e === -1) throw new Error(`travel.html: missing ${start} / ${end} markers`);
  const lineStart = html.lastIndexOf('\n', s) + 1;
  const indent = html.slice(lineStart, s);
  const body = svg.split('\n').map((l) => indent + l).join('\n');
  return `${html.slice(0, s)}${start}\n${body}\n${indent}${html.slice(e)}`;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage:
  node scripts/generate-sea-chart.mjs [options]

Builds the nautical chart on travel.html from data/land-50m.json, the CV's
places and career (data/cv.js) and the travel pins (data/locations.js).

Options:
  --dry-run   Report whether travel.html would change; write nothing
  -h, --help  Show this help
`);
    return;
  }
  const before = fs.readFileSync(TRAVEL, 'utf8');
  const after = renderTravelHtml(before);
  if (after === before) {
    console.log('✓ travel.html chart already up to date');
    return;
  }
  if (argv.includes('--dry-run')) {
    console.log('[dry] travel.html chart would be updated');
    return;
  }
  fs.writeFileSync(TRAVEL, after);
  const kb = (buildSeaChart().length / 1024).toFixed(1);
  console.log(`✓ updated travel.html (chart ${kb} KB)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
