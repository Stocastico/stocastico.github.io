/* ─── Shared card / list-item HTML builders ───────────────────
   Single source of truth for the markup of project cards and publication
   items. Imported by BOTH the browser renderer (js/main.js) and the
   build-time static generator (scripts/generate-cards.mjs), so the
   server-rendered (no-JS / crawler) HTML and the client-rendered HTML never
   drift. Pure string functions — no DOM, no browser globals — so they import
   cleanly in Node. */
import { escapeHtml } from './utils.js';

/* One project card. `i` only drives the staggered reveal delay. */
export function projectCardHtml(project, i = 0) {
  const tagsHtml = (project.tags || [])
    .map((t) => '<span class="project-tag">' + escapeHtml(t) + '</span>')
    .join('');
  /* `project.bg` is deliberately NOT used here. It stays the hero image of the
     project's own detail page (and its og:image), but as a card background it
     was never legible: faint enough not to fight the body copy meant faint
     enough to be invisible, and several of the images are diagrams whose own
     text showed through behind the description. Dropping it also means the
     listing pages stop fetching a few hundred KB of imagery nobody could see. */
  return '<a href="' + escapeHtml(project.url || '#') + '" class="project-card" data-animate data-delay="' + (i * 80) + '">' +
    '<div class="project-card__body">' +
      '<span class="project-card__year">' + escapeHtml(project.year || '') + '</span>' +
      '<span class="project-card__title">' + escapeHtml(project.title) + '</span>' +
      '<div class="project-card__tags">' + tagsHtml + '</div>' +
      '<p class="project-card__desc">' + escapeHtml(project.description || '') + '</p>' +
    '</div>' +
  '</a>';
}

/* One publication item. Renders an <a> when a url is present, otherwise a
   non-interactive <div> (many older papers have no canonical link). */
export function publicationItemHtml(pub, i = 0, { hideYear = false } = {}) {
  const inner =
    (hideYear ? '' : '<div class="pub-year">' + escapeHtml(pub.year) + '</div>') +
    '<div class="pub-title">' + escapeHtml(pub.title) + '</div>' +
    '<div class="pub-meta">' +
      escapeHtml(pub.authors) + ' &nbsp;·&nbsp; ' +
      '<span class="pub-venue">' + escapeHtml(pub.venue) + '</span>' +
    '</div>';
  if (pub.url) {
    return '<a href="' + escapeHtml(pub.url) + '" target="_blank" rel="noopener" class="pub-item research-card" role="listitem" data-animate data-delay="' + (i * 70) + '" aria-label="Open paper: ' + escapeHtml(pub.title) + '">' +
      inner +
    '</a>';
  }
  return '<div class="pub-item pub-item--nolink research-card" role="listitem" data-animate data-delay="' + (i * 70) + '">' +
    inner +
  '</div>';
}

/* Build the publication list as an array of HTML lines (one element per line,
   so the static generator can indent them). When `grouped` is true (the full
   publications.html list) papers are split into year sections with an <h2>
   heading; otherwise it's a flat list (the homepage featured set). Shared by
   js/main.js and scripts/generate-cards.mjs so SSR and client output match. */
export function publicationsListLines(publications, { grouped = false } = {}) {
  if (!grouped) {
    return publications.map((pub, i) => publicationItemHtml(pub, i));
  }
  const lines = [];
  let year = null;
  let i = 0;
  for (const pub of publications) {
    if (pub.year !== year) {
      if (year !== null) lines.push('</div>');
      year = pub.year;
      lines.push('<h2 class="pub-year-heading">' + escapeHtml(year) + '</h2>');
      lines.push('<div class="pub-year-group" role="list" aria-label="Publications from ' + escapeHtml(year) + '">');
    }
    lines.push(publicationItemHtml(pub, i, { hideYear: true }));
    i += 1;
  }
  if (year !== null) lines.push('</div>');
  return lines;
}
