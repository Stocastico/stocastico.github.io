'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadEuropeMapClass(env) {
  const code = fs.readFileSync(path.join(ROOT, 'js', 'europe-map.js'), 'utf8');
  vm.createContext(env);
  vm.runInContext(`${code}\n;globalThis.__EuropeMap2D = EuropeMap2D;`, env);
  return env.__EuropeMap2D;
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

test('EuropeMap2D: hover tooltip shows pin metadata', () => {
  const { canvas } = createCanvasAndContext();
  const tooltip = createTooltip();

  const env = {
    LOCATIONS: { pins: [] },
    document: {
      hidden: false,
      getElementById(id) { return id === 'europe-tooltip' ? tooltip : null; },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame() { return 1; },
    console,
  };

  const EuropeMap2D = loadEuropeMapClass(env);
  const map = new EuropeMap2D(canvas);
  map.mouse = { x: 100, y: 120 };

  map._showTooltip({ type: 'worktrip', name: 'Berlin', info: 'Conference' });

  assert.equal(tooltip._refs.etType.textContent, 'Worktrip');
  assert.equal(tooltip._refs.etName.textContent, 'Berlin');
  assert.equal(tooltip._refs.etInfo.textContent, '');
  assert.equal(tooltip.classList.contains('visible'), true);
});

test('EuropeMap2D: drawPin uses valid rgba halo colors', () => {
  const { canvas, fills } = createCanvasAndContext();
  const tooltip = createTooltip();

  const env = {
    LOCATIONS: { pins: [] },
    document: {
      hidden: false,
      getElementById(id) { return id === 'europe-tooltip' ? tooltip : null; },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame() { return 1; },
    console,
  };

  const EuropeMap2D = loadEuropeMapClass(env);
  const map = new EuropeMap2D(canvas);

  map._drawPin({ type: 'holiday', x: 200, y: 100 }, false);

  assert.equal(fills[0], 'rgba(255, 140, 66, 0.12)');
  assert.equal(fills[1], '#ff8c42');
});

test('EuropeMap2D: builds curved Europe-only trip segments from locations data', () => {
  const { canvas } = createCanvasAndContext();
  const tooltip = createTooltip();

  const env = {
    LOCATIONS: {
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
    },
    document: {
      hidden: false,
      getElementById(id) { return id === 'europe-tooltip' ? tooltip : null; },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame() { return 1; },
    console,
  };

  const EuropeMap2D = loadEuropeMapClass(env);
  const map = new EuropeMap2D(canvas);

  assert.equal(Array.isArray(map.filteredTrips), true);
  assert.equal(map.filteredTrips.length, 2);
  assert.equal(map.filteredTrips[0].name, 'Europe hop');
  assert.equal(map.filteredTrips[0].stroke, '#00d4ff');
  assert.equal(typeof map.filteredTrips[0].cpX, 'number');
  assert.equal(typeof map.filteredTrips[0].cpY, 'number');
  assert.ok(map.filteredTrips[0].cpY < Math.max(map.filteredTrips[0].y0, map.filteredTrips[0].y1));
});

test('EuropeMap2D: drawTrips renders layered neon arcs', () => {
  const { canvas, curves, strokes } = createCanvasAndContext();
  const tooltip = createTooltip();

  const env = {
    LOCATIONS: {
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
    },
    document: {
      hidden: false,
      getElementById(id) { return id === 'europe-tooltip' ? tooltip : null; },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame() { return 1; },
    console,
  };

  const EuropeMap2D = loadEuropeMapClass(env);
  const map = new EuropeMap2D(canvas);
  map._drawTrips(0);

  assert.ok(curves.length >= 3);
  assert.ok(strokes.includes('rgba(130, 229, 255, 0.95)'));
});

test('EuropeMap2D: drawTrips converts hex trip color to rgba glow layers', () => {
  const { canvas, strokes } = createCanvasAndContext();
  const tooltip = createTooltip();

  const env = {
    LOCATIONS: {
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
    },
    document: {
      hidden: false,
      getElementById(id) { return id === 'europe-tooltip' ? tooltip : null; },
      addEventListener() {},
    },
    window: { addEventListener() {} },
    IntersectionObserver: class { observe() {} },
    requestAnimationFrame() { return 1; },
    console,
  };

  const EuropeMap2D = loadEuropeMapClass(env);
  const map = new EuropeMap2D(canvas);
  map._drawTrips(0);

  assert.ok(strokes.includes('rgba(0, 170, 255, 0.18)'));
  assert.ok(strokes.includes('rgba(0, 170, 255, 0.5)'));
});
