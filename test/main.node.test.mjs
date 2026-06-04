import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import {
  formatIsoDate,
  renderPublications,
  setFooterYear,
  initNavbar,
  initMobileMenu,
  initScrollReveal,
  initCounters,
  animateCounter,
  decodeBase64,
  getObfuscatedContactEmail,
  initEmailObfuscation,
  renderCV,
  renderSkills,
  initTheme,
  initCardTilt,
  initSkillBars,
  initTimelineScroll3D,
  initAnimatedFavicon,
  initScroll3D,
  initBackToTop,
  NoiseGradient,
  initCardFlip,
  renderProjects,
  PROJECTS_MAX_HOMEPAGE,
  initCommandPalette,
} from '../js/main.js';
/* Three.js-backed classes are now imported from their source modules — main.js
   dynamically imports them so Three.js is not in the per-page bundle. */
import { geocodeLocations, Globe3D, GlobeFallback2D } from '../js/globe.js';
import { NeuralNetwork, NeuralNetwork2D } from '../js/neural-net.js';
import { __setThreeForTests, __resetThreeForTests } from '../js/three-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function makeClassList(initial = []) {
  const s = new Set(initial);
  return {
    add(cls) { s.add(cls); },
    remove(cls) { s.delete(cls); },
    toggle(cls, force) {
      if (typeof force === 'boolean') {
        if (force) s.add(cls);
        else s.delete(cls);
        return force;
      }
      if (s.has(cls)) { s.delete(cls); return false; }
      s.add(cls); return true;
    },
    contains(cls) { return s.has(cls); },
  };
}

