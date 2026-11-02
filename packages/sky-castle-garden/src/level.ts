import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ARCH, buildCity, cityFront } from './city';
import { drowned, painted, palette } from './look';
import { textures } from './masonry';
import { buildFlooded } from './flooded';
import { waterMaterial } from './water';

// Step 2 of the plan: every asset as a grey primitive at its final size,
// placed from the zone plan (docs/zone-plan.png). The snapshot's scale bar
// reads 9.3 px to the metre; positions here are in metres, measured from where
// the main path meets the garden's north edge. x east, z south (towards the
// arch), y up.

// The garden's edges, as curves across x.
// The north lip bows out over the drop: a circle about 250 m across.
export const northEdge = (x: number) => 250.7 - Math.sqrt(250.7 ** 2 - x * x);
// The lawn's south edge, where the south moat starts, following the curve of
// the city's base (city.ts).
export const lawnSouth = (x: number) => 44.7 + x * x / 298;
// The moats down the sides, from z 6 to the south moat.
export const WEST = -52, WEST_LAWN = -44.9, EAST_LAWN = 46.3, EAST = 53.3, MOATS_FROM = 6.1;

// Collision groups, as Rapier packs them: the groups a collider is in, in the
// top 16 bits, and the groups it meets, in the bottom 16. Invisible walls are
// in a group of their own, which the camera's sweep leaves out, so they stop
// the robot and the stonework but never pull the camera in.
const WALLS = 0x0002;
export const WALL_GROUPS = (WALLS << 16) | 0xffff;
export const CAMERA_GROUPS = (0x0001 << 16) | (0xffff & ~WALLS);

// Paths, as x and z extents: the main axis, three branches west and one
// east, and stubs to the pools.
export const PATHS = [[-2.5, 2.5, 0, 50.4], [-44.1, -2.5, 4.4, 7.7], [-40.7, -2.5, 24.6, 28], [-44.7, -2.5, 35.4, 38.7],
  [2.5, 46.2, 10.9, 14.2], [-17.85, -14.35, 22.5, 24.6], [2.5, 8.5, 32.35, 35.85]];
// The pools' middles; their rims are 7.4 m across the outside.
export const POOLS = [[-16.1, 15.8], [15.3, 34.1]];

// Beyond the garden's sides the castle's base runs on out under the outer
// towers, a ledge of lawn sweeping forward beside the garden to its north
// corners. Its front edge carries on from the north lip in the same
// direction and turns gently at first, more and more, then less and less
// until it heads straight back at OUTER, so there's no kink or sudden bend
// anywhere along it. As points along it, and where it is across x.
export const OUTER = 106;
export const ledgeEdge = (side: number, n = 48) => {
  const edge = side > 0 ? EAST : WEST, from = Math.atan(Math.abs(edge) / Math.sqrt(250.7 ** 2 - edge * edge));
  const heading = (u: number) => from + (Math.PI / 2 - from) * u * u * (3 - 2 * u);
  // Long enough to reach OUTER.
  const steps = 400;
  let across = 0;
  for (let i = 0; i < steps; i++) across += Math.cos(heading((i + 0.5) / steps)) / steps;
  const length = (OUTER - Math.abs(edge)) / across, points = [[edge, northEdge(edge)]];
  for (let i = 0; i < steps; i++) {
    const [x, z] = points[i], a = heading((i + 0.5) / steps);
    points.push([x + side * Math.cos(a) * length / steps, z + Math.sin(a) * length / steps]);
  }
  return points.filter((_, i) => i % Math.round(steps / n) === 0 || i === steps);
};
const LEDGES = [ledgeEdge(-1, 400), ledgeEdge(1, 400)];
export const ledgeFront = (x: number) => {
  const line = LEDGES[x > 0 ? 1 : 0], k = line.findIndex(([px]) => Math.abs(px) >= Math.abs(x));
  if (k <= 0) return line[k < 0 ? line.length - 1 : 0][1];
  const [ax, az] = line[k - 1], [bx, bz] = line[k];
  return az + (bz - az) * (x - ax) / (bx - ax);
};

// The moats are a flooded part of the city: open down to the old streets,
// FLOOD metres under the water. Each moat as an outline: the west one down
// the west side and round the south to the stair, the east one the same.
// Their far side runs a little in under the towers, which go on down.
export const FLOOD = 14;
export const moat = (side: number) => {
  const lawn = side > 0 ? EAST_LAWN : WEST_LAWN, edge = side > 0 ? EAST : WEST, landing = side > 0 ? 4.6 : -4.5;
  return [
    [lawn, MOATS_FROM], [edge, MOATS_FROM],
    ...sample(x => cityFront(x) + 2, edge, side * ARCH.half, 32),
    [side * ARCH.half, 50.4], [landing, 50.4],
    ...sample(lawnSouth, landing, lawn, 32),
  ];
};

