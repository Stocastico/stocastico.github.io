/* ═══════════════════════════════════════════════════════════
   UI BEHAVIOURS — navigation, command palette, scroll chrome.

   Pure DOM API — no Three.js, no WebGL. Covers the navbar,
   back-to-top, mobile menu, stat counters, hero tagline
   reveal, the ⌘K command palette, and the toast it pops.
   (The reading-progress bar is a CSS scroll timeline now —
   see .reading-progress in the stylesheet.)

   Content rendering (publications, projects, CV) and the
   DOMContentLoaded orchestration stay in js/main.js.
   ═══════════════════════════════════════════════════════════ */
import { prefersReducedMotion, escapeHtml, rafThrottle } from './utils.js';
import { THEME, THEME_LIGHT, PALETTES, ACTIVE_PALETTE, getTheme } from './theme.js';
import { CONTACT_EMAIL } from './contact.js';

/* ═══════════════════════════════════════════════════════════
   LISTENER / OBSERVER BOOKKEEPING

   The page-teardown system in js/main.js (pagehide → destroy()) needs every
   document/window-level listener and every observer registered here to be
   releasable, otherwise they survive into the bfcache and leak across
   navigations. Each init below builds a `bag`, registers through it, and
   returns `bag.teardown` so main.js can dispose it like any other disposable.

   `on()` mirrors the existing guards in this file (no-op when the target has
   no addEventListener — the hand-rolled test mocks rely on that), and uses
   optional-chained removeEventListener so teardown is safe on mocks that only
   implement half the EventTarget surface. */
function listenerBag() {
  const cleanups = [];
  return {
    on(target, type, fn, opts) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, opts);
      cleanups.push(() => { try { target.removeEventListener?.(type, fn, opts); } catch (_) { /* mock / detached */ } });
    },
    /* Register an arbitrary cleanup thunk (e.g. observer.disconnect()). */
    add(fn) { if (typeof fn === 'function') cleanups.push(fn); },
    teardown() { while (cleanups.length) { const c = cleanups.pop(); try { c(); } catch (_) { /* page going away */ } } },
  };
}

/* ═══════════════════════════════════════════════════════════
   ANIMATED STAT COUNTERS
   ═══════════════════════════════════════════════════════════ */
export function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  if (!counters.length) return;
  if (typeof IntersectionObserver === 'undefined') return;

  /* The HTML ships with the real value already in textContent so search
     crawlers see it. The value must NOT be zeroed before the observer fires:
     printing scrolls nothing, so a page-load reset would print "0 Countries"
     for anyone hitting Ctrl+P before scrolling to the stats — the same
     "content mutated behind an observer with no fallback" trap the scroll
     reveal already guards against. So the reset-to-0 happens inside the
     callback, immediately before the count-up that restores it. */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      observer.unobserve(el);
      const end = parseInt(el.dataset.count, 10);
      if (prefersReducedMotion()) {
        el.textContent = String(end);
        return;
      }
      el.textContent = '0';
      animateCounter(el, end);
    });
  }, { threshold: 0.6 });

  counters.forEach(el => observer.observe(el));

  return () => observer.disconnect();
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
   THEME — dark by default, light opt-in

   The site is dark by default regardless of OS preference. Light is opt-in via
   the navbar toggle, which pins data-theme="light", persists the choice in
   localStorage, and is re-applied before first paint by the <head> bootstrap.
   Toggling flips the resolved theme, updates <meta theme-color>, and fires a
   `themechange` event so js/main.js can rebuild the colour-baked hero canvases.
   ═══════════════════════════════════════════════════════════ */
export const THEME_STORAGE_KEY = 'theme';
export const PALETTE_STORAGE_KEY = 'palette';

/* Which palette the document is wearing. data/palettes.yaml ships one as the
   CSS :root default (ACTIVE_PALETTE); the others are [data-palette] scoped
   overrides emitted by generate-theme, so switching is one attribute. */
