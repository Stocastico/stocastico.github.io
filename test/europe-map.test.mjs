/* ─────────────────────────────────────────────────────────────────────────────
   Tests for the EuropeMap2D class (js/europe-map.js).
   Run:  node --test test/europe-map.test.mjs
──────────────────────────────────────────────────────────────────────────────*/
import test from 'node:test';
import assert from 'node:assert/strict';

import { EuropeMap2D } from '../js/europe-map.js';
import { THEME, rgba } from '../js/theme.js';

/**
 * Set up the globals the EuropeMap2D class reads (LOCATIONS, document, window,
 * IntersectionObserver, requestAnimationFrame). Returns a `restore` function
 * that puts the previous values back, so tests don't leak state.
 */
function withGlobals(extras, fn) {
  const keys = ['LOCATIONS', 'document', 'window', 'IntersectionObserver', 'requestAnimationFrame'];
  const prev = {};
  for (const k of keys) prev[k] = globalThis[k];
  for (const [k, v] of Object.entries(extras)) globalThis[k] = v;
  try {
    return fn();
  } finally {
    for (const k of keys) globalThis[k] = prev[k];
  }
}

function createCanvasAndContext() {
  const fills = [];
  const strokes = [];
  const curves = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineDashOffset: 0,
    shadowColor: '',
    shadowBlur: 0,
    beginPath() {},
    arc() {},
    fill() { fills.push(this.fillStyle); },
    stroke() { strokes.push(this.strokeStyle); },
    moveTo() {},
    lineTo() {},
    quadraticCurveTo(cpx, cpy, x, y) { curves.push({ cpx, cpy, x, y }); },
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    save() {},
    restore() {},
    clip() {},
    rect() {},
    closePath() {},
  };

  const canvas = {
    tagName: 'CANVAS',
    parentElement: { clientWidth: 900 },
    width: 0,
    height: 0,
    _europe: null,
    getContext() { return ctx; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 450 }; },
    addEventListener() {},
  };

  return { canvas, ctx, fills, strokes, curves };
}

function createTooltip() {
  const etType = { textContent: '' };
  const etName = { textContent: '' };
  const etInfo = { textContent: '' };

  return {
    style: {},
    classList: {
      _on: false,
      add(cls) { if (cls === 'visible') this._on = true; },
      remove(cls) { if (cls === 'visible') this._on = false; },
      contains(cls) { return cls === 'visible' ? this._on : false; },
    },
    querySelector(sel) {
      if (sel === '.et-type') return etType;
      if (sel === '.et-name') return etName;
      if (sel === '.et-info') return etInfo;
      return null;
    },
    _refs: { etType, etName, etInfo },
  };
}

