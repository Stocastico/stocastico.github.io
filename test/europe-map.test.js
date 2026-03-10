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
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    beginPath() {},
    arc() {},
    fill() { fills.push(this.fillStyle); },
    stroke() {},
    moveTo() {},
    lineTo() {},
    fillRect() {},
    strokeRect() {},
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

  return { canvas, ctx, fills };
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
  assert.equal(tooltip._refs.etInfo.textContent, 'Conference');
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

  assert.equal(fills[0], 'rgba(255, 140, 66, 0.15)');
  assert.equal(fills[1], 'rgba(255, 140, 66, 0.30)');
});
