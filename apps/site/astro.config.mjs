import { defineConfig } from 'astro/config';

// The dev server doesn't resolve index.html inside public/ folders, so map
// /experiments/<id>/ to its index.html the way the static host does.
const experimentIndex = {
  name: 'experiment-index',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      req.url = req.url.replace(/^(\/experiments\/[^/?]+\/)(\?.*)?$/, '$1index.html$2');
      next();
    });
  }
};

export default defineConfig({ output: 'static', vite: { plugins: [experimentIndex] } });
