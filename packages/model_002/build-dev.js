require('esbuild').build({
  entryPoints: ['./src/main.js'],
  bundle: true,
  outdir: 'dist',
  sourcemap: true,
  plugins: [require('@yarnpkg/esbuild-plugin-pnp').pnpPlugin()],
});
