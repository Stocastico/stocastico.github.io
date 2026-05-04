/* ═══════════════════════════════════════════════════════════
   ANIMATIONS — scroll-driven effects, card tilt, magnetic
   buttons, parallax, skill bars, timeline entrance.

   Pure DOM / Canvas API — no Three.js dependency.
   ═══════════════════════════════════════════════════════════ */
import { prefersReducedMotion } from './utils.js';

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

  Array.from(document.querySelectorAll('.research-card, .project-card, .contact-card, .skill-group, .pub-item'))
    .forEach((card) => {
      let targetRX = 0, targetRY = 0, targetZ = 0;
      let currentRX = 0, currentRY = 0, currentZ = 0;
      let raf = null;
      let isHovered = false;

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

      card.addEventListener('mouseenter', () => {
        if (card.classList.contains('is-flipped')) return;
        isHovered = true;
        targetZ   = 8;
        /* Suppress the CSS transform-transition while the spring runs */
        card.style.transition = `border-color var(--t-med), background var(--t-med), box-shadow var(--t-med)`;
        if (!raf) raf = requestAnimationFrame(loop);
      });

      card.addEventListener('mousemove', (e) => {
        if (card.classList.contains('is-flipped')) return;
        const r  = card.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width;
        const cy = (e.clientY - r.top) / r.height;
        targetRY =  (cx - 0.5) * MAX_RY * 2;
        targetRX = -(cy - 0.5) * MAX_RX * 2;
        card.style.setProperty('--gloss-x', `${(cx * 100).toFixed(1)}%`);
        card.style.setProperty('--gloss-y', `${(cy * 100).toFixed(1)}%`);
      });

      card.addEventListener('mouseleave', () => {
        isHovered = false;
        targetRX = 0;
        targetRY = 0;
        targetZ  = 0;
        card.style.setProperty('--gloss-x', '50%');
        card.style.setProperty('--gloss-y', '50%');
        if (!raf) raf = requestAnimationFrame(loop);
      });
    });
}

/* ═══════════════════════════════════════════════════════════
   RESEARCH CARD FLIP (click to reveal back face)
   ═══════════════════════════════════════════════════════════ */
export function initCardFlip() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#research-grid .research-card').forEach((card) => {
    card.addEventListener('click', () => {
      const flipping = card.classList.toggle('is-flipped');
      /* Reset tilt state so the card springs back to neutral when flipped */
      if (flipping) {
        card.style.transform = '';
        card.style.transition = '';
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   MAGNETIC BUTTONS
   ═══════════════════════════════════════════════════════════ */
export function initMagneticButtons() {
  if (prefersReducedMotion()) return;
  if (typeof window === 'undefined') return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return;

  const RADIUS   = 80;   /* px — proximity trigger distance */
  const RADIUS_2 = RADIUS * RADIUS;  /* compare squared — avoids sqrt */
  const STRENGTH = 0.35; /* fraction of offset to apply     */
  const SPRING   = 0.14; /* lerp factor per frame           */

  const magnets = Array.from(
    document.querySelectorAll('.btn-primary, .btn-ghost, .social-btn')
  ).map(el => ({ el, tx: 0, ty: 0, cx: 0, cy: 0, active: false, raf: null, cxRect: 0, cyRect: 0 }));

  const heroActions = document.querySelector('.hero-actions');
  const filteredMagnets = magnets.filter((m) => !heroActions?.contains(m.el));

  if (!filteredMagnets.length) return;

  /* Cache the centre of each magnet — getBoundingClientRect() is one of the
     most layout-thrashing DOM reads, and the previous implementation called
     it once per magnet on every mousemove (~360 layouts/sec for 6 magnets at
     60Hz). We refresh on resize, scroll, and after the spring resets the
     transform — that covers every case where the centre actually moves. */
  let _rectsValid = false;
  function refreshRects() {
    for (const m of filteredMagnets) {
      /* Skip while the spring transform is non-zero — it would offset the rect
         and we'd capture a moving centre. */
      if (m.cx !== 0 || m.cy !== 0 || m.active) continue;
      const r = m.el.getBoundingClientRect();
      m.cxRect = r.left + r.width  / 2;
      m.cyRect = r.top  + r.height / 2;
    }
    _rectsValid = true;
  }
  const _invalidate = () => { _rectsValid = false; };

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', _invalidate, { passive: true });
    window.addEventListener('scroll', _invalidate, { passive: true });
  }

  function tick(m) {
    m.cx += (m.tx - m.cx) * SPRING;
    m.cy += (m.ty - m.cy) * SPRING;
    const done = !m.active && Math.abs(m.tx - m.cx) < 0.05 && Math.abs(m.ty - m.cy) < 0.05;
    if (done) {
      m.cx = 0; m.cy = 0;
      m.el.style.transform = '';
      m.raf = null;
    } else {
      m.el.style.transform = `translate(${m.cx.toFixed(2)}px,${m.cy.toFixed(2)}px)`;
      m.raf = requestAnimationFrame(() => tick(m));
    }
  }

  /* Coalesce mousemove bursts onto one rAF tick. */
  let _lastEvent = null;
  let _scheduled = false;
  const _raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => { cb(); return 0; };

  function process() {
    _scheduled = false;
    const e = _lastEvent;
    if (!e) return;
    if (!_rectsValid) refreshRects();
    const ex = e.clientX, ey = e.clientY;
    for (let i = 0; i < filteredMagnets.length; i++) {
      const m = filteredMagnets[i];
      const dx = ex - m.cxRect;
      const dy = ey - m.cyRect;
      const d2 = dx * dx + dy * dy;
      if (d2 < RADIUS_2) {
        m.active = true;
        m.tx = dx * STRENGTH;
        m.ty = dy * STRENGTH;
        if (!m.raf) m.raf = requestAnimationFrame(() => tick(m));
      } else if (m.active) {
        m.active = false;
        m.tx = 0;
        m.ty = 0;
        if (!m.raf) m.raf = requestAnimationFrame(() => tick(m));
      }
    }
  }

  document.addEventListener('mousemove', (e) => {
    _lastEvent = e;
    if (_scheduled) return;
    _scheduled = true;
    _raf(process);
  }, { passive: true });
}

/* ═══════════════════════════════════════════════════════════
   SCROLL-DRIVEN 3-D TRANSFORMS
   ═══════════════════════════════════════════════════════════ */
export function initScroll3D() {
  if (prefersReducedMotion()) return;
  if (typeof document === 'undefined') return;

  /* Research cards now use a horizontal carousel with translateX entrance,
     so the old rotateY entrance angles are no longer needed. */

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

  window.addEventListener('scroll', () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  }, { passive: true });

  update(); /* initial — scrollY is 0 so transforms are no-ops */
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
}