function loadConstFromScript(relPath, constName) {
  const abs = path.join(ROOT, relPath);
  /* The data files are now ES modules (export const X = ...).  vm.runInContext
     runs scripts, not modules, so strip the `export` keyword first. */
  const code = fs.readFileSync(abs, 'utf8').replace(/^export /gm, '');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${code}\n;globalThis.__out = ${constName};`, context, { filename: abs });
  return context.__out;
}

test('formatIsoDate renders ISO date without timezone shift', () => {
  assert.equal(formatIsoDate('2024-11-20'), '20 November 2024');
  assert.equal(formatIsoDate('2024-07-18'), '18 July 2024');
});

test('formatIsoDate gracefully handles invalid values', () => {
  assert.equal(formatIsoDate(''), '');
  assert.equal(formatIsoDate('invalid-date'), 'invalid-date');
  assert.equal(formatIsoDate(undefined), '');
});

test('geocodeLocations does not call fetch when all coordinates are present', async () => {
  const sample = {
    pins: [{ name: 'A', lat: 1, lon: 2 }],
    regions: [{ name: 'R', lat: 3, lon: 4 }],
    trips: [{ cities: [{ name: 'T', lat: 5, lon: 6 }] }],
  };
  let calls = 0;
  const prevFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return { json: async () => [] };
  };
  try {
    await geocodeLocations(sample);
    assert.equal(calls, 0);
  } finally {
    global.fetch = prevFetch;
  }
});

test('geocodeLocations fills coordinates on successful lookup', async () => {
  const sample = { pins: [{ name: 'Paris, France', info: 'Holiday' }] };
  const prevFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [{ lat: '48.8566', lon: '2.3522' }],
  });
  try {
    await geocodeLocations(sample);
    assert.equal(sample.pins[0].lat, 48.8566);
    assert.equal(sample.pins[0].lon, 2.3522);
    assert.equal(sample.pins[0]._skip, undefined);
  } finally {
    global.fetch = prevFetch;
  }
});

test('geocodeLocations marks item as skipped on HTTP error response', async () => {
  const sample = { pins: [{ name: 'Paris, France', info: 'Holiday' }] };
  const prevFetch = global.fetch;
  /* A 429/5xx returns ok:false; res.json() would parse a non-JSON body —
     the guard must skip the pin rather than throw an unhandled error. */
  global.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => { throw new Error('Unexpected token < in JSON'); },
  });
  try {
    await geocodeLocations(sample);
    assert.equal(sample.pins[0]._skip, true);
    assert.equal(sample.pins[0].lat, undefined);
    assert.equal(sample.pins[0].lon, undefined);
  } finally {
    global.fetch = prevFetch;
  }
});

test('geocodeLocations marks item as skipped on failed lookup', async () => {
  const sample = { pins: [{ name: 'XXXXX_INVALID_LOCATION', info: 'Skip me' }] };
  const prevFetch = global.fetch;
  global.fetch = async () => ({ json: async () => [] });
  try {
    await geocodeLocations(sample);
    assert.equal(sample.pins[0]._skip, true);
    assert.equal(sample.pins[0].lat, undefined);
    assert.equal(sample.pins[0].lon, undefined);
  } finally {
    global.fetch = prevFetch;
  }
});

test('geocodeLocations passes an AbortSignal to fetch so a hung request times out', async () => {
  const prevFetch = global.fetch;
  const calls = [];
  global.fetch = (url, opts) => {
    calls.push({ url, opts });
    return Promise.resolve({ ok: true, json: () => Promise.resolve([{ lat: '1', lon: '2' }]) });
  };
  try {
    const sample = { pins: [{ name: 'Nowhere' }], regions: [], trips: [] };
    await geocodeLocations(sample);
    assert.equal(calls.length, 1, 'should issue one lookup');
    assert.ok(calls[0].opts && calls[0].opts.signal,
      'fetch must receive an options object carrying an AbortSignal (timeout)');
  } finally {
    global.fetch = prevFetch;
  }
});

test('PUBLICATIONS entries have required fields', () => {
  const publications = loadConstFromScript('data/publications.js', 'PUBLICATIONS');
  assert.ok(Array.isArray(publications));
  assert.ok(publications.length > 0);
  for (const pub of publications) {
    assert.ok(pub.year);
    assert.ok(pub.title);
    assert.ok(pub.authors);
    assert.ok(pub.venue);
  }
});

test('LOCATIONS no longer require runtime geocoding in production data', () => {
  const locations = loadConstFromScript('data/locations.js', 'LOCATIONS');
  const all = [
    ...(locations.pins || []),
    ...(locations.regions || []),
    ...((locations.trips || []).flatMap((t) => t.cities || [])),
  ];
  assert.ok(all.length > 0);
  for (const loc of all) {
    assert.equal(typeof loc.lat, 'number', `Missing lat for ${loc.name}`);
    assert.equal(typeof loc.lon, 'number', `Missing lon for ${loc.name}`);
  }
});

test('renderPublications injects publication cards into the container', () => {
  const list = { innerHTML: '' };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'publications-list') return list;
      return null;
    },
  };
  try {
    renderPublications([{
      year: '2025',
      title: 'Paper title',
      authors: 'A. Author',
      venue: 'Conference',
      url: 'https://example.com',
    }]);
    assert.match(list.innerHTML, /Paper title/);
    assert.match(list.innerHTML, /Open paper: Paper title/);
  } finally {
    global.document = prevDocument;
  }
});


test('setFooterYear writes current year', () => {
  const el = { textContent: '' };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'footer-year') return el;
      return null;
    },
  };
  try {
    setFooterYear();
    assert.equal(el.textContent, new Date().getFullYear());
  } finally {
    global.document = prevDocument;
  }
});

test('initNavbar toggles scrolled class on scroll events', () => {
  const nav = { classList: makeClassList() };
  const listeners = new Map();
  const prevDocument = global.document;
  const prevWindow = global.window;
  global.document = {
    getElementById(id) {
      if (id === 'navbar') return nav;
      return null;
    },
  };
  global.window = {
    scrollY: 0,
    addEventListener(type, fn) { listeners.set(type, fn); },
  };
  try {
    initNavbar();
    global.window.scrollY = 30;
    listeners.get('scroll')();
    assert.equal(nav.classList.contains('scrolled'), true);
    global.window.scrollY = 0;
    listeners.get('scroll')();
    assert.equal(nav.classList.contains('scrolled'), false);
  } finally {
    global.document = prevDocument;
    global.window = prevWindow;
  }
});

test('initMobileMenu toggles classes and aria-expanded on click', () => {
  const toggleHandlers = {};
  const linkHandlers = [];
  const toggle = {
    classList: makeClassList(),
    attrs: {},
    addEventListener(type, fn) { toggleHandlers[type] = fn; },
    setAttribute(name, val) { this.attrs[name] = val; },
  };
  const links = {
    classList: makeClassList(),
    querySelectorAll() {
      return [
        { addEventListener(type, fn) { if (type === 'click') linkHandlers.push(fn); } },
      ];
    },
  };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'nav-toggle') return toggle;
      if (id === 'nav-links') return links;
      return null;
    },
  };
  try {
    initMobileMenu();
    toggleHandlers.click();
    assert.equal(toggle.classList.contains('open'), true);
    assert.equal(links.classList.contains('open'), true);
    assert.equal(toggle.attrs['aria-expanded'], true);

    linkHandlers[0]();
    assert.equal(toggle.classList.contains('open'), false);
    assert.equal(links.classList.contains('open'), false);
    assert.equal(toggle.attrs['aria-expanded'], false);
  } finally {
    global.document = prevDocument;
  }
});

test('initScrollReveal marks intersecting elements as visible', async () => {
  const elements = [{ dataset: { delay: '0' }, classList: makeClassList() }];
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  let observeCb;
  global.document = {
    querySelectorAll(sel) {
      if (sel === '[data-animate]') return elements;
      return [];
    },
  };
  global.IntersectionObserver = class {
    constructor(cb) { observeCb = cb; }
    observe() {}
    unobserve() {}
  };
  try {
    initScrollReveal();
    observeCb([{ isIntersecting: true, target: elements[0] }]);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(elements[0].classList.contains('visible'), true);
  } finally {
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
  }
});

test('initCounters triggers animateCounter when counter intersects', () => {
  const counter = { dataset: { count: '42' }, textContent: '0' };
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;
  let observeCb;
  global.document = {
    querySelectorAll(sel) {
      if (sel === '.stat-number[data-count]') return [counter];
      return [];
    },
  };
  global.IntersectionObserver = class {
    constructor(cb) { observeCb = cb; }
    observe() {}
    unobserve() {}
  };
  global.performance = { now: () => 0 };
  global.requestAnimationFrame = (fn) => { fn(1800); return 1; };
  try {
    initCounters();
    observeCb([{ isIntersecting: true, target: counter }]);
    assert.equal(counter.textContent, 42);
  } finally {
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.performance = prevPerf;
  }
});

test('animateCounter reaches target value', () => {
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;
  const el = { textContent: 0 };
  let frames = 0;
  global.performance = { now: () => 0 };
  global.requestAnimationFrame = (fn) => {
    frames += 1;
    fn(frames === 1 ? 1000 : 2000);
    return frames;
  };
  try {
    animateCounter(el, 100);
    assert.equal(el.textContent, 100);
  } finally {
    global.requestAnimationFrame = prevRAF;
    global.performance = prevPerf;
  }
});

test('Globe3D._tripPos chooses the expected segment based on length', () => {
  const c1 = { getPoint: (t) => ({ seg: 1, t }) };
  const c2 = { getPoint: (t) => ({ seg: 2, t }) };
  const anim = {
    curves: [c1, c2],
    segLens: [10, 30],
    total: 40,
  };

  const pA = Globe3D.prototype._tripPos(anim, 0.125); // rem=5 -> segment 1
  assert.equal(pA.seg, 1);
  assert.ok(pA.t > 0 && pA.t < 1);

  const pB = Globe3D.prototype._tripPos(anim, 0.75); // rem=30 -> segment 2
  assert.equal(pB.seg, 2);
  assert.ok(pB.t > 0 && pB.t <= 1);
});

function createMinimalThree() {
  class Vector2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    distanceTo(v) { return this.clone().sub(v).length(); }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    cross(v) {
      const x = this.y * v.z - this.z * v.y;
      const y = this.z * v.x - this.x * v.z;
      const z = this.x * v.y - this.y * v.x;
      this.x = x; this.y = y; this.z = z;
      return this;
    }
  }
  class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; }
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; this.drawRange = { start: 0, count: 0 }; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setFromPoints(points) {
      this.points = points;
      const arr = new Float32Array(points.length * 3);
      this.setAttribute('position', new BufferAttribute(arr, 3));
      return this;
    }
    setDrawRange(start, count) { this.drawRange = { start, count }; }
  }
  class Scene {
    constructor() { this.children = []; }
    add(obj) { this.children.push(obj); }
  }
  class PerspectiveCamera {
    constructor() {
      this.aspect = 1;
      this.position = { z: 0 };
    }
    updateProjectionMatrix() {}
  }
  class WebGLRenderer {
    constructor() { this.capabilities = { getMaxAnisotropy: () => 1 }; }
    setSize() {}
    setPixelRatio() {}
    setClearColor() {}
    render() {}
  }
  class Group {
    constructor() {
      this.children = [];
      this.rotation = { x: 0, y: 0 };
    }
    add(obj) { this.children.push(obj); }
  }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.position = new Vector3();
      this.quaternion = { setFromUnitVectors() {} };
      this.scale = {
        setScalar() {},
        set() {},
      };
      this.userData = {};
    }
  }
  class Color {
    constructor(v) { this.value = v; }
    set(v) { this.value = v; }
  }
  class Raycaster {
    constructor() { this.params = { Mesh: {} }; }
    setFromCamera() {}
    intersectObjects() { return []; }
  }
  class TextureLoader {
    load(_url, onLoad, _onProgress, _onError) {
      if (onLoad) onLoad({});
    }
  }
  class QuadraticBezierCurve3 {
    constructor(p0, p1, p2) { this.p0 = p0; this.p1 = p1; this.p2 = p2; }
    getPoint(t) {
      const omt = 1 - t;
      return new Vector3(
        omt * omt * this.p0.x + 2 * omt * t * this.p1.x + t * t * this.p2.x,
        omt * omt * this.p0.y + 2 * omt * t * this.p1.y + t * t * this.p2.y,
        omt * omt * this.p0.z + 2 * omt * t * this.p1.z + t * t * this.p2.z,
      );
    }
    getPoints(n) {
      const out = [];
      for (let i = 0; i <= n; i++) out.push(this.getPoint(i / Math.max(n, 1)));
      return out;
    }
    getLength() {
      let len = 0;
      let prev = this.getPoint(0);
      for (let i = 1; i <= 12; i++) {
        const cur = this.getPoint(i / 12);
        len += cur.distanceTo(prev);
        prev = cur;
      }
      return len;
    }
  }

  return {
    Vector2,
    Vector3,
    BufferAttribute,
    BufferGeometry,
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    PointsMaterial: class { constructor(opts) { Object.assign(this, opts); } },
    Points: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } },
    LineBasicMaterial: class { constructor(opts) { Object.assign(this, opts); } },
    LineSegments: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } },
    CanvasTexture: class { constructor(canvas) { this.canvas = canvas; } },
    MeshPhongMaterial: class {
      constructor(opts) {
        Object.assign(this, opts);
        if (!this.color || typeof this.color.set !== 'function') {
          this.color = { set() {} };
        }
        this.needsUpdate = false;
      }
    },
    MeshBasicMaterial: class { constructor(opts) { Object.assign(this, opts); } },
    Mesh,
    SphereGeometry: class { constructor() { this.type = 'SphereGeometry'; } },
    CircleGeometry: class { constructor() { this.type = 'CircleGeometry'; } },
    RingGeometry: class { constructor() { this.type = 'RingGeometry'; } },
    Line: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = new Vector3(); } },
    AmbientLight: class {},
    DirectionalLight: class { constructor() { this.position = { set() {} }; } },
    PointLight: class { constructor() { this.position = { set() {} }; } },
    Group,
    Raycaster,
    TextureLoader,
    Color,
    QuadraticBezierCurve3,
    AdditiveBlending: 1,
    BackSide: 1,
    DoubleSide: 2,
  };
}

test('NeuralNetwork constructs and updates with mocked THREE', () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevCancel = global.cancelAnimationFrame;

  __setThreeForTests(createMinimalThree());
  global.window = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2,
    addEventListener() {},
  };
  global.document = {
    hidden: false,
    addEventListener() {},
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            createRadialGradient() { return { addColorStop() {} }; },
            fillRect() {},
            fillStyle: '',
          };
        },
      };
    },
  };
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};

  try {
    const nn = new NeuralNetwork({});
    assert.ok(nn.points);
    assert.ok(nn.lines);
    assert.ok(nn.lineGeo);

    /* destroy() must free GPU resources (geometries, materials and the glow
       texture) and drop the renderer/scene refs — otherwise they leak on every
       pagehide / bfcache eviction. The mock objects have no dispose() of their
       own, so we attach spies and assert destroy() walks the scene. */
    const disposed = [];
    const spy = (obj, tag) => { if (obj) obj.dispose = () => disposed.push(tag); };
    spy(nn.points.geometry, 'points.geo');
    spy(nn.points.material, 'points.mat');
    spy(nn.points.material && nn.points.material.map, 'points.map');
    spy(nn.lines.geometry, 'lines.geo');
    spy(nn.lines.material, 'lines.mat');
    nn.renderer.dispose = () => disposed.push('renderer');

    nn.destroy();

    assert.ok(disposed.includes('points.geo'), 'destroy must dispose the points geometry');
    assert.ok(disposed.includes('points.mat'), 'destroy must dispose the points material');
    assert.ok(disposed.includes('points.map'), 'destroy must dispose the glow texture');
    assert.ok(disposed.includes('lines.geo'), 'destroy must dispose the lines geometry');
    assert.ok(disposed.includes('renderer'), 'destroy must dispose the renderer');
    assert.equal(nn.scene, null, 'destroy must drop the scene ref');
    assert.equal(nn.renderer, null, 'destroy must drop the renderer ref');
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCancel;
    __resetThreeForTests();
  }
});

test('NeuralNetwork fires onReady once after the first painted frame', () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevCancel = global.cancelAnimationFrame;

  __setThreeForTests(createMinimalThree());
  global.window = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2,
    addEventListener() {},
  };
  global.document = {
    hidden: false,
    addEventListener() {},
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            createRadialGradient() { return { addColorStop() {} }; },
            fillRect() {},
            fillStyle: '',
          };
        },
      };
    },
  };
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() {}
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};

  try {
    let readyCalls = 0;
    const nn = new NeuralNetwork({}, () => { readyCalls += 1; });
    assert.equal(readyCalls, 1, 'onReady must fire after the first frame paints');

    /* Subsequent frames must not re-fire onReady (the hero only fades in once). */
    nn._animate();
    assert.equal(readyCalls, 1, 'onReady must fire exactly once');
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCancel;
    __resetThreeForTests();
  }
});

test('Globe3D constructs with mocked THREE and location data', () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;
  const prevDpr = global.devicePixelRatio;
  const prevLocations = global.LOCATIONS;

  __setThreeForTests(createMinimalThree());
  global.LOCATIONS = {
    pins: [{ type: 'lived', name: 'A', lat: 40, lon: 2, info: 'Home' }],
    regions: [{ name: 'R', lat: 30, lon: 5, radius: 1.0, info: 'Region' }],
    trips: [{
      name: 'Trip',
      cities: [{ name: 'X', lat: 10, lon: 10 }, { name: 'Y', lat: 20, lon: 20 }],
    }],
  };
  const tooltip = {
    classList: makeClassList(),
    style: {},
    querySelector() { return { textContent: '', style: {} }; },
  };
  const ctx2d = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() {},
    save() {}, restore() {}, rect() {}, clip() {},
  };
  global.document = {
    hidden: false,
    addEventListener() {},
    getElementById(id) { return id === 'globe-tooltip' ? tooltip : null; },
    createElement(tag) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext() { return ctx2d; } };
      return {};
    },
  };
  global.window = { addEventListener() {} };
  global.performance = { now: () => 1000 };
  global.devicePixelRatio = 2;
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
  };
  global.requestAnimationFrame = () => 1;

  const canvas = {
    parentElement: { clientWidth: 680, clientHeight: 340 },
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 680, height: 340 }; },
  };

  try {
    const globe = new Globe3D(canvas);
    assert.ok(globe.scene);
    assert.ok(globe.pivot);
    assert.ok(globe.markerMeshes.length > 0);
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.performance = prevPerf;
    global.devicePixelRatio = prevDpr;
    __resetThreeForTests();
    global.LOCATIONS = prevLocations;
  }
});

test('Globe3D: European worktrip/holiday pins are excluded from 3D globe markers', () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;
  const prevDpr = global.devicePixelRatio;
  const prevLocations = global.LOCATIONS;

  __setThreeForTests(createMinimalThree());
  global.LOCATIONS = {
    pins: [
      { type: 'lived', name: 'Bilbao', lat: 43.26, lon: -2.93, info: 'home' },
      { type: 'worktrip', name: 'Berlin', lat: 52.52, lon: 13.40, info: 'eu worktrip' },
      { type: 'holiday', name: 'Paris', lat: 48.86, lon: 2.35, info: 'eu holiday' },
      { type: 'worktrip', name: 'Tokyo', lat: 35.68, lon: 139.69, info: 'non-eu worktrip' },
    ],
    regions: [],
    trips: [],
  };

  const tooltip = {
    classList: makeClassList(),
    style: {},
    querySelector() { return { textContent: '', style: {} }; },
  };
  const ctx2d = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() {}, rect() {}, clip() {}, save() {}, restore() {},
  };

  global.document = {
    hidden: false,
    addEventListener() {},
    getElementById(id) { return id === 'globe-tooltip' ? tooltip : null; },
    createElement(tag) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext() { return ctx2d; } };
      return {};
    },
  };
  global.window = { addEventListener() {} };
  global.performance = { now: () => 1000 };
  global.devicePixelRatio = 2;
  global.IntersectionObserver = class { observe() {} };
  global.requestAnimationFrame = () => 1;

  const canvas = {
    parentElement: { clientWidth: 680, clientHeight: 340 },
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 680, height: 340 }; },
  };

  try {
    const globe = new Globe3D(canvas);
    const names = globe.markerMeshes.map((m) => m.userData?.name).filter(Boolean);
    assert.equal(names.includes('Berlin'), false);
    assert.equal(names.includes('Paris'), false);
    assert.equal(names.includes('Tokyo'), true);
    assert.equal(names.includes('Bilbao'), true);
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.performance = prevPerf;
    global.devicePixelRatio = prevDpr;
    __resetThreeForTests();
    global.LOCATIONS = prevLocations;
  }
});

/* ─── Email obfuscation / blur-reveal tests ─────────────── */

test('decodeBase64 decodes valid Base64 strings', () => {
  assert.equal(decodeBase64(btoa('hello')), 'hello');
  assert.equal(decodeBase64(btoa('user@example.com')), 'user@example.com');
});

test('decodeBase64 returns empty string for invalid input', () => {
  assert.equal(decodeBase64('!!!'), '');
  assert.equal(decodeBase64(''), '');
  assert.equal(decodeBase64(null), '');
  assert.equal(decodeBase64(undefined), '');
});

test('getObfuscatedContactEmail reconstructs email from DOM data attributes', () => {
  const prevDoc = global.document;
  global.document = {
    querySelector(sel) {
      if (sel === '.contact-email-obfuscated') {
        return {
          dataset: {
            emailUser: btoa('stefano'),
            emailDomain: btoa('example.com'),
          },
        };
      }
      return null;
    },
  };
  try {
    assert.equal(getObfuscatedContactEmail(), 'stefano@example.com');
  } finally {
    global.document = prevDoc;
  }
});

test('getObfuscatedContactEmail returns empty string when card is missing', () => {
  const prevDoc = global.document;
  global.document = { querySelector() { return null; } };
  try {
    assert.equal(getObfuscatedContactEmail(), '');
  } finally {
    global.document = prevDoc;
  }
});

test('initEmailObfuscation sets blurred email text on load', () => {
  const prevDoc = global.document;
  const valueEl = { textContent: 'placeholder' };
  const listeners = {};
  const card = {
    dataset: {
      emailUser: btoa('test'),
      emailDomain: btoa('example.com'),
      emailRevealed: 'false',
    },
    querySelector(sel) {
      if (sel === '.contact-value') return valueEl;
      return null;
    },
    setAttribute() {},
    addEventListener(evt, fn) { listeners[evt] = fn; },
  };
  global.document = {
    querySelector(sel) {
      if (sel === '.contact-email-obfuscated') return card;
      return null;
    },
  };
  try {
    initEmailObfuscation();
    /* Email text should be set immediately (shown blurred via CSS) */
    assert.equal(valueEl.textContent, 'test@example.com');
    /* Card should still be in unrevealed state */
    assert.equal(card.dataset.emailRevealed, 'false');
  } finally {
    global.document = prevDoc;
  }
});

test('initEmailObfuscation reveals email and sets mailto on click', () => {
  const prevDoc = global.document;
  const valueEl = { textContent: 'placeholder' };
  const listeners = {};
  const attrs = {};
  const card = {
    dataset: {
      emailUser: btoa('click'),
      emailDomain: btoa('test.com'),
      emailRevealed: 'false',
    },
    querySelector(sel) {
      if (sel === '.contact-value') return valueEl;
      return null;
    },
    setAttribute(k, v) { attrs[k] = v; },
    addEventListener(evt, fn) { listeners[evt] = fn; },
  };
  global.document = {
    querySelector(sel) {
      if (sel === '.contact-email-obfuscated') return card;
      return null;
    },
  };
  try {
    initEmailObfuscation();
    /* Simulate click */
    listeners.click({ preventDefault() {} });
    assert.equal(card.dataset.emailRevealed, 'true');
    assert.equal(attrs.href, 'mailto:click@test.com');
    assert.match(attrs['aria-label'], /click@test\.com/);
  } finally {
    global.document = prevDoc;
  }
});

test('initEmailObfuscation reveals email on Enter key', () => {
  const prevDoc = global.document;
  const valueEl = { textContent: '' };
  const listeners = {};
  const attrs = {};
  const card = {
    dataset: {
      emailUser: btoa('key'),
      emailDomain: btoa('test.com'),
      emailRevealed: 'false',
    },
    querySelector(sel) {
      if (sel === '.contact-value') return valueEl;
      return null;
    },
    setAttribute(k, v) { attrs[k] = v; },
    addEventListener(evt, fn) { listeners[evt] = fn; },
  };
  global.document = {
    querySelector(sel) {
      if (sel === '.contact-email-obfuscated') return card;
      return null;
    },
  };
  try {
    initEmailObfuscation();
    listeners.keydown({ key: 'Enter', preventDefault() {} });
    assert.equal(card.dataset.emailRevealed, 'true');
    assert.equal(attrs.href, 'mailto:key@test.com');
  } finally {
    global.document = prevDoc;
  }
});

/* ─── renderCV tests ─────────────────────────────────────── */

test('renderCV renders merged career and education entries sorted by year', () => {
  const timeline = { innerHTML: '' };
  const prevDoc = global.document;
  global.document = {
    getElementById(id) { return id === 'cv-timeline' ? timeline : null; },
  };
  try {
    renderCV(
      [{
        year: '2020–2023',
        role: 'Engineer',
        company: 'Acme',
        location: 'Berlin',
        description: 'Built things',
        tags: ['Python', 'ML'],
      }],
      [{
        year: '2018',
        degree: 'MSc CS',
        institution: 'MIT',
        location: 'Boston',
      }],
    );
    /* Career entry should appear first (2020 > 2018) */
    assert.match(timeline.innerHTML, /Engineer/);
    assert.match(timeline.innerHTML, /Acme/);
    assert.match(timeline.innerHTML, /Berlin/);
    assert.match(timeline.innerHTML, /Built things/);
    assert.match(timeline.innerHTML, /Python/);
    assert.match(timeline.innerHTML, /MSc CS/);
    assert.match(timeline.innerHTML, /MIT/);
    /* Career row should come before education row */
    const careerIdx = timeline.innerHTML.indexOf('tl-row--career');
    const eduIdx = timeline.innerHTML.indexOf('tl-row--education');
    assert.ok(careerIdx < eduIdx, 'Career (2020) should be before education (2018)');
  } finally {
    global.document = prevDoc;
  }
});

test('renderCV does nothing when timeline element is missing', () => {
  const prevDoc = global.document;
  global.document = { getElementById() { return null; } };
  try {
    renderCV(); /* should not throw */
  } finally {
    global.document = prevDoc;
  }
});

test('renderCV with empty arrays clears the timeline without throwing', () => {
  const timeline = { innerHTML: 'old' };
  const prevDoc = global.document;
  global.document = {
    getElementById(id) { return id === 'cv-timeline' ? timeline : null; },
  };
  try {
    renderCV([], []);
    assert.equal(timeline.innerHTML, '');
  } finally {
    global.document = prevDoc;
  }
});

/* ─── renderSkills tests ─────────────────────────────────── */

test('renderSkills renders technical bars and language pills', () => {
  const container = { innerHTML: '' };
  const prevDoc = global.document;
  global.document = {
    getElementById(id) { return id === 'cv-skills' ? container : null; },
  };
  try {
    renderSkills({
      technical: [{ name: 'Python', level: 90 }],
      leadership: [{ name: 'Mentoring', level: 75 }],
      languages: [{ name: 'English', proficiency: 'Native' }],
    });
    assert.match(container.innerHTML, /Python/);
    assert.match(container.innerHTML, /skill-bar-fill/);
    assert.match(container.innerHTML, /--pct:90%/);
    assert.match(container.innerHTML, /Mentoring/);
    assert.match(container.innerHTML, /English/);
    assert.match(container.innerHTML, /Native/);
    assert.match(container.innerHTML, /lang-item/);
  } finally {
    global.document = prevDoc;
  }
});

test('renderSkills does nothing when container is missing', () => {
  const prevDoc = global.document;
  global.document = { getElementById() { return null; } };
  try {
    renderSkills(); /* should not throw */
  } finally {
    global.document = prevDoc;
  }
});

test('renderSkills renders empty when skills has no entries', () => {
  const container = { innerHTML: 'old' };
  const prevDoc = global.document;
  global.document = {
    getElementById(id) { return id === 'cv-skills' ? container : null; },
  };
  try {
    renderSkills({ technical: [], leadership: [], languages: [] });
    assert.equal(container.innerHTML, '');
  } finally {
    global.document = prevDoc;
  }
});

/* ─── initTheme tests ─────────────────────────────────────── */

test('initTheme is a no-op stub that does not throw', () => {
  initTheme(); /* should simply return without error */
});

/* ─── initBackToTop tests ─────────────────────────────────── */

test('initBackToTop toggles visible class on scroll', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const btn = { classList: makeClassList(), addEventListener() {} };
  const listeners = {};
  global.document = {
    getElementById(id) { return id === 'back-to-top' ? btn : null; },
  };
  global.window = {
    scrollY: 0,
    innerHeight: 1000,
    addEventListener(type, fn) { listeners[type] = fn; },
    scrollTo() {},
  };
  try {
    initBackToTop();
    /* Simulate scroll below threshold */
    global.window.scrollY = 100;
    listeners.scroll();
    assert.ok(!btn.classList.contains('visible'), 'Should not be visible at low scroll');
    /* Simulate scroll past 60% of viewport */
    global.window.scrollY = 700;
    listeners.scroll();
    assert.ok(btn.classList.contains('visible'), 'Should be visible at high scroll');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
  }
});

test('initBackToTop does nothing when button is missing', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  global.document = { getElementById() { return null; } };
  global.window = { addEventListener() {} };
  try {
    initBackToTop(); /* should not throw */
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
  }
});

/* ─── initSkillBars tests ─────────────────────────────────── */

test('initSkillBars adds animated class to bars when IntersectionObserver fires', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevIO = global.IntersectionObserver;
  let observedCb = null;
  const bar1 = { classList: makeClassList() };
  const bar2 = { classList: makeClassList() };
  global.document = {
    querySelectorAll(sel) {
      if (sel === '.skill-bar-fill') return [bar1, bar2];
      return [];
    },
  };
  global.window = {
    matchMedia() { return { matches: false }; },
  };
  global.IntersectionObserver = class {
    constructor(cb) { observedCb = cb; }
    observe() {}
    unobserve() {}
  };
  try {
    initSkillBars();
    /* Simulate intersection */
    observedCb([{ isIntersecting: true, target: bar1 }]);
    assert.ok(bar1.classList.contains('animated'));
    assert.ok(!bar2.classList.contains('animated'), 'bar2 not yet intersected');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.IntersectionObserver = prevIO;
  }
});

test('initSkillBars adds animated class immediately when no bars exist', () => {
  const prevDoc = global.document;
  global.document = {
    querySelectorAll() { return []; },
  };
  try {
    initSkillBars(); /* early return, no throw */
  } finally {
    global.document = prevDoc;
  }
});

/* ─── initTimelineScroll3D tests ──────────────────────────── */

test('initTimelineScroll3D sets initial opacity to 0 on entries', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevIO = global.IntersectionObserver;
  const entry1 = { style: {}, querySelectorAll() { return []; } };
  const entry2 = { style: {}, querySelectorAll() { return []; } };
  const stage = {
    querySelectorAll(sel) {
      if (sel === '.tl-entry') return [entry1, entry2];
      return [];
    },
  };
  global.document = {
    getElementById(id) { return id === 'timeline-stage' ? stage : null; },
  };
  global.window = {
    matchMedia() { return { matches: false }; },
  };
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    unobserve() {}
  };
  try {
    initTimelineScroll3D();
    assert.equal(entry1.style.opacity, '0');
    assert.equal(entry2.style.opacity, '0');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.IntersectionObserver = prevIO;
  }
});

test('initTimelineScroll3D does nothing when stage is missing', () => {
  const prevDoc = global.document;
  global.document = { getElementById() { return null; } };
  try {
    initTimelineScroll3D(); /* should not throw */
  } finally {
    global.document = prevDoc;
  }
});

/* ─── initAnimatedFavicon tests ───────────────────────────── */

test('initAnimatedFavicon renders favicon via canvas and sets link href', () => {
  const prevDoc = global.document;
  const prevHTML = global.HTMLCanvasElement;
  let faviconHref = '';
  const ctx = {
    clearRect() {}, fillStyle: '', beginPath() {},
    rect() {}, fill() {}, save() {}, restore() {},
    translate() {}, font: '', textAlign: '', textBaseline: '',
    shadowBlur: 0, shadowColor: '', fillText() {},
  };
  const canvas = {
    width: 0, height: 0,
    getContext() { return ctx; },
    toDataURL() { return 'data:image/png;base64,FAKE'; },
  };
  const link = {
    get href() { return faviconHref; },
    set href(v) { faviconHref = v; },
  };
  global.HTMLCanvasElement = class {};
  global.document = {
    querySelector(sel) {
      if (sel === 'link[rel="icon"]') return link;
      return null;
    },
    createElement(tag) {
      if (tag === 'canvas') return canvas;
      return {};
    },
    fonts: { ready: Promise.resolve() },
  };
  try {
    initAnimatedFavicon();
    /* fonts.ready is a microtask, need to flush promises */
    return global.document.fonts.ready.then(() => {
      assert.equal(faviconHref, 'data:image/png;base64,FAKE');
    });
  } finally {
    global.document = prevDoc;
    global.HTMLCanvasElement = prevHTML;
  }
});

test('initAnimatedFavicon does nothing when favicon link is missing', () => {
  const prevDoc = global.document;
  const prevHTML = global.HTMLCanvasElement;
  global.HTMLCanvasElement = class {};
  global.document = {
    querySelector() { return null; },
    createElement() { return {}; },
  };
  try {
    initAnimatedFavicon(); /* should not throw */
  } finally {
    global.document = prevDoc;
    global.HTMLCanvasElement = prevHTML;
  }
});

/* ─── initCardTilt tests ──────────────────────────────────── */

test('initCardTilt adds tilt-ready class to cards', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const card = {
    classList: makeClassList(),
    style: { setProperty() {}, transform: '', transition: '' },
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 }; },
  };
  global.document = {
    querySelectorAll() { return [card]; },
  };
  global.window = {
    matchMedia() { return { matches: false }; },
  };
  global.requestAnimationFrame = () => 1;
  try {
    initCardTilt();
    assert.ok(card.classList.contains('tilt-ready'));
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
  }
});

test('initCardTilt skips when prefers-reduced-motion is set', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  let queryCalled = false;
  global.document = {
    querySelectorAll() { queryCalled = true; return []; },
  };
  global.window = {
    matchMedia(q) {
      if (q === '(prefers-reduced-motion: reduce)') return { matches: true };
      return { matches: false };
    },
  };
  try {
    initCardTilt();
    assert.ok(!queryCalled, 'Should skip card setup when reduced motion is preferred');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
  }
});

/* ─── initScroll3D tests ──────────────────────────────────── */

test('initScroll3D registers scroll listener for hero parallax', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const heroContent = {
    style: { transform: '' },
    addEventListener(type, fn, opts) {
      if (type === 'animationend') fn(); /* fire immediately */
    },
  };
  const winListeners = {};
  global.document = {
    querySelector(sel) { return sel === '.hero-content' ? heroContent : null; },
    getElementById(id) { return id === 'hero' ? { offsetHeight: 800 } : null; },
  };
  global.window = {
    scrollY: 0,
    matchMedia() { return { matches: false }; },
    addEventListener(type, fn) { winListeners[type] = fn; },
  };
  global.requestAnimationFrame = (fn) => { fn(); return 1; };
  try {
    initScroll3D();
    assert.ok(winListeners.scroll, 'Should register scroll listener');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
  }
});

test('initScroll3D returns a teardown that removes the scroll listener', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevCAF = global.cancelAnimationFrame;
  const heroContent = {
    style: { transform: '' },
    addEventListener(type, fn) { if (type === 'animationend') fn(); },
  };
  let added = null, removed = null;
  global.document = {
    querySelector(sel) { return sel === '.hero-content' ? heroContent : null; },
    getElementById(id) { return id === 'hero' ? { offsetHeight: 800 } : null; },
  };
  global.window = {
    scrollY: 0,
    matchMedia() { return { matches: false }; },
    addEventListener(type, fn) { if (type === 'scroll') added = fn; },
    removeEventListener(type, fn) { if (type === 'scroll') removed = fn; },
  };
  global.requestAnimationFrame = (fn) => { fn(); return 1; };
  global.cancelAnimationFrame = () => {};
  try {
    const teardown = initScroll3D();
    assert.equal(typeof teardown, 'function', 'initScroll3D should return a teardown fn');
    teardown();
    assert.ok(removed && removed === added, 'teardown should remove the same scroll listener it added');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCAF;
  }
});

test('initCardTilt returns a teardown that removes every card pointer listener', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevCAF = global.cancelAnimationFrame;
  const added = [];
  const removed = [];
  const card = {
    classList: makeClassList(),
    style: { setProperty() {}, transform: '', transition: '' },
    addEventListener(type, fn) { added.push([type, fn]); },
    removeEventListener(type, fn) { removed.push([type, fn]); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 }; },
  };
  global.document = { querySelectorAll() { return [card]; } };
  global.window = { matchMedia() { return { matches: false }; } };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  try {
    const teardown = initCardTilt();
    assert.equal(typeof teardown, 'function', 'initCardTilt should return a teardown fn');
    assert.equal(added.length, 3, 'should bind mouseenter/mousemove/mouseleave');
    teardown();
    /* every added [type, fn] pair must be removed with the identical handler */
    assert.equal(removed.length, 3);
    for (const [type, fn] of added) {
      assert.ok(removed.some(([t, f]) => t === type && f === fn),
        `teardown should remove the ${type} listener with the same handler`);
    }
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCAF;
  }
});

test('initScroll3D skips on coarse pointer devices', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  let scrollRegistered = false;
  global.document = {
    querySelector() { return null; },
    getElementById() { return null; },
  };
  global.window = {
    matchMedia(q) {
      if (q === '(pointer: coarse)') return { matches: true };
      return { matches: false };
    },
    addEventListener(type) { if (type === 'scroll') scrollRegistered = true; },
  };
  try {
    initScroll3D();
    assert.ok(!scrollRegistered, 'Should not register scroll on touch devices');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
  }
});

/* ─── NeuralNetwork2D tests ───────────────────────────────── */

test('NeuralNetwork2D constructs with particles and starts animation', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevIO = global.IntersectionObserver;
  const prevDpr = global.devicePixelRatio;
  const prevNav = global.navigator;

  const ctx = {
    clearRect() {}, strokeStyle: '', lineWidth: 0,
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillStyle: '', fill() {}, arc() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    setTransform() {},
  };
  const canvas = {
    width: 0, height: 0,
    getContext() { return ctx; },
    style: { width: '', height: '' },
    parentElement: { clientWidth: 800, clientHeight: 600 },
  };
  global.document = {
    hidden: false,
    addEventListener() {},
  };
  global.window = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1,
    addEventListener() {},
    matchMedia() { return { matches: false }; },
  };
  global.devicePixelRatio = 1;
  Object.defineProperty(global, 'navigator', { value: { hardwareConcurrency: 8 }, configurable: true });
  let rafCalled = false;
  global.requestAnimationFrame = () => { rafCalled = true; return 1; };
  global.IntersectionObserver = class {
    constructor(cb) { cb([{ isIntersecting: true }]); }
    observe() {}
  };
  try {
    const nn = new NeuralNetwork2D(canvas);
    assert.ok(nn.points.length > 0, 'Should create particles');
    assert.ok(nn.ctx === ctx, 'Should store canvas context');
    assert.ok(rafCalled, 'Should start animation loop');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.IntersectionObserver = prevIO;
    global.devicePixelRatio = prevDpr;
    Object.defineProperty(global, 'navigator', { value: prevNav, configurable: true });
  }
});

/* ─── NoiseGradient tests ─────────────────────────────────── */

test('NoiseGradient sets up WebGL program and renders frames', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;

  let drawCalled = 0;
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLE_STRIP: 5,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    createShader() { return {}; },
    shaderSource() {},
    compileShader() {},
    getShaderParameter() { return true; },
    getShaderInfoLog() { return ''; },
    createProgram() { return {}; },
    attachShader() {},
    linkProgram() {},
    getProgramParameter() { return true; },
    getProgramInfoLog() { return ''; },
    useProgram() {},
    createBuffer() { return {}; },
    bindBuffer() {},
    bufferData() {},
    getAttribLocation() { return 0; },
    enableVertexAttribArray() {},
    vertexAttribPointer() {},
    getUniformLocation() { return {}; },
    uniform1f() {},
    uniform2f() {},
    viewport() {},
    drawArrays() { drawCalled++; },
  };
  const canvas = {
    width: 0, height: 0,
    clientWidth: 800, clientHeight: 600,
    style: { display: '' },
    getContext() { return gl; },
  };
  global.document = { hidden: false };
  global.window = {
    devicePixelRatio: 1,
    addEventListener() {},
  };
  global.performance = { now: () => 1000 };

  let rafFn = null;
  global.requestAnimationFrame = (fn) => { rafFn = fn; return 1; };

  try {
    const ng = new NoiseGradient(canvas);
    assert.ok(ng.gl === gl, 'Should store WebGL context');
    /* Simulate 3 frames (framesLeft starts at 3) */
    if (rafFn) rafFn(1016);  /* frame 1 */
    if (rafFn) rafFn(1032);  /* frame 2 */
    if (rafFn) rafFn(1048);  /* frame 3 */
    assert.ok(drawCalled >= 1, 'Should draw at least one frame');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.performance = prevPerf;
  }
});

test('NoiseGradient hides canvas when WebGL is unavailable', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;
  const canvas = {
    width: 0, height: 0,
    clientWidth: 800, clientHeight: 600,
    style: { display: '' },
    getContext() { return null; },
  };
  global.document = { hidden: false };
  global.window = { addEventListener() {} };
  global.performance = { now: () => 0 };
  global.requestAnimationFrame = () => 1;
  try {
    const ng = new NoiseGradient(canvas);
    assert.equal(canvas.style.display, 'none', 'Should hide canvas when no WebGL');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.performance = prevPerf;
  }
});

test('NoiseGradient destroy cancels animation frame', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevCAF = global.cancelAnimationFrame;
  const prevPerf = global.performance;
  let cancelledId = null;
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, FLOAT: 5126, TRIANGLE_STRIP: 5,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    createShader() { return {}; }, shaderSource() {}, compileShader() {},
    getShaderParameter() { return true; }, getShaderInfoLog() { return ''; },
    createProgram() { return {}; }, attachShader() {}, linkProgram() {},
    getProgramParameter() { return true; }, getProgramInfoLog() { return ''; },
    useProgram() {}, createBuffer() { return {}; }, bindBuffer() {},
    bufferData() {}, getAttribLocation() { return 0; },
    enableVertexAttribArray() {}, vertexAttribPointer() {},
    getUniformLocation() { return {}; }, uniform1f() {}, uniform2f() {},
    viewport() {}, drawArrays() {},
  };
  const canvas = {
    width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    style: {}, getContext() { return gl; },
  };
  global.document = { hidden: false };
  global.window = { devicePixelRatio: 1, addEventListener() {} };
  global.performance = { now: () => 1000 };
  global.requestAnimationFrame = () => 42;
  global.cancelAnimationFrame = (id) => { cancelledId = id; };
  try {
    const ng = new NoiseGradient(canvas);
    ng.destroy();
    assert.equal(cancelledId, 42, 'Should cancel the animation frame');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCAF;
    global.performance = prevPerf;
  }
});

test('NoiseGradient destroy removes its resize listener and frees GL (no preserveDrawingBuffer)', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevCAF = global.cancelAnimationFrame;
  const prevPerf = global.performance;

  const ctxArgs = [];
  const del = { program: 0, shader: 0, buffer: 0, lose: 0 };
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044, FLOAT: 5126, TRIANGLE_STRIP: 5,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    createShader() { return {}; }, shaderSource() {}, compileShader() {},
    getShaderParameter() { return true; }, getShaderInfoLog() { return ''; },
    createProgram() { return {}; }, attachShader() {}, linkProgram() {},
    getProgramParameter() { return true; }, getProgramInfoLog() { return ''; },
    useProgram() {}, createBuffer() { return {}; }, bindBuffer() {},
    bufferData() {}, getAttribLocation() { return 0; },
    enableVertexAttribArray() {}, vertexAttribPointer() {},
    getUniformLocation() { return {}; }, uniform1f() {}, uniform2f() {},
    viewport() {}, drawArrays() {},
    deleteProgram() { del.program++; }, deleteShader() { del.shader++; },
    deleteBuffer() { del.buffer++; },
    getExtension(name) {
      return name === 'WEBGL_lose_context' ? { loseContext() { del.lose++; } } : null;
    },
  };
  const canvas = {
    width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    style: {}, getContext(kind, opts) { ctxArgs.push(opts); return gl; },
  };
  const trackedWin = [];
  global.document = { hidden: false };
  global.window = {
    devicePixelRatio: 1,
    addEventListener(type, fn, opts) { trackedWin.push({ type, fn, opts, removed: false }); },
    removeEventListener(type, fn) {
      const e = trackedWin.find(x => x.type === type && x.fn === fn && !x.removed);
      if (e) e.removed = true;
    },
  };
  global.performance = { now: () => 1000 };
  global.requestAnimationFrame = () => 7;
  let cancelled = null;
  global.cancelAnimationFrame = (id) => { cancelled = id; };

  try {
    const ng = new NoiseGradient(canvas);
    assert.ok(ctxArgs.length > 0, 'getContext should be called');
    assert.ok(!ctxArgs.some(o => o && o.preserveDrawingBuffer === true),
      'NoiseGradient must not request preserveDrawingBuffer');
    assert.equal(trackedWin.filter(e => e.type === 'resize' && !e.removed).length, 1,
      'should register exactly one resize listener');

    ng.destroy();

    assert.equal(cancelled, 7, 'destroy must cancel the animation frame');
    assert.equal(trackedWin.filter(e => e.type === 'resize' && !e.removed).length, 0,
      'destroy must remove the resize listener');
    assert.ok(del.program >= 1, 'destroy must delete the GL program');
    assert.ok(del.shader >= 2, 'destroy must delete both shaders');
    assert.ok(del.buffer >= 1, 'destroy must delete the GL buffer');
    assert.ok(del.lose >= 1, 'destroy must lose the WebGL context');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCAF;
    global.performance = prevPerf;
  }
});

/* ─── GlobeFallback2D tests ───────────────────────────────── */

test('GlobeFallback2D constructs with pins and starts animation', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevIO = global.IntersectionObserver;
  const prevDpr = global.devicePixelRatio;
  const prevNav = global.navigator;
  const prevLoc = global.LOCATIONS;

  const ctx = {
    clearRect() {}, strokeStyle: '', lineWidth: 0, fillStyle: '',
    globalAlpha: 1,
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, setTransform() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  const canvas = {
    width: 0, height: 0,
    style: { width: '', height: '' },
    getContext() { return ctx; },
    parentElement: { clientWidth: 800, clientHeight: 500 },
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 500 }; },
  };
  global.LOCATIONS = {
    pins: [
      { type: 'lived', name: 'Rome', lat: 41.9, lon: 12.5 },
      { type: 'current', name: 'Berlin', lat: 52.5, lon: 13.4 },
    ],
    regions: [],
    trips: [],
  };
  global.document = {
    hidden: false,
    addEventListener() {},
  };
  global.window = {
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1,
    addEventListener() {},
    matchMedia() { return { matches: false }; },
  };
  global.devicePixelRatio = 1;
  Object.defineProperty(global, 'navigator', { value: { hardwareConcurrency: 8 }, configurable: true });
  let rafCalled = false;
  global.requestAnimationFrame = () => { rafCalled = true; return 1; };
  global.IntersectionObserver = class {
    constructor(cb) { cb([{ isIntersecting: true }]); }
    observe() {}
  };
  try {
    const globe = new GlobeFallback2D(canvas);
    assert.ok(globe._points.length === 2, 'Should collect 2 pins');
    assert.ok(rafCalled, 'Should start animation loop');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.IntersectionObserver = prevIO;
    global.devicePixelRatio = prevDpr;
    Object.defineProperty(global, 'navigator', { value: prevNav, configurable: true });
    global.LOCATIONS = prevLoc;
  }
});

test('GlobeFallback2D skips pins marked with _skip', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const prevIO = global.IntersectionObserver;
  const prevDpr = global.devicePixelRatio;
  const prevNav = global.navigator;
  const prevLoc = global.LOCATIONS;

  const ctx = {
    clearRect() {}, strokeStyle: '', lineWidth: 0, fillStyle: '',
    globalAlpha: 1,
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, setTransform() {},
    createRadialGradient() { return { addColorStop() {} }; },
  };
  const canvas = {
    width: 0, height: 0,
    style: { width: '', height: '' },
    getContext() { return ctx; },
    parentElement: { clientWidth: 800, clientHeight: 500 },
    addEventListener() {},
  };
  global.LOCATIONS = {
    pins: [
      { type: 'lived', name: 'Rome', lat: 41.9, lon: 12.5 },
      { type: 'holiday', name: 'Hidden', lat: 0, lon: 0, _skip: true },
    ],
    regions: [],
    trips: [],
  };
  global.document = { hidden: false, addEventListener() {} };
  global.window = {
    innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    addEventListener() {},
    matchMedia() { return { matches: false }; },
  };
  global.devicePixelRatio = 1;
  Object.defineProperty(global, 'navigator', { value: { hardwareConcurrency: 8 }, configurable: true });
  global.requestAnimationFrame = () => 1;
  global.IntersectionObserver = class {
    constructor(cb) { cb([{ isIntersecting: true }]); }
    observe() {}
  };
  try {
    const globe = new GlobeFallback2D(canvas);
    assert.equal(globe._points.length, 1, 'Should skip _skip pins');
    assert.equal(globe._points[0].type, 'lived');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
    global.IntersectionObserver = prevIO;
    global.devicePixelRatio = prevDpr;
    Object.defineProperty(global, 'navigator', { value: prevNav, configurable: true });
    global.LOCATIONS = prevLoc;
  }
});

/* ─── initCardFlip tests ──────────────────────────────────── */

function makeCard(id, title = 'Sample') {
  const listeners = {};
  const attributes = {};
  const card = {
    id,
    classList: makeClassList(),
    style: { transform: '', transition: '' },
    attributes,
    addEventListener(type, fn) { listeners[type] = fn; },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name]; },
    querySelector(sel) { return sel === '.card-title' ? { textContent: title } : null; },
    _listeners: listeners,
  };
  return card;
}

test('initCardFlip toggles is-flipped class on click', () => {
  const prevDoc = global.document;
  const card = makeCard('c1');
  global.document = {
    querySelectorAll(sel) {
      return sel === '#research-grid .research-card' ? [card] : [];
    },
  };
  try {
    initCardFlip();
    assert.equal(card.classList.contains('is-flipped'), false);
    card._listeners.click();
    assert.equal(card.classList.contains('is-flipped'), true, 'First click should flip card');
    card._listeners.click();
    assert.equal(card.classList.contains('is-flipped'), false, 'Second click should flip back');
  } finally {
    global.document = prevDoc;
  }
});

test('initCardFlip resets inline transform and transition when flipping to back', () => {
  const prevDoc = global.document;
  const card = makeCard('c2');
  card.style.transform = 'perspective(900px) rotateX(5deg)';
  card.style.transition = 'border-color 0.3s';
  global.document = {
    querySelectorAll(sel) {
      return sel === '#research-grid .research-card' ? [card] : [];
    },
  };
  try {
    initCardFlip();
    card._listeners.click();
    assert.equal(card.classList.contains('is-flipped'), true);
    assert.equal(card.style.transform, '', 'Inline transform should be cleared on flip');
    assert.equal(card.style.transition, '', 'Inline transition should be cleared on flip');
  } finally {
    global.document = prevDoc;
  }
});

test('initCardFlip does not reset transform when unflipping back to front', () => {
  const prevDoc = global.document;
  const card = makeCard('c3');
  global.document = {
    querySelectorAll(sel) {
      return sel === '#research-grid .research-card' ? [card] : [];
    },
  };
  try {
    initCardFlip();
    /* First click flips to back */
    card._listeners.click();
    assert.equal(card.classList.contains('is-flipped'), true);
    /* Apply a simulated tilt transform */
    card.style.transform = 'perspective(900px) rotateX(2deg)';
    /* Second click flips back to front — should NOT clear the tilt transform */
    card._listeners.click();
    assert.equal(card.classList.contains('is-flipped'), false);
    assert.equal(card.style.transform, 'perspective(900px) rotateX(2deg)',
      'Tilt transform should be preserved when returning to front');
  } finally {
    global.document = prevDoc;
  }
});

test('initCardFlip attaches listeners to all research grid cards', () => {
  const prevDoc = global.document;
  const cards = [makeCard('d1'), makeCard('d2'), makeCard('d3')];
  global.document = {
    querySelectorAll(sel) {
      return sel === '#research-grid .research-card' ? cards : [];
    },
  };
  try {
    initCardFlip();
    cards.forEach((card) => {
      card._listeners.click();
      assert.equal(card.classList.contains('is-flipped'), true,
        `Card ${card.id} should be flippable`);
    });
  } finally {
    global.document = prevDoc;
  }
});

test('initCardFlip makes cards keyboard-operable with ARIA disclosure state', () => {
  const prevDoc = global.document;
  const card = makeCard('k1', 'Generative AI & LLMs');
  global.document = {
    querySelectorAll(sel) {
      return sel === '#research-grid .research-card' ? [card] : [];
    },
  };
  try {
    initCardFlip();
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(card.getAttribute('aria-expanded'), 'false');
    assert.equal(card.getAttribute('aria-label'), 'Generative AI & LLMs — show details');
    /* Enter flips the card and reflects expanded state */
    card._listeners.keydown({ key: 'Enter', preventDefault() {} });
    assert.equal(card.classList.contains('is-flipped'), true);
    assert.equal(card.getAttribute('aria-expanded'), 'true');
    /* Space flips back */
    card._listeners.keydown({ key: ' ', preventDefault() {} });
    assert.equal(card.classList.contains('is-flipped'), false);
    assert.equal(card.getAttribute('aria-expanded'), 'false');
  } finally {
    global.document = prevDoc;
  }
});

test('initCardFlip does nothing when document is undefined', () => {
  const prevDoc = global.document;
  delete global.document;
  try {
    initCardFlip(); /* should not throw */
  } finally {
    global.document = prevDoc;
  }
});

/* ─── index.html card structure tests ────────────────────── */

test('index.html research cards have card-inner, card-front, and card-back', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const gridSection = html.slice(
    html.indexOf('id="research-grid"'),
    html.indexOf('</section>', html.indexOf('id="research-grid"')),
  );
  const cardCount = (gridSection.match(/class="research-card"/g) || []).length;
  assert.equal(cardCount, 6, 'Should have 6 research cards in the grid');

  const innerCount = (gridSection.match(/class="card-inner"/g) || []).length;
  assert.equal(innerCount, 6, 'Each card should have a .card-inner wrapper');

  const frontCount = (gridSection.match(/class="card-front"/g) || []).length;
  assert.equal(frontCount, 6, 'Each card should have a .card-front face');

  const backCount = (gridSection.match(/class="card-back"/g) || []).length;
  assert.equal(backCount, 6, 'Each card should have a .card-back face');
});

test('index.html card backs have back-title, back-body, and back-hint', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const gridSection = html.slice(
    html.indexOf('id="research-grid"'),
    html.indexOf('</section>', html.indexOf('id="research-grid"')),
  );
  assert.ok(gridSection.includes('card-back-title'), 'Card back should have a title');
  assert.ok(gridSection.includes('card-back-body'), 'Card back should have a body text');
  assert.ok(gridSection.includes('card-back-hint'), 'Card back should have a flip-back hint');
  assert.ok(gridSection.includes('card-flip-hint'), 'Card front should have a flip hint');
});

// ── renderProjects tests ──────────────────────────────────────────────────────

test('renderProjects shows empty state when PROJECTS is empty', () => {
  const grid = { innerHTML: '' };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'projects-grid') return grid;
      return null;
    },
  };
  try {
    renderProjects([]);
    assert.match(grid.innerHTML, /Coming soon/);
  } finally {
    global.document = prevDocument;
  }
});

test('renderProjects injects project cards with title, year, and tags', () => {
  const grid = { innerHTML: '', parentNode: { appendChild() {} } };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'projects-grid') return grid;
      return null;
    },
    createElement(tag) {
      return { className: '', setAttribute() {}, innerHTML: '' };
    },
  };
  try {
    renderProjects([{
      id: 'test-project',
      title: 'Test Project',
      year: '2024',
      tags: ['AI', 'CV'],
      thumb: 'img/projects/test-thumb.jpg',
      description: 'A test project description.',
      url: 'projects/test-project.html',
    }]);
    assert.match(grid.innerHTML, /Test Project/);
    assert.match(grid.innerHTML, /2024/);
    assert.match(grid.innerHTML, /AI/);
    assert.match(grid.innerHTML, /CV/);
    assert.match(grid.innerHTML, /project-card/);
    assert.match(grid.innerHTML, /projects\/test-project\.html/);
  } finally {
    global.document = prevDocument;
  }
});

test('renderProjects uses bg image as CSS background when provided', () => {
  const grid = { innerHTML: '', parentNode: { appendChild() {} } };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'projects-grid') return grid;
      return null;
    },
    createElement(tag) {
      return { className: '', setAttribute() {}, innerHTML: '' };
    },
  };
  try {
    renderProjects([{
      id: 'with-bg',
      title: 'Project With BG',
      year: '2024',
      tags: ['AR'],
      thumb: 'img/projects/with-bg-thumb.jpg',
      bg: 'img/projects/with-bg-hero.jpg',
      description: 'A project with a background image.',
      url: 'projects/with-bg.html',
    }]);
    // bg URL should end up as a root-absolute CSS custom property on the card
    assert.match(grid.innerHTML, /--card-bg:\s*url\(['"]?\/img\/projects\/with-bg-hero\.jpg['"]?\)/);
    // has-bg class toggled when bg is present
    assert.match(grid.innerHTML, /project-card--has-bg/);
  } finally {
    global.document = prevDocument;
  }
});


test('renderProjects limits homepage to PROJECTS_MAX_HOMEPAGE projects', () => {
  const appended = [];
  const grid = { innerHTML: '', parentNode: { children: [], appendChild(el) { appended.push(el); } } };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'projects-grid') return grid;
      return null;
    },
    createElement(tag) {
      return { className: '', setAttribute() {}, innerHTML: '' };
    },
  };
  // Create more projects than the homepage limit
  const many = [];
  for (let i = 0; i < PROJECTS_MAX_HOMEPAGE + 2; i++) {
    many.push({
      id: `project-${i}`,
      title: `Project ${i}`,
      year: '2024',
      tags: ['Tag'],
      thumb: `img/projects/p${i}.jpg`,
      description: `Description ${i}`,
      url: `projects.html#project-${i}`,
    });
  }
  try {
    renderProjects(many);
    // Should only render PROJECTS_MAX_HOMEPAGE cards
    const cardCount = (grid.innerHTML.match(/<a[^>]*class="project-card(?:\s|")/g) || []).length;
    assert.equal(cardCount, PROJECTS_MAX_HOMEPAGE);
    // Should show "View all" link
    assert.equal(appended.length, 1);
    assert.match(appended[0].innerHTML, /View all projects/);
  } finally {
    global.document = prevDocument;
  }
});

