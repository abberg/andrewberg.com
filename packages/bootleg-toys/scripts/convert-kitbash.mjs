// Converts the kitbash robots in public/models (local only) into small GLBs
// in public/kitbash, which are committed, so the published belt has them:
// just each robot's body mesh and skeleton, no textures, compressed with
// meshopt. Run it after adding or excluding robots:
//
//   node packages/bootleg-toys/scripts/convert-kitbash.mjs
//
// The FBX is loaded in a browser, through the same patched FBXLoader the
// sketch's dev server serves, and exported there (see convert.js); the GLB is
// then cleaned up and compressed with glTF Transform. It also lists robots
// that come out the same shape, to keep robots.js's duplicates up to date.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { fbxRobots } from '../robots.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = new URL('../public/kitbash/', import.meta.url);
const robots = fbxRobots().filter((robot) => robot.humanoid);
if (!robots.length) throw new Error('No robots in public/models to convert');

const server = await createServer({ root, configFile: `${root}/vite.config.js`, server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${server.resolvedUrls.local[0]}?thumbnail=1`);

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync(out, { recursive: true });
const written = new Set();
const shapes = new Map();
const failed = [];

for (const { id, name } of robots) {
  try {
    const { glb, fingerprint } = await page.evaluate(async (id) => (await import('/scripts/convert.js')).convert(id), id);
    const doc = await io.readBinary(Buffer.from(glb, 'base64'));
    doc.setLogger(new Logger(Logger.Verbosity.WARN));
    // three names a bone that isn't the joints' common root as the skeleton,
    // which glTF doesn't allow; the field's optional, so drop it.
    for (const skin of doc.getRoot().listSkins()) skin.setSkeleton(null);
    await doc.transform(prune(), dedup(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
    await io.write(fileURLToPath(new URL(`${id}.glb`, out)), doc);
    written.add(`${id}.glb`);
    shapes.set(fingerprint, [...(shapes.get(fingerprint) ?? []), name]);
  } catch (error) {
    failed.push(`${id}: ${error.message}`);
  }
}

// Robots no longer converted (excluded since) go.
for (const file of readdirSync(out)) if (!written.has(file)) rmSync(new URL(file, out));

await browser.close();
await server.close();
console.log(`Converted ${written.size} robots into public/kitbash.`);
const same = [...shapes.values()].filter((names) => names.length > 1);
if (same.length) console.log(`Same shape, so add all but the first to duplicates in robots.js:\n${same.map((names) => `  ${names.join(', ')}`).join('\n')}`);
if (failed.length) console.log(`Failed:\n  ${failed.join('\n  ')}`);
