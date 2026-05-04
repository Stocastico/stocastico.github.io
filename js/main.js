/* ============================================================
   PERSONAL WEBSITE — Stefano Masneri
   main.js
   ============================================================
   This file contains only behaviour and animation logic.
   Content lives in separate, easy-to-edit files:

     index.html           — static sections (hero, about, research,
                            skills, contact, navigation, footer)
     data/locations.js    — 3D globe pins, trips, regions
     data/publications.js — selected papers  (PUBLICATIONS array)
     data/projects.js     — projects         (PROJECTS array)

   To change neural-network colours, adjust the ACCENT_* /
   CYAN_* constants inside the NeuralNetwork class below.
   ============================================================ */

/* ─── Three.js test mocking helpers ────────────────────────────
   Re-exported from three-context.js so tests can swap THREE for a
   minimal mock; every consumer module that uses Three.js subscribes
   to the swap via the context. */
export { __setThreeForTests, __resetThreeForTests } from './three-context.js';

/* ─── Data files (side-effect imports: each file sets globalThis.X) ───
   We import for the side-effect of populating globalThis so the
   existing bare references in this module (e.g. `LOCATIONS`,
   `CV_CAREER`, `PUBLICATIONS`, `PROJECTS`) resolve via the global
   scope. This keeps the test mocking pattern (`global.X = mock`)
   working while still letting Vite tree-shake the bundle. */
import '../data/locations.js';
import '../data/publications.js';
import '../data/projects.js';
import '../data/cv.js';
import './europe-map.js';

/* Shared environment helpers */
import { getTopoJSON, isLowPowerDevice, prefersReducedMotion, hasWebGLSupport } from './utils.js';

/* Hero neural-network animation (extracted module) */
import { NeuralNetwork, NeuralNetwork2D } from './neural-net.js';

/* Hero name iridescent WebGL shader (extracted module) */
import { HeroNameShader } from './hero-shader.js';

/* 3D Globe + 2D fallback + geocoding (extracted module) */
import { geocodeLocations, Globe3D, GlobeFallback2D } from './globe.js';

/* DOM animations: scroll-driven, card tilt, magnetic buttons, parallax (extracted) */
import {
  initScrollReveal,
  initCardTilt,
  initCardFlip,
  initMagneticButtons,
  initScroll3D,
  initSkillBars,
  initTimelineScroll3D,
} from './animations.js';

/* ═══════════════════════════════════════════════════════════
   ANIMATED STAT COUNTERS
   ═══════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  if (!counters.length) return;

  /* The HTML ships with the real value already in textContent so search
     crawlers see it.  Once JS takes over, reset to 0 so the count-up
     animation has somewhere to start from. */
  counters.forEach((el) => { el.textContent = '0'; });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const end = parseInt(el.dataset.count, 10);
      animateCounter(el, end);
      observer.unobserve(el);
    });
  }, { threshold: 0.6 });

  counters.forEach(el => observer.observe(el));
}

function animateCounter(el, target) {
  const duration = 1800;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    /* Ease-out cubic */
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR SCROLL BEHAVIOUR
   ═══════════════════════════════════════════════════════════ */
function initTheme() {
  /* Theme switching intentionally disabled: dark mode is fixed. */
}

/* rAF-throttling helper. In Node tests there is no requestAnimationFrame,
   so we fall back to a synchronous pass-through — keeps existing tests
   that call the captured scroll handler synchronously working unchanged,
   while in real browsers it coalesces bursts of scroll events into one
   layout/paint per frame. */
function _rafThrottle(fn) {
  let scheduled = false;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb) => { cb(); return 0; };
  return (...args) => {
    if (scheduled) return;
    scheduled = true;
    raf(() => { scheduled = false; fn(...args); });
  };
}