test('renderProjects does not stack duplicate "View all" footers on re-render', () => {
  let children = [];
  const parentNode = {
    appendChild(el) { el.parentNode = parentNode; children.push(el); },
    querySelector(sel) {
      if (sel === '.projects-view-all') {
        return children.find(c => c.className === 'projects-view-all') || null;
      }
      return null;
    },
  };
  const grid = { innerHTML: '', parentNode };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) { return id === 'projects-grid' ? grid : null; },
    createElement() {
      return {
        className: '', innerHTML: '', parentNode: null,
        setAttribute() {},
        remove() { children = children.filter(c => c !== this); },
      };
    },
  };
  const many = [];
  for (let i = 0; i < PROJECTS_MAX_HOMEPAGE + 2; i++) {
    many.push({ id: `p-${i}`, title: `P ${i}`, year: '2024', tags: ['T'],
      thumb: `img/projects/p${i}.jpg`, description: `D ${i}`, url: `projects.html#p-${i}` });
  }
  try {
    renderProjects(many);
    renderProjects(many);
    const footers = children.filter(c => c.className === 'projects-view-all');
    assert.equal(footers.length, 1, 'a re-render should not append a second footer');
  } finally {
    global.document = prevDocument;
  }
});

test('renderProjects does not show "View all" when projects fit within limit', () => {
  const appended = [];
  const grid = { innerHTML: '', parentNode: { children: [], appendChild(el) { appended.push(el); } } };
  const prevDocument = global.document;
  global.document = {
    getElementById(id) {
      if (id === 'projects-grid') return grid;
      return null;
    },
    createElement(tag) {
      return { className: '', setAttribute() {}, innerHTML: '' };
    },
  };
  try {
    renderProjects([{
      id: 'solo',
      title: 'Solo Project',
      year: '2024',
      tags: ['AI'],
      thumb: 'img/projects/solo.jpg',
      description: 'Only project.',
      url: 'projects.html#solo',
    }]);
    assert.equal(appended.length, 0);
  } finally {
    global.document = prevDocument;
  }
});

