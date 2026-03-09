'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Tests for renderCV, renderSkills, initSkillBars, initTimelineScroll3D,
   and initAnimatedFavicon.
   TDD: these tests are written before (or alongside) the implementation.
   Run:  npm run test:cv
──────────────────────────────────────────────────────────────────────────────*/
const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  renderCV,
  renderSkills,
  initSkillBars,
  initTimelineScroll3D,
  initAnimatedFavicon,
} = require('../js/main.js');

/* ── DOM helpers ─────────────────────────────────────────────────────────── */

/** Create a minimal element mock whose .innerHTML is readable. */
function makeEl() {
  return {
    innerHTML: '',
    style: { getPropertyValue: () => '', setProperty() {}, width: '' },
    classList: {
      _s: new Set(),
      add(c)      { this._s.add(c); },
      contains(c) { return this._s.has(c); },
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, bottom: 100, height: 100 }; },
    dataset: {},
    addEventListener() {},
  };
}

/**
 * Install a fake `global.document` with getElementById returning mocks for the
 * given ids. Returns `{ els, restore }`.
 */
function setupDom(ids) {
  const els = {};
  ids.forEach(id => { els[id] = makeEl(); });
  const prev = global.document;
  global.document = {
    getElementById:    id  => els[id] || null,
    querySelectorAll:  ()  => [],
    querySelector:     ()  => null,
  };
  return {
    els,
    restore() { global.document = prev; },
  };
}

/* ── renderCV ────────────────────────────────────────────────────────────── */

test('renderCV: exported as a function', () => {
  assert.strictEqual(typeof renderCV, 'function');
});

test('renderCV: returns without throwing when document is undefined', () => {
  const prev = global.document;
  global.document = undefined;
  assert.doesNotThrow(() => renderCV());
  global.document = prev;
});

test('renderCV: returns without throwing when timeline container is absent', () => {
  const { restore } = setupDom([]); // no containers registered
  global.CV_CAREER    = [];
  global.CV_EDUCATION = [];
  assert.doesNotThrow(() => renderCV());
  restore();
});

test('renderCV: injects career role, company and year into unified timeline', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER = [{
    year: '2022 – present',
    role: 'Senior AI Engineer',
    company: 'Vicomtech',
    location: 'San Sebastián',
    description: 'Led AI research.',
    tags: ['PyTorch', 'Computer Vision'],
  }];
  global.CV_EDUCATION = [];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(html.includes('Senior AI Engineer'), 'role injected');
  assert.ok(html.includes('Vicomtech'),          'company injected');
  assert.ok(html.includes('2022'),               'year injected');
  restore();
});

test('renderCV: injects career tags', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [{ year: '2023', role: 'Dev', company: 'Co', tags: ['JS', 'Python'] }];
  global.CV_EDUCATION = [];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(html.includes('JS'),     'first tag injected');
  assert.ok(html.includes('Python'), 'second tag injected');
  restore();
});

test('renderCV: injects education degree, institution and year', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [];
  global.CV_EDUCATION = [{
    year: '2014 – 2017',
    degree: 'PhD — Computer Vision',
    institution: 'UPV/EHU',
    location: 'Bilbao',
    description: 'Thesis on 3D reconstruction.',
  }];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(html.includes('PhD — Computer Vision'), 'degree injected');
  assert.ok(html.includes('UPV/EHU'),               'institution injected');
  assert.ok(html.includes('2014'),                  'year injected');
  restore();
});

test('renderCV: career entries use tl-row--career class, education uses tl-row--education', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [{ year: '2023', role: 'Engineer', company: 'ACME', tags: [] }];
  global.CV_EDUCATION = [{ year: '2020', degree: 'MSc', institution: 'MIT' }];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(html.includes('tl-row--career'), 'career row class present');
  assert.ok(html.includes('tl-row--education'), 'education row class present');
  restore();
});

test('renderCV: career cards rendered in tl-left, education in tl-right', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [{ year: '2023', role: 'Engineer', company: 'ACME', tags: [] }];
  global.CV_EDUCATION = [{ year: '2020', degree: 'MSc', institution: 'MIT' }];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  // Career card content should be inside tl-left
  assert.ok(html.includes('tl-left'), 'tl-left present');
  assert.ok(html.includes('tl-right'), 'tl-right present');
  restore();
});

