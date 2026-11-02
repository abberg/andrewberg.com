import * as THREE from 'three';
import { bothSidesAlike, leafTexture, wander } from './growth';
import { EAST_LAWN, lawnSouth, MOATS_FROM, PATHS, POOLS, WEST_LAWN } from './level';
import { painted } from './look';

// Step 8: the garden's planting, built like the ivy (growth.ts): leaf cards
// whose normals point out from the middle of the plant, so the light shades
// each one as a soft round mass with a bright rim, the way the painting's
// shrubs read, and never picks out single leaves.

// Shrubs a little deeper and cooler than the lawn so they stand off it, with
// a dark core so you never see through them.
const SHRUB = [0x78ad4a, 0x3a6650] as const, CORE = [0x4f8442, 0x2c5246] as const;

// One shrub: a dome of leaf cards sitting on the ground, a metre across at
// scale 1 and a little less high, each card facing out with its own turn,
// normals out from a point below the middle.
function shrubGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const middle = new THREE.Vector3(0, 0.1, 0);
  for (let k = 0; k < 70; k++) {
    // A point over the dome, fewer low down.
    const a = random() * Math.PI * 2, up = Math.asin(random() ** 0.8);
    const out = new THREE.Vector3(Math.cos(up) * Math.cos(a), Math.sin(up), Math.cos(up) * Math.sin(a));
    const at = new THREE.Vector3(out.x * 0.5, 0.12 + out.y * 0.36, out.z * 0.5).multiplyScalar(0.9 + random() * 0.2);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), random() * Math.PI * 2));
    const size = 0.32 + random() * 0.14, base = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = new THREE.Vector3((u - 0.5) * size, (v - 0.5) * size, 0).applyQuaternion(turn).add(at);
      positions.push(...p.toArray());
      normals.push(...p.clone().sub(middle).normalize().toArray());
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// Is a shrub of a radius clear of the paths (by a little, so it can lean
// over their edges), the pools and their rims, and the stonework?
const STONEWORK: [number, number, number][] = [
  // The statue's plinth, the urns, the slabs and blocks, the loose drums and
  // the broken capital.
  [4.1, 8.3, 1.9], [-24.5, 12, 1.2], [-24, 21, 1.2], [-7.8, 10, 1.2], [24, 38, 1.2], [22, 42.5, 1.2],
  [-7, 3, 1.8], [5.5, 18, 1.8], [6, 24.5, 1.8], [-11, 42.5, 1.8], [5.8, 42.5, 1.8], [-26.5, 9.8, 1.8], [-36, 13, 1.8],
  [-30, 30, 1.8], [-36, 34, 1.8], [22, 9, 1.8], [33, 16, 1.8], [40, 9, 1.8], [-10, 22.5, 1.8], [9, 40, 1.8],
  [-25.5, 29.5, 1], [-21.5, 40.5, 1], [-7, 43, 1], [-24, 32.6, 1.4],
];
function clear(x: number, z: number, r: number) {
  if (x < WEST_LAWN + 0.3 || x > EAST_LAWN - 0.3 || z > lawnSouth(x) - 0.3 || z < MOATS_FROM - 4) return false;
  if (PATHS.some(([x0, x1, z0, z1]) => x > x0 - r + 0.3 && x < x1 + r - 0.3 && z > z0 - r + 0.3 && z < z1 + r - 0.3)) return false;
  if (POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 7.6 + r)) return false;
  // The colonnade round the east pool, the broken fence, the fallen column.
  if (Math.abs(Math.hypot(x - 15.3, z - 34.1) - 9.5) < r + 1 && z < 36) return false;
  if (x > 8 - r && x < 20.5 + r && z > 1.3 - r && z < 7 + r) return false;
  const along = new THREE.Vector2(16.2, 5.8).normalize(), from = new THREE.Vector2(-5.6, 39.1), d = new THREE.Vector2(x, z).sub(from);
  const t = THREE.MathUtils.clamp(d.dot(along), -19.5, 0);
  if (d.clone().sub(along.clone().multiplyScalar(t)).length() < r + 0.9) return false;
  return !STONEWORK.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr + r * 0.8);
}

