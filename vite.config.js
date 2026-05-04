import { defineConfig } from 'vite';
import { resolve } from 'node:path';
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

export default defineConfig({
  base: '/',
  appType: 'mpa',
  plugins: [copyDocsPdfs()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        projects: resolve(__dirname, 'projects.html'),
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
