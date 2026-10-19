/* ═══════════════════════════════════════════════════════════
   career-edit.mjs — the CV drawn as an edit (#191)

   The homepage's career section, laid out like the timeline of a video
   editor: a year ruler, and one lane per kind of thing — work, study,
   projects, places, papers — with each item a clip whose position and length
   are its years. It is the Montaggio redesign's second signature after the
   hero, and the one that carries information: eighteen years read at a
   glance, overlaps and all (the PhD runs under two jobs; two Berlin projects
   run under one).

   Build time only. generate-cards bakes the result into index.html between
   `generated:career-edit` markers; nothing re-renders it in the browser, so
   this lives in scripts/lib rather than js/ and never reaches the bundle.
   The drift guard in test/generate-cards.test.mjs covers the committed
   markup; test/career-edit.test.mjs covers whether the builder tells the
   truth about the data.

   Positions are percentages of the ruler written as custom properties
   (--clip-at start, --clip-len width, --clip-row row), so the stylesheet owns every pixel and the
   same markup works at any width. The edit's right edge is the end of the
   latest year anywhere in the data, not today: "present" is drawn to there.
   A date-dependent edge would make the committed HTML go stale on its own,
   and the drift guard would red the build for a timeline nobody changed.
   ═══════════════════════════════════════════════════════════ */

import { escapeHtml } from '../../js/utils.js';

const YEARS_RE = /(\d{4})(?:\s*[–—-]\s*(\d{4}|present))?/i;

/* '2018 – 2022' → [2018, 2022); '2025' → [2025, 2026); '… – present' → […, end). */
export function spanOf(yearStr, end) {
  const m = YEARS_RE.exec(String(yearStr ?? ''));
  if (!m) return null;
  const from = Number(m[1]);
  if (!m[2]) return { from, to: from + 1 };
  if (/present/i.test(m[2])) return { from, to: end };
  const to = Number(m[2]);
  return { from, to: to > from ? to : from + 1 };
}

/* Greedy interval packing: each clip goes in the first row whose last clip
   has ended. Sorted by start, this uses the minimum number of rows. */
export function packRows(items) {
  const rows = [];
  for (const it of [...items].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const row = rows.find((r) => r[r.length - 1].to <= it.from);
    if (row) row.push(it);
    else rows.push([it]);
  }
  return rows;
}

function latestYear(str) {
  const all = String(str ?? '').match(/\d{4}/g);
  return all ? Math.max(...all.map(Number)) : -Infinity;
}

export function timelineBounds({ career, education, places, projects, publications }) {
  const strs = [
    ...career.map((e) => e.year), ...education.map((e) => e.year),
    ...places.map((e) => e.year), ...projects.map((p) => p.year),
    ...publications.map((p) => String(p.year)),
  ];
  const start = Math.min(...strs.map((s) => Number((String(s).match(/\d{4}/) || [Infinity])[0])));
  const end = Math.max(...strs.map(latestYear)) + 1;
  return { start, end };
}

const pct = (n) => Number(n.toFixed(3));

/* A project's card title is a full sentence; a clip has room for its name.
   Take what precedes the colon when there is one and it is short. */
function shortTitle(title) {
  const head = String(title).split(':')[0].trim();
  return head.length <= 28 ? head : title;
}

function rootUrl(url) {
  return /^(https?:)?\//.test(url) ? url : `/${url}`;
}

