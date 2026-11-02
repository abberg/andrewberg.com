import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bothSidesAlike, leafTexture, wander } from './growth';
import { stroke } from './masonry';
import { EAST_LAWN, lawnSouth, MOATS_FROM, PATHS, POOLS, WALL_GROUPS, WEST_LAWN } from './level';
import { painted, palette } from './look';

// Step 8: the garden's planting, built like the ivy (growth.ts): leaf cards
// whose normals point out from the middle of the plant, so the light shades
// each one as a soft round mass with a bright rim, the way the painting's
// shrubs read, and never picks out single leaves.

// Shrubs a little deeper and cooler than the lawn so they stand off it, with
// a dark core so you never see through them.
const SHRUB = [0x78ad4a, 0x3a6650] as const, CORE = [0x4f8442, 0x2c5246] as const;
// The small trees' crowns a fresher green than the shrubs, their bark warm
// grey-brown.
const CROWN = [0x8cc25a, 0x467458] as const, CROWN_CORE = [0x5e9446, 0x2f5848] as const, BARK = [0x8f7a5e, 0x5a5058] as const;
// The big canopy trees a little deeper than the small ones.
const CANOPY = [0x7eb552, 0x3c6a56] as const;
// Cypresses dark and blue-green, the vertical accent.
const CYPRESS = [0x55905c, 0x264a4c] as const, CYPRESS_CORE = [0x3a6a4a, 0x1e3c40] as const;

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

// A cypress's outline, its radius at a height, both as shares of its
// height: fullest a quarter of the way up, drawn in to a point at the top
// and tucked in a little at the foot.
const cypressRadius = (h: number) => 0.13 * Math.min(1, 0.55 + h * 2.2) * (1 - h) ** 0.75;

// One cypress, a unit tall: leaf cards over its whole surface facing out,
// normals out from its axis and a little up, so it shades as one soft
// flame of a shape.
function cypressGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let k = 0; k < 220; k++) {
    const h = random() ** 0.85 * 0.97, a = random() * Math.PI * 2, r = cypressRadius(h) * (0.85 + random() * 0.25);
    const out = new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize();
    const at = new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r);
    // Upright cards, leaning out, each turned its own way.
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (random() - 0.5) * 1.2));
    const w = 0.07 + random() * 0.04, tall = w * 1.5, base = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = new THREE.Vector3((u - 0.5) * w, (v - 0.5) * tall, 0).applyQuaternion(turn).add(at);
      positions.push(...p.toArray());
      normals.push(...new THREE.Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.94).setY(0.35).normalize().toArray());
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

// A ball of leaf cards a metre across, centred on the origin, for tree
// crowns: cards all over it facing out, normals out from the middle.
function ballGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let k = 0; k < 110; k++) {
    const out = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    const at = out.clone().multiplyScalar(0.44 + random() * 0.1);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), random() * Math.PI * 2));
    const size = 0.28 + random() * 0.12, base = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = new THREE.Vector3((u - 0.5) * size, (v - 0.5) * size, 0).applyQuaternion(turn).add(at);
      positions.push(...p.toArray());
      normals.push(...p.clone().normalize().toArray());
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

