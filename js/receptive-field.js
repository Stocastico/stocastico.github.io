/* ═══════════════════════════════════════════════════════════
   RECEPTIVE FIELD — the name, as a convolution sees it

   The homepage hero. "Stefano Masneri" is rasterised into a grid of cells,
   and a 5×5 window — one receptive field — sits over it. Every column the
   window has passed shows that filter's response instead of the ink: one
   accent where it is positive, the other where it is negative, nothing where
   the filter has nothing to say. The visitor chooses the filter (a row of
   real <button aria-pressed>) and moves the window (drag, or the range input
   underneath, which is also the keyboard path).

   It replaced three renderers (cnn-hero.js, kernel-scan.js, the WebGL noise
   gradient) and their breakpoint swap. One scene now serves every viewport,
   because it is a picture of the one operation the rest of the site keeps
   talking about, and that operation reads the same at 390px as at 1440.

   Three decisions worth keeping straight:

   · **Drawn on demand, not in a loop.** The only animation is the intro
     sweep (one orchestrated moment, skipped under reduced motion). After
     that a frame is drawn when an input changes it — a drag, a filter, a
     resize, a theme — and the page is otherwise idle.

   · **The response is computed once per filter**, over the whole grid, and
     the window only decides how much of it is shown. A grid is ~150×40
     cells, so even the Harris detector is a few hundred thousand operations:
     well under a frame.

   · **The learned filter is the real one.** Its kernels are conv1 of the
     LeNet-5 behind projects/mnist-lenet.html (data/hero-scan.js, int8), and
     the module is imported only when that button is pressed.
     test/receptive-field.test.mjs holds it to the committed model.

   The <h1> stays in the DOM as real text; the canvas is aria-hidden
   decoration laid over it, and the CSS only hides the text once the
   canvas has painted (`.is-drawn` on the hero), so no-JS, print and
   crawlers keep the name.
   ═══════════════════════════════════════════════════════════ */

import { getTheme, rgba } from './theme.js';
import { prefersReducedMotion } from './utils.js';

export const K = 5;

/* 5×5 so every built-in filter shares the window's footprint. All of them
   sum to zero: flat ink and flat paper both answer with nothing, so what
   lights up is genuinely structure. */
const SOBEL_X = [
  -1, -2, 0, 2, 1,
  -4, -8, 0, 8, 4,
  -6, -12, 0, 12, 6,
  -4, -8, 0, 8, 4,
  -1, -2, 0, 2, 1,
];
const transpose = (k) => k.map((_, i) => k[(i % K) * K + Math.floor(i / K)]);

export const FILTERS = [
  {
    id: 'edges',
    label: 'Edges',
    kernel: [
      0, 0, -1, 0, 0,
      0, -1, -2, -1, 0,
      -1, -2, 16, -2, -1,
      0, -1, -2, -1, 0,
      0, 0, -1, 0, 0,
    ],
    caption: 'A Laplacian: it outlines every stroke, whatever its direction.',
  },
  {
    id: 'vertical',
    label: 'Vertical',
    kernel: SOBEL_X,
    caption: 'Sobel along x: vertical strokes, one colour where the ink starts and the other where it ends.',
  },
  {
    id: 'horizontal',
    label: 'Horizontal',
    kernel: transpose(SOBEL_X),
    caption: 'Sobel along y: the same question asked of horizontal strokes.',
  },
  {
    id: 'diagonal',
    label: 'Diagonal',
    kernel: Array.from({ length: K * K }, (_, i) => (i % K) - Math.floor(i / K)),
    caption: 'A gradient along the diagonal: strokes leaning one way answer positive, the other way negative.',
  },
  {
    id: 'corners',
    label: 'Corners',
    caption: 'Harris: not one kernel but a comparison of gradients inside the window. Positive at corners, negative along straight edges.',
  },
  {
    id: 'learned',
    label: 'Learned',
    caption: 'A filter nobody designed: conv1 of my LeNet-5, learned from MNIST digits.',
  },
];

/* ── Pure maths (unit-tested in Node) ──────────────────────────────────── */