test('renderCV: escapes HTML in career role to prevent XSS', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [{ year: '2023', role: '<script>alert(1)</script>', company: 'X', tags: [] }];
  global.CV_EDUCATION = [];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(!html.includes('<script>'),      '<script> tag must not appear raw');
  assert.ok(html.includes('&lt;script&gt;'), 'must be HTML-escaped');
  restore();
});

test('renderCV: escapes HTML in education degree to prevent XSS', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [];
  global.CV_EDUCATION = [{ year: '2020', degree: '<img src=x onerror=xss()>', institution: 'U', tags: [] }];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(!html.includes('<img'), 'raw <img> must not appear');
  restore();
});

test('renderCV: handles empty arrays gracefully', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [];
  global.CV_EDUCATION = [];
  assert.doesNotThrow(() => renderCV());
  assert.strictEqual(els['cv-timeline'].innerHTML, '', 'no output for empty data');
  restore();
});

test('renderCV: omits tags div when tags array is empty', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER    = [{ year: '2023', role: 'Dev', company: 'Co', tags: [] }];
  global.CV_EDUCATION = [];
  renderCV();
  assert.ok(!els['cv-timeline'].innerHTML.includes('tl-tags'), 'tl-tags absent for empty tags');
  restore();
});

test('renderCV: renders one row per entry', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER = [{ year: '2020 – present', role: 'Senior', company: 'A', tags: [] }];
  global.CV_EDUCATION = [{ year: '2000 – 2005', degree: 'BSc', institution: 'Uni' }];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  assert.ok(html.includes('Senior'), 'career entry present');
  assert.ok(html.includes('BSc'), 'education entry present');
  const rowCount = (html.match(/tl-row /g) || []).length;
  assert.strictEqual(rowCount, 2, 'exactly two timeline rows');
  restore();
});

test('renderCV: entries sorted by start year descending', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER = [{ year: '2015 – 2018', role: 'Dev', company: 'A', tags: [] }];
  global.CV_EDUCATION = [{ year: '2020 – 2024', degree: 'PhD', institution: 'Uni' }];
  renderCV();
  const html = els['cv-timeline'].innerHTML;
  const phdIdx = html.indexOf('PhD');
  const devIdx = html.indexOf('Dev');
  assert.ok(phdIdx < devIdx, 'newer entry (PhD 2020) appears before older (Dev 2015)');
  restore();
});

test('renderCV: multi-year career entry appears exactly once', () => {
  const { els, restore } = setupDom(['cv-timeline']);
  global.CV_CAREER = [{ year: '2009 – 2015', role: 'Research Associate', company: 'Fraunhofer', tags: [] }];
  global.CV_EDUCATION = [];
  renderCV();
  const matches = els['cv-timeline'].innerHTML.match(/Research Associate/g) || [];
  assert.strictEqual(matches.length, 1, 'multi-year job appears exactly once');
  restore();
});

/* ── renderSkills ────────────────────────────────────────────────────────── */

test('renderSkills: exported as a function', () => {
  assert.strictEqual(typeof renderSkills, 'function');
});

test('renderSkills: returns without throwing when document is undefined', () => {
  const prev = global.document;
  global.document = undefined;
  assert.doesNotThrow(() => renderSkills());
  global.document = prev;
});

test('renderSkills: returns without throwing when #cv-skills absent', () => {
  const { restore } = setupDom([]);
  global.CV_SKILLS = { technical: [], leadership: [], languages: [] };
  assert.doesNotThrow(() => renderSkills());
  restore();
});

test('renderSkills: renders technical skill names', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = {
    technical:  [{ name: 'Python', level: 90 }],
    leadership: [],
    languages:  [],
  };
  renderSkills();
  assert.ok(els['cv-skills'].innerHTML.includes('Python'), 'skill name present');
  restore();
});

test('renderSkills: renders technical skill level as inline --pct percentage', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = {
    technical:  [{ name: 'Python', level: 87 }],
    leadership: [],
    languages:  [],
  };
  renderSkills();
  assert.ok(els['cv-skills'].innerHTML.includes('87%'), '--pct value present');
  restore();
});

