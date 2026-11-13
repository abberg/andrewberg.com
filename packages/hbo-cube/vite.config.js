import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs, so the build works wherever the site serves it (/sketches/hbo-cube/).
  base: './',
  // A fixed address for the dev server, rather than a new port on every restart.
  server: { host: '127.0.0.1', port: 5206, strictPort: true },
  preview: { host: '127.0.0.1', port: 5207, strictPort: true },
  // Cursor images stay files rather than being inlined, so the preloads in the page fetch the same ones.
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', assetsInlineLimit: 0 },
});
