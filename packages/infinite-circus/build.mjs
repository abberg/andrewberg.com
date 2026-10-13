import { build as bundle } from 'esbuild';
import { cp, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/lib.mjs';
const directory = fileURLToPath(new URL('.', import.meta.url));
const source = new URL('./src/', import.meta.url);
const output = new URL('./dist/', import.meta.url);
const dev = process.argv.includes('--dev');
// Some dependencies (three-stdlib, for one) are hoisted to the repo root, where they would pick up the
// older three that other sketches use. Resolve every three import from this package so there is one copy.
const singleThree = {
  name: 'single-three',
  setup(build) {
    build.onResolve({ filter: /^three(\/.*)?$/ }, args => {
      if (args.pluginData?.singleThree) return undefined;
      return build.resolve(args.path, { kind: args.kind, resolveDir: directory, pluginData: { singleThree: true } });
    });
  },
};
async function build() {
  await cp(source, output, { recursive: true, filter: file => !file.endsWith('.jsx') });
  await bundle({
    entryPoints: [fileURLToPath(new URL('main.jsx', source))],
    outfile: fileURLToPath(new URL('script.js', output)),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    jsx: 'automatic',
    minify: !dev,
    sourcemap: dev,
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    plugins: [singleThree],
  });
}
await rm(output, { recursive: true, force: true });
await build();
if (dev) {
  const server = await serve(directory + 'dist');
  console.log(`Infinite Circus: ${server.url}`);
  let queue = Promise.resolve();
  const watcher = watch(source, { recursive: true }, () => {
    queue = queue.then(build).catch(console.error);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    watcher.close(); await queue; await server.close(); process.exit();
  });
}
