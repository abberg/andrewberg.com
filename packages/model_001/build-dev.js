require('esbuild').build({
  entryPoints: ['./src/main.js'],
  bundle: true,
  outdir: 'dist',
  minify: true,
  plugins: [require('@yarnpkg/esbuild-plugin-pnp').pnpPlugin()],
});
