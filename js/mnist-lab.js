/* ═══════════════════════════════════════════════════════════
   mnist-lab.js — draw a digit, watch the real LeNet-5 read it

   The interactive counterpart to the homepage hero. The hero is a *player*:
   it replays activations that were computed offline and baked into
   data/cnn-activations.js, because the homepage must not pay for an ML
   runtime. This page does the opposite — it runs the actual forward pass in
   the browser, on whatever the visitor draws.

   What that costs: data/lenet-weights.js (~61 KB source, ~44 KB gzip, int8)
   and js/lenet.js. Both arrive through a dynamic import from js/main.js that
   only fires on this page, so nothing else on the site is affected. One
   classification is ~280 k multiply-accumulates — well under a millisecond,
   so inference runs live inside a pointermove handler without a worker.

   The forward pass is the same code the training script uses (js/lenet.js);
   the preprocessing is in js/mnist-preprocess.js and is the part that
   actually determines whether this looks like a working model.
   ═══════════════════════════════════════════════════════════ */

import { getTheme, rgba } from './theme.js';
import { createState, forward, argmax } from './lenet.js';
import { preprocessDigit, grayFromImageData, FIELD } from './mnist-preprocess.js';
import { prefersReducedMotion } from './utils.js';

/* Logical size of the drawing surface. Ten times MNIST's 28 px, so the
   downsample in mnist-preprocess.js has plenty to average over. */
const DRAW = 280;
/* Stroke width in drawing-surface pixels. MNIST digits were written with a
   thick pen relative to the 20×20 box; a hairline stroke downsamples to
   something the model has never seen. ~24/280 matches the training data. */
const STROKE = 24;

/* The layers shown in the strip, in signal order. `cols` splits a layer's
   feature maps into a grid; `cell` is the size of one activation in CSS
   pixels before the canvas is scaled to fit its column. */
const LAYER_VIEWS = [
  { id: 'conv1', key: 'c1', label: 'conv1', detail: '6 × 24×24', maps: 6, w: 24, h: 24, cols: 3, cell: 3 },
  { id: 'pool1', key: 'p1', label: 'pool1', detail: '6 × 12×12', maps: 6, w: 12, h: 12, cols: 3, cell: 5 },
  { id: 'conv2', key: 'c2', label: 'conv2', detail: '16 × 8×8', maps: 16, w: 8, h: 8, cols: 4, cell: 7 },
  { id: 'pool2', key: 'p2', label: 'pool2', detail: '16 × 4×4', maps: 16, w: 4, h: 4, cols: 4, cell: 11 },
  /* Deliberately squarish rather than one long row: the strip is laid out at a
     fixed height, so a wide layer eats horizontal space and pushes the last
     one onto a second line with a hole beside it. */
  { id: 'fc1', key: 'h1', label: 'fc1', detail: '120 units', vector: 120, cols: 12, cell: 9 },
  { id: 'fc2', key: 'h2', label: 'fc2', detail: '84 units', vector: 84, cols: 12, cell: 11 },
];

const MAP_GAP = 3;      /* gap between feature maps, in cell-space pixels */
const REVEAL_STEP = 90; /* ms between consecutive layer reveals */
const REVEAL_RAMP = 190;/* ms for one layer to fill in */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ═══ The lab ═══════════════════════════════════════════════════════════ */

export class MnistLab {
  /* `root` is the .mnist-lab element; `model` the dequantised weight bag. */
  constructor(root, model, samples) {
    this.root = root;
    this.model = model;
    this.samples = samples || [];
    this.state = createState();
    this.theme = getTheme();
    this._listeners = [];
    this._raf = null;
    this._sampleCursor = -1;
    this._hasResult = false;
    this._revealT0 = 0;
    this._animating = false;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.drawCanvas = root.querySelector('[data-mnist="draw"]');
    this.previewCanvas = root.querySelector('[data-mnist="preview"]');
    this.verdictEl = root.querySelector('[data-mnist="verdict"]');
    this.confidenceEl = root.querySelector('[data-mnist="confidence"]');
    this.barsEl = root.querySelector('[data-mnist="bars"]');
    this.layersEl = root.querySelector('[data-mnist="layers"]');
    this.statusEl = root.querySelector('[data-mnist="status"]');
    if (!this.drawCanvas || !this.layersEl) return;

    this._setupDrawing();
    this._buildBars();
    this._buildLayers();
    this._setupControls();

    this._resolveInk();
    this._onTheme = () => {
      this.theme = getTheme();
      this._resolveInk();
      this._paintStrokeStyle();
      this._retintStrokes();
      /* Re-run so every canvas repaints in the new palette. The pixels the
         model sees come from the alpha channel, so a colour change cannot
         alter the prediction — this is purely cosmetic. */
      if (this._hasResult) this._run({ animate: false });
      else this._renderIdle();
    };
    window.addEventListener('themechange', this._onTheme);

    this._renderIdle();
  }

