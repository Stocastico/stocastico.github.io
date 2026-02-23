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

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.z = 600;

    this._initParticles();
    this._initLines();
    this._onResize();

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
    const n = NeuralNetwork.PARTICLE_COUNT;
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
    const n = NeuralNetwork.PARTICLE_COUNT;
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
    const n = NeuralNetwork.PARTICLE_COUNT;
    const dist = NeuralNetwork.CONNECTION_DIST;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
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

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(this.w, this.h);
    this.renderer.setClearColor(0x000000, 0);

    /* Ambient: enough fill to see the night side without washing out the day side */
    this.scene.add(new THREE.AmbientLight(0x223355, 0.9));
    /* Sun: warm directional — high intensity for vivid textures */
    const sun = new THREE.DirectionalLight(0xfff5d6, 3.2);
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
    /* ── Earth textures (Three.js r134 via jsDelivr CDN) ─────────────────────
       Loaded asynchronously; a fallback dark-ocean material is shown
       immediately and swapped once the texture arrives. */
    const CDN = 'https://cdn.jsdelivr.net/npm/three@0.134.0/examples/textures/planets/';
    const ldr = new THREE.TextureLoader();
    const mat = new THREE.MeshPhongMaterial({
      color: 0x0a1628,   /* shown before texture loads */
      emissive: 0x050c1a,
      specular: new THREE.Color(0x555555),
      shininess: 25,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), mat);
    this.pivot.add(globe);

    /* Day texture (satellite imagery with clouds) */
    ldr.load(CDN + 'earth_atmos_2048.jpg',
      tex => { tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; },
      undefined,
      () => console.warn('[Globe] earth day texture failed to load — using fallback colour'),
    );
    /* Specular map (oceans bright, land dull) */
    ldr.load(CDN + 'earth_specular_2048.jpg',
      tex => { mat.specularMap = tex; mat.needsUpdate = true; },
    );
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
    /* Distribute 1 400 stars on a large sphere around the scene */
    const COUNT = 1400;
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

        const pts = curve.getPoints(96);   /* 96 segments for smooth curves */
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
    });
  }

  /* ── Render loop ────────────────────────────────────────── */
  _animate() {
    /* Stop the loop when the tab is hidden or the globe is off-screen */
    if (document.hidden || !this._globeVisible) { this._rafId = null; return; }
    this._rafId = requestAnimationFrame(() => this._animate());

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
function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  let last = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('scrolled', y > 20);
    last = y;
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   MOBILE MENU TOGGLE
   ═══════════════════════════════════════════════════════════ */
function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', () => {
    const open = toggle.classList.toggle('open');
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });

  /* Close on link click */
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      toggle.classList.remove('open');
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', false);
    });
  });
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

/* Publication items — data source: PUBLICATIONS (data/publications.js) */
function renderPublications() {
  const list = document.getElementById('publications-list');
  if (!list) return;

  list.innerHTML = PUBLICATIONS.map((pub, i) => `
    <div class="pub-item" role="listitem" data-animate data-delay="${i * 70}">
      <div class="pub-year">${pub.year}</div>
      <div>
        <div class="pub-title">${pub.title}</div>
        <div class="pub-meta">
          ${pub.authors} &nbsp;·&nbsp;
          <span class="pub-venue">${pub.venue}</span>
        </div>
        ${pub.url ? `<a href="${pub.url}" target="_blank" rel="noopener" class="pub-link">Read paper</a>` : ''}
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
      <a href="${post.url}" class="blog-card" data-animate data-delay="${i * 80}">
        <div class="blog-card-accent blog-accent-${tagSlug}"></div>
        <div class="blog-card-body">
          <span class="blog-tag">${post.tag || 'Post'}</span>
          <span class="blog-title">${post.title}</span>
          <span class="blog-excerpt">${post.excerpt}</span>
        </div>
        <div class="blog-card-foot">
          <span class="blog-date">${date}</span>
          <span class="blog-read">${readStr}</span>
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

    const gl = canvasEl.getContext('webgl', { alpha: true, premultipliedAlpha: false })
      || canvasEl.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) { console.warn('[HeroName] WebGL unavailable — CSS fallback active'); return; }
    this.gl = gl;

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
    const dpr = Math.min(devicePixelRatio, 2);
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
    const dpr = Math.min(devicePixelRatio, 2);
    const w = this.h1.offsetWidth || 400;
    const h = this.h1.offsetHeight || 200;

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
    this.t += 1 / 60;
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
  initNavbar();
  initMobileMenu();

  /* Scroll reveals (must come after content injection) */
  initScrollReveal();
  initCounters();

  /* Three.js neural network — only when THREE is loaded */
  const canvas = document.getElementById('neural-canvas');
  if (canvas && typeof THREE !== 'undefined') {
    /* Disable on reduced-motion preference */
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prefersReducedMotion) {
      new NeuralNetwork(canvas);
    } else {
      canvas.style.display = 'none';
    }
  }

  /* Three.js Globe — geocode any entries missing lat/lon, then build */
  const globeCanvas = document.getElementById('globe-canvas');
  if (globeCanvas && typeof THREE !== 'undefined' && typeof LOCATIONS !== 'undefined') {
    geocodeLocations(LOCATIONS).then(() => new Globe3D(globeCanvas));
  }

  /* Hero name — iridescent WebGL shader (progressive enhancement) */
  const nameH1 = document.getElementById('hero-name');
  const nameCanvas = document.getElementById('name-canvas');
  if (nameH1 && nameCanvas) {
    const pref = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!pref) new HeroNameShader(nameH1, nameCanvas);
  }

  });
}
