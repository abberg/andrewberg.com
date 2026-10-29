// Copies the Behemoth from the ACE:R model browser into public/behemoth.glb,
// keeping only the walk cycle and the four clips of its swipe attack, and
// compressing what's left, and bakes the small
// details of its texture (rivets, bolt holes, seams, the face) into
// public/behemoth-detail.png for the sketch to ink in:
//
//   node packages/active-strokes/scripts/extract-model.mjs ".../public/player_units_glb"
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const source = process.argv[2];
if (!source) throw new Error('Pass the path of the player_units_glb folder');
const file = join(source, 'Full Metal Panic!', 'Behemoth (Standard)', 'c25_100_00.glb');
const out = fileURLToPath(new URL('../public/behemoth.glb', import.meta.url));
const detailOut = fileURLToPath(new URL('../public/behemoth-detail.png', import.meta.url));
// The walk on the spot, then the swipe, whose four clips play in sequence.
const clips = ['charanim/l011', 'attackanim/x014_000', 'attackanim/x014_010', 'attackanim/x014_020', 'attackanim/x014_021'];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(file);
const animations = document.getRoot().listAnimations();
for (const clip of clips) if (!animations.some(a => a.getName() === clip)) throw new Error(`No ${clip} in ${file}`);
for (const animation of animations) if (!clips.includes(animation.getName())) animation.dispose();

// Details are the texture's small dark marks: pixels darker than their
// surroundings (a 5 px blur) by 10 or more out of 255, fully at 28. Only where
// the surroundings are reasonably bright: in the near-black parts everything
// is ambiguous. Broad colour changes and baked shadow fall away. Stored as ink
// amount, 0 for none.
const base = document.getRoot().listMaterials()[0].getBaseColorTexture().getImage();
const { data, info } = await sharp(Buffer.from(base)).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
const raw = { raw: { width: info.width, height: info.height, channels: 1 } };
// extractChannel: blur hands back three channels otherwise.
const blur = await sharp(data, raw).blur(5).extractChannel(0).raw().toBuffer();
const detail = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i++) {
  const lit = Math.max(0, Math.min(1, (blur[i] - 30) / 20));
  detail[i] = Math.round(255 * lit * Math.max(0, Math.min(1, (blur[i] - data[i] - 10) / 18)));
}
await sharp(detail, raw).toColourspace('b-w').png({ compressionLevel: 9 }).toFile(detailOut);

await document.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp' }),
  meshopt({ encoder: MeshoptEncoder }),
);
await io.write(out, document);
console.log(`${clips.join(', ')} -> ${out}, details -> ${detailOut}`);
