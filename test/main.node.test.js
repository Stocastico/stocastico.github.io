const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const { formatIsoDate, geocodeLocations, Globe3D } = require('../js/main.js');

function loadConstFromScript(relPath, constName) {
  const abs = path.join(ROOT, relPath);
  const code = fs.readFileSync(abs, 'utf8');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${code}\n;globalThis.__out = ${constName};`, context, { filename: abs });
  return context.__out;
}

test('formatIsoDate renders ISO date without timezone shift', () => {
  assert.equal(formatIsoDate('2024-11-20'), '20 November 2024');
  assert.equal(formatIsoDate('2024-07-18'), '18 July 2024');
});

test('formatIsoDate gracefully handles invalid values', () => {
  assert.equal(formatIsoDate(''), '');
  assert.equal(formatIsoDate('invalid-date'), 'invalid-date');
  assert.equal(formatIsoDate(undefined), '');
});

test('geocodeLocations does not call fetch when all coordinates are present', async () => {
  const sample = {
    pins: [{ name: 'A', lat: 1, lon: 2 }],
    regions: [{ name: 'R', lat: 3, lon: 4 }],
    trips: [{ cities: [{ name: 'T', lat: 5, lon: 6 }] }],
  };
  let calls = 0;
  const prevFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return { json: async () => [] };
  };
  try {
    await geocodeLocations(sample);
    assert.equal(calls, 0);
  } finally {
    global.fetch = prevFetch;
  }
});

test('geocodeLocations fills coordinates on successful lookup', async () => {
  const sample = { pins: [{ name: 'Paris, France', info: 'Holiday' }] };
  const prevFetch = global.fetch;
  global.fetch = async () => ({
    json: async () => [{ lat: '48.8566', lon: '2.3522' }],
  });
  try {
    await geocodeLocations(sample);
    assert.equal(sample.pins[0].lat, 48.8566);
    assert.equal(sample.pins[0].lon, 2.3522);
    assert.equal(sample.pins[0]._skip, undefined);
  } finally {
    global.fetch = prevFetch;
  }
});

test('geocodeLocations marks item as skipped on failed lookup', async () => {
  const sample = { pins: [{ name: 'XXXXX_INVALID_LOCATION', info: 'Skip me' }] };
  const prevFetch = global.fetch;
  global.fetch = async () => ({ json: async () => [] });
  try {
    await geocodeLocations(sample);
    assert.equal(sample.pins[0]._skip, true);
    assert.equal(sample.pins[0].lat, undefined);
    assert.equal(sample.pins[0].lon, undefined);
  } finally {
    global.fetch = prevFetch;
  }
});

test('BLOG_POSTS contain reachable local files or absolute URLs', () => {
  const blogPosts = loadConstFromScript('data/blog.js', 'BLOG_POSTS');
  assert.ok(Array.isArray(blogPosts));
  assert.ok(blogPosts.length > 0);

  for (const post of blogPosts) {
    assert.ok(post.title);
    assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(post.excerpt);
    assert.ok(post.url);
    assert.notEqual(post.url, '#');

    if (!/^https?:\/\//.test(post.url)) {
      const target = path.join(ROOT, post.url);
      assert.ok(fs.existsSync(target), `Missing blog target file: ${post.url}`);
    }
  }
});

test('PUBLICATIONS entries have required fields', () => {
  const publications = loadConstFromScript('data/publications.js', 'PUBLICATIONS');
  assert.ok(Array.isArray(publications));
  assert.ok(publications.length > 0);
  for (const pub of publications) {
    assert.ok(pub.year);
    assert.ok(pub.title);
    assert.ok(pub.authors);
    assert.ok(pub.venue);
  }
});

test('LOCATIONS no longer require runtime geocoding in production data', () => {
  const locations = loadConstFromScript('data/locations.js', 'LOCATIONS');
  const all = [
    ...(locations.pins || []),
    ...(locations.regions || []),
    ...((locations.trips || []).flatMap((t) => t.cities || [])),
  ];
  assert.ok(all.length > 0);
  for (const loc of all) {
    assert.equal(typeof loc.lat, 'number', `Missing lat for ${loc.name}`);
    assert.equal(typeof loc.lon, 'number', `Missing lon for ${loc.name}`);
  }
});

test('Globe3D._tripPos chooses the expected segment based on length', () => {
  const c1 = { getPoint: (t) => ({ seg: 1, t }) };
  const c2 = { getPoint: (t) => ({ seg: 2, t }) };
  const anim = {
    curves: [c1, c2],
    segLens: [10, 30],
    total: 40,
  };

  const pA = Globe3D.prototype._tripPos(anim, 0.125); // rem=5 -> segment 1
  assert.equal(pA.seg, 1);
  assert.ok(pA.t > 0 && pA.t < 1);

  const pB = Globe3D.prototype._tripPos(anim, 0.75); // rem=30 -> segment 2
  assert.equal(pB.seg, 2);
  assert.ok(pB.t > 0 && pB.t <= 1);
});

