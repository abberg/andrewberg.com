import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bothSidesAlike, wander } from './growth';
import { stroke } from './masonry';
import { EAST, EAST_LAWN, lawnSouth, MOATS_FROM, northEdge, PATHS, PLATFORM, PLATFORM_TOP, POOLS, WALL_GROUPS, WEST, WEST_LAWN } from './level';
import { painted, palette } from './look';
import { SWAY, type Sway, swaying } from './wind';

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
// Cypresses dark and blue-green, the vertical accent.
const CYPRESS = [0x55905c, 0x264a4c] as const, CYPRESS_CORE = [0x3a6a4a, 0x1e3c40] as const;

// A cluster of broad leaves on a clear ground, for the trees and big
// shrubs: a dozen round-ended leaves radiating from the middle and
// overlapping, so a card's outline is a ring of lobes and never a fringe of
// strokes. Near white, each leaf its own shade: the material gives the green.
function clusterTexture(seed: number) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Outer leaves first, the middle ones over them.
  const leaves = Array.from({ length: 22 }, (_, k) => {
    const r = k < 14 ? px * (0.17 + random() * 0.08) : px * (0.04 + random() * 0.1), a = k * 2.4 + random() * 0.6;
    return { x: px / 2 + Math.cos(a) * r, y: px / 2 + Math.sin(a) * r, a: a + (random() - 0.5) * 0.7, long: px * (0.13 + random() * 0.06) };
  });
  for (const { x, y, a, long } of leaves) {
    const wide = long * (0.5 + random() * 0.15), shade = 0.8 + random() * 0.2;
    const [ux, uy, vx, vy] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const tx = x + ux * long, ty = y + uy * long;
    g.fillStyle = `rgb(${255 * shade | 0},${255 * shade | 0},${242 * shade | 0})`;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + vx * wide * 0.7, y + vy * wide * 0.7, tx + vx * wide * 0.55 - ux * wide * 0.2, ty + vy * wide * 0.55 - uy * wide * 0.2, tx, ty);
    g.bezierCurveTo(tx - vx * wide * 0.55 - ux * wide * 0.2, ty - vy * wide * 0.55 - uy * wide * 0.2, x - vx * wide * 0.7, y - vy * wide * 0.7, x, y);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Leaf cards that always turn to face the eye: each card is one point, its
// centre, and its corners are pushed out across the view in the vertex
// shader, so a crown's edge is always the cards' lobed outlines and never
// cards seen edge on, which read as hair. Normals still point out from the
// middle of the plant, so it shades as one soft mass.
type Card = { at: THREE.Vector3, w: number, h: number, normal: THREE.Vector3, spin: number };
function cardGeometry(cards: Card[]) {
  const positions: number[] = [], normals: number[] = [], corners: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const { at, w, h, normal, spin } of cards) {
    const base = positions.length / 3, [c, s] = [Math.cos(spin), Math.sin(spin)];
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = (u - 0.5) * w, y = (v - 0.5) * h;
      positions.push(...at.toArray());
      normals.push(...normal.toArray());
      corners.push(x * c - y * s, x * s + y * c);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // The corners reach past the centres the bounds are made from.
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += Math.max(...cards.map(({ w, h }) => Math.hypot(w, h) / 2));
  return geometry;
}

