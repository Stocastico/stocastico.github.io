/* ============================================================
   lenet.mjs — training-side LeNet-5 (no dependencies)
   --------------------------------------------------------------
   The *forward* pass lives in `js/lenet.js`, which is plain ESM with no Node
   built-ins so the browser can import the identical code. This module adds
   the parts only the training pipeline needs — initialisation, the backward
   pass, and float32 serialisation — and re-exports the shared pieces so
   existing importers keep working unchanged.

   Used by `scripts/train-cnn.mjs` (trains on MNIST),
   `scripts/generate-cnn-activations.mjs` (replays 10 forward passes and bakes
   the activations into data/cnn-activations.js for the hero animation) and
   `scripts/generate-lenet-weights.mjs` (quantises the trained weights to int8
   for the interactive page).

   The homepage still ships only precomputed activations, so it stays free of
   any ML runtime; the weights reach the browser on
   projects/mnist-lenet.html alone.

   Architecture: see js/lenet.js.
   ============================================================ */

import {
  SHAPES, MEAN, STD, PARAM_KEYS, C1, C2, K, FLAT,
  createState, forward, maxPool, dense, argmax,
} from '../../js/lenet.js';

export {
  SHAPES, MEAN, STD, PARAM_KEYS, C1, C2, K, FLAT,
  createState, forward, maxPool, dense, argmax,
};

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
