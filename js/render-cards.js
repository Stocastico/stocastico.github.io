/* ─── Shared card / list-item HTML builders ───────────────────
   Single source of truth for the markup of project cards and publication
   items. Imported by BOTH the browser renderer (js/main.js) and the
   build-time static generator (scripts/generate-cards.mjs), so the
   server-rendered (no-JS / crawler) HTML and the client-rendered HTML never
   drift. Pure string functions — no DOM, no browser globals — so they import
   cleanly in Node. */
import { escapeHtml } from './utils.js';
import { tagSlugsFor } from './project-tags.js';

/* ─── Project kind ─────────────────────────────────────────────
   Every entry in data/projects.js declares a `kind`:

     'work'     — professional or research work (Vicomtech, Fraunhofer, MPI,
                  the PhD). This is what the homepage advertises.
     'personal' — built for its own sake, on my own time.

   The field is REQUIRED and deliberately has no default. A default would make
   a forgotten `kind` invisible: the entry would silently become 'work' and
   reappear on the front page, which is the exact failure this distinction
   exists to prevent. assertProjectKinds() turns that into a loud build error
   instead — see its note on why the browser doesn't get the same treatment. */
export const PROJECT_KINDS = ['work', 'personal'];

/* The set the homepage is allowed to draw from. Matching 'work' positively
   (rather than excluding 'personal') makes the failure mode safe in the
   browser, where throwing would blank the section: an entry with a missing or
   misspelt kind drops off the homepage rather than sneaking onto it. The build
   catches that case loudly before it can ship. */
export function homepageProjects(projects) {
  return (projects || []).filter((p) => p && p.kind === 'work');
}

/* Build-time validation. Throws on the first bad entry — callers are the
   generators (scripts/generate-cards.mjs), never the browser. */
export function assertProjectKinds(projects) {
  for (const p of projects || []) {
    if (!PROJECT_KINDS.includes(p && p.kind)) {
      throw new Error(
        `data/projects.js: entry "${(p && p.id) || '?'}" has kind ${JSON.stringify(p && p.kind)}; ` +
        `expected one of ${PROJECT_KINDS.map((k) => `'${k}'`).join(' | ')}. ` +
        'The field is required — see js/render-cards.js.',
      );
    }
  }
  return projects;
}

/* ─── The media-bin frame (#192) ──────────────────────────────
   Every card opens on a 16:9 frame, the way an editor's bin shows a clip:
   a picture, the year where the clip's duration would sit, and a strip in the
   timeline's projects-lane colour along the bottom.

   The picture is a thumbnail made from `project.bg` by
   scripts/generate-thumbs.mjs, never `bg` itself. `bg` is the detail page's
   hero banner — up to 130 KB, sized for a 1440px viewport — and projects.html
   would otherwise fetch fifteen of them to paint frames a few hundred pixels
   wide. (Cards once used `bg` as a background *behind* the body copy, where it
   was illegible: faint enough not to fight the text meant faint enough to be
   invisible. A frame above the text has neither problem.)

   The files live in public/img/thumbs/, which Vite copies verbatim, so the
   URL below is served exactly as written — by the static HTML and by the
   homepage's client-side reshuffle alike. (Under img/ the build hashed the
   srcs in the HTML but could not see the same URLs built in JS.) A
   project without `bg` gets the colour bars instead — the test card a bin
   shows for a clip with no picture — drawn by CSS from palette tokens. */
export const THUMB_W = 640;
export const THUMB_H = 360;

export function thumbUrl(project) {
  return project && (project.bg || project.thumb) ? '/img/thumbs/' + project.id + '.webp' : null;
}

/* One project card. `i` only drives the staggered reveal delay. */
/* `level` sets the card title's heading rank, and it has to vary by page.
   These titles were a <span>, which left projects.html with exactly one
   heading — <h1> Portfolio — for fourteen projects, and the homepage with an
   h1, five h2s and no h3 at all. Heading navigation is how a screen-reader
   user skims a page, and here it did nothing. The cards are <a>-wrapped, so a
   heading inside the anchor is valid and changes nothing visually.

   The rank cannot be a constant: on index.html the cards sit under an
   <h2> section title and want h3, while projects.html goes straight from
   <h1> Portfolio to the grid and wants h2. Hardcoding either one skips a level
   somewhere, which is its own failure. */
export function projectCardHtml(project, i = 0, { level = 3 } = {}) {
  const tagsHtml = (project.tags || [])
    .map((t) => '<span class="project-tag">' + escapeHtml(t) + '</span>')
    .join('');
  /* Only personal projects are badged. Work is what the portfolio is for, so
     marking all thirteen would be thirteen labels saying nothing; marking the
     exception is what carries information. The badge sits in the frame's
     corner with the year and reads out as part of the link text. The card
     also takes .is-personal, which outlines its strip the way the career
     timeline outlines a personal clip. */
  const personal = project.kind === 'personal';
  const kindHtml = personal
    ? '<span class="project-card__kind">Personal project</span>'
    : '';
  const src = thumbUrl(project);
  /* alt="" — the title directly below says what the picture is of, so a
     description would be heard twice. */
  /* With no picture, the bars carry a slate with the clip's file name — what a
     bin shows for media it cannot preview, and what keeps two bg-less cards
     side by side from being two identical frames. aria-hidden: it is the id,
     and the title below already says it properly. */
  const picture = src
    ? '<img src="' + escapeHtml(src) + '" width="' + THUMB_W + '" height="' + THUMB_H + '" loading="lazy" decoding="async" alt="">'
    : '<span class="project-card__slate" aria-hidden="true">' + escapeHtml(project.id || '') + '</span>';
  const thumbHtml = '<div class="project-card__thumb' + (src ? '' : ' project-card__thumb--bars') + '">' +
      picture +
      '<div class="project-card__meta">' +
        kindHtml +
        '<span class="project-card__year">' + escapeHtml(project.year || '') + '</span>' +
      '</div>' +
    '</div>';
  /* Optional `lang`: the language of the page the card LINKS TO, not of the
     card. So it becomes hreflang and nothing else — putting lang="es" on the
     anchor would make a screen reader pronounce this English title in Spanish.
     Only the entries that leave the English site carry it. */
  const hreflangAttr = project.lang
    ? ' hreflang="' + escapeHtml(project.lang) + '"'
    : '';
  /* The facet slugs the filter chips on projects.html match against. Present
     on the homepage cards too, where nothing reads them — one card builder,
     and an attribute costs less than a second code path. */
  const tagsAttr = ' data-tags="' + escapeHtml(tagSlugsFor(project.tags).join(' ')) + '"';
  return '<a href="' + escapeHtml(project.url || '#') + '"' + hreflangAttr + ' class="project-card' + (personal ? ' is-personal' : '') + '"' + tagsAttr + ' data-animate data-delay="' + (i * 80) + '">' +
    thumbHtml +
    '<div class="project-card__body">' +
      '<h' + level + ' class="project-card__title">' + escapeHtml(project.title) + '</h' + level + '>' +
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
    '<h3 class="pub-title">' + escapeHtml(pub.title) + '</h3>' +
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
