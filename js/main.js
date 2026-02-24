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
     data/blog.js         — blog posts       (BLOG_POSTS array)

   To change neural-network colours, adjust the ACCENT_* /
   CYAN_* constants inside the NeuralNetwork class below.
   ============================================================ */

'use strict';

function isLowPowerDevice() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const cores = nav && typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8;
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const narrowViewport = typeof window !== 'undefined' && window.innerWidth < 760;
  return coarsePointer || narrowViewport || cores <= 4;
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
    this.pixelRatioCap = this._isLowPower ? 1.5 : 2;
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
      depthWrite: false,
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
        const a = 1 - d / dist;
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

/* ═══════════════════════════════════════════════════════════
   GLOBE 3D — interactive world map in the About section
   Location data lives in  data/locations.js  (edit that file).
   ═══════════════════════════════════════════════════════════ */
class Globe3D {

  /* Two-colour scheme:
       cyan  (#00d4ff) — lived + work  (places you belong to)
       coral (#ff8c42) — travel + trips + regions  (places you explored)
     Visual weight still differentiates lived (large, pulsing) from
     work (small, static) even though they share a colour. */
  static PIN_COLORS = { lived: 0x00d4ff, work: 0x00d4ff, travel: 0xff8c42 };

  static TT_LABEL = { lived: '● Home', work: '◆ Work', travel: '✦ Travel', region: '◉ Region', trip: '➜ Trip stop' };
  static TT_COLOR = { lived: '#00d4ff', work: '#00d4ff', travel: '#ff8c42', region: '#ff8c42', trip: '#e8edf8' };

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

    this._resize();
    this._initScene();
    this._buildGlobe();
    this._buildAtmosphere();
    this._buildStars();
    this._buildGrid();
    this._buildRegions();   /* discs first so pins sit on top */
    this._buildMarkers();
    this._buildTrips();
    this._bindEvents();
    this._animate();

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

    /* Ambient: enough fill to see the night side without washing out the day side */
    this.scene.add(new THREE.AmbientLight(0x223355, 0.9));
    /* Sun: warm directional — high intensity for vivid textures */
    const sun = new THREE.DirectionalLight(0xfff5d6, 1.35);
    sun.position.set(5, 3, 4);
    this.scene.add(sun);
    /* Cyan rim on the opposite side — keeps the look on-brand */
    const rim = new THREE.PointLight(0x00d4ff, 0.45, 14);
    rim.position.set(-4, 1, -2);
    this.scene.add(rim);

