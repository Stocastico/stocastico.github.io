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

/* One row per job or degree, newest first, the way an edit decision list
   reads: when and where on the left, what on the right, and a lane colour —
   work or study, as on the homepage timeline — down the row's edge.

   The title is an <h3>: these are the only headings on the CV page besides its
   <h1>, and without them a screen-reader user has no way to skim the career
   history. */
function cvEntryHtml(entry, type) {
  const isWork = type === 'work';
  const title = isWork ? entry.role : entry.degree;
  const org = isWork ? entry.company : entry.institution;
  const whereHtml = entry.location
    ? `<span class="cv-where">${escapeHtml(entry.location)}</span>`
    : '';
  /* A degree taken while employed (`concurrent_with`) used to be a block
     spanning the jobs it overlapped, placed with inline grid rows. One line
     says the same thing, and the list stays a list on every width. */
  const along = Array.isArray(entry.concurrent_with) ? entry.concurrent_with : [];
  const alongHtml = along.length
    ? `<p class="cv-alongside">Alongside ${escapeHtml(along.join(' and '))}</p>`
    : '';
  const descHtml = entry.description
    ? `<p class="cv-desc">${escapeHtml(entry.description)}</p>`
    : '';
  const tagsArr = entry.tags || [];
  const tagsHtml = tagsArr.length
    ? `<ul class="cv-tags">${tagsArr.map((t) => `<li class="cv-tag">${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';

  /* "Related work" — the CV's way back into the project pages and the
     publication list. The label is prefixed with a visually-hidden phrase
     naming the employer, because a screen-reader user pulling up a list of
     links would otherwise get a dozen bare project titles with no idea which
     job each belonged to. generate-cv validates that every url is
     root-relative, so there is no target/rel handling to do here. */
  const linksArr = entry.links || [];
  const linksHtml = linksArr.length
    ? '<div class="cv-links">'
      + `<span class="cv-links-label" aria-hidden="true">${isWork ? 'Related work' : 'More'}</span>`
      + '<ul class="cv-links-list">'
      + linksArr.map((l) => (
        '<li><a class="cv-link" href="' + escapeHtml(l.url) + '">'
        + `<span class="visually-hidden">${escapeHtml(org || '')} &mdash; </span>`
        + escapeHtml(l.label)
        + '</a></li>'
      )).join('')
      + '</ul></div>'
    : '';

  return `<li class="cv-entry cv-entry--${type}" data-animate>`
    + `<div class="cv-when"><span class="cv-years">${escapeHtml(String(entry.year))}</span>${whereHtml}</div>`
    + '<div class="cv-what">'
    + `<h3 class="cv-role">${escapeHtml(title || '')}</h3>`
    + `<p class="cv-org">${escapeHtml(org || '')}</p>`
    + alongHtml + descHtml + linksHtml + tagsHtml
    + '</div></li>';
}

function startYear(yearStr) {
  const m = String(yearStr).match(/\d{4}/);
  return m ? parseInt(m[0], 10) : 0;
}

/* Newest first by start year; on a tie, work before study. */
export function cvTimelineLines(career, education) {
  const rows = [
    ...(career || []).map((e) => ({ sort: startYear(e.year), rank: 0, html: cvEntryHtml(e, 'work') })),
    ...(education || []).map((e) => ({ sort: startYear(e.year), rank: 1, html: cvEntryHtml(e, 'study') })),
  ];
  rows.sort((a, b) => b.sort - a.sort || a.rank - b.rank);
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
   ABOUT — QUICK STATS
   ═══════════════════════════════════════════════════════════ */

/* The three numbers under the About bio, derived rather than typed.

   They were typed, and they drifted exactly the way the hand-typed UNESCO
   total did: the homepage said "30+ Publications" against 37 in
   data/publications.js, and "15+ Years Exp." against a first research post in
   2008 — understating the pitch by seven papers and three years on the page
   whose whole job is the pitch. public/llms.txt ended up carrying both answers
   at once, because one of its lines is generated from the data and the other
   was lifted from cv.html's hand-written meta description.

   `now` is injected rather than read from the clock inside here so the
   generator and its drift test can agree on one instant, and so a test can ask
   what this renders in 2031 without waiting.

   On the suffixes: publications takes no "+" because the list is a closed
   record (see TODO.md — Stefano no longer publishes, so 37 is the number, not
   a floor) and an exact count is the stronger claim. Years keeps its "+"
   because it is a floor that stays true until the next birthday of the career;
   countries never had one. */
export function aboutStatsLines({ countries, publications, careerStartYear, now }) {
  const years = now.getUTCFullYear() - careerStartYear;
  const stat = (value, suffix, label) => (
    '<div class="stat-item">'
    + `<span class="stat-number" data-count="${value}">${value}</span>`
    + (suffix ? `<span class="stat-suffix">${suffix}</span>` : '')
    + `<span class="stat-label">${escapeHtml(label)}</span>`
    + '</div>'
  );
  return [
    stat(countries, '', 'Countries'),
    stat(publications, '', 'Publications'),
    stat(years, '+', 'Years Exp.'),
  ];
}

/* The earliest year mentioned in the career list — "2008 – 2009" -> 2008.
   Reads the generated data/cv.js rather than the YAML so it cannot disagree
   with the timeline rendered from the same array two functions up. */
export function careerStartYear(career) {
  const years = (career || [])
    .map((c) => String(c && c.year || '').match(/\d{4}/))
    .filter(Boolean)
    .map((m) => Number(m[0]));
  return years.length ? Math.min(...years) : null;
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
      /* <div>, not <span>: the name is an <h2> (see .link-card-name in the
         stylesheet) and a <span> takes phrasing content only, so a heading
         inside one is invalid nesting. The <a> itself is fine — its content
         model is transparent, and this card already put a <p> in it. */
      + `<div class="link-card-head"><h2 class="link-card-name">${escapeHtml(link.name)}</h2>`
      + '<svg class="link-card-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
      + '<path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + `</div>${desc}<span class="link-card-foot">${badgeRow}${hostLabel}</span></a></li>`
    );
  }).join('');

  return [
    `<div class="links-toolbar" role="group" aria-label="Filter links by category">${chips}</div>`,
    `<p class="links-count" role="status" aria-live="polite">${linksCountLabel(links.length, links.length, '')}</p>`,
    `<ul class="links-list">${cards}</ul>`,
  ];
}