export function resolvedPalette() {
  if (typeof document !== 'undefined' && document.documentElement) {
    const id = document.documentElement.getAttribute('data-palette');
    if (id && PALETTES[id]) return id;
  }
  return ACTIVE_PALETTE;
}

/* Apply a palette: pin it, persist it, repoint the browser-chrome colour, and
   tell the colour-baked canvases to rebuild. Same `themechange` event the
   light/dark toggle fires — from their side a palette swap and a theme swap
   are the same job. */
export function applyPalette(id) {
  if (typeof document === 'undefined' || !PALETTES[id]) return;
  const root = document.documentElement;
  if (id === ACTIVE_PALETTE) root.removeAttribute('data-palette');
  else root.setAttribute('data-palette', id);
  try { localStorage.setItem(PALETTE_STORAGE_KEY, id); } catch (_) { /* private mode */ }
  syncThemeColorMeta(resolvedTheme());
  broadcastThemeChange(resolvedTheme());
}

/* The theme actually in effect right now: light only when explicitly pinned;
   everything else (no pin / pinned dark / no DOM) is dark. */
export function resolvedTheme() {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (document.documentElement.getAttribute('data-theme') === 'light') return 'light';
  }
  return 'dark';
}

/* Point the browser-chrome <meta theme-color> at the active palette's colour. */
function syncThemeColorMeta(theme) {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  /* getTheme() reads both axes off the document, so this stays correct when
     the palette changes as well as when the light/dark variant does. */
  const active = getTheme();
  const fallback = theme === 'light' ? THEME_LIGHT : THEME;
  meta.setAttribute('content', (active && active.themeColor) || fallback.themeColor);
}

/* Reflect the resolved theme on the toggle button (the icon swap is pure CSS;
   here we just keep the accessible label pointing at the *action*). */
