/* Tests for the homepage career timeline (scripts/lib/career-edit.mjs, #191).

   The timeline is the CV drawn as an editing suite's timeline: lanes for work,
   study, projects, places and papers, clips positioned by year. It is baked
   into index.html by generate-cards, so the drift guard in
   test/generate-cards.test.mjs already covers "the committed markup matches
   the data". What it cannot cover is whether the builder tells the truth, so
   that is what these check: the year parser, the row packer that keeps
   overlapping clips apart, and — against the real data — that nothing in the
   CV, the project list or the publication list fell off the edit. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { spanOf, packRows, careerEditLines, timelineBounds } from '../scripts/lib/career-edit.mjs';
import { CV_CAREER, CV_EDUCATION, CV_PLACES } from '../data/cv.js';
import { PROJECTS } from '../data/projects.js';
import { PUBLICATIONS } from '../data/publications.js';

const DATA = { career: CV_CAREER, education: CV_EDUCATION, places: CV_PLACES, projects: PROJECTS, publications: PUBLICATIONS };

test('spanOf: ranges, single years and "present"', () => {
  assert.deepEqual(spanOf('2018 – 2022', 2027), { from: 2018, to: 2022 });
  assert.deepEqual(spanOf('2018-2022', 2027), { from: 2018, to: 2022 }, 'a plain hyphen works too');
  assert.deepEqual(spanOf('2025', 2027), { from: 2025, to: 2026 }, 'a single year fills that year');
  assert.deepEqual(spanOf('2024 – present', 2027), { from: 2024, to: 2027 });
  assert.deepEqual(spanOf('2015 – 2015', 2027), { from: 2015, to: 2016 }, 'a zero-length range still shows');
  assert.equal(spanOf('soon', 2027), null);
});

test('packRows: overlapping clips go to separate rows, touching ones share', () => {
  const rows = packRows([
    { from: 2009, to: 2014 }, { from: 2011, to: 2014 }, { from: 2014, to: 2016 }, { from: 2012, to: 2013 },
  ]);
  for (const row of rows) {
    const sorted = [...row].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].from >= sorted[i - 1].to, 'clips overlap in a row');
  }
  assert.equal(rows.length, 3, 'three overlap at 2012–2013, so three rows and no more');
  assert.equal(rows.flat().length, 4, 'every clip is placed');
});

test('timelineBounds: starts at the earliest year and ends after the latest', () => {
  const { start, end } = timelineBounds(DATA);
  assert.equal(start, 2000);
  /* "present" is drawn to the end of the latest year in the data, not to
     today: a date-dependent edge would make the committed HTML go stale on
     its own and red the drift guard for a timeline nobody changed. */
  const latest = Math.max(...PROJECTS.map((p) => parseInt(String(p.year).slice(-4), 10)));
  assert.equal(end, latest + 1);
});

const html = careerEditLines(DATA).join('\n');

test('careerEditLines: every role, degree, place and project is on the edit', () => {
  for (const e of CV_CAREER) assert.ok(html.includes(e.company.replace(/&/g, '&amp;')), `missing role at ${e.company}`);
  for (const e of CV_EDUCATION) assert.ok(html.includes(e.degree), `missing ${e.degree}`);
  for (const p of CV_PLACES) assert.ok(html.includes(p.city), `missing ${p.city}`);
  for (const p of PROJECTS) {
    const href = p.url.startsWith('/') ? p.url : `/${p.url}`;
    assert.ok(html.includes(`href="${href}"`), `missing project link ${href}`);
  }
});

test('careerEditLines: one paper tick per publication, grouped by year', () => {
  const counts = [...html.matchAll(/data-papers="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(counts.reduce((a, b) => a + b, 0), PUBLICATIONS.length);
});

test('careerEditLines: every clip sits inside the ruler', () => {
  const pos = [...html.matchAll(/--clip-at:\s*([\d.]+);\s*--clip-len:\s*([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pos.length > 20, `only ${pos.length} positioned clips`);
  for (const [s, w] of pos) {
    assert.ok(s >= 0 && w > 0 && s + w <= 100.001, `clip at ${s}% + ${w}% leaves the ruler`);
  }
});

test('careerEditLines: lanes are labelled headings, clips are list items', () => {
  /* Read by a screen reader, the edit is five short lists under five
     headings; a year ruler and colour carry nothing that the text does not
     also say. */
  const lanes = [...html.matchAll(/<h3 class="edit-lane-name"[^>]*>([\s\S]*?)<\/h3>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(lanes, ['Work', 'Study', 'Projects', 'Places', 'Papers']);
  assert.ok(/class="edit-scroll"[^>]*tabindex="0"/.test(html), 'the scroller must be focusable');
  assert.ok(/class="edit-scroll"[^>]*role="region"[^>]*aria-label="[^"]+"/.test(html), 'and named');
});

test('careerEditLines: the edit carries its total row count, for the full-screen layout', () => {
  /* The pinned desktop layout divides the screen height by this number to
     size a row, so it must be the real sum of every lane's rows — a guessed
     constant overflows the screen the day projects pack into a fourth row. */
  const total = [...html.matchAll(/--track-rows: (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const m = html.match(/<div class="edit" style="--edit-rows: (\d+)">/);
  assert.ok(m, 'the .edit element has no --edit-rows');
  assert.equal(Number(m[1]), total);
});

test('careerEditLines: a `short` name is what the clip shows; the full name stays in its label', () => {
  /* Clips are ~140px wide on the full-screen edit, so the long names ended
     as "Multi-mo…". `short` (data/cv.yaml, data/projects.js) is the visible
     text; the full name is still the tooltip and what a screen reader hears. */
  const shorts = [...CV_CAREER, ...CV_EDUCATION, ...PROJECTS].filter((e) => e.short);
  for (const want of ['AGT', 'UFC', 'MLOps', 'RAG', 'Audience', 'MSc in Telecommunications Eng.']) {
    assert.ok(shorts.some((e) => e.short === want), `no entry is shortened to "${want}"`);
  }
  for (const e of shorts) {
    const full = e.company || e.degree || e.title;
    const m = html.match(new RegExp(`title="([^"]*)"><span class="edit-clip-title">${e.short.replace(/[.]/g, '\\.')}</span>`));
    assert.ok(m, `the clip for ${full} does not show "${e.short}"`);
    assert.ok(m[1].includes(full.replace(/&/g, '&amp;')), `the clip for "${e.short}" lost its full name`);
  }
});
