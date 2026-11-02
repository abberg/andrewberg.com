import * as THREE from 'three';
import { painted, palette } from './look';
import { stroke } from './masonry';

// Step 9: the water, painted rather than real. A flat see-through wash of
// teal over the drowned city, broken by long horizontal brush strokes: darker
// ones drifting one way, pale glints the sky leaves drifting another. No
// reflections, no waves. The deeper the stonework below, the more it sinks
// into the water's colour (look.ts, drowned()), so the wash itself stays even.

// One tile of strokes, on white (the darker ones) or black (the glints),
// drawn again across each edge so it tiles.
function strokes(seed: number, background: string, colours: string[], count: number, width: [number, number]) {
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = background;
  g.fillRect(0, 0, size, size);
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < count; k++) {
    const x = random() * size, y = random() * size, length = 40 + random() ** 2 * 160, tilt = (random() - 0.5) * 0.12;
    const thick = width[0] + random() * (width[1] - width[0]), colour = colours[Math.floor(random() * colours.length)], mask = Math.floor(random() * 10);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      stroke(g, mask, x + dx, y + dy, x + dx + length * Math.cos(tilt), y + dy + length * Math.sin(tilt), thick, colour);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// How many metres one tile covers, and how fast each layer drifts (tiles a
// second).
const TILE = 14, DRIFT = [new THREE.Vector2(0.0035, 0.0012), new THREE.Vector2(-0.0022, 0.003)];
const layers: THREE.Texture[][] = [];

// The water's material. UVs in metres. Opacity is how much of the wash covers
// what's under it.
export function waterMaterial(opacity: number) {
  const ripples = strokes(71, '#ffffff', ['#c9dcdc', '#b8cfd6', '#d6e6e2'], 70, [5, 12]);
  const glints = strokes(73, '#000000', ['#ffffff', '#e8f6f4', '#cfeaf0'], 34, [2, 6]);
  for (const map of [ripples, glints]) map.repeat.setScalar(1 / TILE);
  layers.push([ripples, glints]);
  return painted(palette.water, {
    map: ripples, emissiveMap: glints, emissive: 0xd8eef0, emissiveIntensity: 0.32,
    transparent: true, opacity, depthWrite: false,
  });
}

export function updateWater(seconds: number) {
  for (const maps of layers) maps.forEach((map, i) => map.offset.copy(DRIFT[i]).multiplyScalar(seconds));
}
