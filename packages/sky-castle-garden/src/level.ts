import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ARCH, buildCity, cityFront } from './city';
import { DRIFTS, drifting } from './drift';
import { brokenColumnGeometry, chippedBlock, shifted } from './columns';
import { columnIvy } from './growth';
import { DEEP, drowned, fadesDeep, painted, palette } from './look';
import { textures } from './masonry';
import { buildFlooded } from './flooded';
import { noise, waterMaterial } from './water';
import { crossings, wallGeometry, wallInset, wallLine } from './wall';
import { bridgeBranch, buildRoots, rootHoles } from './roots';

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
// The moats down the sides, from z 18 to the south moat: far enough back
// that their north ends sit behind the foot of the retaining wall's vault
// (wall.ts), which runs at full depth right round the garden's corners.
// (They used to start at z 6.1, right behind the lip.)
export const WEST = -52, WEST_LAWN = -44.9, EAST_LAWN = 46.3, EAST = 53.3, MOATS_FROM = 18;

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

// Old paving, sunk and tilted in the grass beside the paths: what's left of
// edging and paths long gone, in little runs of two or three slabs. Each
// run as its middle and whether it runs along x or z; the slabs as their
// middle, half sizes and turn, for the grass to keep off them.
const SUNK_RUNS: [number, number, 'x' | 'z'][] = [
  [3.7, 29.5, 'z'], [-3.7, 1.6, 'z'], [3.7, 38.5, 'z'], [-14, 3.4, 'x'], [-33, 8.7, 'x'], [-18, 29, 'x'],
  [-36, 23.6, 'x'], [-13, 34.4, 'x'], [-30, 39.6, 'x'], [15, 10, 'x'], [28, 15.2, 'x'], [40.5, 15.3, 'x'],
];
export const SUNK = (() => {
  let s = 433;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const slabs: { x: number, z: number, w: number, d: number, turn: number, tilt: [number, number], top: number }[] = [];
  for (const [cx, cz, axis] of SUNK_RUNS) {
    const count = 2 + Math.floor(random() * 2);
    let along = -(count - 1) * 0.95;
    for (let k = 0; k < count; k++) {
      const w = 1.1 + random() * 0.8, d = 0.9 + random() * 0.6, turn = (random() - 0.5) * 0.5 + (axis === 'x' ? 0 : Math.PI / 2);
      const off = (random() - 0.5) * 0.5;
      slabs.push({
        x: cx + (axis === 'x' ? along : off), z: cz + (axis === 'z' ? along : off), w, d, turn,
        tilt: [(random() - 0.5) * 0.12, (random() - 0.5) * 0.12], top: 0.08 + random() * 0.12,
      });
      along += 1.6 + random() * 0.6;
    }
  }
  return slabs;
})();
// Is a point on one of them (with a margin)?
export const onSunk = (x: number, z: number, margin = 0) => SUNK.some(({ x: sx, z: sz, w, d, turn }) => {
  const dx = x - sx, dz = z - sz, c = Math.cos(turn), s = Math.sin(turn);
  return Math.abs(dx * c - dz * s) < w / 2 + margin && Math.abs(dx * s + dz * c) < d / 2 + margin;
});

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
// The bridge's arch: the height it springs from at both ends, and its crown
// under the deck.
const BRIDGE = { spring: -4, crown: -1.4 };
// The lawn's underside, where the retaining wall starts.
const TOP_OF_WALL = -0.3;
// On its top, from Andrew's two stills of the tower from the south-east: a
// small pool sunk in the lawn west of the stair, what's left of an L of
// paving just north of the spawn, a broken column on a stepped plinth near
// the north-west rim, and a square notch in the east face's rim, where a
// big block has fallen out.
// The pool by its middle and half sizes (the water; the coping round it is
// COPING wide), the column by its middle, the notch by its angle round the
// tower (from east towards south), half width, how far it cuts in and how
// far down it goes from the top of the grass.
export const PLATFORM_POOL = { x: -4.8, z: -29.8, hx: 1.5, hz: 0.85 };
const COPING = 0.3;
export const PLATFORM_COLUMN = { x: -4.6, z: -42.6, plinth: 2 };
export const PLATFORM_NOTCH = { angle: 0.5, half: 0.9, depth: 1.3, drop: 2.2 };
// The paving's two arms, as x and z extents, and its slabs: laid in courses
// along each arm, two across, some gone, more of them towards the arms'
// ragged ends. Each as its middle, size, turn, tilt and top.
const PLATFORM_ARMS = [[-6.8, -0.6, -38.2, -36.2, 'x'], [-2.4, -0.4, -42.4, -38.2, 'z']] as const;
export const PLATFORM_SLABS = (() => {
  let s = 977;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const slabs: { x: number, z: number, w: number, d: number, turn: number, tilt: [number, number], top: number }[] = [];
  for (const [x0, x1, z0, z1, axis] of PLATFORM_ARMS) {
    const [a0, a1, b0, b1] = axis === 'x' ? [x0, x1, z0, z1] : [z1, z0, x0, x1];
    const length = Math.abs(a1 - a0), dir = Math.sign(a1 - a0), across = (b1 - b0) / 2;
    for (let row = 0; row < 2; row++) {
      // Each row's courses start at their own place, so the joints break.
      for (let at = row ? -0.4 * random() : 0; at < length;) {
        const long = 0.8 + random() * 0.6, from = Math.max(0, at), to = Math.min(length, at + long);
        at += long;
        // Gone: now and then, and more and more towards the far end.
        if (random() < 0.08 + 0.5 * Math.max(0, (to / length - 0.6) / 0.4) ** 2) continue;
        const a = a0 + dir * (from + to) / 2, b = b0 + across * (row + 0.5);
        const [x, z] = axis === 'x' ? [a, b] : [b, a], [w, d] = axis === 'x' ? [to - from, across] : [across, to - from];
        slabs.push({ x, z, w: w - 0.07, d: d - 0.07, turn: (random() - 0.5) * 0.04, tilt: [(random() - 0.5) * 0.03, (random() - 0.5) * 0.03], top: PLATFORM_TOP + 0.03 + random() * 0.03 });
      }
    }
  }
  return slabs;
})();
// Is a point on the platform's pool, paving, column or notch (with a margin)?
// The plinth takes its own margin: grass grows right up against it.
export const onPlatformFeature = (x: number, z: number, margin = 0, plinthMargin = margin) => {
  const { x: px, z: pz, hx, hz } = PLATFORM_POOL;
  if (Math.abs(x - px) < hx + COPING + margin && Math.abs(z - pz) < hz + COPING + margin) return true;
  const { x: cx, z: cz, plinth } = PLATFORM_COLUMN;
  if (Math.abs(x - cx) < plinth / 2 + plinthMargin && Math.abs(z - cz) < plinth / 2 + plinthMargin) return true;
  const { angle, half, depth } = PLATFORM_NOTCH, dz = z - PLATFORM.z;
  const out = x * Math.cos(angle) + dz * Math.sin(angle), side = -x * Math.sin(angle) + dz * Math.cos(angle);
  if (out > PLATFORM.r - depth - margin && Math.abs(side) < half + margin) return true;
  return PLATFORM_SLABS.some(({ x: sx, z: sz, w, d }) => Math.abs(x - sx) < w / 2 + margin && Math.abs(z - sz) < d / 2 + margin);
};

