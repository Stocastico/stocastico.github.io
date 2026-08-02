/* ─── Shared page-section HTML builders ───────────────────────
   Single source of truth for the markup of the three sections that used to be
   built only in the browser: the CV timeline, the CV skills panels, the
   travel-page UNESCO accordion and the links-page blogroll.

   Imported by BOTH the browser renderers (js/main.js) and the build-time
   static generator (scripts/generate-cards.mjs), for the same reason
   js/render-cards.js is: the server-rendered (no-JS / crawler) HTML and the
   client-rendered HTML must not drift.

   Why these four moved here at all: `generate-cards` was written because
   "crawlers and no-JS visitors see real content", and that reasoning was
   applied to project cards and publications and then not to these. The result
   was three pages — cv.html, links.html, travel.html — shipping as empty
   shells: 12 KB of navbar, footer and meta tags with zero career content on
   the highest-stakes page of a site whose contact copy invites job offers.
   Google, LinkedIn's preview fetcher and every LLM-backed search product that
   does not execute JS saw nothing.

   Each builder returns an ARRAY OF LINES (one per top-level element) rather
   than one string, so replaceBlock() in the generator can indent them into the
   page and the committed HTML stays readable in a diff. The browser side joins
   them back with '\n'; the elements involved are all block-level or live in a
   grid/flex container, so the whitespace between them creates no boxes and the
   two paths render identically.

   Pure string functions — no DOM, no browser globals — so they import cleanly
   in Node. */
import { escapeHtml } from './utils.js';

/* ═══════════════════════════════════════════════════════════
   CV — TIMELINE
   ═══════════════════════════════════════════════════════════ */

/* One card per job/degree — all details visible, no flipping.

   The title is an <h3>: these are the only headings on the CV page besides its
   <h1>, and without them a screen-reader user has no way to skim the career
   history. */
function tlCardHtml(entry, type) {
  const isCareer = type === 'career';
  const title = isCareer ? entry.role : entry.degree;
  const sub = isCareer ? entry.company : entry.institution;
  const locHtml = entry.location
    ? `<span class="tl-location">${escapeHtml(entry.location)}</span>`
    : '';
  const descHtml = entry.description
    ? `<p class="tl-desc">${escapeHtml(entry.description)}</p>`
    : '';
  const tagsArr = entry.tags || [];
  const tagsHtml = tagsArr.length
    ? `<div class="tl-tags">${tagsArr.map((t) => `<span class="tl-tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  return (
    '<div class="tl-card-single">'
    + '<div class="tl-card-header">'
    + `<span class="tl-year">${escapeHtml(String(entry.year))}</span>`
    + locHtml
    + '</div>'
    + `<h3 class="tl-title">${escapeHtml(title || '')}</h3>`
    + `<p class="tl-sub">${escapeHtml(sub || '')}</p>`
    + descHtml + tagsHtml
    + '</div>'
  );
}

