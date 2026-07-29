/* ─────────────────────────────────────────────────────────────────────────────
   mnist.e2e.mjs — the interactive LeNet-5 actually classifies.

   test/mnist-preprocess.test.mjs already pins the preprocessing in Node, and
   test/lenet-weights.test.mjs pins the quantised weights. Neither runs the
   thing a visitor touches: a canvas, a pointer, and a forward pass in a
   browser. This does, by driving real pointer strokes over the drawing
   surface and reading the verdict out of the DOM.

   The digit paths below are normalised 0..1 polylines, drawn the way a person
   draws them. They are not a substitute for a benchmark — ten strokes is not
   an accuracy measurement — but they are a very good tripwire: if the model,
   the weights, the preprocessing, the canvas readback or the DPR handling
   breaks, well-formed digits stop classifying and this goes red.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';

import { VIEWPORTS, blockExternalRequests, launchBrowser, newPage, startServer } from './harness.mjs';

const LAB = '/projects/mnist-lenet.html';

/* Stroke sets in a normalised 0..1 box. */
const DIGITS = {
  0: [[[.5,.08],[.24,.28],[.20,.5],[.24,.72],[.5,.92],[.76,.72],[.80,.5],[.76,.28],[.5,.08]]],
  1: [[[.42,.22],[.55,.10],[.55,.92]]],
  2: [[[.24,.28],[.34,.12],[.60,.10],[.76,.26],[.70,.46],[.26,.90],[.80,.90]]],
  3: [[[.26,.16],[.56,.08],[.76,.24],[.60,.46],[.44,.48]],[[.60,.46],[.80,.66],[.62,.90],[.32,.90],[.22,.80]]],
  4: [[[.62,.10],[.22,.64],[.82,.64]],[[.62,.10],[.62,.92]]],
  5: [[[.74,.12],[.32,.12],[.28,.44],[.50,.40],[.74,.52],[.72,.78],[.48,.92],[.26,.84]]],
  6: [[[.68,.12],[.42,.24],[.28,.52],[.28,.74],[.46,.92],[.68,.84],[.74,.62],[.58,.48],[.36,.52],[.28,.66]]],
  7: [[[.22,.14],[.80,.14],[.46,.92]]],
  8: [[[.5,.10],[.30,.22],[.34,.42],[.5,.50],[.68,.42],[.70,.22],[.5,.10]],[[.5,.50],[.28,.64],[.26,.82],[.5,.92],[.74,.82],[.72,.64],[.5,.50]]],
  9: [[[.70,.50],[.50,.58],[.32,.46],[.34,.24],[.54,.10],[.70,.24],[.72,.50],[.62,.80],[.40,.92]]],
};

let server, browser;