/* Same-size 2D correlation with zero padding — what a conv layer computes. */
export function convolve(grid, w, h, kernel) {
  const out = new Float32Array(w * h);
  const r = (K - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) {
        const yy = y + j;
        if (yy < 0 || yy >= h) continue;
        for (let i = -r; i <= r; i++) {
          const xx = x + i;
          if (xx < 0 || xx >= w) continue;
          acc += kernel[(j + r) * K + (i + r)] * grid[yy * w + xx];
        }
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/* Harris corner response, with the structure tensor summed over the same
   5×5 window the other filters use. det − k·trace²: positive where the
   gradient turns (a corner), negative where it runs one way (an edge),
   zero where there is no gradient at all. */
export function harris(grid, w, h, k = 0.05) {
  const sx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const g3 = (x, y, kern) => {
    let a = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      a += kern[(j + 1) * 3 + (i + 1)] * grid[yy * w + xx];
    }
    return a;
  };
  const sy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const xx = new Float32Array(w * h), yy = new Float32Array(w * h), xy = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = g3(x, y, sx), gy = g3(x, y, sy), i = y * w + x;
    xx[i] = gx * gx; yy[i] = gy * gy; xy[i] = gx * gy;
  }
  const box = new Array(K * K).fill(1);
  const a = convolve(xx, w, h, box), b = convolve(yy, w, h, box), c = convolve(xy, w, h, box);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const tr = a[i] + b[i];
    const r = a[i] * b[i] - c[i] * c[i] - k * tr * tr;
    /* Float noise on a flat patch is not a feature. */
    out[i] = Math.abs(r) < 1e-9 ? 0 : r;
  }
  return out;
}

/* Scale into [-1, 1] by the largest magnitude, sign preserved. */
export function normalise(arr) {
  let m = 0;
  for (const v of arr) if (Math.abs(v) > m) m = Math.abs(v);
  const out = new Float32Array(arr.length);
  if (m === 0) return out;
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] / m;
  return out;
}

/* The normalised response of one filter. `learned` is the kernel to use
   when the filter is the learned one (it lives in a lazily imported module). */
