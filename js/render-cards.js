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

/* One publication item. Renders an <a> when a url is present, otherwise a
   non-interactive <div> (many older papers have no canonical link). */
export function publicationItemHtml(pub, i = 0) {
  const inner =
    '<div class="pub-year">' + escapeHtml(pub.year) + '</div>' +
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