before(async () => {
  server = await startServer();
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

async function openLab(viewport = VIEWPORTS.desktop) {
  const page = await newPage(browser, server, { viewport });
  await page.goto(server.base + LAB, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas[data-mnist="draw"]');
  /* The canvas sits well below the fold; pointer events land nowhere useful
     until it is actually on screen. */
  await page.evaluate(() =>
    document.querySelector('canvas[data-mnist="draw"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1200);
  return page;
}

async function draw(page, strokes, pad = 0.12) {
  const box = await (await page.$('canvas[data-mnist="draw"]')).boundingBox();
  const P = (nx, ny) => ({
    x: box.x + box.width * (pad + nx * (1 - 2 * pad)),
    y: box.y + box.height * (pad + ny * (1 - 2 * pad)),
  });
  await page.click('[data-mnist="clear"]');
  await page.waitForTimeout(80);
  for (const stroke of strokes) {
    /* Resample so pointermove fires densely — a real hand produces a stream of
       small moves, and the lab draws line segments between them. */
    const pts = [];
    for (let i = 0; i < stroke.length - 1; i++) {
      const [ax, ay] = stroke[i], [bx, by] = stroke[i + 1];
      for (let k = 0; k < 12; k++) pts.push([ax + (bx - ax) * k / 12, ay + (by - ay) * k / 12]);
    }
    pts.push(stroke[stroke.length - 1]);
    const start = P(...pts[0]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const p of pts.slice(1)) { const q = P(...p); await page.mouse.move(q.x, q.y); }
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  return page.evaluate(() => ({
    verdict: document.querySelector('[data-mnist="verdict"]').textContent.trim(),
    confidence: document.querySelector('[data-mnist="confidence"]').textContent.trim(),
  }));
}

describe('mnist lab', () => {
  test('the lab loads, and only on its own page', async () => {
    const lab = await openLab();
    try {
      assert.ok(await lab.$('canvas[data-mnist="preview"]'), 'no preview canvas');
      assert.ok(await lab.$('[data-mnist="bars"]'), 'no confidence bars');
    } finally { await lab.close(); }

    /* The weights are a 44 KB chunk. No other page may pay for it. */
    const home = await newPage(browser, server, { viewport: VIEWPORTS.desktop });
    const requested = [];
    home.on('request', (r) => requested.push(r.url()));
    try {
      await home.goto(server.base + '/index.html', { waitUntil: 'networkidle' });
      await home.waitForTimeout(800);
      const leaked = requested.filter((u) => /lenet-weights|mnist-lab/.test(u));
      assert.deepEqual(leaked, [], 'the homepage downloaded the MNIST lab chunks');
    } finally { await home.close(); }
  });

  test('well-formed digits classify correctly', async () => {
    const page = await openLab();
    const wrong = [];
    try {
      for (const [digit, strokes] of Object.entries(DIGITS)) {
        const { verdict, confidence } = await draw(page, strokes);
        if (verdict !== digit) wrong.push(`drew ${digit}, read ${verdict} (${confidence})`);
      }
    } finally { await page.close(); }
    /* One miss out of ten is tolerable for a 44 KB net on synthetic strokes;
       a second means something structural broke. */
    assert.ok(wrong.length <= 1,
      `${wrong.length}/10 misread — ${wrong.join('; ')}`);
  });

  test('a prediction does not depend on how large the digit is drawn', async () => {
    /* The stroke width is fixed in canvas pixels, so digit size changes the
       stroke-to-box ratio the model sees after downsampling. If that ratio
       drifts out of MNIST's range, accuracy silently collapses for anyone who
       draws big or small. */
    const page = await openLab();
    const failures = [];
    try {
      for (const pad of [0.02, 0.20, 0.32]) {
        for (const digit of ['0', '3', '7']) {
          const { verdict } = await draw(page, DIGITS[digit], pad);
          if (verdict !== digit) failures.push(`pad ${pad}: drew ${digit}, read ${verdict}`);
        }
      }
    } finally { await page.close(); }
    assert.deepEqual(failures, []);
  });

  test('a prediction does not depend on the active theme', async () => {
    /* The canvas strokes in the palette accent and the model reads the alpha
       channel, so a theme switch must be a no-op for inference. */
    const page = await openLab();
    try {
      const dark = await draw(page, DIGITS[3]);
      await page.click('#theme-toggle');
      await page.waitForTimeout(600);
      const light = await draw(page, DIGITS[3]);
      assert.equal(light.verdict, dark.verdict,
        `the same digit read as ${dark.verdict} in dark and ${light.verdict} in light`);
    } finally { await page.close(); }
  });

  test('clearing resets the readout', async () => {
    const page = await openLab();
    try {
      const drawn = await draw(page, DIGITS[8]);
      assert.match(drawn.verdict, /^\d$/, 'no verdict after drawing');
      await page.click('[data-mnist="clear"]');
      await page.waitForTimeout(400);
      const verdict = await page.evaluate(() =>
        document.querySelector('[data-mnist="verdict"]').textContent.trim());
      assert.ok(!/^\d$/.test(verdict), `clear left the verdict showing "${verdict}"`);
    } finally { await page.close(); }
  });
});
