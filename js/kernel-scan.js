/* ═══════════════════════════════════════════════════════════
   KERNEL SCAN — one convolution, drawn at phone size

   The hero background on narrow and touch viewports, where the CNN scene
   (js/cnn-hero.js) does not fit: its six labelled layers are laid out across
   880 reference units of landscape, and squeezed into a portrait column they
   stop being legible at exactly the moment they stop being informative.

   What this draws instead is the *first* layer of the same network, close up:
   a 5×5 window sweeping the 28×28 digit while the 24×24 feature map fills in
   behind it, with the real conv1 kernel painted between the two. Same LeNet-5,
   different camera — the desktop hero shows the pipeline from outside, this
   shows one operation from inside.

   Two things follow from the size it has to work at:

   · **The browser runs the convolution.** data/hero-scan.js carries the six
     trained conv1 kernels and the ten MNIST digits and nothing else (~3 KB
     gzip); one feature map is 24·24·25 = 14,400 multiply-adds, which is
     cheaper than downloading the answer would be. The desktop hero replays
     precomputed activations for the opposite reason — it needs five more
     layers, and computing those in the browser would mean shipping a runtime.

   · **The digit and the map are textures, not thousands of rects.** Each is an
     ImageData at its natural resolution (28×28, 24×24) blitted with smoothing
     off, so the per-frame cost is two drawImage calls rather than ~1300
     fillRects. The map is written incrementally as the sweep reveals it.

   Like every other hero canvas here it bakes its palette in at construction;
   js/main.js destroys and rebuilds the instance on `themechange`.
   ═══════════════════════════════════════════════════════════ */
import { getTheme, rgba, int } from './theme.js';
import { HERO_SCAN } from '../data/hero-scan.js';

/* ── Scene geometry, in reference units (uniformly scaled at draw time) ───── */
const REF_W = 318;
const REF_H = 150;

/* All three blocks are centred on the same y ≈ 70 line: the eye reads the
   sweep as travelling left to right through them, so anything that made one
   sit higher than another would read as a step in a pipeline that has none. */
const IN = { x: 0, y: 6, cell: 4.6 };        /* 28 × 4.6 = 128.8 */
const KER = { x: 155, y: 55, cell: 6.2 };    /*  5 × 6.2 =  31   */
const OUT = { x: 212, y: 17.6, cell: 4.4 };  /* 24 × 4.4 = 105.6 */
const LABEL_Y = 143;

const IN_W = HERO_SCAN.input.w;              /* 28 */
const K = HERO_SCAN.kernels.k;               /*  5 */
const OUT_W = IN_W - K + 1;                  /* 24 — 'valid' convolution */
const CELLS = OUT_W * OUT_W;                 /* 576 window positions */

/* Timeline of one pass (digit × filter), seconds. */
const T_IN = 0.45;    /* scene fades up */
const T_SCAN = 2.2;   /* window crosses all 576 positions */
const T_HOLD = 0.85;  /* completed map dwells */
const T_OUT = 0.5;    /* fade out before the next pass */
const CYCLE = T_IN + T_SCAN + T_HOLD + T_OUT;

/* How many passes before the digit changes. Six filters against ten digits
   means consecutive loops keep pairing them differently, so the scene does not
   settle into a recognisable sequence. */
const PASSES_PER_DIGIT = 2;

