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
    /* Expose the click-to-flip as a keyboard-operable control so keyboard and
       screen-reader users can reach the back face (which holds links found
       nowhere else). The back face is visibility:hidden until flipped, so its
       links only enter the tab order once the card is expanded. */
    const title = card.querySelector('.card-title')?.textContent?.trim();
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');
    if (title) card.setAttribute('aria-label', `${title} — show details`);

    const toggle = () => {
      const flipping = card.classList.toggle('is-flipped');
      card.setAttribute('aria-expanded', flipping ? 'true' : 'false');
      /* Reset tilt state so the card springs back to neutral when flipped */
      if (flipping) {
        card.style.transform = '';
        card.style.transition = '';
      }
    };

    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggle();
      }
    });
  });
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
