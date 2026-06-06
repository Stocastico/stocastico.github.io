/* ═══════════════════════════════════════════════════════════
   NEURAL NETWORK ANIMATION (hero background)

   Canvas2D particle + line graph. This module is intentionally
   Three-free: the hero is decorative and a flat 2D rendering is
   visually indistinguishable here, so keeping Three.js out of this
   chunk shaves the whole library (~140 KB gzip) off the homepage.
   The 3D globe (travel.html) still uses Three via js/globe.js.
   ═══════════════════════════════════════════════════════════ */
import { isLowPowerDevice } from './utils.js';
import { getTheme, rgba } from './theme.js';

/* Canvas2D hero background — drifting glow particles linked by faint lines. */
export class NeuralNetwork2D {
  constructor(canvas, onReady) {
    this.canvas = canvas;
    /* Resolve the active palette (dark or light) for this instance. A theme
       switch rebuilds the instance (js/main.js), re-reading the colour. */
    this._theme = getTheme();
    this._listeners = [];
    this._io = null;
    /* Fired once, right after the first frame paints, so the hero can fade the
       canvas in instead of letting the network pop in fully-formed. */
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
        ctx.strokeStyle = rgba(this._theme.accentHi, 0.22 * alpha);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const r = 1.2 + p.z * 1.6;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      g.addColorStop(0, rgba(this._theme.accent2Hi, 0.7));
      g.addColorStop(0.5, rgba(this._theme.accent2, 0.22));
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
