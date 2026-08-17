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
         links:                       # optional — "Related work" row
           - label: A project page
             url: /projects/thing.html    # must be root-relative
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
           tier: Expert                # Expert | Advanced | Proficient
       leadership:
         - name: Team leadership
           tier: Advanced
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

/* Allowed proficiency tiers for technical/leadership skills, strongest
   first. Languages keep their own free-form CEFR strings. */
const SKILL_TIERS = ['Expert', 'Advanced', 'Proficient'];

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

  /* `links` on a career or education entry: a list of { label, url }.
     The url must be same-origin and root-relative. That is not fussiness —
     these render as anchors on a page that is otherwise entirely first-party,
     and validating the shape here means the renderer can stay a plain string
     builder. An off-site link belongs in the prose, not in this row. */
  function expectLinks(val, p) {
    if (val === undefined) return;
    if (!Array.isArray(val)) { errors.push(`${p}.links must be an array`); return; }
    val.forEach((l, i) => {
      const lp = `${p}.links[${i}]`;
      if (typeof l !== 'object' || l === null) { errors.push(`${lp} must be an object`); return; }
      expectString(l.label, `${lp}.label`);
      expectString(l.url,   `${lp}.url`);
      if (typeof l.url === 'string' && l.url.trim() !== '' && !l.url.startsWith('/')) {
        errors.push(`${lp}.url must be root-relative (start with "/"), got "${l.url}"`);
      }
    });
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
      expectLinks(e.links, p);
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
      expectLinks(e.links, p);
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
            expectString(item.tier, `${p}.tier`);
            /* A closed set on purpose: tiers replaced the old 0–100 numbers
               because a percentage on a skill is fake precision. */
            expect(SKILL_TIERS.includes(item.tier),
              `${p}.tier must be one of: ${SKILL_TIERS.join(', ')}`);
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
 * Render a list of { label, url } objects, one per line.
 *
 * Kept separate from jsInlineArray rather than making that function
 * polymorphic: it is called with `tags` on every entry, and a String(obj) on
 * an object silently yields '[object Object]' — a bug that would ship a valid
 * JS file full of nonsense rather than failing. Two functions, two shapes.
 */
function jsLinkArray(arr, baseIndent) {
  if (!Array.isArray(arr) || arr.length === 0) return '[]';
  const pad = ' '.repeat(baseIndent + 4);
  const items = arr.map(
    (l) => `${pad}{ label: ${jsString(String(l.label))}, url: ${jsString(String(l.url))} },`,
  );
  return `[\n${items.join('\n')}\n${' '.repeat(baseIndent + 2)}]`;
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
    const val   = k === 'links'          ? jsLinkArray(v, baseIndent)
                : Array.isArray(v)       ? jsInlineArray(v)
                : typeof v === 'number'  ? String(v)
                :                          jsString(String(v));
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

  const careerKeys = ['year', 'role', 'company', 'location', 'description', 'links', 'tags'];
  const eduKeys    = ['year', 'degree', 'institution', 'location', 'description', 'links', 'concurrent_with'];

  const careerBlock = career.map(e => jsAlignedObject(e, careerKeys, 2)).join(',\n');
  const eduBlock    = education.map(e => jsAlignedObject(e, eduKeys,  2)).join(',\n');

  /* ── Skills serialisation ──
     Items are rendered at baseIndent=4 so they sit cleanly inside the
     CV_SKILLS object.  The closing bracket is at indent=2 to match the
     property name.                                                        */
  function skillList(items) {
    if (!items || !items.length) return '[]';
    const body = items
      .map(s => jsAlignedObject(s, ['name', 'tier'], 4))
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

  const tech  = skillList(skills.technical);
  const lead  = skillList(skills.leadership);
  const langs = langList(skills.languages);

  return `/* ${'-'.repeat(76)}
   Curriculum Vitae data
   GENERATED by scripts/generate-cv.js — edit data/cv.yaml to update.

   Run:  node scripts/generate-cv.js
   Or:   npm run generate-cv
${'-'.repeat(76)}*/

/* ── Career ───────────────────────────────────────────────── */
export const CV_CAREER = [
${careerBlock ? careerBlock + ',\n' : ''}];

/* ── Education ────────────────────────────────────────────── */
export const CV_EDUCATION = [
${eduBlock ? eduBlock + ',\n' : ''}];

/* ── Skills ───────────────────────────────────────────────── */
export const CV_SKILLS = {
  technical:  ${tech},
  leadership: ${lead},
  languages:  ${langs},
};

if (typeof globalThis !== 'undefined') {
  globalThis.CV_CAREER = CV_CAREER;
  globalThis.CV_EDUCATION = CV_EDUCATION;
  globalThis.CV_SKILLS = CV_SKILLS;
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
module.exports = { parseArgs, validateCv, generateCvJs, SKILL_TIERS };
