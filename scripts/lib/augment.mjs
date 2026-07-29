/* ─────────────────────────────────────────────────────────────────────────────
   augment.mjs — the distortions that stand between MNIST and real handwriting.

   These are not a generic augmentation grab-bag. Each one exists because the
   45 captured samples in test/fixtures/real-digits.json showed the model
   failing on it, and the set is deliberately narrow: augmentation that does not
   correspond to an observed failure spends model capacity on invariances
   nobody needs, and a 44 k-parameter network does not have capacity to spare.

   What the captures showed, in order of damage:

     1. Loops that do not close. A 0 drawn as a C read as 3; a 6 whose bowl
        never met its stem read as 5, four times over; an 8 with a gap in one
        loop read as 2. MNIST was written with a pen on paper, where a loop
        closes because the hand keeps moving. On a mouse the gesture stops.
        `breakStrokes` is the direct answer and the reason this file exists.

     2. Long entry serifs. A 1 with a pronounced upstroke flag read as 4 or 7.
        Covered indirectly — shear and rotation move a flag through the range
        of angles where it stops resembling the diagonal of a 4.

     3. Everything a hand does that a pen on ruled paper does not: the strokes
        measured 4.4 px against MNIST's 5.5, and wobbled. `thickness` and
        `elastic` cover those.

   Every function takes an explicit `rand` so a training run stays reproducible
   from its seed, and returns a new array rather than mutating the source —
   MNIST's buffer is a single flat Uint8Array shared across epochs.
   ───────────────────────────────────────────────────────────────────────────── */

const N = 28;

/* ── Sampling ────────────────────────────────────────────────────────────── */

/* Bilinear read with zero outside the field. Digits are ink-on-black, so
   out-of-bounds is genuinely zero rather than a border artefact. */
function sample(px, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let acc = 0;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const xx = x0 + dx, yy = y0 + dy;
      if (xx < 0 || xx >= N || yy < 0 || yy >= N) continue;
      const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      acc += w * px[yy * N + xx];
    }
  }
  return acc;
}

/* ── 1. Stroke breaks — the transform this file is really for ────────────── */

/* Punch gaps *on the ink*, not at random coordinates. A hole in the background
   teaches nothing; a hole in a stroke turns a closed loop into an open one,
   which is exactly the shape the model has never seen.

   Radius is in pixels at 28×28 and deliberately generous: the captured gaps
   were pixels wide, which is why morphological closing could not repair them
   without merging strokes that had to stay apart. Anything narrower than the
   real failure would train the model on a problem it does not have. */
export function breakStrokes(px, rand, { count = 1, radius = 2.0, threshold = 32 } = {}) {
  const ink = [];
  for (let i = 0; i < px.length; i++) if (px[i] > threshold) ink.push(i);
  if (ink.length < 20) return px;              /* too little ink to break */

  const out = Uint8Array.from(px);
  for (let k = 0; k < count; k++) {
    const centre = ink[Math.floor(rand() * ink.length)];
    const cx = centre % N, cy = (centre / N) | 0;
    /* Vary the gap so the model sees a range rather than one memorable size. */
    const r = radius * (0.65 + 0.7 * rand());
    const r2 = r * r;
    const lo = Math.max(0, Math.floor(cy - r)), hi = Math.min(N - 1, Math.ceil(cy + r));
    for (let y = lo; y <= hi; y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.ceil(cx + r)); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 <= r2) out[y * N + x] = 0;
        else if (d2 <= (r + 1) ** 2) {
          /* Feathered rim. A hard disc leaves a machine-cut edge the network
             can learn to spot, which would make the augmentation detectable
             rather than realistic. */
          out[y * N + x] = Math.round(out[y * N + x] * ((Math.sqrt(d2) - r) / 1));
        }
      }
    }
  }
  return out;
}

/* ── 2. Affine ───────────────────────────────────────────────────────────── */

/* Rotation, scale, shear and translation about the field centre. Shear carries
   most of the weight for the 1-with-a-flag case; rotation and scale are
   ordinary regularisation. Ranges stay modest because MNIST digits are already
   roughly upright and a 6 rotated far enough is a 9. */
