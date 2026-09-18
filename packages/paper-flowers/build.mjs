import { cp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../../scripts/lib.mjs';
const directory = fileURLToPath(new URL('.', import.meta.url));
const source = new URL('./src/', import.meta.url);
const output = new URL('./dist/', import.meta.url);
const require = createRequire(import.meta.url);
async function build() {
  await cp(source, output, { recursive: true });
  await cp(require.resolve("paper/dist/paper-full.js"), new URL("paper.js", output));
  await cp(require.resolve("simplex-noise"), new URL("simplex-noise.js", output));
}
await rm(output, { recursive: true, force: true });
await build();
if (process.argv.includes('--dev')) {
  const server = await serve(directory + 'dist');
  console.log(`Paper Flowers: ${server.url}`);
  let queue = Promise.resolve();
  const watcher = watch(source, { recursive: true }, () => {
    queue = queue.then(build).catch(console.error);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    watcher.close(); await queue; await server.close(); process.exit();
  });
}
