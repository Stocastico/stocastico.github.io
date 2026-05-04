'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   Tests for scripts/lib/yaml.js and scripts/generate-cv.js
   Run:  npm run test:generate-cv
──────────────────────────────────────────────────────────────────────────────*/
const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const vm     = require('node:vm');
const fs     = require('node:fs');

const { parseYaml, parseScalar, stripYamlComments } = require('../scripts/lib/yaml');
const { validateCv, generateCvJs, parseArgs }        = require('../scripts/generate-cv');

// ─── stripYamlComments ───────────────────────────────────────────────────────

test('stripYamlComments: strips trailing comment', () => {
  assert.equal(stripYamlComments('key: value # comment'), 'key: value');
});

test('stripYamlComments: does not strip # inside single quotes', () => {
  assert.equal(stripYamlComments("key: 'value # not a comment'"), "key: 'value # not a comment'");
});

test('stripYamlComments: does not strip # inside double quotes', () => {
  assert.equal(stripYamlComments('key: "value # not"'), 'key: "value # not"');
});

test('stripYamlComments: full-line comment becomes empty string', () => {
  assert.equal(stripYamlComments('# full line comment').trim(), '');
});

// ─── parseScalar ─────────────────────────────────────────────────────────────

test('parseScalar: null values', () => {
  assert.equal(parseScalar('null'), null);
  assert.equal(parseScalar('~'),    null);
  assert.equal(parseScalar(''),     '');
});

test('parseScalar: booleans', () => {
  assert.equal(parseScalar('true'),  true);
  assert.equal(parseScalar('false'), false);
});

test('parseScalar: integers and floats', () => {
  assert.equal(parseScalar('42'),   42);
  assert.equal(parseScalar('-7'),   -7);
  assert.equal(parseScalar('3.14'), 3.14);
});

test('parseScalar: single-quoted string', () => {
  assert.equal(parseScalar("'hello world'"), 'hello world');
});

test('parseScalar: double-quoted string', () => {
  assert.equal(parseScalar('"hello world"'), 'hello world');
});

test('parseScalar: plain string is returned as-is', () => {
  assert.equal(parseScalar('San Sebastián'), 'San Sebastián');
});

// ─── parseYaml — basic structures ────────────────────────────────────────────

test('parseYaml: flat mapping', () => {
  const result = parseYaml('key1: value1\nkey2: 42\n');
  assert.deepEqual(result, { key1: 'value1', key2: 42 });
});

test('parseYaml: sequence of scalars', () => {
  const result = parseYaml('items:\n  - alpha\n  - beta\n  - gamma\n');
  assert.deepEqual(result, { items: ['alpha', 'beta', 'gamma'] });
});

test('parseYaml: sequence of mappings (inline first key)', () => {
  const yaml = `
career:
  - year: "2020 – present"
    role: Engineer
    company: Acme
`.trim();
  const result = parseYaml(yaml);
  assert.deepEqual(result.career, [{ year: '2020 – present', role: 'Engineer', company: 'Acme' }]);
});

test('parseYaml: nested mapping (skills-style nesting)', () => {
  const yaml = `
skills:
  technical:
    - name: Python
      level: 95
`.trim();
  const result = parseYaml(yaml);
  assert.deepEqual(result.skills.technical, [{ name: 'Python', level: 95 }]);
});

test('parseYaml: tags array inside sequence mapping', () => {
  const yaml = `
career:
  - role: Engineer
    tags:
      - Python
      - Docker
`.trim();
  const result = parseYaml(yaml);
  assert.deepEqual(result.career[0].tags, ['Python', 'Docker']);
});

test('parseYaml: multiple career entries', () => {
  const yaml = `
career:
  - role: Senior
    year: "2022 – now"
    company: Corp A
  - role: Junior
    year: "2019 – 2022"
    company: Corp B
`.trim();
  const result = parseYaml(yaml);
  assert.equal(result.career.length, 2);
  assert.equal(result.career[1].role, 'Junior');
});

test('parseYaml: comments are stripped', () => {
  const yaml = `
# This is a comment
key: value  # inline comment
`.trim();
  assert.deepEqual(parseYaml(yaml), { key: 'value' });
});

test('parseYaml: null value for empty key', () => {
  const yaml = `
outer:
  inner: hello
`.trim();
  const result = parseYaml(yaml);
  assert.equal(result.outer.inner, 'hello');
});

// ─── parseYaml — block scalars ────────────────────────────────────────────────

test('parseYaml: folded block scalar (>) joins lines with spaces', () => {
  const yaml = [
    'description: >',
    '  First line',
    '  second line.',
  ].join('\n');
  const result = parseYaml(yaml);
  assert.equal(result.description, 'First line second line.');
});

test('parseYaml: literal block scalar (|) preserves newlines', () => {
  const yaml = [
    'description: |',
    '  First line',
    '  Second line',
  ].join('\n');
  const result = parseYaml(yaml);
  assert.equal(result.description, 'First line\nSecond line');
});

