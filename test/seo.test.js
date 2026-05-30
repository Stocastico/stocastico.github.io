'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   SEO regression tests.

   Asserts that every entry-point HTML page ships with:
   - a non-empty <meta name="description">
   - the home page has a JSON-LD Person schema
   - the stat counters in index.html have non-zero numeric content
     (the JS animation resets them to 0 at runtime, but crawlers /
      no-JS users must see the real values)

   Run:  node --test test/seo.test.js
──────────────────────────────────────────────────────────────────────────────*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function metaDescription(html) {
  /* Tolerates attribute order and single/double quotes; matches
     the first <meta name="description" content="..."> found. */
  const m = html.match(/<meta\s+(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/i)
    || html.match(/<meta\s+(?=[^>]*\bcontent=["']([^"']+)["'])(?=[^>]*\bname=["']description["'])[^>]*>/i);
  return m ? m[1].trim() : null;
}

const pages = [
  { rel: 'index.html',    label: 'home' },
  { rel: 'cv.html',       label: 'cv' },
  { rel: 'projects.html', label: 'projects' },
  { rel: 'travel.html',   label: 'travel' },
];

for (const { rel, label } of pages) {
  test(`SEO: ${label} (${rel}) has a non-empty <meta name="description">`, () => {
    const html = read(rel);
    const desc = metaDescription(html);
    assert.ok(desc, `<meta name="description"> missing in ${rel}`);
    assert.ok(desc.length > 20, `<meta name="description"> in ${rel} is too short: "${desc}"`);
  });
}

function canonicalHref(html) {
  /* Tolerates attribute order and single/double quotes; matches the first
     <link rel="canonical" href="..."> found. */
  const m = html.match(/<link\s+(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i)
    || html.match(/<link\s+(?=[^>]*\bhref=["']([^"']+)["'])(?=[^>]*\brel=["']canonical["'])[^>]*>/i);
  return m ? m[1].trim() : null;
}

const canonicalExpected = [
  { rel: 'index.html',    label: 'home',     href: 'https://stefanomasneri.com/' },
  { rel: 'cv.html',       label: 'cv',       href: 'https://stefanomasneri.com/cv.html' },
  { rel: 'projects.html', label: 'projects', href: 'https://stefanomasneri.com/projects.html' },
  { rel: 'travel.html',   label: 'travel',   href: 'https://stefanomasneri.com/travel.html' },
];

for (const { rel, label, href } of canonicalExpected) {
  test(`SEO: ${label} (${rel}) has a canonical URL on stefanomasneri.com`, () => {
    const html = read(rel);
    const canon = canonicalHref(html);
    assert.ok(canon, `<link rel="canonical"> missing in ${rel}`);
    assert.match(canon, /^https:\/\/stefanomasneri\.com(\/|$)/,
      `${rel} canonical not on stefanomasneri.com: "${canon}"`);
    assert.equal(canon, href, `${rel} canonical should be ${href}, got "${canon}"`);
  });
}

function readJsonLd(html) {
  /* Returns a flat array of every parsed JSON-LD block in the document. */
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const json = JSON.parse(m[1]);
    if (Array.isArray(json)) out.push(...json);
    else out.push(json);
  }
  return out;
}

test('SEO: index.html includes a JSON-LD Person schema', () => {
  const items = readJsonLd(read('index.html'));
  const person = items.find((it) => it && it['@type'] === 'Person');
  assert.ok(person, 'JSON-LD does not contain a Person entry');
  assert.equal(typeof person.name, 'string', 'Person.name must be a string');
  assert.ok(person.name.length > 0, 'Person.name must be non-empty');
});

test('SEO: index.html JSON-LD Person.url points to stefanomasneri.com', () => {
  const raw = read('index.html');
  /* Block must exist and be valid JSON (readJsonLd throws on malformed JSON). */
  const items = readJsonLd(raw);
  const person = items.find((it) => it && it['@type'] === 'Person');
  assert.ok(person, 'JSON-LD Person block missing in index.html');
  assert.equal(person.url, 'https://stefanomasneri.com',
    `Person.url should be https://stefanomasneri.com, got "${person.url}"`);
});

test('SEO: cv.html includes a JSON-LD ProfilePage with mainEntity Person', () => {
  const items = readJsonLd(read('cv.html'));
  const profile = items.find((it) => it && it['@type'] === 'ProfilePage');
  assert.ok(profile, 'cv.html missing ProfilePage JSON-LD');
  const person = profile.mainEntity;
  assert.ok(person && person['@type'] === 'Person', 'ProfilePage.mainEntity must be a Person');
  assert.equal(typeof person.name, 'string');
  assert.ok(person.name.length > 0);
});

test('SEO: projects.html includes a JSON-LD CollectionPage with ItemList', () => {
  const items = readJsonLd(read('projects.html'));
  const page = items.find((it) => it && it['@type'] === 'CollectionPage');
  assert.ok(page, 'projects.html missing CollectionPage JSON-LD');
  assert.ok(page.mainEntity && page.mainEntity['@type'] === 'ItemList',
    'CollectionPage.mainEntity must be an ItemList');
  const list = page.mainEntity.itemListElement;
  assert.ok(Array.isArray(list) && list.length >= 8,
    `ItemList should contain >=8 entries, got ${list ? list.length : 'none'}`);
  for (const entry of list) {
    assert.equal(entry['@type'], 'ListItem');
    assert.equal(typeof entry.position, 'number');
    assert.ok(typeof entry.url === 'string' && entry.url.length > 0,
      `ListItem ${entry.position} missing url`);
  }
});

function ogTag(html, property) {
  const re = new RegExp(
    `<meta\\s+(?=[^>]*\\bproperty=["']${property}["'])(?=[^>]*\\bcontent=["']([^"']+)["'])[^>]*>`,
    'i'
  );
  const re2 = new RegExp(
    `<meta\\s+(?=[^>]*\\bcontent=["']([^"']+)["'])(?=[^>]*\\bproperty=["']${property}["'])[^>]*>`,
    'i'
  );
  const m = html.match(re) || html.match(re2);
  return m ? m[1].trim() : null;
}

const indexableTopLevel = [
  { rel: 'index.html',    label: 'home' },
  { rel: 'cv.html',       label: 'cv' },
  { rel: 'projects.html', label: 'projects' },
];

test('SEO: manifest.webmanifest is valid JSON with name and icons', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.ok(manifest.name && manifest.name.length > 0, 'manifest.name missing');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 1, 'manifest.icons missing');
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', icon.src.replace(/^\//, ''))),
      `manifest icon missing on disk: ${icon.src}`);
  }
});

for (const { rel, label } of indexableTopLevel) {
  test(`SEO: ${label} (${rel}) has og:image, og:image:alt, and og:locale`, () => {
    const html = read(rel);
    assert.ok(ogTag(html, 'og:image'),     `${rel} missing og:image`);
    assert.ok(ogTag(html, 'og:image:alt'), `${rel} missing og:image:alt`);
    assert.ok(ogTag(html, 'og:locale'),    `${rel} missing og:locale`);
  });
}

function nameTag(html, name) {
  const re = new RegExp(
    `<meta\\s+(?=[^>]*\\bname=["']${name}["'])(?=[^>]*\\bcontent=["']([^"']+)["'])[^>]*>`, 'i');
  const re2 = new RegExp(
    `<meta\\s+(?=[^>]*\\bcontent=["']([^"']+)["'])(?=[^>]*\\bname=["']${name}["'])[^>]*>`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? m[1].trim() : null;
}

/* The og:image / twitter:image URLs are absolute (https://<site>/img/...).
   Vite hashes referenced images into dist/assets/, but these meta strings are
   never rewritten, so the literal file must exist under img/ (and ship to
   dist/img/ via the copy-og-images plugin) or the social card 404s — and an
   SVG is not a valid social-card image. */
const imageBearingPages = [
  'index.html', 'cv.html', 'projects.html', '404.html',
  ...fs.readdirSync(path.join(ROOT, 'projects'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `projects/${f}`),
];

for (const rel of imageBearingPages) {
  test(`SEO: ${rel} social images resolve to real raster files`, () => {
    const html = read(rel);
    const urls = [ogTag(html, 'og:image'), nameTag(html, 'twitter:image')].filter(Boolean);
    for (const url of urls) {
      const localPath = new URL(url).pathname.replace(/^\//, '');
      assert.ok(fs.existsSync(path.join(ROOT, localPath)),
        `${rel}: ${url} → file missing at ${localPath}`);
      assert.doesNotMatch(localPath, /\.svg$/i,
        `${rel}: ${url} is an SVG; social cards need a raster (png/jpg/webp)`);
    }
  });
}

for (const rel of imageBearingPages) {
  test(`SEO: ${rel} links the web app manifest`, () => {
    assert.match(read(rel), /<link\s+rel=["']manifest["']\s+href=["']\/manifest\.webmanifest["']/i,
      `${rel} missing <link rel="manifest">`);
  });
}

function cspMeta(html) {
  /* The CSP value contains single quotes (e.g. 'self'), so the content
     capture must be tied to the surrounding double quotes only. */
  const m = html.match(/<meta\s+(?=[^>]*\bhttp-equiv=["']Content-Security-Policy["'])(?=[^>]*\bcontent="([^"]+)")[^>]*>/i)
    || html.match(/<meta\s+(?=[^>]*\bcontent="([^"]+)")(?=[^>]*\bhttp-equiv=["']Content-Security-Policy["'])[^>]*>/i);
  return m ? m[1] : null;
}

const allRoutes = [
  'index.html',
  'cv.html',
  'projects.html',
  '404.html',
  'projects/aroundtheworld.html',
  'projects/audience-engagement.html',
  'projects/avatech.html',
  'projects/clear-architecture.html',
  'projects/mpi-brain-research.html',
  'projects/rag-document-qa.html',
  'projects/traction.html',
  'projects/ufc-fighter-tracking.html',
];

for (const rel of allRoutes) {
  test(`security: ${rel} ships a Content-Security-Policy meta tag`, () => {
    const csp = cspMeta(read(rel));
    assert.ok(csp, `${rel} missing <meta http-equiv="Content-Security-Policy">`);
    /* Basic shape: must lock down default-src and only let connect-src
       reach the Nominatim geocoder (no other third parties allowed). */
    assert.match(csp, /default-src\s+'self'/, `${rel} CSP missing default-src 'self'`);
    assert.match(csp, /base-uri\s+'self'/, `${rel} CSP missing base-uri 'self'`);
    assert.match(csp, /frame-ancestors\s+'self'/, `${rel} CSP missing frame-ancestors`);
    assert.match(csp, /connect-src[^;]*nominatim\.openstreetmap\.org/,
      `${rel} CSP must allow nominatim.openstreetmap.org for the geocoder`);
  });
}

test('SEO: index.html stat counters have non-zero values baked into HTML', () => {
  const html = read('index.html');
  /* Capture each <span class="stat-number" data-count="N">M</span> pair. */
  const re = /<span[^>]*class=["'][^"']*\bstat-number\b[^"']*["'][^>]*data-count=["'](\d+)["'][^>]*>([^<]*)<\/span>/g;
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push({ dataCount: m[1], textContent: m[2].trim() });
  }
  assert.ok(matches.length >= 3, `expected at least 3 stat counters, found ${matches.length}`);
  for (const { dataCount, textContent } of matches) {
    assert.notEqual(textContent, '0', `stat counter (data-count="${dataCount}") still ships with "0" textContent`);
    assert.equal(textContent, dataCount, `stat counter textContent should match data-count (got "${textContent}", expected "${dataCount}")`);
  }
});
