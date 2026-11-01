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

export const SPAWN = { x: 0, z: -37, yaw: Math.PI };
export const PLATFORM_TOP = 3.2;

const colours = {
  stone: 0xc9c2b4, dark: 0x8f897d, lawn: 0x8dbf4a, path: 0xd8c8a0, water: 0x2e4a66, door: 0x1f1d1b,
};
const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
const stone = material(colours.stone), dark = material(colours.dark), lawn = material(colours.lawn);
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

  // Three standing columns in a row beside the main path, west side.
  for (const z of [14.6, 22.7, 31.2]) column(-4.1, 0, z, 0.7, 14);
  // The fallen column across the lowest west branch, and loose drums near it.
  const fallen = add(new THREE.CylinderGeometry(0.7, 0.7, 17.2, 32), stone);
  fallen.position.set(-12.1, 0.7, 36.8);
  fallen.rotation.set(0, -Math.atan2(5.8, 16.2), Math.PI / 2, 'YXZ');
  {
    const q = fallen.quaternion;
    world.createCollider(RAPIER.ColliderDesc.cylinder(8.6, 0.7).setTranslation(-12.1, 0.7, 36.8).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }
  for (const [x, z, yaw] of [[-23, 33, 0.4], [-21.5, 40.5, 1.3], [-7, 43, 2.2]]) {
    const drum = box(x, 0.7, z, 1.2, 1.4, 1.4, stone, yaw, false);
    drum.geometry = new THREE.CylinderGeometry(0.7, 0.7, 1.2, 32).rotateZ(Math.PI / 2);
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.6, 0.7).setTranslation(x, 0.7, z)
      .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ'))));
  }

  // The statue on its plinth, near the north end east of the path.
  box(4.1, 1.5, 8.3, 2.7, 3, 2.7);
  {
    const figure = add(new THREE.CapsuleGeometry(0.6, 1.8, 8, 16), stone);
    figure.position.set(4.1, 4.5, 8.3);
    world.createCollider(RAPIER.ColliderDesc.capsule(0.9, 0.6).setTranslation(4.1, 4.5, 8.3));
    box(4.6, 5.6, 8.3, 0.3, 1.6, 0.3, stone, 0, false).rotation.z = -0.4;
  }

  // The low arch ruin by the north edge: four piers, one surviving lintel and
  // a piece of another on the grass.
  for (const x of [9.1, 12, 14.8, 17.6]) box(x, 1, 2.5, 1, 2, 1.6);
  box(10.55, 2.25, 2.5, 4, 0.5, 1.6);
  box(16.4, 0.25, 5.2, 2.6, 0.5, 1.4, stone, 0.5);

  // The colonnade arcing round the north side of the east pool: five columns
  // 6 m tall, lintels on top.
  const tops: THREE.Vector3[] = [];
  for (let i = -2; i <= 2; i++) {
    const a = -Math.PI / 2 + i * THREE.MathUtils.degToRad(32);
    const x = 15.3 + Math.cos(a) * 9.5, z = 34.1 + Math.sin(a) * 9.5;
    column(x, 0, z, 0.4, 6);
    tops.push(new THREE.Vector3(x, 6.25, z));
  }
  for (let i = 0; i < tops.length - 1; i++) {
    const [a, b] = [tops[i], tops[i + 1]];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    box(mid.x, mid.y, mid.z, a.distanceTo(b) + 0.9, 0.5, 0.9, stone, -Math.atan2(b.z - a.z, b.x - a.x));
  }

  // Urns beside the pools.
  for (const [x, z] of [[-24.5, 12], [-24, 21], [-7.8, 10], [24, 38], [22, 42.5]]) column(x, 0, z, 0.5, 1.3);

  // Stone slabs and blocks along the path edges, placed at random but the
  // same every time.
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [x, z] of [[-6.5, 2], [5.5, 18], [6, 24.5], [-6.5, 41], [5.8, 45], [-20, 9.5], [-33, 3], [-30, 30],
    [-36, 34], [22, 9], [33, 16], [40, 9], [-10, 22.5], [9, 40]]) {
    const width = 1 + random() * 2, depth = 1 + random() * 2, height = 0.3 + random() * 0.7;
    box(x, height / 2, z, width, height, depth, stone, random() * Math.PI);
  }

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

  return { spawn: SPAWN };
}