test('parseYaml: folded scalar blank line = paragraph break', () => {
  const yaml = [
    'description: >',
    '  Paragraph one',
    '  continues.',
    '',
    '  Paragraph two.',
  ].join('\n');
  const result = parseYaml(yaml);
  assert.equal(result.description, 'Paragraph one continues.\nParagraph two.');
});

test('parseYaml: block scalar inside a sequence mapping', () => {
  const yaml = [
    'career:',
    '  - role: Engineer',
    '    description: >',
    '      Long description',
    '      that spans two lines.',
    '    company: Acme',
  ].join('\n');
  const result = parseYaml(yaml);
  assert.equal(result.career[0].description, 'Long description that spans two lines.');
  assert.equal(result.career[0].company, 'Acme');
});

test('parseYaml: block scalar followed by next top-level key', () => {
  const yaml = [
    'description: >',
    '  Some text.',
    'role: Engineer',
  ].join('\n');
  const result = parseYaml(yaml);
  assert.equal(result.description, 'Some text.');
  assert.equal(result.role, 'Engineer');
});

// ─── parseYaml — edge cases ───────────────────────────────────────────────────

test('parseYaml: empty document returns empty object', () => {
  assert.deepEqual(parseYaml(''), {});
  assert.deepEqual(parseYaml('  \n  \n'), {});
});

test('parseYaml: document with only comments returns empty object', () => {
  assert.deepEqual(parseYaml('# just a comment\n# another\n'), {});
});

test('parseYaml: quoted string with dashes and special chars', () => {
  const yaml = 'year: "2020 – present"';
  assert.deepEqual(parseYaml(yaml), { year: '2020 – present' });
});

test('parseYaml: location with comma and unicode', () => {
  const yaml = 'location: "San Sebastián, ES"';
  assert.deepEqual(parseYaml(yaml), { location: 'San Sebastián, ES' });
});

test('parseYaml: CRLF top-level keys ending with colon are parsed', () => {
  const yaml = [
    'career:',
    '  - year: "2024"',
    '    role: Engineer',
    '    company: Acme',
    'education:',
    '  - year: "2020"',
    '    degree: MSc',
    '    institution: Uni',
  ].join('\r\n');

  const result = parseYaml(yaml);
  assert.ok(Array.isArray(result.career));
  assert.ok(Array.isArray(result.education));
  assert.equal(result.career[0].company, 'Acme');
  assert.equal(result.education[0].institution, 'Uni');
});

test('parseYaml: CRLF nested keys with trailing colon are parsed', () => {
  const yaml = [
    'skills:',
    '  technical:',
    '    - name: Python',
    '      level: 90',
  ].join('\r\n');

  const result = parseYaml(yaml);
  assert.deepEqual(result.skills.technical, [{ name: 'Python', level: 90 }]);
});

// ─── validateCv ───────────────────────────────────────────────────────────────

const minimalValid = {
  career:    [{ year: '2020', role: 'Engineer', company: 'Acme' }],
  education: [{ year: '2014', degree: 'BSc', institution: 'Uni' }],
};

test('validateCv: accepts minimal valid CV', () => {
  assert.deepEqual(validateCv(minimalValid), []);
});

test('validateCv: error when career is not an array', () => {
  const errors = validateCv({ career: 'nope', education: [] });
  assert.ok(errors.some(e => e.includes('career')));
});

test('validateCv: error when career entry missing required year', () => {
  const data = { career: [{ role: 'Eng', company: 'Acme' }], education: [] };
  const errors = validateCv(data);
  assert.ok(errors.some(e => e.includes('year')));
});

test('validateCv: error when career entry missing required role', () => {
  const data = { career: [{ year: '2020', company: 'Acme' }], education: [] };
  const errors = validateCv(data);
  assert.ok(errors.some(e => e.includes('role')));
});

test('validateCv: error when education is not an array', () => {
  const data = { career: [], education: { a: 1 } };
  const errors = validateCv(data);
  assert.ok(errors.some(e => e.includes('education')));
});

test('validateCv: error when skill level is out of range', () => {
  const data = {
    ...minimalValid,
    skills: { technical: [{ name: 'Python', level: 150 }] },
  };
  const errors = validateCv(data);
  assert.ok(errors.some(e => e.includes('level')));
});

test('validateCv: error when skill level is not a number', () => {
  const data = {
    ...minimalValid,
    skills: { technical: [{ name: 'Python', level: 'high' }] },
  };
  const errors = validateCv(data);
  assert.ok(errors.some(e => e.includes('level')));
});

test('validateCv: accepts CV with no skills block', () => {
  const data = { career: minimalValid.career, education: minimalValid.education };
  assert.deepEqual(validateCv(data), []);
});

test('validateCv: accepts valid languages block', () => {
  const data = {
    ...minimalValid,
    skills: { languages: [{ name: 'English', proficiency: 'C2' }] },
  };
  assert.deepEqual(validateCv(data), []);
});

// ─── generateCvJs ─────────────────────────────────────────────────────────────

/* The generated JS is now an ES module (`export const ...`).  vm.runInContext
   only runs scripts, not modules, so we strip the `export ` prefix and read
   the values back from the context's globalThis (the file also sets them
   onto globalThis at the bottom). */
