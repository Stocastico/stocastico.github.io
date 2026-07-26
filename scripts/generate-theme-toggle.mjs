#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   generate-theme-toggle.mjs — wire the light/dark theme switch into every page.

   Three idempotent, marker-wrapped edits per HTML file:

     1. Drop the hard-coded `data-theme="dark"` from <html>. The site is dark by
        default (the :root tokens), so no attribute is needed; this lets a
        stored *light* choice be applied without fighting an inline attribute.
        That stored choice is re-applied before paint by …

     2. … the <head> bootstrap <script> (wrapped in <!-- theme-bootstrap -->):
        reads localStorage and pins data-theme (and data-palette) before first
        paint — no FOUC. The palette id is pattern-checked rather than matched
        against the known list: the bootstrap has no access to the generated
        palette table, and an unknown id simply matches no CSS rule and falls
        back to the :root default.
        Inserted after the CSP <meta> so the CSP hash (added by
        generate-csp-meta) covers it.

     3. The navbar toggle <button> (wrapped in <!-- theme-toggle -->), inserted
        right after the mobile hamburger. Pages without the standard navbar
        (e.g. 404.html) are skipped for the button but still get 1 + 2.

   Re-run after adding an HTML page, then run generate-csp-meta (the bootstrap
   script is hashed into each page's CSP).

   Usage: node scripts/generate-theme-toggle.mjs [--dry-run] [--help]
──────────────────────────────────────────────────────────────────────────────*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Snippets (indentation matches the surrounding markup) ─────────────────── */

const BOOTSTRAP = [
  '  <!-- theme-bootstrap -->',
  "  <script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var p=localStorage.getItem('palette');if(p&&/^[a-z0-9-]{1,24}$/.test(p))document.documentElement.setAttribute('data-palette',p)}catch(e){}</script>",
  '  <!-- /theme-bootstrap -->',
].join('\n');

const TOGGLE = [
  '      <!-- theme-toggle -->',
  '      <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch colour theme" title="Switch colour theme">',
  '        <svg class="theme-toggle-icon icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  '        <svg class="theme-toggle-icon icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  '      </button>',
  '      <!-- /theme-toggle -->',
].join('\n');

/* The exact hamburger block every standard navbar carries — anchor for (3). */
const HAMBURGER = [
  '      <button class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-label="Toggle menu">',
  '        <span></span><span></span><span></span>',
  '      </button>',
].join('\n');

const CSP_END = '<!-- /generated:csp-meta -->';

/* ── Transform a single HTML document ──────────────────────────────────────── */

export function injectThemeToggle(html) {
  let out = html;
  let changed = false;

  /* 1. Strip the hard-coded data-theme="dark" from the <html> tag. */
  const stripped = out.replace(/(<html\b[^>]*?)\s+data-theme="dark"/i, '$1');
  if (stripped !== out) { out = stripped; changed = true; }

  /* 2. Bootstrap script — replace between markers if present, else insert
        after the CSP meta block. */
  if (out.includes('<!-- theme-bootstrap -->')) {
    const next = out.replace(/[ \t]*<!-- theme-bootstrap -->[\s\S]*?<!-- \/theme-bootstrap -->/, BOOTSTRAP);
    if (next !== out) { out = next; changed = true; }
  } else if (out.includes(CSP_END)) {
    out = out.replace(CSP_END, `${CSP_END}\n${BOOTSTRAP}`);
    changed = true;
  }

  /* 3. Navbar toggle button — replace between markers if present, else insert
        after the hamburger (skip pages without the standard navbar). */
  if (out.includes('<!-- theme-toggle -->')) {
    const next = out.replace(/[ \t]*<!-- theme-toggle -->[\s\S]*?<!-- \/theme-toggle -->/, TOGGLE);
    if (next !== out) { out = next; changed = true; }
  } else if (out.includes(HAMBURGER)) {
    out = out.replace(HAMBURGER, `${HAMBURGER}\n${TOGGLE}`);
    changed = true;
  }

  return { html: out, changed };
}

/* ── File walking ──────────────────────────────────────────────────────────── */

function listHtmlFiles() {
  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).map(f => path.join(ROOT, f));
  const projDir = path.join(ROOT, 'projects');
  if (fs.existsSync(projDir)) {
    for (const f of fs.readdirSync(projDir)) {
      if (f.endsWith('.html')) files.push(path.join(projDir, f));
    }
  }
  return files.sort();
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/generate-theme-toggle.mjs [--dry-run]');
    return;
  }
  const dryRun = argv.includes('--dry-run');
  const written = [];
  for (const file of listHtmlFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    const { html, changed } = injectThemeToggle(src);
    if (!changed) continue;
    written.push(path.relative(ROOT, file));
    if (!dryRun) fs.writeFileSync(file, html, 'utf8');
  }
  console.log(`${dryRun ? 'Would update' : 'Updated'} ${written.length} file(s):`);
  written.forEach(f => console.log(`    ${f}`));
  if (!dryRun && written.length) {
    console.log('\n  Re-run `npm run generate-csp-meta` to hash the bootstrap script into each CSP.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
