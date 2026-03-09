const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const {
  formatIsoDate,
  geocodeLocations,
  Globe3D,
  renderPublications,
  renderBlog,
  setFooterYear,
  initNavbar,
  initMobileMenu,
  initScrollReveal,
  initCounters,
  animateCounter,
  NeuralNetwork,
  HeroNameShader,
  decodeBase64,
  getObfuscatedContactEmail,
  initEmailObfuscation,
} = require('../js/main.js');

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
  const code = fs.readFileSync(abs, 'utf8');
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

test('BLOG_POSTS contain reachable local files or absolute URLs', () => {
  const blogPosts = loadConstFromScript('data/blog.js', 'BLOG_POSTS');
  assert.ok(Array.isArray(blogPosts));
  assert.ok(blogPosts.length > 0);

  for (const post of blogPosts) {
    assert.ok(post.title);
    assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(post.excerpt);
    assert.ok(post.url);
    assert.notEqual(post.url, '#');

    if (!/^https?:\/\//.test(post.url)) {
      const target = path.join(ROOT, post.url);
      assert.ok(fs.existsSync(target), `Missing blog target file: ${post.url}`);
    }
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
  const prevPublications = global.PUBLICATIONS;
  global.document = {
    getElementById(id) {
      if (id === 'publications-list') return list;
      return null;
    },
  };
  global.PUBLICATIONS = [{
    year: '2025',
    title: 'Paper title',
    authors: 'A. Author',
    venue: 'Conference',
    url: 'https://example.com',
  }];
  try {
    renderPublications();
    assert.match(list.innerHTML, /Paper title/);
    assert.match(list.innerHTML, /Read paper/);
  } finally {
    global.document = prevDocument;
    global.PUBLICATIONS = prevPublications;
  }
});

test('renderBlog shows coming-soon state when BLOG_POSTS is empty', () => {
  const grid = { innerHTML: '' };
  const prevDocument = global.document;
  const prevPosts = global.BLOG_POSTS;
  global.document = {
    getElementById(id) {
      if (id === 'blog-grid') return grid;
      return null;
    },
  };
  global.BLOG_POSTS = [];
  try {
    renderBlog();
    assert.match(grid.innerHTML, /Coming soon/);
  } finally {
    global.document = prevDocument;
    global.BLOG_POSTS = prevPosts;
  }
});

test('renderBlog injects cards and formats date correctly', () => {
  const grid = { innerHTML: '' };
  const prevDocument = global.document;
  const prevPosts = global.BLOG_POSTS;
  global.document = {
    getElementById(id) {
      if (id === 'blog-grid') return grid;
      return null;
    },
  };
  global.BLOG_POSTS = [{
    title: 'Post',
    date: '2024-11-20',
    excerpt: 'Excerpt',
    tag: 'Research',
    readMin: 7,
    url: 'blog/post.html',
  }];
  try {
    renderBlog();
    assert.match(grid.innerHTML, /20 November 2024/);
    assert.match(grid.innerHTML, /blog-accent-research/);
  } finally {
    global.document = prevDocument;
    global.BLOG_POSTS = prevPosts;
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
  const prevThree = global.THREE;

  global.THREE = createMinimalThree();
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
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};

  try {
    const nn = new NeuralNetwork({});
    assert.ok(nn.points);
    assert.ok(nn.lines);
    assert.ok(nn.lineGeo);
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCancel;
    global.THREE = prevThree;
  }
});

test('Globe3D constructs with mocked THREE and location data', () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevPerf = global.performance;
  const prevDpr = global.devicePixelRatio;
  const prevThree = global.THREE;
  const prevLocations = global.LOCATIONS;

  global.THREE = createMinimalThree();
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
    global.THREE = prevThree;
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
  const prevThree = global.THREE;
  const prevLocations = global.LOCATIONS;

  global.THREE = createMinimalThree();
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
    global.THREE = prevThree;
    global.LOCATIONS = prevLocations;
  }
});

test('Globe3D.setFilteredTypes toggles marker visibility by type', () => {
  const markerA = { userData: { type: 'lived' }, visible: true };
  const markerB = { userData: { type: 'holiday' }, visible: true };
  const markerC = { userData: { type: 'trip' }, visible: true };

  const fakeGlobe = {
    visibleTypes: new Set(['lived', 'holiday', 'trip']),
    markerMeshes: [markerA, markerB, markerC],
  };

  Globe3D.prototype.setFilteredTypes.call(fakeGlobe, new Set(['lived', 'holiday']));

  assert.equal(markerA.visible, true);
  assert.equal(markerB.visible, true);
  assert.equal(markerC.visible, false);
});

test('HeroNameShader boots with mocked WebGL context', async () => {
  const prevWindow = global.window;
  const prevDocument = global.document;
  const prevObserver = global.IntersectionObserver;
  const prevRAF = global.requestAnimationFrame;
  const prevCancel = global.cancelAnimationFrame;
  const prevGetComputed = global.getComputedStyle;
  const prevSetTimeout = global.setTimeout;
  const prevDpr = global.devicePixelRatio;

  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TEXTURE_2D: 8,
    TEXTURE_WRAP_S: 9,
    TEXTURE_WRAP_T: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    LINEAR: 14,
    BLEND: 15,
    SRC_ALPHA: 16,
    ONE_MINUS_SRC_ALPHA: 17,
    COLOR_BUFFER_BIT: 18,
    TRIANGLE_STRIP: 19,
    RGBA: 20,
    UNSIGNED_BYTE: 21,
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
    uniform1i() {},
    createTexture() { return {}; },
    bindTexture() {},
    texParameteri() {},
    enable() {},
    blendFunc() {},
    viewport() {},
    uniform2f() {},
    texImage2D() {},
    clear() {},
    uniform1f() {},
    drawArrays() {},
  };

  const h1 = {
    offsetWidth: 500,
    offsetHeight: 180,
    classList: { add() {} },
  };
  const canvas = {
    offsetWidth: 500,
    offsetHeight: 180,
    style: {},
    getContext(kind) { return kind === 'webgl' ? gl : null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 500, height: 180 }; },
  };

  global.window = { addEventListener() {} };
  global.document = {
    hidden: false,
    addEventListener() {},
    fonts: { ready: Promise.resolve() },
    createElement(tag) {
      if (tag !== 'canvas') return {};
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            scale() {},
            clearRect() {},
            fillText() {},
            set fillStyle(_) {},
            set textAlign(_) {},
            set textBaseline(_) {},
            set font(_) {},
          };
        },
      };
    },
  };
  global.IntersectionObserver = class {
    constructor() {}
    observe() {}
    disconnect() {}
  };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  global.getComputedStyle = () => ({ fontSize: '96px' });
  global.setTimeout = (fn) => { fn(); return 1; };
  global.devicePixelRatio = 2;

  try {
    const shader = new HeroNameShader(h1, canvas);
    await Promise.resolve();
    assert.ok(shader.gl);
    assert.ok(shader.prog);
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
    global.IntersectionObserver = prevObserver;
    global.requestAnimationFrame = prevRAF;
    global.cancelAnimationFrame = prevCancel;
    global.getComputedStyle = prevGetComputed;
    global.setTimeout = prevSetTimeout;
    global.devicePixelRatio = prevDpr;
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
