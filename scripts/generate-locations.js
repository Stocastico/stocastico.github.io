#!/usr/bin/env node
'use strict';

const fs   = require('node:fs');
const path = require('node:path');

/* Shared YAML parser — also used by scripts/generate-cv.js */
const { parseYaml } = require('./lib/yaml');

const DEFAULT_TRIP_COLORS = ['#ff6b6b', '#c084fc', '#22c55e', '#38bdf8', '#f59e0b', '#fb7185'];
const DEFAULT_REGION_COLOR = '#ff8c42';
const DEFAULT_TRIP_CYCLE_SEC = 28;
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';
const REQUEST_DELAY_MS = 1100;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findYamlNameLine(sourceRaw, placeName) {
  if (typeof sourceRaw !== 'string' || !sourceRaw.trim()) return null;
  if (typeof placeName !== 'string' || !placeName.trim()) return null;

  const escaped = escapeRegExp(placeName.trim());
  const patterns = [
    new RegExp(`^\\s*name\\s*:\\s*${escaped}\\s*$`),
    new RegExp(`^\\s*name\\s*:\\s*"${escaped}"\\s*$`),
    new RegExp(`^\\s*name\\s*:\\s*'${escaped}'\\s*$`),
    new RegExp(`^\\s*-\\s*${escaped}\\s*$`),
    new RegExp(`^\\s*-\\s*\"${escaped}\"\\s*$`),
    new RegExp(`^\\s*-\\s*'${escaped}'\\s*$`),
  ];

  const lines = sourceRaw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (patterns.some((pattern) => pattern.test(lines[i]))) return i + 1;
  }
  return null;
}

function formatLocationHint({ contextLabel, placeName, sourceRaw, sourcePath }) {
  const parts = [];
  if (placeName) parts.push(`\"${placeName}\"`);
  if (contextLabel) parts.push(contextLabel);
  const where = parts.length ? parts.join(' at ') : 'unknown location';

  const line = findYamlNameLine(sourceRaw, placeName);
  if (!line) return where;
  const file = sourcePath || 'locations.yaml';
  return `${where} (${file}:${line})`;
}

