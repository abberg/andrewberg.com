// Copies the Batara from the ACE:R model browser into public/batara.glb,
// compressed, keeping only the four reaction clips the sketch plays on a
// click (the walk itself is the Mixamo mocap):
//
//   node packages/outlines/scripts/extract-model.mjs ".../public/player_units_glb"
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const source = process.argv[2];
if (!source) throw new Error('Pass the path of the player_units_glb folder');
const file = join(source, 'Mobile Suit Crossbone Gundam', 'Batara (Standard)', 'c05_100_00.glb');
const out = fileURLToPath(new URL('../public/batara.glb', import.meta.url));

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(file);
const clips = ['charanim/d000', 'charanim/d001', 'charanim/d002', 'charanim/d003'];
const animations = document.getRoot().listAnimations();
for (const clip of clips) if (!animations.some(a => a.getName() === clip)) throw new Error(`No ${clip} in ${file}`);
// Their samplers and channels too, or their keyframes linger and prune keeps them.
for (const animation of animations) {
  if (clips.includes(animation.getName())) continue;
  for (const channel of animation.listChannels()) channel.dispose();
  for (const sampler of animation.listSamplers()) sampler.dispose();
  animation.dispose();
}
await document.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp' }),
  meshopt({ encoder: MeshoptEncoder }),
);
await io.write(out, document);
console.log(`${clips.join(', ')} -> ${out}`);
