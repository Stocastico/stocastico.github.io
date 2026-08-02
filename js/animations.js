/* ═══════════════════════════════════════════════════════════
   ANIMATIONS — scroll-driven effects, card tilt, parallax,
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

/* ═══════════════════════════════════════════════════════════
   3-D CARD TILT + SPECULAR GLOSS
   ═══════════════════════════════════════════════════════════ */
export function initCardTilt() {
  if (prefersReducedMotion()) return;
  if (typeof window === 'undefined') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return;

  const MAX_RX = 10;   /* max degrees rotateX */
  const MAX_RY = 12;   /* max degrees rotateY */
  const SPRING  = 0.10; /* lerp factor per frame */

  const teardowns = [];

  Array.from(document.querySelectorAll('.research-card, .project-card, .contact-card, .pub-item'))
    .forEach((card) => {
      let targetRX = 0, targetRY = 0, targetZ = 0;
      let currentRX = 0, currentRY = 0, currentZ = 0;
      let raf = null;
      let isHovered = false;
      let rect = null;   /* cached on mouseenter — avoids a layout read per mousemove */

      card.style.setProperty('--gloss-x', '50%');
      card.style.setProperty('--gloss-y', '50%');
      card.classList.add('tilt-ready');

      function loop() {
        currentRX += (targetRX - currentRX) * SPRING;
        currentRY += (targetRY - currentRY) * SPRING;
        currentZ  += (targetZ  - currentZ)  * SPRING;

        card.style.transform = `perspective(900px) rotateX(${currentRX.toFixed(3)}deg) rotateY(${currentRY.toFixed(3)}deg) translateZ(${currentZ.toFixed(2)}px)`;

        const done = !isHovered
          && Math.abs(targetRX - currentRX) < 0.05
          && Math.abs(targetRY - currentRY) < 0.05
          && Math.abs(targetZ  - currentZ)  < 0.1;

        if (done) {
          raf = null;
          card.style.transform  = '';
          card.style.transition = '';  /* restore CSS transitions (needed for 3D entrance) */
          return;
        }
        raf = requestAnimationFrame(loop);
      }

      const onEnter = () => {
        if (card.classList.contains('is-flipped')) return;
        isHovered = true;
        targetZ   = 8;
        /* Cache the (pre-transform) rect once per hover — the card box doesn't
           move while hovered, so re-reading it on every mousemove would only
           thrash layout. */
        rect = card.getBoundingClientRect();
        /* Suppress the CSS transform-transition while the spring runs */
        card.style.transition = `border-color var(--t-med), background var(--t-med), box-shadow var(--t-med)`;
        if (!raf) raf = requestAnimationFrame(loop);
      };

      const onMove = (e) => {
        if (card.classList.contains('is-flipped')) return;
        const r  = rect || (rect = card.getBoundingClientRect());
        const cx = (e.clientX - r.left) / r.width;
        const cy = (e.clientY - r.top) / r.height;
        targetRY =  (cx - 0.5) * MAX_RY * 2;
        targetRX = -(cy - 0.5) * MAX_RX * 2;
        card.style.setProperty('--gloss-x', `${(cx * 100).toFixed(1)}%`);
        card.style.setProperty('--gloss-y', `${(cy * 100).toFixed(1)}%`);
      };

      const onLeave = () => {
        isHovered = false;
        rect = null;
        targetRX = 0;
        targetRY = 0;
        targetZ  = 0;
        card.style.setProperty('--gloss-x', '50%');
        card.style.setProperty('--gloss-y', '50%');
        if (!raf) raf = requestAnimationFrame(loop);
      };

      card.addEventListener('mouseenter', onEnter);
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);

      teardowns.push(() => {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        card.removeEventListener('mouseenter', onEnter);
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
      });
    });

  /* Returned so page teardown (pagehide / bfcache) can drop every pointer
     listener and cancel any in-flight spring loop in one call. */
  return () => teardowns.forEach(fn => fn());
}

/* ═══════════════════════════════════════════════════════════
   SCROLL-DRIVEN 3-D TRANSFORMS
   ═══════════════════════════════════════════════════════════ */
export function initScroll3D() {
  if (prefersReducedMotion()) return;
  if (typeof document === 'undefined') return;

  /* Hero parallax — skip on touch devices to prevent scroll jank on mobile */
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(pointer: coarse)').matches) return;

  const heroContent = document.querySelector('.hero-content');
  const heroSection = document.getElementById('hero');

  /* Wait for the hero entrance animation to finish before taking over transforms */
  let ready = false;
  if (heroContent) {
    heroContent.addEventListener('animationend', () => { ready = true; }, { once: true });
    setTimeout(() => { ready = true; }, 1400); /* fallback */
  } else {
    ready = true;
  }

  let rafId = null;

  function update() {
    rafId = null;
    if (!ready) return;
    const scrollY = window.scrollY;
    const heroH   = heroSection ? heroSection.offsetHeight : 0;

    /* Apply parallax only while the hero section is still in or near view.
       Orb parallax removed — orbs are now static for battery savings. */
    if (scrollY < heroH * 1.1) {
      if (heroContent) heroContent.style.transform = `translateY(${scrollY * 0.28}px)`;
    }
  }

  const onScroll = () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  update(); /* initial — scrollY is 0 so transforms are no-ops */

  /* Returned so page teardown (pagehide / bfcache) can drop the scroll
     listener and cancel any pending parallax frame. */
  return () => {
    window.removeEventListener('scroll', onScroll);
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  };
}