function startYear(yearStr) {
  const m = String(yearStr).match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

/* Rows newest-first. An education entry carrying `concurrent_with` is drawn as
   a single block spanning the career rows it overlaps, so a degree taken while
   employed reads as one period rather than two unrelated ones. */
export function cvTimelineLines(career, education) {
  const concurrentEduEntries = [];
  const normalEduEntries = [];
  (education || []).forEach((e) => {
    if (Array.isArray(e.concurrent_with) && e.concurrent_with.length > 0) {
      concurrentEduEntries.push(e);
    } else {
      normalEduEntries.push(e);
    }
  });

  const concurrentCareerSet = {};
  concurrentEduEntries.forEach((edu) => {
    edu.concurrent_with.forEach((company) => { concurrentCareerSet[company] = true; });
  });

  const concurrentCareerEntries = [];
  const normalCareerEntries = [];
  (career || []).forEach((e) => {
    if (concurrentCareerSet[e.company]) concurrentCareerEntries.push(e);
    else normalCareerEntries.push(e);
  });

  const rows = [];

  normalCareerEntries.forEach((entry) => {
    rows.push({
      sort: startYear(entry.year),
      html: '<div class="tl-row tl-row--career" data-animate>'
        + `<div class="tl-left">${tlCardHtml(entry, 'career')}</div>`
        + '<div class="tl-spine"><div class="tl-dot" aria-hidden="true"></div></div>'
        + '<div class="tl-right"><div class="tl-empty"></div></div>'
        + '</div>',
    });
  });

  normalEduEntries.forEach((entry) => {
    rows.push({
      sort: startYear(entry.year),
      html: '<div class="tl-row tl-row--education" data-animate>'
        + '<div class="tl-left"><div class="tl-empty"></div></div>'
        + '<div class="tl-spine"><div class="tl-dot" aria-hidden="true"></div></div>'
        + `<div class="tl-right">${tlCardHtml(entry, 'education')}</div>`
        + '</div>',
    });
  });

  concurrentEduEntries.forEach((eduEntry) => {
    const companies = eduEntry.concurrent_with;
    const careerPairs = concurrentCareerEntries
      .filter((c) => companies.indexOf(c.company) !== -1)
      .sort((a, b) => startYear(b.year) - startYear(a.year));

    const n = careerPairs.length;

    /* Column 1 is the spine, column 2 the concurrent career cards (one per
       grid row), column 3 the education card beside them. Placement is inline
       because the row index depends on how many careers the entry overlaps,
       which CSS cannot express — see .tl-concurrent-block in css/styles.css. */
    const leftCells = careerPairs.map((c, i) => {
      const row = i + 1;
      return `<div class="tl-left tl-row--career" style="grid-column:2;grid-row:${row}">`
        + tlCardHtml(c, 'career')
        + '</div>'
        + `<div class="tl-spine" style="grid-column:1;grid-row:${row}">`
        + '<div class="tl-dot" aria-hidden="true"></div>'
        + '</div>';
    }).join('');

    const rightCell = `<div class="tl-right tl-row--education" style="grid-column:3;grid-row:1/${n + 1}">`
      + tlCardHtml(eduEntry, 'education')
      + '</div>';

    rows.push({
      sort: n > 0 ? startYear(careerPairs[0].year) : startYear(eduEntry.year),
      html: `<div class="tl-concurrent-block" data-animate>${leftCells}${rightCell}</div>`,
    });
  });

  rows.sort((a, b) => b.sort - a.sort);
  return rows.map((r) => r.html);
}

/* ═══════════════════════════════════════════════════════════
   CV — SKILLS PANELS
   ═══════════════════════════════════════════════════════════ */

/* Tier labels (Expert / Advanced / …), not percentage bars: a number on a
   skill is fake precision, and as plain text the level reaches screen
   readers for free. Same row layout as the Languages panel's CEFR labels,
   so the three panels read as one system. */
function tierPanel(items, label) {
  if (!items.length) return '';
  return '<div class="skill-panel" data-animate>'
    + `<h3 class="skill-panel-title">${escapeHtml(label)}</h3>`
    + '<ul class="skill-list">'
    + items.map((s) => '<li class="skill-item">'
      + `<span class="skill-item-name">${escapeHtml(s.name)}</span>`
      + `<span class="skill-tier">${escapeHtml(s.tier)}</span>`
      + '</li>').join('')
    + '</ul></div>';
}

function langPanel(items) {
  if (!items.length) return '';
  return '<div class="skill-panel" data-animate>'
    + '<h3 class="skill-panel-title">Languages</h3>'
    + '<ul class="lang-list">'
    + items.map((l) => '<li class="lang-item">'
      + `<span class="lang-name">${escapeHtml(l.name)}</span>`
      + `<span class="lang-prof">${escapeHtml(l.proficiency)}</span>`
      + '</li>').join('')
    + '</ul></div>';
}

export function cvSkillsLines(skills) {
  const { technical = [], leadership = [], languages = [] } = (skills || {});
  const panels = [
    tierPanel(technical, 'Technical'),
    tierPanel(leadership, 'Leadership'),
    langPanel(languages),
  ].filter(Boolean);
  if (!panels.length) return [];
  return [`<div class="skill-panels">${panels.join('')}</div>`];
}

/* ═══════════════════════════════════════════════════════════
   TRAVEL — UNESCO ACCORDION
   ═══════════════════════════════════════════════════════════ */

/* Continent → country → site, as a <details> disclosure tree so it is
   keyboard-operable and degrades gracefully with no JS at all. Site URLs are
   already restricted to https:// by the generator (scripts/generate-unesco.js);
   every field is HTML-escaped here as defence in depth. */
export function unescoAccordionLines(data) {
  const continents = (data && Array.isArray(data.continents)) ? data.continents : [];

  if (!continents.length) {
    return ['<p class="unesco-empty">The list of visited sites is on its way &mdash; check back soon.</p>'];
  }

  const countSites = (countries) =>
    countries.reduce((n, k) => n + (k.sites ? k.sites.length : 0), 0);

  return continents.map((cont) => {
    const countries = (cont.countries || []).map((country) => {
      const sites = (country.sites || []).map((site) => {
        const year = site.year
          ? ` <span class="unesco-year">(${escapeHtml(String(site.year))})</span>`
          : '';
        return `<li><a class="unesco-site" href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site.name)}</a>${year}</li>`;
      }).join('');
      return (
        '<details class="unesco-country"><summary>'
        + `<span class="unesco-name">${escapeHtml(country.name)}</span>`
        + `<span class="unesco-count">${(country.sites || []).length}</span></summary>`
        + `<ul class="unesco-sites">${sites}</ul></details>`
      );
    }).join('');
    return (
      '<details class="unesco-continent"><summary>'
      + `<span class="unesco-name">${escapeHtml(cont.name)}</span>`
      + `<span class="unesco-count">${countSites(cont.countries || [])}</span></summary>`
      + `<div class="unesco-countries">${countries}</div></details>`
    );
  });
}

/* ═══════════════════════════════════════════════════════════
   LINKS — BLOGROLL
   ═══════════════════════════════════════════════════════════ */

/* Human-readable "Showing …" summary for the live count region. */
export function linksCountLabel(shown, total, filterLabel) {
  const noun = total === 1 ? 'site' : 'sites';
  if (!filterLabel) return `Showing all ${total} ${noun}`;
  return `Showing ${shown} ${shown === 1 ? 'site' : 'sites'} in ${filterLabel}`;
}

/* A category filter bar plus a single, de-duplicated grid of external link
   cards. Each site appears once and is tagged with every category it belongs
   to, so filtering by category never duplicates an entry. The generator
   (scripts/generate-links.js) already restricts URLs to https:// and
   de-duplicates by URL; every field is HTML-escaped here as defence in depth.

   The filter chips are rendered server-side too. They are inert without JS —
   which is correct: the full list is what a no-JS visitor should see, and the
   chips only ever remove entries from it. */
export function linksGridLines(data) {
  const categories = (data && Array.isArray(data.categories)) ? data.categories : [];
  const links = (data && Array.isArray(data.links)) ? data.links : [];

  if (!links.length) {
    return ['<p class="links-empty">The reading list is on its way &mdash; check back soon.</p>'];
  }

  const labelOf = new Map(categories.map((c) => [c.slug, c.label]));
  const countOf = new Map(categories.map((c) => [c.slug, 0]));
  for (const link of links) {
    for (const slug of (link.categories || [])) {
      if (countOf.has(slug)) countOf.set(slug, countOf.get(slug) + 1);
    }
  }

  const chips = [
    '<button class="link-chip is-active" type="button" data-filter="all" data-label="All" aria-pressed="true">'
    + `All <span class="link-chip-count">${links.length}</span></button>`,
  ].concat(categories.map((cat) => (
    `<button class="link-chip" type="button" data-filter="${escapeHtml(cat.slug)}" data-label="${escapeHtml(cat.label)}" aria-pressed="false">`
    + `${escapeHtml(cat.label)} <span class="link-chip-count">${countOf.get(cat.slug) || 0}</span></button>`
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
      `<li class="link-card-item" data-categories="${escapeHtml(cats.join(' '))}">`
      + `<a class="link-card" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">`
      + `<span class="link-card-head"><span class="link-card-name">${escapeHtml(link.name)}</span>`
      + '<svg class="link-card-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + `</span>${desc}<span class="link-card-foot">${badgeRow}${hostLabel}</span></a></li>`
    );
  }).join('');

  return [
    `<div class="links-toolbar" role="group" aria-label="Filter links by category">${chips}</div>`,
    `<p class="links-count" role="status" aria-live="polite">${linksCountLabel(links.length, links.length, '')}</p>`,
    `<ul class="links-list">${cards}</ul>`,
  ];
}
