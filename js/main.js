/* ============================================================
   PERSONAL WEBSITE — Stefano Masneri
   main.js
   ============================================================
   This file contains only behaviour and animation logic.
   Content lives in separate, easy-to-edit files:

     index.html           — static sections (hero, about, research,
                            skills, contact, navigation, footer)
     data/locations.js    — 3D globe pins, trips, regions
     data/publications.js — selected papers  (PUBLICATIONS array)
     data/projects.js     — projects         (PROJECTS array)

   To change neural-network colours, adjust the ACCENT_* /
   CYAN_* constants inside the NeuralNetwork class below.
   ============================================================ */

'use strict';

/* Shared TopoJSON cache — avoids double-fetching world-110m.json */
if (typeof window !== 'undefined') {
  window._topoPromise = null;
}
function getTopoJSON() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!window._topoPromise) {
    window._topoPromise = fetch('./data/world-110m.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  return window._topoPromise;
}

function isLowPowerDevice() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const cores = nav && typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 760;
  /* Data-saver mode or non-4G connection: skip heavy effects to save bandwidth */
  const savesData     = !!nav?.connection?.saveData;
  const slowNetwork   = !!(nav?.connection?.effectiveType
    && nav.connection.effectiveType !== '4g');
  return coarsePointer || narrowViewport || cores <= 4 || savesData || slowNetwork;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let _webglSupportCache = null;
function hasWebGLSupport() {
  if (_webglSupportCache != null) return _webglSupportCache;
  if (typeof document === 'undefined') return false;
  const c = document.createElement('canvas');
  _webglSupportCache = !!(
    c.getContext('webgl', { failIfMajorPerformanceCaveat: true })
    || c.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true })
  );
  return _webglSupportCache;
}

/* ═══════════════════════════════════════════════════════════
   THREE.JS NEURAL NETWORK ANIMATION
   ═══════════════════════════════════════════════════════════ */
class NeuralNetwork {
  /* Tweak these to change the visual */
  static PARTICLE_COUNT = 120;
  static CONNECTION_DIST = 170;  /* max distance (px) to draw a line */
  static SPEED = 0.4;  /* particle drift speed             */
  static MOUSE_RADIUS = 220;  /* attraction zone around cursor    */
  static MOUSE_STRENGTH = 0.0008;
  static ACCENT_R = 0.424; static ACCENT_G = 0.392; static ACCENT_B = 1.0;   /* #6c63ff */
  static CYAN_R = 0.0; static CYAN_G = 0.831; static CYAN_B = 1.0;   /* #00d4ff */

  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = { x: 0, y: 0 };
    this.frameId = null;
    this._isLowPower = isLowPowerDevice();
    this.particleCount = this._isLowPower ? 84 : NeuralNetwork.PARTICLE_COUNT;
    this.connectionDist = this._isLowPower ? 145 : NeuralNetwork.CONNECTION_DIST;
    /* Cap at 1.0 so WebGL line segments stay at least 1 CSS-pixel wide
       on HiDPI/Retina screens (WebGL clamps linewidth to 1 device pixel). */
    this.pixelRatioCap = 1;
    this.lineFrameStep = this._isLowPower ? 2 : 1;
    this._lineTick = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !this._isLowPower,
      powerPreference: this._isLowPower ? 'low-power' : 'high-performance',
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.z = 600;

    this._initParticles();
    this._initLines();
    this._onResize();

    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.frameId = null;
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        this._onResize();
        if (!this.frameId) this._animate();
      }, false);
    }

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX - window.innerWidth / 2;
      this.mouse.y = -(e.clientY - window.innerHeight / 2);
    });
    /* Touch support */
    window.addEventListener('touchmove', e => {
      if (!e.touches[0]) return;
      this.mouse.x = e.touches[0].clientX - window.innerWidth / 2;
      this.mouse.y = -(e.touches[0].clientY - window.innerHeight / 2);
    }, { passive: true });

    /* Pause rendering when the section scrolls out of view */
    this._visible = true;
    const _ioNN = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
      if (this._visible && !this.frameId) this._animate();
    }, { threshold: 0 });
    _ioNN.observe(canvas);

    /* Pause rendering when the browser tab is hidden */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.frameId) this._animate();
    });

    this._animate();
  }

  /* Create a soft glow disc texture for each particle */
  _glowTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0, 'rgba(108, 99, 255, 1)');
    g.addColorStop(0.25, 'rgba(108, 99, 255, 0.7)');
    g.addColorStop(0.6, 'rgba(0,  212, 255, 0.25)');
    g.addColorStop(1, 'rgba(0,    0,   0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  _initParticles() {
    const n = this.particleCount;
    const pos = new Float32Array(n * 3);

    this.velocities = [];

    for (let i = 0; i < n; i++) {
      const hw = window.innerWidth / 2;
      const hh = window.innerHeight / 2;
      pos[i * 3] = (Math.random() - 0.5) * hw * 2.2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * hh * 2.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 300;

      const speed = NeuralNetwork.SPEED;
      this.velocities.push({
        x: (Math.random() - 0.5) * speed,
        y: (Math.random() - 0.5) * speed,
        z: (Math.random() - 0.5) * speed * 0.3,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 6,
      map: this._glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });

    this.points = new THREE.Points(geo, mat);
    this.scene.add(this.points);
  }

  _initLines() {
    const n = this.particleCount;
    const maxPairs = n * (n - 1) / 2;        /* upper bound */

    this.linePosArr = new Float32Array(maxPairs * 6);
    this.lineColArr = new Float32Array(maxPairs * 6);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePosArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.lineColArr, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      linewidth: 2,   /* respected on some platforms; harmless no-op elsewhere */
    });

    this.lines = new THREE.LineSegments(geo, mat);
    this.scene.add(this.lines);
    this.lineGeo = geo;
  }

  _update() {
    const n = this.particleCount;
    const dist = this.connectionDist;
    const dist2 = dist * dist;           /* squared — avoids sqrt in the O(n²) loop */
    const pos = this.points.geometry.attributes.position.array;
    /* Use cached half-dimensions from _onResize — no DOM reads per frame */
    const hw = this.hw;
    const hh = this.hh;
    const ms = NeuralNetwork.MOUSE_STRENGTH;
    const mr2 = NeuralNetwork.MOUSE_RADIUS ** 2;  /* squared threshold */
    const hwBound = hw * 1.1;
    const hhBound = hh * 1.1;

    /* Move particles */
    for (let i = 0; i < n; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;

      /* Mouse attraction — squared distance avoids Math.sqrt entirely */
      const dx = this.mouse.x - pos[ix];
      const dy = this.mouse.y - pos[iy];
      const md2 = dx * dx + dy * dy;
      if (md2 < mr2 && md2 > 0.01) {
        pos[ix] += dx * ms;
        pos[iy] += dy * ms;
      }

      pos[ix] += this.velocities[i].x;
      pos[iy] += this.velocities[i].y;
      pos[iz] += this.velocities[i].z;

      /* Wrap edges */
      if (pos[ix] > hwBound) pos[ix] = -hwBound;
      else if (pos[ix] < -hwBound) pos[ix] = hwBound;
      if (pos[iy] > hhBound) pos[iy] = -hhBound;
      else if (pos[iy] < -hhBound) pos[iy] = hhBound;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if ((this._lineTick++ % this.lineFrameStep) !== 0) return;

    /* Build connection line buffer
       Key optimisation: compare squared distances so Math.sqrt is only
       called for pairs that actually connect (~5-10% of the total). */
    const lp = this.linePosArr;
    const lc = this.lineColArr;
    const R1 = NeuralNetwork.ACCENT_R, G1 = NeuralNetwork.ACCENT_G, B1 = NeuralNetwork.ACCENT_B;
    const R2 = NeuralNetwork.CYAN_R, G2 = NeuralNetwork.CYAN_G, B2 = NeuralNetwork.CYAN_B;
    let seg = 0;

    for (let i = 0; i < n; i++) {
      const ax = pos[i * 3], ay = pos[i * 3 + 1], az = pos[i * 3 + 2];
      for (let j = i + 1; j < n; j++) {
        const bx = pos[j * 3], by = pos[j * 3 + 1], bz = pos[j * 3 + 2];
        const ddx = ax - bx, ddy = ay - by, ddz = az - bz;
        const d2 = ddx * ddx + ddy * ddy + ddz * ddz;

        /* Early exit without sqrt — eliminates ~90 % of sqrt calls */
        if (d2 >= dist2) continue;

        const d = Math.sqrt(d2);         /* sqrt only on confirmed connections */
        /* Quadratic falloff keeps close connections bright while far ones fade.
           Minimum 0.18 ensures even distant connections remain visible on HiDPI. */
        const a = Math.max(0.18, (1 - d / dist) ** 0.65);
        const s = seg * 6;

        lp[s] = ax; lp[s + 1] = ay; lp[s + 2] = az;
        lp[s + 3] = bx; lp[s + 4] = by; lp[s + 5] = bz;

        const t = i / n;                /* 0‥1 gradient across canvas */
        lc[s] = (R1 * (1 - t) + R2 * t) * a;
        lc[s + 1] = (G1 * (1 - t) + G2 * t) * a;
        lc[s + 2] = (B1 * (1 - t) + B2 * t) * a;
        lc[s + 3] = (R2 * (1 - t) + R1 * t) * a;
        lc[s + 4] = (G2 * (1 - t) + G1 * t) * a;
        lc[s + 5] = (B2 * (1 - t) + B1 * t) * a;

        seg++;
      }
    }

    this.lineGeo.setDrawRange(0, seg * 2);
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineGeo.attributes.color.needsUpdate = true;
  }

  _animate() {
    /* Skip frames while tab is hidden or section is off-screen */
    if (document.hidden || !this._visible) { this.frameId = null; return; }
    this.frameId = requestAnimationFrame(() => this._animate());
    this._update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    /* Cache half-dimensions so _update() never reads window.innerWidth */
    this.hw = w / 2;
    this.hh = h / 2;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
  }

  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
  }
}

