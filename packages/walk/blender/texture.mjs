// Paints the figure's texture, texture/paint.png: white, with the black line
// work and bands of the white edition. character.py lays the parts out on it
// (see `unwrap` there) and builds it into walker.glb.
//
//   node packages/walk/blender/texture.mjs
//
// The texture is a sheet of cells, each a flat view of one part from the
// front, in metres. The line work on the torso and the head is lifted
// straight off the front photo (reference/white-front.webp): everything dark
// in it is paint, since the figure and the backdrop are both white. The bands
// round the sleeves and legs are drawn in, as they go all the way round.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 2048;
const UP = 8; // the photo is small: enlarge it before cutting pieces out

// Where each part's cell sits on the sheet (in pixels, from the top left), and
// the stretch of the figure it shows: x across, z up, in metres. These match
// CELLS in character.py.
const cells = {
  torso: { left: 0, top: 0, width: 1024, height: 1024, x: [-0.25, 0.29], z: [0.57, 1.38] },
  head: { left: 0, top: 1024, width: 1024, height: 717, x: [-0.58, 0.55], z: [1.2, 1.82] },
  legs: { left: 0, top: 1741, width: 512, height: 307, x: [-0.3, 0.3], z: [0, 0.82] },
  sleeves: { left: 512, top: 1741, width: 512, height: 307, x: [-0.42, 0.42], z: [0.6, 1.3] },
};

// The same parts in the photo, in its pixels: the box round each, and the box
// in metres that it is on the model. The photo is a front view, so the
// figure's left is on the right.
const photo = {
  torso: { box: [140, 165, 287, 372], x: [-0.21, 0.25], z: [0.59, 1.36] },
  head: { box: [32, 14, 348, 190], x: [-0.548, 0.515], z: [1.222, 1.8] },
};
// Paint in each photo box that belongs to something else, whited out before
// the piece is cut: the sleeves and waist band beside the torso and the face
// hanging in front of it, and under the head everything but the face.
const blank = {
  torso: [
    'M0 195H139V400H0Z', 'M272 195H403V345H272Z', 'M181 150H216V187H181Z',
    'M127 360L160 362L190 372L250 351L300 345V400H127Z',
  ],
  head: ['M0 160H181V200H0Z', 'M216 160H403V200H216Z', 'M181 187H216V200H181Z'],
};

const source = join(here, 'reference', 'white-front.webp');
const { width, height } = await sharp(source).metadata();

async function lifted(part) {
  const cell = cells[part], { box, x, z } = photo[part];
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + blank[part].map(d => `<path d="${d}" fill="white"/>`).join('') + '</svg>';
  const cleaned = await sharp(source).composite([{ input: Buffer.from(cover) }]).png().toBuffer();
  // The photo's pixels per metre, and so the patch of it the cell covers.
  const across = (box[2] - box[0]) / (x[1] - x[0]), down = (box[3] - box[1]) / (z[1] - z[0]);
  const left = box[0] - (x[0] - cell.x[0]) * across, right = box[2] + (cell.x[1] - x[1]) * across;
  const top = box[1] - (cell.z[1] - z[1]) * down, bottom = box[3] + (z[0] - cell.z[0]) * down;
  const enlarged = await sharp(cleaned).greyscale()
    .resize(width * UP, height * UP, { kernel: 'lanczos3' }).png().toBuffer();
  return sharp(enlarged)
    .extract({
      left: Math.round(left * UP), top: Math.round(top * UP),
      width: Math.round((right - left) * UP), height: Math.round((bottom - top) * UP),
    })
    .resize(cell.width, cell.height, { fit: 'fill' })
    .blur(2)
    // Paint is darker than 90 or so, the figure's own shading lighter than 150:
    // everything between is the soft edge of a line.
    .linear(4.25, -382)
    .png().toBuffer();
}

// Drawn parts: a path in metres within a cell.
function drawn(part, shapes) {
  const cell = cells[part];
  const px = (x, z) => [
    ((x - cell.x[0]) / (cell.x[1] - cell.x[0]) * cell.width).toFixed(1),
    ((cell.z[1] - z) / (cell.z[1] - cell.z[0]) * cell.height).toFixed(1),
  ].join(' ');
  const scale = cell.height / (cell.z[1] - cell.z[0]);
  const paths = shapes.map(({ points, thick }) =>
    `<path d="M${points.map(p => px(...p)).join('L')}" stroke="black" stroke-width="${(thick * scale).toFixed(1)}" `
    + 'fill="none" stroke-linejoin="round"/>').join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell.width}" height="${cell.height}">`
    + `<rect width="100%" height="100%" fill="white"/>${paths}</svg>`);
}

const legs = drawn('legs', [
  // The waist band, round the hips right under the coat's hem, with a slight
  // dip to the figure's right. It sits above where the legs' surface starts
  // to follow the legs (0.5 to 0.66 m), so walking barely stretches it.
  { points: [[-0.3, 0.645], [-0.19, 0.64], [-0.1, 0.62], [0.2, 0.645], [0.3, 0.645]], thick: 0.05 },
  // A band round each shin, the left one wider.
  { points: [[-0.3, 0.3], [0, 0.3]], thick: 0.065 },
  { points: [[0, 0.305], [0.3, 0.305]], thick: 0.09 },
]);
const sleeves = drawn('sleeves', [
  // A band round the middle of each sleeve.
  { points: [[-0.42, 0.975], [-0.15, 0.975]], thick: 0.05 },
  { points: [[0.15, 0.975], [0.42, 0.975]], thick: 0.06 },
  // And a thin slanting line above each cuff, high on the outside.
  { points: [[-0.39, 0.81], [-0.26, 0.73]], thick: 0.008 },
  { points: [[0.39, 0.81], [0.26, 0.73]], thick: 0.008 },
]);

await mkdir(join(here, 'texture'), { recursive: true });
await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: 'white' } })
  .composite([
    { input: await lifted('torso'), left: cells.torso.left, top: cells.torso.top },
    { input: await lifted('head'), left: cells.head.left, top: cells.head.top },
    { input: legs, left: cells.legs.left, top: cells.legs.top },
    { input: sleeves, left: cells.sleeves.left, top: cells.sleeves.top },
  ])
  .png().toFile(join(here, 'texture', 'paint.png'));
console.log('painted texture/paint.png');
