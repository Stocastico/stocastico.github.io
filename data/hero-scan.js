/* ============================================================
   hero-scan.js — GENERATED FILE, DO NOT EDIT
   Regenerate with: npm run generate-hero-scan

   Source: data/cnn-model.json

   conv1 of the LeNet-5 trained by scripts/train-cnn.mjs. The homepage
   hero (js/receptive-field.js) imports this only when its Learned filter
   is chosen, and convolves the name with one of these six kernels.

   Kernels are int8 (multiply by `kernels.scale`); biases are float32.
   ============================================================ */
export const HERO_SCAN = {
  "meta": {
    "arch": "LeNet-5",
    "dataset": "MNIST",
    "layer": "conv1",
    "testAccuracy": 0.9827,
    "mean": 0.1307,
    "std": 0.3081,
    "note": "conv1 kernels only — the homepage hero's Learned filter."
  },
  "kernels": {
    "count": 6,
    "k": 5,
    "scale": 0.013157262576846625,
    "weights": "QAfm9OraVwAU18kv/hbC100TD9svFe/i6+30C+/+Cv/2D/gD+wEH8vID/PYMBPwM8wXtCet/rMwc+j2kvgsAVTvg4uTFRxEFERry/vnSy8HkoJidq9qcnJyr25ucl74Az7zA7CAKAQsz3B4aDg+xofL85DH5v8viBRIjDCUQ6wMC4vMC7+LuCd7z7OT/9+bv3wfv7uLo",
    "bias": [
      -3.8908848762512207,
      -1.305892825126648,
      -3.8759777545928955,
      -8.228522300720215,
      -1.4250553846359253,
      -3.4191994667053223
    ]
  }
};

/* Legacy bare-global read path, mirroring data/locations.js. */
globalThis.HERO_SCAN = HERO_SCAN;
