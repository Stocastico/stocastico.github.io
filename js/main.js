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
     js/hero-shader.js    — iridescent hero name shader
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
   mock hook (__setThreeForTests) directly from ./three-context.js. */

/* ─── Data files ──────────────────────────────────────────
   PROJECTS / PUBLICATIONS / CV_* are imported by name; render
   functions take them as parameters (defaulting to these
   imports) so tests can inject mocks without touching globals.

   LOCATIONS still rides on globalThis because Globe3D and
   EuropeMap2D read it as a bare global from constructor bodies;
   migrating those is a separate refactor. */
import '../data/locations.js';
import { PUBLICATIONS as DEFAULT_PUBLICATIONS } from '../data/publications.js';
import { PROJECTS as DEFAULT_PROJECTS } from '../data/projects.js';
import { CV_CAREER as DEFAULT_CV_CAREER, CV_EDUCATION as DEFAULT_CV_EDUCATION, CV_SKILLS as DEFAULT_CV_SKILLS } from '../data/cv.js';
import { UNESCO as DEFAULT_UNESCO } from '../data/unesco.js';
import { LINKS as DEFAULT_LINKS } from '../data/links.js';
import './europe-map.js';

/* Shared environment helpers + escapeHtml (shared with js/ui.js) */
import { isLowPowerDevice, prefersReducedMotion, hasWebGLSupport, escapeHtml } from './utils.js';

/* Theme colours — single source of truth (data/palettes.yaml → js/theme.js).
   Only the favicon renderer below reads THEME/rgba now; the noise shader
   imports its own colours inside js/noise-gradient.js. */
import { THEME, rgba } from './theme.js';

/* Hero name iridescent WebGL shader (raw WebGL, no Three.js) */
import { HeroNameShader } from './hero-shader.js';

/* Hero background noise gradient (raw WebGL, no Three.js) */
import { NoiseGradient } from './noise-gradient.js';

/* neural-net.js (NeuralNetwork/NeuralNetwork2D) and globe.js (Globe3D/
   GlobeFallback2D/geocodeLocations) are dynamically imported at their init
   sites below — see the Three.js loading-strategy note at the top. */

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

/* UI behaviours: navbar, command palette, side dots, mobile menu, counters,
   tagline reveal, research carousel, etc. (extracted to js/ui.js) */