export const SPAWN = { x: 0, z: -37, yaw: Math.PI };
export const PLATFORM_TOP = 3.2;
// The start platform's middle and radius.
export const PLATFORM = { z: -34.9, r: 11.1 };

export const stone = painted(palette.stone);
const sandstoneMap = textures.sandstone.map();
const sandstone = painted(palette.sandstone, { map: sandstoneMap }, textures.sandstone.metres);
const steps = painted(palette.sandstone, { map: textures.steps.map() }, textures.steps.metres);
const masonry = painted(palette.masonry, { map: sandstoneMap }, textures.sandstone.metres), lawn = painted(palette.lawn);
const pavingMap = textures.paving.map();
const path = painted(palette.path, { map: pavingMap }, textures.paving.metres), door = painted(palette.door);
// The same stone with the texture laid on by UVs, for the pool rims.
const coping = painted(palette.path, { map: pavingMap });
const water = waterMaterial(palette.canal, 0.55), poolWater = waterMaterial(palette.water, 0.92);
// The moats' walls and the streets at their foot.
const drownedMasonry = drowned(painted(palette.masonry, { map: sandstoneMap }, textures.sandstone.metres));

// A curve sampled across x, as [x, z] points.
const sample = (curve: (x: number) => number, from: number, to: number, steps = 32) =>
  Array.from({ length: steps + 1 }, (_, i) => { const x = from + (to - from) * i / steps; return [x, curve(x)]; });

// The base's outside wall, its blocks laid along the wall by UVs so they run
// on round the curves without the seam the three-sided mapping leaves where
// the wall turns from facing one way to another.
const outside = painted(palette.masonry, { map: textures.sandstone.map() });
// A slab's sides given UVs along and up the wall, in blocks, and normals
// smoothed round its curves (not round its sharp corners).
function walled(geometry: THREE.BufferGeometry, outline?: number[][]) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  const key = (k: number) => `${p.getX(k).toFixed(2)},${p.getZ(k).toFixed(2)}`;
  // The holes' walls come after the outline's: they go to a third material.
  if (outline) {
    const on = (k: number) => outline.some(([x, z]) => Math.abs(x - p.getX(k)) < 0.01 && Math.abs(z - p.getZ(k)) < 0.01);
    const [caps, all] = geometry.groups;
    let split = all.start;
    while (split < all.start + all.count && [0, 1, 2].every(j => on(split + j))) split += 3;
    geometry.clearGroups();
    geometry.addGroup(caps.start, caps.count, 0);
    geometry.addGroup(all.start, split - all.start, 1);
    geometry.addGroup(split, all.start + all.count - split, 2);
  }
  const sides = geometry.groups[1];
  // Each corner of the outline once, in order round it.
  const corners: string[] = [], at = new Map<string, THREE.Vector2>();
  for (let k = sides.start; k < sides.start + sides.count; k++) if (!at.has(key(k))) { at.set(key(k), new THREE.Vector2(p.getX(k), p.getZ(k))); corners.push(key(k)); }
  const along = new Map<string, number>(), smooth = new Map<string, THREE.Vector3>();
  let total = 0;
  corners.forEach((c, i) => {
    if (i) total += at.get(c)!.distanceTo(at.get(corners[i - 1])!);
    along.set(c, total);
    const prev = at.get(corners[(i - 1 + corners.length) % corners.length])!, next = at.get(corners[(i + 1) % corners.length])!;
    smooth.set(c, new THREE.Vector3(next.y - prev.y, 0, prev.x - next.x).normalize());
  });
  total += at.get(corners[0])!.distanceTo(at.get(corners[corners.length - 1])!);
  const metres = textures.sandstone.metres, face = new THREE.Vector3(), s = new THREE.Vector3();
  for (let k = sides.start; k < sides.start + sides.count; k += 3) {
    const u = [0, 1, 2].map(j => along.get(key(k + j))!);
    // The quad that closes the outline runs from the end back to the start.
    if (Math.max(...u) - Math.min(...u) > total / 2) u.forEach((v, j) => { if (v < total / 2) u[j] = v + total; });
    face.fromBufferAttribute(n, k);
    for (let j = 0; j < 3; j++) {
      uv.setXY(k + j, u[j] / metres, p.getY(k + j) / metres);
      s.copy(smooth.get(key(k + j))!);
      if (s.dot(face) < 0) s.negate();
      if (s.dot(face) > Math.cos(0.5)) n.setXYZ(k + j, s.x, s.y, s.z);
    }
  }
  return geometry;
}

