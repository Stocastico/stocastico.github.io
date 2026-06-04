/* ═══════════════════════════════════════════════════════════
   NEURAL NETWORK ANIMATION (hero background)

   Two implementations are exported:
   - NeuralNetwork:   Three.js / WebGL particle + line graph
   - NeuralNetwork2D: Canvas2D fallback when WebGL is unavailable
   ═══════════════════════════════════════════════════════════ */
import { onChange } from './three-context.js';
import { isLowPowerDevice } from './utils.js';
import { THEME, glvec, rgba } from './theme.js';

/* THREE bindings — declared without an initial value; the onChange callback
   fires immediately on registration with the active THREE namespace and again
   whenever tests swap it via __setThreeForTests().  No `import * as THREE`
   here, so Rollup can tree-shake the library down to only what
   three-context.js explicitly imports. */
let WebGLRenderer, Scene, PerspectiveCamera,
  BufferGeometry, BufferAttribute,
  PointsMaterial, Points,
  LineBasicMaterial, LineSegments,
  CanvasTexture, AdditiveBlending;

onChange((t) => {
  ({
    WebGLRenderer, Scene, PerspectiveCamera,
    BufferGeometry, BufferAttribute,
    PointsMaterial, Points,
    LineBasicMaterial, LineSegments,
    CanvasTexture, AdditiveBlending,
  } = t);
});

export class NeuralNetwork {
  /* Tweak these to change the visual */
  static PARTICLE_COUNT = 90;
  static CONNECTION_DIST = 150;  /* max distance (px) to draw a line */
  static SPEED = 0.4;  /* particle drift speed             */
  static MOUSE_RADIUS = 220;  /* attraction zone around cursor    */
  static MOUSE_STRENGTH = 0.0008;
  /* Connection-line gradient endpoints — [r,g,b] floats from the active
     theme palette (data/palettes.yaml → js/theme.js). */
  static ACCENT  = glvec(THEME.accent);
  static ACCENT2 = glvec(THEME.accent2);

  constructor(canvas, onReady) {
    this.canvas = canvas;
    this.mouse = { x: 0, y: 0 };
    this.frameId = null;
    /* Fired once, right after the first frame paints, so the hero can fade the
       canvas in instead of letting the network pop in fully-formed. */
    this._onReady = typeof onReady === 'function' ? onReady : null;
    this._isLowPower = isLowPowerDevice();
    this.particleCount = this._isLowPower ? 64 : NeuralNetwork.PARTICLE_COUNT;
    this.connectionDist = this._isLowPower ? 130 : NeuralNetwork.CONNECTION_DIST;
    /* Cap at 1.0 so WebGL line segments stay at least 1 CSS-pixel wide
       on HiDPI/Retina screens (WebGL clamps linewidth to 1 device pixel). */
    this.pixelRatioCap = 1;
    this.lineFrameStep = this._isLowPower ? 2 : 1;
    this._lineTick = 0;
    /* Throttle rAF — drift is imperceptibly smooth at 45 fps and saves
       ~50 % of the GPU/CPU budget on 120 Hz displays. */
    this._targetFps = this._isLowPower ? 30 : 45;
    this._minFrameTime = 1 / this._targetFps;
    this._lastDrawTime = 0;

    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !this._isLowPower,
      powerPreference: this._isLowPower ? 'low-power' : 'high-performance',
    });
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(60, 1, 0.1, 2000);
    this.camera.position.z = 600;

    this._initParticles();
    this._initLines();
    this._onResize();

    /* Track every listener + observer so destroy() can tear them all down. */
    this._listeners = [];

    if (typeof canvas.addEventListener === 'function') {
      this._addListener(canvas, 'webglcontextlost', (e) => {
        e.preventDefault();
        this.frameId = null;
      }, false);
      this._addListener(canvas, 'webglcontextrestored', () => {
        this._onResize();
        if (!this.frameId) this._animate();
      }, false);
    }

    this._addListener(window, 'resize', () => this._onResize());
    this._addListener(window, 'mousemove', e => {
      this.mouse.x = e.clientX - window.innerWidth / 2;
      this.mouse.y = -(e.clientY - window.innerHeight / 2);
    }, { passive: true });
    /* Touch support */
    this._addListener(window, 'touchmove', e => {
      if (!e.touches[0]) return;
      this.mouse.x = e.touches[0].clientX - window.innerWidth / 2;
      this.mouse.y = -(e.touches[0].clientY - window.innerHeight / 2);
    }, { passive: true });

    /* Pause rendering when the section scrolls out of view */
    this._visible = true;
    this._io = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
      if (this._visible && !this.frameId) this._animate();
    }, { threshold: 0 });
    this._io.observe(canvas);

    /* Pause rendering when the browser tab is hidden */
    this._addListener(document, 'visibilitychange', () => {
      if (!document.hidden && !this.frameId) this._animate();
    });

    this._animate();
  }

  /* Track + register a listener so destroy() can later remove it. */
  _addListener(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
  }

  /* Create a soft glow disc texture for each particle */
  _glowTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0, rgba(THEME.accent, 1));
    g.addColorStop(0.25, rgba(THEME.accent, 0.7));
    g.addColorStop(0.6, rgba(THEME.accent2, 0.25));
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new CanvasTexture(c);
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

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));

    const mat = new PointsMaterial({
      size: 6,
      map: this._glowTexture(),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });

    this.points = new Points(geo, mat);
    this.scene.add(this.points);
  }

  _initLines() {
    const n = this.particleCount;
    const maxPairs = n * (n - 1) / 2;        /* upper bound */

    this.linePosArr = new Float32Array(maxPairs * 6);
    this.lineColArr = new Float32Array(maxPairs * 6);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.linePosArr, 3));
    geo.setAttribute('color', new BufferAttribute(this.lineColArr, 3));

    const mat = new LineBasicMaterial({
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      linewidth: 2,   /* respected on some platforms; harmless no-op elsewhere */
    });

    this.lines = new LineSegments(geo, mat);
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
    const [R1, G1, B1] = NeuralNetwork.ACCENT;
    const [R2, G2, B2] = NeuralNetwork.ACCENT2;
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
    /* FPS cap — bail out if not enough time has elapsed since the last draw. */
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = now;
    this._update();
    this.renderer.render(this.scene, this.camera);
    this._signalReady();
  }

  /* Invoke the onReady callback exactly once, after the first painted frame. */
  _signalReady() {
    if (!this._onReady) return;
    const cb = this._onReady;
    this._onReady = null;
    cb();
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
    this.frameId = null;
    if (this._io) { this._io.disconnect(); this._io = null; }
    for (const { target, type, fn, opts } of (this._listeners || [])) {
      try { target.removeEventListener(type, fn, opts); } catch (_) { /* ignore */ }
    }
    this._listeners = [];

    /* Walk the scene tree and free GPU resources (geometries, materials and
       their textures — e.g. the additive glow map on the points material).
       Mirrors Globe3D.destroy(); guarded so test mocks without dispose() are
       safe. Without this the renderer, geometries and glow texture leak on
       every pagehide / bfcache eviction. */
    if (this.scene && Array.isArray(this.scene.children)) {
      const visit = (obj) => {
        if (!obj) return;
        if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
        const mat = obj.material;
        if (mat) {
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) {
            if (m && typeof m.dispose === 'function') m.dispose();
            for (const key of ['map', 'alphaMap']) {
              if (m && m[key] && typeof m[key].dispose === 'function') m[key].dispose();
            }
          }
        }
        if (Array.isArray(obj.children)) obj.children.forEach(visit);
      };
      this.scene.children.forEach(visit);
    }

    if (this.renderer) {
      try {
        if (typeof this.renderer.dispose === 'function') this.renderer.dispose();
        if (typeof this.renderer.forceContextLoss === 'function') this.renderer.forceContextLoss();
      } catch (_) { /* ignore */ }
    }

    this.scene = null;
    this.renderer = null;
    this.points = null;
    this.lines = null;
    this.lineGeo = null;
  }
}