import {
  initCounters,
  animateCounter,
  initTheme,
  initNavbar,
  initBackToTop,
  initCommandPalette,
  initSideDots,
  initTaglineReveal,
  initCursorGlow,
  initMobileMenu,
  initResearchCarousel,
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
function renderPublications(publications = DEFAULT_PUBLICATIONS) {
  const list = document.getElementById('publications-list');
  if (!list) return;

  list.innerHTML = publications.slice(0, 3).map((pub, i) => `
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
  const bgSrc = project.bg || '';
  const hasBg = Boolean(bgSrc);
  /* Make the url() root-absolute. Chromium resolves a relative url() inside a
     CSS custom property against the stylesheet that *uses* var(--card-bg)
     (the bundled /assets/styles.css), not the document — so a bare
     "img/projects/…" path would 404 at /assets/img/projects/…. Leading "/"
     pins it to the site root. */
  const bgUrl = /^(https?:|data:|\/)/.test(bgSrc) ? bgSrc : '/' + bgSrc;
  const style = hasBg
    ? ' style="--card-bg: url(\'' + escapeHtml(bgUrl) + '\')"'
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

function renderProjects(projects = DEFAULT_PROJECTS) {
  var grid = document.getElementById('projects-grid');
  if (!grid) return;

  if (!projects.length) {
    grid.innerHTML = '<div class="projects-coming-soon" data-animate>Coming soon — projects will appear here.</div>';
    return;
  }

  // On projects.html (listing page) the grid opts in via data-render="all"
  // and shows every project. Elsewhere (homepage) we pick a random subset.
  var showAll = grid.getAttribute && grid.getAttribute('data-render') === 'all';
  var shown;
  if (showAll) {
    shown = projects;
  } else {
    var pool = projects.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    shown = pool.slice(0, PROJECTS_MAX_HOMEPAGE);
  }
  grid.innerHTML = shown.map(renderProjectCard).join('');

  /* Drop any footer from a previous render so re-renders don't stack it. */
  var existingFooter = grid.parentNode && grid.parentNode.querySelector
    ? grid.parentNode.querySelector('.projects-view-all') : null;
  if (existingFooter) existingFooter.remove();

  if (!showAll && projects.length > PROJECTS_MAX_HOMEPAGE) {
    var footer = document.createElement('div');
    footer.className = 'projects-view-all';
    footer.setAttribute('data-animate', '');
    footer.setAttribute('data-delay', String(shown.length * 80));
    footer.innerHTML = '<a href="projects.html" class="btn btn-ghost">View all projects &rarr;</a>';
    grid.parentNode.appendChild(footer);
  }

  _initLazyCardBackgrounds(grid);
}

/* Defer the per-card background-image fetch until the card approaches the
   viewport. CSS keeps `background-image: var(--card-bg)` gated behind a
   `.bg-loaded` class; the IntersectionObserver below adds that class as
   each card scrolls in. The full project listing page can have 6–10 cards
   with multi-hundred-KB hero images each — eagerly fetching all of them
   on page load wasted significant bandwidth. */
function _initLazyCardBackgrounds(grid) {
  if (typeof grid?.querySelectorAll !== 'function') return;
  var cards = grid.querySelectorAll('.project-card--has-bg');
  if (!cards.length) return;
  if (typeof IntersectionObserver === 'undefined') {
    /* Fallback: just load everything */
    cards.forEach(function(c) { c.classList?.add('bg-loaded'); });
    return;
  }
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('bg-loaded');
      io.unobserve(e.target);
    });
  }, { rootMargin: '300px 0px' });
  cards.forEach(function(c) { io.observe(c); });
}

/* Footer year */
function setFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

/* ═══════════════════════════════════════════════════════════
   CURRICULUM VITAE — TIMELINE RENDERING
   Tests pass mocked career/education arrays as arguments.
   One card per job/degree — all details visible, no flipping.
   ═══════════════════════════════════════════════════════════ */
function renderCV(career = DEFAULT_CV_CAREER, education = DEFAULT_CV_EDUCATION) {
  if (typeof document === 'undefined') return;
  const timeline = document.getElementById('cv-timeline');
  if (!timeline) return;

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
  (education || []).forEach(function(e) {
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
  (career || []).forEach(function(e) {
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
   Tests pass a mocked CV_SKILLS object as the first argument.
   ═══════════════════════════════════════════════════════════ */
function renderSkills(skills = DEFAULT_CV_SKILLS) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('cv-skills');
  if (!container) return;

  const { technical = [], leadership = [], languages = [] } = skills;

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

/* Renders the UNESCO World Heritage accordion on the travel page: a two-level
   native-disclosure tree (continent → country) whose leaves are links to each
   site's official whc.unesco.org page. Built from <details>/<summary> so it is
   keyboard-operable and degrades gracefully with no extra JS. Site URLs are
   already restricted to https:// by the generator (scripts/generate-unesco.js),
   and every field is HTML-escaped here as defence in depth. */
export function renderUnescoAccordion(container, data) {
  if (!container) return;
  const continents = (data && Array.isArray(data.continents)) ? data.continents : [];

  if (!continents.length) {
    container.innerHTML =
      '<p class="unesco-empty">The list of visited sites is on its way &mdash; check back soon.</p>';
    return;
  }

  const countSites = (countries) =>
    countries.reduce((n, k) => n + (k.sites ? k.sites.length : 0), 0);

  const html = continents.map((cont) => {
    const countries = (cont.countries || []).map((country) => {
      const sites = (country.sites || []).map((site) => {
        const year = site.year
          ? ` <span class="unesco-year">(${escapeHtml(String(site.year))})</span>`
          : '';
        return `<li><a class="unesco-site" href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site.name)}</a>${year}</li>`;
      }).join('');
      return (
        `<details class="unesco-country"><summary>` +
        `<span class="unesco-name">${escapeHtml(country.name)}</span>` +
        `<span class="unesco-count">${(country.sites || []).length}</span></summary>` +
        `<ul class="unesco-sites">${sites}</ul></details>`
      );
    }).join('');
    return (
      `<details class="unesco-continent"><summary>` +
      `<span class="unesco-name">${escapeHtml(cont.name)}</span>` +
      `<span class="unesco-count">${countSites(cont.countries || [])}</span></summary>` +
      `<div class="unesco-countries">${countries}</div></details>`
    );
  }).join('');

  container.innerHTML = html;
}

/* Renders the curated blogroll on the links page: a grid of category sections,
   each listing external links (name + optional one-line description) to sites
   Stefano follows. Link URLs are already restricted to https:// by the
   generator (scripts/generate-links.js); every field is HTML-escaped here as
   defence in depth. Gated on #links-grid (links page only). */
export function renderLinks(container, data) {
  if (!container) return;
  const categories = (data && Array.isArray(data.categories)) ? data.categories : [];

  if (!categories.length) {
    container.innerHTML =
      '<p class="links-empty">The reading list is on its way &mdash; check back soon.</p>';
    return;
  }

  const html = categories.map((cat) => {
    const links = (cat.links || []).map((link) => {
      const desc = link.description
        ? `<p class="link-card-desc">${escapeHtml(link.description)}</p>`
        : '';
      let host = '';
      try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch (_) { host = ''; }
      const hostLabel = host ? `<span class="link-card-host">${escapeHtml(host)}</span>` : '';
      return (
        `<li><a class="link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">` +
        `<span class="link-card-head"><span class="link-card-name">${escapeHtml(link.name)}</span>` +
        `<svg class="link-card-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">` +
        `<path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
        `</span>${desc}${hostLabel}</a></li>`
      );
    }).join('');
    const blurb = cat.blurb
      ? `<p class="links-category-blurb">${escapeHtml(cat.blurb)}</p>`
      : '';
    return (
      `<section class="links-category">` +
      `<h2 class="links-category-title">${escapeHtml(cat.name)}</h2>${blurb}` +
      `<ul class="links-list">${links}</ul></section>`
    );
  }).join('');

  container.innerHTML = html;
}