test('renderSkills: renders leadership skill names', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = {
    technical:  [],
    leadership: [{ name: 'Team Roadmapping', level: 85 }],
    languages:  [],
  };
  renderSkills();
  assert.ok(els['cv-skills'].innerHTML.includes('Team Roadmapping'), 'leadership skill present');
  restore();
});

test('renderSkills: renders language names and proficiency', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = {
    technical:  [],
    leadership: [],
    languages:  [{ name: 'Italian', proficiency: 'Native' }],
  };
  renderSkills();
  const html = els['cv-skills'].innerHTML;
  assert.ok(html.includes('Italian'), 'language name present');
  assert.ok(html.includes('Native'),  'proficiency present');
  restore();
});

test('renderSkills: escapes HTML in skill names to prevent XSS', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = {
    technical:  [{ name: '<script>xss()</script>', level: 50 }],
    leadership: [],
    languages:  [],
  };
  renderSkills();
  assert.ok(!els['cv-skills'].innerHTML.includes('<script>'), 'XSS prevented in skill name');
  restore();
});

test('renderSkills: escapes HTML in language proficiency', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = {
    technical:  [],
    leadership: [],
    languages:  [{ name: 'English', proficiency: '"><img src=x>' }],
  };
  renderSkills();
  assert.ok(!els['cv-skills'].innerHTML.includes('<img'), 'XSS prevented in proficiency');
  restore();
});

test('renderSkills: omits panel when array is empty', () => {
  const { els, restore } = setupDom(['cv-skills']);
  global.CV_SKILLS = { technical: [], leadership: [], languages: [] };
  renderSkills();
  assert.ok(!els['cv-skills'].innerHTML.includes('skill-panel'), 'no panels for empty data');
  restore();
});

/* ── initSkillBars ───────────────────────────────────────────────────────── */

test('initSkillBars: exported as a function', () => {
  assert.strictEqual(typeof initSkillBars, 'function');
});

test('initSkillBars: returns without throwing when document is undefined', () => {
  const prev = global.document;
  global.document = undefined;
  assert.doesNotThrow(() => initSkillBars());
  global.document = prev;
});

test('initSkillBars: returns without throwing when no bars in DOM', () => {
  const { restore } = setupDom([]);
  assert.doesNotThrow(() => initSkillBars());
  restore();
});

/* ── initTimelineScroll3D ────────────────────────────────────────────────── */

test('initTimelineScroll3D: exported as a function', () => {
  assert.strictEqual(typeof initTimelineScroll3D, 'function');
});

test('initTimelineScroll3D: returns without throwing when document is undefined', () => {
  const prev = global.document;
  global.document = undefined;
  assert.doesNotThrow(() => initTimelineScroll3D());
  global.document = prev;
});

test('initTimelineScroll3D: returns without throwing when timeline-stage absent', () => {
  const { restore } = setupDom([]); // getElementById returns null for any id
  assert.doesNotThrow(() => initTimelineScroll3D());
  restore();
});

/* ── initAnimatedFavicon ─────────────────────────────────────────────────── */

test('initAnimatedFavicon: exported as a function', () => {
  assert.strictEqual(typeof initAnimatedFavicon, 'function');
});

test('initAnimatedFavicon: returns without throwing when document is undefined', () => {
  const prev = global.document;
  global.document = undefined;
  assert.doesNotThrow(() => initAnimatedFavicon());
  global.document = prev;
});

test('initAnimatedFavicon: returns without throwing when HTMLCanvasElement is absent (Node env)', () => {
  const prev = global.HTMLCanvasElement;
  global.HTMLCanvasElement = undefined;
  const prevDoc = global.document;
  global.document = { querySelector: () => null };
  assert.doesNotThrow(() => initAnimatedFavicon());
  global.HTMLCanvasElement = prev;
  global.document = prevDoc;
});

test('initAnimatedFavicon: returns without throwing when icon link is absent', () => {
  const prev = global.document;
  global.document = {
    querySelector: () => null,
    fonts: { ready: { then() {} } },
    hidden: false,
  };
  assert.doesNotThrow(() => initAnimatedFavicon());
  global.document = prev;
});
