#!/usr/bin/env node
'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   rotate-palette.js — Advance the active theme palette to the next one.

   Reads data/palettes.yaml, looks at the `active` key, and rewrites it to the
   next palette in document order (wrapping around at the end). Only the
   `active:` line is touched — every palette definition, comment and blank line
   is preserved byte-for-byte.

   After rotating you still need to propagate the colours and rebuild icons:

     npm run generate-theme
     npm run generate-favicons

   Usage:
     node scripts/rotate-palette.js [options]

   Options:
     -i, --input   <path>   YAML source        (default: data/palettes.yaml)
     -p, --palette <id>     Force a specific palette instead of cycling
     --dry-run              Print what would change; write nothing
     -h, --help             Show this help

   When run inside GitHub Actions (GITHUB_OUTPUT set) it appends the chosen
   palette id/name so a workflow can use them in a commit message.
──────────────────────────────────────────────────────────────────────────────*/

const fs   = require('node:fs');
const path = require('node:path');

const { parseYaml } = require('./lib/yaml');

const ROOT          = path.resolve(__dirname, '..');
const DEFAULT_INPUT = path.join(ROOT, 'data', 'palettes.yaml');

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { input: DEFAULT_INPUT, palette: null, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if      (arg === '--input'   || arg === '-i') opts.input   = argv[++i];
    else if (arg === '--palette' || arg === '-p') opts.palette = argv[++i];
    else if (arg === '--dry-run')                 opts.dryRun  = true;
    else if (arg === '--help'    || arg === '-h') opts.help    = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/rotate-palette.js [options]

Options:
  -i, --input   <path>   YAML source        (default: data/palettes.yaml)
  -p, --palette <id>     Force a specific palette instead of cycling
  --dry-run              Print what would change; write nothing
  -h, --help             Show this help

Examples:
  node scripts/rotate-palette.js
  node scripts/rotate-palette.js --dry-run
  node scripts/rotate-palette.js --palette crimson
`);
}

// ─── Pure helpers (unit-tested) ────────────────────────────────────────────────

/** Ordered list of palette ids as they appear in the document. */
function paletteOrder(data) {
  if (!data || typeof data.palettes !== 'object' || data.palettes === null) return [];
  return Object.keys(data.palettes);
}

/** The id following `current` in `ids`, wrapping at the end. */
function nextPalette(ids, current) {
  if (!ids.length) throw new Error('no palettes defined');
  const idx = ids.indexOf(current);
  if (idx === -1) return ids[0];
  return ids[(idx + 1) % ids.length];
}

/**
 * Replace the value on the top-level `active:` line, preserving leading
 * whitespace and any trailing inline comment. Throws if no such line exists.
 */
function rewriteActive(yamlText, nextId) {
  const re = /^(active:[ \t]*)([^\s#]+)(.*)$/m;
  if (!re.test(yamlText)) {
    throw new Error('could not find a top-level `active:` line to rewrite');
  }
  return yamlText.replace(re, `$1${nextId}$3`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { printHelp(); return; }

  if (!fs.existsSync(opts.input)) {
    console.error(`Error: input file not found: ${opts.input}`);
    process.exitCode = 1;
    return;
  }

  const raw  = fs.readFileSync(opts.input, 'utf8');
  let data;
  try {
    data = parseYaml(raw);
  } catch (err) {
    console.error(`YAML parse error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const ids = paletteOrder(data);
  if (!ids.length) {
    console.error('Error: no palettes defined under `palettes`.');
    process.exitCode = 1;
    return;
  }

  const current = typeof data.active === 'string' ? data.active.trim() : '';
  let target;
  if (opts.palette) {
    if (!ids.includes(opts.palette)) {
      console.error(`Error: palette "${opts.palette}" is not defined. Available: ${ids.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    target = opts.palette;
  } else {
    target = nextPalette(ids, current);
  }

  const name    = (data.palettes[target] && data.palettes[target].name) || target;
  const changed = target !== current;

  if (opts.dryRun) {
    console.log(`active: ${current || '(unset)'} → ${target} (${name})${changed ? '' : ' [no change]'}`);
    return;
  }

  if (changed) {
    fs.writeFileSync(opts.input, rewriteActive(raw, target), 'utf8');
    console.log(`✓ active palette: ${current || '(unset)'} → ${target} (${name})`);
    console.log(`  Now run:  npm run generate-theme && npm run generate-favicons`);
  } else {
    console.log(`active palette already "${target}" (${name}) — nothing to do.`);
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `palette=${target}\npalette_name=${name}\nchanged=${changed}\n`,
    );
  }
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { parseArgs, paletteOrder, nextPalette, rewriteActive };