    this.pivot = new THREE.Group();
    this.pivot.rotation.x = this.rotX;
    this.pivot.rotation.y = this.rotY;
    this.scene.add(this.pivot);
  }

  _buildGlobe() {
    /* ── Earth textures (hosted by threejs.org) ───────────────────────────────
       Loaded asynchronously; a fallback dark-ocean material is shown
       immediately and swapped once the texture arrives. */
    const CDN = 'https://threejs.org/examples/textures/planets/';
    const ldr = new THREE.TextureLoader();
    const mat = new THREE.MeshPhongMaterial({
      color: 0x0a1628,   /* shown before texture loads */
      emissive: 0x050c1a,
      specular: new THREE.Color(0x1b2230),
      shininess: 8,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), mat);
    this.pivot.add(globe);

    /* Day texture (satellite imagery with clouds) */
    ldr.load(CDN + 'earth_atmos_2048.jpg',
      tex => { tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; },
      undefined,
      () => console.warn('[Globe] earth day texture failed to load — using fallback colour'),
    );
    /* Keep highlights subtle: avoid strong specular hotspots on modern displays */
  }

  _buildAtmosphere() {
    /* Inner surface glow */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.007, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x1a3a7a, transparent: true, opacity: 0.10, depthWrite: false }),
    ));
    /* Atmosphere shell */
    this.pivot.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x3355bb, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false }),
    ));
    /* Wide outer halo — fixed in world space */
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.24, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x6c63ff, transparent: true, opacity: 0.028, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending }),
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
    /* Very subtle grid — texture already provides geographic context */
    const mat = (op) => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: op });
    const R = 1.002;
    for (let lat = -80; lat <= 80; lat += 20) {
      const phi = (90 - lat) * Math.PI / 180;
      const r = R * Math.sin(phi), y = R * Math.cos(phi), pts = [];
      for (let i = 0; i <= 64; i++) { const t = (i / 64) * Math.PI * 2; pts.push(new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t))); }
      /* Equator and tropics slightly brighter */
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(Math.abs(lat) === 0 ? 0.18 : 0.07)));
    }
    for (let lon = 0; lon < 360; lon += 20) {
      const theta = lon * Math.PI / 180, pts = [];
      for (let i = 0; i <= 64; i++) { const p = (i / 64) * Math.PI; pts.push(new THREE.Vector3(R * Math.sin(p) * Math.cos(theta), R * Math.cos(p), R * Math.sin(p) * Math.sin(theta))); }
      this.pivot.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat(0.07)));
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

  /* ── Region discs (islands, countries) ─────────────────── */
  _buildRegions() {
    (LOCATIONS.regions || []).filter(reg => !reg._skip).forEach(reg => {
      const color = new THREE.Color(reg.color || '#ff8c42');
      const pos = this._ll(reg.lat, reg.lon, 1.003);
      /* radius: degrees of arc → 3D chord length on unit sphere */
      const R = Math.sin((reg.radius * Math.PI) / 180);

      /* Filled translucent disc */
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(R, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      disc.position.copy(pos);
      this._faceOut(disc, pos);
      this.pivot.add(disc);

      /* Crisp outline ring */
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R * 0.88, R, 48),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.position.copy(pos);
      this._faceOut(ring, pos);
      this.pivot.add(ring);

      /* Tiny centre dot — holds tooltip userData */
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 8),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      dot.userData = { name: reg.name, info: reg.info || 'Region', type: 'region' };
      this.pivot.add(dot);
      this.markerMeshes.push(dot);
    });
  }

  /* ── Standard pins (lived / work / travel) ──────────────── */
  _buildMarkers() {
    (LOCATIONS.pins || []).filter(loc => !loc._skip).forEach(loc => {
      const hex = Globe3D.PIN_COLORS[loc.type] || 0xffffff;
      const color = new THREE.Color(hex);
      const pos = this._ll(loc.lat, loc.lon, 1.008);
      const surf = this._ll(loc.lat, loc.lon, 1.001);
      const isHome = (loc.type === 'lived');   /* bigger, pulsing — "I live/lived here" */

      /* Spike — thin line from globe surface up to the dot */
      this.pivot.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([surf, pos]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: isHome ? 0.85 : 0.5 }),
      ));

      /* Dot — lived pins are larger and more prominent */
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(isHome ? 0.016 : 0.011, 12, 12),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.copy(pos);
      dot.userData = { name: loc.name, info: loc.info, type: loc.type };
      this.pivot.add(dot);
      this.markerMeshes.push(dot);

      /* Static halo — thicker for lived, thinner for work/travel */
      const [rIn, rOut, op] = isHome ? [0.022, 0.028, 0.6] : [0.015, 0.019, 0.35];
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(rIn, rOut, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
      );
      halo.position.copy(pos);
      this._faceOut(halo, pos);
      this.pivot.add(halo);

      /* Two staggered animated pulse rings — only for lived/home pins */
      if (isHome) {
        [0, Math.PI].forEach(phaseOffset => {
          const pulse = new THREE.Mesh(
            new THREE.RingGeometry(0.014, 0.020, 40),
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

        /* Adaptive arc height — scales with chord length to avoid
           catastrophically tall arcs for nearby cities.
           Guard against near-antipodal pairs (sum ≈ 0) by falling back
           to a perpendicular control point. */
        const chord = s.distanceTo(e);
        const lift = 1.0 + Math.min(0.48, 0.06 + chord * 0.32);
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
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }),
        ));
        /* Bright core */
        this.pivot.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false }),
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
          new THREE.SphereGeometry(0.010, 8, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        );
        cdot.position.copy(cpos);
        cdot.userData = { name: city.name, info: trip.name, type: 'trip' };
        this.pivot.add(cdot);
        this.markerMeshes.push(cdot);
      });

      /* Traveller dot — explicit opacity:0 to avoid a 1-frame opaque flash */
      const traveller = new THREE.Mesh(
        new THREE.SphereGeometry(0.013, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }),
      );
      this.pivot.add(traveller);

      /* Comet trail — 6 progressively smaller/dimmer dots trailing behind */
      const TRAIL = 6;
      const trail = [];
      for (let ti = 0; ti < TRAIL; ti++) {
        const frac = 1 - ti / TRAIL;
        const td = new THREE.Mesh(
          new THREE.SphereGeometry(Math.max(0.003, 0.011 * frac * 0.8), 8, 8),
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
      /* Use cached rect — avoids a forced reflow (getBoundingClientRect) on
         every mousemove event.  Invalidated on resize. */
      if (!this._rect) this._rect = cv.getBoundingClientRect();
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
      ring.scale.set(1 + norm * 3.0, 1 + norm * 3.0, 1);
      ring.material.opacity = (1 - norm) * 0.65;
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
        /* Scale up the hovered marker; reset the previously hovered one */
        if (this._hoveredMesh !== hit) {
          if (this._hoveredMesh) this._hoveredMesh.scale.setScalar(1);
          hit.scale.setScalar(1.6);
          this._hoveredMesh = hit;
        }
        const { name, info, type } = hit.userData;
        if (this.tooltip) {
          this._ttType.textContent = Globe3D.TT_LABEL[type] || type;
          this._ttType.style.color = Globe3D.TT_COLOR[type] || '#e8edf8';
          this._ttName.textContent = name;
          this._ttInfo.textContent = info;
          let tx = this._mpos.x + 18, ty = this._mpos.y - 14;
          if (tx + 220 > this.w) tx = this._mpos.x - 228;
          if (ty + 90 > this.h) ty = this._mpos.y - 96;
          if (ty < 4) ty = 4;
          this.tooltip.style.left = tx + 'px';
          this.tooltip.style.top = ty + 'px';
          this.tooltip.classList.add('visible');
        }
      } else {
        if (this._hoveredMesh) { this._hoveredMesh.scale.setScalar(1); this._hoveredMesh = null; }
        this.tooltip?.classList.remove('visible');
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

/* CPU fallback when WebGL is unavailable: 2D orthographic globe */
class GlobeFallback2D {
  static PIN_COLORS = { lived: '#00d4ff', work: '#86e8ff', travel: '#ff8c42', region: '#ffb280' };

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
    (LOCATIONS.regions || []).forEach((r) => {
      if (r._skip) return;
      this._points.push({ lat: r.lat, lon: r.lon, type: 'region' });
    });
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
      const rr = pt.type === 'lived' ? 4.6 : pt.type === 'region' ? 3.8 : 3.2;
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
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const links = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('#nav-links a[href^="#"]'))
    : [];
  const targets = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  const setActiveLink = () => {
    if (!links.length || !targets.length) return;
    const checkpoint = window.scrollY + (window.innerHeight * 0.35);
    let activeId = targets[0]?.id;
    targets.forEach((section) => {
      if (checkpoint >= section.offsetTop) activeId = section.id;
    });
    links.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${activeId}`;
      link.setAttribute('aria-current', isActive ? 'true' : 'false');
    });
  };

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 20);
    setActiveLink();
  }, { passive: true });

  setActiveLink();
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
   Publications and blog posts are the only sections rendered
   by JS — their data lives in data/publications.js and
   data/blog.js respectively.
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

/* Publication items — data source: PUBLICATIONS (data/publications.js) */
function renderPublications() {
  const list = document.getElementById('publications-list');
  if (!list) return;

  list.innerHTML = PUBLICATIONS.map((pub, i) => `
    <div class="pub-item" role="listitem" data-animate data-delay="${i * 70}">
      <div class="pub-year">${escapeHtml(pub.year)}</div>
      <div>
        <div class="pub-title">${escapeHtml(pub.title)}</div>
        <div class="pub-meta">
          ${escapeHtml(pub.authors)} &nbsp;·&nbsp;
          <span class="pub-venue">${escapeHtml(pub.venue)}</span>
        </div>
        ${pub.url ? `<a href="${escapeHtml(pub.url)}" target="_blank" rel="noopener" class="pub-link">Read paper</a>` : ''}
      </div>
    </div>
  `).join('');
}

/* Blog posts — data source: BLOG_POSTS (data/blog.js) */
function renderBlog() {
  const grid = document.getElementById('blog-grid');
  if (!grid) return;

  if (!BLOG_POSTS.length) {
    grid.innerHTML = `
      <div class="blog-coming-soon" data-animate>
        Coming soon — stay tuned for thoughts on AI, XR, and beyond.
      </div>
    `;
    return;
  }

  grid.innerHTML = BLOG_POSTS.map((post, i) => {
    const date = formatIsoDate(post.date);
    const tagSlug = (post.tag || 'general').toLowerCase().replace(/\s+/g, '-');
    const readStr = post.readMin ? `${post.readMin} min →` : 'Read →';
    return `
      <a href="${escapeHtml(post.url)}" class="blog-card" data-animate data-delay="${i * 80}">
        <div class="blog-card-accent blog-accent-${tagSlug}"></div>
        <div class="blog-card-body">
          <span class="blog-tag">${escapeHtml(post.tag || 'Post')}</span>
          <span class="blog-title">${escapeHtml(post.title)}</span>
          <span class="blog-excerpt">${escapeHtml(post.excerpt)}</span>
        </div>
        <div class="blog-card-foot">
          <span class="blog-date">${escapeHtml(date)}</span>
          <span class="blog-read">${escapeHtml(readStr)}</span>
        </div>
      </a>
    `;
  }).join('');
}

/* Footer year */
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
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
    this._targetFps = this._isLowPower ? 30 : 45;
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
        vec2 disp = vec2(f1 - 0.5, f2 - 0.5) * 0.009;

        /* mouse repulsion / warping */
        vec2  toM = (uMouse - uv) * vec2(asp, 1.0);
        float md  = length(toM);
        disp     -= (toM / (md * md + 0.06)) * 0.007;

        /* chromatic aberration — 3 wavelengths offset horizontally */
        float ab = 0.010;
        float aR = texture2D(uTex, clamp(uv + disp + vec2( ab, 0.0), 0.0, 1.0)).a;
        float aG = texture2D(uTex, clamp(uv + disp,                  0.0, 1.0)).a;
        float aB = texture2D(uTex, clamp(uv + disp - vec2( ab, 0.0), 0.0, 1.0)).a;

        if (max(max(aR, aG), aB) < 0.004) discard;

        /* iridescent colour sweep — cycles with time + viewing angle */
        float ang   = atan((uv.y - 0.45), (uv.x - 0.5) * asp);
        float sweep = ang + uTime * 0.30 + md * 0.4;
        vec3 iri = vec3(
          0.5 + 0.5 * cos(sweep),
          0.5 + 0.5 * cos(sweep + 2.094),
          0.5 + 0.5 * cos(sweep + 4.189)
        );
        /* bias toward bright blue-white — glass / crystal look */
        iri = mix(vec3(0.72, 0.88, 1.00), iri * 1.45, 0.55);

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

    /* read the live font-size from the h1 (respects clamp() / viewport) */
    const fs = parseFloat(getComputedStyle(this.h1).fontSize);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    /* Line 1: "Stefano" — Inter Bold */
    ctx.font = `700 ${fs}px 'Inter', system-ui, sans-serif`;
    ctx.fillText('Stefano', w / 2, 0);

    /* Line 2: "Masneri" — Playfair Display Bold Italic
       line-height: 1 → second line starts at exactly fs */
    ctx.font = `italic 700 ${fs}px 'Playfair Display', Georgia, serif`;
    ctx.fillText('Masneri', w / 2, fs);

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
      measureCtx.font = `700 ${fs}px 'Inter', system-ui, sans-serif`;
      const l1 = measureCtx.measureText('Stefano').width;
      measureCtx.font = `italic 700 ${fs}px 'Playfair Display', Georgia, serif`;
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

/* Expose a minimal test surface in Node without affecting browser usage */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatIsoDate,
    geocodeLocations,
    Globe3D,
    renderPublications,
    renderBlog,
    setFooterYear,
    initTheme,
    initNavbar,
    initMobileMenu,
    initScrollReveal,
    initCounters,
    animateCounter,
    NeuralNetwork,
    NeuralNetwork2D,
    HeroNameShader,
    GlobeFallback2D,
  };
}

/* ═══════════════════════════════════════════════════════════
   INIT — runs when DOM is ready
   ═══════════════════════════════════════════════════════════ */
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {

  /* Render dynamic content (static sections are already in HTML) */
  renderPublications();
  renderBlog();
  setFooterYear();

  /* UI behaviours */
  initTheme();
  initNavbar();
  initMobileMenu();

  /* Scroll reveals (must come after content injection) */
  initScrollReveal();
  initCounters();

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

  /* Hero name — iridescent WebGL shader (progressive enhancement) */
  const nameH1 = document.getElementById('hero-name');
  const nameCanvas = document.getElementById('name-canvas');
  if (nameH1 && nameCanvas) {
    if (!prefersReducedMotion() && hasWebGLSupport()) new HeroNameShader(nameH1, nameCanvas);
  }

  });
}
