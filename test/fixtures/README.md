# Captured digit fixtures

Real digits drawn in the live MNIST widget and dumped with `tools/capture-digits.js`,
then converted to 28×28 MNIST greys by `scripts/ingest-digit-capture.mjs` — which
decodes the PNG in Chromium and preprocesses it with `js/mnist-preprocess.js`, so the
stored pixels are byte-for-byte the pixels the model saw.

| file | n | session | writer | role |
|---|---|---|---|---|
| `real-digits.json`   | 45 | 2026-07-29 | stefano | **held out — never train on this** |
| `real-digits-2.json` | 77 | 2026-07-30 | stefano | training / domain adaptation |

## Why the split is by session, not by sample

These exist because the model scores ~98% on the MNIST test set and far less on
digits people actually draw. Measuring that gap honestly is the entire purpose of
the files, and there is one mistake that destroys it silently: shuffling all the
captures together and splitting at random.

Samples from one hand in one sitting are **not independent**. The same slightly
open `6`, the same flagged `1`, drawn a dozen times over twenty minutes. Split at
random and near-identical digits land on both sides, the reported accuracy climbs,
and nothing about the widget has improved — the number just stopped measuring
anything. So the split is by capture session, and `train-cnn.mjs` refuses to take
its `--real-eval` fixture as a `--real-train` input.

## What these numbers do and do not claim

Both sessions are the **same writer**. A model tuned on one and evaluated on the
other measures *"reads this person's handwriting on a day it has not seen"* — a
real generalisation question, and the one that matters for the person whose site
this is.

It does **not** measure whether the widget works better for a stranger. Nothing
here can, until there are captures from more than one hand. Any accuracy quoted
from these files carries that caveat; see issue #140.

## Adding a session

```bash
node scripts/ingest-digit-capture.mjs dump.json \
  --out test/fixtures/real-digits-3.json \
  --writer <name> --note "..."
```

Tag the writer honestly. The moment there are two writers, the split should become
**by writer** rather than by session — that is the stronger test, and the one that
would finally answer the question the session split cannot.