export const stone = painted(palette.stone);
const sandstoneMap = textures.sandstone.map();
const sandstone = painted(palette.sandstone, { map: sandstoneMap }, textures.sandstone.metres);
const steps = painted(palette.sandstone, { map: textures.steps.map() }, textures.steps.metres);
const masonry = painted(palette.masonry, { map: sandstoneMap }, textures.sandstone.metres), lawn = drifting(painted(palette.grass), DRIFTS.lawn), meadow = drifting(painted(palette.grass), DRIFTS.meadow);
const pavingMap = textures.paving.map();
// Moss on the paving: in the joints and over the stone in patches, creeping
// in from the paths' edges and thinning towards their middles, cut hard like
// a painted wash.
// All the paving, the causeway's too. Out over the drop, away from the
// soil, the causeway takes only a little.
const CAUSEWAY = [-2.5, 2.5, -27.3, 0], PAVED = [...PATHS, CAUSEWAY, ...PLATFORM_ARMS.map(([x0, x1, z0, z1]) => [x0, x1, z0, z1])];
// The sunk slabs, out in the grass, would be all edge: they take only some
// of the creep (spread), so their moss stays in a few cracks and patches.
function mossy(material: THREE.MeshStandardMaterial, spread = 1) {
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    paint(shader, renderer);
    Object.assign(shader.uniforms, {
      uPaths: { value: PAVED.map(([x0, x1, z0, z1]) => new THREE.Vector4(x0, x1, z0, z1)) },
      uMoss: { value: new THREE.Color(PATH_MOSS[0]) },
      uMossDeep: { value: new THREE.Color(PATH_MOSS[1]) },
      uMossReach: { value: mossLook },
      uBare: { value: new THREE.Vector4(...CAUSEWAY) },
      uSpread: { value: spread },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'varying vec2 vGround;\n#include <common>')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vGround;
        uniform vec4 uPaths[${PAVED.length}];
        uniform vec3 uMoss, uMossDeep;
        uniform vec2 uMossReach;
        uniform vec4 uBare;
        uniform float uSpread;
        ${noise}`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          // How far in from the nearest edge of the paving.
          float inside = 0.0;
          for (int i = 0; i < ${PAVED.length}; i++) {
            vec4 r = uPaths[i];
            vec2 d = min(vGround - r.xz, r.yw - vGround);
            inside = max(inside, min(d.x, d.y));
          }
          float creep = 1.0 - smoothstep(0.0, uMossReach.x, inside);
          if (all(greaterThan(vGround, uBare.xz)) && all(lessThan(vGround, uBare.yw))) creep *= 0.3;
          creep *= uSpread;
          // Three sizes of noise, so the patches' edges are ragged, not blobs.
          vec2 at = vGround;
          float n = snoise(vec3(at * 0.7, 0.0)) * 0.55 + snoise(vec3(at * 2.6, 3.0)) * 0.33 + snoise(vec3(at * 7.0, 5.0)) * 0.12;
          // The same a little towards the light: where both cover, the lit
          // top of the cushion; the rest of it, along its far side, is the
          // deeper green, so each patch has a lighter shape inside a darker.
          vec2 lit = at + vec2(0.05, -0.065);
          float m = snoise(vec3(lit * 0.7, 0.0)) * 0.55 + snoise(vec3(lit * 2.6, 3.0)) * 0.33 + snoise(vec3(lit * 7.0, 5.0)) * 0.12;
          // The joints: much darker than the stone's own colour, so the cracks
          // and not the stone's own darker marks. Moss is rare, and mostly in
          // these; out on the stone only where it's grown thickest.
          const vec3 luma = vec3(0.299, 0.587, 0.114);
          float joint = 1.0 - smoothstep(0.4, 0.55, dot(diffuseColor.rgb, luma) / dot(diffuse, luma));
          // How close a crack is: the darkest of the paving's texture a hand's
          // width around. Moss grows out from the cracks, so it gets a head
          // start near one.
          float near = 0.0;
          #if defined(USE_MAP) && defined(TRIPLANAR)
            for (int k = 0; k < 8; k++) {
              float a = float(k) * 0.785398;
              vec2 q = (vModel.xz + vec2(cos(a), sin(a)) * 0.1) / uTile;
              near = max(near, 1.0 - smoothstep(0.3, 0.42, dot(texture2D(map, q).rgb, luma)));
            }
          #endif
          // Only along some stretches of crack, where the noise is up anyway.
          near *= smoothstep(0.25, 0.55, n);
          float grow = n + creep * 0.6 + near * 0.7, top = m + creep * 0.6 + near * 0.7;
          float inJoint = joint * step(0.62, grow);
          float edge = fwidth(grow) * 0.7;
          float patches = smoothstep(uMossReach.y - edge, uMossReach.y + edge, grow);
          // The lit top: where the shifted field is well over the line this
          // moss grew past (the joints' or the patches'), so the deeper green
          // is left along each shape's far side.
          float line = patches > 0.5 ? uMossReach.y : 0.62;
          float crown = smoothstep(line + 0.08 - edge, line + 0.08 + edge, top);
          // In the cracks alone it's in shadow: the deeper green.
          vec3 moss = mix(uMossDeep, uMoss, crown * patches);
          diffuseColor.rgb = mix(diffuseColor.rgb, moss, max(inJoint, patches));
        }`);
  };
  return material;
}
// The paths' moss, as its lit top and its deeper body: cool greens, near
// the meadow's, so it sits with the grass rather than glowing against it.
const PATH_MOSS = [0x7fa655, 0x4a7646];
// How far in from the edges moss creeps (m), and how sparse its patches are.
const mossLook = new THREE.Vector2(1.4, 0.95);
const path = mossy(painted(palette.path, { map: pavingMap }, textures.paving.metres)), door = painted(palette.door);
// The same stone with the texture laid on by UVs, for the pool rims.
const coping = painted(palette.path, { map: pavingMap });
// The platform's loose slabs: each one stone, from a texture of one big
// stone a tile, each slab taken from its own place inside it, clear of the
// tile's edges (columns.ts).
const SLAB_TILE = textures.slab.metres;
const slabMap = textures.slab.map();
const slabStone = mossy(painted(palette.path, { map: slabMap }, SLAB_TILE));
slabStone.defines = { ...slabStone.defines, TEX_SHIFT: '' };
// The same stone for the sunk slabs, with less moss.
const sunkStone = mossy(painted(palette.path, { map: slabMap }, SLAB_TILE), 0.5);
sunkStone.defines = { ...sunkStone.defines, TEX_SHIFT: '' };
const water = waterMaterial(palette.canal, 0.55), poolWater = waterMaterial(palette.water, 0.92);
// The tower's pool, darker than the garden's: deep and in shade.
const towerWater = waterMaterial([DEEP, 0x163a4e], 0.97, false);
// The moats' walls and the streets at their foot.
const drownedMasonry = drowned(painted(palette.masonry, { map: sandstoneMap }, textures.sandstone.metres));

