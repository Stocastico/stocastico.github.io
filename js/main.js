/* ============================================================
   PERSONAL WEBSITE — Stefano Masneri
   main.js
   ============================================================
   This file wires the page together: it renders the dynamic
   content sections (publications, projects, CV) and, on
   DOMContentLoaded, boots every UI behaviour and visual effect.

   Behaviour and effects now live in focused modules:

     js/ui.js             — navbar, command palette, side dots,
                            mobile menu, counters, carousel, etc.
     js/animations.js     — scroll reveals, card tilt, parallax
     js/noise-gradient.js — hero background WebGL shader
     js/globe.js          — 3D globe (Three.js)
     js/neural-net.js     — neural-network hero (Three.js)
     js/europe-map.js     — 2D Canvas Europe map

   Content lives in separate, easy-to-edit files:

     index.html           — static sections (hero, about, research,
                            skills, contact, navigation, footer)
     data/locations.js    — 3D globe pins, trips, regions
     data/publications.js — selected papers  (PUBLICATIONS array)
     data/projects.js     — projects         (PROJECTS array)

   To change any colour on the site — including the neural network,
   shaders, and 3D globe — edit data/palettes.yaml and run
   `npm run generate-theme`.
   ============================================================ */

/* ─── Three.js loading strategy ─────────────────────────────────
   neural-net.js and globe.js (and through them three-context.js → the whole
   `three` package) are loaded on demand via dynamic import() at their init
   sites below. That keeps Three.js in a lazy chunk instead of the per-page
   bundle, so it never ships to pages without a 3D canvas (cv, projects, 404,
   project pages) and is off the critical path on the home page.
   Do NOT statically import three-context.js / globe.js / neural-net.js here —
   that pulls all of Three.js back into every page. Tests import the THREE
   mock hook (__setThreeForTests) directly from ./three-context.js.

   europe-map.js follows the same rule for the same reason, even though it has
   no Three.js in it: it was statically imported here, which put its chunk in
   the eager graph of all 21 pages when exactly one has a #europe-canvas. Any
   module that serves a single page belongs behind a dynamic import at its
   init site, not up here. */

/* Nothing is imported here. Every data module is loaded with a dynamic
   import() at the DOM gate that needs it, further down.

   These six used to be static imports, which put all of them in the single
   shared main-*.js chunk: 21.3 KB gzip of the 31.3 KB bundle — 68% of the
   shared JavaScript — downloaded by all 21 pages. A visitor landing on
   now.html (three paragraphs about a baby and Dostoevsky) fetched the complete
   UNESCO world-heritage tree, the 49-entry blogroll, every travel pin, the
   full CV, all 37 publications and all 14 projects.

   This is the same mistake CLAUDE.md already records for europe-map.js —
   "shipped 10 KB to the twenty pages with no #europe-canvas" — learned for
   code and never applied to data. Every renderer already gated on a DOM id, so
   the fix is only moving the import inside the gate that was there all along.

   Consequence for the renderers below: their data parameters have no
   defaults. A default would have to name the module at the top of the file,
   which is exactly what puts it back in the eager graph. */

/* Shared environment helpers + escapeHtml (shared with js/ui.js) */
import { isLowPowerDevice, prefersReducedMotion, hasWebGLSupport, escapeHtml, supportsCnnHero, CNN_HERO_QUERY } from './utils.js';

/* Card / list-item markup — shared with the static generator
   (scripts/generate-cards.mjs) so SSR and client markup never drift. */
import { projectCardHtml, publicationsListLines, homepageProjects } from './render-cards.js';

/* Page-section markup (CV timeline + skills, UNESCO accordion, links grid) —
   shared with the same generator, for the same reason. These three pages used
   to ship as empty shells; see the header of js/render-page.js. */
import {
  cvTimelineLines, cvSkillsLines, unescoAccordionLines, linksGridLines, linksCountLabel,
} from './render-page.js';

/* Theme colours — single source of truth (data/palettes.yaml → js/theme.js).
   Only the favicon renderer below reads THEME/rgba now; the noise shader
   imports its own colours inside js/noise-gradient.js. */
import { THEME, rgba } from './theme.js';

/* Hero name iridescent WebGL shader (raw WebGL, no Three.js) */

/* Hero background noise gradient (raw WebGL, no Three.js) */
import { NoiseGradient } from './noise-gradient.js';