function parseArgs(argv) {
  const out = {
    input: 'data/locations.yaml',
    output: 'data/locations.js',
    cache: '.cache/locations-geocode-cache.json',
    geocode: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' || arg === '-i') out.input = argv[++i];
    else if (arg === '--output' || arg === '-o') out.output = argv[++i];
    else if (arg === '--cache') out.cache = argv[++i];
    else if (arg === '--no-geocode') out.geocode = false;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-locations.js [options]

Options:
  -i, --input <path>    YAML source file (default: data/locations.yaml)
  -o, --output <path>   Generated JS output (default: data/locations.js)
  --cache <path>        Geocode cache JSON file (default: .cache/locations-geocode-cache.json)
  --no-geocode          Fail if coordinates are missing instead of querying Nominatim
  -h, --help            Show help
`);
}

/* parseYaml imported from ./lib/yaml above */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeHexColor(color, fallback) {
  if (typeof color !== 'string') return fallback;
  const trimmed = color.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function geocodeWithCache(name, cache, userAgent) {
  if (cache[name]) return cache[name];
  const url = `${NOMINATIM_API}?q=${encodeURIComponent(name)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': userAgent,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || !data.length) throw new Error('No geocoding results');
  const lat = Number.parseFloat(data[0].lat);
  const lon = Number.parseFloat(data[0].lon);
  const result = { lat, lon };
  cache[name] = result;
  return result;
}

function normalizeCity(city) {
  if (typeof city === 'string') return { name: city };
  if (!city || typeof city !== 'object') return { name: '' };
  return { ...city };
}

function roundCoord(value) {
  return Number(value.toFixed(5));
}

function validateSource(source) {
  if (!source || typeof source !== 'object') throw new Error('YAML source must be an object');
  if (!Array.isArray(source.pins)) source.pins = [];
  if (!Array.isArray(source.trips)) source.trips = [];
  if (!Array.isArray(source.regions)) source.regions = [];
}

async function compileLocations(source, options) {
  validateSource(source);
  const geocodeCache = readJsonIfExists(options.cache, {});
  const ua = 'stocastico-website-locations-generator/1.0 (+https://github.com/stocastico)';
  let requests = 0;

  async function fillCoords(item, fallbackName, contextLabel) {
    const hasCoords = Number.isFinite(item.lat) && Number.isFinite(item.lon);
    if (hasCoords) {
      item.lat = roundCoord(Number(item.lat));
      item.lon = roundCoord(Number(item.lon));
      return;
    }

    const placeName = item.name || fallbackName;
    const locationHint = formatLocationHint({
      contextLabel,
      placeName,
      sourceRaw: options.sourceRaw,
      sourcePath: options.sourcePath,
    });

    if (!placeName) throw new Error(`Missing location name for geocoding at ${contextLabel || 'unknown context'}`);
    if (!options.geocode) throw new Error(`Missing coordinates for ${locationHint} (run without --no-geocode)`);

    const isCacheHit = Boolean(geocodeCache[placeName]);
    if (!isCacheHit && requests > 0) await wait(REQUEST_DELAY_MS);
    let coords;
    try {
      coords = await geocodeWithCache(placeName, geocodeCache, ua);
    } catch (error) {
      throw new Error(`Geocoding failed for ${locationHint}: ${error.message}`);
    }
    item.lat = roundCoord(coords.lat);
    item.lon = roundCoord(coords.lon);
    if (!isCacheHit) requests += 1;
  }

  const pins = [];
  for (let p = 0; p < source.pins.length; p += 1) {
    const rawPin = source.pins[p];
    const pin = { ...rawPin };
    pin.type = ['lived', 'current', 'worktrip', 'holiday'].includes(pin.type) ? pin.type : 'lived';
    await fillCoords(pin, pin.name, `pins[${p}]`);
    pins.push({
      type: pin.type,
      name: String(pin.name || ''),
      lat: pin.lat,
      lon: pin.lon,
      info: String(pin.info || ''),
    });
  }

  const trips = [];
  for (let t = 0; t < source.trips.length; t += 1) {
    const rawTrip = source.trips[t] || {};
    const cities = [];
    const sourceCities = Array.isArray(rawTrip.cities) ? rawTrip.cities : [];
    for (const rawCity of sourceCities) {
      const city = normalizeCity(rawCity);
      await fillCoords(city, city.name, `trips[${t}].cities[${cities.length}]`);
      cities.push({
        name: String(city.name || ''),
        lat: city.lat,
        lon: city.lon,
        ...(city.info ? { info: String(city.info) } : {}),
      });
    }
    if (cities.length < 2) continue;

    trips.push({
      name: String(rawTrip.name || `Trip ${t + 1}`),
      color: sanitizeHexColor(rawTrip.color, DEFAULT_TRIP_COLORS[t % DEFAULT_TRIP_COLORS.length]),
      cycleSec: Number.isFinite(rawTrip.cycleSec) ? rawTrip.cycleSec : DEFAULT_TRIP_CYCLE_SEC,
      cities,
    });
  }

  const regions = [];
  for (let r = 0; r < source.regions.length; r += 1) {
    const rawRegion = source.regions[r];
    const region = { ...rawRegion };
    await fillCoords(region, region.name, `regions[${r}]`);
    regions.push({
      name: String(region.name || ''),
      lat: region.lat,
      lon: region.lon,
      radius: Number.isFinite(region.radius) ? region.radius : 1,
      color: sanitizeHexColor(region.color, DEFAULT_REGION_COLOR),
      info: String(region.info || ''),
    });
  }

  ensureDirForFile(options.cache);
  fs.writeFileSync(options.cache, `${JSON.stringify(geocodeCache, null, 2)}\n`);

  return { pins, trips, regions, geocodeRequests: requests };
}

function toLocationsJs(locations, sourcePath) {
  const payload = JSON.stringify(
    {
      pins: locations.pins,
      trips: locations.trips,
      regions: locations.regions,
    },
    null,
    2,
  );
  return `/* eslint-disable */
/* Generated by scripts/generate-locations.js from ${sourcePath} */
export const LOCATIONS = ${payload};

if (typeof globalThis !== 'undefined') globalThis.LOCATIONS = LOCATIONS;
`;
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const cachePath = path.resolve(options.cache);

  if (!fs.existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);
  const sourceRaw = fs.readFileSync(inputPath, 'utf8');
  const source = parseYaml(sourceRaw);
  const sourcePath = path.relative(process.cwd(), inputPath);
  const compiled = await compileLocations(source, {
    ...options,
    cache: cachePath,
    sourceRaw,
    sourcePath,
  });
  const js = toLocationsJs(compiled, sourcePath);
  ensureDirForFile(outputPath);
  fs.writeFileSync(outputPath, `${js}\n`, 'utf8');
  console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Pins: ${compiled.pins.length}, Trips: ${compiled.trips.length}, Regions: ${compiled.regions.length}`);
  console.log(`Geocoding requests: ${compiled.geocodeRequests}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseYaml,
  compileLocations,
  toLocationsJs,
};