function syncToggleButton(btn, theme) {
  if (!btn) return;
  const next = theme === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} theme`);
  btn.setAttribute('title', `Switch to ${next} theme`);
}

/* Speak a short confirmation without showing anything.

   The appearance controls changed state silently. The light/dark toggle
   rewrites its own aria-label, and a name change on the focused element is
   announced inconsistently across screen-reader/browser pairs; the palette
   dots flip aria-pressed, which is announced, but "pressed" alone does not say
   which palette won. Meanwhile the same palette switch made from the ⌘K list
   fires a visible toast — so one action had two entry points and only one of
   them told you it had worked.

   A visually-hidden live region rather than the toast: for a sighted user
   clicking the toggle, the page changing colour *is* the confirmation, and a
   toast on every click would be noise. The ⌘K path keeps its toast because
   there the user is in a menu and has no other feedback that the menu acted. */
function announce(message) {
  if (typeof document === 'undefined' || !document.body) return;
  let el = document.getElementById('a11y-status');
  if (!el) {
    el = document.createElement('p');
    el.id = 'a11y-status';
    el.className = 'visually-hidden';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  /* Clear first: setting the same text twice in a row is not a change, and a
     live region only announces changes — so picking the same palette twice
     would go unspoken. */
  el.textContent = '';
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => { el.textContent = message; });
  } else {
    el.textContent = message;
  }
}

function broadcastThemeChange(theme) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  const Evt = typeof CustomEvent === 'function' ? CustomEvent : null;
  const event = Evt ? new Evt('themechange', { detail: { theme } }) : { type: 'themechange', detail: { theme } };
  window.dispatchEvent(event);
}

export function initTheme() {
  if (typeof document === 'undefined') return;

  const bag = listenerBag();
  const btn = document.getElementById('theme-toggle');
  const dots = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('.palette-dot'))
    : [];

  /* Keep the navbar dots in sync with whichever palette is actually in
     effect — the ⌘K "Appearance" list can also change it, and a stored pin
     from a previous visit may disagree with the generated default. */
  const syncDots = () => {
    const current = resolvedPalette();
    dots.forEach((dot) => {
      dot.setAttribute('aria-pressed', dot.getAttribute('data-palette') === current ? 'true' : 'false');
    });
  };

  /* Initial sync — the bootstrap script already applied any stored pin. */
  syncThemeColorMeta(resolvedTheme());
  syncToggleButton(btn, resolvedTheme());
  syncDots();

  if (btn) {
    bag.on(btn, 'click', () => {
      const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (_) { /* private mode */ }
      syncThemeColorMeta(next);
      syncToggleButton(btn, next);
      broadcastThemeChange(next);
      announce(next === 'light' ? 'Light theme' : 'Dark theme');
    });
  }

  dots.forEach((dot) => {
    bag.on(dot, 'click', () => {
      const id = dot.getAttribute('data-palette');
      applyPalette(id);
      syncDots();
      announce(`Palette: ${(PALETTES[id] && PALETTES[id].name) || id}`);
    });
  });

  bag.on(window, 'themechange', syncDots);

  return bag.teardown;
}

/* ═══════════════════════════════════════════════════════════
   NAVBAR SCROLL BEHAVIOUR
   ═══════════════════════════════════════════════════════════ */
export function initNavbar() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const bag = listenerBag();

  /* ── Project page: highlight "Projects" nav link ────────── */
  const isProjectPage = typeof window !== 'undefined' && window.location?.pathname?.includes('/projects/');
  if (isProjectPage) {
    const projectLink = document.querySelector('#nav-links a[href$="projects.html"]');
    if (projectLink) projectLink.setAttribute('aria-current', 'page');
  }

  const links = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('#nav-links a[href^="#"]'))
    : [];
  const targets = links
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  /* ── Section tracking with IntersectionObserver ──────────
     `location`, not `page`. These are in-page anchors and the value tracks
     which section is on screen, which is exactly what ARIA defines `location`
     for: "the current location within an environment or context". `page` means
     "this link points at the page you are on" and is the right token for the
     cross-page nav links — the static markup uses it that way (now.html marks
     its own Now link `page`, and the project-page branch above marks
     Projects). Both were writing `page`, so a screen reader heard the same
     word for two different claims, and on the homepage "About" announced
     itself as the current *page* as you scrolled past it. */
  let activeId = targets[0]?.id || '';
  const setActiveLink = () => {
    links.forEach((link) => {
      const isActive = link.getAttribute('href') === `#${activeId}`;
      const cur = link.getAttribute('aria-current');
      const next = isActive ? 'location' : 'false';
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
    bag.add(() => observer.disconnect());
  } else if (targets.length) {
    /* Fallback for browsers without IntersectionObserver */
    bag.on(window, 'scroll', rafThrottle(() => {
      const checkpoint = window.scrollY + (window.innerHeight * 0.35);
      targets.forEach((section) => {
        if (checkpoint >= section.offsetTop) activeId = section.id;
      });
      setActiveLink();
    }), { passive: true });
  }

  /* The reading-progress bar used to be computed here, and it was the most
     expensive thing in this function: scrollY over a document height, where
     the height had to be memoised because reading scrollHeight per scroll
     event forces a synchronous layout — which in turn needed a resize
     listener, a load listener and a ResizeObserver on <body> to catch late
     images and injected content, or the cache went stale and the bar stopped
     at 80%. Roughly forty lines maintaining a ratio the compositor already
     has. It is `animation-timeline: scroll(root block)` in css/styles.css now;
     see the note on .reading-progress. Nothing here touches #reading-progress.

     What is left is the navbar's own state, which is a class toggle at a
     threshold rather than a continuous value, and stays in JS. */
  let _lastScrolled = false;
  const onScroll = rafThrottle(() => {
    const scrolled = window.scrollY > 20;
    if (scrolled === _lastScrolled) return;
    _lastScrolled = scrolled;
    nav.classList.toggle('scrolled', scrolled);
  });

  bag.on(window, 'scroll', onScroll, { passive: true });

  setActiveLink();

  return bag.teardown;
}

/* ═══════════════════════════════════════════════════════════
   BACK TO TOP BUTTON
   ═══════════════════════════════════════════════════════════ */
