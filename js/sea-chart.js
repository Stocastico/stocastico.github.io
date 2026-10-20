/* The travel chart's tooltips (#193 review).

   Every mark on the chart carries its name in data-tip. It used to be a
   native SVG <title>, which the browser shows only after a second's
   stillness — so hovering a port showed the help cursor and nothing else,
   which read as "a question mark instead of the place". This shows the name
   the moment the pointer is on a mark, beside it, and hides it on leave.

   The chart is role="img" with a full <desc>, so a screen reader already
   gets the route, the counts and the tours; the tooltip is for the pointer.
   Listeners live on the chart's own element, not on document or window, so
   destroy() is all a bfcache teardown needs. */
export function initSeaChartTips(svg) {
  const frame = svg.parentElement;
  const tip = document.createElement('div');
  tip.className = 'sea-chart-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  frame.appendChild(tip);

  let current = null;
  const place = (e) => {
    const box = frame.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    /* Flip to the left of the pointer past the frame's midline, so a name
       near the right edge never runs off it. */
    const left = x > box.width / 2;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.toggle('is-left', left);
  };
  const over = (e) => {
    const mark = e.target.closest('[data-tip]');
    if (!mark || !svg.contains(mark)) return;
    current = mark;
    tip.textContent = mark.getAttribute('data-tip');
    tip.hidden = false;
    place(e);
  };
  const move = (e) => { if (current) place(e); };
  const out = (e) => {
    if (!current) return;
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-tip]') : null;
    if (to === current) return;
    current = null;
    tip.hidden = true;
  };

  svg.addEventListener('pointerover', over);
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerout', out);
  return {
    destroy() {
      svg.removeEventListener('pointerover', over);
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerout', out);
      tip.remove();
    },
  };
}