export function createFoliage(scene: THREE.Scene) {
  let s = 4243;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const shrubs: THREE.Matrix4[] = [];
  // A shrub across a diameter, if there's room, a little squashed or
  // stretched and turned at random.
  const shrub = (x: number, z: number, across: number) => {
    const r = across / 2;
    if (!clear(x, z, r * 0.7)) return false;
    const squash = 0.8 + random() * 0.4;
    shrubs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
      new THREE.Vector3(across, across * squash, across * (0.85 + random() * 0.3))));
    return true;
  };
  // Heaped along a bank: big and small together, in runs with gaps, each
  // run a few shrubs leaning on each other, the biggest at the back.
  const bank = (points: (t: number) => [number, number, number, number], length: number, seed: number) => {
    const runs = wander(seed, 9);
    for (let d = 0; d < length; d += 0.7 + random() * 1.1) {
      if (runs(d) < -0.45) continue;
      const [x, z, inx, inz] = points(d / length), across = 1.8 + random() ** 1.3 * 2.8 + Math.max(0, runs(d)) * 1.5;
      // Set back from the edge by about its radius, and now and then a
      // smaller one in front.
      shrub(x + inx * across * 0.35, z + inz * across * 0.35, across);
      if (random() < 0.5) shrub(x + inx * (across * 0.9 + 0.5), z + inz * (across * 0.9 + 0.5), 0.9 + random() * 0.8);
    }
  };
  const south = (x: number): [number, number, number, number] => {
    const slope = 2 * x / 298, l = Math.hypot(1, slope);
    return [x, lawnSouth(x), slope / l, -1 / l];
  };
  // Along the moats: down both sides, and round the south one either side
  // of the landing.
  bank(t => [WEST_LAWN, MOATS_FROM + 1 + t * (lawnSouth(WEST_LAWN) - MOATS_FROM - 2), 1, 0], lawnSouth(WEST_LAWN) - MOATS_FROM, 1);
  bank(t => [EAST_LAWN, MOATS_FROM + 1 + t * (lawnSouth(EAST_LAWN) - MOATS_FROM - 2), -1, 0], lawnSouth(EAST_LAWN) - MOATS_FROM, 2);
  bank(t => south(WEST_LAWN + 1 + t * (-WEST_LAWN - 10)), -WEST_LAWN - 10, 3);
  bank(t => south(9 + t * (EAST_LAWN - 10)), EAST_LAWN - 10, 4);
  // Round the foot of each column, on the side away from the main path.
  for (const z of [14.6, 22.7, 31.2, 39.6]) {
    for (let k = 1 + Math.floor(random() * 3); k > 0; k--) {
      const a = Math.PI * (0.55 + random() * 0.9);
      shrub(-4.1 + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2, 1.1 + random() * 1.2);
    }
  }
  // A few clumps out in the lawns between the branch paths.
  for (const [cx, cz] of [[-30, 17], [-34, 44], [-12, 31], [30, 22], [26, 4], [36, 34], [-26, 2]]) {
    for (let k = 2 + Math.floor(random() * 3); k > 0; k--) {
      shrub(cx + (random() - 0.5) * 6, cz + (random() - 0.5) * 6, 1.2 + random() ** 1.5 * 2.4);
    }
  }

  const geometry = shrubGeometry(19), core = new THREE.SphereGeometry(0.42, 12, 8).scale(1, 0.75, 1).translate(0, 0.14, 0);
  const leaves = bothSidesAlike(painted(SHRUB, { map: leafTexture(29), alphaTest: 0.5, side: THREE.DoubleSide }));
  for (const [shape, material] of [[geometry, leaves], [core, painted(CORE)]] as const) {
    const mesh = new THREE.InstancedMesh(shape, material, shrubs.length);
    shrubs.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  return { shrubs: shrubs.length };
}
