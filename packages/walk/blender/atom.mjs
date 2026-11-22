// Cuts the spray-painted atom out of reference/atomic.png for the sketch's
// particles, as public/atom.png: the shape of the red paint, soft overspray
// and all, in white for the sketch to tint, and everything else (the white
// wall, its cracks, the black scrawl) transparent. Paint is told from wall by
// how red a pixel is.
//
//   node packages/walk/blender/atom.mjs
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const { data, info } = await sharp(join(here, 'reference', 'atomic.png'))
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const out = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  const [r, g, b] = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  const redness = (r - (g + b) / 2) / 255;
  // White throughout, the paint only in the alpha, so the sketch can tint it.
  out.set([255, 255, 255, Math.round(Math.min(Math.max((redness - 0.04) * 1.9, 0), 1) * 255)], i * 4);
}
// A square, with a margin, so the sprite turns about its middle.
const side = Math.max(width, height) + 16;
const square = await sharp(out, { raw: { width, height, channels: 4 } })
  .extend({
    top: Math.floor((side - height) / 2), bottom: Math.ceil((side - height) / 2),
    left: Math.floor((side - width) / 2), right: Math.ceil((side - width) / 2),
    background: { r: 255, g: 255, b: 255, alpha: 0 },
  })
  .png().toBuffer();
await sharp(square).resize(512, 512).png().toFile(join(here, '..', 'public', 'atom.png'));
console.log('cut public/atom.png');