// Spreads a card's corners across the view, at the instance's scale.
const facing = (shader: { vertexShader: string }) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 corner;')
    .replace('#include <project_vertex>', /* glsl */`vec4 mvPosition = vec4(transformed, 1.0);
      float grow = length(modelMatrix[0].xyz);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        grow *= length(instanceMatrix[0].xyz);
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      mvPosition.xy += corner * grow;
      gl_Position = projectionMatrix * mvPosition;`)
    // Every card takes its shadow at its centre, which the sun's view of the
    // cards also passes through: looked up from a little nearer the sun, a
    // plant isn't speckled by its own cards.
    .replace('#include <shadowmap_vertex>', /* glsl */`#include <shadowmap_vertex>
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        vDirectionalShadowCoord[0].z -= 0.003;
      #endif`);
};
// A painted leaf material for camera-facing cards, with a shadow pass that
// turns the cards to the sun the same way.
function leafCards(colours: readonly [number, number], map: THREE.Texture, sway: Sway) {
  const material = bothSidesAlike(painted(colours, { map, alphaTest: 0.5, side: THREE.DoubleSide }));
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    paint.call(material, shader, renderer);
    facing(shader);
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = facing;
  return { material: swaying(material, sway), depth: swaying(depth, sway) };
}
function instanced(geometry: THREE.BufferGeometry, leaves: ReturnType<typeof leafCards> | THREE.Material, placed: THREE.Matrix4[], scene: THREE.Scene) {
  const mesh = new THREE.InstancedMesh(geometry, 'depth' in leaves ? leaves.material : leaves, placed.length);
  if ('depth' in leaves) mesh.customDepthMaterial = leaves.depth;
  placed.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// One shrub: a dome of leaf cards sitting on the ground, a metre across at
// scale 1 and a little less high, normals out from a point below the middle.
function shrubGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const middle = new THREE.Vector3(0, 0.1, 0), cards: Card[] = [];
  for (let k = 0; k < 60; k++) {
    // A point over the dome, fewer low down.
    const a = random() * Math.PI * 2, up = Math.asin(random() ** 0.8);
    const out = new THREE.Vector3(Math.cos(up) * Math.cos(a), Math.sin(up), Math.cos(up) * Math.sin(a));
    const at = new THREE.Vector3(out.x * 0.42, 0.1 + out.y * 0.3, out.z * 0.42).multiplyScalar(0.9 + random() * 0.2);
    const size = 0.34 + random() * 0.14;
    cards.push({ at, w: size, h: size, normal: at.clone().sub(middle).normalize(), spin: random() * Math.PI * 2 });
  }
  return cardGeometry(cards);
}

// A cypress's outline, its radius at a height, both as shares of its
// height: fullest a quarter of the way up, drawn in to a point at the top
// and tucked in a little at the foot.
const cypressRadius = (h: number) => 0.13 * Math.min(1, 0.55 + h * 2.2) * (1 - h) ** 0.75;

// One cypress, a unit tall: leaf cards over its whole surface, normals out
// from its axis and a little up, so it shades as one soft flame of a shape.
function cypressGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cards: Card[] = [];
  for (let k = 0; k < 200; k++) {
    const h = random() ** 0.85 * 0.96, a = random() * Math.PI * 2, r = cypressRadius(h) * (0.8 + random() * 0.2);
    // Narrow upright cards, near enough upright on screen.
    const w = 0.06 + random() * 0.03;
    cards.push({ at: new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r), w, h: w * 1.4,
      normal: new THREE.Vector3(Math.cos(a) * 0.94, 0.35, Math.sin(a) * 0.94).normalize(), spin: (random() - 0.5) * 0.6 });
  }
  return cardGeometry(cards);
}

// A ball of leaf cards a metre across, centred on the origin, for tree
// crowns and hedges: cards all over it, normals out from the middle.
function ballGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cards: Card[] = [];
  for (let k = 0; k < 90; k++) {
    const out = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    const size = 0.3 + random() * 0.12;
    cards.push({ at: out.clone().multiplyScalar(0.36 + random() * 0.08), w: size, h: size, normal: out, spin: random() * Math.PI * 2 });
  }
  return cardGeometry(cards);
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

