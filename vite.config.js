import { defineConfig } from 'vite';
import { resolve, extname, dirname } from 'node:path';
import { readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';

const projectsDir = resolve(__dirname, 'projects');
const projectPages = Object.fromEntries(
  readdirSync(projectsDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [`projects/${f.replace(/\.html$/, '')}`, resolve(projectsDir, f)]),
);

/* Copy docs/*.pdf into dist/docs/ — index.html and cv.html link directly to
   docs/cv.pdf and docs/defense.pdf, but the PDFs aren't in the Rollup graph,
   so Vite would otherwise drop them from the deploy. */
function copyDocsPdfs() {
  return {
    name: 'copy-docs-pdfs',
    apply: 'build',
    closeBundle() {
      const srcDir = resolve(__dirname, 'docs');
      const outDir = resolve(__dirname, 'dist', 'docs');
      if (!existsSync(srcDir)) return;
      mkdirSync(outDir, { recursive: true });
      for (const f of readdirSync(srcDir)) {
        if (f.toLowerCase().endsWith('.pdf')) {
          copyFileSync(resolve(srcDir, f), resolve(outDir, f));
        }
      }
    },
  };
}

/* Copy data/*.json into dist/data/ — globe.js fetches world-110m.json and
   europe-map.js fetches land-50m.json at runtime via fetch(), so they are
   not in the Rollup module graph and Vite won't include them automatically. */
function copyDataJson() {
  return {
    name: 'copy-data-json',
    apply: 'build',
    closeBundle() {
      const srcDir = resolve(__dirname, 'data');
      const outDir = resolve(__dirname, 'dist', 'data');
      mkdirSync(outDir, { recursive: true });
      for (const f of readdirSync(srcDir)) {
        if (f.toLowerCase().endsWith('.json')) {
          copyFileSync(resolve(srcDir, f), resolve(outDir, f));
        }
      }
    },
  };
}

/* Copy img/ into dist/img/ verbatim. The page <img>/CSS references are hashed
   into dist/assets/ by Rollup, but the og:image / twitter:image meta tags use
   absolute URLs (https://<site>/img/projects/...) that Vite never rewrites —
   so without this the social-card images would 404 in production. */
function copyOgImages() {
  const exts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif']);
  return {
    name: 'copy-og-images',
    apply: 'build',
    closeBundle() {
      const srcRoot = resolve(__dirname, 'img');
      const outRoot = resolve(__dirname, 'dist', 'img');
      if (!existsSync(srcRoot)) return;
      const walk = (relDir) => {
        for (const ent of readdirSync(resolve(srcRoot, relDir), { withFileTypes: true })) {
          const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
          if (ent.isDirectory()) { walk(rel); continue; }
          if (exts.has(extname(ent.name).toLowerCase())) {
            const dest = resolve(outRoot, rel);
            mkdirSync(dirname(dest), { recursive: true });
            copyFileSync(resolve(srcRoot, rel), dest);
          }
        }
      };
      walk('');
    },
  };
}

/* sitemap.xml and robots.txt live in public/ — Vite copies anything under
   public/ to dist/ verbatim. This is the standard mechanism; no plugin
   needed. The custom plugins above remain because data/*.json, docs/*.pdf
   and img/* live alongside non-static siblings (ESM modules, markdown
   notes), and splitting those directories would harm clarity. */

export default defineConfig({
  base: '/',
  appType: 'mpa',
  plugins: [copyDocsPdfs(), copyDataJson(), copyOgImages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        projects: resolve(__dirname, 'projects.html'),
        travel: resolve(__dirname, 'travel.html'),
        links: resolve(__dirname, 'links.html'),
        cv: resolve(__dirname, 'cv.html'),
        '404': resolve(__dirname, '404.html'),
        ...projectPages,
      },
    },
  },
  server: {
    open: false,
  },
});
