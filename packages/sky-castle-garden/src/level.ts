import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// Step 2 of the plan: every asset as a grey primitive at its final size,
// placed from the zone plan (docs/zone-plan.png). The snapshot's scale bar
// reads 9.3 px to the metre; positions here are in metres, measured from where
// the main path meets the garden's north edge. x east, z south (towards the
// arch), y up.

// The garden's edges, as curves across x.
// The north lip bows out over the drop: a circle about 250 m across.
const northEdge = (x: number) => 250.7 - Math.sqrt(250.7 ** 2 - x * x);
// The lawn's south edge, where the south moat starts, and the city's front
// behind the moat, both following the curve of the city's base.
const lawnSouth = (x: number) => 44.7 + x * x / 298;
const cityFront = (x: number) => 52.5 + x * x / 292;
// The moats down the sides, from z 6 to the south moat.
const WEST = -52, WEST_LAWN = -44.9, EAST_LAWN = 46.3, EAST = 53.3, MOATS_FROM = 6.1;

// Collision groups, as Rapier packs them: the groups a collider is in, in the
// top 16 bits, and the groups it meets, in the bottom 16. Invisible walls are
// in a group of their own, which the camera's sweep leaves out, so they stop
// the robot and the stonework but never pull the camera in.
const WALLS = 0x0002;
export const WALL_GROUPS = (WALLS << 16) | 0xffff;
export const CAMERA_GROUPS = (0x0001 << 16) | (0xffff & ~WALLS);

export const SPAWN = { x: 0, z: -37, yaw: Math.PI };
export const PLATFORM_TOP = 3.2;

const colours = {
  stone: 0xc9c2b4, dark: 0x8f897d, lawn: 0x8dbf4a, path: 0xd8c8a0, water: 0x2e4a66, door: 0x1f1d1b,
};
const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
export const stone = material(colours.stone);
const dark = material(colours.dark), lawn = material(colours.lawn);
const path = material(colours.path), door = material(colours.door);
const water = new THREE.MeshStandardMaterial({ color: colours.water, roughness: 0.2 });