/* CPU fallback for the hero background when WebGL is unavailable */
export class NeuralNetwork2D {
  constructor(canvas, onReady) {
    this.canvas = canvas;
    this._listeners = [];
    this._io = null;
    /* Fired once, right after the first frame paints — see NeuralNetwork. */
    this._onReady = typeof onReady === 'function' ? onReady : null;
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
    /* FPS cap — 30 fps is plenty for a slow-drifting 2D canvas animation. */
    this._minFrameTime = 1 / 30;
    this._lastDrawTime = 0;

    this._onResize();
    for (let i = 0; i < this.count; i++) this.points.push(this._newPoint());

    this._addListener(window, 'resize', () => this._onResize());
    this._addListener(window, 'mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }, { passive: true });
    this._addListener(window, 'touchmove', (e) => {
      if (!e.touches[0]) return;
      this.mouse.x = e.touches[0].clientX;
      this.mouse.y = e.touches[0].clientY;
    }, { passive: true });

    this._io = new IntersectionObserver(([entry]) => {
      this._visible = entry.isIntersecting;
      if (this._visible && !this.frameId) this._animate();
    }, { threshold: 0 });
    this._io.observe(canvas);

    this._addListener(document, 'visibilitychange', () => {
      if (!document.hidden && !this.frameId) this._animate();
    });

    this._animate();
  }

  /* Track + register a listener so destroy() can later remove it. */
  _addListener(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
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
        ctx.strokeStyle = rgba(THEME.accentHi, 0.22 * alpha);
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
      g.addColorStop(0, rgba(THEME.accent2Hi, 0.95));
      g.addColorStop(0.5, rgba(THEME.accent2, 0.35));
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
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = now;
    this._draw();
    this._signalReady();
  }

  /* Invoke the onReady callback exactly once, after the first painted frame. */
  _signalReady() {
    if (!this._onReady) return;
    const cb = this._onReady;
    this._onReady = null;
    cb();
  }

  destroy() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    if (this._io) { this._io.disconnect(); this._io = null; }
    for (const { target, type, fn, opts } of (this._listeners || [])) {
      try { target.removeEventListener(type, fn, opts); } catch (_) { /* ignore */ }
    }
    this._listeners = [];
  }
}
