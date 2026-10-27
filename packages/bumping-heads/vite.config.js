import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // npm hoists other versions of React and three to the root, where some of the
  // R3F dependencies find them; one copy of each for everything.
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  // Relative URLs, so the build works wherever the site serves it (/sketches/bumping-heads/).
  base: './',
  // A fixed address for the dev server, rather than a new port on every restart.
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
