import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
const dev = process.argv.includes('--dev');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('index.html', 'dist/index.html');
const options = {
  entryPoints: ['src/main.js'], bundle: true, outfile: 'dist/assets/main.js',
  minify: !dev, sourcemap: dev, platform: 'browser', format: 'iife', logLevel: 'info',
};
if (dev) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', host: '127.0.0.1' });
  console.log(`Experiment: http://127.0.0.1:${port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await ctx.dispose(); process.exit(); });
} else await build(options);