  /* Pick, for each accent, whichever shade contrasts more against the current
     background. Dark palettes want the brighter `*Hi` variant; light palettes
     want the plain one, which is the shade they darken for WCAG AA — using
     `*Hi` there paints pale ink onto a pale surface and the deep layers all
     but vanish. Deciding by measured luminance rather than by reading
     data-theme keeps this right for any palette added later. */
  _resolveInk() {
    const bg = luminance(this.theme.bg);
    const pick = (a, b) =>
      (Math.abs(luminance(a) - bg) >= Math.abs(luminance(b) - bg) ? a : b);
    this._ink = pick(this.theme.accent2Hi, this.theme.accent2);
    this._inkWinner = pick(this.theme.accentHi, this.theme.accent);
  }

  /* ── Drawing surface ───────────────────────────────────────────────────── */

  _setupDrawing() {
    const c = this.drawCanvas;
    c.width = DRAW * this._dpr;
    c.height = DRAW * this._dpr;
    this.dctx = c.getContext('2d', { willReadFrequently: true });
    this.dctx.scale(this._dpr, this._dpr);
    this._paintStrokeStyle();

    this._drawing = false;
    this._last = null;
    this._dirty = false;

    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * DRAW,
        y: ((e.clientY - r.top) / r.height) * DRAW,
      };
    };

    const down = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this._drawing = true;
      this._last = pos(e);
      /* A tap with no movement should still leave a dot. */
      this.dctx.beginPath();
      this.dctx.arc(this._last.x, this._last.y, STROKE / 2, 0, Math.PI * 2);
      this.dctx.fill();
      this._dirty = true;
      if (c.setPointerCapture && e.pointerId !== undefined) {
        try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      e.preventDefault();
    };

    const move = (e) => {
      if (!this._drawing) return;
      const p = pos(e);
      this.dctx.beginPath();
      this.dctx.moveTo(this._last.x, this._last.y);
      this.dctx.lineTo(p.x, p.y);
      this.dctx.stroke();
      this._last = p;
      this._dirty = true;
      /* Live inference. It is cheap enough to run every frame, but the
         redraw of 44 feature maps is not, so coalesce onto rAF. */
      this._scheduleLive();
      e.preventDefault();
    };

    const up = () => {
      if (!this._drawing) return;
      this._drawing = false;
      this._last = null;
      /* Final pass, animated if this is the first result since a clear —
         the propagation reveal is worth seeing once, not on every stroke. */
      this._run({ animate: !this._hasResult });
    };

    this._on(c, 'pointerdown', down);
    this._on(c, 'pointermove', move);
    this._on(c, 'pointerup', up);
    this._on(c, 'pointercancel', up);
    this._on(c, 'pointerleave', up);
    /* Stop a drag on the canvas from scrolling the page on touch. */
    this._on(c, 'touchstart', (e) => e.preventDefault(), { passive: false });
    this._on(c, 'touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /* Ink is drawn in the palette's accent, fully opaque. The colour is free:
     mnist-preprocess reads the *alpha* channel as ink, so what the model sees
     is a clean mask no matter which palette is active. */
  _paintStrokeStyle() {
    if (!this.dctx) return;
    this.dctx.strokeStyle = this.theme.accent;
    this.dctx.fillStyle = this.theme.accent;
    this.dctx.lineWidth = STROKE;
    this.dctx.lineCap = 'round';
    this.dctx.lineJoin = 'round';
  }

  /* Recolour ink already on the canvas after a palette switch. `source-in`
     keeps the destination alpha and replaces only the colour, so the mask the
     model reads comes through the operation bit-for-bit unchanged. */
  _retintStrokes() {
    if (!this.dctx || !this._dirty) return;
    const ctx = this.dctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = this.theme.accent;
    ctx.fillRect(0, 0, DRAW, DRAW);
    ctx.restore();
  }

  _scheduleLive() {
    if (this._liveQueued) return;
    this._liveQueued = true;
    requestAnimationFrame(() => {
      this._liveQueued = false;
      if (this._drawing) this._run({ animate: false });
    });
  }

  /* ── Controls ──────────────────────────────────────────────────────────── */

  _setupControls() {
    const clearBtn = this.root.querySelector('[data-mnist="clear"]');
    const exampleBtn = this.root.querySelector('[data-mnist="example"]');
    if (clearBtn) this._on(clearBtn, 'click', () => this.clear());
    if (exampleBtn) this._on(exampleBtn, 'click', () => this.loadExample());
  }

  clear() {
    this.dctx.clearRect(0, 0, DRAW, DRAW);
    this._dirty = false;
    this._hasResult = false;
    /* Forget what was last announced, so redrawing the same digit after a
       clear is announced again instead of being deduplicated into silence. */
    this._lastSpoken = null;
    this._lastSpokenP = null;
    this._stopAnimation();
    this._renderIdle();
    this._say('Canvas cleared.');
  }

  /* Draw one of the ten committed MNIST test digits onto the canvas, so the
     page is usable without a pointer and so there is always a reference for
     what a "well-formed" digit looks like. */
  loadExample() {
    if (!this.samples.length) return;
    this._sampleCursor = (this._sampleCursor + 1) % this.samples.length;
    const sample = this.samples[this._sampleCursor];
    const pixels = decodeBase64(sample.pixels);

    /* Paint the 28×28 onto an offscreen buffer and blit it up nearest-neighbour.
       A smooth upscale looks more like a drawn stroke, but it is a lie with a
       measurable cost: the blur it adds survives the downsample, and the same
       digit drops from p = 0.99 to p = 0.82. Crisp pixels keep the example
       faithful and match the deliberately pixelated preview beside it. */
    const off = document.createElement('canvas');
    off.width = FIELD;
    off.height = FIELD;
    const octx = off.getContext('2d');
    const img = octx.createImageData(FIELD, FIELD);
    const [r, g, b] = rgbOf(this.theme.accent);
    for (let i = 0, p = 0; i < pixels.length; i++, p += 4) {
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = pixels[i];
    }
    octx.putImageData(img, 0, 0);

    this.dctx.clearRect(0, 0, DRAW, DRAW);
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(off, 0, 0, DRAW, DRAW);
    this.dctx.imageSmoothingEnabled = true;
    this._dirty = true;
    this._hasResult = false;
    this._run({ animate: true });
    this._say(`Loaded MNIST test digit ${sample.digit}.`);
  }

  /* ── Inference ─────────────────────────────────────────────────────────── */

  _run({ animate }) {
    if (!this._dirty) { this._renderIdle(); return; }

    const img = this.dctx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);
    const { gray, width, height } = grayFromImageData(img);
    const pixels = preprocessDigit(gray, width, height);
    if (!pixels) { this._renderIdle(); return; }

    forward(this.model, pixels, this.state);
    this.pixels = pixels;
    this._hasResult = true;

    /* Per-layer max, so each layer is displayed against its own range —
       raw ReLU outputs differ by an order of magnitude between conv1 and fc2
       and a shared scale would render the deep layers black. */
    this._maxima = {};
    for (const view of LAYER_VIEWS) {
      const arr = this.state[view.key];
      let max = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
      this._maxima[view.key] = max || 1;
    }

    if (animate && !prefersReducedMotion()) this._startAnimation();
    else { this._stopAnimation(); this._render(1); }
  }

  _startAnimation() {
    this._stopAnimation();
    this._animating = true;
    this._revealT0 = performance.now();
    /* +2 stages: the 28×28 preview leads the strip and the verdict trails it. */
    const total = (LAYER_VIEWS.length + 2) * REVEAL_STEP + REVEAL_RAMP;
    const tick = () => {
      const elapsed = performance.now() - this._revealT0;
      this._render(elapsed / total >= 1 ? 1 : elapsed);
      if (elapsed < total) this._raf = requestAnimationFrame(tick);
      else { this._raf = null; this._animating = false; this._render(1); }
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopAnimation() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._animating = false;
  }

  /* `t` is either 1 (fully revealed) or elapsed milliseconds. */
  _revealFor(index, t) {
    if (t === 1) return 1;
    return clamp01((t - index * REVEAL_STEP) / REVEAL_RAMP);
  }

  /* ── Rendering ─────────────────────────────────────────────────────────── */

  _render(t) {
    this._renderPreview(this._revealFor(0, t));
    for (let i = 0; i < LAYER_VIEWS.length; i++) {
      const view = LAYER_VIEWS[i];
      this._renderLayer(view, this._revealFor(i + 1, t));
    }
    const outReveal = this._revealFor(LAYER_VIEWS.length + 1, t);
    this._renderBars(outReveal);
    this._renderVerdict(outReveal);
  }

  _renderIdle() {
    this._clearCanvas(this.previewCanvas);
    for (const view of LAYER_VIEWS) this._clearCanvas(this._canvases[view.id]);
    this._renderBars(0);
    if (this.verdictEl) this.verdictEl.textContent = '–';
    if (this.confidenceEl) this.confidenceEl.textContent = 'draw a digit';
    this.root.classList.remove('is-classified');
  }

  _clearCanvas(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* The 28×28 the model actually receives — the single most useful thing on
     the page when a prediction looks wrong, because it usually shows why. */
  _renderPreview(reveal) {
    const canvas = this.previewCanvas;
    if (!canvas || !this.pixels) return;
    const ctx = canvas.getContext('2d');
    const cell = canvas.width / FIELD;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < FIELD; y++) {
      for (let x = 0; x < FIELD; x++) {
        const v = this.pixels[y * FIELD + x];
        if (v < 8) continue;
        ctx.fillStyle = rgba(this._inkWinner, (v / 255) * reveal);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  _renderLayer(view, reveal) {
    const canvas = this._canvases[view.id];
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (reveal <= 0 || !this._maxima) return;

    const arr = this.state[view.key];
    const max = this._maxima[view.key];
    const scale = canvas.width / this._layerGeom(view).w;
    ctx.scale(scale, scale);

    if (view.vector) this._renderVectorLayer(ctx, view, arr, max, reveal);
    else this._renderMapLayer(ctx, view, arr, max, reveal);
  }

  _renderMapLayer(ctx, view, arr, max, reveal) {
    const plane = view.w * view.h;
    for (let m = 0; m < view.maps; m++) {
      const gx = (m % view.cols) * (view.w * view.cell + MAP_GAP);
      const gy = Math.floor(m / view.cols) * (view.h * view.cell + MAP_GAP);
      /* Maps light up left-to-right, top-to-bottom within the layer, so the
         reveal reads as the signal spreading rather than a plain fade. */
      const seq = view.maps > 1 ? m / (view.maps - 1) : 0;
      const local = clamp01((reveal - seq * 0.35) / 0.65);
      if (local <= 0) continue;

      ctx.fillStyle = rgba(this._ink, 0.10 * local);
      ctx.fillRect(gx, gy, view.w * view.cell, view.h * view.cell);

      for (let y = 0; y < view.h; y++) {
        for (let x = 0; x < view.w; x++) {
          const v = arr[m * plane + y * view.w + x] / max;
          if (v <= 0.02) continue;
          ctx.fillStyle = rgba(this._ink, Math.min(1, v) * local);
          ctx.fillRect(gx + x * view.cell, gy + y * view.cell, view.cell, view.cell);
        }
      }
    }
  }

  _renderVectorLayer(ctx, view, arr, max, reveal) {
    for (let i = 0; i < view.vector; i++) {
      const x = (i % view.cols) * view.cell;
      const y = Math.floor(i / view.cols) * view.cell;
      const seq = i / (view.vector - 1);
      const local = clamp01((reveal - seq * 0.35) / 0.65);
      if (local <= 0) continue;
      const v = arr[i] / max;
      /* Dead units stay as faint squares — "this unit did not fire" is half
         the information in a ReLU layer. */
      ctx.fillStyle = rgba(this._ink, (0.08 + Math.min(1, v) * 0.92) * local);
      ctx.fillRect(x + 1, y + 1, view.cell - 2, view.cell - 2);
    }
  }

  _renderBars(reveal) {
    if (!this._bars) return;
    const probs = this._hasResult ? this.state.probs : null;
    const winner = probs ? argmax(probs) : -1;
    for (let i = 0; i < 10; i++) {
      const bar = this._bars[i];
      const p = probs ? probs[i] * reveal : 0;
      bar.fill.style.width = `${(p * 100).toFixed(2)}%`;
      bar.row.classList.toggle('is-winner', probs !== null && i === winner && reveal > 0.5);
      bar.value.textContent = probs ? `${(probs[i] * 100).toFixed(1)}%` : '—';
      bar.row.setAttribute('aria-valuenow', probs ? (probs[i] * 100).toFixed(1) : '0');
    }
  }

  _renderVerdict(reveal) {
    if (!this.verdictEl || !this._hasResult) return;
    if (reveal < 0.5) return;
    const winner = argmax(this.state.probs);
    const p = this.state.probs[winner];
    this.verdictEl.textContent = String(winner);
    if (this.confidenceEl) this.confidenceEl.textContent = `p = ${p.toFixed(3)}`;
    this.root.classList.add('is-classified');
    /* Only announce the settled answer, and only once per classification.
       Mid-stroke the prediction changes every frame, so announcing then would
       flood a screen reader with readings of a half-drawn digit. */
    if (!this._drawing && (this._lastSpoken !== winner || this._lastSpokenP !== p)) {
      this._lastSpoken = winner;
      this._lastSpokenP = p;
      this._say(`Predicted ${winner}, confidence ${(p * 100).toFixed(0)} percent.`);
    }
  }

  _say(message) {
    if (this.statusEl) this.statusEl.textContent = message;
  }

  /* ── DOM construction ──────────────────────────────────────────────────── */

  _buildBars() {
    if (!this.barsEl) return;
    this._bars = [];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 10; i++) {
      const row = document.createElement('div');
      row.className = 'mnist-bar';
      row.setAttribute('role', 'progressbar');
      row.setAttribute('aria-valuemin', '0');
      row.setAttribute('aria-valuemax', '100');
      row.setAttribute('aria-valuenow', '0');
      row.setAttribute('aria-label', `Confidence for digit ${i}`);

      const label = document.createElement('span');
      label.className = 'mnist-bar__label';
      label.textContent = String(i);

      const track = document.createElement('span');
      track.className = 'mnist-bar__track';
      const fill = document.createElement('span');
      fill.className = 'mnist-bar__fill';
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'mnist-bar__value';
      value.textContent = '—';

      row.append(label, track, value);
      frag.appendChild(row);
      this._bars.push({ row, fill, value });
    }
    this.barsEl.appendChild(frag);
  }

  /* Logical (unscaled) pixel size of a layer's grid. */
  _layerGeom(view) {
    if (view.vector) {
      const rows = Math.ceil(view.vector / view.cols);
      return { w: view.cols * view.cell, h: rows * view.cell };
    }
    const rows = Math.ceil(view.maps / view.cols);
    return {
      w: view.cols * (view.w * view.cell) + (view.cols - 1) * MAP_GAP,
      h: rows * (view.h * view.cell) + (rows - 1) * MAP_GAP,
    };
  }

  _buildLayers() {
    this._canvases = {};
    const frag = document.createDocumentFragment();
    for (const view of LAYER_VIEWS) {
      const geom = this._layerGeom(view);
      const fig = document.createElement('figure');
      fig.className = 'mnist-layer';

      const canvas = document.createElement('canvas');
      canvas.className = 'mnist-layer__canvas';
      canvas.width = Math.round(geom.w * 2);
      canvas.height = Math.round(geom.h * 2);
      canvas.style.aspectRatio = `${geom.w} / ${geom.h}`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label',
        `${view.label} activations, ${view.detail}`);

      const cap = document.createElement('figcaption');
      cap.className = 'mnist-layer__cap';
      const name = document.createElement('span');
      name.className = 'mnist-layer__name';
      name.textContent = view.label;
      const detail = document.createElement('span');
      detail.className = 'mnist-layer__detail';
      detail.textContent = view.detail;
      cap.append(name, detail);

      fig.append(canvas, cap);
      frag.appendChild(fig);
      this._canvases[view.id] = canvas;
    }
    this.layersEl.appendChild(frag);
  }

  /* ── Lifecycle ─────────────────────────────────────────────────────────── */

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
  }

  destroy() {
    this._stopAnimation();
    for (const { target, type, fn, opts } of this._listeners) {
      try { target.removeEventListener(type, fn, opts); } catch (_) { /* ignore */ }
    }
    this._listeners = [];
    if (this._onTheme) window.removeEventListener('themechange', this._onTheme);
  }
}

/* WCAG relative luminance of a '#rrggbb' string — used only to decide which
   accent shade reads better against the active background. */
function luminance(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((n >> 16) & 255)
       + 0.7152 * channel((n >> 8) & 255)
       + 0.0722 * channel(n & 255);
}

/* '#rrggbb' → [r, g, b] bytes. */
function rgbOf(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Entry point used by js/main.js. Returns the instance (a disposable) or null
   when the page has no lab on it. */
export async function initMnistLab(root) {
  if (!root) return null;
  const [{ loadModel }, samplesModule] = await Promise.all([
    import('../data/lenet-weights.js'),
    import('../data/cnn-samples.json'),
  ]);
  const samples = (samplesModule.default || samplesModule).samples;
  const lab = new MnistLab(root, loadModel(), samples);
  root.classList.add('is-ready');
  return lab;
}

export { LAYER_VIEWS, DRAW, STROKE };
