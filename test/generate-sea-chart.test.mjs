/* The travel page's nautical chart (#193): data/land-50m.json + the CV's places
   + the travel pins → a static SVG baked into travel.html.

   Three kinds of check. Whether the builder tells the truth (every place on the
   route in order, every leg named after the role that started it, every pin in
   the frame drawn once and none outside it). Whether the geometry is the kind
   that fills (closed rings — the mock-up used open polylines and the land came
   out as a scribble). And drift: the committed block must be what the
   generator would write now. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSeaChart, project, chartLegs, chartPorts, renderTravelHtml, VIEW,
} from '../scripts/generate-sea-chart.mjs';
import { CHART_BOUNDS } from '../js/utils.js';
import { isEuropeanSecondaryPin } from '../js/globe.js';
import { CV_PLACES } from '../data/cv.js';
import { LOCATIONS } from '../data/locations.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRAVEL = path.join(ROOT, 'travel.html');
const svg = buildSeaChart();

test('the chart is an inline SVG with a viewBox and an accessible name', () => {
  assert.match(svg, /^<svg\b/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${VIEW.width} ${VIEW.height}"`));
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-labelledby="sea-chart-title sea-chart-desc"/);
  assert.match(svg, /<title id="sea-chart-title">[^<]+<\/title>/);
  assert.match(svg, /<desc id="sea-chart-desc">[^<]+<\/desc>/);
});

test('the frame is landscape', () => {
  const ratio = VIEW.width / VIEW.height;
  assert.ok(ratio > 1.45 && ratio < 1.85, `ratio ${ratio}`);
});

test('the frame reaches south of Crete, so a wide screen\'s crop does not cut southern Europe', () => {
  /* At 35°N the chart stopped just below Sicily; a 1920×1080 screen crops
     the slice top and bottom, and that crop took Crete, the Peloponnese and
     the tip of Andalusia with it (review of #193). */
  assert.ok(CHART_BOUNDS.minLat <= 32, `minLat ${CHART_BOUNDS.minLat}`);
});

test('land is drawn as closed rings, never open polylines', () => {
  const d = svg.match(/<path id="sea-chart-land" d="([^"]+)"/);
  assert.ok(d, 'land path missing');
  const subpaths = d[1].split('M').filter(Boolean);
  assert.ok(subpaths.length > 20, `expected many rings, got ${subpaths.length}`);
  for (const sp of subpaths) assert.match(sp, /Z$/, `open subpath: M${sp.slice(0, 40)}…`);
});

test('the land stays detailed but the whole chart stays small enough to inline', () => {
  const d = svg.match(/<path id="sea-chart-land" d="([^"]+)"/)[1];
  const verts = (d.match(/[ML]/g) || []).length;
  assert.ok(verts > 2500, `coastline over-simplified: ${verts} vertices`);
  assert.ok(svg.length < 90_000, `chart is ${svg.length} bytes`);
});

test('projection: Mercator, north up, frame corners on the viewBox corners', () => {
  const [x0, y0] = project(CHART_BOUNDS.minLon, CHART_BOUNDS.maxLat);
  const [x1, y1] = project(CHART_BOUNDS.maxLon, CHART_BOUNDS.minLat);
  assert.ok(Math.abs(x0) < 0.01 && Math.abs(y0) < 0.01);
  assert.ok(Math.abs(x1 - VIEW.width) < 0.5 && Math.abs(y1 - VIEW.height) < 0.5);
  /* Mercator stretches latitude: 5° up north is taller than 5° down south. */
  const south = project(0, 40)[1] - project(0, 45)[1];
  const north = project(0, 55)[1] - project(0, 60)[1];
  assert.ok(north > south * 1.2);
});

test('the route visits every place from the CV, in order', () => {
  const legs = chartLegs();
  assert.equal(legs.length, CV_PLACES.length - 1);
  assert.equal(legs[0].from.city, CV_PLACES[0].city);
  legs.forEach((leg, i) => assert.equal(leg.to.city, CV_PLACES[i + 1].city));
  for (const p of CV_PLACES) {
    assert.match(svg, new RegExp(`class="sea-chart-home[^"]*"[^>]*data-city="${p.city}"`));
  }
});

test('the legs carry no year and no employer: the chart is about places, not jobs', () => {
  /* They did, in the hazard red, until the review of #193: the career has the
     homepage timeline and the CV; this page is the places. */
  assert.doesNotMatch(svg, /sea-chart-leg-label/);
  for (const leg of chartLegs()) {
    assert.ok(!svg.includes(`>${leg.lab.replace(/&/g, '&amp;')}<`), `${leg.lab} is still lettered on the chart`);
  }
});

test('every home names itself on hover, like the ports do', () => {
  for (const p of CV_PLACES) {
    assert.match(svg, new RegExp(`data-city="${p.city}">\\s*<title>${p.city}`), `${p.city} has no tooltip`);
  }
});

test('every pin inside the frame is on the chart exactly once, none outside it', () => {
  const ports = chartPorts();
  const inFrame = LOCATIONS.pins.filter((p) => p.lat >= CHART_BOUNDS.minLat && p.lat <= CHART_BOUNDS.maxLat
    && p.lon >= CHART_BOUNDS.minLon && p.lon <= CHART_BOUNDS.maxLon
    && (p.type === 'worktrip' || p.type === 'holiday'));
  assert.equal(ports.length, inFrame.length);
  for (const p of inFrame) {
    const n = svg.split(`<title>${p.name}`).length - 1;
    assert.equal(n, 1, `${p.name} drawn ${n} times`);
  }
  for (const p of ports) {
    assert.ok(p.x >= 0 && p.x <= VIEW.width && p.y >= 0 && p.y <= VIEW.height, p.name);
  }
});

test('no pin is lost: each one is on the globe or on the chart', () => {
  /* The globe hides European worktrips/holidays because the chart shows them.
     The two must use the same frame, or a pin falls between them. */
  const charted = new Set(chartPorts().map((p) => p.name));
  for (const p of LOCATIONS.pins) {
    if (isEuropeanSecondaryPin(p)) assert.ok(charted.has(p.name), `${p.name} is on neither`);
  }
});

test('the chart carries sea names, a graticule and a compass rose', () => {
  assert.match(svg, /class="sea-chart-sea[^"]*"[^>]*>Atlantic Ocean</);
  assert.match(svg, /class="sea-chart-sea[^"]*"[^>]*>Mediterranean Sea</);
  assert.match(svg, /class="sea-chart-graticule"/);
  assert.match(svg, /class="sea-chart-compass"/);
});

test('no colour is baked into the chart — it reads the palette through CSS', () => {
  assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b(?![-\w])/i);
  assert.doesNotMatch(svg, /\b(fill|stroke)="(?!none|url)/);
});

test('drift: travel.html carries exactly what the generator would write', () => {
  const committed = fs.readFileSync(TRAVEL, 'utf8');
  assert.equal(committed, renderTravelHtml(committed),
    'travel.html chart is stale — run `npm run generate-sea-chart`');
});