export function initBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  const bag = listenerBag();
  let _lastVisible = false;
  bag.on(window, 'scroll', rafThrottle(() => {
    const visible = window.scrollY > window.innerHeight * 0.6;
    if (visible !== _lastVisible) {
      _lastVisible = visible;
      btn.classList.toggle('visible', visible);
    }
  }), { passive: true });

  bag.on(btn, 'click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  return bag.teardown;
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
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('visible'), 2500);

  /* Clear, then write on the next frame — the same two-step announce() above
     already does, and for the same two reasons. `role="status"` is a live
     region, and a live region that enters the DOM with its text already in
     place is a *node insertion* rather than a content change, which several
     screen-reader/browser pairs do not announce — so the very first toast of a
     session was silent. And setting identical text twice running is not a
     change at all, so picking the same palette from ⌘K twice went unspoken
     after that. Clearing fixes the second; deferring fixes the first.

     The `visible` class rides along on the same frame rather than being added
     synchronously above: adding it first would paint one frame of an empty
     pill. A frame is 16 ms, and nobody can see the delay; an empty box is the
     kind of thing you do notice. */
  el.textContent = '';
  const show = () => { el.textContent = message; el.classList.add('visible'); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(show);
  else show();
}

/* ═══════════════════════════════════════════════════════════
   COMMAND PALETTE  (⌘K / Ctrl+K)
   ═══════════════════════════════════════════════════════════ */
