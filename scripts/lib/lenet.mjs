/* ============================================================
   lenet.mjs — a small LeNet-5 in plain JavaScript (no dependencies)
   --------------------------------------------------------------
   Shared by `scripts/train-cnn.mjs` (which trains it on MNIST) and
   `scripts/generate-cnn-activations.mjs` (which replays 10 forward passes and
   bakes the activations into data/cnn-activations.js for the hero animation).

   Nothing here ever reaches the browser: the site ships only the precomputed
   activations, so the homepage stays free of any ML runtime.

   Architecture (LeNet-5 adapted to 28x28 MNIST, ReLU instead of tanh):

     input   1 x 28 x 28
     conv1   6 filters 5x5, valid   ->  6 x 24 x 24   + ReLU
     pool1   max 2x2 stride 2       ->  6 x 12 x 12
     conv2  16 filters 5x5, valid   -> 16 x  8 x  8   + ReLU
     pool2   max 2x2 stride 2       -> 16 x  4 x  4   (= 256)
     fc1     256 -> 120             + ReLU
     fc2     120 ->  84             + ReLU
     fc3      84 ->  10             + softmax
   ============================================================ */

/* ── Layer geometry ──────────────────────────────────────────────────────── */
export const SHAPES = {
  input: { c: 1, h: 28, w: 28 },
  conv1: { c: 6, h: 24, w: 24 },
  pool1: { c: 6, h: 12, w: 12 },
  conv2: { c: 16, h: 8, w: 8 },
  pool2: { c: 16, h: 4, w: 4 },
  fc1: { n: 120 },
  fc2: { n: 84 },
  out: { n: 10 },
};

/* MNIST's standard normalisation constants. */
export const MEAN = 0.1307;
export const STD = 0.3081;

const C1 = SHAPES.conv1.c, C2 = SHAPES.conv2.c, K = 5;
const FLAT = SHAPES.pool2.c * SHAPES.pool2.h * SHAPES.pool2.w; // 256

/* ── Model construction ──────────────────────────────────────────────────── */

