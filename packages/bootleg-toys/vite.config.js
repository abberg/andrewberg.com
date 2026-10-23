import { readdirSync, existsSync } from 'node:fs';
import { defineConfig } from 'vite';

// The models folder is full of ripped game assets: robots, but also effects,
// characters, backgrounds and banners. Robots are the folders named like
// A110_010_gundammk2 (a series code, a number, a name) holding a matching .fbx.
const robotFolder = /^[A-Z]\d{3}_\d{3}_(?!.*_eff)(.+)$/;

function robots() {
  const dir = new URL('./public/models/', import.meta.url);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => robotFolder.test(id) && existsSync(new URL(`${id}/${id}.fbx`, dir)))
    .sort()
    .map((id) => ({ id, name: id.match(robotFolder)[1] }));
}

// import robots from 'virtual:robots' gives the list, read when the server starts.
function robotList() {
  const resolved = '\0virtual:robots';
  return {
    name: 'robot-list',
    resolveId: (id) => (id === 'virtual:robots' ? resolved : null),
    load: (id) => (id === resolved ? `export default ${JSON.stringify(robots())};` : null),
  };
}

export default defineConfig({
  plugins: [robotList()],
  // Relative URLs, so the build works wherever the site serves it (/sketches/bootleg-toys/).
  base: './',
  // A fixed address for the dev server, rather than a new port on every restart.
  server: { host: '127.0.0.1', port: 5196, strictPort: true },
  preview: { host: '127.0.0.1', port: 5197, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
