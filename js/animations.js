/* ═══════════════════════════════════════════════════════════
   ANIMATIONS — scroll-driven effects,
   skill bars, timeline entrance.

   Pure DOM / Canvas API — no Three.js dependency.
   ═══════════════════════════════════════════════════════════ */
import { prefersReducedMotion, rafThrottle } from './utils.js';

/* ═══════════════════════════════════════════════════════════
   SCROLL-TRIGGERED REVEAL
   ═══════════════════════════════════════════════════════════ */
/* `[data-animate]` starts at opacity 0, so this function is not decoration —
   it is the only thing that ever makes that content visible. Anything it fails
   to reveal stays invisible forever, silently, with the markup present and the
   section rendering as an empty band. That failure mode is why the whole thing
   is built defensively:

     · An element already scrolled past when the observer starts (a deep link,
       a nav anchor jump, a browser-restored scroll position) is never
       *entering* the viewport, so no IntersectionObserver callback is ever
       coming for it. The initial state has to be swept, not waited on.
     · `threshold: 0.1` cannot be met by an element taller than the viewport
       once the negative rootMargin shrinks the root further.
     · The sections carried `content-visibility: auto`, whose skipped subtrees
       the observer could not see into at all — on a 390px viewport that left
       every animated element in #contact at opacity 0 permanently. The
       property has been removed (see css/styles.css), but the sweep below is
       what makes the reveal robust rather than merely un-broken.

   So: the observer handles the pleasant case (stagger a section in as it
   arrives), and a sweep guarantees the invariant — nothing at or above the
   fold stays hidden. */
/* Set by initScrollReveal() so content injected *after* it ran can still be
   revealed — see revealNewContent() below. */
let _reveal = null;

export function initScrollReveal() {
  const targets = Array.from(document.querySelectorAll('[data-animate]'));
  if (!targets.length) return;

  const showNow = (el) => el.classList.add('visible');

  /* `data-delay` is baked per index by generate-cards (i * 70), which is a
     pleasant stagger for the three cards on the homepage and a pathology on
     publications.html, where the 37th paper carries delay="2520". Scroll to
     the bottom there and the last rows are blank for two and a half seconds
     after they are already on screen — indistinguishable from content that
     failed to load. The stagger only ever needs to read as "these arrived
     together", so cap it. */
  const MAX_DELAY = 320;
  const delayOf = (el) => Math.min(parseInt(el.dataset.delay || '0', 10) || 0, MAX_DELAY);

  /* No observer support, or the visitor asked for less motion: the entrance
     is the expendable part, the content is not. Show everything at once. */
  if (typeof IntersectionObserver !== 'function' || prefersReducedMotion()) {
    targets.forEach(showNow);
    _reveal = null;   /* revealNewContent() will show new nodes outright */
    return;
  }

  const pending = new Set(targets);

  const reveal = (el, delay) => {
    if (!pending.delete(el)) return;
    observer.unobserve(el);
    if (delay > 0) setTimeout(() => showNow(el), delay);
    else showNow(el);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      reveal(entry.target, delayOf(entry.target));
    });
  }, { threshold: 0, rootMargin: '0px 0px -60px 0px' });

  targets.forEach(el => observer.observe(el));

  /* The safety net. Reveal anything whose top has reached the viewport
     bottom, regardless of what the observer did or did not report. Elements
     already above the viewport get no delay — they are scrolled past, so
     staggering them in would only be a flicker. */
  const sweep = () => {
    if (!pending.size) { detach(); return; }
    const h = (typeof window !== 'undefined' && window.innerHeight) || 0;
    for (const el of Array.from(pending)) {
      /* An element with no geometry to read cannot be judged; leave it to the
         observer rather than guessing it into view. */
      if (typeof el.getBoundingClientRect !== 'function') continue;
      const rect = el.getBoundingClientRect();
      if (rect.top >= h) continue;
      reveal(el, rect.bottom <= 0 ? 0 : delayOf(el));
    }
    if (!pending.size) detach();
  };

  const onSweep = rafThrottle(sweep);
  const attached = [];
  const listen = (target, type, fn, opts) => {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    attached.push([target, type, fn, opts]);
  };
  const detach = () => {
    while (attached.length) {
      const [t, type, fn, opts] = attached.pop();
      t.removeEventListener(type, fn, opts);
    }
  };

  const win = typeof window !== 'undefined' ? window : null;
  listen(win, 'scroll', onSweep, { passive: true });
  listen(win, 'resize', onSweep, { passive: true });
  /* An in-page anchor jumps without scrolling, so no scroll event follows. */
  listen(win, 'hashchange', onSweep);
  /* Late-loading images and fonts reflow the page under already-observed
     elements; `load` is the last point at which geometry settles. */
  listen(win, 'load', onSweep);

  /* Listeners are removed once nothing is pending; if new content arrives
     later there is something to sweep for again. */
  const attachSweepListeners = () => {
    if (attached.length) return;
    listen(win, 'scroll', onSweep, { passive: true });
    listen(win, 'resize', onSweep, { passive: true });
    listen(win, 'hashchange', onSweep);
    listen(win, 'load', onSweep);
  };

  _reveal = (els) => {
    let added = false;
    for (const el of els) {
      if (el.classList && el.classList.contains('visible')) continue;
      pending.add(el);
      observer.observe(el);
      added = true;
    }
    if (!added) return;
    attachSweepListeners();
    sweep();
  };

  sweep();

  return () => { observer.disconnect(); detach(); _reveal = null; };
}

/* Reveal (or schedule the reveal of) `[data-animate]` elements added to the
   page after initScrollReveal() already collected its targets.

   This is not hypothetical. Moving the data modules behind dynamic imports
   made every renderer asynchronous, so renderProjects() and friends now
   replace their container's innerHTML *after* the reveal has run. The nodes
   they create carry data-animate — which CSS puts at opacity 0 — and nothing
   was observing them, so all fourteen project cards and all thirty-seven
   publications rendered as an empty band, permanently and silently. The
   browser suite caught it; nothing in the static suite could have.

   With no active reveal (reduced motion, no IntersectionObserver, or teardown
   already run) the elements are shown outright. That is the same trade the
   rest of this module makes: the entrance is expendable, the content is not. */
export function revealNewContent(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const els = Array.from(root.querySelectorAll('[data-animate]'));
  if (!els.length) return;
  if (typeof _reveal !== 'function') {
    els.forEach((el) => el.classList && el.classList.add('visible'));
    return;
  }
  _reveal(els);
}

/* The hero parallax used to live here as initScroll3D(): a scroll listener, a
   rAF, a read of window.scrollY and #hero.offsetHeight per frame, and a
   `ready` flag that held everything back for 1.4 s because it wrote the same
   `transform` property the hero's entrance animation was still using.

   It is now a scroll-progress timeline on .hero-content in css/styles.css,
   which is a better fit in every direction: it runs off the main thread, it
   animates `translate` so it composes with the entrance instead of racing it,
   and `prefers-reduced-motion` is expressed as a media query rather than a
   branch. It also no longer skips coarse pointers — that guard existed to
   avoid scroll jank on phones, and a compositor-driven animation has none to
   avoid.

   Nothing replaced it in this module; the note is here so the next person
   looking for the parallax finds where it went. */