test('renderProjects skips if container element not found', () => {
  const prevDocument = global.document;
  global.document = {
    getElementById() { return null; },
  };
  try {
    // Should not throw
    renderProjects([{ id: 'x', title: 'X', year: '2024', tags: [], thumb: '', description: '', url: '' }]);
  } finally {
    global.document = prevDocument;
  }
});

/* ─── Performance optimisations ───────────────────────────── */

/* Helpers shared across the perf-cap tests below. They build the smallest
   possible globals/canvas mocks that let each animation class boot.
   Node >=21 defines `navigator` as a getter-only on the global, so plain
   assignment is silently ignored — use defineProperty to actually replace it. */
const setSafe = (key, val) => {
  try {
    Object.defineProperty(global, key, {
      value: val, writable: true, configurable: true, enumerable: true,
    });
  } catch (_) { /* truly read-only — give up */ }
};
function withPerfGlobals(fn, { lowPower = false } = {}) {
  const KEYS = [
    'window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame',
    'IntersectionObserver', 'devicePixelRatio', 'navigator', 'performance',
    'THREE', 'LOCATIONS', 'getComputedStyle', 'setTimeout',
  ];
  const prev = {};
  for (const k of KEYS) prev[k] = global[k];
  global.window = {
    innerWidth: lowPower ? 600 : 1280,
    innerHeight: lowPower ? 800 : 800,
    devicePixelRatio: lowPower ? 1 : 3,
    addEventListener() {},
    matchMedia() { return { matches: false }; },
  };
  global.document = {
    hidden: false,
    addEventListener() {},
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 0, height: 0,
        getContext() {
          return {
            createRadialGradient() { return { addColorStop() {} }; },
            fillRect() {}, fillStyle: '',
            clearRect() {}, strokeStyle: '', lineWidth: 0,
            beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
            fill() {}, arc() {}, setTransform() {},
            globalAlpha: 1, save() {}, restore() {},
            rect() {}, clip() {}, closePath() {},
          };
        },
      };
    },
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
  };
  global.devicePixelRatio = lowPower ? 1 : 3;
  setSafe('navigator', {
    hardwareConcurrency: lowPower ? 2 : 8,
    maxTouchPoints: lowPower ? 5 : 0,
  });
  global.performance = { now: () => 1000 };
  try { return fn(); } finally {
    for (const k of KEYS) setSafe(k, prev[k]);
  }
}