/* Same stack as --font-mono; canvas has no font-loading callback, so a first
   frame drawn before JetBrains Mono arrives falls back and the next frame
   picks it up. The labels are 7.5px captions — nobody will catch the swap. */
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* '#rrggbb' → [r, g, b] bytes, for writing straight into an ImageData. */
function rgbBytes(hex) {
  const n = int(hex);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class KernelScan {
  constructor(canvas, onReady) {
    this.canvas = canvas;
    /* Resolve the active palette (dark or light) for this instance. A theme
       switch rebuilds the instance (js/main.js), re-reading the colour. */
    this._theme = getTheme();
    this._listeners = [];
    this._io = null;
    this._onReady = typeof onReady === 'function' ? onReady : null;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (!this.ctx) return;

    this.frameId = null;
    this._visible = true;
    /* FPS cap — the sweep is a slow raster crawl; 30 fps is more than it needs
       and half the battery of 60 on the devices this renderer is aimed at. */
    this._minFrameTime = 1 / 30;
    this._lastDrawTime = 0;
    this._t0 = null;
    this._elapsed = 0;
    /* Set when a tap asks for the next filter: the clock is rebased so the new
       pass starts from its fade-in rather than mid-sweep. */
    this._skipTo = 0;

    /* Decode once — ten 784-byte digits and 150 int8 weights, then every frame
       is array reads. */
    this._digits = HERO_SCAN.digits.map((d) => ({ label: d.label, pixels: decodeBase64(d.pixels) }));
    this._kernels = this._decodeKernels();
    this._digitIdx = Math.floor(Math.random() * this._digits.length);
    this._filterIdx = Math.floor(Math.random() * this._kernels.length);
    this._passes = 0;

    this._inputTex = this._makeTexture(IN_W, IN_W);
    this._outTex = this._makeTexture(OUT_W, OUT_W);
    this._kernelTex = this._makeTexture(K, K);
    if (!this._inputTex || !this._outTex || !this._kernelTex) { this.ctx = null; return; }

    this._map = new Float32Array(CELLS);
    this._mapMax = 1;
    this._revealed = 0;

    this._onResize();
    this._beginPass();

    this._addListener(window, 'resize', () => this._onResize());
    /* Tap to advance. Deliberately the only interaction: a drag over the hero
       is the visitor scrolling the page, and stealing it to steer the window
       would trade the site's primary gesture for a decoration. Bounded to the
       scene's own box so a tap anywhere else stays a tap on the page. */
    this._addListener(canvas, 'pointerdown', (e) => this._onPointerDown(e), { passive: true });

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

  /* int8 weights × one shared scale → six float32 kernels, each with the max
     |weight| the swatch normalises against. */
  _decodeKernels() {
    const { count, scale, weights, bias } = HERO_SCAN.kernels;
    const raw = decodeBase64(weights);
    const out = [];
    for (let f = 0; f < count; f++) {
      const w = new Float32Array(K * K);
      let max = 0;
      for (let i = 0; i < K * K; i++) {
        /* base64 gave us unsigned bytes; the weights are signed. */
        const b = raw[f * K * K + i];
        w[i] = (b > 127 ? b - 256 : b) * scale;
        if (Math.abs(w[i]) > max) max = Math.abs(w[i]);
      }
      out.push({ w, bias: bias[f], max: max || 1 });
    }
    return out;
  }

  /* A small offscreen canvas + its ImageData, blitted at draw time. Returns
     null where 2D canvases are unavailable, which makes the whole renderer
     bail rather than throw. */
  _makeTexture(w, h) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = typeof c.getContext === 'function' ? c.getContext('2d') : null;
    if (!ctx || typeof ctx.createImageData !== 'function') return null;
    const img = ctx.createImageData(w, h);
    return { canvas: c, ctx, img, w, h };
  }

  /* Paint one texel. `rgb` is a byte triple, `a` an alpha 0..1. */
  _texel(tex, i, rgb, a) {
    const o = i * 4;
    tex.img.data[o] = rgb[0];
    tex.img.data[o + 1] = rgb[1];
    tex.img.data[o + 2] = rgb[2];
    tex.img.data[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }

  _flush(tex) {
    tex.ctx.putImageData(tex.img, 0, 0);
  }

  /* ── One pass: pick the digit/filter, convolve, reset the reveal ────────── */

  /* The real conv1 for the current digit × filter: normalise the greys the way
     MNIST training did, then a valid 5×5 convolution plus bias and ReLU. Same
     arithmetic js/lenet.js runs — written out here rather than imported,
     because importing forward() would pull the other four layers, and their
     weights, onto a page that needs neither.

     Returns the map's peak, which is 0 for a filter that responds to nothing. */
  _computeMap() {
    const digit = this._digits[this._digitIdx];
    const kernel = this._kernels[this._filterIdx];
    const { mean, std } = HERO_SCAN.meta;
    let max = 0;
    for (let oy = 0; oy < OUT_W; oy++) {
      for (let ox = 0; ox < OUT_W; ox++) {
        let sum = kernel.bias;
        for (let ky = 0; ky < K; ky++) {
          const row = (oy + ky) * IN_W + ox;
          for (let kx = 0; kx < K; kx++) {
            const x = (digit.pixels[row + kx] / 255 - mean) / std;
            sum += x * kernel.w[ky * K + kx];
          }
        }
        const v = sum > 0 ? sum : 0;
        this._map[oy * OUT_W + ox] = v;
        if (v > max) max = v;
      }
    }
    return max;
  }

  _beginPass() {
    /* Two of this model's six conv1 filters are **dead ReLUs**: their bias is
       negative enough that no MNIST digit ever gets them above zero, so their
       feature map is uniformly blank. That is an ordinary outcome of training
       (the network reaches 98.27% on four working first-layer filters) and a
       terrible thing to animate — a third of the passes would have been three
       and a half seconds of empty box, which reads as the page being broken.

       So a dead pairing is skipped rather than drawn. The check is per pass,
       not a one-off census at construction, because deadness is a property of
       the digit *and* the filter, and this way the scene stays correct if the
       model is ever retrained into a different set of them. */
    for (let attempt = 0; attempt < this._kernels.length; attempt++) {
      const max = this._computeMap();
      if (max > 0) { this._mapMax = max; break; }
      this._filterIdx = (this._filterIdx + 1) % this._kernels.length;
      /* Every filter blank on this digit would leave _mapMax at 1 and paint an
         empty grid — impossible with this model, and still better than a
         divide by zero. */
      this._mapMax = 1;
    }
    this._revealed = 0;

    const digit = this._digits[this._digitIdx];
    const kernel = this._kernels[this._filterIdx];

    /* Input texture: the digit's ink in the primary accent. */
    const inkRgb = rgbBytes(this._theme.accentHi);
    for (let i = 0; i < IN_W * IN_W; i++) {
      this._texel(this._inputTex, i, inkRgb, (digit.pixels[i] / 255) * 0.62);
    }
    this._flush(this._inputTex);

    /* Feature map starts empty and is written as the sweep reveals it. */
    this._outTex.img.data.fill(0);
    this._flush(this._outTex);

    /* Kernel swatch: positive weights in the primary accent, negative in the
       secondary. A conv kernel is signed and the sign is the whole story —
       painting |w| alone would show six identical-looking blobs. */
    const posRgb = rgbBytes(this._theme.accentHi);
    const negRgb = rgbBytes(this._theme.accent2Hi);
    for (let i = 0; i < K * K; i++) {
      const w = kernel.w[i];
      const a = 0.10 + (Math.abs(w) / kernel.max) * 0.75;
      this._texel(this._kernelTex, i, w >= 0 ? posRgb : negRgb, a);
    }
    this._flush(this._kernelTex);
  }

  _advancePass() {
    this._filterIdx = (this._filterIdx + 1) % this._kernels.length;
    this._passes += 1;
    if (this._passes % PASSES_PER_DIGIT === 0) {
      this._digitIdx = (this._digitIdx + 1) % this._digits.length;
    }
    this._beginPass();
  }

  /* Reveal the map up to `n` window positions, writing only what is new. */
  _revealTo(n) {
    if (n <= this._revealed) return;
    const mapRgb = rgbBytes(this._theme.accent2Hi);
    for (let i = this._revealed; i < n; i++) {
      const v = this._map[i] / this._mapMax;
      this._texel(this._outTex, i, mapRgb, v * 0.85);
    }
    this._revealed = n;
    this._flush(this._outTex);
  }

  /* ── Layout ────────────────────────────────────────────────────────────── */

  _onResize() {
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this._dpr = dpr;

    /* The hero copy is centred at these widths, so the scene lives in the band
       underneath it. That band is *measured*, not assumed: offsetTop/Height
       are layout positions, unaffected by the copy's scroll parallax, so this
       stays right on a 667px phone and on an 1180px tablet without a table of
       breakpoints. The fallback matters only where the element is missing. */
    const copy = document.querySelector('.hero-content');
    const copyBottom = copy && copy.offsetHeight
      ? copy.offsetTop + copy.offsetHeight
      : this.h * 0.66;
    /* Bottom inset clears the scroll hint. */
    const top = copyBottom + 14;
    const bottom = this.h - 72;
    const boxW = Math.min(this.w - 40, 420);
    const boxH = Math.max(bottom - top, 96);

    this._scale = Math.min(boxW / REF_W, boxH / REF_H, 1.35);
    this._ox = (this.w - REF_W * this._scale) / 2;
    this._oy = bottom - REF_H * this._scale;
    /* Captions are drawn inside the scaled scene and would shrink below
       legibility at phone scale; counter-scaling holds them at a roughly
       constant on-screen size (bounded, so they never dominate). */
    this._textScale = Math.min(1 / this._scale, 1.5);

    /* Where the scene has climbed into the copy — on a short viewport the band
       is not tall enough and the two overlap. Fading the scene's own top edge
       is the version that keeps the copy readable; moving the scene down would
       push it off the bottom instead. */
    this._maskFrom = this._oy;
    this._maskTo = Math.max(this._oy, Math.min(copyBottom + 8, this._oy + 40 * this._scale));
  }

  /* Re-run the layout on demand. `copyBottom` above is a measurement of the
     hero copy, and the aside that ends it ("a real LeNet-5 — draw it a digit")
     is revealed only once this scene's first frame has painted — i.e. strictly
     after the measurement. Without a second pass the band is sized against a
     copy ~60px shorter than the one it ends up sharing the hero with, and the
     scene creeps up under the new line. */
  relayout() {
    if (this.ctx) this._onResize();
  }

  _onPointerDown(e) {
    const x = e.clientX;
    const y = e.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const rect = typeof this.canvas.getBoundingClientRect === 'function'
      ? this.canvas.getBoundingClientRect()
      : { left: 0, top: 0 };
    const sx = x - rect.left - this._ox;
    const sy = y - rect.top - this._oy;
    const pad = 16 * this._scale;
    if (sx < -pad || sy < -pad
      || sx > REF_W * this._scale + pad || sy > REF_H * this._scale + pad) return;
    this._advancePass();
    /* Rebase the clock so the new pass opens on its fade-in. */
    this._skipTo += this._elapsed;
    this._lastDrawTime = 0;
  }

  /* ── Drawing ───────────────────────────────────────────────────────────── */

  _draw(t) {
    const ctx = this.ctx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    /* Envelope: up, hold, down. */
    let alpha = 1;
    if (t < T_IN) alpha = t / T_IN;
    else if (t > CYCLE - T_OUT) alpha = Math.max(0, (CYCLE - t) / T_OUT);

    const scanT = Math.min(Math.max((t - T_IN) / T_SCAN, 0), 1);
    const cursor = Math.min(CELLS, Math.floor(scanT * CELLS));
    this._revealTo(cursor);

    const s = this._scale;
    ctx.save();
    ctx.translate(this._ox, this._oy);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    /* Nearest-neighbour: these textures are 28 and 24 texels wide and every
       texel is meant to read as a cell. Smoothing would turn the digit into a
       blur and the feature map into a stain. */
    ctx.imageSmoothingEnabled = false;

    const inSize = IN_W * IN.cell;
    const outSize = OUT_W * OUT.cell;
    const kerSize = K * KER.cell;

    ctx.drawImage(this._inputTex.canvas, IN.x, IN.y, inSize, inSize);
    ctx.drawImage(this._outTex.canvas, OUT.x, OUT.y, outSize, outSize);

    /* Frames — the feature map is mostly empty at the start of a pass, and
       without an outline it reads as nothing being there rather than as
       something about to be filled. */
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = rgba(this._theme.text, 0.12);
    ctx.strokeRect(IN.x, IN.y, inSize, inSize);
    ctx.strokeRect(OUT.x, OUT.y, outSize, outSize);

    /* The window, and the patch under it. */
    const wx = cursor % OUT_W;
    const wy = Math.floor(cursor / OUT_W);
    const px = IN.x + wx * IN.cell;
    const py = IN.y + wy * IN.cell;
    const pSize = K * IN.cell;

    /* Drawn from scanT === 0, not from the first step: the fade-in is half a
       second, and without the window and its wires the scene opens as two
       empty boxes and a swatch. It disappears at scanT === 1, where the map is
       complete and there is nothing left to point at. */
    if (scanT < 1) {
      /* Re-blit the digit clipped to the window: the same texels composited
         twice, which brightens exactly the patch being convolved without
         needing a second texture or a per-pixel pass. */
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pSize, pSize);
      ctx.clip();
      ctx.globalAlpha = alpha * 0.9;
      ctx.drawImage(this._inputTex.canvas, IN.x, IN.y, inSize, inSize);
      ctx.restore();
      ctx.globalAlpha = alpha;

      /* Wires: the patch's two right corners converge on the kernel, and a
         single line leaves it for the cell being written. That is the whole
         operation — 25 numbers times 25 numbers, landing on one. */
      const kx = KER.x;
      const ky = KER.y;
      const cellCx = OUT.x + (wx + 0.5) * OUT.cell;
      const cellCy = OUT.y + (wy + 0.5) * OUT.cell;
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = rgba(this._theme.accentHi, 0.28);
      ctx.beginPath();
      ctx.moveTo(px + pSize, py);
      ctx.lineTo(kx, ky);
      ctx.moveTo(px + pSize, py + pSize);
      ctx.lineTo(kx, ky + kerSize);
      ctx.stroke();
      ctx.strokeStyle = rgba(this._theme.accent2Hi, 0.34);
      ctx.beginPath();
      ctx.moveTo(kx + kerSize, ky + kerSize / 2);
      ctx.lineTo(cellCx, cellCy);
      ctx.stroke();

      /* The cell just written, marked while the wire still points at it. */
      ctx.fillStyle = rgba(this._theme.accent2Hi, 0.85);
      ctx.fillRect(cellCx - OUT.cell / 2, cellCy - OUT.cell / 2, OUT.cell, OUT.cell);
    }

    if (scanT < 1) {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = rgba(this._theme.accent2Hi, 0.9);
      ctx.strokeRect(px, py, pSize, pSize);
    }

    /* Kernel swatch. */
    ctx.drawImage(this._kernelTex.canvas, KER.x, KER.y, kerSize, kerSize);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = rgba(this._theme.text, 0.22);
    ctx.strokeRect(KER.x, KER.y, kerSize, kerSize);

    /* Captions. Small, quiet, and factual — they name what each block is, and
       the filter counter is the only thing on screen that says the six
       kernels are different from one another. */
    ctx.font = `500 ${7.5 * this._textScale}px ${MONO}`;
    ctx.fillStyle = rgba(this._theme.text, 0.38);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('input 28×28', IN.x, LABEL_Y);
    ctx.textAlign = 'center';
    ctx.fillText(`filter ${this._filterIdx + 1}/${this._kernels.length}`, KER.x + kerSize / 2, LABEL_Y);
    ctx.textAlign = 'right';
    ctx.fillText('conv1 · 24×24', OUT.x + outSize, LABEL_Y);
    ctx.textAlign = 'left';

    ctx.restore();

    /* Punch the scene out from under the hero copy, where a short viewport has
       driven the two together. */
    if (this._maskTo > this._maskFrom) {
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      const grad = ctx.createLinearGradient(0, this._maskFrom, 0, this._maskTo);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grad;
      ctx.fillRect(0, this._maskFrom, this.w, this._maskTo - this._maskFrom);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  _animate() {
    if (document.hidden || !this._visible) { this.frameId = null; return; }
    this.frameId = requestAnimationFrame(() => this._animate());
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    /* Slack budget, not the exact frame time — see the same guard in
       js/cnn-hero.js: on a 60 Hz display 1/30 is precisely two vsyncs, so an
       exact comparison lets jitter alternate 33 ms and 50 ms frames. */
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime * 0.75) return;
    this._lastDrawTime = now;

    if (this._t0 == null) this._t0 = now;
    this._elapsed = now - this._t0 - this._skipTo;
    if (this._elapsed >= CYCLE) {
      /* Carry the remainder rather than resetting to 0, so a frame that lands
         late does not stretch the next pass. */
      this._skipTo += CYCLE;
      this._elapsed -= CYCLE;
      this._advancePass();
    }
    this._draw(Math.max(0, this._elapsed));
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