export function careerEditLines({ career, education, places, projects, publications }) {
  const { start, end } = timelineBounds({ career, education, places, projects, publications });
  const span = end - start;
  const pos = ({ from, to }) => `--clip-at: ${pct(((from - start) / span) * 100)}; --clip-len: ${pct(((to - from) / span) * 100)}`;

  /* One clip per item; `body` is its visible content, `label` the full
     sentence it stands for (title tooltip + what a screen reader hears). */
  const clip = (item, row, { href, extra = '' } = {}) => {
    const style = `${pos(item)}; --clip-row: ${row}`;
    const inner = `<span class="edit-clip-title">${escapeHtml(item.title)}</span>`
      + (item.meta ? `<span class="edit-clip-meta">${escapeHtml(item.meta)}</span>` : '')
      + `<span class="visually-hidden">, ${escapeHtml(item.years)}</span>`;
    const body = href
      ? `<a class="edit-clip-body" href="${escapeHtml(href)}" title="${escapeHtml(item.label)}">${inner}</a>`
      : `<span class="edit-clip-body" title="${escapeHtml(item.label)}">${inner}</span>`;
    return `<li class="edit-clip${extra}" style="${style}">${body}</li>`;
  };

  /* Every lane's row count, summed: the full-screen layout divides the
     screen height by it (--edit-rows on .edit). */
  let totalRows = 1; // the papers lane, which is always one row
  const lane = (key, name, items, opts = {}) => {
    const rows = packRows(items);
    totalRows += rows.length;
    const lines = [
      `<div class="edit-lane" data-lane="${key}">`,
      `  <h3 class="edit-lane-name" id="edit-lane-${key}">${name}</h3>`,
      `  <ol class="edit-track" aria-labelledby="edit-lane-${key}" style="--track-rows: ${rows.length}">`,
    ];
    rows.forEach((row, r) => row.forEach((it) => lines.push(`    ${clip(it, r, opts.clip ? opts.clip(it) : {})}`)));
    lines.push('  </ol>', '</div>');
    return lines;
  };

  const withSpan = (yearStr, fields) => {
    const s = spanOf(yearStr, end);
    return s ? { ...s, years: yearStr, ...fields } : null;
  };

  const work = career.map((e) => withSpan(e.year, {
    title: e.short || e.company, meta: e.role, label: `${e.role}, ${e.company}, ${e.year}`,
  })).filter(Boolean);

  const study = education.map((e) => withSpan(e.year, {
    title: e.short || e.degree, meta: e.institution, label: `${e.degree}, ${e.institution}, ${e.year}`,
  })).filter(Boolean);

  const work_projects = projects.map((p) => withSpan(p.year, {
    title: p.short || shortTitle(p.title), meta: '', label: `${p.title}, ${p.year}`,
    href: rootUrl(p.url), personal: p.kind === 'personal',
  })).filter(Boolean);

  const lived = places.map((e) => withSpan(e.year, {
    title: e.city, meta: '', label: `${e.city}, ${e.year}`,
  })).filter(Boolean);

  /* Papers are ticks, not clips: one list item per year, carrying the count,
     drawn as that many marks. */
  const byYear = new Map();
  for (const p of publications) byYear.set(Number(p.year), (byYear.get(Number(p.year)) || 0) + 1);
  const paperItems = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) =>
    `    <li class="edit-papers" style="--clip-at: ${pct(((y - start) / span) * 100)}; --clip-len: ${pct((1 / span) * 100)}; --papers: ${n}" data-papers="${n}">`
    + `<span class="visually-hidden">${y}: ${n} ${n === 1 ? 'paper' : 'papers'}</span></li>`);

  const ruler = [];
  for (let y = start; y < end; y += 2) {
    ruler.push(`    <span style="--clip-at: ${pct(((y - start) / span) * 100)}">${y}</span>`);
  }

  const lanes = [
    ...lane('work', 'Work', work, { clip: () => ({ href: '/cv.html' }) }).map((l) => `  ${l}`),
    ...lane('study', 'Study', study, { clip: () => ({ href: '/cv.html' }) }).map((l) => `  ${l}`),
    ...lane('projects', 'Projects', work_projects, {
      clip: (it) => ({ href: it.href, extra: it.personal ? ' is-personal' : '' }),
    }).map((l) => `  ${l}`),
    ...lane('places', 'Places', lived).map((l) => `  ${l}`),
  ];

  return [
    `<div class="edit-scroll" role="region" aria-label="Career timeline, ${start} to ${end - 1}" tabindex="0">`,
    `  <div class="edit" style="--edit-rows: ${totalRows}">`,
    `  <div class="edit-ruler" aria-hidden="true">`,
    ...ruler,
    '  </div>',
    ...lanes,
    '  <div class="edit-lane" data-lane="papers">',
    '    <h3 class="edit-lane-name" id="edit-lane-papers"><a href="/publications.html">Papers</a></h3>',
    '    <ol class="edit-track" aria-labelledby="edit-lane-papers" style="--track-rows: 1">',
    ...paperItems.map((l) => `  ${l}`),
    '    </ol>',
    '  </div>',
    '  <div class="edit-playhead" aria-hidden="true"></div>',
    '  </div>',
    '</div>',
  ];
}