// A curve sampled across x, as [x, z] points.
const sample = (curve: (x: number) => number, from: number, to: number, steps = 32) =>
  Array.from({ length: steps + 1 }, (_, i) => { const x = from + (to - from) * i / steps; return [x, curve(x)]; });

// The base's outside wall, its blocks laid along the wall by UVs so they run
// on round the curves without the seam the three-sided mapping leaves where
// the wall turns from facing one way to another.
const outside = painted(palette.masonry, { map: textures.sandstone.map() });
// The retaining wall in the same blocks, shaded at its joints by its colours.
const retaining = painted(palette.masonry, { map: outside.map, vertexColors: true });
// The stone that runs on down into the fog thins away in it.
for (const m of [retaining, outside, masonry, sandstone]) fadesDeep(m);
// The tower's column in the same blocks, smaller, by its own UVs.
const columnBlocks = painted(palette.sandstone, { map: sandstoneMap });
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
  // Holes wound against the outline, or their walls face into the stone.
  const clockwise = (outline: number[][]) => THREE.ShapeUtils.isClockWise(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes = holes.map(hole => toShape(clockwise(hole) === clockwise(points) ? [...hole].reverse() : hole, new THREE.Path()));
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
  const back = (side: number) => [[OUTER, cityFront(OUTER) + 6], [104, 135], [80, 178], [40, 198]].map(([x, z]) => [side * x, z]);
  // The retaining wall along the front (wall.ts): the lip, the curve back in
  // under the garden with its arches, and the plumb face below. Kept off
  // the moats, which come right up behind the lip at the garden's corners.
  const keepOff = [[WEST, WEST_LAWN], [EAST_LAWN, EAST]];
  const room = (x: number, z: number) => Math.min(...keepOff.map(([x0, x1]) =>
    Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(MOATS_FROM - z, 0))));
  const front = [...ledgeEdge(-1, 400).reverse(), ...sample(northEdge, WEST, EAST, 400).slice(1, -1), ...ledgeEdge(1, 400)];
  const line = wallLine(front, room);
  {
    // Roots from the garden come out of holes in its lip and cling to it
    // all the way down (roots.ts).
    const holes = rootHoles(line);
    const wall = add(wallGeometry(line, textures.sandstone.metres, holes), retaining, { cast: false });
    wall.name = 'retaining wall';
    scene.add(buildRoots(line, holes));
    // The stone behind it stops at the curve's foot, so it doesn't show
    // through; the lawn on top covers the gap under the lip.
    const outline = [...wallInset(line), ...back(1), ...back(-1).reverse()];
    const problems = crossings(outline) + crossings(outline, moat(-1)) + crossings(outline, moat(1));
    if (problems) console.error(`retaining wall: the stone's outline crosses itself or a moat ${problems} times`);
    // Cut for the moats only down to their floors, solid below, so nothing
    // in the moats' drowned stone shows through as the base fades out deep
    // in the fog; each moat floored with a thin slab of it.
    const stones = [masonry, outside, drownedMasonry] as unknown as THREE.Material;
    ground(walled(slab(outline, -0.3 - (FLOOD - 0.2), -0.3, [moat(-1), moat(1)]), outline), stones);
    ground(walled(slab(outline, -40, -0.1 - FLOOD), outline), stones);
    for (const side of [-1, 1]) ground(slab(moat(side), -FLOOD - 0.3, -FLOOD), drownedMasonry);
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
  const round = (a0: number, a1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / n;
    return [Math.cos(a) * PLATFORM.r, PLATFORM.z + Math.sin(a) * PLATFORM.r];
  });
  const rim = round(to, from + Math.PI * 2, 64);
  // The east notch: a block's space cut square out of the rim.
  const { angle, half, depth, drop } = PLATFORM_NOTCH;
  const across = (out: number, side: number) => [out * Math.cos(angle) - side * Math.sin(angle), PLATFORM.z + out * Math.sin(angle) + side * Math.cos(angle)];
  const spread = Math.asin(half / PLATFORM.r), inner = PLATFORM.r - depth;
  const notched = [...round(to, angle + Math.PI * 2 - spread, 56), across(inner, -half), across(inner, half), ...round(angle + Math.PI * 2 + spread, from + Math.PI * 2, 8)];
  // The pool's hole: the water's size through the stone, and wider through
  // the grass, for the coping.
  const { x: px, z: pz, hx, hz } = PLATFORM_POOL;
  const rect = (wx: number, wz: number) => [[px - wx, pz - wz], [px + wx, pz - wz], [px + wx, pz + wz], [px - wx, pz + wz]];
  const stair = [[2.5, -27.3], [-2.5, -27.3]], apex = PLATFORM_TOP - drop;
  // The pool's floor sits in the notched part, so that goes down far enough.
  const cut = Math.min(apex, PLATFORM_TOP - 1.5);
  // Grass on top of the tower's stone: plain below the notch, cut above it.
  ground(slab([...rim, ...stair], -60, cut), sandstone);
  // Between the notch's floor and the pool's, cut for the pool alone.
  if (cut < apex) ground(slab([...rim, ...stair], cut, apex, [rect(hx, hz)]), sandstone);
  // The stone runs right up to the grass, so the rim's face is all stone
  // and the green is only a skin on top, the blades hiding where they meet.
  ground(slab([...notched, ...stair], apex, PLATFORM_TOP - 0.3, [rect(hx, hz)]), sandstone);
  ground(slab([...notched, ...stair], PLATFORM_TOP - 0.3, PLATFORM_TOP - 0.02, [rect(hx + COPING, hz + COPING)]), sandstone);
  ground(slab([...notched, ...stair], PLATFORM_TOP - 0.02, PLATFORM_TOP, [rect(hx + COPING, hz + COPING)]), meadow);
  {
    // The pool: a floor a metre down, coping round it just proud of the
    // grass, and still water a little under the coping's top.
    box(px, (cut + PLATFORM_TOP - 1.2) / 2, pz, hx * 2, PLATFORM_TOP - 1.2 - cut, hz * 2, sandstone);
    const top = PLATFORM_TOP + 0.05, y = (top + PLATFORM_TOP - 0.4) / 2, tall = top - (PLATFORM_TOP - 0.4);
    for (const side of [-1, 1]) {
      box(px, y, pz + side * (hz + COPING / 2), (hx + COPING) * 2, tall, COPING, path);
      box(px + side * (hx + COPING / 2), y, pz, COPING, tall, hz * 2, path);
    }
    const surface = new THREE.PlaneGeometry(hx * 2, hz * 2), uvs = surface.getAttribute('uv');
    for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) * hx * 2, uvs.getY(k) * hz * 2);
    const pool = add(surface, towerWater, { cast: false });
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(px, PLATFORM_TOP - 0.15, pz);
  }
  {
    // The column: a plinth of two worn steps, and the broken shaft on it,
    // ivy climbing its west side.
    const { x: cx, z: cz, plinth } = PLATFORM_COLUMN;
    let base = PLATFORM_TOP - 0.1;
    for (const [k, [w, h]] of [[plinth, 0.45], [plinth * 0.76, 0.35]].entries()) {
      const mesh = add(new ConvexGeometry(chippedBlock(w, h, w, 41 + k)), sandstone);
      mesh.position.set(cx, base + h / 2, cz);
      world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, w / 2).setTranslation(cx, base + h / 2, cz));
      base += h;
    }
    const radius = 0.45, height = 2.5;
    // In the tower's own block texture, as in the stills, at 0.4 the size
    // so a few blocks go round it.
    const column = add(brokenColumnGeometry(radius, height, 3, textures.sandstone.metres * 0.4), columnBlocks);
    column.position.set(cx, base, cz);
    column.rotation.y = 0.6;
    world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, radius * 1.1).setTranslation(cx, base + height / 2, cz));
    column.add(columnIvy(17, 0.5, height - 0.4, () => radius, -Math.PI / 2 - 0.6));
  }
  // The paving: worn slabs of the path's stone, just proud of the grass,
  // solid as a thin slab under each arm.
  PLATFORM_SLABS.forEach(({ x, z, w, d, turn, tilt, top }, k) => {
    const height = 0.25, mesh = add(shifted(new ConvexGeometry(chippedBlock(w, height, d, 700 + k)), SLAB_TILE, 1), slabStone);
    mesh.position.set(x, top - height / 2, z);
    mesh.quaternion.setFromEuler(new THREE.Euler(tilt[0], turn, tilt[1], 'YXZ'));
  });
  for (const [x0, x1, z0, z1] of PLATFORM_ARMS) {
    world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.1, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, PLATFORM_TOP - 0.06, (z0 + z1) / 2));
  }
  // The bridge, 5 m wide, from the tower to the garden: a flat deck on one
  // segmental arch, sprung at the same height from the tower's side and
  // from the retaining wall's lip, landing squarely on the lip's plumb face.
  // Its deck is solid as a thin slab.
  {
    const face = -24.5, spring = BRIDGE.spring;
    // From where the tower's rim meets the bridge's sides to the lip.
    const from = notchMeets, land = northEdge(0), span = land - from, rise = BRIDGE.crown - spring;
    const radius = (span * span / 4 + rise * rise) / (2 * rise), cz = from + span / 2, cy = BRIDGE.crown - radius;
    const shape = new THREE.Shape();
    shape.moveTo(face, 0);
    shape.lineTo(land, 0);
    // Closed a little way in behind the lip's face.
    shape.lineTo(land, TOP_OF_WALL - 0.02);
    shape.lineTo(land + 0.3, TOP_OF_WALL - 0.02);
    shape.lineTo(land + 0.3, spring);
    for (let i = 0; i <= 48; i++) {
      const z = land - span * i / 48;
      shape.lineTo(z, cy + Math.sqrt(radius * radius - (z - cz) ** 2));
    }
    shape.lineTo(face, spring);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(2.5, 0, 0);
    add(geometry, sandstone).name = 'bridge';
    world.createCollider(RAPIER.ColliderDesc.cuboid(2.5, 0.15, -face / 2).setTranslation(0, -0.15, face / 2));
    // The tower's stair notch filled in below the deck, down into the
    // clouds: back to the bridge's end, and under the arch's spring out to
    // the tower's curve.
    box(0, -30, (-27.3 + face) / 2, 5, 60, face + 27.3, sandstone);
    const curve = Array.from({ length: 13 }, (_, i) => { const x = 2.5 - 5 * i / 12; return [x, PLATFORM.z + Math.sqrt(PLATFORM.r ** 2 - x * x)]; });
    add(slab([[-2.5, face], [2.5, face], ...curve], -60, spring), sandstone);
    // A branch of the big root west of the bridge wraps round it (roots.ts).
    scene.add(bridgeBranch(line, rootHoles(line), z => z > from && z < land ? cy + Math.sqrt(radius * radius - (z - cz) ** 2) : spring));
  }
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
    // Across the mouth of the east notch, joined out to the ring.
    const { angle, half, depth } = PLATFORM_NOTCH, out = PLATFORM.r - depth - 0.3, far = half + 1.2;
    const at = (o: number, s: number) => [o * Math.cos(angle) - s * Math.sin(angle), PLATFORM.z + o * Math.sin(angle) + s * Math.cos(angle)];
    along([at(r + 0.2, -far), at(out, -far), at(out, far), at(r + 0.2, far)]);
  }
  // Round the tower's pool.
  {
    const { x, z, hx, hz } = PLATFORM_POOL, mesh = new THREE.Mesh(new THREE.BoxGeometry((hx + 0.1) * 2, 20, (hz + 0.1) * 2), seen);
    mesh.position.set(x, PLATFORM_TOP + 9, z);
    walls.add(mesh);
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx + 0.1, 10, hz + 0.1).setTranslation(x, PLATFORM_TOP + 9, z).setCollisionGroups(WALL_GROUPS));
  }
  // Over the pools' water, inside the rims.
  for (const [x, z] of POOLS) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 20, 48), seen);
    mesh.position.set(x, 9, z);
    walls.add(mesh);
    world.createCollider(RAPIER.ColliderDesc.cylinder(10, 5.4).setTranslation(x, 9, z).setCollisionGroups(WALL_GROUPS));
  }

  // The sunk paving: chipped slabs, tipped a little, just proud of the
  // grass, each one stone like the platform's.
  SUNK.forEach(({ x, z, w, d, turn, tilt, top }, k) => {
    const height = 0.3, turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt[0], -turn, tilt[1], 'YXZ'));
    const mesh = add(shifted(new ConvexGeometry(chippedBlock(w, height, d, 300 + k)), SLAB_TILE, 1), sunkStone);
    mesh.position.set(x, top - height / 2, z);
    mesh.quaternion.copy(turned);
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, height / 2, d / 2).setTranslation(x, top - height / 2, z)
      .setRotation({ x: turned.x, y: turned.y, z: turned.z, w: turned.w }));
  });

  return { spawn: SPAWN, walls };
}