export function initCommandPalette() {
  const overlay  = document.getElementById('cmd-overlay');
  const input    = document.getElementById('cmd-input');
  const listEl   = document.getElementById('cmd-list');
  if (!overlay || !input || !listEl) return;

  const bag = listenerBag();

  /* ── Command definitions ───────────────────────────────────
     The palette ships on every page (the overlay markup is in each page's
     static HTML), so every destination is root-absolute — a relative
     'projects.html' would resolve to /projects/projects.html from a project
     detail page. Entries without an href scroll to an on-page section when it
     exists and fall back to the homepage anchor when it doesn't. */
  /* One icon per destination, not one icon for all nine.

     Every Navigate row used to render the same hamburger, which made the icon
     column pure decoration — nine identical glyphs down the left edge of the
     list carry no information and cost a scan. These are the ordinary
     shorthands (a pin for places, a clock for now, an envelope for contact),
     so the column becomes something you can aim at instead of read past. */
  const glyph = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const ICONS = {
    about:    glyph('<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>'),
    projects: glyph('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'),
    paper:    glyph('<path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>'
                    + '<path d="M14 3v5h4"/><path d="M8 13h7M8 17h4"/>'),
    papers:   glyph('<path d="M9 3h6l4 4v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>'
                    + '<path d="M15 3v5h4"/><path d="M5 7v12a2 2 0 0 0 2 2h9"/>'),
    cv:       glyph('<rect x="3" y="7" width="18" height="13" rx="2"/>'
                    + '<path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>'),
    places:   glyph('<path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    links:    glyph('<path d="M10 13a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7"/>'
                    + '<path d="M14 11a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7"/>'),
    now:      glyph('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>'),
    contact:  glyph('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7.5l8.5 6 8.5-6"/>'),
  };

  const SECTIONS = [
    { id: 'about',        label: 'About',        hint: 'Hello there!', icon: ICONS.about },
    { id: 'now',          label: 'Now',           hint: 'What I’m up to lately', href: '/now.html', icon: ICONS.now },
    { id: 'projects',     label: 'Projects',      hint: 'What I’ve been building', href: '/projects.html', icon: ICONS.projects },
    { id: 'publications', label: 'Publications',  hint: 'Selected papers', icon: ICONS.paper },
    { id: 'all-publications', label: 'All publications', hint: 'Full paper list', href: '/publications.html', icon: ICONS.papers },
    { id: 'cv',           label: 'CV',            hint: 'Experience & Education', href: '/cv.html', icon: ICONS.cv },
    { id: 'places',       label: 'Places',        hint: 'Where I’ve been', icon: ICONS.places },
    { id: 'links',        label: 'Links',         hint: 'Blogs & sites I follow', href: '/links.html', icon: ICONS.links },
    { id: 'contact',      label: 'Contact',       hint: "Let’s talk", icon: ICONS.contact },
  ];

  const ACTIONS = [
    {
      label: 'Open CV PDF',
      hint: 'Download / view',
      icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v12M8 12l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      action() { window.open('/docs/cv.pdf', '_blank'); },
    },
    {
      label: 'Copy email address',
      hint: 'To clipboard',
      icon: `<svg viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 16V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      action() {
        /* Straight from the constant, not from the DOM. The old code read a
           base64 pair off the overlay because the address was not in the
           markup — and that fallback was doing the real work on twenty of the
           twenty-one pages, since only the homepage has a contact section.
           Replacing it with a `a[href^="mailto:"]` lookup would have quietly
           broken this action everywhere else; importing the constant is both
           simpler and correct on every page. */
        navigator.clipboard?.writeText(CONTACT_EMAIL)
          .then(() => showToast('Email copied!'))
          .catch(() => showToast('Copy it by hand: ' + CONTACT_EMAIL));
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

  /* Fallback for a SECTIONS entry added without an icon — a generic list
     glyph rather than nothing, so the column never goes ragged. */
  const navIcon = glyph('<path d="M4 6h16M4 12h16M4 18h16"/>');

  /* Scroll to a section AND put keyboard focus in it.

     scrollIntoView() alone moved the page and nothing else. close() hands
     focus back to whatever opened the dialog — the ⌘K chip in the navbar — so
     picking "Contact" from the palette left a sighted user looking at the
     contact section while the caret sat at the top of the page and a screen
     reader announced nothing at all: for anyone not watching pixels, the
     command did nothing. That is WCAG 2.4.3 (focus order) failing in the one
     component built specifically for keyboard users.

     tabindex="-1" makes a section focusable programmatically without adding it
     to the tab sequence, and is removed again on blur so the DOM does not
     accumulate the attribute. preventScroll because the smooth scroll above is
     already handling the movement — letting focus() scroll too lands the page
     instantly and cancels the animation. */
  function focusSection(el) {
    el.scrollIntoView({ behavior: 'smooth' });
    if (typeof el.focus !== 'function') return;
    const hadTabindex = el.hasAttribute('tabindex');
    if (!hadTabindex) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (!hadTabindex) {
      el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true });
    }
  }

  /* ── Palettes ───────────────────────────────────────────────
     The whole site's colour scheme is generated from one YAML key, and until
     now no visitor could ever see that. Each entry swaps [data-palette]; CSS
     custom properties repaint instantly and the canvases rebuild off the
     `themechange` event. The swatch is the palette's own accent pair, so the
     list is self-describing without needing a colour name in the label. */
  const paletteSwatch = (entry) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">`
    + `<circle cx="9" cy="12" r="6" fill="${entry.dark.accent}"/>`
    + `<circle cx="16" cy="12" r="6" fill="${entry.dark.accent2}" opacity="0.9"/>`
    + `</svg>`;

  const PALETTE_ITEMS = Object.keys(PALETTES).map((id) => {
    const entry = PALETTES[id];
    return {
      label: entry.name,
      hint: id === ACTIVE_PALETTE ? 'Palette · default' : 'Palette',
      icon: paletteSwatch(entry),
      action() {
        applyPalette(id);
        showToast(`Palette: ${entry.name}`);
      },
    };
  });

  /* ── Build all command items ────────────────────────────── */
  const allItems = [
    ...SECTIONS.map(s => ({
      label: s.label,
      hint: s.hint,
      icon: s.icon || navIcon,
      action() {
        if (s.href) {
          window.location.href = s.href;
          return;
        }
        const el = document.getElementById(s.id);
        if (el) focusSection(el);
        else window.location.href = `/#${s.id}`;
      },
      group: 'Navigate',
    })),
    ...ACTIONS.map(a => ({ ...a, group: 'Actions' })),
    ...PALETTE_ITEMS.map(p => ({ ...p, group: 'Appearance' })),
  ];

  /* allItems index → filtered set; activeIdx is an index into allItems. */
  let visibleSet = new Set(allItems.map((_, i) => i));
  let activeIdx = allItems.length > 0 ? 0 : -1;
  /* Element to restore focus to when the palette closes. Only used on the
     non-modal fallback path below — a dialog closed with .close() restores
     focus to its opener itself. */
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
    bag.on(li, 'mouseenter', () => { setActive(i); });
    bag.on(li, 'click', () => { execute(item); });
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
  bag.on(input, 'input', () => {
    applyFilter(input.value.toLowerCase().trim());
  });

  /* ── Keyboard navigation ────────────────────────────────── */
  bag.on(input, 'keydown', (e) => {
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
    }
    /* Escape and Tab are deliberately absent. #cmd-overlay is a <dialog>
       opened with showModal(), so the browser closes it on Escape and keeps
       Tab inside it — the hand-rolled versions of both are gone. */
  });

  /* ── Open / close ───────────────────────────────────────────────────────
     showModal() does four jobs this used to do by hand, and does them better:

       · promotes the dialog to the **top layer**, so it paints above every
         stacked context without a z-index guess;
       · makes everything behind it **inert** — the old code walked
         document.body.children setting .inert and aria-hidden, then had to
         restore exactly that set, with a guard against a double-open
         stranding the first batch permanently inert;
       · closes on **Escape**;
       · **returns focus** to whatever opened it.

     What it does not do is stop the page behind from scrolling, so the scroll
     lock stays — released from the dialog's own `close` event rather than
     from close() below, because Escape closes the dialog without going
     through our code at all.

     The non-modal fallback is for the DOM stubs in test/main.node.test.mjs.
     Every browser that can run this site's ES modules has had <dialog> for
     years; nothing in production takes that branch. */
  const supportsModal = typeof overlay.showModal === 'function';

  const releaseScrollLock = () => {
    if (document.body && document.body.style) document.body.style.overflow = '';
  };
  bag.on(overlay, 'close', releaseScrollLock);

  function open() {
    if (overlay.open) return;
    input.value = '';
    applyFilter('');
    if (supportsModal) {
      overlay.showModal();
    } else {
      /* Stub path: no top layer, no native focus restore — do it by hand. */
      _previouslyFocused = (typeof document !== 'undefined' && document.activeElement) || null;
      overlay.open = true;
    }
    /* showModal() already focuses the first focusable descendant, which is
       this input. Setting it explicitly costs nothing and keeps the stub path
       behaving the same. */
    requestAnimationFrame(() => input.focus());
    if (document.body && document.body.style) document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay.open) return;
    if (supportsModal) {
      overlay.close(); /* fires 'close' → releaseScrollLock() */
    } else {
      overlay.open = false;
      releaseScrollLock();
      if (_previouslyFocused && typeof _previouslyFocused.focus === 'function') {
        try { _previouslyFocused.focus(); } catch (_) { /* element may have unmounted */ }
      }
      _previouslyFocused = null;
    }
  }

  /* Click outside the box. On a modal dialog the backdrop is a pseudo-element,
     so a click on it targets the dialog itself — which is why this still reads
     as `e.target === overlay`. */
  bag.on(overlay, 'click', (e) => { if (e.target === overlay) close(); });

  /* Nav hint chip opens the palette through the same open() path as ⌘K, so it
     gets the modal treatment and the scroll-lock too (clicking the chip used
     to bypass both). */
  const trigger = document.getElementById('cmd-trigger');
  if (trigger) bag.on(trigger, 'click', () => open());

  /* Global keyboard shortcut — ⌘K or Ctrl+K */
  bag.on(document, 'keydown', (e) => {
    /* Compare case-insensitively: with Shift or Caps Lock held, e.key is 'K'
       and the shortcut silently did nothing. */
    if ((e.metaKey || e.ctrlKey) && typeof e.key === 'string' && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      overlay.open ? close() : open();
    }
  });

  return bag.teardown;
}