function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const progressBar = document.getElementById('reading-progress');

  /* ── Project page: highlight "Projects" nav link ────────── */
  const isProjectPage = typeof window !== 'undefined' && window.location?.pathname?.includes('/projects/');
  if (isProjectPage) {
    const projectLink = document.querySelector('#nav-links a[href*="#projects"]');
    if (projectLink) projectLink.setAttribute('aria-current', 'true');
  }

  const links = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('#nav-links a[href^="#"]'))
    : [];
  const targets = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  /* ── Section tracking with IntersectionObserver ────────── */
  let activeId = targets[0]?.id || '';
  const setActiveLink = () => {
    links.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${activeId}`;
      const cur = link.getAttribute('aria-current');
      const next = isActive ? 'true' : 'false';
      if (cur !== next) link.setAttribute('aria-current', next);
    });
  };

  if (targets.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          activeId = entry.target.id;
          setActiveLink();
        }
      });
    }, { rootMargin: '-35% 0px -65% 0px' });
    targets.forEach((t) => observer.observe(t));
  } else if (targets.length) {
    /* Fallback for browsers without IntersectionObserver */
    window.addEventListener('scroll', _rafThrottle(() => {
      const checkpoint = window.scrollY + (window.innerHeight * 0.35);
      targets.forEach((section) => {
        if (checkpoint >= section.offsetTop) activeId = section.id;
      });
      setActiveLink();
    }), { passive: true });
  }

  /* Cache docHeight — reading scrollHeight per scroll event forces a
     synchronous layout flush. Recompute on resize and when content height
     changes (font load, image load, dynamic injection). */
  let _cachedDocHeight = 0;
  const _recomputeDocHeight = () => {
    const root = document?.documentElement;
    const inner = (typeof window !== 'undefined' && typeof window.innerHeight === 'number') ? window.innerHeight : 0;
    _cachedDocHeight = (root && typeof root.scrollHeight === 'number')
      ? Math.max(0, root.scrollHeight - inner)
      : 0;
  };
  _recomputeDocHeight();

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', _recomputeDocHeight, { passive: true });
    window.addEventListener('load', _recomputeDocHeight, { passive: true });
  }
  if (typeof ResizeObserver !== 'undefined' && document?.body) {
    /* Catch dynamic content height changes (image loads, late renders) */
    new ResizeObserver(_recomputeDocHeight).observe(document.body);
  }

  let _lastPct = -1;
  const updateReadingProgress = () => {
    if (!progressBar) return;
    const pct = _cachedDocHeight > 0
      ? Math.min(1, (window.scrollY / _cachedDocHeight))
      : 0;
    /* Skip DOM writes when the rounded value hasn't changed (within 0.1%) */
    const rounded = Math.round(pct * 1000) / 1000;
    if (rounded === _lastPct) return;
    _lastPct = rounded;
    /* transform: scaleX is composited on the GPU — avoids layout/paint */
    progressBar.style.transform = `scaleX(${rounded})`;
  };

  let _lastScrolled = false;
  const onScroll = _rafThrottle(() => {
    const y = window.scrollY;
    const scrolled = y > 20;
    if (scrolled !== _lastScrolled) {
      _lastScrolled = scrolled;
      nav.classList.toggle('scrolled', scrolled);
    }
    updateReadingProgress();
  });

  window.addEventListener('scroll', onScroll, { passive: true });

  setActiveLink();
  updateReadingProgress();
}

/* ═══════════════════════════════════════════════════════════
   BACK TO TOP BUTTON
   ═══════════════════════════════════════════════════════════ */
function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  let _lastVisible = false;
  window.addEventListener('scroll', _rafThrottle(() => {
    const visible = window.scrollY > window.innerHeight * 0.6;
    if (visible !== _lastVisible) {
      _lastVisible = visible;
      btn.classList.toggle('visible', visible);
    }
  }), { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ═══════════════════════════════════════════════════════════
   TOAST NOTIFICATION
   ═══════════════════════════════════════════════════════════ */
function showToast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('visible'), 2500);
}

/* ═══════════════════════════════════════════════════════════
   COMMAND PALETTE  (⌘K / Ctrl+K)
   ═══════════════════════════════════════════════════════════ */
function initCommandPalette() {
  const overlay  = document.getElementById('cmd-overlay');
  const input    = document.getElementById('cmd-input');
  const listEl   = document.getElementById('cmd-list');
  if (!overlay || !input || !listEl) return;

  /* ── Command definitions ───────────────────────────────── */
  const SECTIONS = [
    { id: 'about',        label: 'About',        hint: 'Who I am' },
    { id: 'research',     label: 'Research',      hint: 'What I work on' },
    { id: 'publications', label: 'Publications',  hint: 'Selected papers' },
    { id: 'cv',           label: 'CV',            hint: 'Experience & Education', href: 'cv.html' },
    { id: 'skills',       label: 'Skills',        hint: 'Expertise' },
    { id: 'projects',     label: 'Projects',      hint: 'Things I\u2019ve built', href: 'projects.html' },
    { id: 'places',       label: 'Places',        hint: 'Where I\u2019ve been' },
    { id: 'contact',      label: 'Contact',       hint: 'Get in touch' },
  ];

  const ACTIONS = [
    {
      label: 'Open CV PDF',
      hint: 'Download / view',
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v12M8 12l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      action() { window.open('docs/cv.pdf', '_blank'); },
    },
    {
      label: 'Copy email address',
      hint: 'To clipboard',
      icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 16V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      action() {
        const email = document.querySelector('a[href^="mailto:"]')?.getAttribute('href')?.replace('mailto:', '') || '';
        if (email && email !== 'your.email@example.com') {
          navigator.clipboard?.writeText(email).then(() => showToast('Email copied!')).catch(() => {});
        }
      },
    },
    {
      label: 'LinkedIn profile',
      hint: 'Open in new tab',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 0H5C2.24 0 0 2.24 0 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5V5c0-2.76-2.24-5-5-5zM8 19H5V8h3v11zM6.5 6.73a1.77 1.77 0 1 1 0-3.54 1.77 1.77 0 0 1 0 3.54zM20 19h-3v-5.6c0-3.37-4-3.12-4 0V19h-3V8h3v1.77C14.4 7.22 20 7.03 20 12.41V19z"/></svg>`,
      action() { window.open('https://www.linkedin.com/in/stefanomasneri/', '_blank'); },
    },
    {
      label: 'Google Scholar',
      hint: 'Open in new tab',
      icon: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zm-1 12.99L5 12.4V15l6 3.35L17 15v-2.61l-6 3.6z"/></svg>`,
      action() { window.open('https://scholar.google.com/citations?user=AvJA648AAAAJ&hl=en', '_blank'); },
    },
  ];

  const navIcon = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

  /* ── Build all command items ────────────────────────────── */
  let allItems = [
    ...SECTIONS.map(s => ({
      label: s.label,
      hint: s.hint,
      icon: navIcon,
      action() {
        if (s.href) {
          window.location.href = s.href;
        } else {
          const el = document.getElementById(s.id);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      },
      group: 'Navigate',
    })),
    ...ACTIONS.map(a => ({ ...a, group: 'Actions' })),
  ];

  let filtered = allItems;
  let activeIdx = 0;

  /* ── Render list ────────────────────────────────────────── */
  function render(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'cmd-item';
      li.style.color = 'var(--text-faint)';
      li.textContent = 'No results';
      listEl.appendChild(li);
      return;
    }

    let lastGroup = null;
    items.forEach((item, i) => {
      if (item.group !== lastGroup) {
        const label = document.createElement('li');
        label.className = 'cmd-group-label';
        label.setAttribute('role', 'presentation');
        label.textContent = item.group;
        listEl.appendChild(label);
        lastGroup = item.group;
      }
      const li = document.createElement('li');
      li.className = 'cmd-item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === activeIdx));
      li.innerHTML = `
        <span class="cmd-item-icon">${item.icon}</span>
        <span class="cmd-item-label">${item.label}</span>
        <span class="cmd-item-hint">${item.hint || ''}</span>
      `;
      li.addEventListener('mouseenter', () => { activeIdx = i; render(filtered); });
      li.addEventListener('click', () => { execute(item); });
      listEl.appendChild(li);
    });
  }

  /* ── Execute & close ────────────────────────────────────── */
  function execute(item) {
    close();
    item.action();
  }

  /* ── Filter on input ────────────────────────────────────── */
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    filtered = q
      ? allItems.filter(it => it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q))
      : allItems;
    activeIdx = 0;
    render(filtered);
  });

  /* ── Keyboard navigation ────────────────────────────────── */
  input.addEventListener('keydown', (e) => {
    const visibleItems = filtered.filter(Boolean); /* same array */
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, visibleItems.length - 1);
      render(visibleItems);
      listEl.querySelectorAll('.cmd-item')[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      render(visibleItems);
      listEl.querySelectorAll('.cmd-item')[activeIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visibleItems[activeIdx]) execute(visibleItems[activeIdx]);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  /* ── Open / close ───────────────────────────────────────── */
  function open() {
    filtered = allItems;
    activeIdx = 0;
    input.value = '';
    render(filtered);
    overlay.hidden = false;
    requestAnimationFrame(() => input.focus());
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }

  /* Close on overlay click */
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  /* Global keyboard shortcut — ⌘K or Ctrl+K */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.hidden ? open() : close();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   SIDE PROGRESS DOTS
   ═══════════════════════════════════════════════════════════ */
function initSideDots() {
  const nav = document.getElementById('side-dots');
  if (!nav) return;

  /* Only activate on fine-pointer (mouse) viewports — CSS hides on coarse/narrow */
  if (!window.matchMedia('(pointer: fine) and (min-width: 901px)').matches) return;

  const sections = Array.from(
    document.querySelectorAll('section[id], div[id="hero"]')
  ).filter(s => s.id);

  if (!sections.length) return;

  /* Build dots */
  sections.forEach(section => {
    const label = section.getAttribute('aria-label') || section.id;
    const btn = document.createElement('button');
    btn.className = 'side-dot';
    btn.dataset.label = label.charAt(0).toUpperCase() + label.slice(1);
    btn.setAttribute('aria-label', `Go to ${label}`);
    btn.setAttribute('aria-current', 'false');
    btn.addEventListener('click', () => {
      section.scrollIntoView({ behavior: 'smooth' });
    });
    nav.appendChild(btn);
  });

  const dots = Array.from(nav.querySelectorAll('.side-dot'));

  /* ── Active-dot tracking with IntersectionObserver ──
     Each section reports its intersection with a horizontal slab anchored
     at 50% viewport height. The deepest still-intersecting section wins.
     This replaces a scroll handler that called getBoundingClientRect()
     for every section on every scroll event (N forced layouts per scroll). */
  const intersecting = new Set();
  let activeIdx = 0;
  const setActiveDot = (idx) => {
    if (idx === activeIdx) return;
    activeIdx = idx;
    for (let i = 0; i < dots.length; i++) {
      const want = String(i === idx);
      if (dots[i].getAttribute('aria-current') !== want) {
        dots[i].setAttribute('aria-current', want);
      }
    }
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      }
      /* Pick the last (deepest) section still intersecting. */
      let last = 0;
      for (let i = 0; i < sections.length; i++) {
        if (intersecting.has(sections[i])) last = i;
      }
      setActiveDot(last);
    }, { rootMargin: '-50% 0px -50% 0px' });
    sections.forEach((s) => io.observe(s));
  }

  /* Show nav after scrolling past the hero — uses a single sentinel
     IntersectionObserver instead of a per-scroll classList toggle. */
  const heroEl = sections[0];
  if (heroEl && 'IntersectionObserver' in window) {
    const heroIo = new IntersectionObserver(([entry]) => {
      /* Visible when hero is mostly out of view. */
      const out = !entry.isIntersecting;
      if (out !== nav.classList.contains('visible')) {
        nav.classList.toggle('visible', out);
      }
    }, { rootMargin: '-50% 0px 0px 0px' });
    heroIo.observe(heroEl);
  }
}

