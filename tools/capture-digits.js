/* ─────────────────────────────────────────────────────────────────────────────
   capture-digits.js — collect real handwriting from the MNIST lab.

   Paste this whole file into the browser console on
   https://stefanomasneri.com/projects/mnist-lenet.html

   Why it exists: the model scores 98.5% on MNIST's own test set and 76% on
   digits drawn by hand. Eight rounds of synthetic strokes — European
   letterforms, slant, tremor, sparse sampling, every device pixel ratio —
   failed to reproduce a single one of those errors. The only thing that ever
   disagreed with the benchmark was 45 digits drawn by a person, and the
   remaining questions need more of them.

   ── Use ──────────────────────────────────────────────────────────────────

     draw a digit, then press the key for what you MEANT to draw   (0–9)
     u          undo the last capture, for a misclick or a slip of the pen
     s          stats so far
     d          download the JSON

   Or call cap(7) / undo() / stats() / dump() directly if you prefer typing.
   Key capture is on by default; keys(false) turns it off and keys(true) puts
   it back. It ignores keystrokes while the ⌘K palette or any text field has
   focus, so it will not fight the rest of the page.

   ── What is worth capturing ──────────────────────────────────────────────

   Draw the way you normally write, not the way that reproduces the bug. A set
   made only of failures cannot tell whether a change fixed anything or merely
   moved the errors somewhere else, so the ones it gets RIGHT matter just as
   much as the ones it gets wrong.

   Most valuable right now:

     · 1  — it regressed to 0/3 in the last retrain and three samples is not
            enough to know whether that is real. Draw yours however you draw
            it, serif and all.
     · 6  — still the weakest digit at 7/10.
     · anything from someone whose handwriting is not yours. One person's hand
            is one distribution, and the model needs to survive more than that.

   Fifty is a usable set. Two hundred would let some be trained on instead of
   only measured against, which is the point at which this stops being an eval
   fixture and starts being data.
   ───────────────────────────────────────────────────────────────────────── */

(() => {
  const CANVAS = 'canvas[data-mnist="draw"]';
  const VERDICT = '[data-mnist="verdict"]';
  const CONFIDENCE = '[data-mnist="confidence"]';

  const canvas = document.querySelector(CANVAS);
  if (!canvas) {
    console.error('No drawing canvas here — open projects/mnist-lenet.html first.');
    return;
  }

  const caps = (window.__caps ??= []);

  /* Any ink at all? The commonest capture mistake is labelling an empty canvas
     after a clear, which silently poisons the set with a blank sample. */
  const hasInk = () => {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return true;
    return false;
  };

  const cap = (meant) => {
    meant = Number(meant);
    if (!Number.isInteger(meant) || meant < 0 || meant > 9) {
      console.warn('cap(n) expects a digit 0–9'); return;
    }
    if (!hasInk()) { console.warn('canvas is empty — draw first, then capture'); return; }

    const read = document.querySelector(VERDICT)?.textContent.trim() ?? '?';
    const conf = document.querySelector(CONFIDENCE)?.textContent.trim() ?? '';
    caps.push({
      meant,
      read: /^\d$/.test(read) ? Number(read) : read,
      confidence: conf,
      png: canvas.toDataURL(),
      /* Kept because the device matrix was a live hypothesis for a while, and
         a future failure that only happens at one pixel ratio would otherwise
         be invisible in the dump. */
      dpr: window.devicePixelRatio || 1,
      canvas: `${canvas.width}×${canvas.height}`,
      at: new Date().toISOString(),
    });
    const ok = String(read) === String(meant);
    console.log(`%c#${caps.length}  meant ${meant} → read ${read} ${ok ? '✓' : '✗'}`,
      `color:${ok ? '#6db088' : '#e8626c'}`);
  };

  const undo = () => {
    const gone = caps.pop();
    console.log(gone ? `removed #${caps.length + 1} (meant ${gone.meant})` : 'nothing to undo');
  };

  const stats = () => {
    if (!caps.length) { console.log('nothing captured yet'); return; }
    const per = Array.from({ length: 10 }, () => ({ ok: 0, n: 0 }));
    for (const c of caps) {
      per[c.meant].n++;
      if (String(c.read) === String(c.meant)) per[c.meant].ok++;
    }
    const ok = per.reduce((a, d) => a + d.ok, 0);
    console.table(Object.fromEntries(per.map((d, i) => [i, { drawn: d.n, correct: d.ok }])));
    console.log(`${caps.length} captured · model got ${ok} right (${((ok / caps.length) * 100).toFixed(1)}%)`);
  };

  const dump = () => {
    if (!caps.length) { console.warn('nothing to dump'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(caps)], { type: 'application/json' }));
    a.download = `mnist-samples-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    console.log(`downloading ${caps.length} samples`);
  };

  /* ── Key capture ───────────────────────────────────────────────────────── */

  let onKey = null;
  const keys = (on = true) => {
    if (onKey) { removeEventListener('keydown', onKey, true); onKey = null; }
    if (!on) { console.log('key capture off'); return; }
    onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /* Never swallow a keystroke meant for a field or the command palette.
         The overlay has to be tested for existence separately from its state:
         project detail pages carry no #cmd-overlay at all, and a bare
         `!overlay?.hidden` is true when the element is missing — which
         disabled key capture on the one page this tool is for, silently, with
         the keys simply doing nothing. */
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const overlay = document.getElementById('cmd-overlay');
      if (overlay && !overlay.hidden) return;

      if (/^\d$/.test(e.key)) { e.preventDefault(); cap(e.key); }
      else if (e.key === 'u') { e.preventDefault(); undo(); }
      else if (e.key === 's') { e.preventDefault(); stats(); }
      else if (e.key === 'd') { e.preventDefault(); dump(); }
    };
    addEventListener('keydown', onKey, true);
    console.log('key capture on — 0–9 to label, u undo, s stats, d download');
  };

  Object.assign(window, { cap, undo, stats, dump, keys });
  keys(true);

  console.log(`%ccapture ready${caps.length ? ` — ${caps.length} already held` : ''}`,
    'font-weight:bold');
  console.log('draw a digit, then press the key for what you meant. d downloads.');
})();