/* neural-net.js (NeuralNetwork/NeuralNetwork2D) and globe.js (Globe3D/
   GlobeFallback2D/geocodeLocations) are dynamically imported at their init
   sites below — see the Three.js loading-strategy note at the top. */

/* DOM animations: scroll reveal, card tilt, parallax, skill bars (extracted) */
import {
  initScrollReveal,
  initCardTilt,
  initScroll3D,
  initSkillBars,
  revealNewContent,
} from './animations.js';

/* UI behaviours: navbar, command palette, side dots, mobile menu, counters,
   tagline reveal, etc. (extracted to js/ui.js) */
import {
  initCounters,
  animateCounter,
  initTheme,
  initNavbar,
  initBackToTop,
  initCommandPalette,
  initTaglineReveal,
  initMobileMenu,
  initCmdTriggerHint,
} from './ui.js';

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

/* Publication items — data source: PUBLICATIONS (data/publications.js).
   Tests pass a mock array as the first argument. */
function renderPublications(publications) {
  const list = document.getElementById('publications-list');
  if (!list) return;

  /* publications.html opts in via data-render="all" and lists every paper;
     the homepage shows the featured subset (falling back to the newest 3). */
  const showAll = list.getAttribute && list.getAttribute('data-render') === 'all';
  let shown;
  if (showAll) {
    shown = publications;
  } else {
    const featured = publications.filter((p) => p && p.featured);
    shown = featured.length ? featured : publications.slice(0, 3);
  }
  list.innerHTML = publicationsListLines(shown, { grouped: showAll }).join('');
}

/* Project cards — data source: PROJECTS (data/projects.js) */
var PROJECTS_MAX_HOMEPAGE = 3;

/* Thin wrapper around the shared builder (kept for the public test surface). */
function renderProjectCard(project, i, opts) {
  return projectCardHtml(project, i, opts);
}

function renderProjects(projects) {
  var grid = document.getElementById('projects-grid');
  if (!grid) return;

  // On projects.html (listing page) the grid opts in via data-render="all"
  // and shows every project. Elsewhere (homepage) we pick a random subset.
  var showAll = grid.getAttribute && grid.getAttribute('data-render') === 'all';
  var shown;
  if (showAll) {
    shown = projects;
  } else {
    /* Professional work only, filtered BEFORE the shuffle — otherwise a
       personal project can (and did) take one of the three front-page slots.
       generate-cards bakes the static homepage set through the same
       homepageProjects() call, so this re-shuffle can't disagree with the HTML
       a no-JS visitor or a crawler was served. */
    var pool = homepageProjects(projects);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    shown = pool.slice(0, PROJECTS_MAX_HOMEPAGE);
  }

  /* Checked after filtering, not before: a homepage whose every entry is
     personal has nothing to show and needs the empty state, same as no data. */
  if (!shown.length) {
    grid.innerHTML = '<div class="projects-coming-soon" data-animate>Coming soon — projects will appear here.</div>';
    return;
  }
  /* Heading rank follows the page, matching what generate-cards baked in:
     projects.html goes <h1> Portfolio → cards, so they are h2; the homepage
     puts them under an <h2> section title, so they are h3. Passing the wrong
     one here would make the re-render disagree with the served HTML. */
  var level = showAll ? 2 : 3;
  grid.innerHTML = shown.map(function (p, i) {
    return renderProjectCard(p, i, { level: level });
  }).join('');

  /* No "View all projects" footer button: the section's intro prose already
     links the full list, and unlike a JS-injected footer that link is in the
     static HTML, so crawlers and no-JS visitors get it too. */
}

/* Footer year */
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — TIMELINE RENDERING
   Tests pass mocked career/education arrays as arguments.

   The markup itself lives in js/render-page.js, which generate-cards also
   imports — cv.html now ships the timeline server-rendered, and re-rendering
   it here from the same builder is what keeps the two from drifting.
   ═══════════════════════════════════════════════════════════ */