test('perf: NeuralNetwork enforces an FPS cap (<=45 normal, <=30 low-power)', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    const canvas = {
      addEventListener() {},
      getContext() { return {}; },
    };
    const nn = new NeuralNetwork(canvas);
    assert.equal(typeof nn._minFrameTime, 'number',
      'NeuralNetwork should expose a _minFrameTime to throttle rAF');
    assert.ok(nn._minFrameTime >= 1 / 45 - 1e-6,
      `expected min frame time >= 1/45s, got ${nn._minFrameTime}`);
  });
});

test('perf: NeuralNetwork low-power FPS cap is <=30', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    const canvas = { addEventListener() {}, getContext() { return {}; } };
    const nn = new NeuralNetwork(canvas);
    assert.ok(nn._isLowPower, 'mock should be detected as low-power');
    assert.ok(nn._minFrameTime >= 1 / 30 - 1e-6,
      `expected low-power min frame time >= 1/30s, got ${nn._minFrameTime}`);
  }, { lowPower: true });
});

test('perf: NeuralNetwork _animate skips render when called faster than the cap', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    const canvas = { addEventListener() {}, getContext() { return {}; } };
    let renderCalls = 0;
    let now = 1.0;
    global.performance = { now: () => now * 1000 };
    const nn = new NeuralNetwork(canvas);
    nn.renderer.render = () => { renderCalls++; };
    nn._visible = true;
    nn._animate(); // first call seeds last-draw and renders
    const after1 = renderCalls;
    now += nn._minFrameTime / 4; // well below the cap
    nn._animate();
    assert.equal(renderCalls, after1,
      'second call within the frame budget should NOT trigger a render');
    now += nn._minFrameTime + 0.01; // well above the cap
    nn._animate();
    assert.ok(renderCalls > after1,
      'call after the frame budget should trigger a render');
  });
});

