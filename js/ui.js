/* ═══════════════════════════════════════════════════════════
   UI BEHAVIOURS — navigation, command palette, scroll chrome.

   Pure DOM API — no Three.js, no WebGL. Covers the navbar +
   reading progress, back-to-top, side dots, mobile menu, stat
   counters, hero tagline reveal, research carousel, the ⌘K
   command palette, and the toast it pops.

   Content rendering (publications, projects, CV) and the
   DOMContentLoaded orchestration stay in js/main.js.
   ═══════════════════════════════════════════════════════════ */
import { prefersReducedMotion, escapeHtml, rafThrottle } from './utils.js';

/* ═══════════════════════════════════════════════════════════
   ANIMATED STAT COUNTERS
   ═══════════════════════════════════════════════════════════ */
export function initCounters() {
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

export function animateCounter(el, target) {
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
   THEME (fixed dark mode — switching intentionally disabled)
   ═══════════════════════════════════════════════════════════ */
export function initTheme() {
  /* Theme switching intentionally disabled: dark mode is fixed. */
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR SCROLL BEHAVIOUR
   ═══════════════════════════════════════════════════════════ */
export function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const progressBar = document.getElementById('reading-progress');

  /* ── Project page: highlight "Projects" nav link ────────── */
  const isProjectPage = typeof window !== 'undefined' && window.location?.pathname?.includes('/projects/');
  if (isProjectPage) {
    const projectLink = document.querySelector('#nav-links a[href*="#projects"]');
    if (projectLink) projectLink.setAttribute('aria-current', 'page');
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
      const next = isActive ? 'page' : 'false';
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
    window.addEventListener('scroll', rafThrottle(() => {
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
  const onScroll = rafThrottle(() => {
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
export function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  let _lastVisible = false;
  window.addEventListener('scroll', rafThrottle(() => {
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
export function showToast(message) {
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
export function initCommandPalette() {
  const overlay  = document.getElementById('cmd-overlay');
  const input    = document.getElementById('cmd-input');
  const listEl   = document.getElementById('cmd-list');
  if (!overlay || !input || !listEl) return;

  /* ── Command definitions ───────────────────────────────── */
  const SECTIONS = [
    { id: 'about',        label: 'About',        hint: 'Who I am' },
    { id: 'research',     label: 'Research',      hint: 'What I work on' },
    { id: 'publications', label: 'Publications',  hint: 'Selected papers' },
    { id: 'all-publications', label: 'All publications', hint: 'Full paper list', href: 'publications.html' },
    { id: 'cv',           label: 'CV',            hint: 'Experience & Education', href: 'cv.html' },
    { id: 'skills',       label: 'Skills',        hint: 'Expertise' },
    { id: 'projects',     label: 'Projects',      hint: 'Things I’ve built', href: 'projects.html' },
    { id: 'places',       label: 'Places',        hint: 'Where I’ve been' },
    { id: 'links',        label: 'Links',         hint: 'Blogs & sites I follow', href: 'links.html' },
    { id: 'now',          label: 'Now',           hint: 'What I’m up to lately', href: 'now.html' },
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
  const allItems = [
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

  /* allItems index → filtered set; activeIdx is an index into allItems. */
  let visibleSet = new Set(allItems.map((_, i) => i));
  let activeIdx = allItems.length > 0 ? 0 : -1;
  /* Element to restore focus to when the palette closes (whatever the
     user was on before they triggered ⌘K / hint / kbd shortcut). */
  let _previouslyFocused = null;

  /* ── Mount items + group labels ONCE ─────────────────────
     Filtering toggles `hidden` on existing nodes instead of rebuilding
     the list per keystroke. Every <li> persists for the lifetime of
     the palette; only attribute writes change. */
  const itemEls = new Array(allItems.length);
  const groupBuckets = new Map(); /* group name -> { label, indices } */
  const noResultsEl = document.createElement('li');
  noResultsEl.className = 'cmd-item';
  noResultsEl.style.color = 'var(--text-faint)';
  noResultsEl.textContent = 'No results';
  noResultsEl.hidden = true;

  let lastGroup = null;
  allItems.forEach((item, i) => {
    if (item.group !== lastGroup) {
      const label = document.createElement('li');
      label.className = 'cmd-group-label';
      label.setAttribute('role', 'presentation');
      label.textContent = item.group;
      listEl.appendChild(label);
      groupBuckets.set(item.group, { label, indices: [] });
      lastGroup = item.group;
    }
    groupBuckets.get(item.group).indices.push(i);
    const li = document.createElement('li');
    li.id = `cmd-opt-${i}`;
    li.className = 'cmd-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === activeIdx));
    li.innerHTML = `
      <span class="cmd-item-icon">${item.icon}</span>
      <span class="cmd-item-label">${escapeHtml(item.label)}</span>
      <span class="cmd-item-hint">${escapeHtml(item.hint || '')}</span>
    `;
    li.addEventListener('mouseenter', () => { setActive(i); });
    li.addEventListener('click', () => { execute(item); });
    listEl.appendChild(li);
    itemEls[i] = li;
  });
  listEl.appendChild(noResultsEl);
  syncActiveDescendant();

  /* Set aria-selected on item nodes (single attribute write per change). */
  function syncActiveDescendant() {
    let activeId = null;
    for (let i = 0; i < itemEls.length; i++) {
      const isActive = i === activeIdx;
      itemEls[i].setAttribute('aria-selected', String(isActive));
      if (isActive) activeId = itemEls[i].id;
    }
    if (activeId) input.setAttribute('aria-activedescendant', activeId);
    else input.removeAttribute('aria-activedescendant');
  }

  function setActive(i) {
    if (i === activeIdx || !visibleSet.has(i)) return;
    activeIdx = i;
    syncActiveDescendant();
  }

  /* Apply the filter: toggle `hidden` on items + group labels, recompute
     the visible set, and reset the active row to the first match. */
  function applyFilter(q) {
    if (q) {
      visibleSet = new Set();
      for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        if (it.label.toLowerCase().includes(q) || (it.hint || '').toLowerCase().includes(q)) {
          visibleSet.add(i);
        }
      }
    } else {
      visibleSet = new Set(allItems.map((_, i) => i));
    }

    for (let i = 0; i < itemEls.length; i++) {
      itemEls[i].hidden = !visibleSet.has(i);
    }
    for (const { label, indices } of groupBuckets.values()) {
      label.hidden = !indices.some(i => visibleSet.has(i));
    }
    noResultsEl.hidden = visibleSet.size > 0;

    /* Active row → first visible item, or -1 if none. */
    activeIdx = visibleSet.size > 0
      ? Math.min(...visibleSet)
      : -1;
    syncActiveDescendant();
  }

  /* Move active row by +/- 1 within the filtered set. */
  function moveActive(dir) {
    const visible = [...visibleSet].sort((a, b) => a - b);
    if (visible.length === 0) return;
    const pos = visible.indexOf(activeIdx);
    const next = Math.max(0, Math.min(visible.length - 1, pos + dir));
    activeIdx = visible[next];
    syncActiveDescendant();
    itemEls[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }

  /* ── Execute & close ────────────────────────────────────── */
  function execute(item) {
    close();
    item.action();
  }

  /* ── Filter on input ────────────────────────────────────── */
  input.addEventListener('input', () => {
    applyFilter(input.value.toLowerCase().trim());
  });

  /* ── Keyboard navigation ────────────────────────────────── */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(+1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = activeIdx >= 0 ? allItems[activeIdx] : null;
      if (item) execute(item);
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Tab') {
      /* The input is the only focusable element inside the overlay; keep
         focus there so Tab/Shift+Tab can't escape the modal (focus trap). */
      e.preventDefault();
    }
  });

  /* Elements made inert while the palette is open, so they can be restored. */
  let _inertedEls = [];

  /* aria-modal alone is advisory; make it a real modal by marking every
     sibling of the overlay inert (removes them from tab order + the AT tree)
     while the palette is open, then restoring them on close. */
  function setBackgroundInert(on) {
    const body = document.body;
    if (!body || !body.children) return;
    if (on) {
      _inertedEls = [];
      for (const el of Array.from(body.children)) {
        if (el === overlay) continue;
        const tag = (el.tagName || '').toUpperCase();
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'LINK' || tag === 'META') continue;
        el.inert = true;
        if (typeof el.setAttribute === 'function') el.setAttribute('aria-hidden', 'true');
        _inertedEls.push(el);
      }
    } else {
      for (const el of _inertedEls) {
        el.inert = false;
        if (typeof el.removeAttribute === 'function') el.removeAttribute('aria-hidden');
      }
      _inertedEls = [];
    }
  }

  /* ── Open / close ───────────────────────────────────────── */
  function open() {
    /* Remember the trigger element so we can restore focus on close. */
    _previouslyFocused = (typeof document !== 'undefined' && document.activeElement) || null;
    input.value = '';
    applyFilter('');
    overlay.hidden = false;
    setBackgroundInert(true);
    requestAnimationFrame(() => input.focus());
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.hidden = true;
    setBackgroundInert(false);
    document.body.style.overflow = '';
    /* Restore focus to whatever opened the palette so keyboard users
       don't lose their place in the page. */
    if (_previouslyFocused && typeof _previouslyFocused.focus === 'function') {
      try { _previouslyFocused.focus(); } catch (_) { /* element may have unmounted */ }
    }
    _previouslyFocused = null;
  }

  /* Close on overlay click */
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  /* Nav hint chip opens the palette through the same open() path as ⌘K, so it
     gets the focus trap, background inert, and scroll-lock too (clicking the
     chip used to bypass all three). */
  const trigger = document.getElementById('cmd-trigger');
  if (trigger) trigger.addEventListener('click', () => { if (overlay.hidden) open(); });

  /* Global keyboard shortcut — ⌘K or Ctrl+K */
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      overlay.hidden ? open() : close();
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   STAGGERED HERO TAGLINE REVEAL
   ═══════════════════════════════════════════════════════════ */
export function initTaglineReveal() {
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
export function initCursorGlow() {
  /* intentionally empty — effect removed to save battery */
}

/* ═══════════════════════════════════════════════════════════
   MOBILE MENU TOGGLE
   ═══════════════════════════════════════════════════════════ */
export function initMobileMenu() {
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
   RESEARCH CAROUSEL SCROLL BUTTONS
   ═══════════════════════════════════════════════════════════ */
export function initResearchCarousel() {
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
export function initCmdTriggerHint() {
  const hint = document.getElementById('cmd-trigger');
  if (!hint) return;
  /* Only the key label is set here; the click-to-open is wired in
     initCommandPalette so the chip shares the palette's open() path
     (focus trap + background inert + scroll-lock). */
  const keyEl = hint.querySelector('.cmd-trigger-key');
  if (keyEl) {
    const isMac = typeof navigator !== 'undefined'
      && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    keyEl.textContent = isMac ? '⌘' : 'Ctrl+';
  }
}