/* CPU fallback for the hero background when WebGL is unavailable */
class NeuralNetwork2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (!this.ctx) return;
    this.mouse = { x: 0, y: 0 };
    this.frameId = null;
    this._visible = true;
    this._isLowPower = isLowPowerDevice();
    this.count = this._isLowPower ? 52 : 80;
    this.maxDist = this._isLowPower ? 120 : 150;
    this.maxDist2 = this.maxDist * this.maxDist;
    this.points = [];

    this._onResize();
    for (let i = 0; i < this.count; i++) this.points.push(this._newPoint());

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('touchmove', (e) => {
      if (!e.touches[0]) return;
      this.mouse.x = e.touches[0].clientX;
      this.mouse.y = e.touches[0].clientY;
    }, { passive: true });

    const io = new IntersectionObserver(([entry]) => {
      this._visible = entry.isIntersecting;
      if (this._visible && !this.frameId) this._animate();
    }, { threshold: 0 });
    io.observe(canvas);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.frameId) this._animate();
    });

    this._animate();
  }

  _newPoint() {
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      z: Math.random(),
    };
  }

  _onResize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this._isLowPower ? 1.25 : 1.75);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const mx = this.mouse.x - p.x;
      const my = this.mouse.y - p.y;
      const md2 = mx * mx + my * my;
      if (md2 < 28000 && md2 > 1) {
        p.vx += mx * 0.00001;
        p.vy += my * 0.00001;
      }
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -40) p.x = this.w + 40;
      else if (p.x > this.w + 40) p.x = -40;
      if (p.y < -40) p.y = this.h + 40;
      else if (p.y > this.h + 40) p.y = -40;
    }

    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i];
      for (let j = i + 1; j < this.points.length; j++) {
        const b = this.points[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= this.maxDist2) continue;
        const alpha = 1 - (d2 / this.maxDist2);
        ctx.strokeStyle = `rgba(120,130,255,${0.22 * alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const r = 1.7 + p.z * 2.2;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      g.addColorStop(0, 'rgba(180,190,255,0.95)');
      g.addColorStop(0.5, 'rgba(85,210,255,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _animate() {
    if (document.hidden || !this._visible) { this.frameId = null; return; }
    this.frameId = requestAnimationFrame(() => this._animate());
    this._draw();
  }
}

/* ═══════════════════════════════════════════════════════════
   GEOCODING  (OpenStreetMap Nominatim — free, no key needed)
   Fills lat/lon for any LOCATIONS entry that omits them.
   Runs once at page load; respects 1-req/sec Nominatim ToS.
   ═══════════════════════════════════════════════════════════ */
async function geocodeLocations(locs) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const API = 'https://nominatim.openstreetmap.org/search';

  /* Collect every item missing coordinates into a flat list */
  const pending = [];
  const collect = (obj) => { if (obj.lat == null || obj.lon == null) pending.push(obj); };
  (locs.pins || []).forEach(collect);
  (locs.regions || []).forEach(collect);
  (locs.trips || []).forEach(t => (t.cities || []).forEach(collect));

  if (!pending.length) return;   /* nothing to do — all coords already provided */

  for (let i = 0; i < pending.length; i++) {
    if (i > 0) await sleep(1100);   /* max 1 req/sec — Nominatim ToS */
    const item = pending[i];
    try {
      const url = `${API}?q=${encodeURIComponent(item.name)}&format=json&limit=1`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.length) throw new Error('no results');
      item.lat = parseFloat(json[0].lat);
      item.lon = parseFloat(json[0].lon);
      console.info(`[Globe] geocoded "${item.name}" → (${item.lat.toFixed(3)}, ${item.lon.toFixed(3)})`);
    } catch (e) {
      console.warn(`[Globe] geocoding failed for "${item.name}": ${e.message} — pin skipped`);
      item._skip = true;
    }
  }
}

/* ── Fallback continent polygon data (used only when data/world-110m.json
   cannot be fetched, e.g. local file:// dev without a server).
   Each element: [[lat, lon], …] — closed polygon in geographic coordinates. */
const GLOBE_CONTINENTS = [
  /* North America */
  [[71,-164],[66,-168],[61,-150],[57,-136],[49,-124],[42,-124],[37,-122],
   [32,-117],[29,-110],[23,-106],[15,-90],[9,-84],[8,-77],[11,-61],[17,-62],
   [21,-74],[26,-80],[30,-81],[35,-76],[41,-70],[45,-64],[47,-53],[52,-56],
   [57,-62],[63,-78],[68,-84],[72,-79],[76,-93],[73,-124],[71,-164]],
  /* Greenland */
  [[83,-34],[76,-14],[72,-22],[65,-37],[60,-44],[60,-48],[64,-52],[68,-54],
   [74,-57],[76,-68],[82,-72],[83,-34]],
  /* South America */
  [[12,-71],[8,-60],[2,-51],[-5,-35],[-10,-37],[-16,-38],[-23,-43],
   [-34,-53],[-34,-58],[-52,-60],[-55,-68],[-50,-68],[-47,-65],[-40,-62],
   [-27,-49],[-22,-43],[-10,-37],[-1,-49],[5,-52],[8,-59],[12,-71]],
  /* Europe (mainland + Iberia + Scandinavia) */
  [[36,-9],[43,-9],[44,-8],[48,-4],[51,3],[52,5],[57,8],[65,14],[71,28],
   [66,25],[60,24],[55,20],[52,24],[46,30],[45,29],[43,23],[42,20],[38,22],
   [37,22],[38,16],[40,18],[41,14],[44,13],[44,8],[43,3],[43,-2],[36,-6],
   [36,-9]],
  /* Italy (peninsula) */
  [[47,14],[45,13],[44,8],[43,8],[43,11],[41,13],[38,16],[38,15],
   [39,17],[40,18],[41,15],[44,14],[47,14]],
  /* UK + Ireland */
  [[58,-5],[57,-2],[53,-5],[52,-5],[51,-3],[50,0],[51,1],[53,0],[55,-2],[58,-5]],
  /* Iceland */
  [[64,-24],[65,-14],[66,-14],[66,-18],[64,-24]],
  /* Africa */
  [[37,10],[33,33],[22,37],[12,44],[11,43],[8,50],[2,45],
   [-5,40],[-11,37],[-22,35],[-26,33],[-34,27],[-35,19],[-34,18],
   [-29,17],[-15,12],[-11,14],[-5,10],[4,2],[5,3],[5,1],[4,-2],
   [5,-4],[7,-6],[11,-15],[15,-17],[18,-16],[22,-17],[27,-14],[35,-6],
   [37,10]],
  /* Madagascar */
  [[-13,49],[-16,50],[-21,47],[-25,47],[-26,44],[-20,44],[-14,49],[-13,49]],
  /* Asia (mainland — Arabian Pen., Indian subcontinent, SE Asia included) */
  [[73,55],[77,100],[71,140],[68,162],[60,163],[54,142],[50,140],
   [44,136],[40,124],[32,121],[22,114],[19,109],[10,105],[2,104],
   [2,101],[4,100],[7,100],[14,100],[17,100],[22,103],[22,93],
   [21,87],[13,80],[8,77],[22,66],[25,57],[24,58],
   [23,60],[30,50],[40,50],[44,40],[43,38],[41,34],[39,27],[37,28],
   [37,22],[41,20],[42,38],[45,38],[56,38],[56,52],[60,59],[67,65],
   [73,55]],
  /* Sri Lanka */
  [[10,80],[9,80],[6,81],[6,80],[8,77],[10,80]],
  /* Japan (Honshu + Shikoku + Kyushu combined) */
  [[41,141],[40,140],[36,136],[34,131],[33,130],[34,132],[36,135],
   [37,137],[40,140],[42,140],[41,141]],
  /* Hokkaido */
  [[44,141],[44,143],[43,145],[43,141],[44,141]],
  /* Australia */
  [[-14,127],[-14,136],[-10,136],[-13,142],[-16,145],[-21,149],
   [-26,153],[-32,152],[-34,151],[-38,146],[-38,140],[-38,141],
   [-32,133],[-35,137],[-34,135],[-31,129],[-23,113],[-21,114],
   [-17,122],[-14,127]],
  /* New Zealand — South Island */
  [[-46,167],[-46,168],[-44,171],[-43,173],[-42,171],[-43,170],[-44,168],[-46,167]],
  /* New Zealand — North Island */
  [[-38,174],[-37,175],[-37,176],[-39,176],[-41,175],[-40,172],[-38,174]],
];

/* ═══════════════════════════════════════════════════════════
   GLOBE 3D — interactive world map in the About section
   Location data lives in  data/locations.js  (edit that file).
   ═══════════════════════════════════════════════════════════ */
class Globe3D {

  /* Four-colour scheme:
       cyan   (#00d4ff) — lived places (past homes)
       yellow (#ffeb00) — current home
       blue   (#0099ff) — worktrips (work locations)
       coral  (#ff8c42) — holidays + trips + regions (exploration)
     Visual weight still differentiates lived/current (large, pulsing)
     from worktrip/holiday (small, static) even within colour groups. */
  static PIN_COLORS = { lived: 0x00d4ff, current: 0xffeb00, worktrip: 0x0099ff, holiday: 0xff8c42 };

  static TT_LABEL = { lived: '● Lived', current: '● Current', worktrip: '◆ Worktrip', holiday: '✦ Holiday', trip: '➜ Trip stop' };
  static TT_COLOR = { lived: '#00d4ff', current: '#ffeb00', worktrip: '#0099ff', holiday: '#ff8c42', trip: '#e8edf8' };

  constructor(canvasEl) {
    if (!canvasEl || typeof THREE === 'undefined') return;
    if (typeof LOCATIONS === 'undefined') {
      console.warn('Globe3D: data/locations.js not loaded — globe will not render.');
      return;
    }

    this.canvas = canvasEl;
    this.parent = canvasEl.parentElement;
    this.tooltip = document.getElementById('globe-tooltip');
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Mesh = { threshold: 0.012 };   /* generous hitbox for small pins */
    this.mouse = new THREE.Vector2(-9, -9);
    this._mpos = { x: 0, y: 0 };
    this.pulseRings = [];
    this.markerMeshes = [];
    this.tripAnimations = [];
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };
    this.rotX = 0.25;
    this.rotY = -1.6;   /* initial view: Europe faces camera */
    this.velX = 0;
    this.velY = 0;

    /* Performance: cache tooltip child refs (avoids querySelector every frame) */
    this._ttType = this.tooltip?.querySelector('.gt-type') || null;
    this._ttName = this.tooltip?.querySelector('.gt-name') || null;
    this._ttInfo = this.tooltip?.querySelector('.gt-info') || null;

    /* Performance: skip raycasting when the cursor is outside the canvas */
    this._mouseOver = false;
    /* Performance: cached bounding rect — invalidated on resize */
    this._rect = null;
    /* RAF id for pause/resume */
    this._rafId = null;
    /* Visibility flags */
    this._globeVisible = true;

    /* The mesh the cursor is currently hovering (scaled up for feedback) */
    this._hoveredMesh = null;
    this._isLowPower = isLowPowerDevice();
    this._pixelRatioCap = this._isLowPower ? 1.35 : 2;
    this._starCount = this._isLowPower ? 900 : 1400;
    this._tripCurvePoints = this._isLowPower ? 64 : 96;
    this._frameStep = this._isLowPower ? 2 : 1;
    this._frameTick = 0;

    /* Filtered pins — initially all types visible */
    this.visibleTypes = new Set(['lived', 'current', 'worktrip', 'holiday']);

    this._resize();
    this._initScene();
    this._buildGlobe();
    this._buildAtmosphere();
    this._buildStars();
    this._buildGrid();
    this._buildMarkers();
    this._buildTrips();
    this._bindEvents();
    this._animate();

    /* Store reference on canvas for external access (filtering) */
    this.canvas._globe = this;

    /* Pause when canvas is out of the viewport */
    const _ioGlobe = new IntersectionObserver(([e]) => {
      this._globeVisible = e.isIntersecting;
      if (this._globeVisible && !this._rafId) this._animate();
    }, { threshold: 0 });
    _ioGlobe.observe(canvasEl);

    /* Pause when the browser tab is hidden */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this._rafId) this._animate();
    });
  }

  /* ── Internals ──────────────────────────────────────────── */

  _resize() {
    this.w = this.parent.clientWidth || 800;
    this.h = this.parent.clientHeight || 500;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, this.w / this.h, 0.01, 100);
    this.camera.position.z = 2.75;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this._isLowPower,
      alpha: true,
      powerPreference: this._isLowPower ? 'low-power' : 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), this._pixelRatioCap));
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x000000, 0);

    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this._rafId = null;
      }, false);
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.renderer.setSize(this.w, this.h);
        if (!this._rafId) this._animate();
      }, false);
    }

    /* Ambient: cool fill — keeps the dark ocean dark */
    this.scene.add(new THREE.AmbientLight(0x0d1f3a, 1.2));
    /* Cool-blue key light — replaces the warm sun (no longer needed without photo texture) */
    const key = new THREE.DirectionalLight(0x2255bb, 0.55);
    key.position.set(4, 2, 3);
    this.scene.add(key);
    /* Cyan rim on the opposite side — stronger to complement the neon style */
    const rim = new THREE.PointLight(0x00d4ff, 0.9, 14);
    rim.position.set(-4, 1, -2);
    this.scene.add(rim);
    /* Purple fill from below — adds depth */
    const fill = new THREE.PointLight(0x6c44ff, 0.45, 12);
    fill.position.set(2, -2, -3);
    this.scene.add(fill);

    this.pivot = new THREE.Group();
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;
    this.scene.add(this.pivot);
  }

  /* ── TopoJSON decoder ──────────────────────────────────────────────────────
     Converts a Natural-Earth land TopoJSON (data/world-110m.json) into an
     array of rings, each ring being an array of [lon, lat] pairs.            */
  _decodeTopoJSON(topo) {
    const { scale, translate } = topo.transform;

    /* Decode one arc (delta-encoded integers → geographic [lon, lat]) */
    const decodeArc = (idx) => {
      const rev = idx < 0;
      const raw = topo.arcs[rev ? ~idx : idx];
      let cx = 0, cy = 0;
      const pts = raw.map(([dx, dy]) => {
        cx += dx; cy += dy;
        return [cx * scale[0] + translate[0], cy * scale[1] + translate[1]];
      });
      return rev ? pts.reverse() : pts;
    };

    const rings = [];
    for (const geom of topo.objects.land.geometries) {
      const polys = geom.type === 'Polygon' ? [geom.arcs] : geom.arcs;
      for (const poly of polys) {
        /* Join all arc segments that form the outer ring (index 0); skip holes */
        const ring = [];
        for (const arcIdx of poly[0]) ring.push(...decodeArc(arcIdx));
        rings.push(ring);
      }
    }
    return rings;
  }

  /* rings: array of [[lon, lat], …] polygons (GeoJSON coordinate order).
     cvs and _THREE are captured synchronously before any await so that the
     async completion in _buildGlobe() never reads from globals after they
     may have been restored (e.g. in test teardown).                         */
  _buildGlobeTexture(rings, cvs, _THREE) {
    const W = 2048, H = 1024;
    cvs.width = W; cvs.height = H;
    const ctx = cvs.getContext('2d');

    /* Deep-ocean background */
    ctx.fillStyle = '#030d1c';
    ctx.fillRect(0, 0, W, H);

    /* lon, lat → canvas pixel (equirectangular) */
    const px = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];

    /* Antarctica: filled band at bottom of map */
    const antY = (90 - (-68)) / 180 * H;
    ctx.fillStyle = '#0e2640';
    ctx.fillRect(0, antY, W, H - antY);

    /* Draw one ring with a multi-pass neon glow stroke */
    const drawRing = ring => {
      ctx.beginPath();
      const [x0, y0] = px(ring[0][0], ring[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = px(ring[i][0], ring[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#0e2640';
      ctx.fill();
      /* outer glow halo */ ctx.lineWidth = 5;   ctx.strokeStyle = 'rgba(0,185,235,0.25)'; ctx.stroke();
      /* mid glow        */ ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,210,255,0.60)'; ctx.stroke();
      /* bright core     */ ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(155,242,255,1.00)'; ctx.stroke();
    };

    /* Paint European land with dark neon violet BEFORE the neon coastlines
       so that the glow strokes are visible on top of the fill.
       Clip to each land polygon individually (not the rectangle) so that
       only actual land areas receive the fill — avoids purple bleeding into sea. */
    const europeMinLon = -10; const europeMaxLon = 40;
    const europeMinLat = 35;  const europeMaxLat = 71;
    const [clipX0, clipY0] = px(europeMinLon, europeMaxLat);
    const [clipX1, clipY1] = px(europeMaxLon, europeMinLat);

    const overlapsEuropeBounds = (ring) => {
      for (let i = 0; i < ring.length; i++) {
        const lon = ring[i][0];
        const lat = ring[i][1];
        if (lon >= europeMinLon && lon <= europeMaxLon && lat >= europeMinLat && lat <= europeMaxLat) {
          return true;
        }
      }
      return false;
    };

    rings.forEach((ring) => {
      if (!overlapsEuropeBounds(ring)) return;
      ctx.save();
      /* Clip to the Europe rectangle first */
      ctx.beginPath();
      ctx.rect(clipX0, clipY0, clipX1 - clipX0, clipY1 - clipY0);
      ctx.clip();
      /* Then clip to the land polygon — intersection = land within Europe */
      ctx.beginPath();
      const [x0, y0] = px(ring[0][0], ring[0][1]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = px(ring[i][0], ring[i][1]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.clip();
      /* Fill — only visible where both clips overlap (land in Europe) */
      ctx.fillStyle = '#4e2870';
      ctx.fillRect(clipX0, clipY0, clipX1 - clipX0, clipY1 - clipY0);
      ctx.restore();
    });

    /* Draw all land rings with neon glow (on top of the Europe violet fill) */
    rings.forEach(drawRing);

    /* Antarctica border line */
    ctx.lineWidth = 2;   ctx.strokeStyle = 'rgba(0,210,255,0.50)';
    ctx.beginPath(); ctx.moveTo(0, antY); ctx.lineTo(W, antY); ctx.stroke();
    ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(155,242,255,0.95)';
    ctx.beginPath(); ctx.moveTo(0, antY); ctx.lineTo(W, antY); ctx.stroke();

    return new _THREE.CanvasTexture(cvs);
  }

  async _buildGlobe() {
    /* ── Procedural neon-continent texture ────────────────────────────────────
       Fetches data/world-110m.json (Natural Earth 110m TopoJSON, 54 KB),
       decodes it inline, draws 125 precise land rings on a neon-cyan canvas
       texture, and maps it onto the sphere.  Falls back to the simplified
       GLOBE_CONTINENTS polygons if the fetch fails (e.g. file:// dev).

       THREE and cvs are captured synchronously before any await so that the
       async continuation never reads globals after test teardown restores them. */
    const _THREE = THREE; /* eslint-disable-line no-undef */
    const cvs = document.createElement('canvas');

    const mat = new _THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.pivot.add(new _THREE.Mesh(new _THREE.SphereGeometry(1, 64, 64), mat));

    try {
      const topo  = await getTopoJSON();
      const rings = this._decodeTopoJSON(topo);
      const tex   = this._buildGlobeTexture(rings, cvs, _THREE);
      mat.map = tex;
      mat.needsUpdate = true;
    } catch (_) {
      /* Fallback: hand-drawn polygons (stored as [lat,lon] — swap to [lon,lat]) */
      const rings = GLOBE_CONTINENTS.map(pts => pts.map(([lat, lon]) => [lon, lat]));
      const tex   = this._buildGlobeTexture(rings, cvs, _THREE);
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  _buildAtmosphere() {
    /* Inner surface glow — neon cyan tint */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.007, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.07, depthWrite: false }),
    ));
    /* Atmosphere shell — deep electric blue */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x1166ee, transparent: true, opacity: 0.13, side: THREE.BackSide, depthWrite: false }),
    ));
    /* Wide outer halo — violet, additive */
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.24, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x6c63ff, transparent: true, opacity: 0.055, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    ));
  }

  _buildStars() {
    /* Distribute stars on a large sphere around the scene */
    const COUNT = this._starCount;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8 + Math.random() * 4;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.018, transparent: true, opacity: 0.5, sizeAttenuation: true }),
    ));
  }

  _buildGrid() {
    /* Neon cyan lat-lon grid with additive blending for glow */
    const mat = (op, bright) => new THREE.LineBasicMaterial({
      color: bright ? 0x00ffff : 0x00c8f0,
      transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const R = 1.002;
    for (let lat = -80; lat <= 80; lat += 20) {
      const phi = (90 - lat) * Math.PI / 180;
      const r = R * Math.sin(phi), y = R * Math.cos(phi), pts = [];
      for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(lat === 0 ? 0.55 : 0.20, lat === 0)));
    }
    for (let lon = 0; lon < 360; lon += 20) {
      const theta = lon * Math.PI / 180, pts = [];
      for (let i = 0; i <= 64; i++) { const p = (i / 64) * Math.PI; pts.push(new THREE.Vector3(R * Math.sin(p) * Math.cos(theta), R * Math.cos(p), R * Math.sin(p) * Math.sin(theta))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(0.20, false)));
    }
  }

  /* Lat/lon → THREE.Vector3 on a sphere of radius r */
  _ll(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  }

  /* Orient a flat mesh (CircleGeometry / RingGeometry) to lie on the sphere surface */
  _faceOut(mesh, pos) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize());
  }

  /* ── Standard pins (lived / work / travel) ──────────────── */
  _buildMarkers() {
    (LOCATIONS.pins || [])
      .filter(loc => {
        if (loc._skip) return false;
        /* Hide European worktrips and holidays on globe — show only on 2D map */
        if ((loc.type === 'worktrip' || loc.type === 'holiday') && 
            loc.lat >= 35 && loc.lat <= 71 && 
            loc.lon >= -10 && loc.lon <= 40) {
          return false;
        }
        return true;
      })
      .forEach(loc => {
      const hex = Globe3D.PIN_COLORS[loc.type] || 0xffffff;
      const color = new THREE.Color(hex);
      const pos = this._ll(loc.lat, loc.lon, 1.008);
      const surf = this._ll(loc.lat, loc.lon, 1.001);
      const isHome = (loc.type === 'lived' || loc.type === 'current');   /* bigger, pulsing — "I live/lived here" */

      /* Spike — thin line from globe surface up to the dot */
      this.pivot.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([surf, pos]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: isHome ? 0.55 : 0.30 }),
      ));

      /* Dot — small, similar to trip city-stop dots */
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(isHome ? 0.006 : 0.005, 10, 10),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      this.pivot.add(dot);

      /* Invisible hit-test sphere — much larger for reliable hover detection.
         Raycaster threshold is ignored for Mesh objects, so we need actual
         geometry large enough to intersect the ray. */
      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitArea.position.copy(pos);
      hitArea.userData = { name: loc.name, info: loc.info, type: loc.type };
      this.pivot.add(hitArea);
      this.markerMeshes.push(hitArea);

      /* Subtle halo ring — just enough to make the dot readable */
      const [rIn, rOut, op] = isHome ? [0.006, 0.008, 0.30] : [0.005, 0.0065, 0.18];
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(rIn, rOut, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
      );
      halo.position.copy(pos);
      this._faceOut(halo, pos);
      this.pivot.add(halo);

      /* Single subtle pulse ring — only for lived/home pins */
      if (isHome) {
        [0, Math.PI].forEach(phaseOffset => {
          const pulse = new THREE.Mesh(
            new THREE.RingGeometry(0.004, 0.006, 32),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
          );
          pulse.position.copy(pos);
          this._faceOut(pulse, pos);
          pulse.userData = { phase: phaseOffset, speed: 0.42 };
          this.pivot.add(pulse);
          this.pulseRings.push(pulse);
        });
      }
    });
  }

  /* ── Trip paths with animated traveller + comet trail ───── */
  _buildTrips() {
    (LOCATIONS.trips || []).forEach(trip => {
      const color = new THREE.Color(trip.color || '#ff8c42');
      const cities = (trip.cities || []).filter(c => !c._skip);
      if (cities.length < 2) return;

      const curves = [];
      const segLens = [];
      let total = 0;

      for (let i = 0; i < cities.length - 1; i++) {
        const s = this._ll(cities[i].lat, cities[i].lon, 1.006);
        const e = this._ll(cities[i + 1].lat, cities[i + 1].lon, 1.006);

        /* Adaptive arc height — low lift for short hops (typical trips),
           scales up only for genuinely long-haul segments.
           Guard against near-antipodal pairs (sum ≈ 0) by falling back
           to a perpendicular control point. */
        const chord = s.distanceTo(e);
        const lift = 1.0 + Math.min(0.28, 0.02 + chord * 0.18);
        const sum = s.clone().add(e);
        if (sum.length() < 0.001) sum.set(1, 0, 0).cross(s).normalize();
        else sum.normalize();
        const mid = sum.multiplyScalar(lift);

        const curve = new THREE.QuadraticBezierCurve3(s, mid, e);
        curves.push(curve);
        const len = curve.getLength();
        segLens.push(len);
        total += len;

        const pts = curve.getPoints(this._tripCurvePoints);
        /* Soft outer glow */
        this.pivot.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
        /* Bright core */
        this.pivot.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
      }

      /* City-stop dots */
      const seen = new Set();
      cities.forEach(city => {
        const key = `${city.lat},${city.lon}`;
        if (seen.has(key)) return;
        seen.add(key);
        const cpos = this._ll(city.lat, city.lon, 1.010);
        const cdot = new THREE.Mesh(
          new THREE.SphereGeometry(0.006, 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
        );
        cdot.position.copy(cpos);
        this.pivot.add(cdot);

        /* Invisible hit-test sphere for reliable hover */
        const cHit = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 8, 8),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        cHit.position.copy(cpos);
        cHit.userData = { name: city.name, info: trip.name, type: 'trip' };
        this.pivot.add(cHit);
        this.markerMeshes.push(cHit);
      });

      /* Traveller dot — explicit opacity:0 to avoid a 1-frame opaque flash */
      const traveller = new THREE.Mesh(
        new THREE.SphereGeometry(0.009, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
      );
      this.pivot.add(traveller);

      /* Comet trail — 6 progressively smaller/dimmer dots trailing behind */
      const TRAIL = 6;
      const trail = [];
      for (let ti = 0; ti < TRAIL; ti++) {
        const frac = 1 - ti / TRAIL;
        const td = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.002, 0.008 * frac * 0.8), 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
        );
        this.pivot.add(td);
        trail.push(td);
      }

      this.tripAnimations.push({
        curves, segLens, total,
        particle: traveller,
        trail,
        cycleSec: trip.cycleSec || 28,
        offset: Math.random(),
      });
    });
  }

  /* Return the 3-D position on trip anim at fractional time gT ∈ [0,1) */
  _tripPos(anim, gT) {
    const norm = ((gT % 1) + 1) % 1;
    let rem = norm * anim.total;
    for (let i = 0; i < anim.segLens.length; i++) {
      if (rem <= anim.segLens[i] + 1e-6) {
        return anim.curves[i].getPoint(Math.min(rem / Math.max(anim.segLens[i], 1e-6), 1));
      }
      rem -= anim.segLens[i];
    }
    return anim.curves[anim.curves.length - 1].getPoint(1);
  }

  /* ── Events ─────────────────────────────────────────────── */
  _bindEvents() {
    const cv = this.canvas;
    const start = (x, y) => { this.isDragging = true; this.prevMouse = { x, y }; this.velX = this.velY = 0; };
    const move = (x, y) => {
      if (this.isDragging) {
        const dx = x - this.prevMouse.x, dy = y - this.prevMouse.y;
        this.velX = dy * 0.005; this.velY = dx * 0.005;
        this.rotX = Math.max(-1.2, Math.min(1.2, this.rotX + dy * 0.005));
        this.rotY += dx * 0.005;
        this.prevMouse = { x, y };
      }
      /* Refresh rect every move to avoid stale position after scroll/layout changes */
      this._rect = cv.getBoundingClientRect();
      const rect = this._rect;
      this._mpos = { x: x - rect.left, y: y - rect.top };
      this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = ((y - rect.top) / rect.height) * -2 + 1;
    };
    const end = () => { this.isDragging = false; };

    cv.addEventListener('mousedown', e => start(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', end);
    /* mouseenter / mouseleave gate raycasting to when the cursor is
       actually over the canvas — huge win when browsing other sections */
    cv.addEventListener('mouseenter', () => { this._mouseOver = true; });
    cv.addEventListener('mouseleave', () => {
      this._mouseOver = false;
      if (this._hoveredMesh) {
        this._hoveredMesh.scale.setScalar(1);
        this._hoveredMesh = null;
      }
      this.tooltip?.classList.remove('visible');
    });
    cv.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    cv.addEventListener('touchmove', e => { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    cv.addEventListener('touchend', end);
    window.addEventListener('resize', () => {
      this._rect = null;   /* invalidate cached bounding rect */
      this._resize();
      this.camera.aspect = this.w / this.h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.w, this.h);
      this.renderer.setPixelRatio(Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1), this._pixelRatioCap));
    });
  }

  /* ── Render loop ────────────────────────────────────────── */
  _animate() {
    /* Stop the loop when the tab is hidden or the globe is off-screen */
    if (document.hidden || !this._globeVisible) { this._rafId = null; return; }
    this._rafId = requestAnimationFrame(() => this._animate());
    if ((this._frameTick++ % this._frameStep) !== 0) return;

    const t = performance.now() * 0.001;   /* seconds */

    /* Globe rotation — smooth inertia + organic auto-spin.
       Lerp velY toward the target speed so it accelerates into the
       auto-spin after a drag, with no threshold jerk. */
    if (!this.isDragging) {
      const TARGET_SPIN = 0.0014;
      this.velX *= 0.92;
      this.velY += (TARGET_SPIN - this.velY) * 0.018;
      this.rotX = Math.max(-1.2, Math.min(1.2, this.rotX + this.velX));
      this.rotY += this.velY;
    }
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;

    /* Pulse rings — two per lived pin, staggered by π */
    this.pulseRings.forEach(ring => {
      const norm = ((t * ring.userData.speed + ring.userData.phase) % (Math.PI * 2)) / (Math.PI * 2);
      ring.scale.set(1 + norm * 2.2, 1 + norm * 2.2, 1);
      ring.material.opacity = (1 - norm) * 0.45;
    });

    /* Trip travellers + comet trails */
    this.tripAnimations.forEach(anim => {
      const globalT = ((t / anim.cycleSec) + anim.offset) % 1;
      const TRAIL_GAP = 0.022;   /* fractional time gap between each trail dot */

      anim.particle.position.copy(this._tripPos(anim, globalT));
      anim.particle.material.opacity = 0.92;

      anim.trail.forEach((dot, ti) => {
        dot.position.copy(this._tripPos(anim, globalT - (ti + 1) * TRAIL_GAP));
        dot.material.opacity = (1 - (ti + 1) / (anim.trail.length + 1)) * 0.75;
      });
    });

    /* Hover raycasting — only when the cursor is over the canvas.
       This eliminates all raycasting cost during normal page browsing
       and on touch devices (where mouseenter never fires). */
    if (this._mouseOver && this.markerMeshes.length) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.markerMeshes);
      if (hits.length > 0) {
        const hit = hits[0].object;
        /* Scale up the hovered hit-area; reset the previously hovered one */
        if (this._hoveredMesh !== hit) {
          if (this._hoveredMesh) this._hoveredMesh.scale.setScalar(1);
          hit.scale.setScalar(2.0);
          this._hoveredMesh = hit;
          this.canvas.style.cursor = 'pointer';
        }
        const { name, info, type } = hit.userData;
        if (this.tooltip) {
          this._ttType.textContent = Globe3D.TT_LABEL[type] || type;
          this._ttType.style.color = Globe3D.TT_COLOR[type] || '#e8edf8';
          this._ttName.textContent = name;
          this._ttInfo.textContent = '';
          let tx = this._mpos.x + 18, ty = this._mpos.y - 14;
          if (tx + 220 > this.w) tx = this._mpos.x - 228;
          if (ty + 90 > this.h) ty = this._mpos.y - 96;
          if (ty < 4) ty = 4;
          this.tooltip.style.left = tx + 'px';
          this.tooltip.style.top = ty + 'px';
          this.tooltip.classList.add('visible');
        }
      } else {
        if (this._hoveredMesh) { this._hoveredMesh.scale.setScalar(1); this._hoveredMesh = null; this.canvas.style.cursor = ''; }
        this.tooltip?.classList.remove('visible');
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/* CPU fallback when WebGL is unavailable: 2D orthographic globe */
class GlobeFallback2D {
  static PIN_COLORS = { lived: '#00d4ff', current: '#ffeb00', worktrip: '#0099ff', holiday: '#ff8c42' };

  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.parent = canvasEl.parentElement;
    this.ctx = canvasEl.getContext('2d', { alpha: true });
    if (!this.ctx) return;
    this._visible = true;
    this._rafId = null;
    this._isLowPower = isLowPowerDevice();
    this._rot = -1.55;
    this._spin = this._isLowPower ? 0.001 : 0.0016;
    this._drag = false;
    this._prevX = 0;
    this._points = [];

    this._collectPoints();
    this._resize();
    this._bindEvents();
    this._animate();

    const io = new IntersectionObserver(([entry]) => {
      this._visible = entry.isIntersecting;
      if (this._visible && !this._rafId) this._animate();
    }, { threshold: 0 });
    io.observe(canvasEl);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this._rafId) this._animate();
    });
  }

  _collectPoints() {
    this._points.length = 0;
    (LOCATIONS.pins || []).forEach((p) => {
      if (p._skip) return;
      this._points.push({ lat: p.lat, lon: p.lon, type: p.type });
    });
  }

  _resize() {
    this.w = this.parent?.clientWidth || 800;
    this.h = this.parent?.clientHeight || 500;
    const dpr = Math.min(window.devicePixelRatio || 1, this._isLowPower ? 1.2 : 1.7);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.w * 0.5;
    this.cy = this.h * 0.52;
    this.r = Math.min(this.w, this.h) * 0.3;
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => { this._drag = true; this._prevX = e.clientX; });
    window.addEventListener('mousemove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._prevX;
      this._rot += dx * 0.0045;
      this._prevX = e.clientX;
    });
    window.addEventListener('mouseup', () => { this._drag = false; });
    this.canvas.addEventListener('touchstart', (e) => { if (e.touches[0]) { this._drag = true; this._prevX = e.touches[0].clientX; } }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      if (!this._drag || !e.touches[0]) return;
      const dx = e.touches[0].clientX - this._prevX;
      this._rot += dx * 0.0045;
      this._prevX = e.touches[0].clientX;
    }, { passive: true });
    this.canvas.addEventListener('touchend', () => { this._drag = false; });
    window.addEventListener('resize', () => this._resize());
  }

  _project(lat, lon) {
    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180 + this._rot;
    const cosPhi = Math.cos(phi);
    const x = cosPhi * Math.sin(lam);
    const y = Math.sin(phi);
    const z = cosPhi * Math.cos(lam);
    return { x: this.cx + this.r * x, y: this.cy - this.r * y, z };
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(210,220,255,0.14)';
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      let open = false;
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = this._project(lat, lon);
        if (p.z <= 0) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    for (let lon = -150; lon <= 150; lon += 30) {
      let open = false;
      ctx.beginPath();
      for (let lat = -85; lat <= 85; lat += 3) {
        const p = this._project(lat, lon);
        if (p.z <= 0) { open = false; continue; }
        if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    const bg = ctx.createRadialGradient(this.cx - this.r * 0.25, this.cy - this.r * 0.35, this.r * 0.2, this.cx, this.cy, this.r * 1.25);
    bg.addColorStop(0, 'rgba(56,96,170,0.9)');
    bg.addColorStop(0.55, 'rgba(16,34,70,0.92)');
    bg.addColorStop(1, 'rgba(5,14,34,0.96)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.r, 0, Math.PI * 2);
    ctx.fill();

    this._drawGrid();

    this._points.forEach((pt) => {
      const p = this._project(pt.lat, pt.lon);
      if (p.z <= 0.02) return;
      const col = GlobeFallback2D.PIN_COLORS[pt.type] || '#e8edf8';
      const rr = (pt.type === 'lived' || pt.type === 'current') ? 2.9 : 2.2;
      ctx.fillStyle = col;
      ctx.globalAlpha = Math.max(0.22, p.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    const halo = ctx.createRadialGradient(this.cx, this.cy, this.r * 0.86, this.cx, this.cy, this.r * 1.35);
    halo.addColorStop(0, 'rgba(108,99,255,0)');
    halo.addColorStop(1, 'rgba(108,99,255,0.24)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.r * 1.35, 0, Math.PI * 2);
    ctx.fill();
  }

  _animate() {
    if (document.hidden || !this._visible) { this._rafId = null; return; }
    this._rafId = requestAnimationFrame(() => this._animate());
    if (!this._drag) this._rot += this._spin;
    this._draw();
  }
}

/* ═══════════════════════════════════════════════════════════
   SCROLL-TRIGGERED REVEAL
   ═══════════════════════════════════════════════════════════ */
function initScrollReveal() {
  const targets = document.querySelectorAll('[data-animate]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('visible'), delay);
      observer.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  targets.forEach(el => observer.observe(el));
}

/* ═══════════════════════════════════════════════════════════
   ANIMATED STAT COUNTERS
   ═══════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const end = parseInt(el.dataset.count, 10);
      animateCounter(el, end);
      observer.unobserve(el);
    });
  }, { threshold: 0.6 });

  counters.forEach(el => observer.observe(el));
}

function animateCounter(el, target) {
  const duration = 1800;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    /* Ease-out cubic */
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR SCROLL BEHAVIOUR
   ═══════════════════════════════════════════════════════════ */
function initTheme() {
  /* Theme switching intentionally disabled: dark mode is fixed. */
}

function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const progressBar = document.getElementById('reading-progress');

  /* ── Project page: highlight "Projects" nav link ────────── */
  const isProjectPage = typeof window !== 'undefined' && window.location?.pathname?.includes('/projects/');
  if (isProjectPage) {
    const projectLink = document.querySelector('#nav-links a[href*="#projects"]');
    if (projectLink) projectLink.setAttribute('aria-current', 'true');
  }

  const links = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('#nav-links a[href^="#"]'))
    : [];
  const targets = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  /* ── Section tracking with IntersectionObserver ────────── */
  let activeId = targets[0]?.id || '';
  const setActiveLink = () => {
    links.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${activeId}`;
      link.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  };

  if (targets.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          activeId = entry.target.id;
          setActiveLink();
        }
      });
    }, { rootMargin: '-35% 0px -65% 0px' });
    targets.forEach((t) => observer.observe(t));
  } else if (targets.length) {
    /* Fallback for browsers without IntersectionObserver */
    window.addEventListener('scroll', () => {
      const checkpoint = window.scrollY + (window.innerHeight * 0.35);
      targets.forEach((section) => {
        if (checkpoint >= section.offsetTop) activeId = section.id;
      });
      setActiveLink();
    }, { passive: true });
  }

  const updateReadingProgress = () => {
    if (!progressBar) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    progressBar.style.width = `${pct}%`;
  };

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 20);
    updateReadingProgress();
  }, { passive: true });

  setActiveLink();
  updateReadingProgress();
}