/* Run destroy() on every disposable when the page is being torn down.
   Wired to `pagehide` because it is the most reliable signal for both
   classic unloads and bfcache evictions. visibilitychange would be too
   aggressive — it fires on tab switches, where we want the canvases
   to resume rather than disappear. */
export function initLifecycleCleanup(disposables) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    for (const d of disposables) {
      if (!d || typeof d.destroy !== 'function') continue;
      try { d.destroy(); } catch (_) { /* swallow — page is going away */ }
    }
  };
  window.addEventListener('pagehide', cleanup);
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
  initCommandPalette,
  initScrollReveal,
  initCounters,
  animateCounter,
  HeroNameShader,
  NoiseGradient,
  decodeBase64,
  getObfuscatedContactEmail,
  initEmailObfuscation,
  initResearchCarousel,
  initCmdTriggerHint,
  initCardFlip,
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

  /* Each WebGL/Canvas instance below is recorded so a single pagehide
     handler at the end of init can release every WebGL context, RAF
     loop, observer, and event listener in one go (avoids leaks when
     bfcache evicts the page or the user reloads). */
  const _disposables = [];

  /* Noise gradient — raw WebGL, runs on devices that support it */
  const noiseCanvas = document.getElementById('noise-canvas');
  if (noiseCanvas && !prefersReducedMotion() && !isLowPowerDevice() && hasWebGLSupport()) {
    _disposables.push(new NoiseGradient(noiseCanvas));
  } else if (noiseCanvas) {
    noiseCanvas.style.display = 'none';
  }

  /* Three.js neural network — falls back to Canvas2D when WebGL is missing.
     Dynamically imported so Three.js stays out of the main chunk, and deferred
     to idle time so its ~130 KB download stays off the critical path — the
     hero already has the noise gradient + name shader while it loads. */
  const canvas = document.getElementById('neural-canvas');
  if (canvas) {
    if (prefersReducedMotion()) {
      canvas.style.display = 'none';
    } else {
      whenIdle(() => {
        import('./neural-net.js').then(({ NeuralNetwork, NeuralNetwork2D }) => {
          _disposables.push(
            hasWebGLSupport() ? new NeuralNetwork(canvas) : new NeuralNetwork2D(canvas),
          );
        });
      });
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
    /* Dynamically imported (Three.js) and only when the globe nears the
       viewport — so Three.js downloads lazily, on scroll, not on load. */
    _lazyOnViewport(globeCanvas, () => {
      import('./globe.js').then(({ geocodeLocations, Globe3D, GlobeFallback2D }) => {
        geocodeLocations(LOCATIONS).then(() => {
          const inst = (prefersReducedMotion() || !hasWebGLSupport())
            ? new GlobeFallback2D(globeCanvas)
            : new Globe3D(globeCanvas);
          _disposables.push(inst);
          /* Render the SR-accessible alternative list once the location data
             is final (i.e. all geocoding has resolved). */
          const a11yList = document.getElementById('globe-a11y-list');
          if (a11yList) renderGlobeA11yList(a11yList, LOCATIONS);
        });
      });
    });
  }

  /* 2D Europe Map — Canvas-based representation of European locations */
  const europeCanvas = document.getElementById('europe-canvas');
  if (europeCanvas && typeof LOCATIONS !== 'undefined' && typeof EuropeMap2D !== 'undefined') {
    _lazyOnViewport(europeCanvas, () => _disposables.push(new EuropeMap2D(europeCanvas)));
  }

  /* UNESCO World Heritage accordion (travel page only) */
  const unescoAccordion = document.getElementById('unesco-accordion');
  if (unescoAccordion) renderUnescoAccordion(unescoAccordion, DEFAULT_UNESCO);

  /* Curated blogroll (links page only) */
  const linksGrid = document.getElementById('links-grid');
  if (linksGrid) renderLinks(linksGrid, DEFAULT_LINKS);

  /* Hero name — iridescent WebGL shader (progressive enhancement) */
  const nameH1 = document.getElementById('hero-name');
  const nameCanvas = document.getElementById('name-canvas');
  if (nameH1 && nameCanvas) {
    if (!prefersReducedMotion() && hasWebGLSupport()) {
      _disposables.push(new HeroNameShader(nameH1, nameCanvas));
    }
  }

  initLifecycleCleanup(_disposables);

  });
}
