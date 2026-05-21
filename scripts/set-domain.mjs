#!/usr/bin/env node
/* ============================================================
   set-domain — migrate the whole site to a custom domain in one
   step. Updates the single source of truth (scripts/lib/site.json),
   rewrites the hardcoded origin across the static HTML, robots.txt
   and sitemap.xml, and writes public/CNAME for GitHub Pages.

   The GitHub repository URL (github.com/Stocastico/stocastico.github.io)
   is deliberately left untouched.

   Usage:
     node scripts/set-domain.mjs <new-domain>
     npm run set-domain -- example.com
     npm run set-domain -- https://www.example.com

   After running:
     npm run generate-sitemap
     npm run generate-project-jsonld
     npm test
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE_JSON = path.join(__dirname, 'lib', 'site.json');

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  process.stdout.write('Usage: node scripts/set-domain.mjs <new-domain>\n');
  process.exit(arg ? 0 : 1);
}

/* Normalise: accept "example.com", "https://example.com", trailing slash. */
const newDomain = arg.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim();
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(newDomain)) {
  process.stderr.write(`Invalid domain: "${arg}"\n`);
  process.exit(1);
}
const newUrl = `https://${newDomain}`;

const site = JSON.parse(fs.readFileSync(SITE_JSON, 'utf8'));
const oldDomain = site.domain;
if (oldDomain === newDomain) {
  process.stdout.write(`Domain is already ${newDomain} — nothing to do.\n`);
  process.exit(0);
}
const escapedOld = oldDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Files whose hardcoded origin must be rewritten. */
const targets = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => path.join(ROOT, f)),
  ...fs.readdirSync(path.join(ROOT, 'projects')).filter((f) => f.endsWith('.html'))
    .map((f) => path.join(ROOT, 'projects', f)),
  path.join(ROOT, 'public', 'robots.txt'),
  path.join(ROOT, 'public', 'sitemap.xml'),
];

let touched = 0;
for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before.split(`https://${oldDomain}`).join(newUrl);
  /* Bare references (robots.txt comment, 404 copy) but NOT the github.com
     repo path, which is preceded by a slash. */
  after = after.replace(new RegExp(`(?<![/A-Za-z0-9.])${escapedOld}`, 'g'), newDomain);
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched += 1;
    process.stdout.write(`✓ ${path.relative(ROOT, file)}\n`);
  }
}

site.url = newUrl;
site.domain = newDomain;
fs.writeFileSync(SITE_JSON, `${JSON.stringify(site, null, 2)}\n`);
process.stdout.write(`✓ ${path.relative(ROOT, SITE_JSON)}\n`);

const cnamePath = path.join(ROOT, 'public', 'CNAME');
fs.writeFileSync(cnamePath, `${newDomain}\n`);
process.stdout.write(`✓ ${path.relative(ROOT, cnamePath)} (GitHub Pages custom domain)\n`);

process.stdout.write(`\nDone: ${oldDomain} → ${newDomain} (${touched} files rewritten).\n`);
process.stdout.write('Next:\n  npm run generate-sitemap\n  npm run generate-project-jsonld\n  npm test\n');