export function affine(px, rand, {
  maxRotate = 12, maxScale = 0.12, maxShear = 0.18, maxShift = 1.8,
} = {}) {
  const ang = ((rand() * 2 - 1) * maxRotate * Math.PI) / 180;
  const sc = 1 + (rand() * 2 - 1) * maxScale;
  const sh = (rand() * 2 - 1) * maxShear;
  const tx = (rand() * 2 - 1) * maxShift;
  const ty = (rand() * 2 - 1) * maxShift;

  const cos = Math.cos(ang) / sc, sin = Math.sin(ang) / sc;
  const c = (N - 1) / 2;
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      /* Inverse map: walk the destination, read the source. */
      const dx = x - c - tx, dy = y - c - ty;
      let sx = cos * dx + sin * dy;
      const sy = -sin * dx + cos * dy;
      sx -= sh * sy;
      out[y * N + x] = Math.min(255, Math.round(sample(px, sx + c, sy + c)));
    }
  }
  return out;
}

/* ── 3. Elastic ──────────────────────────────────────────────────────────── */

/* Simard's elastic distortion, with the smoothed random field approximated by
   bilinear upsampling from a coarse control grid — a Gaussian blur over 28×28
   would cost more than the forward pass it feeds. `alpha` is displacement in
   pixels; `grid` sets how wavy the deformation is. */
export function elastic(px, rand, { alpha = 3.2, grid = 4 } = {}) {
  const gx = new Float32Array((grid + 1) * (grid + 1));
  const gy = new Float32Array((grid + 1) * (grid + 1));
  for (let i = 0; i < gx.length; i++) {
    gx[i] = (rand() * 2 - 1) * alpha;
    gy[i] = (rand() * 2 - 1) * alpha;
  }
  const at = (f, u, v) => {
    const fu = u * grid, fv = v * grid;
    const u0 = Math.min(grid - 1, Math.floor(fu)), v0 = Math.min(grid - 1, Math.floor(fv));
    const au = fu - u0, av = fv - v0;
    const g = (uu, vv) => f[vv * (grid + 1) + uu];
    return (1 - au) * (1 - av) * g(u0, v0) + au * (1 - av) * g(u0 + 1, v0)
         + (1 - au) * av * g(u0, v0 + 1) + au * av * g(u0 + 1, v0 + 1);
  };

  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / (N - 1), v = y / (N - 1);
      out[y * N + x] = Math.min(255, Math.round(sample(px, x + at(gx, u, v), y + at(gy, u, v))));
    }
  }
  return out;
}

/* ── 4. Thickness ────────────────────────────────────────────────────────── */

/* A 3×3 max or min pass — one step of dilation or erosion. The captured
   strokes measured 4.4 px against MNIST's 5.5, so the model needs to hold up
   at least one step either side of what it was trained on. */
export function thickness(px, dir) {
  if (!dir) return px;
  const out = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let m = dir > 0 ? 0 : 255;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          const v = (xx < 0 || xx >= N || yy < 0 || yy >= N) ? 0 : px[yy * N + xx];
          if (dir > 0 ? v > m : v < m) m = v;
        }
      }
      out[y * N + x] = m;
    }
  }
  return out;
}

/* ── Composition ─────────────────────────────────────────────────────────── */

/* Probabilities, not certainties. Every sample being distorted would shift the
   training distribution off the target rather than widening it — the model
   still has to read a cleanly written digit, which is most of what it will be
   shown. Roughly half of each batch passes through untouched.

   `breakP` is the highest because stroke breaks are the failure mode with the
   most evidence behind them. */
export const DEFAULT_AUG = {
  breakP: 0.45,
  affineP: 0.55,
  elasticP: 0.35,
  thickP: 0.30,
  breakCount: 1,
  breakRadius: 2.0,
};

export function augment(px, rand, cfg = DEFAULT_AUG) {
  let out = px;
  /* Geometry first, then thickness, then breaks. Order matters: a gap punched
     before an affine pass gets resampled and partly filled in again, which
     would quietly weaken the one transform that addresses the real failure. */
  if (rand() < cfg.affineP) out = affine(out, rand);
  if (rand() < cfg.elasticP) out = elastic(out, rand);
  if (rand() < cfg.thickP) out = thickness(out, rand() < 0.5 ? 1 : -1);
  if (rand() < cfg.breakP) {
    out = breakStrokes(out, rand, {
      count: cfg.breakCount + (rand() < 0.25 ? 1 : 0),
      radius: cfg.breakRadius,
    });
  }
  return out;
}