/* ═══════════════════════════════════════════════════════════
   STAGGERED HERO TAGLINE REVEAL
   ═══════════════════════════════════════════════════════════ */
function initTaglineReveal() {
  if (prefersReducedMotion()) return;
  const tagline = document.querySelector('.hero-tagline');
  if (!tagline) return;

  /* Split on the · separator, then further split each phrase into words */
  const text = tagline.textContent.trim();
  const parts = text.split('·');
  let delay = 120; /* ms — start after a brief pause */
  const STEP = 40;  /* ms per word */

  const spans = [];
  parts.forEach((phrase, partIdx) => {
    const words = phrase.trim().split(/\s+/).filter(Boolean);
    words.forEach(word => {
      spans.push(`<span class="tagline-word" style="animation-delay:${delay}ms">${word}</span>`);
      delay += STEP;
    });
    if (partIdx < parts.length - 1) {
      spans.push(`<span class="tagline-sep" style="animation-delay:${delay}ms">·</span>`);
      delay += STEP;
    }
  });

  tagline.innerHTML = spans.join(' ');
}

/* ═══════════════════════════════════════════════════════════
   CURSOR GLOW — disabled for performance
   The body::after radial gradient forced full-page repaints
   on every mousemove. CSS rule also removed.
   ═══════════════════════════════════════════════════════════ */
