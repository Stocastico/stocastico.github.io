/* ═══════════════════════════════════════════════════════════
   CNN HERO — LeNet-5 forward pass as the homepage background

   Canvas2D renderer that replays *precomputed* activations: a real LeNet-5
   was trained on MNIST offline (scripts/train-cnn.mjs), ten forward passes —
   one per digit — were quantised to uint8 and baked into
   data/cnn-activations.js (scripts/generate-cnn-activations.mjs).

   So the browser runs no inference and downloads no ML runtime: no
   TensorFlow.js, no Three.js, ~30 KB of activation data and this file. That
   is the whole reason this is hand-rolled rather than TensorSpace.js, which
   would have pulled several hundred KB onto a page that currently ships none.

   The scene is laid out at a fixed reference size and uniformly scaled into
   whatever box the hero gives it, drawn in oblique projection: each feature
   map is a sheared plane, stacked back-to-front per channel.
   ═══════════════════════════════════════════════════════════ */
import { getTheme, rgba } from './theme.js';
import { CNN } from '../data/cnn-activations.js';

/* ── Scene geometry, in reference units (scaled to fit at draw time) ─────── */
const REF_W = 880;
const REF_H = 380;

/* Oblique projection: a cell at (cx, cy) inside a plane whose origin is
   (ox, oy) lands at ox + cx*cell + cy*SHEAR_X, oy + cx*SKEW_Y + cy*cell*SQUASH. */
const SHEAR_X = -0.42;   /* × cell — how far the plane leans left going down */
const SKEW_Y = -0.10;    /* × cell — slight tilt along the plane's own x axis */
const SQUASH = 0.86;     /* vertical foreshortening */

/* Pointer yaw: SHEAR_X is not a constant at draw time — it is re-derived each
   frame from the pointer's horizontal position, so the planes actually re-lean
   (the scene turns about its vertical axis) rather than sliding as a block.
   Every plane pivots about its own vertical centre, which is what makes this
   cheap: the mid-height point of each layer is invariant under the pivot, and
   every anchor in the layout (wires, captions, the verdict) is taken at mid
   height — so the hand-tuned placement stays pixel-identical at rest and the
   wires stay attached at full deflection.

   The range is deliberately asymmetric. Turning *toward* the viewer (flatter
   planes, pointer right) only makes the feature maps easier to read, so it
   gets the long half; turning away piles the rows on top of each other and a
   28×28 digit degenerates into a diagonal ribbon, so that half is short.
   Both halves meet at SHEAR_X, which keeps the untouched first paint on the
   hand-tuned geometry. */
const YAW_LEAN = 0.14;      /* pointer left — steeper, legibility-limited */
const YAW_UPRIGHT = 0.26;   /* pointer right — flatter, reads fine */

/* Per-layer placement + drawing scale.

   Map layers: `x` is the left edge of the frontmost plane, `y` the vertical
   centre of that plane, and `stack` the screen offset added per feature map —
   the receding card-stack that reads as depth. `group` splits the channels
   into side-by-side stacks (conv2's 16 maps in one stack degenerate into a
   long diagonal smear; two stacks of 8 still read as "sixteen of them").

   Dense layers: `x, y` is the top-left neuron, wrapped every `rows`. */
const PLACEMENT = {
  input: { x: 0, y: 222, cell: 4.0, stack: [0, 0], group: 1, groupGap: 0 },
  conv1: { x: 150, y: 250, cell: 4.6, stack: [7.5, -12], group: 6, groupGap: 0 },
  conv2: { x: 330, y: 250, cell: 6.2, stack: [5.2, -9], group: 8, groupGap: 96 },
  fc1: { x: 560, y: 170, dot: 3.4, gap: 8.2, rows: 30 },
  fc2: { x: 620, y: 173, dot: 3.4, gap: 8.2, rows: 28 },
  out: { x: 690, y: 143, dot: 6.4, gap: 17 },
};

/* Connector labels — the pooling layers are not drawn as planes of their own
   (at this scale a 12×12 pooled map is indistinguishable from the 24×24 map
   it came from), so they are named on the wire instead. The dense hops are
   left unlabelled: their wires run straight through the neuron columns, where
   a caption reads as clutter rather than information. */
