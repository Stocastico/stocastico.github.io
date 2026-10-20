/* Project cards packed under each other (review of #188).

   The cards keep their own heights, and a grid row is as tall as its tallest
   card, so a short card left a hole under it before the next row began. CSS
   masonry would close it in document order, and css/styles.css asks for it
   under @supports — but no browser ships it yet, so until one does this does
   the same on an ordinary grid: tiny implicit rows, and each card placed
   explicitly in the column that currently ends highest (leftmost on a tie),
   spanning as many rows as its height needs. Document order still decides
   who goes first, so the top row is the newest work, left to right.

   Placement is explicit on purpose. The first version only set each card's
   span and left the column to auto-placement, whose cursor never moves back
   up: a card could not drop into a shorter column that had freed up above
   the previous card's row, which left holes of ~60px whenever the heights
   lined up badly (it showed in CI, not locally).

   Layout only, re-run on resize: a ResizeObserver per card (a card's height
   changes with the column width, a late thumbnail, a font, the facet filter
   hiding it) and a MutationObserver for the client re-render that replaces
   them, batched into one frame. Everything is on the grid's own nodes, so
   destroy() is all a bfcache teardown needs. */
const ROW = 4;

export function initMasonry(grid) {
  const noop = { destroy() {} };
  if (typeof ResizeObserver === 'undefined' || typeof CSS === 'undefined') return noop;
  if (CSS.supports('grid-template-rows', 'masonry') || CSS.supports('item-flow', 'row masonry')) return noop;

  let frame = 0;
  const layout = () => {
    frame = 0;
    const cs = getComputedStyle(grid);
    const gap = parseFloat(cs.columnGap) || 0;
    const cols = Math.max(1, cs.gridTemplateColumns.split(' ').filter(Boolean).length);
    const ends = new Array(cols).fill(1);
    for (const card of grid.children) {
      if (card.hidden || card.offsetParent === null) continue;
      const span = Math.ceil((card.offsetHeight + gap) / ROW);
      let c = 0;
      for (let i = 1; i < cols; i++) if (ends[i] < ends[c]) c = i;
      card.style.gridColumn = String(c + 1);
      card.style.gridRow = `${ends[c]} / span ${span}`;
      ends[c] += span;
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(layout); };
  const ro = new ResizeObserver(schedule);
  const watch = () => { ro.observe(grid); [...grid.children].forEach((c) => ro.observe(c)); };
  const mo = new MutationObserver(() => { ro.disconnect(); watch(); schedule(); });

  grid.classList.add('is-packed');
  watch();
  mo.observe(grid, { childList: true });
  schedule();

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      grid.classList.remove('is-packed');
      [...grid.children].forEach((c) => { c.style.gridColumn = ''; c.style.gridRow = ''; });
    },
  };
}
