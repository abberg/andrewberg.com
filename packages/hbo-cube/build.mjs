import { cp, mkdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/lib.mjs';
const directory = fileURLToPath(new URL('.', import.meta.url));
const source = new URL('./src/', import.meta.url);
const output = new URL('./dist/', import.meta.url);
const three = createRequire(import.meta.url).resolve('three/build/three.min.js');
async function build() {
  await cp(source, output, { recursive: true });
  await mkdir(new URL('./assets/', output), { recursive: true });
  await cp(three, new URL('./assets/three.min.js', output));
}
await rm(output, { recursive: true, force: true });
await build();
if (process.argv.includes('--dev')) {
  const server = await serve(directory + 'dist');
  console.log(`Story Cube: ${server.url}`);
  let queue = Promise.resolve();
  const watcher = watch(source, { recursive: true }, () => {
    queue = queue.then(build).catch(console.error);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    watcher.close(); await queue; await server.close(); process.exit();
  });
}