// A patch of the lawn's grass: many thin blades side by side across the
// card, all within a shade of the lawn, so tufts packed together run into
// one carpet the same colour as the ground.
function swardTexture(seed: number) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 30; k++) {
    const x = px * (0.06 + random() * 0.88), a = -Math.PI / 2 + (random() - 0.5) * 0.6, long = px * (0.45 + random() * 0.5);
    const shade = 0.9 + random() * 0.1, c = 255 * shade | 0;
    stroke(g, Math.floor(random() * 10), x, px, x + Math.cos(a) * long, px + Math.sin(a) * long, px * (0.035 + random() * 0.025), `rgba(${c},${c},${c},1)`);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A tuft: three upright cards crossing at its middle, a unit tall and wide,
// standing on the origin, its normals all straight up so it shades just as
// the lawn under it does.
function tuftGeometry(sward = false) {
  const cards = sward
    // The lawn's own grass: four cards leaning out from the middle, so from
    // above they cover the ground between them rather than showing as thin
    // crosses.
    ? [0, 1, 2, 3].map(k => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(-0.75).translate(0, 0, 0.08).rotateY(k * Math.PI / 2))
    : [0, 1, 2].map(k => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(k * Math.PI / 3));
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

  // Cypresses: loose rows along the branch paths, each tree its own height,
  // gaps here and there. Each has a solid trunk the robot can't walk
  // through, which the camera ignores.
  let cypresses: { matrix: THREE.Matrix4, x: number, z: number, r: number, trunk: RAPIER.Collider }[] = [];
  // Where the trees stand, so the hedges keep off them.
  const taken: [number, number, number][] = [];
  const cypress = (x: number, z: number, tall: number, placed = false) => {
    const across = tall * 0.13 * 2 / 0.9;
    if (!placed && !clear(x, z, across / 2)) return;
    const wide = 0.9 + random() * 0.25;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * wide, tall, tall * wide));
    if (placed) return;
    taken.push([x, z, across / 2]);
    cypresses.push({ matrix, x, z, r: across / 2,
      trunk: world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.3, 0.5).setTranslation(x, tall * 0.3 + 0.5, z).setCollisionGroups(WALL_GROUPS)) });
  };
  // Where the pair that once framed the arch stood: drawn and dropped, so
  // the rest of the planting comes out as it was.
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
    // No cypress growing up through its crown.
    cypresses = cypresses.filter(c => {
      if (Math.hypot(c.x - x, c.z - z) > tall * 0.9 + c.r) return true;
      world.removeCollider(c.trunk, false);
      taken.splice(taken.findIndex(([tx, tz]) => tx === c.x && tz === c.z), 1);
      return false;
    });
    world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.15, 0.4).setTranslation(x, tall * 0.15 + 0.4, z).setCollisionGroups(WALL_GROUPS));
  };
  // By the pools: on the west pool's far side, and the east pool's south
  // side, away from its colonnade.
  for (const [[px, pz], angles] of [[POOLS[0], [2.6, 3.9]], [POOLS[1], [0.6, 2.2]]] as const) {
    for (const a of angles) tree(px + Math.cos(a) * 9.6, pz + Math.sin(a) * 9.6, 7 + random() * 3);
  }
  // At the far ends of the branches.
  for (const [x, z] of [[-40.5, 10.2], [-37, 22.2], [-41, 41.2], [42.5, 7.6]]) tree(x, z, 6 + random() * 3.5);
  {
    const geometry = cypressGeometry(23), core = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => {
      const h = i / 11;
      return new THREE.Vector2(cypressRadius(h) * 0.75, h * 0.96);
    }), 10);
    const placed = cypresses.map(({ matrix }) => matrix);
    instanced(geometry, leafCards(CYPRESS, clusterTexture(41), SWAY.cypress), placed, scene);
    instanced(core, painted(CYPRESS_CORE), placed, scene);
  }
  {
    instanced(ballGeometry(31), leafCards(CROWN, clusterTexture(43), SWAY.crown), crowns, scene);
    instanced(new THREE.SphereGeometry(0.34, 12, 8), painted(CROWN_CORE), crowns, scene);
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
    instanced(ballGeometry(59), leafCards(SHRUB, clusterTexture(53), SWAY.crown), hedges, scene);
    instanced(new THREE.SphereGeometry(0.36, 12, 8), painted(CORE), hedges, scene);
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
  // And short grass all over every lawn, the strip north of the moats and
  // the top of the start tower too, a patch every 30 cm or so, running together into a carpet, taller
  // and shorter in drifts, clear of the paving, the pools and the stonework.
  const sward: THREE.Matrix4[] = [];
  const drifts = [wander(97, 7), wander(98, 9)], field = (x: number, z: number, y: number) => {
    const drift = (drifts[0](x * 0.8 + z * 0.6) + drifts[1](z * 0.8 - x * 0.6)) / 2;
    const tall = 0.2 + Math.max(0, drift) * 0.35 + random() * 0.1;
    sward.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * (1.6 + random() * 0.6), tall, tall * (1.6 + random() * 0.6))));
  };
  const along = new THREE.Vector2(16.2, 5.8).normalize(), fallen = new THREE.Vector2(-5.6, 39.1);
  for (let gx = WEST; gx < EAST; gx += 0.32) {
    for (let gz = northEdge(gx) - 0.5; gz < lawnSouth(gx) + 6; gz += 0.32) {
      const x = gx + (random() - 0.5) * 0.3, z = gz + (random() - 0.5) * 0.3;
      if (z < northEdge(x) + 0.2) continue;
      if (z > MOATS_FROM - 0.2 && (x < WEST_LAWN + 0.2 || x > EAST_LAWN - 0.2)) continue;
      if (z > lawnSouth(x) - 0.2 && !(Math.abs(x) < 4.4 && z < 50.2)) continue;
      if (PATHS.some(([x0, x1, z0, z1]) => x > x0 + 0.1 && x < x1 - 0.1 && z > z0 + 0.1 && z < z1 - 0.1)) continue;
      if (POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 7.5)) continue;
      if (STONEWORK.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr * 0.75)) continue;
      // The colonnade's columns, and the fallen column's drums.
      if (Math.abs(Math.hypot(x - 15.3, z - 34.1) - 9.5) < 0.8 && z < 36) continue;
      const d = new THREE.Vector2(x, z).sub(fallen), t = THREE.MathUtils.clamp(d.dot(along), -19.5, 0);
      if (d.sub(along.clone().multiplyScalar(t)).length() < 1) continue;
      field(x, z, 0);
    }
  }
  for (let gx = -PLATFORM.r; gx < PLATFORM.r; gx += 0.32) {
    for (let gz = PLATFORM.z - PLATFORM.r; gz < PLATFORM.z + PLATFORM.r; gz += 0.32) {
      const x = gx + (random() - 0.5) * 0.3, z = gz + (random() - 0.5) * 0.3;
      // Not in the notch the stair comes up through.
      if (Math.hypot(x, z - PLATFORM.z) < PLATFORM.r - 0.25 && !(Math.abs(x) < 2.7 && z > -27.5)) field(x, z, PLATFORM_TOP);
    }
  }
  {
    for (const [placed, material, shape] of [
      [sward, swaying(bothSidesAlike(painted(palette.lawn, { map: swardTexture(71), alphaTest: 0.5, side: THREE.DoubleSide })), SWAY.grass), tuftGeometry(true)],
      [tufts, swaying(bothSidesAlike(painted(palette.lawn, { map: tuftTexture(61, false), alphaTest: 0.5, side: THREE.DoubleSide })), SWAY.grass), tuftGeometry()],
      [blooms, swaying(bothSidesAlike(painted([0xffffff, 0x8a8cc0], { map: tuftTexture(67, true), alphaTest: 0.5, side: THREE.DoubleSide })), SWAY.grass), tuftGeometry()],
    ] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, placed.length);
      placed.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  instanced(shrubGeometry(19), leafCards(SHRUB, clusterTexture(29), SWAY.shrub), shrubs, scene);
  instanced(new THREE.SphereGeometry(0.36, 12, 8).scale(1, 0.75, 1).translate(0, 0.12, 0), painted(CORE), shrubs, scene);
  return { shrubs: shrubs.length, cypresses: cypresses.length, trees: crowns.length, tufts: tufts.length + blooms.length + sward.length };
}
