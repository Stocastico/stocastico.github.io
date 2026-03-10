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
  renderCV,
  renderSkills,
  initTheme,
  initCardTilt,
  initSkillBars,
  initTimelineScroll3D,
  initAnimatedFavicon,
  initMagneticButtons,
  initScroll3D,
  initBackToTop,
  NeuralNetwork2D,
  NoiseGradient,
  GlobeFallback2D,
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
    assert.match(list.innerHTML, /Open paper: Paper title/);
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

/* ─── renderCV tests ─────────────────────────────────────── */

test('renderCV renders merged career and education entries sorted by year', () => {
  const timeline = { innerHTML: '' };
  const prevDoc = global.document;
  const prevCareer = global.CV_CAREER;
  const prevEdu = global.CV_EDUCATION;
  global.document = {
    getElementById(id) { return id === 'cv-timeline' ? timeline : null; },
  };
  global.CV_CAREER = [{
    year: '2020–2023',
    role: 'Engineer',
    company: 'Acme',
    location: 'Berlin',
    description: 'Built things',
    tags: ['Python', 'ML'],
  }];
  global.CV_EDUCATION = [{
    year: '2018',
    degree: 'MSc CS',
    institution: 'MIT',
    location: 'Boston',
  }];
  try {
    renderCV();
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
    global.CV_CAREER = prevCareer;
    global.CV_EDUCATION = prevEdu;
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

test('renderCV does nothing when CV_CAREER is undefined', () => {
  const timeline = { innerHTML: '' };
  const prevDoc = global.document;
  const prevCareer = global.CV_CAREER;
  const prevEdu = global.CV_EDUCATION;
  global.document = {
    getElementById(id) { return id === 'cv-timeline' ? timeline : null; },
  };
  delete global.CV_CAREER;
  global.CV_EDUCATION = [];
  try {
    renderCV();
    assert.equal(timeline.innerHTML, '');
  } finally {
    global.document = prevDoc;
    global.CV_CAREER = prevCareer;
    global.CV_EDUCATION = prevEdu;
  }
});

/* ─── renderSkills tests ─────────────────────────────────── */

test('renderSkills renders technical bars and language pills', () => {
  const container = { innerHTML: '' };
  const prevDoc = global.document;
  const prevSkills = global.CV_SKILLS;
  global.document = {
    getElementById(id) { return id === 'cv-skills' ? container : null; },
  };
  global.CV_SKILLS = {
    technical: [{ name: 'Python', level: 90 }],
    leadership: [{ name: 'Mentoring', level: 75 }],
    languages: [{ name: 'English', proficiency: 'Native' }],
  };
  try {
    renderSkills();
    assert.match(container.innerHTML, /Python/);
    assert.match(container.innerHTML, /skill-bar-fill/);
    assert.match(container.innerHTML, /--pct:90%/);
    assert.match(container.innerHTML, /Mentoring/);
    assert.match(container.innerHTML, /English/);
    assert.match(container.innerHTML, /Native/);
    assert.match(container.innerHTML, /lang-item/);
  } finally {
    global.document = prevDoc;
    global.CV_SKILLS = prevSkills;
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

test('renderSkills renders empty when CV_SKILLS has no entries', () => {
  const container = { innerHTML: 'old' };
  const prevDoc = global.document;
  const prevSkills = global.CV_SKILLS;
  global.document = {
    getElementById(id) { return id === 'cv-skills' ? container : null; },
  };
  global.CV_SKILLS = { technical: [], leadership: [], languages: [] };
  try {
    renderSkills();
    assert.equal(container.innerHTML, '');
  } finally {
    global.document = prevDoc;
    global.CV_SKILLS = prevSkills;
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

/* ─── initMagneticButtons tests ───────────────────────────── */

test('initMagneticButtons registers mousemove listener for magnetic effect', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  const prevRAF = global.requestAnimationFrame;
  const btn = {
    style: { transform: '' },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; },
  };
  const docListeners = {};
  global.document = {
    querySelectorAll() { return [btn]; },
    querySelector() { return null; },  /* no .hero-actions */
    addEventListener(type, fn) { docListeners[type] = fn; },
  };
  global.window = {
    matchMedia() { return { matches: false }; },
  };
  global.requestAnimationFrame = (fn) => { fn(); return 1; };
  try {
    initMagneticButtons();
    assert.ok(docListeners.mousemove, 'Should register mousemove listener');
  } finally {
    global.document = prevDoc;
    global.window = prevWin;
    global.requestAnimationFrame = prevRAF;
  }
});

test('initMagneticButtons skips on coarse pointer devices', () => {
  const prevDoc = global.document;
  const prevWin = global.window;
  let queryCalled = false;
  global.document = {
    querySelectorAll() { queryCalled = true; return []; },
    querySelector() { return null; },
    addEventListener() {},
  };
  global.window = {
    matchMedia(q) {
      if (q === '(pointer: coarse)') return { matches: true };
      return { matches: false };
    },
  };
  try {
    initMagneticButtons();
    assert.ok(!queryCalled, 'Should skip on touch devices');
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
  global.navigator = { hardwareConcurrency: 8 };
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
    global.navigator = prevNav;
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
    createShader() { return {}; },
    shaderSource() {},
    compileShader() {},
    createProgram() { return {}; },
    attachShader() {},
    linkProgram() {},
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
    createShader() { return {}; }, shaderSource() {}, compileShader() {},
    createProgram() { return {}; }, attachShader() {}, linkProgram() {},
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
  global.navigator = { hardwareConcurrency: 8 };
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
    global.navigator = prevNav;
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
  global.navigator = { hardwareConcurrency: 8 };
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
    global.navigator = prevNav;
    global.LOCATIONS = prevLoc;
  }
});