// A curve sampled across x, as [x, z] points.
const sample = (curve: (x: number) => number, from: number, to: number, steps = 32) =>
  Array.from({ length: steps + 1 }, (_, i) => { const x = from + (to - from) * i / steps; return [x, curve(x)]; });

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
  const paving = (x0: number, x1: number, z0: number, z1: number) =>
    box((x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, path, 0, false).castShadow = false;

  // The terrace: a stone base that the moats are cut into, and the lawn on top.
  const north = sample(northEdge, WEST, EAST, 64);
  ground(slab([...north, [EAST, 120], [WEST, 120]], -40, -0.3), dark);
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
  const PLATFORM = { z: -34.9, r: 11.1 };
  const notchMeets = PLATFORM.z + Math.sqrt(PLATFORM.r ** 2 - 2.5 ** 2);
  const from = Math.atan2(notchMeets - PLATFORM.z, 2.5), to = Math.PI - from;
  const rim = Array.from({ length: 65 }, (_, i) => {
    const a = to + (from + Math.PI * 2 - to) * i / 64;
    return [Math.cos(a) * PLATFORM.r, PLATFORM.z + Math.sin(a) * PLATFORM.r];
  });
  ground(slab([...rim, [2.5, -27.3], [-2.5, -27.3]], -60, PLATFORM_TOP), stone);
  // The causeway, 5 m wide, from inside the notch to the garden's lip.
  box(0, -12.5, -13.65, 5, 25, 27.3);
  paving(-2.5, 2.5, -27.3, 0);
  // Eight 0.4 m steps down off the platform onto it.
  for (let i = 0; i < 7; i++) {
    const top = PLATFORM_TOP - 0.4 * (i + 1), z0 = -27.3 + 7.1 / 8 * i;
    box(0, top / 2, z0 + 7.1 / 16, 5, top, 7.1 / 8);
  }

  // Paths: the main axis, three branches west and one east, and stubs to the pools.
  paving(-2.5, 2.5, 0, 50.4);
  paving(-44.1, -2.5, 4.4, 7.7);
  paving(-40.7, -2.5, 24.6, 28);
  paving(-44.7, -2.5, 35.4, 38.7);
  paving(2.5, 46.2, 10.9, 14.2);
  paving(-17.85, -14.35, 22.5, 24.6);
  paving(2.5, 8.5, 32.35, 35.85);

  // The pools: a low stone rim round each, water inside.
  for (const [x, z] of [[-16.1, 15.8], [15.3, 34.1]]) {
    ground(slab(circle(x, z, 7.4), 0, 0.4, [circle(x, z, 5.4).reverse()]), stone);
    const pool = add(new THREE.CircleGeometry(5.4, 48), water, { cast: false });
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.05, z);
  }

  // The freestanding stonework (columns, statue, ruin, colonnade, urns,
  // slabs) moves, so it's built in stones.ts.

  // The city's base behind the south moat: tiers stepping back and up,
  // following its curve, with the arch cut into the bottom tier.
  // The stair starts where the grass landing ends and climbs across the moat.
  const ARCH = { half: 3.7, stair: 50.4, front: 52.5, back: 61.2, floor: 3.6, height: 10 };
  for (let xc = -62; xc <= 62; xc += 4) {
    const t = Math.atan(xc / 146);
    const front = cityFront(xc);
    const tier = (back: number, depth: number, bottom: number, top: number) => {
      const out = back + depth / 2;
      box(xc - Math.sin(t) * out, (bottom + top) / 2, front + Math.cos(t) * out, 4.3, top - bottom, depth, stone, -t);
    };
    const inArch = Math.abs(xc) < 4;
    tier(0, 12, inArch ? ARCH.floor + ARCH.height : -0.3, 28);
    tier(10, 12, 28, 55);
    tier(20, 14, 55, 85);
  }
  // The arch: a stair of twelve 0.3 m steps up from the grass to its floor,
  // the sealed door at the back and a frame round the opening. 0.4 m risers
  // on treads this short climb at over 40°, too steep for the robot. The
  // steps are for show: it walks up a hidden ramp laid over their noses.
  const run = 0.475, landing = ARCH.stair + run * 12;
  for (let i = 0; i < 12; i++) {
    const top = 0.3 * (i + 1);
    box(0, (top - 0.3) / 2, ARCH.stair + run * (i + 0.5), ARCH.half * 2, top + 0.3, run, stone, 0, false);
  }
  {
    const length = Math.hypot(run * 12, ARCH.floor), slope = Math.atan2(ARCH.floor, run * 12);
    const middle = new THREE.Vector3(0, ARCH.floor / 2, ARCH.stair + run * 6);
    middle.y -= Math.cos(slope) * 0.2;
    middle.z += Math.sin(slope) * 0.2;
    world.createCollider(RAPIER.ColliderDesc.cuboid(ARCH.half, 0.2, length / 2).setTranslation(middle.x, middle.y, middle.z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(-slope, 0, 0))));
  }
  box(0, (ARCH.floor - 0.3) / 2, (landing + ARCH.back) / 2, ARCH.half * 2, ARCH.floor + 0.3, ARCH.back - landing);
  box(0, ARCH.floor + ARCH.height / 2, ARCH.back + 0.5, ARCH.half * 2 + 0.6, ARCH.height, 1, door);
  for (const side of [-1, 1]) box(side * (ARCH.half + 0.6), (ARCH.floor + ARCH.height) / 2, ARCH.front - 0.5, 1.2, ARCH.floor + ARCH.height + 1.5, 1);
  box(0, ARCH.floor + ARCH.height + 1.2, ARCH.front - 0.5, ARCH.half * 2 + 2.4, 1.5, 1);

  // The rounded bastion, beside the arch to the west (not on the zone plan:
  // placed by eye).
  column(-24, -0.3, 65.5, 13, 34.3);
  column(-24, 34, 65.5, 10, 14);

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
  for (const [x, z] of [[-16.1, 15.8], [15.3, 34.1]]) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 20, 48), seen);
    mesh.position.set(x, 9, z);
    walls.add(mesh);
    world.createCollider(RAPIER.ColliderDesc.cylinder(10, 5.4).setTranslation(x, 9, z).setCollisionGroups(WALL_GROUPS));
  }

  return { spawn: SPAWN, walls };
}