/* ═══════════════════════════════════════════════════════════
   STAGGERED HERO TAGLINE REVEAL
   ═══════════════════════════════════════════════════════════ */
export function initTaglineReveal() {
  if (prefersReducedMotion()) return;
  const tagline = document.querySelector('.hero-tagline');
  if (!tagline) return;

  let delay = 120; /* ms — start after a brief pause */
  const STEP = 40;  /* ms per word */
  const spans = [];

  /* Split on the · separator, then further split each phrase into words.
     textContent *decodes* entities, and the words go back in through
     innerHTML below — so they have to be re-escaped, or a tagline containing
     "&" or "<" would round-trip into raw markup. Every other renderer on the
     site escapes; this was the one that did not. */
  const emit = (text, emphasised) => {
    const parts = text.split('·');
    parts.forEach((phrase, partIdx) => {
      const words = phrase.trim().split(/\s+/).filter(Boolean);
      words.forEach(word => {
        const tag = emphasised ? 'em' : 'span';
        spans.push(`<${tag} class="tagline-word" style="animation-delay:${delay}ms">${escapeHtml(word)}</${tag}>`);
        delay += STEP;
      });
      if (partIdx < parts.length - 1) {
        spans.push(`<span class="tagline-sep" style="animation-delay:${delay}ms">·</span>`);
        delay += STEP;
      }
    });
  };

  /* Walk the child nodes rather than reading textContent off the whole
     paragraph: the tagline italicises its two verbs, and a textContent
     round-trip would strip that on every JS visit — right in the source,
     gone on screen, and only for visitors who don't prefer reduced motion.
     An emphasised word becomes an <em class="tagline-word">, so it keeps the
     italic *and* the stagger — and the @media print reset too, which selects
     the class rather than the element. */
  Array.from(tagline.childNodes).forEach(node => {
    if (node.nodeType === 3 /* TEXT_NODE */) emit(node.nodeValue, false);
    else if (node.nodeType === 1 /* ELEMENT_NODE */) emit(node.textContent, node.tagName === 'EM');
  });

  tagline.innerHTML = spans.join(' ');
}

