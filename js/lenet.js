/* ═══════════════════════════════════════════════════════════
   lenet.js — the LeNet-5 forward pass, shared by Node and the browser

   This is the *only* implementation of the forward pass in the repo.
   `scripts/lib/lenet.mjs` imports it (adding training-only code: init,
   backward, float32 serialisation) and `js/mnist-lab.js` imports it to
   classify hand-drawn digits on projects/mnist-lenet.html. Keeping one copy
   is the point — a second implementation would eventually disagree with the
   weights it was trained against, and the failure would look like a broken
   model rather than a code bug.

   Nothing here touches the DOM, `Buffer`, or any Node built-in, so it runs
   unchanged in both places.

   Architecture (LeNet-5 adapted to 28x28 MNIST, ReLU instead of tanh):

     input   1 x 28 x 28
     conv1   6 filters 5x5, valid   ->  6 x 24 x 24   + ReLU
     pool1   max 2x2 stride 2       ->  6 x 12 x 12
     conv2  16 filters 5x5, valid   -> 16 x  8 x  8   + ReLU
     pool2   max 2x2 stride 2       -> 16 x  4 x  4   (= 256)
     fc1     256 -> 120             + ReLU
     fc2     120 ->  84             + ReLU
     fc3      84 ->  10             + softmax
   ═══════════════════════════════════════════════════════════ */

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

export const PARAM_KEYS = ['w1', 'b1', 'w2', 'b2', 'w3', 'b3', 'w4', 'b4', 'w5', 'b5'];

const C1 = SHAPES.conv1.c, C2 = SHAPES.conv2.c, K = 5;
const FLAT = SHAPES.pool2.c * SHAPES.pool2.h * SHAPES.pool2.w; // 256

export { C1, C2, K, FLAT };

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
export function maxPool(src, dst, idx, channels, inW, outW) {
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

export function dense(src, w, b, dst, nIn, nOut, relu) {
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
