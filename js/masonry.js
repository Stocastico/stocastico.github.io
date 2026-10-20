/* Project cards packed under each other (review of #188).

   The cards keep their own heights, and a grid row is as tall as its tallest
   card, so a short card left a hole under it before the next row began. CSS
   masonry would close it in document order, and css/styles.css asks for it
   under @supports — but no browser ships it yet, so until one does this does
   the same with ordinary grid placement: tiny implicit rows, and each card
   spans as many as its height needs. Auto-placement is sparse, so the cards
   still go in document order and the top row stays the newest work.

   Layout only, measured on resize: a ResizeObserver per card (a card's
   height changes with the column width, a late thumbnail, a font) and a
   MutationObserver for the client re-render that replaces them. Everything
   is on the grid's own nodes, so destroy() is all a bfcache teardown needs. */
const ROW = 4;

export function initMasonry(grid) {
  const noop = { destroy() {} };
  if (typeof ResizeObserver === 'undefined' || typeof CSS === 'undefined') return noop;
  if (CSS.supports('grid-template-rows', 'masonry') || CSS.supports('item-flow', 'row masonry')) return noop;

  const span = (card) => {
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    card.style.gridRowEnd = `span ${Math.ceil((card.offsetHeight + gap) / ROW)}`;
  };
  const ro = new ResizeObserver((entries) => entries.forEach((e) => span(e.target)));
  const watch = () => [...grid.children].forEach((c) => ro.observe(c));
  const mo = new MutationObserver(() => { ro.disconnect(); watch(); });

  grid.classList.add('is-packed');
  watch();
  mo.observe(grid, { childList: true });

  return {
    destroy() {
      ro.disconnect();
      mo.disconnect();
      grid.classList.remove('is-packed');
      [...grid.children].forEach((c) => { c.style.gridRowEnd = ''; });
    },
  };
}