test('perf: NeuralNetwork2D enforces an FPS cap (<=30)', () => {
  withPerfGlobals(() => {
    const ctx = {
      clearRect() {}, strokeStyle: '', lineWidth: 0,
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      fillStyle: '', fill() {}, arc() {},
      createRadialGradient() { return { addColorStop() {} }; },
      setTransform() {},
    };
    const canvas = {
      width: 0, height: 0,
      getContext() { return ctx; },
      style: { width: '', height: '' },
      parentElement: { clientWidth: 800, clientHeight: 600 },
    };
    const nn = new NeuralNetwork2D(canvas);
    assert.equal(typeof nn._minFrameTime, 'number',
      'NeuralNetwork2D should expose a _minFrameTime');
    assert.ok(nn._minFrameTime >= 1 / 30 - 1e-6,
      `expected min frame time >= 1/30s, got ${nn._minFrameTime}`);
  });
});

test('perf: Globe3D enforces an FPS cap (<=45 normal)', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    global.LOCATIONS = { pins: [], regions: [], trips: [] };
    const ctx2d = {
      fillStyle: '', strokeStyle: '', lineWidth: 0,
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, stroke() {},
      save() {}, restore() {}, rect() {}, clip() {},
    };
    global.document.getElementById = () => null;
    global.document.createElement = (tag) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext() { return ctx2d; } };
      return {};
    };
    const canvas = {
      addEventListener() {}, getContext() { return {}; },
      style: {}, parentElement: { clientWidth: 800, clientHeight: 500 },
    };
    const globe = new Globe3D(canvas);
    assert.equal(typeof globe._minFrameTime, 'number',
      'Globe3D should expose a _minFrameTime to throttle rAF');
    assert.ok(globe._minFrameTime >= 1 / 45 - 1e-6,
      `expected min frame time >= 1/45s, got ${globe._minFrameTime}`);
  });
});

test('perf: GlobeFallback2D enforces an FPS cap (<=30)', () => {
  withPerfGlobals(() => {
    global.LOCATIONS = { pins: [], regions: [], trips: [] };
    const ctx = {
      clearRect() {}, strokeStyle: '', lineWidth: 0, fillStyle: '',
      globalAlpha: 1,
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
      arc() {}, setTransform() {},
      createRadialGradient() { return { addColorStop() {} }; },
    };
    const canvas = {
      width: 0, height: 0,
      style: { width: '', height: '' },
      getContext() { return ctx; },
      parentElement: { clientWidth: 800, clientHeight: 500 },
      addEventListener() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 500 }; },
    };
    const g = new GlobeFallback2D(canvas);
    assert.equal(typeof g._minFrameTime, 'number',
      'GlobeFallback2D should expose a _minFrameTime');
    assert.ok(g._minFrameTime >= 1 / 30 - 1e-6,
      `expected min frame time >= 1/30s, got ${g._minFrameTime}`);
  });
});

/* ─── pixelRatio caps (Tier 2) ─────────────────────────────── */

test('perf: Globe3D pixelRatio cap is at most 1.5 on normal devices', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    global.LOCATIONS = { pins: [], regions: [], trips: [] };
    const ctx2d = {
      fillStyle: '', strokeStyle: '', lineWidth: 0,
      fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      closePath() {}, fill() {}, stroke() {},
      save() {}, restore() {}, rect() {}, clip() {},
    };
    global.document.getElementById = () => null;
    global.document.createElement = (tag) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext() { return ctx2d; } };
      return {};
    };
    const canvas = {
      addEventListener() {}, getContext() { return {}; },
      style: {}, parentElement: { clientWidth: 800, clientHeight: 500 },
    };
    const globe = new Globe3D(canvas);
    assert.equal(globe._isLowPower, false,
      'mock should not be detected as low-power');
    assert.ok(globe._pixelRatioCap <= 1.5 + 1e-6,
      `expected Globe3D pixelRatioCap <= 1.5, got ${globe._pixelRatioCap}`);
  });
});

/* ─── Particle / connection trim (Tier 3) ─────────────────── */

test('perf: NeuralNetwork default particle count is at most 90 / connection dist <=150', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    const canvas = { addEventListener() {}, getContext() { return {}; } };
    const nn = new NeuralNetwork(canvas);
    assert.ok(!nn._isLowPower, 'mock should be detected as normal-power');
    assert.ok(nn.particleCount <= 90,
      `expected <=90 particles, got ${nn.particleCount}`);
    assert.ok(nn.connectionDist <= 150,
      `expected connection dist <=150, got ${nn.connectionDist}`);
  });
});

/* ─── Passive listener flags (Tier 4) ─────────────────────── */

