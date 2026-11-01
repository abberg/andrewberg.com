import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs, so the build works wherever the site serves it (/sketches/outlines/).
  base: './',
  // A fixed address for the dev server, rather than a new port on every restart.
  server: { host: '127.0.0.1', port: 5202, strictPort: true },
  preview: { host: '127.0.0.1', port: 5203, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