/* Deterministic PRNG (mulberry32) so training runs are reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Box-Muller normal sample from a uniform generator. */
function randn(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* He (Kaiming) initialisation — the right scale for ReLU layers. */
function heInit(size, fanIn, rand) {
  const a = new Float32Array(size);
  const s = Math.sqrt(2 / fanIn);
  for (let i = 0; i < size; i++) a[i] = randn(rand) * s;
  return a;
}

export function createModel(seed = 1337) {
  const rand = rng(seed);
  return {
    w1: heInit(C1 * K * K, K * K, rand), b1: new Float32Array(C1),
    w2: heInit(C2 * C1 * K * K, C1 * K * K, rand), b2: new Float32Array(C2),
    w3: heInit(SHAPES.fc1.n * FLAT, FLAT, rand), b3: new Float32Array(SHAPES.fc1.n),
    w4: heInit(SHAPES.fc2.n * SHAPES.fc1.n, SHAPES.fc1.n, rand), b4: new Float32Array(SHAPES.fc2.n),
    w5: heInit(SHAPES.out.n * SHAPES.fc2.n, SHAPES.fc2.n, rand), b5: new Float32Array(SHAPES.out.n),
  };
}

export const PARAM_KEYS = ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4', 'w5', 'b5'];

/* Scratch buffers for one forward/backward pass. Reused across samples so the
   training loop does not allocate 200k-element arrays 100k times. */
export function createState() {
  return {
    x: new Float32Array(784),
    c1: new Float32Array(C1 * 24 * 24),
    p1: new Float32Array(C1 * 12 * 12),
    p1idx: new Int32Array(C1 * 12 * 12),
    c2: new Float32Array(C2 * 8 * 8),
    p2: new Float32Array(C2 * 4 * 4),
    p2idx: new Int32Array(C2 * 4 * 4),
    h1: new Float32Array(SHAPES.fc1.n),
    h2: new Float32Array(SHAPES.fc2.n),
    logits: new Float32Array(SHAPES.out.n),
    probs: new Float32Array(SHAPES.out.n),
  };
}

/* ── Forward ─────────────────────────────────────────────────────────────── */

/* `pixels` is a Uint8Array(784) of raw MNIST greys. Writes into `s`. */
export function forward(m, pixels, s) {
  const { x, c1, p1, p1idx, c2, p2, p2idx, h1, h2, logits, probs } = s;

  for (let i = 0; i < 784; i++) x[i] = (pixels[i] / 255 - MEAN) / STD;

  /* conv1 + ReLU */
  for (let f = 0; f < C1; f++) {
    const wo = f * 25, bias = m.b1[f], co = f * 576;
    for (let oy = 0; oy < 24; oy++) {
      for (let ox = 0; ox < 24; ox++) {
        let sum = bias;
        for (let ky = 0; ky < 5; ky++) {
          const xo = (oy + ky) * 28 + ox, ko = wo + ky * 5;
          sum += x[xo] * m.w1[ko] + x[xo + 1] * m.w1[ko + 1] + x[xo + 2] * m.w1[ko + 2] +
                 x[xo + 3] * m.w1[ko + 3] + x[xo + 4] * m.w1[ko + 4];
        }
        c1[co + oy * 24 + ox] = sum > 0 ? sum : 0;
      }
    }
  }

  maxPool(c1, p1, p1idx, C1, 24, 12);

  /* conv2 + ReLU */
  for (let f = 0; f < C2; f++) {
    const bias = m.b2[f], co = f * 64;
    for (let oy = 0; oy < 8; oy++) {
      for (let ox = 0; ox < 8; ox++) {
        let sum = bias;
        for (let c = 0; c < C1; c++) {
          const po = c * 144, wo = (f * C1 + c) * 25;
          for (let ky = 0; ky < 5; ky++) {
            const pi = po + (oy + ky) * 12 + ox, ki = wo + ky * 5;
            sum += p1[pi] * m.w2[ki] + p1[pi + 1] * m.w2[ki + 1] + p1[pi + 2] * m.w2[ki + 2] +
                   p1[pi + 3] * m.w2[ki + 3] + p1[pi + 4] * m.w2[ki + 4];
          }
        }
        c2[co + oy * 8 + ox] = sum > 0 ? sum : 0;
      }
    }
  }

  maxPool(c2, p2, p2idx, C2, 8, 4);

  dense(p2, m.w3, m.b3, h1, FLAT, SHAPES.fc1.n, true);
  dense(h1, m.w4, m.b4, h2, SHAPES.fc1.n, SHAPES.fc2.n, true);
  dense(h2, m.w5, m.b5, logits, SHAPES.fc2.n, SHAPES.out.n, false);

  /* softmax */
  let max = -Infinity;
  for (let i = 0; i < 10; i++) if (logits[i] > max) max = logits[i];
  let total = 0;
  for (let i = 0; i < 10; i++) { probs[i] = Math.exp(logits[i] - max); total += probs[i]; }
  for (let i = 0; i < 10; i++) probs[i] /= total;

  return s;
}

/* Max-pool 2x2 stride 2. Records the flat source index of each winner so the
   backward pass can route the gradient to it. */
function maxPool(src, dst, idx, channels, inW, outW) {
  const inPlane = inW * inW, outPlane = outW * outW;
  for (let c = 0; c < channels; c++) {
    const so = c * inPlane, dof = c * outPlane;
    for (let oy = 0; oy < outW; oy++) {
      for (let ox = 0; ox < outW; ox++) {
        const base = so + oy * 2 * inW + ox * 2;
        let best = src[base], bi = base;
        if (src[base + 1] > best) { best = src[base + 1]; bi = base + 1; }
        if (src[base + inW] > best) { best = src[base + inW]; bi = base + inW; }
        if (src[base + inW + 1] > best) { best = src[base + inW + 1]; bi = base + inW + 1; }
        dst[dof + oy * outW + ox] = best;
        idx[dof + oy * outW + ox] = bi;
      }
    }
  }
}

function dense(src, w, b, dst, nIn, nOut, relu) {
  for (let o = 0; o < nOut; o++) {
    const wo = o * nIn;
    let sum = b[o];
    for (let i = 0; i < nIn; i++) sum += src[i] * w[wo + i];
    dst[o] = relu && sum < 0 ? 0 : sum;
  }
}

export function argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

/* ── Backward (accumulates into `g`, a model-shaped gradient bag) ─────────── */

export function createGrads() {
  const m = createModel(1);
  for (const k of PARAM_KEYS) m[k] = new Float32Array(m[k].length);
  return m;
}

export function zeroGrads(g) {
  for (const k of PARAM_KEYS) g[k].fill(0);
}

/* Scratch for the per-sample backward deltas. */
export function createBackState() {
  return {
    dh2: new Float32Array(SHAPES.fc2.n),
    dh1: new Float32Array(SHAPES.fc1.n),
    dp2: new Float32Array(FLAT),
    dc2: new Float32Array(C2 * 64),
    dp1: new Float32Array(C1 * 144),
    dc1: new Float32Array(C1 * 576),
    dlogits: new Float32Array(SHAPES.out.n),
  };
}

/* Cross-entropy + softmax backward. Returns the sample loss. */
export function backward(m, s, g, bs, label) {
  const { x, p1, p2, h1, h2, probs, p1idx, p2idx } = s;
  const { dlogits, dh2, dh1, dp2, dc2, dp1, dc1 } = bs;

  const loss = -Math.log(Math.max(probs[label], 1e-12));

  for (let i = 0; i < 10; i++) dlogits[i] = probs[i] - (i === label ? 1 : 0);

  /* fc3 */
  dh2.fill(0);
  for (let o = 0; o < 10; o++) {
    const d = dlogits[o], wo = o * SHAPES.fc2.n;
    if (d === 0) continue;
    g.b5[o] += d;
    for (let i = 0; i < SHAPES.fc2.n; i++) {
      g.w5[wo + i] += d * h2[i];
      dh2[i] += d * m.w5[wo + i];
    }
  }

  /* fc2 (ReLU) */
  dh1.fill(0);
  for (let o = 0; o < SHAPES.fc2.n; o++) {
    if (h2[o] <= 0) { dh2[o] = 0; continue; }
    const d = dh2[o], wo = o * SHAPES.fc1.n;
    g.b4[o] += d;
    for (let i = 0; i < SHAPES.fc1.n; i++) {
      g.w4[wo + i] += d * h1[i];
      dh1[i] += d * m.w4[wo + i];
    }
  }

  /* fc1 (ReLU) */
  dp2.fill(0);
  for (let o = 0; o < SHAPES.fc1.n; o++) {
    if (h1[o] <= 0) { dh1[o] = 0; continue; }
    const d = dh1[o], wo = o * FLAT;
    g.b3[o] += d;
    for (let i = 0; i < FLAT; i++) {
      g.w3[wo + i] += d * p2[i];
      dp2[i] += d * m.w3[wo + i];
    }
  }

  /* pool2 -> conv2 */
  dc2.fill(0);
  for (let i = 0; i < FLAT; i++) dc2[p2idx[i]] += dp2[i];

  /* conv2 (ReLU) */
  dp1.fill(0);
  for (let f = 0; f < C2; f++) {
    const co = f * 64;
    for (let oy = 0; oy < 8; oy++) {
      for (let ox = 0; ox < 8; ox++) {
        const oi = co + oy * 8 + ox;
        if (s.c2[oi] <= 0) continue;
        const d = dc2[oi];
        if (d === 0) continue;
        g.b2[f] += d;
        for (let c = 0; c < C1; c++) {
          const po = c * 144, wo = (f * C1 + c) * 25;
          for (let ky = 0; ky < 5; ky++) {
            const pi = po + (oy + ky) * 12 + ox, ki = wo + ky * 5;
            for (let kx = 0; kx < 5; kx++) {
              g.w2[ki + kx] += d * p1[pi + kx];
              dp1[pi + kx] += d * m.w2[ki + kx];
            }
          }
        }
      }
    }
  }

  /* pool1 -> conv1 */
  dc1.fill(0);
  for (let i = 0; i < dp1.length; i++) dc1[p1idx[i]] += dp1[i];

  /* conv1 (ReLU) — no input gradient needed */
  for (let f = 0; f < C1; f++) {
    const co = f * 576, wo = f * 25;
    for (let oy = 0; oy < 24; oy++) {
      for (let ox = 0; ox < 24; ox++) {
        const oi = co + oy * 24 + ox;
        if (s.c1[oi] <= 0) continue;
        const d = dc1[oi];
        if (d === 0) continue;
        g.b1[f] += d;
        for (let ky = 0; ky < 5; ky++) {
          const xo = (oy + ky) * 28 + ox, ki = wo + ky * 5;
          for (let kx = 0; kx < 5; kx++) g.w1[ki + kx] += d * x[xo + kx];
        }
      }
    }
  }

  return loss;
}

/* ── Serialisation ───────────────────────────────────────────────────────── */

export function f32ToBase64(arr) {
  return Buffer.from(new Float32Array(arr).buffer).toString('base64');
}

export function base64ToF32(b64) {
  const buf = Buffer.from(b64, 'base64');
  /* Copy — the Buffer pool means byteOffset is rarely 0 or 4-aligned. */
  const out = new Float32Array(buf.byteLength / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export function serializeModel(m, meta = {}) {
  const params = {};
  for (const k of PARAM_KEYS) params[k] = f32ToBase64(m[k]);
  return { arch: 'lenet5-28', shapes: SHAPES, ...meta, params };
}

export function deserializeModel(json) {
  const m = {};
  for (const k of PARAM_KEYS) m[k] = base64ToF32(json.params[k]);
  return m;
}
