require('esbuild').build({
  entryPoints: ['./src/main.js'],
  bundle: true,
  outdir: 'dist',
  plugins: [require('@yarnpkg/esbuild-plugin-pnp').pnpPlugin()],
});