const CONNECTORS = {
  'input→conv1': 'conv 5×5',
  'conv1→conv2': 'maxpool → conv 5×5',
  'conv2→fc1': 'maxpool → flatten',
};

/* Animation timeline, seconds. */
const T_STEP = 0.62;   /* delay between consecutive layer reveals */
const T_RAMP = 0.58;   /* how long one layer takes to light up */
const T_HOLD = 2.7;    /* dwell once the prediction has resolved */
const T_FADE = 0.9;    /* cross-fade out before the next digit */
const T_IN = 0.5;      /* scene fade-in */

/* Depth parallax: each layer gets its own share of the mouse-driven shift, so
   the pipeline reads as a receding 3-D structure instead of one flat card
   sliding around as a whole. LAYER_RECEDE is how much factor is given up from
   first layer to last — at 2 the share runs +1 (input, nearest) through 0
   (the middle of the pipeline) to -1 (output, farthest), so the layers
   *scissor about the scene's centre* the way a solid turning on the spot
   does. A one-directional taper instead spends nearly all of its travel
   budget sliding the whole scene sideways and leaves only a few pixels of
   actual differential, which is the part the eye reads as depth — the reason
   the two can be this small and still register.

   STACK_RECEDE additionally fades a map layer's own feature-map stack (front
   plane full factor, back plane dimmed) — the same "nearer maps overlap the
   ones behind" depth already used for alpha. It scales the magnitude, so it
   rides on top of a signed share unchanged.

   PAR_X is capped by the left-edge mask rather than by taste: the input plane
   sits at the scene's left edge, and travel much past this pushes the most
   legible thing in the picture into the gradient that hides the network
   behind the hero copy. */
const LAYER_RECEDE = 2;
const STACK_RECEDE = 0.5;
const PAR_X = 15;
const PAR_Y = 9;
const PAR_EASE = 0.09;   /* per-frame approach to the pointer target */