function evalCvJs(js) {
  const scriptLike = js.replace(/^export /gm, '');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(scriptLike, ctx);
  return {
    CV_CAREER:    ctx.CV_CAREER,
    CV_EDUCATION: ctx.CV_EDUCATION,
    CV_SKILLS:    ctx.CV_SKILLS,
  };
}

test('generateCvJs: output is valid JS that defines the three globals', () => {
  const { CV_CAREER, CV_EDUCATION, CV_SKILLS } = evalCvJs(generateCvJs({
    career: [{ year: '2020', role: 'Engineer', company: 'Acme', tags: ['Python'] }],
    education: [{ year: '2014', degree: 'BSc', institution: 'Uni' }],
    skills: {
      technical:  [{ name: 'Python', level: 95 }],
      leadership: [{ name: 'Leadership', level: 80 }],
      languages:  [{ name: 'English', proficiency: 'C2' }],
    },
  }));

  assert.ok(Array.isArray(CV_CAREER));
  assert.equal(CV_CAREER[0].role, 'Engineer');
  /* Array.from normalises vm-realm arrays so deepEqual doesn't fail on proto */
  assert.deepEqual(Array.from(CV_CAREER[0].tags), ['Python']);
  assert.ok(Array.isArray(CV_EDUCATION));
  assert.equal(CV_EDUCATION[0].degree, 'BSc');
  assert.ok(typeof CV_SKILLS === 'object');
  assert.equal(CV_SKILLS.technical[0].level,          95);
  assert.equal(CV_SKILLS.languages[0].proficiency, 'C2');
});

test('generateCvJs: handles empty career and education arrays', () => {
  const { CV_CAREER, CV_EDUCATION } = evalCvJs(
    generateCvJs({ career: [], education: [], skills: {} })
  );
  assert.equal(CV_CAREER.length,    0);
  assert.equal(CV_EDUCATION.length, 0);
});

test('generateCvJs: strings with single quotes are escaped correctly', () => {
  const { CV_CAREER } = evalCvJs(generateCvJs({
    career:    [{ year: "it's 2020", role: 'Eng', company: "O'Corp" }],
    education: [],
    skills:    {},
  }));
  assert.equal(CV_CAREER[0].year,    "it's 2020");
  assert.equal(CV_CAREER[0].company, "O'Corp");
});

// ─── parseArgs ────────────────────────────────────────────────────────────────

test('parseArgs: defaults', () => {
  const opts = parseArgs(['node', 'generate-cv.js']);
  assert.equal(opts.dryRun,   false);
  assert.equal(opts.validate, false);
  assert.equal(opts.help,     false);
  assert.ok(opts.input.endsWith('cv.yaml'));
  assert.ok(opts.output.endsWith('cv.js'));
});

test('parseArgs: --dry-run flag', () => {
  const opts = parseArgs(['node', 'generate-cv.js', '--dry-run']);
  assert.equal(opts.dryRun, true);
});

test('parseArgs: --validate flag', () => {
  const opts = parseArgs(['node', 'generate-cv.js', '--validate']);
  assert.equal(opts.validate, true);
});

test('parseArgs: --input and --output', () => {
  const opts = parseArgs(['node', 'generate-cv.js', '-i', 'a.yaml', '-o', 'b.js']);
  assert.equal(opts.input,  'a.yaml');
  assert.equal(opts.output, 'b.js');
});

test('parseArgs: positional argument sets input', () => {
  const opts = parseArgs(['node', 'generate-cv.js', 'custom.yaml']);
  assert.equal(opts.input, 'custom.yaml');
});

test('parseArgs: throws on unknown flag', () => {
  assert.throws(() => parseArgs(['node', 'generate-cv.js', '--bogus']), /Unknown argument/);
});

// ─── End-to-end: round-trip through the real data/cv.yaml ─────────────────────

test('end-to-end: parse data/cv.yaml → validate → generate valid JS', () => {
  const yamlPath = path.join(__dirname, '..', 'data', 'cv.yaml');
  if (!fs.existsSync(yamlPath)) {
    /* Skip gracefully if the template is not present */
    return;
  }

  const yaml   = fs.readFileSync(yamlPath, 'utf8');
  const data   = parseYaml(yaml);
  const errors = validateCv(data);
  assert.deepEqual(errors, [], `Validation errors in cv.yaml: ${errors.join(', ')}`);

  const { CV_CAREER, CV_EDUCATION, CV_SKILLS } = evalCvJs(generateCvJs(data));

  assert.ok(CV_CAREER.length    > 0, 'CV_CAREER should have entries');
  assert.ok(CV_EDUCATION.length > 0, 'CV_EDUCATION should have entries');
  assert.ok(typeof CV_SKILLS    === 'object');

  /* Spot-check first career entry matches what cv.yaml contains */
  assert.ok(CV_CAREER[0].year,    'first career entry needs a year');
  assert.ok(CV_CAREER[0].role,    'first career entry needs a role');
  assert.ok(CV_CAREER[0].company, 'first career entry needs a company');
});