function makeEnv(locations, tooltip) {
  return {
    LOCATIONS: locations,
    document: {
      hidden: false,
      getElementById(id) { return id === 'europe-tooltip' ? tooltip : null; },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame() { return 1; },
  };
}

test('EuropeMap2D: hover tooltip shows pin metadata', () => {
  const { canvas } = createCanvasAndContext();
  const tooltip = createTooltip();

  withGlobals(makeEnv({ pins: [] }, tooltip), () => {
    const map = new EuropeMap2D(canvas);
    map.mouse = { x: 100, y: 120 };

    map._showTooltip({ type: 'worktrip', name: 'Berlin', info: 'Conference' });

    assert.equal(tooltip._refs.etType.textContent, 'Worktrip');
    assert.equal(tooltip._refs.etName.textContent, 'Berlin');
    assert.equal(tooltip._refs.etInfo.textContent, '');
    assert.equal(tooltip.classList.contains('visible'), true);
  });
});

test('EuropeMap2D: drawPin uses valid rgba halo colors', () => {
  const { canvas, fills } = createCanvasAndContext();
  const tooltip = createTooltip();

  withGlobals(makeEnv({ pins: [] }, tooltip), () => {
    const map = new EuropeMap2D(canvas);

    map._drawPin({ type: 'holiday', x: 200, y: 100 }, false);

    /* Pin colours are palette-driven (data/palettes.yaml → js/theme.js). */
    assert.equal(fills[0], rgba(THEME.pins.holiday, 0.12));
    assert.equal(fills[1], THEME.pins.holiday);
  });
});

test('EuropeMap2D: builds curved Europe-only trip segments from locations data', () => {
  const { canvas } = createCanvasAndContext();
  const tooltip = createTooltip();

  const locations = {
    pins: [],
    trips: [
      {
        name: 'Europe hop',
        color: '#00d4ff',
        cities: [
          { name: 'Madrid', lat: 40.41, lon: -3.7 },
          { name: 'Paris', lat: 48.85, lon: 2.35 },
          { name: 'Berlin', lat: 52.52, lon: 13.4 },
        ],
      },
      {
        name: 'Out of bounds',
        color: '#ff8c42',
        cities: [
          { name: 'Tokyo', lat: 35.68, lon: 139.69 },
          { name: 'Osaka', lat: 34.69, lon: 135.5 },
        ],
      },
    ],
  };

  withGlobals(makeEnv(locations, tooltip), () => {
    const map = new EuropeMap2D(canvas);

    assert.equal(Array.isArray(map.filteredTrips), true);
    assert.equal(map.filteredTrips.length, 2);
    assert.equal(map.filteredTrips[0].name, 'Europe hop');
    assert.equal(map.filteredTrips[0].stroke, '#00d4ff');
    assert.equal(typeof map.filteredTrips[0].cpX, 'number');
    assert.equal(typeof map.filteredTrips[0].cpY, 'number');
    assert.ok(map.filteredTrips[0].cpY < Math.max(map.filteredTrips[0].y0, map.filteredTrips[0].y1));
  });
});

test('EuropeMap2D: drawTrips renders layered neon arcs', () => {
  const { canvas, curves, strokes } = createCanvasAndContext();
  const tooltip = createTooltip();

  const locations = {
    pins: [],
    trips: [
      {
        name: 'Europe hop',
        color: '#00d4ff',
        cities: [
          { name: 'Madrid', lat: 40.41, lon: -3.7 },
          { name: 'Paris', lat: 48.85, lon: 2.35 },
        ],
      },
    ],
  };

  withGlobals(makeEnv(locations, tooltip), () => {
    const map = new EuropeMap2D(canvas);
    map._drawTrips(0);

    assert.ok(curves.length >= 3);
    /* Bright moving core — palette-driven (data/palettes.yaml → js/theme.js). */
    assert.ok(strokes.includes(rgba(THEME.globe.coastBright, 0.95)));
  });
});

test('EuropeMap2D: island landmasses are not filled (consistent with the mainland outline)', () => {
  const { canvas, fills } = createCanvasAndContext();
  const tooltip = createTooltip();

  /* A small island ring (Great Britain — longitude span < 90°, so the renderer
     classifies it "local") and the European mainland ring (span ≥ 90°, the
     "global" continent). The mainland is only ever stroked; the island must be
     rendered the same way, otherwise Great Britain shows up as a solid filled
     blob while every neighbouring country is a hollow neon outline. */
  const greatBritain = [
    [-5, 50], [-3, 51], [-1, 53], [0, 55], [-2, 57], [-4, 58], [-5, 56], [-5, 50],
  ];
  const mainland = [
    [-10, 36], [10, 40], [40, 45], [80, 60], [100, 65], [60, 70], [20, 60], [-10, 36],
  ];

  withGlobals(makeEnv({ pins: [] }, tooltip), () => {
    const map = new EuropeMap2D(canvas);
    map._europeRings = [greatBritain, mainland];

    map._drawEuropeBorders();

    assert.ok(!fills.includes(THEME.globe.land),
      'no landmass should be flood-filled — islands must match the mainland outline');
    assert.equal(fills.length, 0,
      'drawing the Europe borders should stroke coastlines only, never fill land');
  });
});

test('EuropeMap2D: drawTrips converts hex trip color to rgba glow layers', () => {
  const { canvas, strokes } = createCanvasAndContext();
  const tooltip = createTooltip();

  const locations = {
    pins: [],
    trips: [
      {
        name: 'Europe hop',
        color: '#0af',
        cities: [
          { name: 'Madrid', lat: 40.41, lon: -3.7 },
          { name: 'Paris', lat: 48.85, lon: 2.35 },
        ],
      },
    ],
  };

  withGlobals(makeEnv(locations, tooltip), () => {
    const map = new EuropeMap2D(canvas);
    map._drawTrips(0);

    assert.ok(strokes.includes('rgba(0, 170, 255, 0.18)'));
    assert.ok(strokes.includes('rgba(0, 170, 255, 0.5)'));
  });
});

test('EuropeMap2D: tooltip uses a fresh bounding rect after a post-construction layout shift', () => {
  /* Regression: the cursor→canvas offset must be computed against the canvas's
     *current* viewport position. If the map's rect is cached at construction
     and the page reflows afterwards (web fonts / images above the map loading)
     WITHOUT firing scroll or resize, a stale rect offsets the tooltip — the
     "tooltip in the wrong place" bug. The rect must be (re)read lazily. */
  const { ctx } = createCanvasAndContext();
  const listeners = {};
  let rect = { left: 0, top: 0, width: 900, height: 450 };

  const canvas = {
    tagName: 'CANVAS',
    parentElement: { clientWidth: 900 },
    width: 0,
    height: 0,
    _europe: null,
    getContext() { return ctx; },
    getBoundingClientRect() { return rect; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  };
  const tooltip = createTooltip();

  withGlobals(makeEnv({ pins: [] }, tooltip), () => {
    const map = new EuropeMap2D(canvas);

    /* Page reflows after construction — canvas pushed 100px down, no event. */
    rect = { left: 0, top: 100, width: 900, height: 450 };

    const move = (listeners.mousemove || [])[0];
    assert.ok(typeof move === 'function', 'mousemove handler should be registered');
    move({ clientX: 100, clientY: 200 });

    /* Fresh rect → cssY = 200 - 100 = 100. Stale (top:0) → 200. */
    assert.equal(map._cssMouseY, 100);
    assert.equal(map._cssMouseX, 100);
  });
});
