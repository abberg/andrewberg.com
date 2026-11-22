// Packs the model Blender exports (build/walker.glb, written by character.py)
// into the one the sketch loads, public/walker.glb, at about a fifth the size.
//
//   node packages/walk/blender/optimize.mjs
//
// The saving is in how the numbers are stored, not in the model: normals,
// texture coordinates and skin weights go from floats to small integers,
// the painted texture becomes WebP, and the lot is compressed with meshopt.
// Positions are left as they are, in metres: the sketch's outline and
// hatching are worked out from them in the shaders, in those units.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(join(here, 'build', 'walker.glb'));
await document.transform(
  // The second UV set carries the crease weights the outline reads: no material
  // uses it, so prune would drop it unless told to keep attributes.
  prune({ keepAttributes: true }),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90 }),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ pattern: /^(NORMAL|TEXCOORD|WEIGHTS)(_\d+)?$/ }),
);
document.createExtension(EXTMeshoptCompression).setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(join(here, '..', 'public', 'walker.glb'), document);
console.log('packed public/walker.glb');