function renderCV(career, education) {
  if (typeof document === 'undefined') return;
  const timeline = document.getElementById('cv-timeline');
  if (!timeline) return;
  timeline.innerHTML = cvTimelineLines(career, education).join('\n');
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — SKILLS PANELS
   Tests pass a mocked CV_SKILLS object as the first argument.
   ═══════════════════════════════════════════════════════════ */
function renderSkills(skills) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('cv-skills');
  if (!container) return;
  container.innerHTML = cvSkillsLines(skills).join('\n');
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
    ctx.fillStyle = THEME.faviconBg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, S, S, 13);
    else               ctx.rect(0, 0, S, S);
    ctx.fill();

    /* ── Static "S" in the accent colour ── */
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.shadowBlur  = 10;
    ctx.shadowColor = rgba(THEME.faviconFg, 0.73);
    ctx.fillStyle   = THEME.faviconFg;
    ctx.font        = 'bold 44px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 2); /* +2 px optical centre correction */
    ctx.restore();

    link.href = canvas.toDataURL('image/png');
  }

  /* Render after fonts are loaded so the display face is available */
  const whenReady = (typeof document.fonts !== 'undefined' && document.fonts.ready)
    ? document.fonts.ready
    : Promise.resolve();
  whenReady.then(render);
}

/* Renders a screen-reader / keyboard-accessible alternative to the 3D
   globe. The canvas itself is unreachable for non-pointer users; this
   list exposes the same data (lived/current/worktrip/holiday pins,
   regions, and multi-city trips) in plain semantic HTML. The container
   is visually-hidden but discoverable by assistive tech via the
   aria-describedby on the canvas. */
export function renderGlobeA11yList(container, locations) {
  if (!container || !locations) return;
  const TYPE_LABEL = {
    lived:    'Lived',
    current:  'Current',
    worktrip: 'Worktrip',
    holiday:  'Holiday',
  };

  /* Group pins by type so screen-reader users hear them in a
     predictable order: Lived → Current → Worktrip → Holiday. */
  const grouped = { lived: [], current: [], worktrip: [], holiday: [] };
  for (const p of (locations.pins || [])) {
    if (grouped[p.type]) grouped[p.type].push(p);
  }

  const sections = [];
  for (const [type, items] of Object.entries(grouped)) {
    if (!items.length) continue;
    const lis = items.map(p => {
      const info = p.info ? ` &mdash; ${escapeHtml(p.info)}` : '';
      return `<li>${escapeHtml(p.name)}${info}</li>`;
    }).join('');
    sections.push(
      `<h4>${TYPE_LABEL[type]} (${items.length})</h4>` +
      `<ul>${lis}</ul>`
    );
  }
  if ((locations.regions || []).length) {
    const lis = locations.regions.map(r => {
      const info = r.info ? ` &mdash; ${escapeHtml(r.info)}` : '';
      return `<li>${escapeHtml(r.name)}${info}</li>`;
    }).join('');
    sections.push(`<h4>Regions (${locations.regions.length})</h4><ul>${lis}</ul>`);
  }
  if ((locations.trips || []).length) {
    const lis = locations.trips.map(t => {
      const cities = (t.cities || []).map(c => escapeHtml(c.name)).join(', ');
      return `<li>${escapeHtml(t.name)}${cities ? ': ' + cities : ''}</li>`;
    }).join('');
    sections.push(`<h4>Trips (${locations.trips.length})</h4><ul>${lis}</ul>`);
  }
  container.innerHTML = sections.join('');
}

/* Renders the UNESCO World Heritage accordion on the travel page. Gated on
   #unesco-accordion; markup and its rationale live in js/render-page.js, which
   generate-cards uses to bake the same tree into travel.html. */
export function renderUnescoAccordion(container, data) {
  if (!container) return;
  container.innerHTML = unescoAccordionLines(data).join('\n');
}

/* True when a link (its list of category slugs) should be shown under the
   active filter. 'all' matches everything. Pure + exported so the show/hide
   rule can be unit-tested without a DOM. */
export function linkMatchesFilter(categories, filter) {
  if (filter === 'all' || !filter) return true;
  return Array.isArray(categories) && categories.indexOf(filter) !== -1;
}

/* linksCountLabel() lives in js/render-page.js — the server-rendered count and
   the one this file rewrites on every filter click must read identically. */

/* Wire up the category filter chips: clicking a chip shows only the cards in
   that category (or all). Single-select, accessible (aria-pressed + a polite
   live count). No-op when handed a non-DOM container (unit tests). */
