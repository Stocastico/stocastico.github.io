#!/usr/bin/env node
'use strict';

/*
  generate-countries.js

  Derives the list of countries Stefano has lived in / visited from
  data/locations.yaml, classifies each as `lived` or `visited`, and emits:

    - data/countries.yaml  (human-editable source of truth — created from
                            locations.yaml on first run or with --refresh;
                            otherwise preserved so manual tweaks survive)
    - data/countries.js    (generated ESM module consumed by the homepage
                            world-map generator and any UI legend)

  Classification: pins of type `lived`/`current` mark a LIVED country;
  every other country that appears (pins + trip cities) is VISITED. A lived
  country is never also listed as visited.

  Country names are normalised to the names used in data/countries-110m.json
  (world-atlas TopoJSON) so the homepage choropleth can match them by name.
*/

const fs = require('node:fs');
const path = require('node:path');

const { parseYaml } = require('./lib/yaml');
const { toPosix } = require('./lib/paths');

/* Map the free-form country tokens used in locations.yaml to the canonical
   names found in data/countries-110m.json. Anything not listed passes
   through unchanged (most names already match). */
const ALIASES = {
  USA: 'United States of America',
  'U.S.A.': 'United States of America',
  US: 'United States of America',
  UK: 'United Kingdom',
  'U.K.': 'United Kingdom',
};

const LIVED_TYPES = new Set(['lived', 'current']);

function normalizeCountry(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return ALIASES[trimmed] || trimmed;
}

function countryOf(placeName) {
  if (typeof placeName !== 'string') return '';
  const token = placeName.split(',').pop();
  return normalizeCountry(token);
}

function cityName(city) {
  if (typeof city === 'string') return city;
  if (city && typeof city === 'object') return String(city.name || '');
  return '';
}

/* Returns { lived: string[], visited: string[] } derived from a parsed
   locations.yaml object. Disjoint, unsorted (callers sort). */
function deriveFromLocations(source) {
  const lived = new Set();
  const allVisited = new Set();

  for (const pin of (source && source.pins) || []) {
    const country = countryOf(pin && pin.name);
    if (!country) continue;
    if (LIVED_TYPES.has(pin.type)) lived.add(country);
    else allVisited.add(country);
  }

  for (const trip of (source && source.trips) || []) {
    for (const city of (trip && trip.cities) || []) {
      const country = countryOf(cityName(city));
      if (country) allVisited.add(country);
    }
  }

  // A lived country is never also "visited".
  const visited = [...allVisited].filter((c) => !lived.has(c));
  return { lived: [...lived], visited };
}

/* Build the final classified lists. Accepts either:
     { countries: { countries: [{ name, status }] } }  → explicit source wins
     { locations: <parsed locations.yaml> }             → derived
   When both are given, the explicit countries list takes precedence. */
function compileCountries({ countries, locations } = {}) {
  let lived;
  let visited;

  if (countries && Array.isArray(countries.countries)) {
    const livedSet = new Set();
    const visitedSet = new Set();
    for (const entry of countries.countries) {
      const name = normalizeCountry(entry && entry.name);
      if (!name) continue;
      if (entry.status === 'lived') livedSet.add(name);
      else visitedSet.add(name);
    }
    lived = [...livedSet];
    visited = [...visitedSet].filter((c) => !livedSet.has(c));
  } else {
    ({ lived, visited } = deriveFromLocations(locations || {}));
  }

  const collator = new Intl.Collator('en');
  return {
    lived: lived.sort(collator.compare),
    visited: visited.sort(collator.compare),
  };
}

