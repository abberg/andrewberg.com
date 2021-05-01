const esbuild = require('esbuild');
const esbuildPluginPnp = require('@yarnpkg/esbuild-plugin-pnp');
const pnpPlugin = esbuildPluginPnp.pnpPlugin();

esbuild.build({
  entryPoints: ['./src/main.js'],
  bundle: true,
  minify: true,
  outdir: 'dist',
  logLevel: 'info',
  plugins: [pnpPlugin],
});