/* Same face the CSS uses for every other technical label on the site — see
   the typographic-system note in css/styles.css. Canvas has no font-loading
   hook, but the stylesheet requests it on every page, so by the time the hero
   paints its first frame it is available; the fallbacks cover the gap. */
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* base64 → Uint8Array (the activation blobs). */
function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class CnnHero {
  constructor(canvas, onReady) {
    this.canvas = canvas;
    this._theme = getTheme();
    this._listeners = [];
    this._io = null;
    this._onReady = typeof onReady === 'function' ? onReady : null;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (!this.ctx) return;

    this.frameId = null;
    this._visible = true;
    this._minFrameTime = 1 / 30;
    this._lastDrawTime = 0;

    /* Decode once — ten ~2.9 KB blobs, then it is pure array reads per frame. */
    this._layers = CNN.layers;
    this._samples = CNN.samples.map((s) => ({ ...s, bytes: decodeBase64(s.data) }));
    this._order = this._shuffled(this._samples.length);
    this._cursor = 0;
    this._cycle = T_IN + (this._layers.length - 1) * T_STEP + T_RAMP + T_HOLD + T_FADE;
    this._t0 = null;

    /* Mouse parallax target/current, in REF units, plus the yaw (-1..1) that
       drives the shear. Each layer only takes its own depth-scaled share of
       the translation (see _depthFactor / LAYER_RECEDE); the yaw applies to
       the whole scene, since a rotation is not a per-layer offset. */
    this._par = { x: 0, y: 0, yaw: 0, tx: 0, ty: 0, tyaw: 0 };
    this._shear = SHEAR_X;

    /* Reusable per-alpha-bucket rect batches, so a plane is painted with a
       handful of fill() calls instead of ~1000 fillRect()s. */
    this._buckets = Array.from({ length: BUCKETS }, () => []);

    this._onResize();
    this._addListener(window, 'resize', () => this._onResize());
    this._addListener(window, 'mousemove', (e) => {
      const nx = e.clientX / this.w - 0.5;
      this._par.tx = nx * PAR_X;
      this._par.ty = (e.clientY / this.h - 0.5) * PAR_Y;
      this._par.tyaw = nx * 2;
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

  _addListener(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    this._listeners.push({ target, type, fn, opts });
  }

  /* A shuffled play order, reshuffled each pass, so reloads don't always show
     the digits in the same sequence. */
  _shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _onResize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this._dpr = dpr;

    /* The hero copy owns the left ~40% of the viewport, so the network always
       lives in the right-hand column (this renderer only ever runs at ≥1100px
       — see supportsCnnHero in js/utils.js). */
    const left = this.w * 0.42;
    const right = this.w * 0.985;
    const boxW = right - left;
    const boxH = Math.min(this.h * 0.62, 520);
    this._scale = Math.min(boxW / REF_W, boxH / REF_H, 1.3);
    this._ox = left + (boxW - REF_W * this._scale) / 2;
    this._oy = (this.h - REF_H * this._scale) / 2;
    /* Captions are drawn inside the scaled scene, so at narrow widths they
       would shrink below legibility. Counter-scaling keeps them at a roughly
       constant on-screen size (bounded, so they never dominate the drawing). */
    this._textScale = Math.min(1 / this._scale, 1.4);
    /* Where the left-edge mask should stop, in CSS pixels. Never past the
       scene's own left edge — the input digit is the most legible thing in the
       picture and must not be the part that gets faded out. */
    this._maskTo = Math.min(this.w * 0.44, this._ox);
  }

  /* Signed share of the pointer parallax this layer gets: +1 for the input
     (nearest), tapering through 0 at mid-pipeline to 1 - LAYER_RECEDE = -1 for
     the output (farthest), so the two ends travel in opposite directions. */
  _depthFactor(i) {
    const n = this._layers.length;
    return n > 1 ? 1 - (i / (n - 1)) * LAYER_RECEDE : 1;
  }

  /* ── Timeline ──────────────────────────────────────────────────────────── */

  _phase(now) {
    if (this._t0 == null) this._t0 = now;
    let t = now - this._t0;
    while (t >= this._cycle) {
      t -= this._cycle;
      this._t0 += this._cycle;
      this._cursor++;
      if (this._cursor >= this._order.length) {
        this._order = this._shuffled(this._samples.length);
        this._cursor = 0;
      }
    }
    return t;
  }

  _draw(t) {
    const ctx = this.ctx;
    const sample = this._samples[this._order[this._cursor]];

    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    /* Global envelope: fade in, hold, fade out. */
    const fadeIn = clamp01(t / T_IN);
    const fadeOut = 1 - clamp01((t - (this._cycle - T_FADE)) / T_FADE);
    const envelope = Math.min(fadeIn, fadeOut);
    if (envelope <= 0.001) return;

    /* Ease the parallax and the yaw toward the pointer. */
    this._par.x += (this._par.tx - this._par.x) * PAR_EASE;
    this._par.y += (this._par.ty - this._par.y) * PAR_EASE;
    this._par.yaw += (this._par.tyaw - this._par.yaw) * PAR_EASE;
    this._shear = SHEAR_X + this._par.yaw * (this._par.yaw > 0 ? YAW_UPRIGHT : YAW_LEAN);

    ctx.save();
    ctx.translate(this._ox, this._oy);
    ctx.scale(this._scale, this._scale);
    ctx.globalAlpha = 1;

    const reveals = this._layers.map((_, i) =>
      easeOut(clamp01((t - (T_IN + i * T_STEP)) / T_RAMP)));
    /* One depth factor per layer — see LAYER_RECEDE. */
    const depths = this._layers.map((_, i) => this._depthFactor(i));

    this._drawConnectors(reveals, envelope, depths);

    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      const reveal = reveals[i];
      if (reveal <= 0) continue;
      const alpha = envelope;
      if (layer.kind === 'map') this._drawMapLayer(layer, sample, reveal, alpha, depths[i]);
      else this._drawVectorLayer(layer, sample, reveal, alpha, depths[i]);
      this._drawLayerLabel(layer, reveal * alpha, depths[i]);
    }

    this._drawVerdict(sample, reveals[reveals.length - 1], envelope, depths[depths.length - 1]);
    ctx.restore();

    /* Punch the network out from under the hero copy on the left. */
    if (this._maskTo > 0) {
      ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      const grad = ctx.createLinearGradient(0, 0, this._maskTo, 0);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.72, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this._maskTo, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ── Feature-map planes ────────────────────────────────────────────────── */

  _drawMapLayer(layer, sample, reveal, alpha, layerDepth) {
    const ctx = this.ctx;
    const p = PLACEMENT[layer.id];
    const plane = layer.w * layer.h;
    const colour = layer.id === 'input' ? this._theme.accentHi : this._theme.accent2Hi;

    /* Back-to-front within each stack, so nearer maps overlap the ones behind. */
    for (let m = layer.maps - 1; m >= 0; m--) {
      const inStack = m % p.group;
      const stackIndex = Math.floor(m / p.group);
      const depth = p.group > 1 ? 1 - (inStack / (p.group - 1)) * 0.4 : 1;
      /* The front plane of a stack keeps the layer's full parallax share;
         planes further back give up a further STACK_RECEDE of it — the
         stack itself gains depth, on top of the layer's own. */
      const planeParallax = layerDepth * (1 - STACK_RECEDE * ((1 - depth) / 0.4));
      /* Pivot the lean about the plane's vertical centre rather than its top
         edge: cancelling the shear delta at cy = h/2 leaves the mid-height
         point exactly where the fixed layout puts it, so the plane turns in
         place instead of sliding sideways as the pointer moves. */
      const pivot = ((layer.h * p.cell) / 2) * (this._shear - SHEAR_X);
      const ox = p.x + stackIndex * p.groupGap + inStack * p.stack[0]
        - pivot + this._par.x * planeParallax;
      const oy = p.y - (layer.h * p.cell * SQUASH) / 2 + inStack * p.stack[1] + this._par.y * planeParallax;
      const base = decodeOffset(layer, m, plane);

      ctx.save();
      ctx.transform(p.cell, p.cell * SKEW_Y, p.cell * this._shear, p.cell * SQUASH, ox, oy);

      /* Plane outline — the scaffold stays faint even where nothing fires. */
      ctx.lineWidth = 0.09;
      ctx.strokeStyle = rgba(this._theme.accent2, 0.18 * reveal * alpha * depth);
      ctx.strokeRect(0, 0, layer.w, layer.h);

      for (const b of this._buckets) b.length = 0;
      for (let cy = 0; cy < layer.h; cy++) {
        /* Cells light up in a sweep across the plane rather than all at once. */
        const sweep = clamp01((reveal - 0.4 * (cy / layer.h)) / 0.6);
        if (sweep <= 0) continue;
        for (let cx = 0; cx < layer.w; cx++) {
          const v = sample.bytes[base + cy * layer.w + cx];
          if (v < 12) continue;
          const a = (v / 255) * sweep * depth;
          const bucket = Math.min(BUCKETS - 1, (a * BUCKETS) | 0);
          this._buckets[bucket].push(cx, cy);
        }
      }
      for (let b = 0; b < BUCKETS; b++) {
        const cells = this._buckets[b];
        if (!cells.length) continue;
        ctx.fillStyle = rgba(colour, ((b + 0.5) / BUCKETS) * 0.92 * alpha);
        ctx.beginPath();
        for (let i = 0; i < cells.length; i += 2) ctx.rect(cells[i], cells[i + 1], 1, 1);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ── Dense layers: columns of neurons ──────────────────────────────────── */

  /* The neuron columns lean with the same yaw as the feature-map planes —
     without this the convolutional half of the pipeline would turn while the
     dense half stayed frozen, which reads as a glitch rather than a rotation.
     A plane's lean per unit of *screen* y is shear/SQUASH (its own y is
     foreshortened by SQUASH, the columns' is not), and only the delta from
     SHEAR_X is applied, about the column's vertical centre — same invariant
     as the planes, so the anchors need no correction. */
  _lean(dy, mid) {
    return (dy - mid) * ((this._shear - SHEAR_X) / SQUASH);
  }

  _vectorDot(layer, i) {
    const p = PLACEMENT[layer.id];
    if (layer.kind === 'output') {
      const dy = i * p.gap;
      return [p.x + this._lean(dy, ((layer.n - 1) * p.gap) / 2), p.y + dy];
    }
    const col = Math.floor(i / p.rows);
    const dy = (i % p.rows) * p.gap * 0.42;
    return [
      p.x + col * p.gap * 0.95 + this._lean(dy, ((p.rows - 1) * p.gap * 0.42) / 2),
      p.y + dy,
    ];
  }

  _drawVectorLayer(layer, sample, reveal, alpha, layerDepth) {
    const ctx = this.ctx;
    const p = PLACEMENT[layer.id];
    const isOut = layer.kind === 'output';
    const winner = sample.predicted;
    const px = this._par.x * layerDepth;
    const py = this._par.y * layerDepth;

    for (let i = 0; i < layer.n; i++) {
      const v = sample.bytes[layer.offset + i] / 255;
      const [dotX, dotY] = this._vectorDot(layer, i);
      const x = dotX + px;
      const y = dotY + py;
      const lit = clamp01((reveal - 0.35 * (i / layer.n)) / 0.65);
      if (lit <= 0) continue;

      const isWinner = isOut && i === winner;
      const r = isOut ? p.dot : p.dot;
      /* Idle neurons stay as faint outlines — the contrast between "fired"
         and "did not fire" is the whole point of the picture. */
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(isWinner ? this._theme.accentHi : this._theme.accent2Hi,
        (0.10 + v * 0.88) * lit * alpha);
      ctx.fill();

      if (isWinner && v > 0.5) {
        const halo = 1 + Math.sin(this._pulse) * 0.18;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.6 * halo, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(this._theme.accentHi, 0.35 * lit * alpha);
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      if (isOut) {
        ctx.font = `600 ${9 * this._textScale}px ${MONO}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(isWinner ? this._theme.accentHi : this._theme.textMuted,
          (isWinner ? 0.9 : 0.42) * lit * alpha);
        ctx.fillText(String(i), x - r - 5, y);
        /* Probability bar to the right of each output neuron. */
        ctx.fillStyle = rgba(isWinner ? this._theme.accentHi : this._theme.accent2,
          (0.14 + v * 0.6) * lit * alpha);
        ctx.fillRect(x + r + 5, y - 2.2, Math.max(1.2, v * 34), 4.4);
      }
    }
  }

  /* ── Wires between layers ──────────────────────────────────────────────── */

  /* Horizontal footprint of a map layer: the side-by-side stacks plus the
     depth offset accumulated inside the last one. */
  _mapWidth(layer) {
    const p = PLACEMENT[layer.id];
    const stacks = Math.ceil(layer.maps / p.group);
    return (stacks - 1) * p.groupGap + layer.w * p.cell + (p.group - 1) * p.stack[0];
  }

  _layerAnchor(layer, side, layerDepth) {
    const p = PLACEMENT[layer.id];
    const px = this._par.x * layerDepth;
    const py = this._par.y * layerDepth;
    if (layer.kind === 'map') {
      const midY = p.y + ((p.group - 1) * p.stack[1]) / 2;
      return [(side === 'in' ? p.x - 4 : p.x + this._mapWidth(layer) + 4) + px, midY + py];
    }
    if (layer.kind === 'output') {
      return [(side === 'in' ? p.x - p.dot - 16 : p.x + p.dot) + px, p.y + (layer.n - 1) * p.gap / 2 + py];
    }
    const cols = Math.ceil(layer.n / p.rows);
    const width = (cols - 1) * p.gap * 0.95;
    const midY = p.y + (p.rows - 1) * p.gap * 0.42 / 2;
    return [(side === 'in' ? p.x - p.dot - 6 : p.x + width + p.dot + 6) + px, midY + py];
  }

  /* Wires connect two layers that (thanks to LAYER_RECEDE) sit at different
     depths, so their endpoints drift apart slightly as the pointer moves —
     wires flexing rather than staying rigid reads as more three-dimensional
     than a uniform shift ever could. */
  _drawConnectors(reveals, alpha, depths) {
    const ctx = this.ctx;
    for (let i = 0; i < this._layers.length - 1; i++) {
      const from = this._layers[i];
      const to = this._layers[i + 1];
      const [x1, y1] = this._layerAnchor(from, 'out', depths[i]);
      const [x2, y2] = this._layerAnchor(to, 'in', depths[i + 1]);
      const progress = reveals[i + 1];
      const live = reveals[i] > 0.05;
      if (!live) continue;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = rgba(this._theme.accent2, 0.24 * alpha * reveals[i]);
      ctx.lineWidth = 0.8;
      ctx.stroke();

      /* Signal travelling down the wire while the next layer fills in. */
      if (progress > 0 && progress < 1) {
        const px = x1 + (x2 - x1) * progress;
        const py = y1 + (y2 - y1) * progress;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 9);
        g.addColorStop(0, rgba(this._theme.accentHi, 0.75 * alpha));
        g.addColorStop(1, rgba(this._theme.accentHi, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      const label = CONNECTORS[`${from.id}→${to.id}`];
      if (label && reveals[i + 1] > 0.2) {
        ctx.font = `500 ${7.5 * this._textScale}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(this._theme.textFaint, 0.55 * alpha * reveals[i + 1]);
        /* Biased toward the source layer: at the midpoint the longer captions
           run into the next layer's neuron column. */
        ctx.fillText(label, x1 + (x2 - x1) * 0.42, y1 + (y2 - y1) * 0.42 - 5);
      }
    }
  }

  _drawLayerLabel(layer, alpha, layerDepth) {
    if (alpha <= 0.02) return;
    const ctx = this.ctx;
    const p = PLACEMENT[layer.id];
    let x = p.x;
    if (layer.kind === 'map') x = p.x + this._mapWidth(layer) / 2;
    else if (layer.kind === 'output') x = p.x + 12;
    else x = p.x + ((Math.ceil(layer.n / p.rows) - 1) * p.gap * 0.95) / 2;
    /* Only x tracks the layer's own depth — captions share one baseline
       (REF_H - 44/33) as a caption strip, and drifting that row vertically
       per layer would break its alignment. */
    x += this._par.x * layerDepth;

    ctx.font = `600 ${8 * this._textScale}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(this._theme.textMuted, 0.72 * alpha);
    ctx.fillText(layer.label.toUpperCase(), x, REF_H - 44);
    ctx.font = `400 ${7.5 * this._textScale}px ${MONO}`;
    ctx.fillStyle = rgba(this._theme.textFaint, 0.6 * alpha);
    ctx.fillText(layer.detail, x, REF_H - 33);
  }

  /* ── The answer ────────────────────────────────────────────────────────── */

  _drawVerdict(sample, outReveal, alpha, layerDepth) {
    if (outReveal <= 0.15) return;
    const ctx = this.ctx;
    const p = PLACEMENT.out;
    const a = clamp01((outReveal - 0.15) / 0.85) * alpha;
    const x = p.x + 108 + this._par.x * layerDepth;
    const y = p.y + (CNN.layers[CNN.layers.length - 1].n - 1) * p.gap / 2 + this._par.y * layerDepth;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 62px Outfit, system-ui, sans-serif';
    ctx.fillStyle = rgba(this._theme.accentHi, 0.8 * a);
    ctx.fillText(String(sample.predicted), x, y - 6);

    ctx.font = `500 ${8.5 * this._textScale}px ${MONO}`;
    ctx.fillStyle = rgba(this._theme.textMuted, 0.6 * a);
    ctx.fillText(`p = ${sample.confidence.toFixed(3)}`, x, y + 34);
  }

  /* ── Loop ──────────────────────────────────────────────────────────────── */

  _animate() {
    if (document.hidden || !this._visible) { this.frameId = null; return; }
    this.frameId = requestAnimationFrame(() => this._animate());
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
    if (this._lastDrawTime && (now - this._lastDrawTime) < this._minFrameTime) return;
    this._lastDrawTime = now;
    this._pulse = now * 3;
    this._draw(this._phase(now));
    this._signalReady();
  }

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

const BUCKETS = 7;

/* Byte offset of feature map `m` inside a sample's activation blob. */
function decodeOffset(layer, m, plane) {
  return layer.offset + m * plane;
}
