import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

const projectsDir = resolve(__dirname, 'projects');
const projectPages = Object.fromEntries(
  readdirSync(projectsDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [`projects/${f.replace(/\.html$/, '')}`, resolve(projectsDir, f)]),
);

export default defineConfig({
  base: '/',
  appType: 'mpa',
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
