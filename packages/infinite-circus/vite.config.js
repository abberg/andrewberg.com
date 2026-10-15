import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative URLs, so the build works wherever the site serves it (/sketches/infinite-circus/).
  base: './',
  resolve: {
    // Some dependencies (three-stdlib, for one) are hoisted to the repo root, where they would pick up the
    // older three that other sketches use. Resolve three (and React) from this package so there is one copy.
    dedupe: ['three', 'react', 'react-dom'],
  },
  // A fixed address for the dev server, rather than a new port on every restart.
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  preview: { host: '127.0.0.1', port: 5191, strictPort: true },
  // Three, React and friends make one ~1.4 MB chunk (about 380 KB gzipped); that's expected for a sketch.
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
});
