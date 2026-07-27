/* ═══════════════════════════════════════════════════════════
   ANIMATIONS — scroll-driven effects, card tilt, parallax,
   skill bars, timeline entrance.

   Pure DOM / Canvas API — no Three.js dependency.
   ═══════════════════════════════════════════════════════════ */
import { prefersReducedMotion, rafThrottle } from './utils.js';

/* ═══════════════════════════════════════════════════════════
   SCROLL-TRIGGERED REVEAL
   ═══════════════════════════════════════════════════════════ */
export function initScrollReveal() {
  const targets = document.querySelectorAll('[data-animate]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('visible'), delay);
      observer.unobserve(el);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  targets.forEach(el => observer.observe(el));

  return () => observer.disconnect();
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

/* ═══════════════════════════════════════════════════════════
   SKILL BAR FILL ANIMATION
   Triggers the CSS width transition on .skill-bar-fill when
   the bar enters the viewport (IntersectionObserver).
   ═══════════════════════════════════════════════════════════ */
export function initSkillBars() {
  if (typeof document === 'undefined') return;
  const bars = Array.from(document.querySelectorAll('.skill-bar-fill'));
  if (!bars.length) return;

  if (prefersReducedMotion()) {
    /* Show instantly for reduced-motion users */
    bars.forEach(b => b.classList.add('animated'));
    return;
  }

  if (typeof IntersectionObserver === 'undefined') {
    bars.forEach(b => b.classList.add('animated'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('animated');
      io.unobserve(e.target);
    });
  }, { threshold: 0.3 });

  bars.forEach(bar => io.observe(bar));

  return () => io.disconnect();
}

/* ═══════════════════════════════════════════════════════════
   TIMELINE ENTRANCE ANIMATION
   Staggered opacity fade-in as entries scroll into view.
   The old scroll-driven rotateX has been removed — it shared
   a perspective context between both columns, which caused
   hover repaints to trigger cross-column z-fighting flicker.
   Per-card hover flipping is handled entirely in CSS now.
   ═══════════════════════════════════════════════════════════ */
export function initTimelineScroll3D() {
  if (typeof document === 'undefined') return;

  const stage = document.getElementById('timeline-stage');
  if (!stage) return;

  const entries = Array.from(stage.querySelectorAll('.tl-entry'));
  if (!entries.length) return;

  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;

  const io = new IntersectionObserver((obs) => {
    obs.forEach(ob => {
      if (!ob.isIntersecting) return;
      const el    = ob.target;
      const delay = (entries.indexOf(el) % 4) * 70;
      setTimeout(() => {
        el.style.transition = 'opacity 600ms var(--ease)';
        el.style.opacity    = '1';
      }, delay);
      io.unobserve(el);
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -30px 0px' });

  entries.forEach(el => {
    el.style.opacity = '0';
    io.observe(el);
  });

  return () => io.disconnect();
}