test('perf: NeuralNetwork registers mousemove/touchmove with { passive: true }', () => {
  withPerfGlobals(() => {
    __setThreeForTests(createMinimalThree());
    const events = [];
    global.window.addEventListener = (type, _fn, opts) => events.push({ type, opts });
    const canvas = { addEventListener() {}, getContext() { return {}; } };
    new NeuralNetwork(canvas);
    const mm = events.find(e => e.type === 'mousemove');
    const tm = events.find(e => e.type === 'touchmove');
    assert.ok(mm, 'mousemove must be registered');
    assert.ok(mm.opts && mm.opts.passive === true,
      `mousemove should be { passive: true }, got ${JSON.stringify(mm.opts)}`);
    assert.ok(tm, 'touchmove must be registered');
    assert.ok(tm.opts && tm.opts.passive === true,
      `touchmove should be { passive: true }, got ${JSON.stringify(tm.opts)}`);
  });
});

test('perf: NeuralNetwork2D registers mousemove/touchmove with { passive: true }', () => {
  withPerfGlobals(() => {
    const events = [];
    global.window.addEventListener = (type, _fn, opts) => events.push({ type, opts });
    const ctx = {
      clearRect() {}, strokeStyle: '', lineWidth: 0,
      beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      fillStyle: '', fill() {}, arc() {},
      createRadialGradient() { return { addColorStop() {} }; },
      setTransform() {},
    };
    const canvas = {
      width: 0, height: 0, getContext() { return ctx; },
      style: { width: '', height: '' },
      parentElement: { clientWidth: 800, clientHeight: 600 },
    };
    new NeuralNetwork2D(canvas);
    const mm = events.find(e => e.type === 'mousemove');
    assert.ok(mm && mm.opts && mm.opts.passive === true,
      `NN2D mousemove should be { passive: true }, got ${JSON.stringify(mm && mm.opts)}`);
  });
});

/* ─── Globe3D teardown ──────────────────────────────────────
   Globe3D allocates a WebGL context, several geometries/materials,
   an IntersectionObserver, plus window/document/canvas listeners.
   destroy() must release every one of them so the page can be
   torn down (pagehide / bfcache eviction) without leaking. */

test('Globe3D.destroy() removes every listener it added and disposes Three.js resources', () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevCAF = global.cancelAnimationFrame;
  const prevPerf = global.performance;
  const prevDpr = global.devicePixelRatio;
  const prevLocations = global.LOCATIONS;

  /* Mock THREE plus dispose-tracking on geometries/materials/textures
     so we can assert the destructor walks the scene and frees them. */
  const three = createMinimalThree();
  const disposed = { geometries: 0, materials: 0, textures: 0, renderer: 0 };
  three.BufferGeometry.prototype.dispose = function () { disposed.geometries++; };
  /* Add a fake "Material" to the mock's Mesh children so traversal can find them. */
  three.WebGLRenderer.prototype.dispose = function () { disposed.renderer++; };
  three.WebGLRenderer.prototype.forceContextLoss = function () {};
  __setThreeForTests(three);

  global.LOCATIONS = {
    pins: [{ type: 'lived', name: 'A', lat: 40, lon: 2, info: 'Home' }],
    regions: [],
    trips: [],
  };

  const tooltip = {
    classList: makeClassList(),
    style: {},
    querySelector() { return { textContent: '', style: {} }; },
  };

  const trackedDoc = [];
  const trackedWin = [];
  /* Async _buildGlobe() draws on a created canvas; mock its 2D context so
     a late-arriving fetch() rejection in the catch path doesn't crash. */
  const ctx2d = {
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, fill() {}, stroke() {},
    save() {}, restore() {}, rect() {}, clip() {},
  };
  global.document = {
    hidden: false,
    addEventListener(type, fn, opts) { trackedDoc.push({ type, fn, opts, removed: false }); },
    removeEventListener(type, fn) {
      const e = trackedDoc.find(x => x.type === type && x.fn === fn && !x.removed);
      if (e) e.removed = true;
    },
    getElementById(id) { return id === 'globe-tooltip' ? tooltip : null; },
    createElement(tag) {
      if (tag === 'canvas') return { width: 0, height: 0, getContext() { return ctx2d; } };
      return {};
    },
  };
  global.window = {
    addEventListener(type, fn, opts) { trackedWin.push({ type, fn, opts, removed: false }); },
    removeEventListener(type, fn) {
      const e = trackedWin.find(x => x.type === type && x.fn === fn && !x.removed);
      if (e) e.removed = true;
    },
  };
  global.performance = { now: () => 1000 };
  global.devicePixelRatio = 2;
  let observerDisconnected = false;
  global.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {}
    disconnect() { observerDisconnected = true; }
  };
  global.requestAnimationFrame = () => 1;
  let cafCalls = 0;
  global.cancelAnimationFrame = () => { cafCalls += 1; };

  const trackedCanvas = [];
  const canvas = {
    parentElement: { clientWidth: 680, clientHeight: 340 },
    addEventListener(type, fn, opts) { trackedCanvas.push({ type, fn, opts, removed: false }); },
    removeEventListener(type, fn) {
      const e = trackedCanvas.find(x => x.type === type && x.fn === fn && !x.removed);
      if (e) e.removed = true;
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: 680, height: 340 }; },
  };

  try {
    const globe = new Globe3D(canvas);
    assert.ok(typeof globe.destroy === 'function', 'Globe3D must expose destroy()');
    const winBefore = trackedWin.length;
    const docBefore = trackedDoc.length;
    const cvBefore = trackedCanvas.length;
    assert.ok(winBefore > 0 && docBefore > 0 && cvBefore > 0,
      'precondition: Globe3D should have registered listeners on window, document, and canvas');

    globe.destroy();

    assert.ok(cafCalls >= 1, 'destroy() must cancelAnimationFrame');
    assert.ok(observerDisconnected, 'destroy() must disconnect the IntersectionObserver');
    const stillBound = [
      ...trackedWin.filter(e => !e.removed).map(e => `window:${e.type}`),
      ...trackedDoc.filter(e => !e.removed).map(e => `document:${e.type}`),
      ...trackedCanvas.filter(e => !e.removed).map(e => `canvas:${e.type}`),
    ];
    assert.equal(stillBound.length, 0,
      `destroy() left listeners attached: ${stillBound.join(', ')}`);
    assert.ok(disposed.renderer >= 1, 'destroy() must dispose the WebGLRenderer');
    assert.ok(disposed.geometries >= 1, 'destroy() must dispose at least one BufferGeometry');
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCAF;
    global.performance = prevPerf;
    global.devicePixelRatio = prevDpr;
    __resetThreeForTests();
    global.LOCATIONS = prevLocations;
  }
});

/* ─── Globe3D partial-construction teardown ─────────────────
   When LOCATIONS is missing the constructor returns early before
   assigning this._listeners / this.scene / etc. destroy() must
   tolerate that partial instance — otherwise pagehide on a page
   that loaded globe.js but not data/locations.js will throw. */

test('Globe3D.destroy() is safe to call on a partial instance (LOCATIONS undefined)', () => {
  const prevLocations = global.LOCATIONS;
  __setThreeForTests(createMinimalThree());
  /* Force the early-return path at js/globe.js:168. */
  delete global.LOCATIONS;

  const canvas = {
    parentElement: { clientWidth: 680, clientHeight: 340 },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 680, height: 340 }; },
  };

  /* Silence the expected console.warn from the early-return branch. */
  const prevWarn = console.warn;
  console.warn = () => {};

  try {
    const globe = new Globe3D(canvas);
    /* Precondition: constructor returned early — instance is partial. */
    assert.equal(globe.scene, undefined,
      'precondition: partial instance should have no scene');
    assert.equal(globe._listeners, undefined,
      'precondition: partial instance should have no _listeners');

    /* Must not throw. Currently throws TypeError on `for ... of this._listeners`. */
    assert.doesNotThrow(() => globe.destroy(),
      'destroy() must tolerate a partial instance');
  } finally {
    console.warn = prevWarn;
    __resetThreeForTests();
    if (prevLocations === undefined) delete global.LOCATIONS;
    else global.LOCATIONS = prevLocations;
  }
});

/* ─── Globe screen-reader alternative ───────────────────────
   The 3D globe is unreachable for keyboard-only and screen-reader
   users. renderGlobeA11yList() must populate a visually-hidden
   list grouping the location data so the same content is exposed
   in plain text. */

test('renderGlobeA11yList: populates a list with grouped pins, regions, and trips', async () => {
  const { renderGlobeA11yList } = await import('../js/main.js');
  assert.equal(typeof renderGlobeA11yList, 'function',
    'main.js must export renderGlobeA11yList');

  /* Minimal DOM stub for the section element. */
  const container = {
    innerHTML: '',
    setAttribute() {},
  };
  const locations = {
    pins: [
      { type: 'lived',    name: 'Frankfurt',   info: 'Max Planck 2015–2017' },
      { type: 'current',  name: 'San Sebastián', info: 'Current home' },
      { type: 'worktrip', name: 'Cambridge',   info: 'AVATecH 2010' },
      { type: 'holiday',  name: 'Reykjavík' },
    ],
    regions: [{ name: 'Iceland', info: 'Volcanoes' }],
    trips:   [{ name: 'Around the World 2014', cities: [{ name: 'Tokyo' }, { name: 'Sydney' }] }],
  };

  renderGlobeA11yList(container, locations);

  const html = container.innerHTML;
  assert.ok(html.length > 0, 'list HTML should not be empty');
  /* Group headings present. */
  assert.ok(/Lived/.test(html), 'missing "Lived" group');
  assert.ok(/Current/.test(html), 'missing "Current" group');
  assert.ok(/Worktrip/.test(html), 'missing "Worktrip" group');
  assert.ok(/Holiday/.test(html), 'missing "Holiday" group');
  assert.ok(/Region/i.test(html), 'missing "Region" group');
  assert.ok(/Trip/i.test(html), 'missing "Trip" group');
  /* Sample names round-trip. */
  for (const name of ['Frankfurt', 'San Sebastián', 'Cambridge', 'Reykjavík', 'Iceland', 'Tokyo', 'Sydney']) {
    assert.ok(html.includes(name), `expected "${name}" in list`);
  }
});

test('renderGlobeA11yList: omits empty groups and tolerates missing fields', async () => {
  const { renderGlobeA11yList } = await import('../js/main.js');
  const container = { innerHTML: '', setAttribute() {} };
  renderGlobeA11yList(container, {
    pins: [{ type: 'lived', name: 'A' }],
    regions: [],
    trips: [],
  });
  assert.ok(container.innerHTML.includes('Lived'));
  assert.ok(!container.innerHTML.includes('Region'),
    'empty regions group should be omitted');
  assert.ok(!container.innerHTML.includes('Trip'),
    'empty trips group should be omitted');
});

test('renderGlobeA11yList: escapes HTML in location names', async () => {
  const { renderGlobeA11yList } = await import('../js/main.js');
  const container = { innerHTML: '', setAttribute() {} };
  renderGlobeA11yList(container, {
    pins: [{ type: 'lived', name: '<script>alert(1)</script>' }],
  });
  assert.ok(!container.innerHTML.includes('<script>'),
    'must escape HTML in untrusted location names');
  assert.ok(container.innerHTML.includes('&lt;script'),
    'expected escaped &lt;script in output');
});

/* ─── UNESCO accordion (travel page) ────────────────────────
   renderUnescoAccordion() must build a continent → country → site
   disclosure tree with safe external links, and degrade gracefully. */

test('renderUnescoAccordion: builds nested continent/country disclosure with site links', async () => {
  const { renderUnescoAccordion } = await import('../js/main.js');
  assert.equal(typeof renderUnescoAccordion, 'function',
    'main.js must export renderUnescoAccordion');
  const container = { innerHTML: '' };
  renderUnescoAccordion(container, {
    continents: [
      {
        name: 'Europe',
        countries: [
          { name: 'Italy', sites: [{ name: 'Rome', url: 'https://whc.unesco.org/en/list/91', year: 2018 }] },
        ],
      },
    ],
  });
  const html = container.innerHTML;
  assert.match(html, /unesco-continent/);
  assert.match(html, /unesco-country/);
  assert.match(html, /Europe/);
  assert.match(html, /Italy/);
  assert.match(html, /href="https:\/\/whc\.unesco\.org\/en\/list\/91"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /\(2018\)/);
});

