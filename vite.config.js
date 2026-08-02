import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { readdirSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';

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

/* Copy the data JSON that is fetched at *runtime* into dist/data/ — globe.js
   fetches world-110m.json and europe-map.js fetches land-50m.json via fetch(),
   so they are not in the Rollup module graph and Vite won't include them.

   An explicit allowlist, not `*.json`. Copying the whole directory published
   356 KB that nothing ever requests: cnn-model.json (237 KB of float32
   training weights — the browser gets the int8 data/lenet-weights.js instead),
   countries-110m.json (108 KB, consumed by generate-world-map at build time
   and emitted as inline SVG), cnn-samples.json (Rollup already bundles it, so
   the copy was a second unreferenced one) and the {"type":"module"} stub.
   Adding a runtime fetch means adding its file here. */
const RUNTIME_DATA_JSON = ['world-110m.json', 'land-50m.json'];

function copyDataJson() {
  return {
    name: 'copy-data-json',
    apply: 'build',
    closeBundle() {
      const srcDir = resolve(__dirname, 'data');
      const outDir = resolve(__dirname, 'dist', 'data');
      mkdirSync(outDir, { recursive: true });
      for (const f of RUNTIME_DATA_JSON) {
        copyFileSync(resolve(srcDir, f), resolve(outDir, f));
      }
    },
  };
}

/* Copy into dist/img/ exactly the images that are referenced by an absolute
   URL, and nothing else.

   Why any copy is needed: page <img> and CSS references are hashed into
   dist/assets/ by Rollup, but og:image / twitter:image use absolute URLs
   (https://<site>/img/projects/...) that Vite never rewrites, so those files
   would 404 in production.

   Why it is not `walk everything`, which is what it used to do: Rollup's
   hashed copy and this verbatim copy then both shipped. Measured by content
   hash, 28 files were byte-identical duplicates totalling 1,378 KB, on top of
   546 KB of images nothing referenced at all. That is the same lesson
   RUNTIME_DATA_JSON above records — an explicit set, not a directory sweep.

   The set is *derived* rather than hardcoded, by scanning the built HTML for
   absolute /img/ URLs. A hand-written list would be one more thing to update
   when a project page is added, and the failure mode is a 404 on someone
   else's link preview — exactly the kind of thing nobody notices.

   img/og/ is added wholesale regardless: generate-theme points og:image at the
   *active* palette's card, so the other palettes' cards are unreferenced right
   now but become the referenced one the moment `active:` changes in
   data/palettes.yaml. Dropping them would turn a palette switch into a broken
   social card. */
function copyReferencedImages() {
  return {
    name: 'copy-referenced-images',
    apply: 'build',
    closeBundle() {
      const srcRoot = resolve(__dirname, 'img');
      const outRoot = resolve(__dirname, 'dist', 'img');
      const distRoot = resolve(__dirname, 'dist');
      if (!existsSync(srcRoot)) return;

      const wanted = new Set();

      /* Every palette's social card — see the note above. */
      const ogDir = resolve(srcRoot, 'og');
      if (existsSync(ogDir)) {
        for (const f of readdirSync(ogDir)) wanted.add(`og/${f}`);
      }

      /* Anything the shipped HTML names with an absolute or root-relative
         /img/ URL. Those are the references Vite leaves alone. */
      const htmlFiles = [];
      const collectHtml = (dir) => {
        for (const ent of readdirSync(dir, { withFileTypes: true })) {
          const p = resolve(dir, ent.name);
          if (ent.isDirectory()) collectHtml(p);
          else if (ent.name.endsWith('.html')) htmlFiles.push(p);
        }
      };
      collectHtml(distRoot);
      for (const file of htmlFiles) {
        const html = readFileSync(file, 'utf8');
        for (const m of html.matchAll(/["'(](?:https?:\/\/[^"'()]*?)?\/img\/([^"'()\s]+)/g)) {
          wanted.add(m[1]);
        }
      }

      let copied = 0;
      for (const rel of wanted) {
        const from = resolve(srcRoot, rel);
        if (!existsSync(from)) continue;
        const dest = resolve(outRoot, rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(from, dest);
        copied += 1;
      }
      this.info?.(`copied ${copied} referenced image(s) to dist/img/`);
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
  plugins: [copyDocsPdfs(), copyDataJson(), copyReferencedImages()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /* The Three.js runtime is one ~520 KB (130 KB gzip) chunk by design — it is
       lazy-loaded behind the first user interaction and the globe canvas, so it
       never sits on the initial critical path. Raise the warning ceiling above
       it so a routine build stays quiet. */
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        projects: resolve(__dirname, 'projects.html'),
        publications: resolve(__dirname, 'publications.html'),
        travel: resolve(__dirname, 'travel.html'),
        links: resolve(__dirname, 'links.html'),
        now: resolve(__dirname, 'now.html'),
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