/* ═══════════════════════════════════════════════════════════
   BACK TO TOP BUTTON
   ═══════════════════════════════════════════════════════════ */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > window.innerHeight * 0.6);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATION
   ═══════════════════════════════════════════════════════════ */
function showToast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('visible'), 2500);
}

/* ═══════════════════════════════════════════════════════════
   COMMAND PALETTE  (⌘K / Ctrl+K)
   ═══════════════════════════════════════════════════════════ */
function initCommandPalette() {
  const overlay  = document.getElementById('cmd-overlay');
  const input    = document.getElementById('cmd-input');
  const listEl   = document.getElementById('cmd-list');
  if (!overlay || !input || !listEl) return;

  /* ── Command definitions ───────────────────────────────── */
  const SECTIONS = [
    { id: 'about',        label: 'About',        hint: 'Who I am' },
    { id: 'research',     label: 'Research',      hint: 'What I work on' },
    { id: 'publications', label: 'Publications',  hint: 'Selected papers' },
    { id: 'cv',           label: 'CV',            hint: 'Experience & Education', href: 'cv.html' },
    { id: 'skills',       label: 'Skills',        hint: 'Expertise' },
    { id: 'projects',     label: 'Projects',      hint: 'Things I\u2019ve built', href: 'projects.html' },
    { id: 'contact',      label: 'Contact',       hint: 'Get in touch' },
  ];

  const ACTIONS = [
    {
      label: 'Open CV PDF',
      hint: 'Download / view',
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v12M8 12l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      action() { window.open('docs/cv.pdf', '_blank'); },
    },
    {
      label: 'Copy email address',
      hint: 'To clipboard',
      icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 16V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      action() {
        const email = document.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.replace('mailto:', '') || '';
        if (email && email !== 'your.email@example.com') {
          navigator.clipboard?.writeText(email).then(() => showToast('Email copied!')).catch(() => {});
        }
      },
    },
    {
      label: 'LinkedIn profile',
      hint: 'Open in new tab',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0H5C2.24 0 0 2.24 0 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5V5c0-2.76-2.24-5-5-5zM8 19H5V8h3v11zM6.5 6.73a1.77 1.77 0 1 1 0-3.54 1.77 1.77 0 0 1 0 3.54zM20 19h-3v-5.6c0-3.37-4-3.12-4 0V19h-3V8h3v1.77C14.4 7.22 20 7.03 20 12.41V19z"/></svg>`,
      action() { window.open('https://www.linkedin.com/in/stefanomasneri/', '_blank'); },
    },
    {
      label: 'Google Scholar',
      hint: 'Open in new tab',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm-1 12.99L5 12.4V15l6 3.35L17 15v-2.61l-6 3.6z"/></svg>`,
      action() { window.open('https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en', '_blank'); },
    },
  ];

  const navIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  /* ── Build all command items ────────────────────────────── */
  let allItems = [
    ...SECTIONS.map(s => ({
      label: s.label,
      hint: s.hint,
      icon: navIcon,
      action() {
        if (s.href) {
          window.location.href = s.href;
        } else {
          const el = document.getElementById(s.id);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      },
      group: 'Navigate',
    })),
    ...ACTIONS.map(a => ({ ...a, group: 'Actions' })),
  ];

  let filtered = allItems;
  let activeIdx = 0;

  /* ── Render list ────────────────────────────────────────── */
  function render(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'cmd-item';
      li.style.color = 'var(--text-faint)';
      li.textContent = 'No results';
      listEl.appendChild(li);
      return;
    }

    let lastGroup = null;
    items.forEach((item, i) => {
      if (item.group !== lastGroup) {
        const label = document.createElement('li');
        label.className = 'cmd-group-label';
        label.setAttribute('role', 'presentation');
        label.textContent = item.group;
        listEl.appendChild(label);
        lastGroup = item.group;
      }
      const li = document.createElement('li');
      li.className = 'cmd-item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === activeIdx));
      li.innerHTML = `
        <span class="cmd-item-icon">${item.icon}</span>
        <span class="cmd-item-label">${item.label}</span>
        <span class="cmd-item-hint">${item.hint || ''}</span>
      `;
      li.addEventListener('mouseenter', () => { activeIdx = i; render(filtered); });
      li.addEventListener('click', () => { execute(item); });
      listEl.appendChild(li);
    });
  }

  /* ── Execute & close ────────────────────────────────────── */
  function execute(item) {
    close();
    item.action();
  }

  /* ── Filter on input ────────────────────────────────────── */
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    filtered = q
      ? allItems.filter(it => it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q))
      : allItems;
    activeIdx = 0;
    render(filtered);
  });

  /* ── Keyboard navigation ────────────────────────────────── */
  input.addEventListener('keydown', (e) => {
    const visibleItems = filtered.filter(Boolean); /* same array */
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, visibleItems.length - 1);
      render(visibleItems);
      listEl.querySelectorAll('.cmd-item')[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      render(visibleItems);
      listEl.querySelectorAll('.cmd-item')[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleItems[activeIdx]) execute(visibleItems[activeIdx]);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  /* ── Open / close ───────────────────────────────────────── */
  function open() {
    filtered = allItems;
    activeIdx = 0;
    input.value = '';
    render(filtered);
    overlay.hidden = false;
    requestAnimationFrame(() => input.focus());
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  /* Close on overlay click */
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  /* Global keyboard shortcut — ⌘K or Ctrl+K */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.hidden ? open() : close();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   SIDE PROGRESS DOTS
   ═══════════════════════════════════════════════════════════ */
function initSideDots() {
  const nav = document.getElementById('side-dots');
  if (!nav) return;

  /* Only activate on fine-pointer (mouse) viewports — CSS hides on coarse/narrow */
  if (!window.matchMedia('(pointer: fine) and (min-width: 901px)').matches) return;

  const sections = Array.from(
    document.querySelectorAll('section[id], div[id="hero"]')
  ).filter(s => s.id);

  if (!sections.length) return;

  /* Build dots */
  sections.forEach(section => {
    const label = section.getAttribute('aria-label') || section.id;
    const btn = document.createElement('button');
    btn.className = 'side-dot';
    btn.dataset.label = label.charAt(0).toUpperCase() + label.slice(1);
    btn.setAttribute('aria-label', `Go to ${label}`);
    btn.setAttribute('aria-current', 'false');
    btn.addEventListener('click', () => {
      section.scrollIntoView({ behavior: 'smooth' });
    });
    nav.appendChild(btn);
  });

  const dots = Array.from(nav.querySelectorAll('.side-dot'));

  /* Show nav after scrolling past the hero */
  function onScroll() {
    const scrolled = window.scrollY > window.innerHeight * 0.5;
    nav.classList.toggle('visible', scrolled);

    /* Determine the active section (first one whose top is ≤ 60% viewport height) */
    let active = 0;
    const threshold = window.innerHeight * 0.5;
    sections.forEach((sec, i) => {
      if (sec.getBoundingClientRect().top <= threshold) active = i;
    });

    dots.forEach((dot, i) => {
      dot.setAttribute('aria-current', String(i === active));
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); /* run once on init */
}

/* ═══════════════════════════════════════════════════════════
   STAGGERED HERO TAGLINE REVEAL
   ═══════════════════════════════════════════════════════════ */
function initTaglineReveal() {
  if (prefersReducedMotion()) return;
  const tagline = document.querySelector('.hero-tagline');
  if (!tagline) return;

  /* Split on the · separator, then further split each phrase into words */
  const text = tagline.textContent.trim();
  const parts = text.split('·');
  let delay = 120; /* ms — start after a brief pause */
  const STEP = 40;  /* ms per word */

  const spans = [];
  parts.forEach((phrase, partIdx) => {
    const words = phrase.trim().split(/\s+/).filter(Boolean);
    words.forEach(word => {
      spans.push(`<span class="tagline-word" style="animation-delay:${delay}ms">${word}</span>`);
      delay += STEP;
    });
    if (partIdx < parts.length - 1) {
      spans.push(`<span class="tagline-sep" style="animation-delay:${delay}ms">·</span>`);
      delay += STEP;
    }
  });

  tagline.innerHTML = spans.join(' ');
}

/* ═══════════════════════════════════════════════════════════
   CURSOR GLOW — disabled for performance
   The body::after radial gradient forced full-page repaints
   on every mousemove. CSS rule also removed.
   ═══════════════════════════════════════════════════════════ */
function initCursorGlow() {
  /* intentionally empty — effect removed to save battery */
}

/* ═══════════════════════════════════════════════════════════
   MOBILE MENU TOGGLE
   ═══════════════════════════════════════════════════════════ */
function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  const setMenuState = (open) => {
    toggle.classList.toggle('open', open);
    links.classList.toggle('open', open);
    document.body?.classList?.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
  };

  toggle.addEventListener('click', () => setMenuState(!toggle.classList.contains('open')));

  /* Close on link click */
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => setMenuState(false));
  });

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.classList.contains('open')) setMenuState(false);

      /* Focus trapping when mobile menu is open */
      if (e.key === 'Tab' && toggle.classList.contains('open')) {
        const focusable = [toggle, ...links.querySelectorAll('a')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!toggle.classList.contains('open')) return;
      if (toggle.contains?.(e.target) || links.contains?.(e.target)) return;
      setMenuState(false);
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   DYNAMIC CONTENT RENDERERS
   Publications and projects are the only sections rendered
   by JS — their data lives in data/publications.js and
   data/projects.js respectively.
   ═══════════════════════════════════════════════════════════ */

/* Format YYYY-MM-DD without timezone shifts in local browsers */
function formatIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const utcDate = new Date(Date.UTC(y, mo - 1, d));
  return utcDate.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeBase64(raw) {
  try {
    return atob(raw || '');
  } catch (_) {
    return '';
  }
}

function getObfuscatedContactEmail() {
  const card = document.querySelector('.contact-email-obfuscated');
  if (!card) return '';
  const user = decodeBase64(card.dataset.emailUser || '');
  const domain = decodeBase64(card.dataset.emailDomain || '');
  if (!user || !domain) return '';
  return `${user}@${domain}`;
}

function initEmailObfuscation() {
  const card = document.querySelector('.contact-email-obfuscated');
  if (!card) return;
  const valueEl = card.querySelector('.contact-value');
  const email = getObfuscatedContactEmail();
  if (!email) return;

  /* Show the email text immediately (CSS blur hides it visually) */
  if (valueEl) valueEl.textContent = email;

  const revealEmail = () => {
    card.dataset.emailRevealed = 'true';
    card.setAttribute('href', `mailto:${email}`);
    card.setAttribute('aria-label', `Send email to ${email}`);
  };

  card.addEventListener('mouseenter', () => {
    if (card.dataset.emailRevealed === 'true') return;
    revealEmail();
  });

  card.addEventListener('click', (e) => {
    if (card.dataset.emailRevealed === 'true') return;
    e.preventDefault();
    revealEmail();
  });

  card.addEventListener('keydown', (e) => {
    if (card.dataset.emailRevealed === 'true') return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    revealEmail();
  });
}

/* Publication items — data source: PUBLICATIONS (data/publications.js) */
function renderPublications() {
  const list = document.getElementById('publications-list');
  if (!list) return;

  list.innerHTML = PUBLICATIONS.slice(0, 3).map((pub, i) => `
    <a href="${escapeHtml(pub.url || '#')}" target="_blank" rel="noopener" class="pub-item research-card" role="listitem" data-animate data-delay="${i * 70}" aria-label="Open paper: ${escapeHtml(pub.title)}">
      <div class="pub-year">${escapeHtml(pub.year)}</div>
      <div class="pub-title">${escapeHtml(pub.title)}</div>
      <div class="pub-meta">
        ${escapeHtml(pub.authors)} &nbsp;·&nbsp;
        <span class="pub-venue">${escapeHtml(pub.venue)}</span>
      </div>
    </a>
  `).join('');
}

/* Project cards — data source: PROJECTS (data/projects.js) */
var PROJECTS_MAX_HOMEPAGE = 4;

function renderProjectCard(project, i) {
  const tagsHtml = (project.tags || [])
    .map(function(t) { return '<span class="project-tag">' + escapeHtml(t) + '</span>'; })
    .join('');
  return '<a href="' + escapeHtml(project.url || '#') + '" class="project-card" data-animate data-delay="' + (i * 80) + '">' +
    '<div class="project-card__thumb-wrap">' +
      '<img class="project-card__thumb" src="' + escapeHtml(project.thumb || '') + '" alt="' + escapeHtml(project.title) + '" loading="lazy" />' +
    '</div>' +
    '<div class="project-card__body">' +
      '<span class="project-card__year">' + escapeHtml(project.year || '') + '</span>' +
      '<span class="project-card__title">' + escapeHtml(project.title) + '</span>' +
      '<div class="project-card__tags">' + tagsHtml + '</div>' +
      '<p class="project-card__desc">' + escapeHtml(project.description || '') + '</p>' +
    '</div>' +
  '</a>';
}

function renderProjects() {
  var grid = document.getElementById('projects-grid');
  if (!grid) return;

  if (!PROJECTS.length) {
    grid.innerHTML = '<div class="projects-coming-soon" data-animate>Coming soon — projects will appear here.</div>';
    return;
  }

  var shown = PROJECTS.slice(0, PROJECTS_MAX_HOMEPAGE);
  grid.innerHTML = shown.map(renderProjectCard).join('');

  if (PROJECTS.length > PROJECTS_MAX_HOMEPAGE) {
    var footer = document.createElement('div');
    footer.className = 'projects-view-all';
    footer.setAttribute('data-animate', '');
    footer.setAttribute('data-delay', String(shown.length * 80));
    footer.innerHTML = '<a href="projects.html" class="btn btn-ghost">View all projects &rarr;</a>';
    grid.parentNode.appendChild(footer);
  }
}

/* Footer year */
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════
   3-D CARD TILT + SPECULAR GLOSS
   ═══════════════════════════════════════════════════════════ */
function initCardTilt() {
  if (prefersReducedMotion()) return;
  if (typeof window === 'undefined') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return;

  const MAX_RX = 10;   /* max degrees rotateX */
  const MAX_RY = 12;   /* max degrees rotateY */
  const SPRING  = 0.10; /* lerp factor per frame */

  Array.from(document.querySelectorAll('.research-card, .project-card, .contact-card, .skill-group, .pub-item'))
    .forEach((card) => {
      let targetRX = 0, targetRY = 0, targetZ = 0;
      let currentRX = 0, currentRY = 0, currentZ = 0;
      let raf = null;
      let isHovered = false;

      card.style.setProperty('--gloss-x', '50%');
      card.style.setProperty('--gloss-y', '50%');
      card.classList.add('tilt-ready');

      function loop() {
        currentRX += (targetRX - currentRX) * SPRING;
        currentRY += (targetRY - currentRY) * SPRING;
        currentZ  += (targetZ  - currentZ)  * SPRING;

        card.style.transform = `perspective(900px) rotateX(${currentRX.toFixed(3)}deg) rotateY(${currentRY.toFixed(3)}deg) translateZ(${currentZ.toFixed(2)}px)`;

        const done = !isHovered
          && Math.abs(targetRX - currentRX) < 0.05
          && Math.abs(targetRY - currentRY) < 0.05
          && Math.abs(targetZ  - currentZ)  < 0.1;

        if (done) {
          raf = null;
          card.style.transform  = '';
          card.style.transition = '';  /* restore CSS transitions (needed for 3D entrance) */
          return;
        }
        raf = requestAnimationFrame(loop);
      }

      card.addEventListener('mouseenter', () => {
        if (card.classList.contains('is-flipped')) return;
        isHovered = true;
        targetZ   = 8;
        /* Suppress the CSS transform-transition while the spring runs */
        card.style.transition = `border-color var(--t-med), background var(--t-med), box-shadow var(--t-med)`;
        if (!raf) raf = requestAnimationFrame(loop);
      });

      card.addEventListener('mousemove', (e) => {
        if (card.classList.contains('is-flipped')) return;
        const r  = card.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width;
        const cy = (e.clientY - r.top) / r.height;
        targetRY =  (cx - 0.5) * MAX_RY * 2;
        targetRX = -(cy - 0.5) * MAX_RX * 2;
        card.style.setProperty('--gloss-x', `${(cx * 100).toFixed(1)}%`);
        card.style.setProperty('--gloss-y', `${(cy * 100).toFixed(1)}%`);
      });

      card.addEventListener('mouseleave', () => {
        isHovered = false;
        targetRX = 0;
        targetRY = 0;
        targetZ  = 0;
        card.style.setProperty('--gloss-x', '50%');
        card.style.setProperty('--gloss-y', '50%');
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
}

/* ═══════════════════════════════════════════════════════════
   RESEARCH CARD FLIP (click to reveal back face)
   ═══════════════════════════════════════════════════════════ */
function initCardFlip() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#research-grid .research-card').forEach((card) => {
    card.addEventListener('click', () => {
      const flipping = card.classList.toggle('is-flipped');
      /* Reset tilt state so the card springs back to neutral when flipped */
      if (flipping) {
        card.style.transform = '';
        card.style.transition = '';
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   MAGNETIC BUTTONS
   ═══════════════════════════════════════════════════════════ */
function initMagneticButtons() {
  if (prefersReducedMotion()) return;
  if (typeof window === 'undefined') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return;

  const RADIUS   = 80;   /* px — proximity trigger distance */
  const STRENGTH = 0.35; /* fraction of offset to apply     */
  const SPRING   = 0.14; /* lerp factor per frame           */

  const magnets = Array.from(
    document.querySelectorAll('.btn-primary, .btn-ghost, .social-btn')
  ).map(el => ({ el, tx: 0, ty: 0, cx: 0, cy: 0, active: false, raf: null }));

  const heroActions = document.querySelector('.hero-actions');
  const filteredMagnets = magnets.filter((m) => !heroActions?.contains(m.el));

  if (!filteredMagnets.length) return;

  function tick(m) {
    m.cx += (m.tx - m.cx) * SPRING;
    m.cy += (m.ty - m.cy) * SPRING;
    const done = !m.active && Math.abs(m.tx - m.cx) < 0.05 && Math.abs(m.ty - m.cy) < 0.05;
    if (done) {
      m.cx = 0; m.cy = 0;
      m.el.style.transform = '';
      m.raf = null;
    } else {
      m.el.style.transform = `translate(${m.cx.toFixed(2)}px,${m.cy.toFixed(2)}px)`;
      m.raf = requestAnimationFrame(() => tick(m));
    }
  }

  document.addEventListener('mousemove', (e) => {
    filteredMagnets.forEach((m) => {
      const rect = m.el.getBoundingClientRect();
      const dx   = e.clientX - (rect.left + rect.width  / 2);
      const dy   = e.clientY - (rect.top  + rect.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RADIUS) {
        m.active = true;
        m.tx = dx * STRENGTH;
        m.ty = dy * STRENGTH;
        if (!m.raf) m.raf = requestAnimationFrame(() => tick(m));
      } else if (m.active) {
        m.active = false;
        m.tx = 0;
        m.ty = 0;
        if (!m.raf) m.raf = requestAnimationFrame(() => tick(m));
      }
    });
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   SCROLL-DRIVEN 3-D TRANSFORMS
   ═══════════════════════════════════════════════════════════ */
function initScroll3D() {
  if (prefersReducedMotion()) return;
  if (typeof document === 'undefined') return;

  /* Research cards now use a horizontal carousel with translateX entrance,
     so the old rotateY entrance angles are no longer needed. */

  /* Hero parallax — skip on touch devices to prevent scroll jank on mobile */
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(pointer: coarse)').matches) return;

  const heroContent = document.querySelector('.hero-content');
  const heroSection = document.getElementById('hero');

  /* Wait for the hero entrance animation to finish before taking over transforms */
  let ready = false;
  if (heroContent) {
    heroContent.addEventListener('animationend', () => { ready = true; }, { once: true });
    setTimeout(() => { ready = true; }, 1400); /* fallback */
  } else {
    ready = true;
  }

  let rafId = null;

  function update() {
    rafId = null;
    if (!ready) return;
    const scrollY = window.scrollY;
    const heroH   = heroSection ? heroSection.offsetHeight : 0;

    /* Apply parallax only while the hero section is still in or near view.
       Orb parallax removed — orbs are now static for battery savings. */
    if (scrollY < heroH * 1.1) {
      if (heroContent) heroContent.style.transform = `translateY(${scrollY * 0.28}px)`;
    }
  }

  window.addEventListener('scroll', () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  }, { passive: true });

  update(); /* initial — scrollY is 0 so transforms are no-ops */
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — TIMELINE RENDERING
   Reads CV_CAREER / CV_EDUCATION globals from data/cv.js.
   One card per job/degree — all details visible, no flipping.
   ═══════════════════════════════════════════════════════════ */
function renderCV() {
  if (typeof document === 'undefined') return;
  const timeline = document.getElementById('cv-timeline');
  if (!timeline) return;
  if (typeof CV_CAREER    === 'undefined') return;
  if (typeof CV_EDUCATION === 'undefined') return;

  /* ── Build card HTML ────────────────────────────────── */
  function cardHtml(entry, type) {
    const isCareer = type === 'career';
    const title  = isCareer ? entry.role   : entry.degree;
    const sub    = isCareer ? entry.company : entry.institution;
    const locHtml  = entry.location
      ? `<span class="tl-location">${escapeHtml(entry.location)}</span>`
      : '';
    const descHtml = entry.description
      ? `<p class="tl-desc">${escapeHtml(entry.description)}</p>`
      : '';
    const tagsArr  = entry.tags || [];
    const tagsHtml = tagsArr.length
      ? `<div class="tl-tags">${tagsArr.map(t => `<span class="tl-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="tl-card-single">
        <div class="tl-card-header">
          <span class="tl-year">${escapeHtml(String(entry.year))}</span>
          ${locHtml}
        </div>
        <h3 class="tl-title">${escapeHtml(title || '')}</h3>
        <p class="tl-sub">${escapeHtml(sub || '')}</p>
        ${descHtml}${tagsHtml}
      </div>`;
  }

  /* ── Extract start year for sorting ────────────────── */
  function startYear(yearStr) {
    var m = String(yearStr).match(/\d{4}/);
    return m ? parseInt(m[0], 10) : 0;
  }

  /* ── Separate concurrent from normal education entries ── */
  var concurrentEduEntries = [];
  var normalEduEntries     = [];
  (CV_EDUCATION || []).forEach(function(e) {
    if (Array.isArray(e.concurrent_with) && e.concurrent_with.length > 0) {
      concurrentEduEntries.push(e);
    } else {
      normalEduEntries.push(e);
    }
  });

  /* ── Build set of career companies involved in concurrent blocks ── */
  var concurrentCareerSet = {};
  concurrentEduEntries.forEach(function(edu) {
    edu.concurrent_with.forEach(function(company) {
      concurrentCareerSet[company] = true;
    });
  });

  /* ── Partition career entries ── */
  var concurrentCareerEntries = [];
  var normalCareerEntries     = [];
  (CV_CAREER || []).forEach(function(e) {
    if (concurrentCareerSet[e.company]) {
      concurrentCareerEntries.push(e);
    } else {
      normalCareerEntries.push(e);
    }
  });

  /* ── Build sortable row descriptors ── */
  var rows = [];

  /* Normal career rows */
  normalCareerEntries.forEach(function(entry) {
    rows.push({
      sort: startYear(entry.year),
      html: '<div class="tl-row tl-row--career" data-animate>'
          + '<div class="tl-left">' + cardHtml(entry, 'career') + '</div>'
          + '<div class="tl-spine"><div class="tl-dot" aria-hidden="true"></div></div>'
          + '<div class="tl-right"><div class="tl-empty"></div></div>'
          + '</div>',
    });
  });

  /* Normal (unpaired) education rows */
  normalEduEntries.forEach(function(entry) {
    rows.push({
      sort: startYear(entry.year),
      html: '<div class="tl-row tl-row--education" data-animate>'
          + '<div class="tl-left"><div class="tl-empty"></div></div>'
          + '<div class="tl-spine"><div class="tl-dot" aria-hidden="true"></div></div>'
          + '<div class="tl-right">' + cardHtml(entry, 'education') + '</div>'
          + '</div>',
    });
  });

  /* Concurrent blocks: education entry with concurrent_with spans matching career rows */
  concurrentEduEntries.forEach(function(eduEntry) {
    var companies   = eduEntry.concurrent_with;
    var careerPairs = concurrentCareerEntries
      .filter(function(c) { return companies.indexOf(c.company) !== -1; })
      .sort(function(a, b) { return startYear(b.year) - startYear(a.year); });

    var n = careerPairs.length;

    /* Left column + spine: one career card per grid row */
    var leftCells = careerPairs.map(function(c, i) {
      var row = i + 1;
      return '<div class="tl-left tl-row--career" style="grid-column:1;grid-row:' + row + '">'
           +   cardHtml(c, 'career')
           + '</div>'
           + '<div class="tl-spine" style="grid-column:2;grid-row:' + row + '">'
           +   '<div class="tl-dot" aria-hidden="true"></div>'
           + '</div>';
    }).join('');

    /* Right column: education card spans all career rows */
    var rightCell = '<div class="tl-right tl-row--education" style="grid-column:3;grid-row:1/' + (n + 1) + '">'
                  + cardHtml(eduEntry, 'education')
                  + '</div>';

    var sortYear = n > 0 ? startYear(careerPairs[0].year) : startYear(eduEntry.year);

    rows.push({
      sort: sortYear,
      html: '<div class="tl-concurrent-block" data-animate>'
          + leftCells
          + rightCell
          + '</div>',
    });
  });

  /* ── Sort all rows newest-first and render ── */
  rows.sort(function(a, b) { return b.sort - a.sort; });
  timeline.innerHTML = rows.map(function(r) { return r.html; }).join('');
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — SKILLS PANELS
   Reads CV_SKILLS global from data/cv.js.
   ═══════════════════════════════════════════════════════════ */
function renderSkills() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('cv-skills');
  if (!container) return;
  if (typeof CV_SKILLS === 'undefined') return;

  const { technical = [], leadership = [], languages = [] } = CV_SKILLS;

  /* Progress-bar panel for technical / leadership */
  function barPanel(items, label) {
    if (!items.length) return '';
    return `
      <div class="skill-panel" data-animate>
        <h3 class="skill-panel-title">${escapeHtml(label)}</h3>
        <ul class="skill-bars">
          ${items.map(s => `
            <li class="skill-bar-item">
              <span class="skill-bar-name">${escapeHtml(s.name)}</span>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" style="--pct:${parseInt(s.level, 10)}%"></div>
              </div>
            </li>`).join('')}
        </ul>
      </div>`;
  }

  /* Language proficiency pill panel */
  function langPanel(items) {
    if (!items.length) return '';
    return `
      <div class="skill-panel" data-animate>
        <h3 class="skill-panel-title">Languages</h3>
        <ul class="lang-list">
          ${items.map(l => `
            <li class="lang-item">
              <span class="lang-name">${escapeHtml(l.name)}</span>
              <span class="lang-prof">${escapeHtml(l.proficiency)}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  }

  const panels = [
    barPanel(technical,  'Technical'),
    barPanel(leadership, 'Leadership'),
    langPanel(languages),
  ].filter(Boolean).join('');

  container.innerHTML = panels
    ? `<div class="skill-panels">${panels}</div>`
    : '';
}

/* ═══════════════════════════════════════════════════════════
   SKILL BAR FILL ANIMATION
   Triggers the CSS width transition on .skill-bar-fill when
   the bar enters the viewport (IntersectionObserver).
   ═══════════════════════════════════════════════════════════ */
function initSkillBars() {
  if (typeof document === 'undefined') return;
  const bars = Array.from(document.querySelectorAll('.skill-bar-fill'));
  if (!bars.length) return;

  if (prefersReducedMotion()) {
    /* Show instantly for reduced-motion users */
    bars.forEach(b => b.classList.add('animated'));
    return;
  }

  if (typeof IntersectionObserver === 'undefined') {
    bars.forEach(b => b.classList.add('animated'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('animated');
      io.unobserve(e.target);
    });
  }, { threshold: 0.3 });

  bars.forEach(bar => io.observe(bar));
}

/* ═══════════════════════════════════════════════════════════
   TIMELINE ENTRANCE ANIMATION
   Staggered opacity fade-in as entries scroll into view.
   The old scroll-driven rotateX has been removed — it shared
   a perspective context between both columns, which caused
   hover repaints to trigger cross-column z-fighting flicker.
   Per-card hover flipping is handled entirely in CSS now.
   ═══════════════════════════════════════════════════════════ */
function initTimelineScroll3D() {
  if (typeof document === 'undefined') return;

  const stage = document.getElementById('timeline-stage');
  if (!stage) return;

  const entries = Array.from(stage.querySelectorAll('.tl-entry'));
  if (!entries.length) return;

  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;

  const io = new IntersectionObserver((obs) => {
    obs.forEach(ob => {
      if (!ob.isIntersecting) return;
      const el    = ob.target;
      const delay = (entries.indexOf(el) % 4) * 70;
      setTimeout(() => {
        el.style.transition = 'opacity 600ms var(--ease)';
        el.style.opacity    = '1';
      }, delay);
      io.unobserve(el);
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -30px 0px' });

  entries.forEach(el => {
    el.style.opacity = '0';
    io.observe(el);
  });
}

/* ═══════════════════════════════════════════════════════════
   STATIC FAVICON — capital "S" rendered once
   Draws a single frame and sets it as the favicon.
   No animation loop — saves continuous CPU / PNG-encode cost.
   ═══════════════════════════════════════════════════════════ */
function initAnimatedFavicon() {
  if (typeof document       === 'undefined') return;
  if (typeof HTMLCanvasElement === 'undefined') return; /* Node / SSR */

  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;

  const S = 64; /* canvas size (browsers display at 16–32 px, 64 gives HiDPI sharpness) */

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function render() {
    /* ── Background: dark rounded square ── */
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#080c14';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, S, S, 13);
    else               ctx.rect(0, 0, S, S);
    ctx.fill();

    /* ── Static "S" in accent purple ── */
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#6c63ffbb';
    ctx.fillStyle   = '#6c63ff';
    ctx.font        = 'bold 44px "Outfit", "Inter", system-ui, sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 2); /* +2 px optical centre correction */
    ctx.restore();

    link.href = canvas.toDataURL('image/png');
  }

  /* Render after fonts are loaded so Outfit is available */
  const whenReady = (typeof document.fonts !== 'undefined' && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();
  whenReady.then(render);
}

/* ═══════════════════════════════════════════════════════════
   HERO NAME SHADER
   Renders "Stefano / Masneri" with iridescent chromatic
   aberration on a WebGL canvas overlay.  Falls back to the
   CSS-styled <h1> if WebGL is unavailable.
   ═══════════════════════════════════════════════════════════ */
class HeroNameShader {

  constructor(h1El, canvasEl) {
    this.h1 = h1El;
    this.canvas = canvasEl;
    this.mx = 0.5;   /* normalised mouse x */
    this.my = 0.5;   /* normalised mouse y */
    this.t = 0;
    this.raf = null;
    this._visible = true;
    this._io = null;
    this._isLowPower = isLowPowerDevice();
    this._pixelRatioCap = this._isLowPower ? 1.4 : 2;
    this._targetFps = this._isLowPower ? 20 : 30;
    this._minFrameTime = 1 / this._targetFps;
    this._lastDrawTime = 0;

    const gl = canvasEl.getContext('webgl', { alpha: true, premultipliedAlpha: false })
      || canvasEl.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) { console.warn('[HeroName] WebGL unavailable — CSS fallback active'); return; }
    this.gl = gl;
    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.raf = null;
      }, false);
      this.canvas.addEventListener('webglcontextrestored', () => {
        if (!this._setupGL()) return;
        this._resize();
        if (!this.raf && !document.hidden && this._visible) this._animate();
      }, false);
    }

    /* Wait for web-fonts before measuring / drawing text */
    const boot = () => {
      if (this._setupGL()) {
        this._resize();
        this._bindEvents();
        this._animate();
        h1El.classList.add('hero-name--gpu');  /* hide original text */
        this._io = new IntersectionObserver(([entry]) => {
          this._visible = entry.isIntersecting;
          if (this._visible && !document.hidden && !this.raf) this._animate();
        }, { threshold: 0 });
        this._io.observe(this.canvas);
      }
    };
    if (document.fonts?.ready) document.fonts.ready.then(boot);
    else setTimeout(boot, 400);   /* Safari guard */
  }

  /* ── GLSL compilation helper ── */
  _compile(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[HeroName shader]', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  /* ── Compile shaders, upload quad, locate uniforms ── */
  _setupGL() {
    const gl = this.gl;

    /* passthrough vertex shader */
    const VS = `
      attribute vec2 aPos;
      varying   vec2 vUv;
      void main() {
        vUv         = aPos * 0.5 + 0.5;
        vUv.y       = 1.0 - vUv.y;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    /* iridescent chromatic-aberration fragment shader */
    const FS = `
      precision highp float;
      uniform sampler2D uTex;
      uniform float     uTime;
      uniform vec2      uMouse;
      uniform vec2      uRes;
      varying vec2      vUv;

      /* --- value noise --- */
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i),            hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm(vec2 p) {
        return noise(p)       * 0.500
             + noise(p * 2.1 + vec2(3.7, 1.3)) * 0.250
             + noise(p * 4.3 + vec2(7.8, 5.2)) * 0.125;
      }

      void main() {
        float asp = uRes.x / uRes.y;
        vec2  uv  = vUv;

        /* animated organic flow */
        float f1 = fbm(vec2(uv.x * asp * 2.2, uv.y * 2.2)
                       + vec2(uTime * 0.11, uTime * 0.07));
        float f2 = fbm(vec2(uv.x * asp * 2.2 + 4.3, uv.y * 2.2 + 3.1)
                       + vec2(uTime * 0.08, uTime * 0.14));
        vec2 disp = vec2(f1 - 0.5, f2 - 0.5) * 0.005;

        /* mouse repulsion / warping */
        vec2  toM = (uMouse - uv) * vec2(asp, 1.0);
        float md  = length(toM);
        disp     -= (toM / (md * md + 0.06)) * 0.004;

        /* chromatic aberration — 3 wavelengths offset horizontally.
           Subtle enough to keep letterforms crisp. */
        float ab = 0.0012;
        float aR = texture2D(uTex, clamp(uv + disp + vec2( ab, 0.0), 0.0, 1.0)).a;
        float aG = texture2D(uTex, clamp(uv + disp,                  0.0, 1.0)).a;
        float aB = texture2D(uTex, clamp(uv + disp - vec2( ab, 0.0), 0.0, 1.0)).a;

        if (max(max(aR, aG), aB) < 0.004) discard;

        /* stable dark-theme palette: violet -> cyan, no rainbow cycling */
        float sweep = uv.x * 1.2 + uv.y * 0.55 + uTime * 0.04 + md * 0.25;
        vec3 baseA = vec3(0.42, 0.39, 1.00);
        vec3 baseB = vec3(0.00, 0.83, 1.00);
        vec3 baseC = vec3(0.78, 0.90, 1.00);
        vec3 iri = mix(baseA, baseB, clamp(sweep, 0.0, 1.0));
        iri = mix(iri, baseC, 0.18 + 0.10 * sin(uTime * 0.25));

        /* combine per-channel alpha with iridescent colour */
        vec3  col   = vec3(aR, aG, aB) * iri;
        float alpha = max(max(aR, aG), aB);
        gl_FragColor = vec4(col, alpha);
      }
    `;

    const vs = this._compile(gl.VERTEX_SHADER, VS);
    const fs = this._compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;

    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vs);
    gl.attachShader(this.prog, fs);
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      console.error('[HeroName link]', gl.getProgramInfoLog(this.prog));
      return false;
    }
    gl.useProgram(this.prog);

    /* full-screen quad */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uTime = gl.getUniformLocation(this.prog, 'uTime');
    this.uMouse = gl.getUniformLocation(this.prog, 'uMouse');
    this.uRes = gl.getUniformLocation(this.prog, 'uRes');
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uTex'), 0);

    /* text texture (filled by _drawText) */
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    /* alpha blending for transparent canvas */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* single offscreen 2-D canvas — reused every _drawText() call */
    this._textCanvas = document.createElement('canvas');

    return true;
  }

  /* ── Render name text to an offscreen 2D canvas, upload as GL texture ── */
  _drawText() {
    const gl = this.gl;
    const dpr = Math.min(devicePixelRatio || 1, this._pixelRatioCap);
    const w = this.canvas.offsetWidth || 400;
    const h = this.canvas.offsetHeight || 200;

    const tc = this._textCanvas;        /* reuse — no GC churn */
    tc.width = Math.round(w * dpr);
    tc.height = Math.round(h * dpr);
    const ctx = tc.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    /* read the live font-size + line-height from the h1 (respects clamp() / viewport) */
    const styles = getComputedStyle(this.h1);
    const fs = parseFloat(styles.fontSize);
    const lh = parseFloat(styles.lineHeight) || fs;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    /* Line 1 & 2: Outfit Bold — clean geometric sans-serif */
    ctx.font = `700 ${fs}px 'Outfit', 'Inter', system-ui, sans-serif`;
    ctx.fillText('Stefano', 0, 0);
    ctx.fillText('Masneri', 0, lh);

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
  }

  /* ── Sync canvas size with h1 dimensions ── */
  _resize() {
    const gl = this.gl;
    const dpr = Math.min(devicePixelRatio || 1, this._pixelRatioCap);
    const fallbackW = this.h1.offsetWidth || 400;
    const h = this.h1.offsetHeight || 200;
    const fs = parseFloat(getComputedStyle(this.h1).fontSize) || 64;
    if (!this._measureCanvas) this._measureCanvas = document.createElement('canvas');
    const measureCtx = this._measureCanvas.getContext('2d');
    let textW = fallbackW;
    if (measureCtx && typeof measureCtx.measureText === 'function') {
      measureCtx.font = `700 ${fs}px 'Outfit', 'Inter', system-ui, sans-serif`;
      const l1 = measureCtx.measureText('Stefano').width;
      const l2 = measureCtx.measureText('Masneri').width;
      textW = Math.max(fallbackW, l1, l2) + fs * 0.28;
    }
    const w = Math.round(textW);

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uRes, this.canvas.width, this.canvas.height);
    this._drawText();
  }

  _bindEvents() {
    window.addEventListener('mousemove', e => {
      if (!this._visible) return;
      const r = this.canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) / (r.width || 1);
      this.my = (e.clientY - r.top) / (r.height || 1);
    });
    window.addEventListener('touchmove', e => {
      if (!this._visible) return;
      if (!e.touches[0]) return;
      const r = this.canvas.getBoundingClientRect();
      this.mx = (e.touches[0].clientX - r.left) / (r.width || 1);
      this.my = (e.touches[0].clientY - r.top) / (r.height || 1);
    }, { passive: true });
    /* debounce resize — avoids GL texture churn while the user drags the window */
    let _rszTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_rszTimer);
      _rszTimer = setTimeout(() => this._resize(), 150);
    });

    /* pause RAF when the browser tab is hidden */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this._visible && !this.raf) this._animate();
    });
  }

  _animate() {
    if (document.hidden || !this._visible) { this.raf = null; return; }   /* pause when hidden or off-screen */
    this.raf = requestAnimationFrame(() => this._animate());
    if (!this.gl || !this.prog) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    const dt = this._lastDrawTime ? Math.min(now - this._lastDrawTime, 0.05) : this._minFrameTime;
    this._lastDrawTime = now;
    this.t += dt;
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(this.uTime, this.t);
    gl.uniform2f(this.uMouse, this.mx, this.my);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._io) this._io.disconnect();
  }
}

/* ═══════════════════════════════════════════════════════════
   HERO BACKGROUND — GLSL NOISE GRADIENT
   Domain-warped fBm shader: indigo-violet ↔ cyan ↔ deep dark.
   Renders a small burst of frames to produce a nice noise
   pattern, then stops — no continuous animation loop.
   ═══════════════════════════════════════════════════════════ */
class NoiseGradient {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: true })
             || canvas.getContext('experimental-webgl', { alpha: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) { canvas.style.display = 'none'; return; }
    this.gl = gl;
    this._setup();
    this._resize();
    window.addEventListener('resize', () => this._resize(), { passive: true });
    this._startTime = performance.now();
    this._lastT     = 0;
    this._framesLeft = 3; /* render a few frames then stop */
    this._tick      = this._tick.bind(this);
    this._raf       = requestAnimationFrame(this._tick);
  }

  _compileShader(type, src) {
    const s = this.gl.createShader(type);
    this.gl.shaderSource(s, src);
    this.gl.compileShader(s);
    if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
      console.error('[NoiseGradient shader]', this.gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  _setup() {
    const gl = this.gl;

    const vert = this._compileShader(gl.VERTEX_SHADER,
      `attribute vec2 a_pos;
       void main(){gl_Position=vec4(a_pos,0.0,1.0);}`);

    /* Domain-warped fBm fragment shader */
    const frag = this._compileShader(gl.FRAGMENT_SHADER,
      `precision mediump float;
       uniform float u_t;
       uniform vec2  u_res;

       float hash(vec2 p){
         p=fract(p*vec2(127.1,311.7));
         p+=dot(p,p+17.5);
         return fract(p.x*p.y);
       }
       float noise(vec2 p){
         vec2 i=floor(p),f=fract(p);
         vec2 u=f*f*(3.0-2.0*f);
         return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                    mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
       }
       float fbm(vec2 p){
         float v=0.0,a=0.5;
         for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(0.13,-0.07);a*=0.5;}
         return v;
       }
       void main(){
         vec2 uv=gl_FragCoord.xy/u_res;
         uv.y=1.0-uv.y;
         float t=u_t*0.06;
         /* First warp pass */
         vec2 q=vec2(fbm(uv*1.4+t),
                     fbm(uv*1.4+vec2(1.3,1.7)+t));
         /* Second warp pass — creates the folded turbulence */
         vec2 r=vec2(fbm(uv*1.4+2.0*q+vec2(1.7,9.2)+0.15*t),
                     fbm(uv*1.4+2.0*q+vec2(8.3,2.8)+0.126*t));
         float f=fbm(uv*1.4+2.5*r);
         /* Palette: deep dark → muted indigo-violet → subdued cyan.
            Toned down to avoid an overly blue wash over the hero. */
         vec3 col=mix(vec3(0.035,0.040,0.068),
                      vec3(0.300,0.270,0.700),
                      clamp(f*2.0-0.15,0.0,1.0));
         col=mix(col,
                 vec3(0.000,0.580,0.720),
                 clamp(f*f*4.0-0.4,0.0,1.0));
         col*=f*1.05+0.08;
         gl_FragColor=vec4(col,1.0);
       }`);

    if (!vert || !frag) { this.canvas.style.display = 'none'; return; }

    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vert);
    gl.attachShader(this.prog, frag);
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      console.error('[NoiseGradient link]', gl.getProgramInfoLog(this.prog));
      this.canvas.style.display = 'none';
      return;
    }
    gl.useProgram(this.prog);

    /* Full-screen quad */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this._uTime = gl.getUniformLocation(this.prog, 'u_t');
    this._uRes  = gl.getUniformLocation(this.prog, 'u_res');
  }

  _resize() {
    /* Intentionally cap at 1× DPR — noise looks great at lower res */
    const scale = Math.min(window.devicePixelRatio || 1, 1.0);
    const w = Math.round(this.canvas.clientWidth  * scale);
    const h = Math.round(this.canvas.clientHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  _tick(now) {
    if (this._framesLeft <= 0) { this._raf = null; return; }
    this._raf = requestAnimationFrame(this._tick);
    if (document.hidden) return;
    this._lastT = now;
    const t = (now - this._startTime) / 1000;
    const { gl } = this;
    gl.uniform1f(this._uTime, t);
    gl.uniform2f(this._uRes, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this._framesLeft--;
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

/* Expose a minimal test surface in Node without affecting browser usage */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatIsoDate,
    geocodeLocations,
    Globe3D,
    renderPublications,
    renderProjects,
    renderProjectCard,
    PROJECTS_MAX_HOMEPAGE,
    renderCV,
    renderSkills,
    setFooterYear,
    initTheme,
    initCardTilt,
    initSkillBars,
    initTimelineScroll3D,
    initAnimatedFavicon,
    initMagneticButtons,
    initScroll3D,
    initNavbar,
    initMobileMenu,
    initBackToTop,
    initScrollReveal,
    initCounters,
    animateCounter,
    NeuralNetwork,
    NeuralNetwork2D,
    HeroNameShader,
    NoiseGradient,
    GlobeFallback2D,
    decodeBase64,
    getObfuscatedContactEmail,
    initEmailObfuscation,
    initResearchCarousel,
    initCmdTriggerHint,
    initCardFlip,
  };
}

/* ═══════════════════════════════════════════════════════════
   RESEARCH CAROUSEL SCROLL BUTTONS
   ═══════════════════════════════════════════════════════════ */
function initResearchCarousel() {
  const grid = document.getElementById('research-grid');
  const leftBtn = document.getElementById('research-scroll-left');
  const rightBtn = document.getElementById('research-scroll-right');
  const wrap = grid?.closest('.research-carousel-wrap');
  if (!grid || !leftBtn || !rightBtn || !wrap) return;

  function updateButtons() {
    const { scrollLeft, scrollWidth, clientWidth } = grid;
    const atStart = scrollLeft <= 8;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 8;
    leftBtn.classList.toggle('visible', !atStart);
    rightBtn.classList.toggle('visible', !atEnd);
    wrap.classList.toggle('fade-left', !atStart);
    wrap.classList.toggle('fade-right-off', atEnd);
  }

  leftBtn.addEventListener('click', () => {
    grid.scrollBy({ left: -320, behavior: 'smooth' });
  });
  rightBtn.addEventListener('click', () => {
    grid.scrollBy({ left: 320, behavior: 'smooth' });
  });

  grid.addEventListener('scroll', updateButtons, { passive: true });
  updateButtons();
  /* Re-check after cards animate in */
  setTimeout(updateButtons, 600);
}

/* ═══════════════════════════════════════════════════════════
   COMMAND PALETTE TRIGGER HINT
   ═══════════════════════════════════════════════════════════ */
function initCmdTriggerHint() {
  const hint = document.getElementById('cmd-trigger');
  if (!hint) return;
  const keyEl = hint.querySelector('.cmd-trigger-key');
  if (keyEl) {
    const isMac = typeof navigator !== 'undefined'
      && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    keyEl.textContent = isMac ? '\u2318' : 'Ctrl+';
  }
  hint.addEventListener('click', () => {
    const overlay = document.getElementById('cmd-overlay');
    if (overlay && overlay.hidden !== undefined) {
      overlay.hidden = false;
      const inp = document.getElementById('cmd-input');
      if (inp) inp.focus();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   INIT — runs when DOM is ready
   ═══════════════════════════════════════════════════════════ */
if (typeof document !== 'undefined') {
  /* Catch unhandled promise rejections (e.g. failed fetches, WebGL errors) */
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[Unhandled rejection]', e.reason);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {

  /* Render dynamic content (static sections are already in HTML) */
  renderPublications();
  renderProjects();
  renderCV();      /* timeline entries from data/cv.js */
  renderSkills();  /* skill panels from CV_SKILLS in data/cv.js */
  setFooterYear();

  /* UI behaviours */
  initTheme();
  initNavbar();
  initMobileMenu();
  initEmailObfuscation();
  initBackToTop();
  initSideDots();
  initCommandPalette();
  initCmdTriggerHint();
  initResearchCarousel();
  initCursorGlow();
  initTaglineReveal();

  /* Scroll reveals (must come after content injection) */
  initScrollReveal();
  initCounters();

  /* Scroll-driven effects: start immediately (lightweight, needed at any scroll pos) */
  initScroll3D();

  /* Pointer-only enhancements (card tilt, magnetic buttons) — deferred to idle time
     so they do not compete with content rendering on the main thread.
     requestIdleCallback fires within milliseconds on a quiet page; the 2 s timeout
     guarantees they still initialise on heavily loaded devices.                     */
  const whenIdle = typeof requestIdleCallback !== 'undefined'
    ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 0);
  initCardFlip();
  whenIdle(() => {
    initCardTilt();
    initMagneticButtons();
  });

  /* CV timeline and skill bars */
  initTimelineScroll3D();
  initSkillBars();

  /* Animated favicon — starts after fonts load (async, non-blocking) */
  initAnimatedFavicon();

  /* Noise gradient — raw WebGL, runs on devices that support it */
  const noiseCanvas = document.getElementById('noise-canvas');
  if (noiseCanvas && !prefersReducedMotion() && !isLowPowerDevice() && hasWebGLSupport()) {
    new NoiseGradient(noiseCanvas);
  } else if (noiseCanvas) {
    noiseCanvas.style.display = 'none';
  }

  /* Three.js neural network — only when THREE is loaded */
  const canvas = document.getElementById('neural-canvas');
  if (canvas) {
    if (prefersReducedMotion()) {
      canvas.style.display = 'none';
    } else if (typeof THREE !== 'undefined' && hasWebGLSupport()) {
      new NeuralNetwork(canvas);
    } else {
      new NeuralNetwork2D(canvas);
    }
  }

  /* Three.js Globe — geocode any entries missing lat/lon, then build */
  const globeCanvas = document.getElementById('globe-canvas');
  if (globeCanvas && typeof LOCATIONS !== 'undefined') {
    geocodeLocations(LOCATIONS).then(() => {
      if (prefersReducedMotion()) {
        new GlobeFallback2D(globeCanvas);
        return;
      }
      if (typeof THREE !== 'undefined' && hasWebGLSupport()) new Globe3D(globeCanvas);
      else new GlobeFallback2D(globeCanvas);
    });
  }

  /* 2D Europe Map — Canvas-based representation of European locations */
  const europeCanvas = document.getElementById('europe-canvas');
  if (europeCanvas && typeof LOCATIONS !== 'undefined' && typeof EuropeMap2D !== 'undefined') {
    new EuropeMap2D(europeCanvas);
  }

  /* Hero name — iridescent WebGL shader (progressive enhancement) */
  const nameH1 = document.getElementById('hero-name');
  const nameCanvas = document.getElementById('name-canvas');
  if (nameH1 && nameCanvas) {
    if (!prefersReducedMotion() && hasWebGLSupport()) new HeroNameShader(nameH1, nameCanvas);
  }

  });
}