test('renderUnescoAccordion: shows a placeholder when there are no continents', async () => {
  const { renderUnescoAccordion } = await import('../js/main.js');
  const container = { innerHTML: '' };
  renderUnescoAccordion(container, { continents: [] });
  assert.match(container.innerHTML, /unesco-empty/);
});

test('renderUnescoAccordion: escapes HTML in site and country names', async () => {
  const { renderUnescoAccordion } = await import('../js/main.js');
  const container = { innerHTML: '' };
  renderUnescoAccordion(container, {
    continents: [
      { name: 'Europe', countries: [
        { name: '<b>X</b>', sites: [{ name: '<script>alert(1)</script>', url: 'https://x.example' }] },
      ] },
    ],
  });
  assert.ok(!container.innerHTML.includes('<script>'), 'must escape site names');
  assert.match(container.innerHTML, /&lt;script/);
});

/* ─── Links blogroll (links page) ───────────────────────────
   renderLinks() must build a category filter bar plus a single,
   de-duplicated grid of safe external link cards, and degrade
   gracefully. linkMatchesFilter() drives the show/hide rule. */

const LINKS_FIXTURE = {
  categories: [
    { slug: 'ai', label: 'AI' },
    { slug: 'visual-explanation', label: 'Visual Explanations' },
  ],
  links: [
    {
      name: 'Lil-Log',
      url: 'https://lilianweng.github.io',
      description: 'Deep dives.',
      categories: ['ai'],
      tags: ['research'],
    },
    {
      name: 'Chris Olah',
      url: 'https://colah.github.io',
      categories: ['ai', 'visual-explanation'],
    },
  ],
};

test('renderLinks: builds a filter toolbar and a de-duplicated card grid', async () => {
  const { renderLinks } = await import('../js/main.js');
  assert.equal(typeof renderLinks, 'function', 'main.js must export renderLinks');
  const container = { innerHTML: '' };
  renderLinks(container, LINKS_FIXTURE);
  const html = container.innerHTML;
  /* Filter chips: an "All" chip plus one per category, with counts. */
  assert.match(html, /links-toolbar/);
  assert.match(html, /data-filter="all"/);
  assert.match(html, /data-filter="ai"/);
  assert.match(html, /data-filter="visual-explanation"/);
  assert.match(html, /Visual Explanations/);
  /* Cards carry their categories for client-side filtering. */
  assert.match(html, /data-categories="ai visual-explanation"/);
  /* External-link hardening + content. */
  assert.match(html, /href="https:\/\/lilianweng\.github\.io"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Deep dives\./);
});

test('renderLinks: renders each site exactly once even across categories', async () => {
  const { renderLinks } = await import('../js/main.js');
  const container = { innerHTML: '' };
  renderLinks(container, LINKS_FIXTURE);
  const cards = container.innerHTML.match(/class="link-card-item"/g) || [];
  assert.equal(cards.length, 2, 'a multi-category site is not duplicated');
});

test('renderLinks: shows a placeholder when there are no links', async () => {
  const { renderLinks } = await import('../js/main.js');
  const container = { innerHTML: '' };
  renderLinks(container, { categories: [], links: [] });
  assert.match(container.innerHTML, /links-empty/);
});

test('renderLinks: escapes HTML in names, descriptions and urls', async () => {
  const { renderLinks } = await import('../js/main.js');
  const container = { innerHTML: '' };
  renderLinks(container, {
    categories: [{ slug: 'ai', label: '<b>AI</b>' }],
    links: [
      { name: '<script>alert(1)</script>', url: 'https://x.example', description: '<img src=x>', categories: ['ai'] },
    ],
  });
  assert.ok(!container.innerHTML.includes('<script>'), 'must escape link names');
  assert.match(container.innerHTML, /&lt;script/);
});

test('linkMatchesFilter: "all" matches everything; a slug matches only its members', async () => {
  const { linkMatchesFilter } = await import('../js/main.js');
  assert.equal(linkMatchesFilter(['ai'], 'all'), true);
  assert.equal(linkMatchesFilter([], 'all'), true);
  assert.equal(linkMatchesFilter(['ai', 'visual-explanation'], 'visual-explanation'), true);
  assert.equal(linkMatchesFilter(['ai'], 'visual-explanation'), false);
});

/* ─── Page lifecycle cleanup ────────────────────────────────
   initLifecycleCleanup() must register a pagehide listener that
   fans out destroy() across the supplied disposables, idempotently. */

test('initLifecycleCleanup: pagehide invokes destroy() on every disposable, exactly once', async () => {
  const prevWindow = global.window;
  const captured = [];
  global.window = {
    addEventListener(type, fn, opts) { captured.push({ type, fn, opts }); },
    removeEventListener() {},
  };
  try {
    const { initLifecycleCleanup } = await import('../js/main.js');
    let aCalls = 0, bCalls = 0;
    const disposables = [
      { destroy() { aCalls += 1; } },
      { destroy() { bCalls += 1; } },
      null,            // tolerate nullish entries
      { /* no destroy method */ },
    ];
    initLifecycleCleanup(disposables);
    const ph = captured.find(e => e.type === 'pagehide');
    assert.ok(ph, 'initLifecycleCleanup must register a pagehide listener');
    ph.fn();
    assert.equal(aCalls, 1);
    assert.equal(bCalls, 1);
    /* Idempotent: second pagehide should not double-destroy. */
    ph.fn();
    assert.equal(aCalls, 1);
    assert.equal(bCalls, 1);
  } finally {
    global.window = prevWindow;
  }
});

test('initLifecycleCleanup: a destroy() that throws does not block the others', async () => {
  const prevWindow = global.window;
  const captured = [];
  global.window = {
    addEventListener(type, fn) { captured.push({ type, fn }); },
    removeEventListener() {},
  };
  try {
    const { initLifecycleCleanup } = await import('../js/main.js');
    let bCalls = 0;
    initLifecycleCleanup([
      { destroy() { throw new Error('boom'); } },
      { destroy() { bCalls += 1; } },
    ]);
    const ph = captured.find(e => e.type === 'pagehide');
    ph.fn();
    assert.equal(bCalls, 1, 'a thrown destroy() must not stop the loop');
  } finally {
    global.window = prevWindow;
  }
});

/* ─── No debug console output in production js/ ─────────────
   console.warn and console.error gate on genuine error paths
   (WebGL unavailable, shader compile failed, missing data) and
   are kept. console.log/info/debug are noise — they should not
   ship to production. */

test('quality: no console.log / console.info / console.debug in js/', () => {
  const jsDir = path.join(ROOT, 'js');
  const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/\bconsole\.(log|info|debug)\s*\(/.test(line)) {
        offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.equal(offenders.length, 0,
    `Found debug console output:\n  ${offenders.join('\n  ')}`);
});

/* ─── Command palette: filter must reuse list nodes ────────
   Audit §2.5 — every keystroke previously did `listEl.innerHTML = ''`
   and recreated every <li>. The refactor mounts items once and
   toggles `hidden` on filter; assert that node identities are
   stable across an input event. */

function makeCmdPaletteDom() {
  const items = [];
  const overlay = {
    hidden: true,
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
  const input = {
    value: '',
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute() {},
    removeAttribute() {},
    focus() {},
  };
  const listEl = {
    children: [],
    set innerHTML(v) {
      /* Mirror real DOM: setting innerHTML='' clears children. We track
         this so the test can detect rebuild-on-keystroke. */
      if (v === '') this.children.length = 0;
      this._lastHtmlAssign = v;
    },
    get innerHTML() { return this._lastHtmlAssign || ''; },
    appendChild(el) {
      this.children.push(el);
      el.parentNode = this;
      return el;
    },
    querySelectorAll(sel) {
      if (sel === '.cmd-item') return this.children.filter(c => c.className === 'cmd-item');
      return [];
    },
  };
  const created = [];
  const doc = {
    getElementById(id) {
      if (id === 'cmd-overlay') return overlay;
      if (id === 'cmd-input')   return input;
      if (id === 'cmd-list')    return listEl;
      return null;
    },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        className: '',
        id: '',
        innerHTML: '',
        textContent: '',
        style: {},
        hidden: false,
        attrs: {},
        listeners: {},
        children: [],
        addEventListener(type, fn) { this.listeners[type] = fn; },
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
        getAttribute(k) { return this.attrs[k]; },
        scrollIntoView() {},
      };
      created.push(el);
      return el;
    },
    body: { style: {} },
    addEventListener() {},
    activeElement: null,
  };
  return { overlay, input, listEl, items, created, doc };
}

test('initCommandPalette: filtering reuses <li> nodes instead of recreating them', () => {
  const prevDoc = global.document;
  const prevRAF = global.requestAnimationFrame;
  global.requestAnimationFrame = (fn) => { fn(); return 1; };

  const { input, listEl, doc } = makeCmdPaletteDom();
  global.document = doc;

  try {
    initCommandPalette();
    /* The refactor builds items at init (so filtering doesn't need to). */
    const initialItemNodes = listEl.children.filter(c => c.className === 'cmd-item');
    assert.ok(initialItemNodes.length > 0,
      'precondition: items should be mounted by init');
    const firstNode = initialItemNodes[0];

    /* Drive a filter that matches at least one item. */
    input.value = 'cv';
    input.listeners.input?.();

    const afterFilterNodes = listEl.children.filter(c => c.className === 'cmd-item');
    assert.equal(afterFilterNodes.length, initialItemNodes.length,
      'filter must not change the number of mounted item nodes');
    assert.strictEqual(afterFilterNodes[0], firstNode,
      'filter must reuse existing <li> nodes (identity preserved)');

    /* Items not matching the filter should be hidden, not detached. */
    const visibleAfter = afterFilterNodes.filter(n => !n.hidden).length;
    const hiddenAfter  = afterFilterNodes.filter(n =>  n.hidden).length;
    assert.ok(hiddenAfter > 0,
      'non-matching items should be hidden after filter');
    assert.ok(visibleAfter > 0,
      'matching items should remain visible');
  } finally {
    global.document = prevDoc;
    global.requestAnimationFrame = prevRAF;
  }
});

test('initCommandPalette: opening makes background siblings inert and closing restores them', () => {
  const prevDoc = global.document;
  const prevRAF = global.requestAnimationFrame;
  global.requestAnimationFrame = (fn) => { if (fn) fn(); return 1; };

  const { overlay, input, listEl, doc } = makeCmdPaletteDom();
  const mkEl = (tag) => ({
    tagName: tag, inert: false, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
  });
  const nav = mkEl('NAV'), main = mkEl('MAIN'), footer = mkEl('FOOTER'), script = mkEl('SCRIPT');

  const docListeners = {};
  doc.body = { style: {}, children: [nav, main, overlay, footer, script] };
  doc.addEventListener = (type, fn) => { docListeners[type] = fn; };
  global.document = doc;

  try {
    initCommandPalette();
    assert.equal(typeof docListeners.keydown, 'function',
      'precondition: a document keydown handler should be registered for the shortcut');

    /* Open with Ctrl/⌘+K */
    docListeners.keydown({ metaKey: true, ctrlKey: false, key: 'k', preventDefault() {} });
    assert.equal(overlay.hidden, false, 'shortcut should open the palette');
    assert.equal(nav.inert, true, 'nav should be inert while open');
    assert.equal(main.inert, true, 'main should be inert while open');
    assert.equal(footer.inert, true, 'footer should be inert while open');
    assert.equal(nav.attrs['aria-hidden'], 'true', 'inert siblings should be aria-hidden');
    assert.notStrictEqual(overlay.inert, true, 'the overlay itself must stay interactive');
    assert.notStrictEqual(script.inert, true, 'script tags should be skipped');

    /* Close with Escape */
    input.listeners.keydown({ key: 'Escape', preventDefault() {} });
    assert.equal(overlay.hidden, true, 'Escape should close the palette');
    assert.equal(nav.inert, false, 'nav inert should be cleared on close');
    assert.equal(main.inert, false, 'main inert should be cleared on close');
    assert.equal(footer.inert, false, 'footer inert should be cleared on close');
    assert.equal(nav.attrs['aria-hidden'], undefined, 'aria-hidden should be removed on close');
  } finally {
    global.document = prevDoc;
    global.requestAnimationFrame = prevRAF;
  }
});
