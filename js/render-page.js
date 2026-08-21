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

  /* "Related work" — the CV's way back into the project pages and the
     publication list. The label is prefixed with a visually-hidden phrase
     naming the role, because a screen-reader user pulling up a list of links
     would otherwise get a dozen bare project titles with no idea which job
     each belonged to. generate-cv validates that every url is root-relative,
     so there is no target/rel handling to do here. */
  const linksArr = entry.links || [];
  const linksHtml = linksArr.length
    ? '<div class="tl-links">'
      + `<span class="tl-links-label" aria-hidden="true">${isCareer ? 'Related work' : 'More'}</span>`
      + '<ul class="tl-links-list">'
      + linksArr.map((l) => (
        '<li><a class="tl-link" href="' + escapeHtml(l.url) + '">'
        + `<span class="visually-hidden">${escapeHtml(sub || '')} &mdash; </span>`
        + escapeHtml(l.label)
        + '</a></li>'
      )).join('')
      + '</ul></div>'
    : '';

  return (
    '<div class="tl-card-single">'
    + '<div class="tl-card-header">'
    + `<span class="tl-year">${escapeHtml(String(entry.year))}</span>`
    + locHtml
    + '</div>'
    + `<h3 class="tl-title">${escapeHtml(title || '')}</h3>`
    + `<p class="tl-sub">${escapeHtml(sub || '')}</p>`
    + descHtml + linksHtml + tagsHtml
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

/* The one number the travel page was missing. The copy above the accordion
   states the goal — visit all 1,200+ World Heritage sites — and then never
   said how far along that is, which is the only fact a reader actually wants
   from a page of collapsed <details>. Counting it here rather than typing it
   into travel.html is the whole point: the figure moves every time a site is
   added to data/unesco.yaml, and a hand-typed one would have said 100 through
   the entire period the United States was filed under Europe.

   Rendered server-side only. Unlike the accordion there is no client
   re-render, because there is nothing to wire up — it is a sentence, and
   generate-cards keeps it honest. */
export function unescoTotalLines(data) {
  const continents = (data && Array.isArray(data.continents)) ? data.continents : [];
  const total = continents.reduce(
    (n, cont) => n + (cont.countries || []).reduce(
      (m, country) => m + (country.sites ? country.sites.length : 0), 0,
    ), 0,
  );
  const countries = continents.reduce((n, cont) => n + (cont.countries || []).length, 0);
  if (!total) return [];

  return [
    '<p class="unesco-total">'
    + `<strong class="unesco-total-num">${total}</strong> visited so far`
    + `, across ${countries} countries and ${continents.length} continents.`
    + '</p>',
  ];
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

/* ─── Contact card (index.html) ────────────────────────────────────────────
   The address in plain text, a copy button, and a small mailto: link.

   Generated rather than hand-written for one reason: the address is meant to
   be disposable, so swapping it must be a single edit to CONTACT_EMAIL
   (js/contact.js). It appears three times in this markup — visible text, the
   button's accessible name, the mailto href — and three hand-maintained copies
   of a value whose whole point is that it changes is how the second one goes
   stale.

   Copy is the PRIMARY action and the mail client the secondary one, which is
   the opposite of what the card used to do. mailto: is unreliable on mobile —
   it depends on a configured client the visitor may not have — and a recruiter
   on a phone tapping "Email" deserves the address in their clipboard rather
   than a dialog about choosing an app. The button is a real <button>, so Enter
   and Space come from the platform rather than from a keydown handler. */
export function contactEmailLines(email) {
  const addr = escapeHtml(email);
  return [
    '<div class="contact-card contact-card--email" data-animate data-delay="0">',
    '  <div class="contact-icon">',
    '    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">',
    '      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />',
    '    </svg>',
    '  </div>',
    '  <div class="contact-info">',
    '    <span class="contact-label">Email</span>',
    `    <button type="button" class="contact-value contact-copy" data-email="${addr}" aria-label="Copy email address ${addr}">`,
    `      <span class="contact-email-text">${addr}</span>`,
    '      <svg class="contact-copy-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">',
    '        <rect x="8" y="8" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/>',
    '        <path d="M3 16V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    '      </svg>',
    '    </button>',
    '  </div>',
    `  <a class="contact-mailto" href="mailto:${addr}" aria-label="Open ${addr} in your mail client" title="Open in your mail client">`,
    '    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
    '      <path d="M4 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    '    </svg>',
    '  </a>',
    '</div>',
  ];
}

/* ─── Project facet filter (projects.html) ─────────────────────────────────
   The chips above the project grid. Deliberately the same shape as the links
   toolbar below — same single-select rule, same aria-pressed, same polite live
   count — because the two are the same control and a visitor who has used one
   should not have to learn the other. What differs is only what they filter:
   links carry category slugs of their own, projects carry facet labels that
   tagSlugsFor() turns into slugs.

   Server-rendered, and inert without JS. That is the correct degradation: the
   full list is what a no-JS visitor should be served, and the chips can only
   ever remove entries from it. */

/* The count sentence. Server-rendered once and rewritten by js/main.js on every
   chip click, so it lives here where both can reach it — the same arrangement
   as linksCountLabel() below, and for the same reason: two copies of a
   sentence eventually disagree about a plural. */
export function projectsCountLabel(shown, total, filterLabel) {
  if (!filterLabel) return `Showing all ${total} projects`;
  return `Showing ${shown} ${shown === 1 ? 'project' : 'projects'} in ${filterLabel}`;
}

export function projectFilterLines(projects, tags) {
  const list = Array.isArray(projects) ? projects : [];
  const facets = Array.isArray(tags) ? tags : [];

  const countOf = new Map(facets.map((t) => [t.label, 0]));
  for (const project of list) {
    for (const label of (project.tags || [])) {
      if (countOf.has(label)) countOf.set(label, countOf.get(label) + 1);
    }
  }

  const chips = [
    '<button class="project-chip is-active" type="button" data-filter="all" data-label="All" aria-pressed="true">'
    + `All <span class="project-chip-count">${list.length}</span></button>`,
  ].concat(facets.map((tag) => (
    `<button class="project-chip" type="button" data-filter="${escapeHtml(tag.slug)}" data-label="${escapeHtml(tag.label)}" aria-pressed="false">`
    + `${escapeHtml(tag.label)} <span class="project-chip-count">${countOf.get(tag.label) || 0}</span></button>`
  ))).join('');

  return [
    `<div class="projects-toolbar" role="group" aria-label="Filter projects by facet">${chips}</div>`,
    `<p class="projects-count" role="status" aria-live="polite">${projectsCountLabel(list.length, list.length, '')}</p>`,
  ];
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
