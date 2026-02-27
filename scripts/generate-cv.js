#!/usr/bin/env node
'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   generate-cv.js — Build data/cv.js from data/cv.yaml

   Usage:
     node scripts/generate-cv.js [options] [input.yaml]

   Options:
     -i, --input  <path>   YAML input file   (default: data/cv.yaml)
     -o, --output <path>   JS output file    (default: data/cv.js)
     --dry-run             Print JS without writing the output file
     --validate            Validate structure and report errors, then exit
     -h, --help            Show this help

   YAML format:

     career:
       - year: "2020 – present"
         role: My Role
         company: Acme Corp
         location: City, Country       # optional
         description: >               # optional — folded block scalar
           One or two sentences.      # or plain quoted string on one line
         tags:                        # optional
           - Tag 1
           - Tag 2

     education:
       - year: "2014 – 2017"
         degree: PhD — Computer Science
         institution: Some University
         location: City, Country       # optional
         description: Thesis note.     # optional

     skills:
       technical:
         - name: Python · PyTorch
           level: 95                   # 0–100
       leadership:
         - name: Team leadership
           level: 90
       languages:
         - name: English
           proficiency: C2 — Proficient
──────────────────────────────────────────────────────────────────────────────*/

const fs   = require('node:fs');
const path = require('node:path');

const { parseYaml } = require('./lib/yaml');

const ROOT           = path.resolve(__dirname, '..');
const DEFAULT_INPUT  = path.join(ROOT, 'data', 'cv.yaml');
const DEFAULT_OUTPUT = path.join(ROOT, 'data', 'cv.js');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    input:    DEFAULT_INPUT,
    output:   DEFAULT_OUTPUT,
    dryRun:   false,
    validate: false,
    help:     false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if      (arg === '--input'    || arg === '-i') opts.input    = argv[++i];
    else if (arg === '--output'   || arg === '-o') opts.output   = argv[++i];
    else if (arg === '--dry-run')                  opts.dryRun   = true;
    else if (arg === '--validate')                 opts.validate = true;
    else if (arg === '--help'     || arg === '-h') opts.help     = true;
    else if (!arg.startsWith('-'))                opts.input    = arg; /* positional */
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/generate-cv.js [options] [input.yaml]

Options:
  -i, --input  <path>   YAML source file  (default: data/cv.yaml)
  -o, --output <path>   JS output file    (default: data/cv.js)
  --dry-run             Print the generated JS without writing it
  --validate            Validate only — report errors and exit
  -h, --help            Show this help

Examples:
  node scripts/generate-cv.js
  node scripts/generate-cv.js --input my-cv.yaml --dry-run
  npm run generate-cv
`);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a parsed CV object.
 * Returns an array of human-readable error strings (empty = valid).
 */
function validateCv(data) {
  const errors = [];

  function expect(cond, msg) { if (!cond) errors.push(msg); }
  function expectString(val, path) {
    expect(typeof val === 'string' && val.trim() !== '',
      `${path} must be a non-empty string`);
  }
  function expectNumber(val, path) {
    expect(typeof val === 'number' && Number.isFinite(val),
      `${path} must be a number`);
  }

  /* ── career ── */
  if (!Array.isArray(data.career)) {
    errors.push('career must be an array');
  } else {
    data.career.forEach((e, idx) => {
      const p = `career[${idx}]`;
      if (typeof e !== 'object' || e === null) { errors.push(`${p} must be an object`); return; }
      expectString(e.year,    `${p}.year`);
      expectString(e.role,    `${p}.role`);
      expectString(e.company, `${p}.company`);
      if (e.tags !== undefined) {
        expect(Array.isArray(e.tags), `${p}.tags must be an array`);
      }
    });
  }

  /* ── education ── */
  if (!Array.isArray(data.education)) {
    errors.push('education must be an array');
  } else {
    data.education.forEach((e, idx) => {
      const p = `education[${idx}]`;
      if (typeof e !== 'object' || e === null) { errors.push(`${p} must be an object`); return; }
      expectString(e.year,        `${p}.year`);
      expectString(e.degree,      `${p}.degree`);
      expectString(e.institution, `${p}.institution`);
    });
  }

  /* ── skills ── */
  if (data.skills !== undefined) {
    const sk = data.skills;
    if (typeof sk !== 'object' || sk === null) {
      errors.push('skills must be an object');
    } else {
      for (const group of ['technical', 'leadership']) {
        if (sk[group] === undefined) continue;
        expect(Array.isArray(sk[group]), `skills.${group} must be an array`);
        if (Array.isArray(sk[group])) {
          sk[group].forEach((item, idx) => {
            const p = `skills.${group}[${idx}]`;
            expectString(item.name, `${p}.name`);
            expectNumber(item.level, `${p}.level`);
            expect(item.level >= 0 && item.level <= 100, `${p}.level must be 0–100`);
          });
        }
      }
      if (sk.languages !== undefined) {
        expect(Array.isArray(sk.languages), 'skills.languages must be an array');
        if (Array.isArray(sk.languages)) {
          sk.languages.forEach((item, idx) => {
            const p = `skills.languages[${idx}]`;
            expectString(item.name,        `${p}.name`);
            expectString(item.proficiency, `${p}.proficiency`);
          });
        }
      }
    }
  }

  return errors;
}

// ─── JS Serialisation ─────────────────────────────────────────────────────────

/**
 * Render a JS string literal, preferring single quotes.
 * Falls back to double quotes if the string itself contains single quotes.
 */
function jsString(s) {
  if (typeof s !== 'string') return String(s);
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  if (!escaped.includes("'")) return `'${escaped}'`;
  if (!escaped.includes('"')) return `"${escaped.replace(/"/g, '\\"')}"`;
  /* Both quote types present — escape single quotes */
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

