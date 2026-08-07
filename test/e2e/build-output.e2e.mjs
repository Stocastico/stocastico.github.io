/* ─────────────────────────────────────────────────────────────────────────────
   build-output.e2e.mjs — assertions about the artefact that actually ships.

   Some checks can only be made after `npm run build`, and there was nowhere to
   put them. The dist/CNAME assertion lived in test/cname.test.js guarded by

       skip: fs.existsSync(distDir) ? false : 'dist/ not built yet'

   which reads as a courtesy — green suite without a build — and behaves as a
   deletion. Every workflow runs `npm test` *before* `npm run build`
   (deploy.yml, e2e.yml and rotate-palette.yml all do, deliberately,
   so a two-second static failure lands before a five-minute browser run). So
   dist/ never existed at the moment that test was evaluated, and it was
   skipped in CI every single time. It only ever ran on a developer's machine
   that happened to have a stale dist/ lying around — which is also why it
   reported "1 skipped" locally until someone built first.

   That matters more than it looks. dist/CNAME is what binds the custom domain:
   if it goes missing, GitHub Pages serves the site at
   stocastico.github.io instead of stefanomasneri.com, every canonical URL on
   the site points somewhere else, and the only test aimed at that had opted
   itself out.

   This file is the home for post-build artefact checks. It needs no browser —
   like budget.e2e.mjs it lives here purely because dist/ has to exist, and it
   runs in milliseconds. Every workflow runs the browser suite after the build,
   so anything asserted here is genuinely gated.
   ───────────────────────────────────────────────────────────────────────────── */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { DIST } from './harness.mjs';

const ROOT = path.resolve(DIST, '..');
const EXPECTED_DOMAIN = 'stefanomasneri.com';

describe('build output: the custom domain survives the build', () => {
  test('dist/CNAME exists and names the apex domain', () => {
    const file = path.join(DIST, 'CNAME');
    assert.ok(
      fs.existsSync(file),
      'dist/CNAME missing — Vite did not copy public/CNAME into the build, so '
      + `GitHub Pages would serve the site off github.io instead of ${EXPECTED_DOMAIN}`,
    );
    assert.equal(fs.readFileSync(file, 'utf8').trim(), EXPECTED_DOMAIN);
  });

  test('dist/CNAME matches public/CNAME', () => {
    /* The source file is asserted byte-for-byte in test/cname.test.js; this is
       the half that check could never make — that the build carried it over
       unchanged. */
    const src = fs.readFileSync(path.join(ROOT, 'public', 'CNAME'), 'utf8').trim();
    const out = fs.readFileSync(path.join(DIST, 'CNAME'), 'utf8').trim();
    assert.equal(out, src, 'dist/CNAME disagrees with public/CNAME');
  });
});

describe('build output: the pages Vite was asked for are all present', () => {
  /* vite.config.js lists every page as a rollup input by hand. A page dropped
     from that list still exists in the repo, still passes every static test
     that reads the source tree, and simply is not built — a 404 on a URL the
     sitemap advertises. Nothing compared the two lists. */
  test('every source page has a built counterpart in dist/', () => {
    const sourcePages = [
      ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
      ...fs.readdirSync(path.join(ROOT, 'projects'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => `projects/${f}`),
    ].sort();

    assert.ok(sourcePages.length >= 18, `found only ${sourcePages.length} source pages`);

    const missing = sourcePages.filter((rel) => !fs.existsSync(path.join(DIST, rel)));
    assert.deepEqual(
      missing, [],
      'these pages exist in the repo but were not built — add them to the '
      + 'rollupOptions.input map in vite.config.js',
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   The raster icons carry the palette the SVG carries.

   test/theme-sync.test.js already asserts public/favicon.svg matches the
   active palette in data/palettes.yaml, and test/html-quality.test.mjs asserts
   the PNGs and the .ico exist. Between those two there was a gap exactly the
   width of the failure that has already happened once: `generate-theme` run,
   `generate-favicons` forgotten. The SVG would be repainted, the rasters would
   still exist, and the tab icon, the bookmark, the PWA icon and the OS icon
   set would all be wearing last week's palette while the site wore this one.

   That is not hypothetical — the same shape of omission left every page
   marking the previous palette as selected for a full rotation cycle, because
   the recipe everyone copied predated the step. The weekly rotation workflow
   is unattended, so nothing else would notice.

   This lives in the browser layer rather than the fast suite because decoding
   a PNG means `sharp`, and `npm test` staying dependency-free and ~3 seconds
   is worth more than the two seconds this would add there. It needs no
   browser; like budget.e2e.mjs it is here for the post-build guarantee.
──────────────────────────────────────────────────────────────────────────────*/
const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

describe('build output: the raster icons match the active palette', () => {
  const svgPath = path.join(ROOT, 'public', 'favicon.svg');
  const svg = fs.readFileSync(svgPath, 'utf8');
  const bgHex = (svg.match(/<rect[^>]*fill="([^"]+)"/) || [])[1];

  test('public/favicon.svg still declares a background fill', () => {
    assert.ok(bgHex && hexToRgb(bgHex),
      `could not read a #rrggbb rect fill from public/favicon.svg (got ${bgHex})`);
  });

  for (const icon of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
    'icon-maskable-192.png', 'icon-maskable-512.png']) {
    test(`public/${icon} was rasterised from the current favicon.svg`, async () => {
      const sharp = (await import('sharp')).default;
      const file = path.join(ROOT, 'public', icon);
      assert.ok(fs.existsSync(file), `public/${icon} is missing — run \`npm run generate-favicons\``);

      const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      /* Sample the middle of the upper band: inside the rounded rect (so not
         the transparent corner) and above the "SM" glyph, which sits around
         the vertical centre. */
      const x = Math.floor(info.width / 2);
      const y = Math.floor(info.height * 0.15);
      const i = (y * info.width + x) * info.channels;
      const got = { r: data[i], g: data[i + 1], b: data[i + 2] };
      const want = hexToRgb(bgHex);

      /* A small tolerance: the SVG is rendered at 4x and downsampled, so the
         background can pick up a unit of rounding. Anything larger is a
         different colour, which is the whole question. */
      const delta = Math.max(
        Math.abs(got.r - want.r), Math.abs(got.g - want.g), Math.abs(got.b - want.b),
      );
      assert.ok(delta <= 4,
        `public/${icon} background is rgb(${got.r},${got.g},${got.b}) but favicon.svg says `
        + `${bgHex} = rgb(${want.r},${want.g},${want.b}). The rasters are stale — `
        + 'run `npm run generate-favicons` after `npm run generate-theme`.');
    });
  }
});
