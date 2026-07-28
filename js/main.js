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
import { isLowPowerDevice, prefersReducedMotion, hasWebGLSupport, escapeHtml, supportsCnnHero, CNN_HERO_QUERY } from './utils.js';

/* Card / list-item markup — shared with the static generator
   (scripts/generate-cards.mjs) so SSR and client markup never drift. */
import { projectCardHtml, publicationsListLines } from './render-cards.js';

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
  initTimelineScroll3D,
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
function renderPublications(publications = DEFAULT_PUBLICATIONS) {
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
function renderProjectCard(project, i) {
  return projectCardHtml(project, i);
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

    /* Column 1 is the spine, column 2 the concurrent career cards (one per
       grid row), column 3 the education card beside them. Placement is inline
       because the row index depends on how many careers the entry overlaps,
       which CSS cannot express — see .tl-concurrent-block in css/styles.css. */
    var leftCells = careerPairs.map(function(c, i) {
      var row = i + 1;
      return '<div class="tl-left tl-row--career" style="grid-column:2;grid-row:' + row + '">'
           +   cardHtml(c, 'career')
           + '</div>'
           + '<div class="tl-spine" style="grid-column:1;grid-row:' + row + '">'
           +   '<div class="tl-dot" aria-hidden="true"></div>'
           + '</div>';
    }).join('');

    /* Education card spans every career row it overlaps */
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

/* True when a link (its list of category slugs) should be shown under the
   active filter. 'all' matches everything. Pure + exported so the show/hide
   rule can be unit-tested without a DOM. */
export function linkMatchesFilter(categories, filter) {
  if (filter === 'all' || !filter) return true;
  return Array.isArray(categories) && categories.indexOf(filter) !== -1;
}

/* Human-readable "Showing …" summary for the live count region. */
function linksCountLabel(shown, total, filterLabel) {
  const noun = total === 1 ? 'site' : 'sites';
  if (!filterLabel) return `Showing all ${total} ${noun}`;
  return `Showing ${shown} ${shown === 1 ? 'site' : 'sites'} in ${filterLabel}`;
}

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

/* Renders the curated blogroll on the links page: a category filter bar plus a
   single, de-duplicated grid of external link cards. Each site appears once and
   is tagged with every category it belongs to, so filtering by category never
   duplicates an entry. The generator (scripts/generate-links.js) already
   restricts URLs to https:// and de-duplicates by URL; every field is
   HTML-escaped here as defence in depth. Gated on #links-grid (links page). */
export function renderLinks(container, data) {
  if (!container) return;
  const categories = (data && Array.isArray(data.categories)) ? data.categories : [];
  const links = (data && Array.isArray(data.links)) ? data.links : [];

  if (!links.length) {
    container.innerHTML =
      '<p class="links-empty">The reading list is on its way &mdash; check back soon.</p>';
    return;
  }

  const labelOf = new Map(categories.map((c) => [c.slug, c.label]));
  const countOf = new Map(categories.map((c) => [c.slug, 0]));
  for (const link of links) {
    for (const slug of (link.categories || [])) {
      if (countOf.has(slug)) countOf.set(slug, countOf.get(slug) + 1);
    }
  }

  const chips = [
    `<button class="link-chip is-active" type="button" data-filter="all" data-label="All" aria-pressed="true">` +
    `All <span class="link-chip-count">${links.length}</span></button>`,
  ].concat(categories.map((cat) => (
    `<button class="link-chip" type="button" data-filter="${escapeHtml(cat.slug)}" data-label="${escapeHtml(cat.label)}" aria-pressed="false">` +
    `${escapeHtml(cat.label)} <span class="link-chip-count">${countOf.get(cat.slug) || 0}</span></button>`
  ))).join('');

  const cards = links.map((link) => {
    const cats = Array.isArray(link.categories) ? link.categories : [];
    const desc = link.description
      ? `<p class="link-card-desc">${escapeHtml(link.description)}</p>`
      : '';
    let host = '';
    try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch (_) { host = ''; }
    const hostLabel = host ? `<span class="link-card-host">${escapeHtml(host)}</span>` : '';
    const badges = cats.map((slug) => (
      `<span class="link-card-cat">${escapeHtml(labelOf.get(slug) || slug)}</span>`
    )).join('');
    const badgeRow = badges ? `<span class="link-card-cats">${badges}</span>` : '';
    return (
      `<li class="link-card-item" data-categories="${escapeHtml(cats.join(' '))}">` +
      `<a class="link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">` +
      `<span class="link-card-head"><span class="link-card-name">${escapeHtml(link.name)}</span>` +
      `<svg class="link-card-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">` +
      `<path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
      `</span>${desc}<span class="link-card-foot">${badgeRow}${hostLabel}</span></a></li>`
    );
  }).join('');

  container.innerHTML =
    `<div class="links-toolbar" role="group" aria-label="Filter links by category">${chips}</div>` +
    `<p class="links-count" role="status" aria-live="polite">${linksCountLabel(links.length, links.length, '')}</p>` +
    `<ul class="links-list">${cards}</ul>`;

  wireLinksFilter(container);
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
  PROJECTS_MAX_HOMEPAGE,
  renderCV,
  renderSkills,
  setFooterYear,
  initTheme,
  initCardTilt,
  initSkillBars,
  initTimelineScroll3D,
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

  /* Render dynamic content (static sections are already in HTML) */
  renderPublications();
  renderProjects();
  renderCV();      /* timeline entries from data/cv.js */
  renderSkills();  /* skill panels from CV_SKILLS in data/cv.js */
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

  /* CV timeline and skill bars */
  _pushTeardown(initTimelineScroll3D());
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
    const loading = supportsCnnHero()
      ? import('./cnn-hero.js').then((m) => m.CnnHero)
      : import('./neural-net.js').then((m) => m.NeuralNetwork2D);
    loading.then((Background) => {
      /* Fade the canvas in once the first frame has painted (see the
         #neural-canvas opacity transition in css/styles.css), so the
         network materialises gently instead of popping in fully-formed. */
      const reveal = () => neuralCanvas.classList.add('is-visible');
      neuralInstance = new Background(neuralCanvas, reveal);
      _disposables.push(neuralInstance);
    });
  };

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

  if (neuralCanvas) {
    if (prefersReducedMotion()) {
      neuralCanvas.style.display = 'none';
    } else {
      const startNeural = () => {
        if (neuralStarted) return;
        neuralStarted = true;
        ['mousemove', 'scroll', 'touchstart'].forEach(evt =>
          window.removeEventListener(evt, startNeural));
        buildNeural();
      };
      ['mousemove', 'scroll', 'touchstart'].forEach(evt =>
        window.addEventListener(evt, startNeural, { passive: true, once: true }));
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
      const onHeroBreakpoint = () => rebuildNeural();
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
    return import('./globe.js').then(({ geocodeLocations, Globe3D, GlobeFallback2D }) =>
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
  if (globeCanvas && typeof LOCATIONS !== 'undefined') {
    _lazyOnViewport(globeCanvas, buildGlobe);
  }

  /* 2D Europe Map — Canvas-based representation of European locations */
  let europeCanvas = document.getElementById('europe-canvas');
  let europeInstance = null;
  const buildEurope = () => {
    europeInstance = new EuropeMap2D(europeCanvas);
    _disposables.push(europeInstance);
  };
  if (europeCanvas && typeof LOCATIONS !== 'undefined' && typeof EuropeMap2D !== 'undefined') {
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

  /* UNESCO World Heritage accordion (travel page only) */
  const unescoAccordion = document.getElementById('unesco-accordion');
  if (unescoAccordion) renderUnescoAccordion(unescoAccordion, DEFAULT_UNESCO);

  /* Curated blogroll (links page only) */
  const linksGrid = document.getElementById('links-grid');
  if (linksGrid) renderLinks(linksGrid, DEFAULT_LINKS);

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