/* ═══════════════════════════════════════════════════════════
   MOBILE MENU TOGGLE
   ═══════════════════════════════════════════════════════════ */
export function initMobileMenu() {
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (!toggle || !links) return;

  const bag = listenerBag();

  /* Tie the toggle to the menu it controls for assistive tech. */
  if (typeof toggle.setAttribute === 'function') {
    toggle.setAttribute('aria-controls', links.id || 'nav-links');
  }

  const setMenuState = (open) => {
    toggle.classList.toggle('open', open);
    links.classList.toggle('open', open);
    document.body?.classList?.toggle('menu-open', open);
    /* String() rather than relying on setAttribute's boolean→string coercion. */
    toggle.setAttribute('aria-expanded', String(open));
  };

  bag.on(toggle, 'click', () => setMenuState(!toggle.classList.contains('open')));

  /* Close on link click */
  links.querySelectorAll('a').forEach(a => {
    bag.on(a, 'click', () => setMenuState(false));
  });

  /* document-level listeners — bag.on() no-ops when the (mock) document has no
     addEventListener, matching the previous explicit guard. */
  bag.on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && toggle.classList.contains('open')) setMenuState(false);

    /* Focus trapping when mobile menu is open. The theme controls (palette
       dots + light/dark toggle) sit between the burger and the links in DOM
       order and stay visible on mobile, so they belong inside the trap —
       enumerating only [toggle, links] made the wrap points skip them. The
       ⌘K chip is display:none below 901px — the width at which the burger
       takes over — and needs no entry. */
    if (e.key === 'Tab' && toggle.classList.contains('open')) {
      const themeButtons = document.querySelectorAll('.theme-controls button');
      const focusable = [toggle, ...themeButtons, ...links.querySelectorAll('a')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  });

  bag.on(document, 'click', (e) => {
    if (!toggle.classList.contains('open')) return;
    if (toggle.contains?.(e.target) || links.contains?.(e.target)) return;
    setMenuState(false);
  });

  return bag.teardown;
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