export function respond(grid, w, h, filter, learned) {
  if (filter.id === 'corners') return normalise(harris(grid, w, h));
  const kernel = filter.id === 'learned' ? learned : filter.kernel;
  return normalise(convolve(grid, w, h, kernel));
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* data/hero-scan.js → six float32 5×5 kernels (int8 × one shared scale). */
export function decodeLearned(heroScan) {
  const { count, scale, weights } = heroScan.kernels;
  const raw = decodeBase64(weights);
  const out = [];
  for (let f = 0; f < count; f++) {
    const w = new Float32Array(K * K);
    for (let i = 0; i < K * K; i++) {
      const b = raw[f * K * K + i];
      w[i] = (b > 127 ? b - 256 : b) * scale;
    }
    out.push(w);
  }
  return out;
}

/* Largest integer font size (in cells) at which the widest line still fits
   the grid. `measure(text, size)` is canvas measureText in production and a
   stub in the tests. */
export function fitFont(lines, cols, measure) {
  let size = 4;
  while (size < 400 && Math.max(...lines.map((l) => measure(l, size + 1))) <= cols) size++;
  return size;
}

/* CSS font-stretch (a percentage, as getComputedStyle reports it) → the
   keyword the canvas font shorthand accepts, which takes no percentages. */
export function stretchKeyword(value) {
  const pct = parseFloat(value);
  if (!Number.isFinite(pct)) return 'normal';
  const steps = [
    [50, 'ultra-condensed'], [62.5, 'extra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'],
    [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded'], [150, 'extra-expanded'], [200, 'ultra-expanded'],
  ];
  let best = steps[0];
  for (const st of steps) if (Math.abs(st[0] - pct) < Math.abs(best[0] - pct)) best = st;
  return best[1];
}

/* How many columns a window at position t (0 → 1 across the grid) reveals. */
export function revealedColumns(t, cols) {
  return Math.round(Math.min(1, Math.max(0, t)) * cols);
}

/* ── Renderer ──────────────────────────────────────────────────────────── */

const INTRO_TO = 0.62;
const INTRO_MS = 1600;

export class ReceptiveField {
  /* root: the hero section. It must contain #field-canvas, the h1 the name is
     read from, and the .field-controls block (buttons, range, kernel). */
  constructor(root, onReady) {
    this.root = root;
    this.canvas = root.querySelector('#field-canvas');
    this.ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
    this._listeners = [];
    this._frame = null;
    this._ro = null;
    if (!this.ctx) return;

    this._theme = getTheme();
    this._onReady = typeof onReady === 'function' ? onReady : null;
    this._controls = root.querySelector('.field-controls');
    this._range = root.querySelector('#field-pos');
    this._caption = root.querySelector('.field-caption');
    this._kernelEl = root.querySelector('.field-kernel');
    this._nextBtn = root.querySelector('.field-next');
    this._buttons = Array.from(root.querySelectorAll('[data-filter]'));
    this._words = (root.querySelector('h1')?.textContent || 'Stefano Masneri').trim().split(/\s+/);

    this.filter = FILTERS[0];
    this._learned = null;
    this._learnedIdx = 0;
    this.t = prefersReducedMotion() ? INTRO_TO : 0;
    this.row = null;

    this._layout();
    this._select(this.filter.id);
    if (this._controls) this._controls.hidden = false;

    for (const b of this._buttons) this._on(b, 'click', () => this._select(b.dataset.filter));
    if (this._nextBtn) this._on(this._nextBtn, 'click', () => this._nextLearned());
    if (this._range) this._on(this._range, 'input', () => { this._stopIntro(); this.t = this._range.value / 1000; this._draw(); });

    /* Horizontal drags steer the window; vertical ones stay a page scroll
       (touch-action: pan-y on the canvas), so the hero never steals the
       site's primary gesture on a phone. */
    this._dragging = false;
    this._on(this.canvas, 'pointerdown', (e) => {
      this._dragging = true;
      this._stopIntro();
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this._pointer(e);
    });
    this._on(this.canvas, 'pointermove', (e) => { if (this._dragging) this._pointer(e); });
    for (const t of ['pointerup', 'pointercancel']) this._on(this.canvas, t, () => { this._dragging = false; });

    if (typeof ResizeObserver === 'function') {
      let last = this.canvas.clientWidth;
      this._ro = new ResizeObserver(() => {
        if (this.canvas.clientWidth === last) return;
        last = this.canvas.clientWidth;
        this._layout();
        this._compute();
        this._draw();
      });
      this._ro.observe(this.root);
    }

    /* The display face is a web font with font-display: swap, so the first
       layout may have measured a fallback. Lay out again once it is in. */
    if (document.fonts && typeof document.fonts.load === 'function') {
      document.fonts.load(this._font(100)).then(() => {
        if (!this.ctx) return;
        this._layout();
        this._compute();
        this._draw();
      }, () => {});
    }

    if (this.t < INTRO_TO) this._intro();
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
  }

  /* Grid size from the canvas width, then the name rasterised into it. */
  _layout() {
    const width = Math.max(200, this.canvas.clientWidth || this.root.clientWidth);
    /* ~7px cells on a desktop, ~5px on a phone: big enough to read as
       pixels, small enough that a condensed stroke is several cells wide —
       a 5×5 filter needs that much room to say anything about its inside. */
    const target = width >= 900 ? 7 : width >= 600 ? 6 : 5;
    const cols = Math.round(width / target);
    /* One line where there is room for it, a word per line where there is
       not: set condensed, the whole name runs as a banner across a desktop,
       and on a phone two lines keep each letter tall enough to read in 5px
       cells. */
    this._lines = width >= 900 ? [this._words.join(' ')] : this._words;
    /* Weight, width and family come from the <h1> itself, so the grid and
       the no-JS text are the same type and a CSS change moves both. */
    const cs = getComputedStyle(this.root.querySelector('h1') || this.root);
    const head = `${cs.fontWeight || 800} ${stretchKeyword(cs.fontStretch)}`;
    const probe = document.createElement('canvas').getContext('2d');
    const font = (s) => `${head} ${s}px ${cs.fontFamily}`;
    this._font = font;
    const size = fitFont(this._lines, cols, (text, s) => { probe.font = font(s); return probe.measureText(text).width; });
    const lineH = Math.round(size * 0.94);
    const cap = Math.round(size * 0.76);
    const rows = 2 + lineH * (this._lines.length - 1) + cap;

    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const g = off.getContext('2d');
    g.font = font(size);
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    this._lines.forEach((l, i) => g.fillText(l, 0, 1 + cap + i * lineH));
    const px = g.getImageData(0, 0, cols, rows).data;
    const grid = new Float32Array(cols * rows);
    for (let i = 0; i < grid.length; i++) grid[i] = px[i * 4 + 3] / 255;

    Object.assign(this, { cols, rows, grid, cell: width / cols });
    if (this.row === null || this.row >= rows) this.row = Math.round(1 + cap + lineH * (this._lines.length - 1) - cap / 2);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(rows * this.cell * dpr);
    this.canvas.style.height = `${rows * this.cell}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _compute() {
    this.response = respond(this.grid, this.cols, this.rows, this.filter, this._learned?.[this._learnedIdx]);
  }

  async _select(id) {
    const f = FILTERS.find((x) => x.id === id);
    if (!f) return;
    if (f.id === 'learned' && !this._learned) {
      const { HERO_SCAN } = await import('../data/hero-scan.js');
      this._learned = decodeLearned(HERO_SCAN);
      /* Start on the most edge-like of the six: large weights that nearly
         cancel. Picking by raw response energy chose filter 4, whose weights
         are all negative — a blur with its sign flipped, which paints the
         name as one green smudge and says nothing about what a conv layer
         learns. (Two others are dead ReLUs in the trained model.) */
      let best = -1;
      this._learned.forEach((k, i) => {
        const mass = k.reduce((a, v) => a + Math.abs(v), 0);
        const score = mass - Math.abs(k.reduce((a, v) => a + v, 0));
        if (score > best) { best = score; this._learnedIdx = i; }
      });
    }
    this.filter = f;
    for (const b of this._buttons) b.setAttribute('aria-pressed', String(b.dataset.filter === id));
    if (this._nextBtn) this._nextBtn.hidden = id !== 'learned';
    this._compute();
    this._renderKernel();
    this._draw();
  }

  _nextLearned() {
    if (!this._learned) return;
    this._learnedIdx = (this._learnedIdx + 1) % this._learned.length;
    this._compute();
    this._renderKernel();
    this._draw();
  }

  _renderKernel() {
    const f = this.filter;
    if (this._caption) {
      this._caption.textContent = f.id === 'learned'
        ? `${f.caption} Filter ${this._learnedIdx + 1} of ${this._learned.length}.`
        : f.caption;
    }
    if (!this._kernelEl) return;
    const k = f.id === 'learned' ? this._learned[this._learnedIdx] : f.kernel;
    if (!k) { this._kernelEl.hidden = true; return; }
    this._kernelEl.hidden = false;
    const max = Math.max(...Array.from(k, Math.abs)) || 1;
    const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/^(-?)0\./, '$1.'));
    const { accent, accent2 } = this._theme;
    const cells = Array.from(k, (v) => {
      /* Capped well below opaque: the numbers sit on the tint in the
         page's text colour, and a full-strength accent behind them fails
         4.5:1 (axe caught the centre weight of the Laplacian). */
      const a = (Math.abs(v) / max) * 0.38;
      const bg = v > 0 ? rgba(accent, a) : v < 0 ? rgba(accent2, a) : 'transparent';
      return `<span style="background:${bg}">${fmt(v)}</span>`;
    });
    this._kernelEl.innerHTML = cells.join('');
  }

  _pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    this.row = Math.min(this.rows - 1, Math.max(0, Math.floor((e.clientY - r.top) / this.cell)));
    this._draw();
  }

  _intro() {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / INTRO_MS);
      this.t = INTRO_TO * (1 - Math.pow(1 - p, 3));
      this._draw();
      this._frame = p < 1 ? requestAnimationFrame(step) : null;
    };
    this._frame = requestAnimationFrame(step);
  }

  _stopIntro() {
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = null;
  }

  _draw() {
    const { ctx, cols, rows, cell, grid, response } = this;
    if (!ctx || !response) return;
    const { text, accent, accent2, accentHi } = this._theme;
    const w = cols * cell;
    ctx.clearRect(0, 0, w, rows * cell);
    const sx = revealedColumns(this.t, cols);
    const gap = Math.max(1, cell * 0.14);
    const s = cell - gap;
    const empty = rgba(text, 0.07);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let fill = empty;
        if (x < sx) {
          const v = response[i];
          /* Weak responses fade out, strong ones saturate early: a low alpha
             over the dark ground mixes yellow and cyan into olive and teal,
             which reads as mud rather than as two signs. */
          if (Math.abs(v) >= 0.1) fill = rgba(v > 0 ? accent : accent2, Math.min(1, Math.abs(v) * 2));
        } else if (grid[i] > 0.35) {
          fill = rgba(text, grid[i]);
        }
        ctx.fillStyle = fill;
        ctx.fillRect(x * cell, y * cell, s, s);
      }
    }
    /* The sweep line and the window itself. */
    const lx = sx * cell - gap / 2;
    ctx.strokeStyle = rgba(text, 0.45);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, rows * cell); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = accentHi;
    ctx.lineWidth = 2.5;
    const half = (K - 1) / 2;
    ctx.strokeRect((sx - half - 0.5) * cell - gap / 2, (this.row - half) * cell - gap / 2, K * cell, K * cell);

    if (this._range) this._range.value = String(Math.round(this.t * 1000));
    if (this._onReady) { const cb = this._onReady; this._onReady = null; cb(); }
  }

  /* themechange: same filter, same window, the new palette. */
  recolour() {
    if (!this.ctx) return;
    this._theme = getTheme();
    this._renderKernel();
    this._draw();
  }

  destroy() {
    this._stopIntro();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    for (const { target, type, fn, opts } of this._listeners) {
      try { target.removeEventListener(type, fn, opts); } catch (_) { /* ignore */ }
    }
    this._listeners = [];
    this.ctx = null;
  }
}