function wireLinksFilter(container) {
  if (!container || typeof container.querySelector !== 'function') return;
  const toolbar = container.querySelector('.links-toolbar');
  const countEl = container.querySelector('.links-count');
  if (!toolbar) return;
  const chips = Array.from(toolbar.querySelectorAll('.link-chip'));
  const items = Array.from(container.querySelectorAll('.link-card-item'));
  const total = items.length;

  const apply = (filter, label) => {
    let shown = 0;
    for (const item of items) {
      const cats = (item.getAttribute('data-categories') || '').split(' ').filter(Boolean);
      const match = linkMatchesFilter(cats, filter);
      item.hidden = !match;
      if (match) shown += 1;
    }
    for (const chip of chips) {
      const active = chip.getAttribute('data-filter') === filter;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (countEl) countEl.textContent = linksCountLabel(shown, total, filter === 'all' ? '' : label);
  };

  toolbar.addEventListener('click', (e) => {
    const chip = e.target.closest && e.target.closest('.link-chip');
    if (!chip || !toolbar.contains(chip)) return;
    apply(chip.getAttribute('data-filter'), chip.getAttribute('data-label') || chip.textContent.trim());
  });
}

/* Renders the curated blogroll on the links page and wires its filter chips.
   Gated on #links-grid; markup lives in js/render-page.js, which generate-cards
   uses to bake the same grid into links.html. The re-render is what lets the
   chips assume a DOM they built themselves. */
export function renderLinks(container, data) {
  if (!container) return;
  container.innerHTML = linksGridLines(data).join('\n');
  wireLinksFilter(container);
}

/* Run destroy() on every disposable when the page is being torn down.
   Wired to `pagehide` because it is the most reliable signal for a real
   unload. visibilitychange would be too aggressive — it fires on tab
   switches, where we want the canvases to resume rather than disappear.

   `event.persisted` is the part that matters, and skipping the check was a
   bug. When the browser puts the page into the back/forward cache it fires
   `pagehide` with persisted = true, and the document is then frozen *intact*:
   Back restores it as it stood, with no reload, no DOMContentLoaded and no
   re-init. Tearing down on that event meant Back returned a page whose hero
   canvas, navbar, ⌘K palette, mobile menu, back-to-top and scroll reveal had
   all been destroyed with nothing left to rebuild them — "open a link, come
   back, and it doesn't work any more". Chrome has done this for same-site
   navigations since 96, Safari far longer.

   A frozen page is not a leak. Its rAF loops are paused by the browser and
   resume on restore, its listeners are exactly what makes the restore work,
   and if the entry is evicted instead of restored the whole document is
   discarded wholesale. So on a persisted pagehide the correct action is
   nothing at all. */
export function initLifecycleCleanup(disposables) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  let disposed = false;
  const cleanup = (event) => {
    if (event && event.persisted) return;
    if (disposed) return;
    disposed = true;
    for (const d of disposables) {
      if (!d || typeof d.destroy !== 'function') continue;
      try { d.destroy(); } catch (_) { /* swallow — page is going away */ }
    }
  };
  window.addEventListener('pagehide', cleanup);
}

/* Swap a WebGL <canvas> for a pristine clone before a theme-switch rebuild.

   The colour-baked WebGL surfaces (noise-gradient hero, Three.js globe) force
   their context to be lost in destroy() (renderer.forceContextLoss() /
   WEBGL_lose_context.loseContext()) so teardown frees the GPU resources
   promptly. But a force-lost context is permanent for that node — getContext()
   keeps returning the same dead context, so rebuilding the instance on the
   *same* canvas paints onto a context that never restores and the surface goes
   blank (the bug behind "the globe disappears in light mode" and "the hero
   effect is gone after a theme switch").

   Replacing the node with cloneNode(false) gives the rebuild a fresh canvas
   that can acquire a live context, while preserving the id / classes / inline
   attributes so CSS and the FOUC fade-in still apply. Returns the live canvas
   (the clone when a swap happened, else the original), so callers must use the
   returned reference for the rebuild. No-op (returns the input) when the node
   is missing or detached. */
export function freshCanvasForRebuild(canvas) {
  if (!canvas || !canvas.parentNode || typeof canvas.cloneNode !== 'function') return canvas;
  const clone = canvas.cloneNode(false);
  canvas.parentNode.replaceChild(clone, canvas);
  return clone;
}

/* Test surface — ES module exports.
   UI behaviours (js/ui.js), DOM animations (js/animations.js), and the
   noise gradient (js/noise-gradient.js) are re-exported here so the test
   suite can keep importing them from ../js/main.js.

   The Three.js-backed classes (Globe3D, GlobeFallback2D, NeuralNetwork,
   NeuralNetwork2D) and geocodeLocations are intentionally NOT re-exported
   here: doing so would static-link globe.js/neural-net.js (and all of
   Three.js) back into the main chunk. Tests import them from their source
   modules instead. */