function toCountriesYaml(classified, sourcePath) {
  const lines = [
    '# Countries where Stefano has lived or travelled.',
    `# Derived from ${sourcePath} by scripts/generate-countries.js — but EDITABLE:`,
    '# tweak the list or fix a status, then run `npm run generate-countries` to',
    '# rebuild data/countries.js (your edits here are preserved across runs).',
    '#',
    '#   status: lived | visited',
    '#   name:   must match data/countries-110m.json for the homepage map to',
    '#           highlight it (micro-states absent from that file stay listed',
    '#           here but simply will not render at world scale).',
    'countries:',
  ];
  const emit = (name, status) => {
    lines.push(`  - name: ${name}`);
    lines.push(`    status: ${status}`);
  };
  for (const name of classified.lived) emit(name, 'lived');
  for (const name of classified.visited) emit(name, 'visited');
  return `${lines.join('\n')}\n`;
}

function toCountriesJs(classified, sourcePath) {
  const payload = JSON.stringify(
    { lived: classified.lived, visited: classified.visited },
    null,
    2,
  );
  return `/* eslint-disable */
/* Generated by scripts/generate-countries.js from ${sourcePath} */
export const COUNTRIES = ${payload};

if (typeof globalThis !== 'undefined') globalThis.COUNTRIES = COUNTRIES;
`;
}

function parseArgs(argv) {
  const out = {
    locations: 'data/locations.yaml',
    countries: 'data/countries.yaml',
    output: 'data/countries.js',
    refresh: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--locations') out.locations = argv[++i];
    else if (arg === '--countries' || arg === '-c') out.countries = argv[++i];
    else if (arg === '--output' || arg === '-o') out.output = argv[++i];
    else if (arg === '--refresh') out.refresh = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-countries.js [options]

Reads data/locations.yaml, derives an editable data/countries.yaml (only if
missing, or with --refresh), then generates data/countries.js from it.

Options:
      --locations <path>   locations.yaml source (default: data/locations.yaml)
  -c, --countries <path>   editable countries.yaml (default: data/countries.yaml)
  -o, --output <path>      generated JS output (default: data/countries.js)
      --refresh            re-derive countries.yaml from locations.yaml,
                           discarding manual edits
      --dry-run            print results without writing files
  -h, --help               show this help
`);
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const locationsPath = path.resolve(options.locations);
  const countriesPath = path.resolve(options.countries);
  const outputPath = path.resolve(options.output);

  const countriesExists = fs.existsSync(countriesPath);

  // Step 1: ensure countries.yaml exists (derive from locations.yaml).
  if (!countriesExists || options.refresh) {
    if (!fs.existsSync(locationsPath)) {
      throw new Error(`Input file not found: ${locationsPath}`);
    }
    const locations = parseYaml(fs.readFileSync(locationsPath, 'utf8'));
    const derived = compileCountries({ locations });
    const yaml = toCountriesYaml(derived, toPosix(path.relative(process.cwd(), locationsPath)));
    if (options.dryRun) {
      console.log(`--- ${path.relative(process.cwd(), countriesPath)} ---`);
      console.log(yaml);
    } else {
      fs.mkdirSync(path.dirname(countriesPath), { recursive: true });
      fs.writeFileSync(countriesPath, yaml, 'utf8');
      console.log(`${options.refresh ? 'Refreshed' : 'Created'} ${path.relative(process.cwd(), countriesPath)}`);
    }
  }

  // Step 2: generate countries.js from countries.yaml (the source of truth).
  const countriesSource = options.dryRun && !countriesExists && !fs.existsSync(countriesPath)
    ? null
    : parseYaml(fs.readFileSync(countriesPath, 'utf8'));
  const classified = countriesSource
    ? compileCountries({ countries: countriesSource })
    : compileCountries({ locations: parseYaml(fs.readFileSync(locationsPath, 'utf8')) });

  const js = toCountriesJs(classified, toPosix(path.relative(process.cwd(), countriesPath)));
  if (options.dryRun) {
    console.log(`--- ${path.relative(process.cwd(), outputPath)} ---`);
    console.log(js);
  } else {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, js, 'utf8');
    console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
    console.log(`Lived: ${classified.lived.length}, Visited: ${classified.visited.length}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  ALIASES,
  normalizeCountry,
  countryOf,
  deriveFromLocations,
  compileCountries,
  toCountriesYaml,
  toCountriesJs,
  parseYaml,
};