function initCursorGlow() {
  /* intentionally empty — effect removed to save battery */
}

/* ═══════════════════════════════════════════════════════════
   MOBILE MENU TOGGLE
   ═══════════════════════════════════════════════════════════ */
function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  const setMenuState = (open) => {
    toggle.classList.toggle('open', open);
    links.classList.toggle('open', open);
    document.body?.classList?.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open);
  };

  toggle.addEventListener('click', () => setMenuState(!toggle.classList.contains('open')));

  /* Close on link click */
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => setMenuState(false));
  });

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.classList.contains('open')) setMenuState(false);

      /* Focus trapping when mobile menu is open */
      if (e.key === 'Tab' && toggle.classList.contains('open')) {
        const focusable = [toggle, ...links.querySelectorAll('a')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!toggle.classList.contains('open')) return;
      if (toggle.contains?.(e.target) || links.contains?.(e.target)) return;
      setMenuState(false);
    });
  }
}

/* ═══════════════════════════════════════════════════════════
   DYNAMIC CONTENT RENDERERS
   Publications and projects are the only sections rendered
   by JS — their data lives in data/publications.js and
   data/projects.js respectively.
   ═══════════════════════════════════════════════════════════ */

/* Format YYYY-MM-DD without timezone shifts in local browsers */
function formatIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const utcDate = new Date(Date.UTC(y, mo - 1, d));
  return utcDate.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function escapeHtml(raw) {
  return String(raw ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeBase64(raw) {
  try {
    return atob(raw || '');
  } catch (_) {
    return '';
  }
}

function getObfuscatedContactEmail() {
  const card = document.querySelector('.contact-email-obfuscated');
  if (!card) return '';
  const user = decodeBase64(card.dataset.emailUser || '');
  const domain = decodeBase64(card.dataset.emailDomain || '');
  if (!user || !domain) return '';
  return `${user}@${domain}`;
}

function initEmailObfuscation() {
  const card = document.querySelector('.contact-email-obfuscated');
  if (!card) return;
  const valueEl = card.querySelector('.contact-value');
  const email = getObfuscatedContactEmail();
  if (!email) return;

  /* Show the email text immediately (CSS blur hides it visually) */
  if (valueEl) valueEl.textContent = email;

  const revealEmail = () => {
    card.dataset.emailRevealed = 'true';
    card.setAttribute('href', `mailto:${email}`);
    card.setAttribute('aria-label', `Send email to ${email}`);
  };

  card.addEventListener('mouseenter', () => {
    if (card.dataset.emailRevealed === 'true') return;
    revealEmail();
  });

  card.addEventListener('click', (e) => {
    if (card.dataset.emailRevealed === 'true') return;
    e.preventDefault();
    revealEmail();
  });

  card.addEventListener('keydown', (e) => {
    if (card.dataset.emailRevealed === 'true') return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    revealEmail();
  });
}

/* Publication items — data source: PUBLICATIONS (data/publications.js) */
function renderPublications() {
  const list = document.getElementById('publications-list');
  if (!list) return;

  list.innerHTML = PUBLICATIONS.slice(0, 3).map((pub, i) => `
    <a href="${escapeHtml(pub.url || '#')}" target="_blank" rel="noopener" class="pub-item research-card" role="listitem" data-animate data-delay="${i * 70}" aria-label="Open paper: ${escapeHtml(pub.title)}">
      <div class="pub-year">${escapeHtml(pub.year)}</div>
      <div class="pub-title">${escapeHtml(pub.title)}</div>
      <div class="pub-meta">
        ${escapeHtml(pub.authors)} &nbsp;·&nbsp;
        <span class="pub-venue">${escapeHtml(pub.venue)}</span>
      </div>
    </a>
  `).join('');
}

/* Project cards — data source: PROJECTS (data/projects.js) */
var PROJECTS_MAX_HOMEPAGE = 3;

function renderProjectCard(project, i) {
  const tagsHtml = (project.tags || [])
    .map(function(t) { return '<span class="project-tag">' + escapeHtml(t) + '</span>'; })
    .join('');
  const bgSrc = project.bg || project.thumb || '';
  const hasBg = Boolean(bgSrc);
  const style = hasBg
    ? ' style="--card-bg: url(\'' + escapeHtml(bgSrc) + '\')"'
    : '';
  const cls = 'project-card' + (hasBg ? ' project-card--has-bg' : '');
  return '<a href="' + escapeHtml(project.url || '#') + '" class="' + cls + '" data-animate data-delay="' + (i * 80) + '"' + style + '>' +
    '<div class="project-card__overlay" aria-hidden="true"></div>' +
    '<div class="project-card__body">' +
      '<span class="project-card__year">' + escapeHtml(project.year || '') + '</span>' +
      '<span class="project-card__title">' + escapeHtml(project.title) + '</span>' +
      '<div class="project-card__tags">' + tagsHtml + '</div>' +
      '<p class="project-card__desc">' + escapeHtml(project.description || '') + '</p>' +
    '</div>' +
  '</a>';
}

function renderProjects() {
  var grid = document.getElementById('projects-grid');
  if (!grid) return;

  if (!PROJECTS.length) {
    grid.innerHTML = '<div class="projects-coming-soon" data-animate>Coming soon — projects will appear here.</div>';
    return;
  }

  // On projects.html (listing page) the grid opts in via data-render="all"
  // and shows every project. Elsewhere (homepage) we cap the count.
  var showAll = grid.getAttribute && grid.getAttribute('data-render') === 'all';
  var shown = showAll ? PROJECTS : PROJECTS.slice(0, PROJECTS_MAX_HOMEPAGE);
  grid.innerHTML = shown.map(renderProjectCard).join('');

  if (!showAll && PROJECTS.length > PROJECTS_MAX_HOMEPAGE) {
    var footer = document.createElement('div');
    footer.className = 'projects-view-all';
    footer.setAttribute('data-animate', '');
    footer.setAttribute('data-delay', String(shown.length * 80));
    footer.innerHTML = '<a href="projects.html" class="btn btn-ghost">View all projects &rarr;</a>';
    grid.parentNode.appendChild(footer);
  }
}

/* Footer year */
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — TIMELINE RENDERING
   Reads CV_CAREER / CV_EDUCATION globals from data/cv.js.
   One card per job/degree — all details visible, no flipping.
   ═══════════════════════════════════════════════════════════ */
function renderCV() {
  if (typeof document === 'undefined') return;
  const timeline = document.getElementById('cv-timeline');
  if (!timeline) return;
  if (typeof CV_CAREER    === 'undefined') return;
  if (typeof CV_EDUCATION === 'undefined') return;

  /* ── Build card HTML ────────────────────────────────── */
  function cardHtml(entry, type) {
    const isCareer = type === 'career';
    const title  = isCareer ? entry.role   : entry.degree;
    const sub    = isCareer ? entry.company : entry.institution;
    const locHtml  = entry.location
      ? `<span class="tl-location">${escapeHtml(entry.location)}</span>`
      : '';
    const descHtml = entry.description
      ? `<p class="tl-desc">${escapeHtml(entry.description)}</p>`
      : '';
    const tagsArr  = entry.tags || [];
    const tagsHtml = tagsArr.length
      ? `<div class="tl-tags">${tagsArr.map(t => `<span class="tl-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="tl-card-single">
        <div class="tl-card-header">
          <span class="tl-year">${escapeHtml(String(entry.year))}</span>
          ${locHtml}
        </div>
        <h3 class="tl-title">${escapeHtml(title || '')}</h3>
        <p class="tl-sub">${escapeHtml(sub || '')}</p>
        ${descHtml}${tagsHtml}
      </div>`;
  }

  /* ── Extract start year for sorting ────────────────── */
  function startYear(yearStr) {
    var m = String(yearStr).match(/\d{4}/);
    return m ? parseInt(m[0], 10) : 0;
  }

  /* ── Separate concurrent from normal education entries ── */
  var concurrentEduEntries = [];
  var normalEduEntries     = [];
  (CV_EDUCATION || []).forEach(function(e) {
    if (Array.isArray(e.concurrent_with) && e.concurrent_with.length > 0) {
      concurrentEduEntries.push(e);
    } else {
      normalEduEntries.push(e);
    }
  });

  /* ── Build set of career companies involved in concurrent blocks ── */
  var concurrentCareerSet = {};
  concurrentEduEntries.forEach(function(edu) {
    edu.concurrent_with.forEach(function(company) {
      concurrentCareerSet[company] = true;
    });
  });

  /* ── Partition career entries ── */
  var concurrentCareerEntries = [];
  var normalCareerEntries     = [];
  (CV_CAREER || []).forEach(function(e) {
    if (concurrentCareerSet[e.company]) {
      concurrentCareerEntries.push(e);
    } else {
      normalCareerEntries.push(e);
    }
  });

  /* ── Build sortable row descriptors ── */
  var rows = [];

  /* Normal career rows */
  normalCareerEntries.forEach(function(entry) {
    rows.push({
      sort: startYear(entry.year),
      html: '<div class="tl-row tl-row--career" data-animate>'
          + '<div class="tl-left">' + cardHtml(entry, 'career') + '</div>'
          + '<div class="tl-spine"><div class="tl-dot" aria-hidden="true"></div></div>'
          + '<div class="tl-right"><div class="tl-empty"></div></div>'
          + '</div>',
    });
  });

  /* Normal (unpaired) education rows */
  normalEduEntries.forEach(function(entry) {
    rows.push({
      sort: startYear(entry.year),
      html: '<div class="tl-row tl-row--education" data-animate>'
          + '<div class="tl-left"><div class="tl-empty"></div></div>'
          + '<div class="tl-spine"><div class="tl-dot" aria-hidden="true"></div></div>'
          + '<div class="tl-right">' + cardHtml(entry, 'education') + '</div>'
          + '</div>',
    });
  });

  /* Concurrent blocks: education entry with concurrent_with spans matching career rows */
  concurrentEduEntries.forEach(function(eduEntry) {
    var companies   = eduEntry.concurrent_with;
    var careerPairs = concurrentCareerEntries
      .filter(function(c) { return companies.indexOf(c.company) !== -1; })
      .sort(function(a, b) { return startYear(b.year) - startYear(a.year); });

    var n = careerPairs.length;

    /* Left column + spine: one career card per grid row */
    var leftCells = careerPairs.map(function(c, i) {
      var row = i + 1;
      return '<div class="tl-left tl-row--career" style="grid-column:1;grid-row:' + row + '">'
           +   cardHtml(c, 'career')
           + '</div>'
           + '<div class="tl-spine" style="grid-column:2;grid-row:' + row + '">'
           +   '<div class="tl-dot" aria-hidden="true"></div>'
           + '</div>';
    }).join('');

    /* Right column: education card spans all career rows */
    var rightCell = '<div class="tl-right tl-row--education" style="grid-column:3;grid-row:1/' + (n + 1) + '">'
                  + cardHtml(eduEntry, 'education')
                  + '</div>';

    var sortYear = n > 0 ? startYear(careerPairs[0].year) : startYear(eduEntry.year);

    rows.push({
      sort: sortYear,
      html: '<div class="tl-concurrent-block" data-animate>'
          + leftCells
          + rightCell
          + '</div>',
    });
  });

  /* ── Sort all rows newest-first and render ── */
  rows.sort(function(a, b) { return b.sort - a.sort; });
  timeline.innerHTML = rows.map(function(r) { return r.html; }).join('');
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — SKILLS PANELS
   Reads CV_SKILLS global from data/cv.js.
   ═══════════════════════════════════════════════════════════ */
function renderSkills() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('cv-skills');
  if (!container) return;
  if (typeof CV_SKILLS === 'undefined') return;

  const { technical = [], leadership = [], languages = [] } = CV_SKILLS;

  /* Progress-bar panel for technical / leadership */
  function barPanel(items, label) {
    if (!items.length) return '';
    return `
      <div class="skill-panel" data-animate>
        <h3 class="skill-panel-title">${escapeHtml(label)}</h3>
        <ul class="skill-bars">
          ${items.map(s => `
            <li class="skill-bar-item">
              <span class="skill-bar-name">${escapeHtml(s.name)}</span>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" style="--pct:${parseInt(s.level, 10)}%"></div>
              </div>
            </li>`).join('')}
        </ul>
      </div>`;
  }

  /* Language proficiency pill panel */
  function langPanel(items) {
    if (!items.length) return '';
    return `
      <div class="skill-panel" data-animate>
        <h3 class="skill-panel-title">Languages</h3>
        <ul class="lang-list">
          ${items.map(l => `
            <li class="lang-item">
              <span class="lang-name">${escapeHtml(l.name)}</span>
              <span class="lang-prof">${escapeHtml(l.proficiency)}</span>
            </li>`).join('')}
        </ul>
      </div>`;
  }

  const panels = [
    barPanel(technical,  'Technical'),
    barPanel(leadership, 'Leadership'),
    langPanel(languages),
  ].filter(Boolean).join('');

  container.innerHTML = panels
    ? `<div class="skill-panels">${panels}</div>`
    : '';
}

/* ═══════════════════════════════════════════════════════════
   STATIC FAVICON — capital "S" rendered once
   Draws a single frame and sets it as the favicon.
   No animation loop — saves continuous CPU / PNG-encode cost.
   ═══════════════════════════════════════════════════════════ */
function initAnimatedFavicon() {
  if (typeof document       === 'undefined') return;
  if (typeof HTMLCanvasElement === 'undefined') return; /* Node / SSR */

  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;

  const S = 64; /* canvas size (browsers display at 16–32 px, 64 gives HiDPI sharpness) */

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function render() {
    /* ── Background: dark rounded square ── */
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#080c14';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, S, S, 13);
    else               ctx.rect(0, 0, S, S);
    ctx.fill();

    /* ── Static "S" in accent purple ── */
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#6c63ffbb';
    ctx.fillStyle   = '#6c63ff';
    ctx.font        = 'bold 44px "Outfit", "Inter", system-ui, sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 2); /* +2 px optical centre correction */
    ctx.restore();

    link.href = canvas.toDataURL('image/png');
  }

  /* Render after fonts are loaded so Outfit is available */
  const whenReady = (typeof document.fonts !== 'undefined' && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();
  whenReady.then(render);
}


/* ═══════════════════════════════════════════════════════════
   HERO BACKGROUND — GLSL NOISE GRADIENT
   Domain-warped fBm shader: indigo-violet ↔ cyan ↔ deep dark.
   Renders a small burst of frames to produce a nice noise
   pattern, then stops — no continuous animation loop.
   ═══════════════════════════════════════════════════════════ */
class NoiseGradient {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: true })
             || canvas.getContext('experimental-webgl', { alpha: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) { canvas.style.display = 'none'; return; }
    this.gl = gl;
    this._setup();
    this._resize();
    this._startTime = performance.now();
    this._lastT     = 0;
    this._framesLeft = 3; /* render a few frames then stop */
    this._tick      = this._tick.bind(this);
    this._raf       = requestAnimationFrame(this._tick);

    /* Resize handler — debounced. Re-runs the 3-frame burst at the new size,
       otherwise the canvas would stay blank after the user resizes their
       window (changing canvas.width clears the WebGL buffer). The debounce
       avoids spawning a new burst on every pixel of a drag-resize. */
    let _rszTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_rszTimer);
      _rszTimer = setTimeout(() => {
        this._resize();
        this._framesLeft = Math.max(this._framesLeft, 2);
        if (!this._raf) this._raf = requestAnimationFrame(this._tick);
      }, 200);
    }, { passive: true });
  }

  _compileShader(type, src) {
    const s = this.gl.createShader(type);
    this.gl.shaderSource(s, src);
    this.gl.compileShader(s);
    if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
      console.error('[NoiseGradient shader]', this.gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  _setup() {
    const gl = this.gl;

    const vert = this._compileShader(gl.VERTEX_SHADER,
      `attribute vec2 a_pos;
       void main(){gl_Position=vec4(a_pos,0.0,1.0);}`);

    /* Domain-warped fBm fragment shader */
    const frag = this._compileShader(gl.FRAGMENT_SHADER,
      `precision mediump float;
       uniform float u_t;
       uniform vec2  u_res;

       float hash(vec2 p){
         p=fract(p*vec2(127.1,311.7));
         p+=dot(p,p+17.5);
         return fract(p.x*p.y);
       }
       float noise(vec2 p){
         vec2 i=floor(p),f=fract(p);
         vec2 u=f*f*(3.0-2.0*f);
         return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                    mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
       }
       float fbm(vec2 p){
         float v=0.0,a=0.5;
         for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.1+vec2(0.13,-0.07);a*=0.5;}
         return v;
       }
       void main(){
         vec2 uv=gl_FragCoord.xy/u_res;
         uv.y=1.0-uv.y;
         float t=u_t*0.06;
         /* First warp pass */
         vec2 q=vec2(fbm(uv*1.4+t),
                     fbm(uv*1.4+vec2(1.3,1.7)+t));
         /* Second warp pass — creates the folded turbulence */
         vec2 r=vec2(fbm(uv*1.4+2.0*q+vec2(1.7,9.2)+0.15*t),
                     fbm(uv*1.4+2.0*q+vec2(8.3,2.8)+0.126*t));
         float f=fbm(uv*1.4+2.5*r);
         /* Palette: deep dark → muted indigo-violet → subdued cyan.
            Toned down to avoid an overly blue wash over the hero. */
         vec3 col=mix(vec3(0.035,0.040,0.068),
                      vec3(0.300,0.270,0.700),
                      clamp(f*2.0-0.15,0.0,1.0));
         col=mix(col,
                 vec3(0.000,0.580,0.720),
                 clamp(f*f*4.0-0.4,0.0,1.0));
         col*=f*1.05+0.08;
         gl_FragColor=vec4(col,1.0);
       }`);

    if (!vert || !frag) { this.canvas.style.display = 'none'; return; }

    this.prog = gl.createProgram();
    gl.attachShader(this.prog, vert);
    gl.attachShader(this.prog, frag);
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      console.error('[NoiseGradient link]', gl.getProgramInfoLog(this.prog));
      this.canvas.style.display = 'none';
      return;
    }
    gl.useProgram(this.prog);

    /* Full-screen quad */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this._uTime = gl.getUniformLocation(this.prog, 'u_t');
    this._uRes  = gl.getUniformLocation(this.prog, 'u_res');
  }

  _resize() {
    /* Intentionally cap at 1× DPR — noise looks great at lower res */
    const scale = Math.min(window.devicePixelRatio || 1, 1.0);
    const w = Math.round(this.canvas.clientWidth  * scale);
    const h = Math.round(this.canvas.clientHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width  = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  _tick(now) {
    if (this._framesLeft <= 0) { this._raf = null; return; }
    this._raf = requestAnimationFrame(this._tick);
    if (document.hidden) return;
    this._lastT = now;
    const t = (now - this._startTime) / 1000;
    const { gl } = this;
    gl.uniform1f(this._uTime, t);
    gl.uniform2f(this._uRes, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this._framesLeft--;
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

/* Test surface — ES module exports */
export {
  formatIsoDate,
  geocodeLocations,
  Globe3D,
  renderPublications,
  renderProjects,
  renderProjectCard,
  PROJECTS_MAX_HOMEPAGE,
  renderCV,
  renderSkills,
  setFooterYear,
  initTheme,
  initCardTilt,
  initSkillBars,
  initTimelineScroll3D,
  initAnimatedFavicon,
  initMagneticButtons,
  initScroll3D,
  initNavbar,
  initMobileMenu,
  initBackToTop,
  initScrollReveal,
  initCounters,
  animateCounter,
  NeuralNetwork,
  NeuralNetwork2D,
  HeroNameShader,
  NoiseGradient,
  GlobeFallback2D,
  decodeBase64,
  getObfuscatedContactEmail,
  initEmailObfuscation,
  initResearchCarousel,
  initCmdTriggerHint,
  initCardFlip,
};

/* ═══════════════════════════════════════════════════════════
   RESEARCH CAROUSEL SCROLL BUTTONS
   ═══════════════════════════════════════════════════════════ */
function initResearchCarousel() {
  const grid = document.getElementById('research-grid');
  const leftBtn = document.getElementById('research-scroll-left');
  const rightBtn = document.getElementById('research-scroll-right');
  const wrap = grid?.closest('.research-carousel-wrap');
  if (!grid || !leftBtn || !rightBtn || !wrap) return;

  function updateButtons() {
    const { scrollLeft, scrollWidth, clientWidth } = grid;
    const atStart = scrollLeft <= 8;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 8;
    leftBtn.classList.toggle('visible', !atStart);
    rightBtn.classList.toggle('visible', !atEnd);
    wrap.classList.toggle('fade-left', !atStart);
    wrap.classList.toggle('fade-right-off', atEnd);
  }

  leftBtn.addEventListener('click', () => {
    grid.scrollBy({ left: -320, behavior: 'smooth' });
  });
  rightBtn.addEventListener('click', () => {
    grid.scrollBy({ left: 320, behavior: 'smooth' });
  });

  grid.addEventListener('scroll', updateButtons, { passive: true });
  updateButtons();
  /* Re-check after cards animate in */
  setTimeout(updateButtons, 600);
}

/* ═══════════════════════════════════════════════════════════
   COMMAND PALETTE TRIGGER HINT
   ═══════════════════════════════════════════════════════════ */
function initCmdTriggerHint() {
  const hint = document.getElementById('cmd-trigger');
  if (!hint) return;
  const keyEl = hint.querySelector('.cmd-trigger-key');
  if (keyEl) {
    const isMac = typeof navigator !== 'undefined'
      && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    keyEl.textContent = isMac ? '\u2318' : 'Ctrl+';
  }
  hint.addEventListener('click', () => {
    const overlay = document.getElementById('cmd-overlay');
    if (overlay && overlay.hidden !== undefined) {
      overlay.hidden = false;
      const inp = document.getElementById('cmd-input');
      if (inp) inp.focus();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   INIT — runs when DOM is ready
   ═══════════════════════════════════════════════════════════ */
if (typeof document !== 'undefined') {
  /* Catch unhandled promise rejections (e.g. failed fetches, WebGL errors) */
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[Unhandled rejection]', e.reason);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {

  /* Render dynamic content (static sections are already in HTML) */
  renderPublications();
  renderProjects();
  renderCV();      /* timeline entries from data/cv.js */
  renderSkills();  /* skill panels from CV_SKILLS in data/cv.js */
  setFooterYear();

  /* UI behaviours */
  initTheme();
  initNavbar();
  initMobileMenu();
  initEmailObfuscation();
  initBackToTop();
  initSideDots();
  initCommandPalette();
  initCmdTriggerHint();
  initResearchCarousel();
  initCursorGlow();
  initTaglineReveal();

  /* Scroll reveals (must come after content injection) */
  initScrollReveal();
  initCounters();

  /* Scroll-driven effects: start immediately (lightweight, needed at any scroll pos) */
  initScroll3D();

  /* Pointer-only enhancements (card tilt, magnetic buttons) — deferred to idle time
     so they do not compete with content rendering on the main thread.
     requestIdleCallback fires within milliseconds on a quiet page; the 2 s timeout
     guarantees they still initialise on heavily loaded devices.                     */
  const whenIdle = typeof requestIdleCallback !== 'undefined'
    ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 0);
  initCardFlip();
  whenIdle(() => {
    initCardTilt();
    initMagneticButtons();
  });

  /* CV timeline and skill bars */
  initTimelineScroll3D();
  initSkillBars();

  /* Animated favicon — starts after fonts load (async, non-blocking) */
  initAnimatedFavicon();

  /* Noise gradient — raw WebGL, runs on devices that support it */
  const noiseCanvas = document.getElementById('noise-canvas');
  if (noiseCanvas && !prefersReducedMotion() && !isLowPowerDevice() && hasWebGLSupport()) {
    new NoiseGradient(noiseCanvas);
  } else if (noiseCanvas) {
    noiseCanvas.style.display = 'none';
  }

  /* Three.js neural network — falls back to Canvas2D when WebGL is missing */
  const canvas = document.getElementById('neural-canvas');
  if (canvas) {
    if (prefersReducedMotion()) {
      canvas.style.display = 'none';
    } else if (hasWebGLSupport()) {
      new NeuralNetwork(canvas);
    } else {
      new NeuralNetwork2D(canvas);
    }
  }

  /* Lazy-init helper: build a heavy WebGL/Canvas component only when its
     canvas is about to enter the viewport. The maps live in the #places
     section near the bottom of the page — eagerly building them costs a
     545 KB TopoJSON fetch (Europe map), a Globe scene with stars/grids/pins,
     and a Nominatim geocode round-trip, none of which the user sees until
     they scroll there. */
  const _lazyOnViewport = (canvas, build) => {
    if (!canvas) return;
    if (typeof IntersectionObserver === 'undefined') { build(); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.disconnect();
          build();
          return;
        }
      }
    }, { rootMargin: '300px 0px' });
    io.observe(canvas);
  };

  /* Three.js Globe — geocode any entries missing lat/lon, then build */
  const globeCanvas = document.getElementById('globe-canvas');
  if (globeCanvas && typeof LOCATIONS !== 'undefined') {
    _lazyOnViewport(globeCanvas, () => {
      geocodeLocations(LOCATIONS).then(() => {
        if (prefersReducedMotion() || !hasWebGLSupport()) {
          new GlobeFallback2D(globeCanvas);
        } else {
          new Globe3D(globeCanvas);
        }
      });
    });
  }

  /* 2D Europe Map — Canvas-based representation of European locations */
  const europeCanvas = document.getElementById('europe-canvas');
  if (europeCanvas && typeof LOCATIONS !== 'undefined' && typeof EuropeMap2D !== 'undefined') {
    _lazyOnViewport(europeCanvas, () => new EuropeMap2D(europeCanvas));
  }

  /* Hero name — iridescent WebGL shader (progressive enhancement) */
  const nameH1 = document.getElementById('hero-name');
  const nameCanvas = document.getElementById('name-canvas');
  if (nameH1 && nameCanvas) {
    if (!prefersReducedMotion() && hasWebGLSupport()) new HeroNameShader(nameH1, nameCanvas);
  }

  });
}
