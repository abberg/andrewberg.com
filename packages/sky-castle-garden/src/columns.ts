import * as THREE from 'three';
import { painted, palette } from './look';
import { textures } from './masonry';

// Step 7: the columns, as in the garden painting: a shaft built of stacked
// drums of sandstone, set on a round moulded base, with a ring at the neck
// and, on the tall standing columns, a flared cup for a capital, open at the
// top. The colonnade's columns have a plainer flared capital under the square
// block that carries the lintels. The fallen column and the loose drums are
// lengths of the same shaft.

const drums = textures.drums.map();
export const columnStone = painted(palette.column, { map: drums });
// The same stone laid on from three sides, for blocks with no UVs to speak of.
export const blockStone = painted(palette.column, { map: drums }, textures.drums.metres);

// A profile ([radius, y] points, bottom first) turned round the y axis, with
// the texture laid on by distance round and up it, in metres, wrapping a
// whole number of times round the widest part.
function lathe(profile: number[][], segments = 40) {
  const { metres } = textures.drums;
  const widest = Math.max(...profile.map(([r]) => r));
  const turns = Math.max(1, Math.round(Math.PI * 2 * widest / metres));
  const up = [0];
  for (let j = 1; j < profile.length; j++) up.push(up[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    profile.forEach(([r, y], j) => {
      positions.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uvs.push(i / segments * turns, up[j] / metres);
    });
  }
  const rows = profile.length;
  for (let i = 0; i < segments; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = a + rows;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A quarter or half round moulding, as points from one angle to another
// about a centre.
const arc = (r: number, y: number, radius: number, from: number, to: number, steps = 6) =>
  Array.from({ length: steps + 1 }, (_, k) => { const a = from + (to - from) * k / steps; return [r + Math.cos(a) * radius, y + Math.sin(a) * radius]; });

// A column of a radius and height, standing centred on the origin. The
// mouldings scale with the radius.
export function columnGeometry(radius: number, height: number, capital: 'cup' | 'flat') {
  const k = radius / 0.7, bottom = -height / 2, top = height / 2;
  const base = [
    [0, bottom], [1.02 * k, bottom], [1.02 * k, bottom + 0.2 * k],
    // A fat round, a hollow, and a thin round, up to the shaft.
    ...arc(0.86 * k, bottom + 0.36 * k, 0.16 * k, -Math.PI / 2, Math.PI / 2),
    [0.8 * k, bottom + 0.54 * k],
    ...arc(0.78 * k, bottom + 0.6 * k, 0.07 * k, -Math.PI / 2, Math.PI / 2, 4),
  ];
  const shaftFoot = bottom + 0.7 * k, shaftTop = top - (capital === 'cup' ? 1.15 : 0.75) * k;
  // The shaft narrows a little as it rises, with a slight swell.
  const shaft = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return [radius * (1 - 0.12 * t * t + 0.025 * Math.sin(t * Math.PI)), shaftFoot + (shaftTop - shaftFoot) * t];
  });
  const neck = radius * 0.88;
  const ring = arc(neck + 0.02 * k, shaftTop + 0.09 * k, 0.07 * k, -Math.PI / 2, Math.PI / 2, 4);
  const head = capital === 'cup'
    // A short neck, then the cup flaring out in a hollow curve to a thick
    // lip, open at the top with a shallow bowl inside.
    ? [
      [neck * 0.96, shaftTop + 0.2 * k], [neck * 0.96, shaftTop + 0.35 * k],
      ...Array.from({ length: 7 }, (_, i) => {
        const t = (i + 1) / 7;
        return [neck * 0.96 + (1.08 * k - neck * 0.96) * t * t, shaftTop + 0.35 * k + 0.6 * k * t];
      }),
      ...arc(1.06 * k, top - 0.12 * k, 0.1 * k, -Math.PI / 4, Math.PI / 2, 4),
      [0.9 * k, top - 0.02 * k], [0.86 * k, top - 0.1 * k], [0.6 * k, top - 0.32 * k], [0, top - 0.4 * k],
    ]
    // A plain flare under the square block (a box of its own).
    : [
      [neck * 0.96, shaftTop + 0.2 * k],
      ...Array.from({ length: 5 }, (_, i) => {
        const t = (i + 1) / 5;
        return [neck * 0.96 + (1.1 * k - neck * 0.96) * Math.sin(t * Math.PI / 2), shaftTop + 0.2 * k + 0.55 * k * t];
      }),
      [0, top - 0.0],
    ];
  return lathe([...base, ...shaft, ...ring, ...head]);
}

// A plain length of shaft, centred on the origin along y.
export const drumGeometry = (radius: number, length: number) =>
  lathe([[0, -length / 2], [radius * 0.97, -length / 2], [radius, -length / 2 + 0.04], [radius, length / 2 - 0.04], [radius * 0.97, length / 2], [0, length / 2]], 32);
