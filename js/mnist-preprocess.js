/* ═══════════════════════════════════════════════════════════
   mnist-preprocess.js — turn a hand-drawn stroke into what MNIST looks like

   This is the step that decides whether the interactive page looks like a
   working model or a broken one. A LeNet trained on MNIST has only ever seen
   digits prepared a very specific way, and feeding it a raw 28×28 downsample
   of a drawing canvas produces confident nonsense — the net is fine, the
   input is out of distribution.

   The original MNIST recipe (Y. LeCun et al., and the description on the
   MNIST page itself):

     1. crop to the digit's bounding box
     2. scale it, preserving aspect ratio, so the longest side is 20 px
     3. centre it in a 28×28 field **by centre of mass**, not by bounding box

   Step 3 is the one that gets skipped. A '1' has its mass where its bounding
   box centre is, so it survives; a '7' or a '4' does not, and those are the
   digits that misclassify when the step is missing.

   Everything here is pure — plain typed arrays in, a Uint8Array(784) out —
   so it runs in Node under `node --test` with no DOM and no canvas.
   ═══════════════════════════════════════════════════════════ */

export const FIELD = 28;   /* MNIST canvas */
export const BOX = 20;     /* the box the digit is scaled to fit */

/* Where the centre of mass has to land, in the pixel-centre coordinates
   `centreOfMass` returns (the centre of pixel i is i + 0.5).

   "The centre of the 28×28 field" sounds like 14.0, and it is not: MNIST's own
   preprocessing translates by whole pixels onto index `28 // 2 = 14`, which is
   the *centre of pixel 14*, i.e. 14.5 here. The half-pixel matters — with 14.0
   this pipeline reconstructs a committed MNIST digit to a mean absolute error
   of 18/255 per pixel and the model misreads two of the ten; with 14.5 nine of
   the ten round-trip byte-for-byte identical. See test/mnist-preprocess.test.mjs,
   which pins exactly that. */
export const CENTRE = FIELD / 2 + 0.5;

/* ── Bounding box of the ink ─────────────────────────────────────────────── */

/* Returns { x0, y0, x1, y1 } inclusive-exclusive, or null when the grid is
   empty. `threshold` ignores the faint anti-aliased fringe of a stroke, which
   would otherwise inflate the box by a pixel or two on every side and shrink
   the digit. */
export function inkBounds(gray, w, h, threshold = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/* ── Area-average resample ───────────────────────────────────────────────── */

/* Box filter from an arbitrary source rect onto a dstW × dstH grid. A box
   filter rather than nearest-neighbour or bilinear because MNIST's own
   downsample was an anti-aliasing area average, and it is what gives the
   soft grey edges the model was trained on — nearest-neighbour produces hard
   binary strokes the net has never seen. */
export function resampleBox(src, srcW, rect, dstW, dstH) {
  const out = new Float32Array(dstW * dstH);
  const rw = rect.x1 - rect.x0;
  const rh = rect.y1 - rect.y0;
  const sx = rw / dstW;
  const sy = rh / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const fy0 = rect.y0 + dy * sy;
    const fy1 = fy0 + sy;
    const iy0 = Math.floor(fy0);
    const iy1 = Math.min(Math.ceil(fy1), rect.y1);
    for (let dx = 0; dx < dstW; dx++) {
      const fx0 = rect.x0 + dx * sx;
      const fx1 = fx0 + sx;
      const ix0 = Math.floor(fx0);
      const ix1 = Math.min(Math.ceil(fx1), rect.x1);

      let sum = 0;
      let weight = 0;
      for (let y = iy0; y < iy1; y++) {
        /* Fractional overlap of this source row with the destination cell. */
        const wy = Math.min(y + 1, fy1) - Math.max(y, fy0);
        if (wy <= 0) continue;
        for (let x = ix0; x < ix1; x++) {
          const wx = Math.min(x + 1, fx1) - Math.max(x, fx0);
          if (wx <= 0) continue;
          const a = wx * wy;
          sum += src[y * srcW + x] * a;
          weight += a;
        }
      }
      out[dy * dstW + dx] = weight > 0 ? sum / weight : 0;
    }
  }
  return out;
}

/* ── Centre of mass ──────────────────────────────────────────────────────── */

/* Intensity-weighted centroid, in fractional pixel coordinates. */
export function centreOfMass(grid, w, h) {
  let mass = 0, mx = 0, my = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x];
      if (v <= 0) continue;
      mass += v;
      mx += v * (x + 0.5);
      my += v * (y + 0.5);
    }
  }
  if (mass === 0) return null;
  return { x: mx / mass, y: my / mass, mass };
}

/* ── The whole pipeline ──────────────────────────────────────────────────── */

/* `gray` is a w×h grid of 0..255 ink intensities — white-on-black, the way
   MNIST stores it (0 = background). Returns a Uint8Array(784) ready for
   forward(), or null when there is no ink to work with.

   Also returns, via `out.meta`, the numbers the page displays so a visitor
   can see what the normalisation actually did. */
export function preprocessDigit(gray, w, h) {
  const bounds = inkBounds(gray, w, h);
  if (!bounds) return null;

  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.y1 - bounds.y0;

  /* Fit the longest side to BOX, preserving aspect. A wide '—' stays wide;
     the digit is never stretched to square, which would turn a 1 into a 0. */
  const scale = BOX / Math.max(bw, bh);
  const dstW = Math.max(1, Math.round(bw * scale));
  const dstH = Math.max(1, Math.round(bh * scale));

  const small = resampleBox(gray, w, bounds, dstW, dstH);

  /* Centre of mass of the *scaled* digit, then place it so that centroid
     lands on the middle of the 28×28 field. */
  const com = centreOfMass(small, dstW, dstH);
  if (!com) return null;

  /* Where the top-left of the small grid has to go for its centroid to land on
     CENTRE. Rounded to a whole pixel, as MNIST does, then clamped so the digit
     can never be pushed off the field by an extreme centroid (a stroke hugging
     one edge). */
  let ox = Math.round(CENTRE - com.x);
  let oy = Math.round(CENTRE - com.y);
  ox = Math.max(0, Math.min(FIELD - dstW, ox));
  oy = Math.max(0, Math.min(FIELD - dstH, oy));

  const field = new Uint8Array(FIELD * FIELD);
  for (let y = 0; y < dstH; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= FIELD) continue;
    for (let x = 0; x < dstW; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= FIELD) continue;
      const v = small[y * dstW + x];
      field[ty * FIELD + tx] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }

  field.meta = {
    bounds,
    boxW: dstW,
    boxH: dstH,
    offsetX: ox,
    offsetY: oy,
    centroid: { x: com.x, y: com.y },
  };
  return field;
}

/* ── Canvas adapter ──────────────────────────────────────────────────────── */

/* Pull a white-on-black intensity grid out of a drawing canvas. The lab draws
   opaque white strokes on a transparent canvas, so the alpha channel *is* the
   ink — no luminance conversion needed, and it stays correct when the palette
   (and therefore the stroke colour) changes. */
export function grayFromImageData(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = data[p + 3];
  return { gray, width, height };
}
