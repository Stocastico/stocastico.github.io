/* ═══════════════════════════════════════════════════════════
   NEURAL NETWORK ANIMATION (hero background)

   Two implementations are exported:
   - NeuralNetwork:   Three.js / WebGL particle + line graph
   - NeuralNetwork2D: Canvas2D fallback when WebGL is unavailable
   ═══════════════════════════════════════════════════════════ */
import * as _THREE from 'three';
import { onChange } from './three-context.js';
import { isLowPowerDevice } from './utils.js';

/* Named bindings (tree-shakable by Rollup) — re-destructured on test
   THREE swaps so mocks still take effect. */
let {
  WebGLRenderer, Scene, PerspectiveCamera,
  BufferGeometry, BufferAttribute,
  PointsMaterial, Points,
  LineBasicMaterial, LineSegments,
  CanvasTexture, AdditiveBlending,
} = _THREE;

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
  static ACCENT_R = 0.424; static ACCENT_G = 0.392; static ACCENT_B = 1.0;   /* #6c63ff */
  static CYAN_R = 0.0; static CYAN_G = 0.831; static CYAN_B = 1.0;   /* #00d4ff */

  constructor(canvas) {
    this.canvas = canvas;
    this.mouse = { x: 0, y: 0 };
    this.frameId = null;
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
    }, { passive: true });
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
    /* FPS cap — bail out if not enough time has elapsed since the last draw. */
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = now;
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
export class NeuralNetwork2D {
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
    /* FPS cap — 30 fps is plenty for a slow-drifting 2D canvas animation. */
    this._minFrameTime = 1 / 30;
    this._lastDrawTime = 0;

    this._onResize();
    for (let i = 0; i < this.count; i++) this.points.push(this._newPoint());

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }, { passive: true });
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
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = now;
    this._draw();
  }
}
