const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseYaml,
  compileLocations,
  toLocationsJs,
} = require('../scripts/generate-locations.js');

test('parseYaml parses the expected locations schema', () => {
  const parsed = parseYaml(`
pins:
  - type: lived
    name: Crema, Italy
    info: Home
trips:
  - name: Trip A
    cycleSec: 22
    cities:
      - name: Milan, Italy
        lat: 45.4642
        lon: 9.19
      - name: Rome, Italy
        lat: 41.9028
        lon: 12.49
regions:
  - name: Sardinia, Italy
    radius: 1.4
    lat: 40.12
    lon: 9.07
`);

  assert.equal(parsed.pins[0].name, 'Crema, Italy');
  assert.equal(parsed.trips[0].cities[0].name, 'Milan, Italy');
  assert.equal(parsed.regions[0].radius, 1.4);
});

test('compileLocations assigns defaults and keeps explicit coordinates', async () => {
  const source = {
    pins: [
      { type: 'lived', name: 'Crema, Italy', lat: 45.36, lon: 9.68, info: 'Home town' },
      { type: 'unexpected', name: 'Paris, France', lat: 48.8566, lon: 2.3522, info: 'Holiday' },
    ],
    trips: [
      {
        name: 'Trip A',
        cities: [
          { name: 'Milan, Italy', lat: 45.4642, lon: 9.19 },
          { name: 'Rome, Italy', lat: 41.9028, lon: 12.49 },
        ],
      },
    ],
    regions: [
      { name: 'Sardinia, Italy', lat: 40.12, lon: 9.07, radius: 1.4, info: 'Holiday' },
    ],
  };

  const compiled = await compileLocations(source, {
    geocode: false,
    cache: '/tmp/stocastico-test-cache.json',
  });

  assert.equal(compiled.geocodeRequests, 0);
  assert.equal(compiled.pins[1].type, 'lived');
  assert.equal(compiled.trips[0].color, '#ff6b6b');
  assert.equal(compiled.regions[0].color, '#ff8c42');
});

test('compileLocations preserves all valid pin types', async () => {
  const source = {
    pins: [
      { type: 'lived', name: 'A', lat: 1, lon: 1, info: '' },
      { type: 'current', name: 'B', lat: 2, lon: 2, info: '' },
      { type: 'worktrip', name: 'C', lat: 3, lon: 3, info: '' },
      { type: 'holiday', name: 'D', lat: 4, lon: 4, info: '' },
    ],
    trips: [],
    regions: [],
  };
  const compiled = await compileLocations(source, { geocode: false, cache: '/tmp/stocastico-test-types.json' });
  assert.equal(compiled.pins[0].type, 'lived');
  assert.equal(compiled.pins[1].type, 'current');
  assert.equal(compiled.pins[2].type, 'worktrip');
  assert.equal(compiled.pins[3].type, 'holiday');
});

test('toLocationsJs returns executable JS declaration', () => {
  const js = toLocationsJs(
    {
      pins: [{ type: 'lived', name: 'Crema, Italy', lat: 45.36, lon: 9.68, info: 'Home town' }],
      trips: [],
      regions: [],
    },
    'data/locations.yaml',
  );

  assert.match(js, /export const LOCATIONS =/);
  assert.match(js, /Crema, Italy/);
  assert.match(js, /globalThis\.LOCATIONS = LOCATIONS/);
});

test('compileLocations reports place and YAML line when coordinates are missing with --no-geocode', async () => {
  const source = {
    pins: [
      { type: 'lived', name: 'Unknown Place XYZ', info: 'Missing coords' },
    ],
    trips: [],
    regions: [],
  };

  const sourceRaw = `
pins:
  - type: lived
    name: Unknown Place XYZ
    info: Missing coords
trips: []
regions: []
`;

  await assert.rejects(
    () => compileLocations(source, {
      geocode: false,
      cache: '/tmp/stocastico-test-no-geocode.json',
      sourceRaw,
      sourcePath: 'data/locations.yaml',
    }),
    /Missing coordinates for "Unknown Place XYZ" at pins\[0\] \(data\/locations\.yaml:4\)/,
  );
});

test('compileLocations reports geocoding no-results with place and YAML line', async () => {
  const source = {
    pins: [
      { type: 'lived', name: 'No Result City ABC', info: 'Missing coords' },
    ],
    trips: [],
    regions: [],
  };

  const sourceRaw = `
pins:
  - type: lived
    name: No Result City ABC
    info: Missing coords
trips: []
regions: []
`;

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return [];
    },
  });

  try {
    await assert.rejects(
      () => compileLocations(source, {
        geocode: true,
        cache: '/tmp/stocastico-test-geocode-empty.json',
        sourceRaw,
        sourcePath: 'data/locations.yaml',
      }),
      /Geocoding failed for "No Result City ABC" at pins\[0\] \(data\/locations\.yaml:4\): No geocoding results/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