export {
  formatIsoDate,
  renderPublications,
  renderProjects,
  renderProjectCard,
  homepageProjects,
  PROJECTS_MAX_HOMEPAGE,
  renderCV,
  renderSkills,
  setFooterYear,
  initTheme,
  initCardTilt,
  initSkillBars,
  initAnimatedFavicon,
  initScroll3D,
  initNavbar,
  initMobileMenu,
  initBackToTop,
  initCommandPalette,
  initScrollReveal,
  initCounters,
  animateCounter,
  NoiseGradient,
  decodeBase64,
  getObfuscatedContactEmail,
  initEmailObfuscation,
  initCmdTriggerHint,
};

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

  /* Render dynamic content. Every section below is already server-rendered
     into the HTML by generate-cards, so these re-renders are enhancement, not
     load-bearing — which is what lets them wait for a dynamic import(). The
     element check comes first so a page without the section never fetches the
     data at all. */
  const pubList = document.getElementById('publications-list');
  if (pubList) {
    import('../data/publications.js').then(({ PUBLICATIONS }) => {
      renderPublications(PUBLICATIONS);
      revealNewContent(pubList);
    });
  }
  const projGrid = document.getElementById('projects-grid');
  if (projGrid) {
    import('../data/projects.js').then(({ PROJECTS }) => {
      renderProjects(PROJECTS);
      revealNewContent(projGrid);
    });
  }
  const cvTimeline = document.getElementById('cv-timeline');
  const cvSkills = document.getElementById('cv-skills');
  if (cvTimeline || cvSkills) {
    import('../data/cv.js').then(({ CV_CAREER, CV_EDUCATION, CV_SKILLS }) => {
      renderCV(CV_CAREER, CV_EDUCATION);
      renderSkills(CV_SKILLS);
      revealNewContent(cvTimeline);
      revealNewContent(cvSkills);
    });
  }
  setFooterYear();

  /* Each disposable below is recorded so a single pagehide handler at the end
     of init can release every WebGL context, RAF loop, observer, and event
     listener in one go (avoids leaks when bfcache evicts the page or the user
     reloads). The chrome inits (navbar / mobile menu / command palette /
     back-to-top) return a teardown fn that removes their document/window-level
     listeners + observers; the pointer/parallax enhancers do too, and the
     WebGL/Canvas instances expose destroy() — initLifecycleCleanup() handles
     both shapes. */
  const _disposables = [];
  const _pushTeardown = (fn) => { if (typeof fn === 'function') _disposables.push({ destroy: fn }); };

  /* UI behaviours */
  _pushTeardown(initTheme());
  _pushTeardown(initNavbar());
  _pushTeardown(initMobileMenu());
  initEmailObfuscation();
  _pushTeardown(initBackToTop());
  _pushTeardown(initCommandPalette());
  initCmdTriggerHint();
  initTaglineReveal();

  /* Scroll reveals (must come after content injection) */
  _pushTeardown(initScrollReveal());
  _pushTeardown(initCounters());

  /* Scroll-driven effects: start immediately (lightweight, needed at any scroll pos) */
  _pushTeardown(initScroll3D());

  /* Pointer-only enhancement (card tilt) — deferred to idle time so it does
     not compete with content rendering on the main thread. requestIdleCallback
     fires within milliseconds on a quiet page; the 2 s timeout guarantees it
     still initialises on heavily loaded devices.                              */
  const whenIdle = typeof requestIdleCallback !== 'undefined'
    ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 0);
  whenIdle(() => {
    _pushTeardown(initCardTilt());
  });

  /* CV skill bars */
  _pushTeardown(initSkillBars());

  /* Animated favicon — starts after fonts load (async, non-blocking) */
  initAnimatedFavicon();

  /* ── Hero background canvases ──────────────────────────────────────────
     Both the WebGL noise gradient and the Canvas2D neural net bake their
     palette colours in at construction (the shader source / gradient stops).
     They are therefore built through small factory closures so a theme switch
     can tear the instance down and rebuild it with the now-active palette. */
  let noiseCanvas  = document.getElementById('noise-canvas');
  let neuralCanvas = document.getElementById('neural-canvas');
  let noiseInstance  = null;
  let neuralInstance = null;
  let neuralStarted  = false;

  /* Noise gradient — raw WebGL, runs on devices that support it */
  const buildNoise = () => {
    if (!noiseCanvas) return;
    if (!prefersReducedMotion() && !isLowPowerDevice() && hasWebGLSupport()) {
      noiseCanvas.style.display = '';
      noiseInstance = new NoiseGradient(noiseCanvas);
      _disposables.push(noiseInstance);
    } else {
      noiseCanvas.style.display = 'none';
    }
  };
  buildNoise();

  /* Canvas2D hero background (no Three.js on this page — see neural-net.js).
     Two implementations share the canvas:
       · js/cnn-hero.js   — a real LeNet-5 forward pass replayed from
                            precomputed activations, on roomy pointer-driven
                            viewports where its labels are legible;
       · js/neural-net.js — the lighter drifting particle field everywhere else.
     Whichever applies is dynamically imported and deferred until the first
     user interaction (mousemove / scroll / touchstart) so it stays off the
     critical path on load; the noise gradient fills the hero meanwhile. The
     branch happens *before* the import so phones never download the CNN
     chunk's activation data. On reduced-motion the canvas is hidden entirely. */
  const buildNeural = () => {
    if (!neuralCanvas || prefersReducedMotion()) return;
    const isCnn = supportsCnnHero();
    /* Dropping to the particle field (a narrow window, a coarse pointer) means
       there is no LeNet on screen any more, so the aside describing one has to
       go with it. */
    if (!isCnn) { heroCnnPainted = false; syncHeroCnnLink(); }
    const loading = isCnn
      ? import('./cnn-hero.js').then((m) => m.CnnHero)
      : import('./neural-net.js').then((m) => m.NeuralNetwork2D);
    loading.then((Background) => {
      /* Fade the canvas in once the first frame has painted (see the
         #neural-canvas opacity transition in css/styles.css), so the
         network materialises gently instead of popping in fully-formed. */
      const reveal = () => {
        neuralCanvas.classList.add('is-visible');
        /* Same moment the network becomes visible, and the only moment the
           aside's claim becomes true — see syncHeroCnnLink below. */
        if (isCnn) { heroCnnPainted = true; syncHeroCnnLink(); }
      };
      neuralInstance = new Background(neuralCanvas, reveal);
      _disposables.push(neuralInstance);
    });
  };

  /* The hero's aside says "The network behind this text is a real LeNet-5 —
     draw it a digit". That is a claim about something the visitor can see, so
     it may only be on screen while the thing is.

     It used to be gated on supportsCnnHero() alone, evaluated immediately, so
     that it would not have to wait for a deferred import. But buildNeural() is
     deliberately held back until the first mousemove / scroll / touchstart, to
     keep the hero off the critical path — which meant that on arrival the
     sentence sat under an empty black rectangle, asserting a network that had
     not been drawn. Brief for anyone using a mouse; permanent for every
     headless renderer, social-preview fetcher and print.

     So eligibility and existence are now separate conditions: supportsCnnHero()
     and reduced-motion still decide whether it *can* appear, and heroCnnPainted
     — set from the same callback that fades the canvas in — decides whether it
     does. */
  let heroCnnPainted = false;
  const heroCnnLink = document.querySelector('.hero-cnn-link');
  const syncHeroCnnLink = () => {
    if (!heroCnnLink) return;
    heroCnnLink.hidden = !heroCnnPainted || prefersReducedMotion() || !supportsCnnHero();
  };
  syncHeroCnnLink();

  /* Tear the current hero background down and build the one that now applies —
     shared by the theme switch and the breakpoint watcher below. Canvas2D
     survives reuse, but swapping the node gives the rebuild a clean drawing
     buffer (and drops the .is-visible class, so it fades back in). */
  const rebuildNeural = () => {
    if (!neuralStarted || !neuralInstance) return;
    try { neuralInstance.destroy(); } catch (_) { /* ignore */ }
    neuralInstance = null;
    neuralCanvas = freshCanvasForRebuild(neuralCanvas);
    buildNeural();
  };

  /* The hero background starts on its own.

     It used to wait for a mousemove, scroll or touchstart, which kept it off
     the critical path but made "is there a network behind the name?" depend on
     whether the visitor happened to move. Anyone reading without touching the
     mouse saw an empty rectangle; so did every keyboard user, every headless
     renderer, every social-preview fetcher and every print. The hero is the
     one idea on this page worth showing, and gating it on an input event was
     asking for a gesture in exchange for the thing the page is about.

     Idle time, not load time. requestIdleCallback runs once the browser has
     nothing more pressing, so the fetch and first paint still sit behind
     layout, the fonts and the static content — the original goal — without
     needing a person to trigger them. The interaction listeners stay as an
     accelerator: someone who moves the mouse immediately gets it immediately
     rather than at the next idle slot.

     The timeout is the part that matters for the silent cases. A busy main
     thread can defer an idle callback indefinitely, and browsers withhold it
     entirely on a page that never becomes interactive — exactly the headless
     case — so the 1500 ms deadline is what guarantees a paint. Browsers
     without requestIdleCallback (Safari shipped it late) get the same
     deadline via setTimeout. */
  if (neuralCanvas) {
    if (prefersReducedMotion()) {
      neuralCanvas.style.display = 'none';
    } else {
      const IDLE_DEADLINE = 1500;
      const startNeural = () => {
        if (neuralStarted) return;
        neuralStarted = true;
        ['mousemove', 'scroll', 'touchstart'].forEach(evt =>
          window.removeEventListener(evt, startNeural));
        buildNeural();
      };
      ['mousemove', 'scroll', 'touchstart'].forEach(evt =>
        window.addEventListener(evt, startNeural, { passive: true, once: true }));

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(startNeural, { timeout: IDLE_DEADLINE });
      } else {
        setTimeout(startNeural, IDLE_DEADLINE);
      }
    }
  }

  /* Recolour the colour-baked hero canvases on a theme switch — destroy the
     old instances and rebuild with the active palette (getTheme() inside each
     module now resolves dark/light). Only rebuild the neural net if it had
     already started, so we never pull its chunk early. */
  const onThemeChange = () => {
    if (noiseInstance) {
      try { noiseInstance.destroy(); } catch (_) { /* ignore */ }
      noiseInstance = null;
      /* destroy() force-lost the WebGL context — rebuild on a fresh canvas. */
      noiseCanvas = freshCanvasForRebuild(noiseCanvas);
      buildNoise();
    }
    rebuildNeural();
  };
  window.addEventListener('themechange', onThemeChange);
  _pushTeardown(() => window.removeEventListener('themechange', onThemeChange));

  /* Resizing across the CNN-hero breakpoint swaps the two backgrounds —
     without this, a window dragged narrow would keep painting a scene whose
     labels no longer fit (and vice versa). */
  if (typeof window.matchMedia === 'function') {
    const heroMq = window.matchMedia(CNN_HERO_QUERY);
    if (typeof heroMq.addEventListener === 'function') {
      const onHeroBreakpoint = () => { syncHeroCnnLink(); rebuildNeural(); };
      heroMq.addEventListener('change', onHeroBreakpoint);
      _pushTeardown(() => heroMq.removeEventListener('change', onHeroBreakpoint));
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

  /* Three.js Globe — geocode any entries missing lat/lon, then build. Built
     through a closure so a theme switch can rebuild it with the active palette
     (globe.js resolves colours from getTheme() per instance). */
  let globeCanvas = document.getElementById('globe-canvas');
  let globeInstance = null;
  /* Monotonic build token: rapid theme toggles can fire several async
     buildGlobe() chains; only the latest one is allowed to construct. */
  let globeBuildToken = 0;
  const buildGlobe = () => {
    const token = ++globeBuildToken;
    /* Dynamically imported (Three.js) and only when the globe nears the
       viewport — so Three.js downloads lazily, on scroll, not on load. */
    /* data/locations.js comes down here rather than at the top of the file:
       28 KB of pins that only travel.html has a canvas for. Importing it also
       sets globalThis.LOCATIONS, which is how EuropeMap2D and Globe3D read it
       from their constructor bodies. */
    return Promise.all([
      import('./globe.js'),
      import('../data/locations.js'),
    ]).then(([{ geocodeLocations, Globe3D, GlobeFallback2D }, { LOCATIONS }]) =>
      geocodeLocations(LOCATIONS).then(() => {
        /* A newer build superseded this one (e.g. another theme switch landed
           while geocoding was in flight). Bail before constructing so we never
           overwrite the fresh globe with a stale one or leak an orphaned
           WebGL context. */
        if (token !== globeBuildToken) return;
        globeInstance = (prefersReducedMotion() || !hasWebGLSupport())
          ? new GlobeFallback2D(globeCanvas)
          : new Globe3D(globeCanvas);
        _disposables.push(globeInstance);
        /* Render the SR-accessible alternative list once the location data
           is final (i.e. all geocoding has resolved). */
        const a11yList = document.getElementById('globe-a11y-list');
        if (a11yList) renderGlobeA11yList(a11yList, LOCATIONS);
      })
    ).catch((err) => {
      /* Three.js import failed or geocoding (Nominatim) is unreachable —
         leave the globe unbuilt rather than throwing into the global
         unhandledrejection handler. The static a11y list still describes
         the locations for non-visual users. */
      if (typeof console !== 'undefined') console.warn('Globe build skipped:', err);
    });
  };
  if (globeCanvas) {
    _lazyOnViewport(globeCanvas, buildGlobe);
  }

  /* 2D Europe Map — Canvas-based representation of European locations.

     Dynamically imported, like the globe above and for the same reason: a
     static `import './europe-map.js'` put its chunk in the eager module graph
     of *every* page, so all twenty pages without a #europe-canvas were
     downloading, parsing and executing 10 KB for a map they do not have. Only
     travel.html has the canvas, and only when it nears the viewport. */
  let europeCanvas = document.getElementById('europe-canvas');
  let europeInstance = null;
  let europeBuildToken = 0;
  const buildEurope = () => {
    const token = ++europeBuildToken;
    /* locations.js alongside the map for the same reason as the globe — and it
       must resolve before the constructor runs, which reads globalThis. */
    return Promise.all([
      import('./europe-map.js'),
      import('../data/locations.js'),
    ]).then(([{ EuropeMap2D }]) => {
      /* A newer build superseded this one (a theme switch landed while the
         import was in flight) — same guard the globe uses. */
      if (token !== europeBuildToken) return;
      europeInstance = new EuropeMap2D(europeCanvas);
      _disposables.push(europeInstance);
    }).catch((err) => {
      if (typeof console !== 'undefined') console.warn('Europe map build skipped:', err);
    });
  };
  if (europeCanvas) {
    _lazyOnViewport(europeCanvas, buildEurope);
  }

  /* Recolour the travel-page maps on a theme switch — only if already built
     (don't pull Three.js early). Rebuild reuses the same lazy builders. */
  const onMapThemeChange = () => {
    if (globeInstance) {
      try { globeInstance.destroy?.(); } catch (_) { /* ignore */ }
      globeInstance = null;
      /* Globe3D.destroy() calls renderer.forceContextLoss(); the WebGL
         context can't be revived on the same node, so rebuild on a clone. */
      globeCanvas = freshCanvasForRebuild(globeCanvas);
      buildGlobe();
    }
    if (europeInstance) {
      try { europeInstance.destroy?.(); } catch (_) { /* ignore */ }
      europeInstance = null;
      /* Canvas2D — swap for a clean buffer to match the globe rebuild path. */
      europeCanvas = freshCanvasForRebuild(europeCanvas);
      buildEurope();
    }
  };
  window.addEventListener('themechange', onMapThemeChange);
  _pushTeardown(() => window.removeEventListener('themechange', onMapThemeChange));

  /* UNESCO World Heritage accordion (travel page only) — 20 KB of tree that
     the other 20 pages have no use for. */
  const unescoAccordion = document.getElementById('unesco-accordion');
  if (unescoAccordion) {
    import('../data/unesco.js').then(({ UNESCO }) => {
      renderUnescoAccordion(unescoAccordion, UNESCO);
      revealNewContent(unescoAccordion);
    });
  }

  /* Curated blogroll (links page only) */
  const linksGrid = document.getElementById('links-grid');
  if (linksGrid) {
    import('../data/links.js').then(({ LINKS }) => {
      renderLinks(linksGrid, LINKS);
      revealNewContent(linksGrid);
    });
  }

  /* Interactive MNIST lab (projects/mnist-lenet.html only).
     Dynamically imported behind the element check, so the int8 weights
     (data/lenet-weights.js, ~44 KB gzip) and the forward pass never reach
     any other page — the homepage hero replays precomputed activations and
     downloads no model at all. */
  const mnistLab = document.getElementById('mnist-lab');
  if (mnistLab) {
    import('./mnist-lab.js')
      .then(({ initMnistLab }) => initMnistLab(mnistLab))
      .then((lab) => { if (lab) _disposables.push(lab); })
      .catch((err) => {
        if (typeof console !== 'undefined') console.warn('MNIST lab failed to load:', err);
      });
  }

  initLifecycleCleanup(_disposables);

  });
}