/**
 * Render an inline string array: ['a', 'b', 'c']
 */
function jsInlineArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '[]';
  return `[${arr.map(jsString).join(', ')}]`;
}

/**
 * Render an object's properties with keys aligned to the longest key,
 * indented by `baseIndent` spaces.
 */
function jsAlignedObject(obj, keys, baseIndent) {
  const pad  = ' '.repeat(baseIndent);
  const defined = keys.filter(k => obj[k] !== undefined && obj[k] !== null && obj[k] !== '');
  if (!defined.length) return `${pad}{}`;
  const maxLen = Math.max(...defined.map(k => k.length));

  const lines = defined.map(k => {
    const align = ' '.repeat(maxLen - k.length + 1);
    const v     = obj[k];
    /* Numbers must not be quoted — they are used as numeric literals */
    const val   = Array.isArray(v)      ? jsInlineArray(v)
                : typeof v === 'number'  ? String(v)
                :                         jsString(String(v));
    return `${pad}  ${k}:${align}${val},`;
  });

  return `${pad}{\n${lines.join('\n')}\n${pad}}`;
}

/**
 * Render the complete data/cv.js content from a validated CV object.
 */
function generateCvJs(data) {
  const career    = data.career    || [];
  const education = data.education || [];
  const skills    = data.skills    || {};

  const careerKeys = ['year', 'role', 'company', 'location', 'description', 'tags'];
  const eduKeys    = ['year', 'degree', 'institution', 'location', 'description'];

  const careerBlock = career.map(e => jsAlignedObject(e, careerKeys, 2)).join(',\n');
  const eduBlock    = education.map(e => jsAlignedObject(e, eduKeys,  2)).join(',\n');

  /* ── Skills serialisation ──
     Items are rendered at baseIndent=4 so they sit cleanly inside the
     CV_SKILLS object.  The closing bracket is at indent=2 to match the
     property name.                                                        */
  function skillBars(items) {
    if (!items || !items.length) return '[]';
    const body = items
      .map(s => jsAlignedObject(s, ['name', 'level'], 4))
      .join(',\n');
    return `[\n${body},\n  ]`;
  }
  function langList(items) {
    if (!items || !items.length) return '[]';
    const body = items
      .map(s => jsAlignedObject(s, ['name', 'proficiency'], 4))
      .join(',\n');
    return `[\n${body},\n  ]`;
  }

  const tech  = skillBars(skills.technical);
  const lead  = skillBars(skills.leadership);
  const langs = langList(skills.languages);

  return `/* ${'-'.repeat(76)}
   Curriculum Vitae data
   GENERATED by scripts/generate-cv.js — edit data/cv.yaml to update.

   Run:  node scripts/generate-cv.js
   Or:   npm run generate-cv
${'-'.repeat(76)}*/

/* ── Career ───────────────────────────────────────────────── */
const CV_CAREER = [
${careerBlock ? careerBlock + ',\n' : ''}];

/* ── Education ────────────────────────────────────────────── */
const CV_EDUCATION = [
${eduBlock ? eduBlock + ',\n' : ''}];

/* ── Skills ───────────────────────────────────────────────── */
const CV_SKILLS = {
  technical:  ${tech},
  leadership: ${lead},
  languages:  ${langs},
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CV_CAREER, CV_EDUCATION, CV_SKILLS };
}
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const opts = parseArgs(argv);

  if (opts.help) { printHelp(); return; }

  /* Read YAML */
  if (!fs.existsSync(opts.input)) {
    console.error(`Error: input file not found: ${opts.input}`);
    process.exitCode = 1;
    return;
  }
  const yamlText = fs.readFileSync(opts.input, 'utf8');

  /* Parse */
  let data;
  try {
    data = parseYaml(yamlText);
  } catch (err) {
    console.error(`YAML parse error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  /* Validate */
  const errors = validateCv(data);
  if (errors.length) {
    console.error('Validation errors:');
    errors.forEach(e => console.error(`  • ${e}`));
    process.exitCode = 1;
    return;
  }

  if (opts.validate) {
    console.log(`✓ ${opts.input} is valid.`);
    return;
  }

  /* Generate */
  const js = generateCvJs(data);

  if (opts.dryRun) {
    process.stdout.write(js);
    return;
  }

  fs.writeFileSync(opts.output, js, 'utf8');
  console.log(`✓ Wrote ${path.relative(ROOT, opts.output)}`);
}

if (require.main === module) {
  main(process.argv);
}

/* Export for testing */
module.exports = { parseArgs, validateCv, generateCvJs };