// A flat outline on the ground (x, z), extruded from y = bottom up to y = top.
function slab(points: number[][], bottom: number, top: number, holes: number[][][] = []) {
  const toShape = (outline: number[][], shape: THREE.Path) => {
    outline.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    return shape;
  };
  const shape = toShape(points, new THREE.Shape()) as THREE.Shape;
  shape.holes = holes.map(hole => toShape(hole, new THREE.Path()));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, curveSegments: 48 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom, 0);
  return geometry;
}
// A round rim from an inner to an outer radius, its edges a little rounded,
// with the texture laid round it and across it, so the paving's courses run
// round the rim as curved coping stones.
function rimGeometry(inner: number, outer: number, height: number) {
  const { metres } = textures.paving, e = 0.06;
  const profile = [[inner, 0], [inner, height - e], [inner + e * 0.3, height - e * 0.3], [inner + e, height],
    [outer - e, height], [outer - e * 0.3, height - e * 0.3], [outer, height - e], [outer, 0]];
  const across = [0];
  for (let j = 1; j < profile.length; j++) across.push(across[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const segments = 96, turns = Math.round(Math.PI * (inner + outer) / metres);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    profile.forEach(([r, y], j) => {
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uvs.push(i / segments * turns, across[j] / metres);
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

const circle = (cx: number, cz: number, r: number, steps = 48) =>
  Array.from({ length: steps }, (_, i) => { const a = i / steps * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });

export function buildLevel(world: RAPIER.World, scene: THREE.Scene) {
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material, { cast = true } = {}) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  // Solid, as the mesh's own triangles. For the ground and other big fixed
  // shapes; the stonework gets primitives.
  const ground = (geometry: THREE.BufferGeometry, mat: THREE.Material) => {
    add(geometry, mat, { cast: false });
    const vertices = geometry.getAttribute('position').array as Float32Array;
    const indices = geometry.index ? geometry.index.array : Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i);
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)));
  };
  // A fixed box by its centre, size and turn about y.
  const box = (x: number, y: number, z: number, width: number, height: number, depth: number, mat = stone, yaw = 0, solid = true) => {
    const mesh = add(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    if (!solid) return mesh;
    const q = mesh.quaternion;
    world.createCollider(RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    return mesh;
  };
  // An upright cylinder standing on y = base.
  const column = (x: number, base: number, z: number, radius: number, height: number, mat = stone) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, height, 32), mat);
    mesh.position.set(x, base + height / 2, z);
    world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(x, base + height / 2, z));
    return mesh;
  };
  // Paving laid on the lawn, by its x and z extents: just a surface.
  // A step: a box in the stair texture, slid along by its own amount so the
  // joints don't line up from one step to the next.
  let shift = 3;
  const step = (x: number, y: number, z: number, width: number, height: number, depth: number, solid = true) => {
    const mesh = box(x, y, z, width, height, depth, steps, 0, solid);
    shift = (shift * 7.31 + 2.17) % 12;
    mesh.geometry.translate(shift, 0, 0);
    mesh.position.x -= shift;
    return mesh;
  };
  const paving = (x0: number, x1: number, z0: number, z1: number) =>
    box((x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, path, 0, false).castShadow = false;

  // The terrace: a stone base that the moats are cut into, and the lawn on top.
  const north = sample(northEdge, WEST, EAST, 64);
  // Out under the castle either side and back under all of it, rounded off
  // behind.
  const outer = (side: number) => {
    const front = ledgeEdge(side);
    const back = [[OUTER, cityFront(OUTER) + 6], [104, 135], [80, 178], [40, 198]].map(([x, z]) => [side * x, z]);
    return side > 0 ? [...front, ...back] : [...back.reverse(), ...front.reverse()];
  };
  {
    const outline = [...north, ...outer(1), ...outer(-1)];
    const base = walled(slab(outline, -40, -0.3, [moat(-1), moat(1)]), outline);
    ground(base, [masonry, outside, drownedMasonry] as unknown as THREE.Material);
    for (const side of [-1, 1]) ground(slab(moat(side), -40, -FLOOD), drownedMasonry);
  }
  // The ledges' lawn, from the front edge back under the towers' feet.
  for (const side of [-1, 1]) {
    const front = ledgeEdge(side);
    const back = sample(x => cityFront(x) + 6, side * OUTER, side > 0 ? EAST : WEST, 24);
    ground(slab([...front, ...back], -0.3, 0), lawn);
  }
  const lawnOutline = [
    ...north,
    [EAST, MOATS_FROM], [EAST_LAWN, MOATS_FROM],
    ...sample(lawnSouth, EAST_LAWN, 4.6, 24),
    // The grass landing that pushes into the south moat.
    [4.6, 50.4], [-4.5, 50.4],
    ...sample(lawnSouth, -4.5, WEST_LAWN, 24),
    [WEST_LAWN, MOATS_FROM], [WEST, MOATS_FROM],
  ];
  ground(slab(lawnOutline, -0.3, 0), lawn);
  // One sheet of water under it all, showing in the moats.
  const sheet = new THREE.ShapeGeometry(new THREE.Shape([...north, [EAST, 120], [WEST, 120]].map(([x, z]) => new THREE.Vector2(x, -z))));
  sheet.rotateX(-Math.PI / 2);
  add(sheet, water, { cast: false }).position.y = -0.1;

  // The start platform, the round top of a freestanding tower, with a notch
  // in its south side for the stair down to the causeway.
  const notchMeets = PLATFORM.z + Math.sqrt(PLATFORM.r ** 2 - 2.5 ** 2);
  const from = Math.atan2(notchMeets - PLATFORM.z, 2.5), to = Math.PI - from;
  const rim = Array.from({ length: 65 }, (_, i) => {
    const a = to + (from + Math.PI * 2 - to) * i / 64;
    return [Math.cos(a) * PLATFORM.r, PLATFORM.z + Math.sin(a) * PLATFORM.r];
  });
  // Grass on top of the tower's stone.
  const outline = [...rim, [2.5, -27.3], [-2.5, -27.3]];
  ground(slab(outline, -60, PLATFORM_TOP - 0.3), sandstone);
  ground(slab(outline, PLATFORM_TOP - 0.3, PLATFORM_TOP), lawn);
  // The causeway, 5 m wide, from inside the notch to the garden's lip.
  box(0, -12.5, -13.65, 5, 25, 27.3, sandstone);
  paving(-2.5, 2.5, -27.3, 0);
  // Eight 0.4 m steps down off the platform onto it.
  for (let i = 0; i < 7; i++) {
    const top = PLATFORM_TOP - 0.4 * (i + 1), z0 = -27.3 + 7.1 / 8 * i;
    step(0, top / 2, z0 + 7.1 / 16, 5, top, 7.1 / 8);
  }

  // Paths: the main axis, three branches west and one east, and stubs to the pools.
  for (const [x0, x1, z0, z1] of PATHS) paving(x0, x1, z0, z1);

  // The pools: a low rim of the path's stone round each, laid as curved
  // coping stones, water inside.
  for (const [x, z] of POOLS) {
    add(rimGeometry(5.4, 7.4, 0.4).translate(x, 0, z), coping);
    const solid = slab(circle(x, z, 7.4), 0, 0.4, [circle(x, z, 5.4).reverse()]);
    world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(solid.getAttribute('position').array),
      new Uint32Array(solid.index ? solid.index.array : Array.from({ length: solid.getAttribute('position').count }, (_, i) => i))));
    const surface = new THREE.CircleGeometry(5.4, 48), uvs = surface.getAttribute('uv');
    for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * 10.8, uvs.getY(k) * 10.8);
    const pool = add(surface, poolWater, { cast: false });
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.05, z);
  }

  // The freestanding stonework (columns, statue, ruin, colonnade, urns,
  // slabs) moves, so it's built in stones.ts.

  // The city's base behind the south moat, the bastion and the arch.
  buildCity(world, scene);
  buildFlooded(scene, { west: WEST, westLawn: WEST_LAWN, east: EAST, eastLawn: EAST_LAWN, from: MOATS_FROM, lawnSouth, flood: FLOOD });

  // The arch: a stair of twelve 0.3 m steps up from the grass to its floor,
  // the sealed door at the back and a frame round the opening. 0.4 m risers
  // on treads this short climb at over 40°, too steep for the robot. The
  // steps are for show: it walks up a hidden ramp laid over their noses.
  const run = 0.475, landing = ARCH.stair + run * 12;
  for (let i = 0; i < 12; i++) {
    const top = 0.3 * (i + 1);
    step(0, (top - 0.3) / 2, ARCH.stair + run * (i + 0.5), ARCH.half * 2, top + 0.3, run, false);
  }
  {
    const length = Math.hypot(run * 12, ARCH.floor), slope = Math.atan2(ARCH.floor, run * 12);
    const middle = new THREE.Vector3(0, ARCH.floor / 2, ARCH.stair + run * 6);
    middle.y -= Math.cos(slope) * 0.2;
    middle.z += Math.sin(slope) * 0.2;
    world.createCollider(RAPIER.ColliderDesc.cuboid(ARCH.half, 0.2, length / 2).setTranslation(middle.x, middle.y, middle.z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(-slope, 0, 0))));
  }
  box(0, (ARCH.floor - 0.3) / 2, (landing + ARCH.back) / 2, ARCH.half * 2, ARCH.floor + 0.3, ARCH.back - landing, sandstone);
  box(0, ARCH.floor + ARCH.height / 2, ARCH.back + 0.5, ARCH.half * 2 + 0.6, ARCH.height, 1, door);

  // Step 3: the boundaries, as invisible walls 20 m tall. They follow the
  // water's edge round the moats, the stair across the south moat and the
  // pools, stand 1 m back from the north lip, and run along the causeway and
  // round the platform's edge. Shown, for checking, from the tuning panel.
  const walls = new THREE.Group();
  walls.visible = false;
  scene.add(walls);
  const seen = new THREE.MeshBasicMaterial({ color: 0xff3c28, transparent: true, opacity: 0.25, depthWrite: false });
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length + 0.4, 20, 0.4), seen);
    mesh.position.set((x0 + x1) / 2, 9, (z0 + z1) / 2);
    mesh.rotation.y = yaw;
    walls.add(mesh);
    const q = mesh.quaternion;
    world.createCollider(RAPIER.ColliderDesc.cuboid(length / 2 + 0.2, 10, 0.2).setTranslation(mesh.position.x, 9, mesh.position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setCollisionGroups(WALL_GROUPS));
  };
  const along = (points: number[][]) => points.slice(1).forEach(([x, z], i) => wall(points[i][0], points[i][1], x, z));

  // The north lip, 1 m in, with a gap for the causeway, and down the outside
  // of the narrow strips of lawn north of the side moats.
  const lip = (x: number) => northEdge(x) + 1;
  along([[WEST + 1, MOATS_FROM], ...sample(lip, WEST + 1, -2.5, 24)]);
  along([...sample(lip, 2.5, EAST - 1, 24), [EAST - 1, MOATS_FROM]]);
  // The side moats, and where they start.
  along([[WEST + 1, MOATS_FROM], [WEST_LAWN, MOATS_FROM], [WEST_LAWN, lawnSouth(WEST_LAWN)]]);
  along([[EAST - 1, MOATS_FROM], [EAST_LAWN, MOATS_FROM], [EAST_LAWN, lawnSouth(EAST_LAWN)]]);
  // The south moat, round the landing and up both sides of the stair.
  along([...sample(lawnSouth, WEST_LAWN, -4.5, 24), [-4.5, 50.4], [-ARCH.half, 50.4], [-ARCH.half, ARCH.front + 1]]);
  along([[ARCH.half, ARCH.front + 1], [ARCH.half, 50.4], [4.6, 50.4], ...sample(lawnSouth, 4.6, EAST_LAWN, 24)]);
  // The causeway's sides, from the platform's notch to the lip.
  for (const side of [-2.5, 2.5]) wall(side, notchMeets, side, lip(2.5));
  // Round the platform, 0.5 m in from its edge, open over the stair.
  {
    const r = PLATFORM.r - 0.5, open = Math.asin(2.7 / r);
    const from = Math.PI / 2 + open, to = Math.PI / 2 - open + Math.PI * 2;
    along(Array.from({ length: 41 }, (_, i) => {
      const a = from + (to - from) * i / 40;
      return [Math.cos(a) * r, PLATFORM.z + Math.sin(a) * r];
    }));
    // Joining the ends to the notch.
    wall(-2.5, notchMeets, Math.cos(from) * r, PLATFORM.z + Math.sin(from) * r);
    wall(2.5, notchMeets, Math.cos(to) * r, PLATFORM.z + Math.sin(to) * r);
  }
  // Over the pools' water, inside the rims.
  for (const [x, z] of POOLS) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 20, 48), seen);
    mesh.position.set(x, 9, z);
    walls.add(mesh);
    world.createCollider(RAPIER.ColliderDesc.cylinder(10, 5.4).setTranslation(x, 9, z).setCollisionGroups(WALL_GROUPS));
  }

  return { spawn: SPAWN, walls };
}