// A tuft of grass painted on a clear ground, a few broad blades fanning up
// from the foot in strokes, paler towards their tips: near white, the
// material gives the lawn's green. With flowers, the blades are painted in
// green and the tips carry dots of white, pink and yellow.
function tuftTexture(seed: number, flowers: boolean) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tips: number[][] = [];
  for (let k = 0; k < 11; k++) {
    const x = px / 2 + (random() - 0.5) * px * 0.3, a = -Math.PI / 2 + (random() - 0.5) * 1.1, long = px * (0.45 + random() * 0.45);
    const tx = x + Math.cos(a) * long, ty = px + Math.sin(a) * long, shade = 0.78 + random() * 0.22;
    const colour = flowers ? `rgba(${120 * shade | 0},${178 * shade | 0},${78 * shade | 0},1)` : `rgba(${255 * shade | 0},${255 * shade | 0},${255 * shade | 0},1)`;
    stroke(g, Math.floor(random() * 10), x, px, tx, ty, px * (0.07 + random() * 0.04), colour);
    tips.push([tx, ty]);
  }
  if (flowers) for (const [x, y] of tips.slice(0, 6)) {
    g.fillStyle = ['#fffaf0', '#f4b8cc', '#f6dc6a'][Math.floor(random() * 3)];
    g.beginPath();
    g.arc(x, y + 6, 7 + random() * 4, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A tuft: three upright cards crossing at its middle, a unit tall and wide,
// standing on the origin, its normals all straight up so it shades just as
// the lawn under it does.
function tuftGeometry() {
  const cards = [0, 1, 2].map(k => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(k * Math.PI / 3));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const card of cards) {
    const nonIndexed = card.toNonIndexed();
    positions.push(...nonIndexed.getAttribute('position').array);
    uvs.push(...nonIndexed.getAttribute('uv').array);
    for (let k = 0; k < nonIndexed.getAttribute('position').count; k++) normals.push(0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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

export function createFoliage(world: RAPIER.World, scene: THREE.Scene) {
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

  // Cypresses: a pair framing the approach to the arch, and loose rows along
  // the branch paths, each tree its own height, gaps here and there. Each
  // has a solid trunk the robot can't walk through, which the camera ignores.
  const cypresses: THREE.Matrix4[] = [];
  // Where the trees stand, so the hedges keep off them.
  const taken: [number, number, number][] = [];
  const cypress = (x: number, z: number, tall: number, placed = false) => {
    const across = tall * 0.13 * 2 / 0.9;
    if (!placed && !clear(x, z, across / 2)) return;
    const wide = 0.9 + random() * 0.25;
    cypresses.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * wide, tall, tall * wide)));
    taken.push([x, z, across / 2]);
    world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.3, 0.5).setTranslation(x, tall * 0.3 + 0.5, z).setCollisionGroups(WALL_GROUPS));
  };
  cypress(-4.3, 42.8, 10.5, true);
  cypress(4.3, 42.8, 10, true);
  // Along one side or the other of each branch, about every 5 m.
  for (const [x0, x1, z0, z1] of PATHS.slice(1, 5)) {
    const side = random() < 0.5 ? z0 - 1.9 : z1 + 1.9;
    for (let x = Math.min(x0, x1) + 3 + random() * 2; x < Math.max(x0, x1) - 3; x += 4.5 + random() * 2) {
      if (random() < 0.25) continue;
      cypress(x, side + (random() - 0.5) * 0.4, 5 + random() ** 1.3 * 7);
    }
  }
  {
    const geometry = cypressGeometry(23), core = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => {
      const h = i / 11;
      return new THREE.Vector2(cypressRadius(h) * 0.8, h * 0.97);
    }), 10);
    const leaves = bothSidesAlike(painted(CYPRESS, { map: leafTexture(41), alphaTest: 0.5, side: THREE.DoubleSide }));
    for (const [shape, material] of [[geometry, leaves], [core, painted(CYPRESS_CORE)]] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, cypresses.length);
      cypresses.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  // Small trees beside the pools and at the ends of the branch paths, each
  // the focal point of its garden room: a trunk forking into three or four
  // boughs, each ending in a ball of leaves, more over the top and between,
  // running together into one lumpy crown.
  const trunks: THREE.BufferGeometry[] = [], crowns: THREE.Matrix4[] = [];
  const tree = (x: number, z: number, tall: number) => {
    if (!clear(x, z, 1)) return;
    const lean = new THREE.Vector3((random() - 0.5) * 0.12, 1, (random() - 0.5) * 0.12).normalize();
    const fork = new THREE.Vector3(x, 0, z).addScaledVector(lean, tall * (0.3 + random() * 0.1));
    trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, -0.2, z), new THREE.Vector3(x, 0, z).addScaledVector(lean, tall * 0.15), fork]), 8, tall * 0.028, 7));
    const ball = (at: THREE.Vector3, across: number) => crowns.push(new THREE.Matrix4().compose(at,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)), new THREE.Vector3(across, across * 0.8, across)));
    const boughs = 3 + Math.floor(random() * 2), a0 = random() * Math.PI * 2, tips: THREE.Vector3[] = [];
    for (let b = 0; b < boughs; b++) {
      const a = a0 + b * Math.PI * 2 / boughs + (random() - 0.5) * 0.8, reach = tall * (0.16 + random() * 0.1);
      const tip = fork.clone().add(new THREE.Vector3(Math.cos(a) * reach, tall * (0.25 + random() * 0.2), Math.sin(a) * reach));
      const bend = fork.clone().lerp(tip, 0.5).add(new THREE.Vector3(Math.cos(a) * reach * 0.2, -tall * 0.03, Math.sin(a) * reach * 0.2));
      trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([fork, bend, tip]), 6, tall * 0.016, 6));
      tips.push(tip);
      ball(tip, tall * (0.42 + random() * 0.12));
    }
    // Over the top, and filling in between the boughs, so the balls run
    // together into one crown with lumps in it.
    const top = fork.clone().add(new THREE.Vector3(0, tall * 0.6, 0));
    ball(top, tall * 0.48);
    tips.forEach((tip, k) => ball(tip.clone().lerp(tips[(k + 1) % tips.length], 0.5).lerp(top, 0.3), tall * (0.34 + random() * 0.1)));
    taken.push([x, z, 1]);
    world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.15, 0.4).setTranslation(x, tall * 0.15 + 0.4, z).setCollisionGroups(WALL_GROUPS));
  };
  // By the pools: on the west pool's far side, and the east pool's south
  // side, away from its colonnade.
  for (const [[px, pz], angles] of [[POOLS[0], [2.6, 3.9]], [POOLS[1], [0.6, 2.2]]] as const) {
    for (const a of angles) tree(px + Math.cos(a) * 9.6, pz + Math.sin(a) * 9.6, 7 + random() * 3);
  }
  // At the far ends of the branches.
  for (const [x, z] of [[-40.5, 10.2], [-37, 22.2], [-41, 41.2], [42.5, 7.6]]) tree(x, z, 6 + random() * 3.5);
  // The big canopy trees, 20 to 30 m, in the garden's corners and one by the
  // north edge leaning out over the drop: a thick trunk forking into five or
  // six long boughs that rise and spread, each forking again, the crown a
  // broad, flattish roof of big leaf balls throwing wide shade.
  const canopies: THREE.Matrix4[] = [];
  const canopy = (x: number, z: number, tall: number, spread: number, lean = new THREE.Vector3(0, 1, 0)) => {
    const up = lean.clone().normalize(), base = new THREE.Vector3(x, 0, z);
    const fork = base.clone().addScaledVector(up, tall * 0.34);
    trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base.clone().setY(-0.3), base.clone().addScaledVector(up, tall * 0.15)
      .add(new THREE.Vector3(random() - 0.5, 0, random() - 0.5)), fork]), 10, tall * 0.035, 9));
    const ball = (at: THREE.Vector3, across: number) => canopies.push(new THREE.Matrix4().compose(at,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)), new THREE.Vector3(across, across * 0.7, across)));
    const top = fork.clone().addScaledVector(up, tall * 0.5), tips: THREE.Vector3[] = [];
    const boughs = 5 + Math.floor(random() * 2), a0 = random() * Math.PI * 2;
    for (let b = 0; b < boughs; b++) {
      const a = a0 + b * Math.PI * 2 / boughs + (random() - 0.5) * 0.6, out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const reach = spread * (0.28 + random() * 0.14), rise = tall * (0.32 + random() * 0.18);
      const tip = fork.clone().addScaledVector(out, reach).addScaledVector(up, rise);
      const bend = fork.clone().addScaledVector(out, reach * 0.55).addScaledVector(up, rise * 0.4);
      trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([fork, bend, tip]), 8, tall * 0.015, 7));
      // Forking again near the end, into two, each under a ball of leaves.
      for (const turn of [-0.5, 0.5]) {
        const twig = tip.clone().add(new THREE.Vector3(Math.cos(a + turn), 0, Math.sin(a + turn)).multiplyScalar(spread * 0.1)).addScaledVector(up, tall * 0.05);
        trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([bend, tip, twig]), 6, tall * 0.008, 5));
        tips.push(twig);
        ball(twig, spread * (0.3 + random() * 0.08));
      }
    }
    // Over the top and filling between the boughs into one broad roof.
    ball(top, spread * 0.4);
    tips.forEach((tip, k) => {
      ball(tip.clone().lerp(top, 0.45).addScaledVector(up, tall * 0.04), spread * (0.3 + random() * 0.06));
      ball(tip.clone().lerp(tips[(k + 1) % tips.length], 0.5).addScaledVector(up, -tall * 0.04), spread * (0.24 + random() * 0.06));
      // A lower one under each, hiding where the bough meets the crown.
      if (k % 2) ball(tip.clone().lerp(fork, 0.3).addScaledVector(up, tall * 0.02), spread * (0.2 + random() * 0.05));
    });
    world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.15, 0.8).setTranslation(x, tall * 0.15 + 0.8, z).setCollisionGroups(WALL_GROUPS));
  };
  canopy(-38.5, 46, 24, 20);
  canopy(39.5, 47.5, 27, 22);
  canopy(36.5, 3.2, 22, 17);
  // Leaning out over the north edge.
  canopy(-23.5, 4.2, 21, 17, new THREE.Vector3(0.05, 1, -0.3));
  {
    const leaves = bothSidesAlike(painted(CANOPY, { map: leafTexture(47), alphaTest: 0.5, side: THREE.DoubleSide }));
    for (const [shape, material] of [[ballGeometry(37), leaves], [new THREE.SphereGeometry(0.4, 12, 8), painted(CROWN_CORE)]] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, canopies.length);
      canopies.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
  {
    const crown = ballGeometry(31), core = new THREE.SphereGeometry(0.4, 12, 8);
    const leaves = bothSidesAlike(painted(CROWN, { map: leafTexture(43), alphaTest: 0.5, side: THREE.DoubleSide }));
    for (const [shape, material] of [[crown, leaves], [core, painted(CROWN_CORE)]] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, crowns.length);
      crowns.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
    const wood = new THREE.Mesh(mergeGeometries(trunks.map(g => { g.deleteAttribute('uv'); return g; }))!, painted(BARK));
    wood.castShadow = wood.receiveShadow = true;
    scene.add(wood);
  }

  // Hedge fragments, the old edging along the paths: rows of boxy, flat-
  // topped masses of leaves, broken where something's in the way and gappy
  // anyway, each unbroken run with a box the robot can't walk through.
  const hedges: THREE.Matrix4[] = [];
  const hedge = (x0: number, z0: number, x1: number, z1: number, tall: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0), gaps = wander(Math.floor(x0 * 7 + z0 * 13), 3);
    let run: THREE.Vector3[] = [];
    const close = () => {
      if (run.length > 1) {
        const [a, b] = [run[0], run[run.length - 1]], middle = a.clone().lerp(b, 0.5);
        world.createCollider(RAPIER.ColliderDesc.cuboid(a.distanceTo(b) / 2 + 0.6, tall / 2, 0.7).setTranslation(middle.x, tall / 2, middle.z)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)).setCollisionGroups(WALL_GROUPS));
      }
      run = [];
    };
    for (let d = 0; d < length; d += 0.9 + random() * 0.4) {
      const x = x0 + (x1 - x0) * d / length, z = z0 + (z1 - z0) * d / length;
      if (gaps(d) < -0.35 || !clear(x, z, 0.8) || taken.some(([tx, tz, r]) => Math.hypot(x - tx, z - tz) < r + 0.9)) { close(); continue; }
      const height = tall * (0.75 + random() * 0.3) * (gaps(d) < -0.1 ? 0.6 : 1);
      hedges.push(new THREE.Matrix4().compose(new THREE.Vector3(x, height * 0.42, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (random() - 0.5) * 0.3), new THREE.Vector3(1.9, height, 1.6)));
      run.push(new THREE.Vector3(x, 0, z));
    }
    close();
  };
  hedge(4.1, 16, 4.1, 23, 2);
  hedge(4.1, 26, 4.1, 31, 1.8);
  hedge(-40, 9.3, -29, 9.3, 2.2);
  hedge(-37, 23, -27, 23, 1.7);
  hedge(19, 15.8, 31, 15.8, 2);
  hedge(8, 9.3, 17, 9.3, 1.6);
  hedge(-35, 40.3, -27, 40.3, 2.4);
  {
    const leaves = bothSidesAlike(painted(SHRUB, { map: leafTexture(53), alphaTest: 0.5, side: THREE.DoubleSide }));
    for (const [shape, material] of [[ballGeometry(59), leaves], [new THREE.SphereGeometry(0.42, 12, 8), painted(CORE)]] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, hedges.length);
      hedges.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  // Grass: tufts creeping over the edges of every path and into the paving
  // near them, in patches, and tall grass and wildflowers where paths meet
  // the lawn and round the ruins.
  const tufts: THREE.Matrix4[] = [], blooms: THREE.Matrix4[] = [];
  const tuft = (x: number, z: number, tall: number, flowering = false) => {
    if (!flowering && random() < 0.08) flowering = true;
    (flowering ? blooms : tufts).push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * (0.8 + random() * 0.6), tall, tall * (0.8 + random() * 0.6))));
  };
  PATHS.forEach(([x0, x1, z0, z1], p) => {
    const patches = wander(p * 31 + 7, 4);
    // Along each side: a line of the path's edge, which way is out of it.
    const sides: [number, number, number, number, number][] = [[x0, z0, x0, z1, -1], [x1, z0, x1, z1, 1], [x0, z0, x1, z0, -1], [x0, z1, x1, z1, 1]];
    for (const [ax, az, bx, bz, out] of sides) {
      const length = Math.hypot(bx - ax, bz - az), across = ax === bx;
      for (let d = random() * 0.4; d < length; d += 0.18 + random() * 0.3) {
        const thick = patches(d + (across ? ax : az));
        if (thick < -0.3) continue;
        // Mostly on the lawn side, some reaching into the paving.
        const off = out * (random() < 0.3 ? -random() * 0.6 : random() * 0.7), x = ax + (bx - ax) * d / length, z = az + (bz - az) * d / length;
        const [tx, tz] = across ? [x + off, z] : [x, z + off];
        if (PATHS.some(([px0, px1, pz0, pz1]) => tx > px0 + 0.8 && tx < px1 - 0.8 && tz > pz0 + 0.8 && tz < pz1 - 0.8)) continue;
        if (POOLS.some(([px, pz]) => Math.hypot(tx - px, tz - pz) < 7.6)) continue;
        tuft(tx, tz, 0.35 + random() * 0.4 + Math.max(0, thick) * 0.3);
      }
    }
  });
  // Tall grass and flowers in patches: round the broken fence, the fallen
  // column and the column feet, and where the branches leave the main path.
  for (const [cx, cz, r] of [[11, 4.5, 4], [17, 1, 3], [-12, 35, 4], [-18, 37.5, 3], [-4, 40, 2.5], [-6, 15, 2], [-6, 23, 2],
    [-3.5, 8.5, 2.5], [-3.5, 29, 2.5], [-3.5, 39.5, 2], [3.5, 15.5, 2.5], [3.5, 37, 2.5], [-22, 32, 3]]) {
    for (let k = Math.round(r * r * 7); k > 0; k--) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (PATHS.some(([px0, px1, pz0, pz1]) => x > px0 + 0.3 && x < px1 - 0.3 && z > pz0 + 0.3 && z < pz1 - 0.3)) continue;
      tuft(x, z, 0.6 + random() * 0.6 * (1 - d / r), random() < 0.3);
    }
  }
  {
    const shape = tuftGeometry();
    for (const [placed, material] of [
      [tufts, bothSidesAlike(painted(palette.lawn, { map: tuftTexture(61, false), alphaTest: 0.5, side: THREE.DoubleSide }))],
      [blooms, bothSidesAlike(painted([0xffffff, 0x8a8cc0], { map: tuftTexture(67, true), alphaTest: 0.5, side: THREE.DoubleSide }))],
    ] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, placed.length);
      placed.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.receiveShadow = true;
      scene.add(mesh);
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
  return { shrubs: shrubs.length, cypresses: cypresses.length, trees: crowns.length, tufts: tufts.length + blooms.length };
}
