import * as THREE from 'three';
import { onPlatformFeature, PLATFORM, PLATFORM_COLUMN, PLATFORM_TOP } from './level';
import { painted, palette } from './look';
import { stroke } from './masonry';
import { bothSidesAlike } from './growth';
import { DRIFTS, drifting } from './drift';
import { cloverGeometry, cloverTexture, field2, gardenFlowers, swardTexture, tuftGeometry, tuftTexture } from './foliage';
import { SWAY, swaying } from './wind';
import { DRAWN, SHADOW_STENCIL } from './robot';

// The start tower's top as a wildflower meadow, from Andrew's three stills
// of the field up there: a close-up for the flowers themselves, and two
// wider views for how they're spread. Four kinds, each painted side on and
// from above (FLOWERS):
// - white: cupped white anemones, a yellow eye, the petals' backs greyed;
// - pink: big pasque flowers, pink washing to lilac at the petals' edges,
//   a boss of golden stamens;
// - blue: bellflowers hanging from arching stems, deep blue inside, orange
//   stamens showing under the rim;
// - yellow: small, flat, five-petalled buttercups, a few to a stem.
// They grow in drifts, each kind in its own, with a scatter of white and
// yellow between: thicker than the wide still, thinner than the dense one.
// The grass under them is a deeper, bluer green than the garden's lawn and
// varies in drifts, yellower, bluer and darker, with broad-bladed tufts
// through it.

const KINDS = ['white', 'pink', 'blue', 'yellow'] as const;
type Kind = typeof KINDS[number];
const CELL = 256;

// A petal: a rounded spoon shape from (x, y) out along angle a.
function petal(g: CanvasRenderingContext2D, x: number, y: number, a: number, long: number, wide: number) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(long * 0.3, -wide * 0.9, long * 1.05, -wide * 0.7, long, 0);
  g.bezierCurveTo(long * 1.05, wide * 0.7, long * 0.3, wide * 0.9, 0, 0);
  g.restore();
}
// A wash: fill a shape with a gradient from its base colour to its rim's.
function wash(g: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string) {
  const gradient = g.createRadialGradient(x, y, r * 0.1, x, y, r);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  g.fillStyle = gradient;
  g.fill();
}
// Golden stamens, a heap of dots.
function stamens(g: CanvasRenderingContext2D, x: number, y: number, r: number, random: () => number, squash = 1) {
  for (let k = 0; k < 26; k++) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r;
    g.fillStyle = ['#e8b53c', '#f4d36a', '#c98a2a'][k % 3];
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * squash, r * 0.22, 0, Math.PI * 2);
    g.fill();
  }
}
const STEM = 'rgba(70,128,72,1)', LEAF = 'rgba(58,112,70,1)';

// The four kinds, side on in the top row of cells and from above in the
// bottom row, on a clear ground for an alpha test. Where each kind's head
// is, as a share of the card's height, for the card seen from above.
const HEADS: Record<Kind, number> = { white: 0.78, pink: 0.62, blue: 0.7, yellow: 0.82 };
function flowerAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * 4;
  canvas.height = CELL * 2;
  const g = canvas.getContext('2d')!;
  let s = 811;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  KINDS.forEach((kind, i) => {
    const x0 = i * CELL, cx = x0 + CELL / 2, top = CELL * (1 - HEADS[kind]);
    // Side on: leaves at the foot, then the stem and the flower.
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k - 1) * 0.7 + (random() - 0.5) * 0.3;
      stroke(g, k, cx, CELL, cx + Math.cos(a) * CELL * 0.32, CELL + Math.sin(a) * CELL * 0.32, CELL * 0.07, LEAF);
    }
    if (kind === 'white' || kind === 'pink') {
      const r = kind === 'pink' ? CELL * 0.3 : CELL * 0.12;
      stroke(g, 4, cx, CELL, cx + 4, top + r * 0.4, CELL * 0.035, STEM);
      // A cup: the back petals, then the eye showing over the front ones.
      const [inner, outer, back] = kind === 'pink' ? ['#f6d2c4', '#b98ab4', '#c7a0c4'] : ['#ffffff', '#e4e4ea', '#b9bccd'];
      for (const a of [-2.3, -1.57, -0.85]) { petal(g, cx, top + r * 0.45, a, r, r * 0.45); wash(g, cx, top + r * 0.45, r, back, outer); }
      g.beginPath();
      g.ellipse(cx, top + r * 0.05, r * 0.5, r * 0.16, 0, 0, Math.PI * 2);
      g.fillStyle = kind === 'pink' ? '#e2b048' : '#f0cf4a';
      g.fill();
      if (kind === 'pink') stamens(g, cx, top, r * 0.42, random, 0.35);
      for (const a of [-2.75, -1.95, -1.2, -0.4]) { petal(g, cx, top + r * 0.5, a, r * 0.95, r * 0.42); wash(g, cx, top + r * 0.5, r, inner, outer); }
    } else if (kind === 'blue') {
      // An arching stem, the bells hanging off it.
      const path = [[cx - 30, CELL], [cx - 34, top + 20], [cx - 10, top - 22], [cx + 34, top - 10]];
      for (let k = 0; k < 3; k++) stroke(g, 5 + k, path[k][0], path[k][1], path[k + 1][0], path[k + 1][1], CELL * 0.025, STEM);
      for (const [bx, by, size] of [[cx + 38, top + 6, 1], [cx - 4, top - 6, 0.85], [cx - 40, top + 36, 0.75]]) {
        const w = 16 * size, h = 30 * size;
        g.beginPath();
        g.moveTo(bx - w * 0.35, by);
        g.bezierCurveTo(bx - w * 0.6, by + h * 0.4, bx - w * 1.1, by + h * 0.9, bx - w, by + h);
        g.quadraticCurveTo(bx, by + h * 0.88, bx + w, by + h);
        g.bezierCurveTo(bx + w * 1.1, by + h * 0.9, bx + w * 0.6, by + h * 0.4, bx + w * 0.35, by);
        g.closePath();
        const gradient = g.createLinearGradient(bx - w, by, bx + w, by);
        gradient.addColorStop(0, '#3b4f9e');
        gradient.addColorStop(0.45, '#8ea6dc');
        gradient.addColorStop(1, '#4a62b0');
        g.fillStyle = gradient;
        g.fill();
        // The rim's inside, dark, and the stamens under it.
        g.beginPath();
        g.ellipse(bx, by + h * 0.96, w * 0.95, h * 0.1, 0, 0, Math.PI * 2);
        g.fillStyle = '#25336e';
        g.fill();
        g.fillStyle = '#e07a3a';
        for (const dx of [-0.3, 0, 0.3]) { g.beginPath(); g.arc(bx + dx * w, by + h * 1.05, 2, 0, Math.PI * 2); g.fill(); }
      }
    } else {
      // A branching stem, a flat little flower on each branch, seen edge on.
      for (const [tx, ty] of [[cx - 50, top + 20], [cx + 6, top - 8], [cx + 54, top + 26], [cx - 14, top + 50]]) {
        stroke(g, Math.floor(random() * 10), cx, CELL, tx, ty + 8, CELL * 0.022, STEM);
        for (const a of [-2.6, -2.0, -1.57, -1.1, -0.5]) { petal(g, tx, ty + 8, a, 26, 13); wash(g, tx, ty + 8, 26, '#ffe27a', '#f4b83c'); }
        g.beginPath();
        g.ellipse(tx, ty + 6, 9, 4, 0, 0, Math.PI * 2);
        g.fillStyle = '#fff2c0';
        g.fill();
      }
    }

    // From above: the open flower(s), centred in the cell.
    const cy = CELL * 1.5;
    if (kind === 'white' || kind === 'pink') {
      const r = CELL * (kind === 'pink' ? 0.42 : 0.19), n = kind === 'pink' ? 6 : 5;
      const [inner, outer] = kind === 'pink' ? ['#f8d6c6', '#b98ab4'] : ['#ffffff', '#d8dae4'];
      for (let k = 0; k < n; k++) {
        petal(g, cx, cy, k / n * Math.PI * 2 + 0.3, r, r * 0.55);
        wash(g, cx, cy, r, inner, outer);
        // Veins, faint.
        stroke(g, k, cx, cy, cx + Math.cos(k / n * Math.PI * 2 + 0.3) * r * 0.85, cy + Math.sin(k / n * Math.PI * 2 + 0.3) * r * 0.85, r * 0.1, kind === 'pink' ? 'rgba(220,150,170,0.5)' : 'rgba(200,204,220,0.5)');
      }
      if (kind === 'pink') stamens(g, cx, cy, r * 0.32, random);
      else {
        g.beginPath();
        g.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
        g.fillStyle = '#f0cf4a';
        g.fill();
      }
    } else if (kind === 'blue') {
      for (const [bx, by, size] of [[cx + 40, cy - 10, 1], [cx - 6, cy - 30, 0.85], [cx - 44, cy + 26, 0.75]]) {
        g.beginPath();
        g.arc(bx, by, 20 * size, 0, Math.PI * 2);
        wash(g, bx, by, 20 * size, '#9cb2e4', '#3b4f9e');
      }
    } else {
      for (const [fx, fy] of [[cx - 52, cy - 30], [cx + 10, cy - 50], [cx + 56, cy + 10], [cx - 16, cy + 44]]) {
        for (let k = 0; k < 5; k++) { petal(g, fx, fy, k / 5 * Math.PI * 2, 34, 22); wash(g, fx, fy, 34, '#ffe27a', '#f4b83c'); }
        g.beginPath();
        g.arc(fx, fy, 8, 0, Math.PI * 2);
        g.fillStyle = '#fff2c0';
        g.fill();
      }
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A flower: two upright cards crossing, a unit tall and wide, standing on
// the origin, with the side-on cell; and a level card at the head with the
// cell from above. Normals straight up, as the grass's.
function flowerGeometry(i: number) {
  const head = HEADS[KINDS[i]];
  const cards = [
    ...[0, Math.PI / 2].map(a => [new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(a), 0] as const),
    [new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2).translate(0, head, 0), 1] as const,
  ];
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const [card, row] of cards) {
    const flat = card.toNonIndexed(), uv = flat.getAttribute('uv');
    positions.push(...flat.getAttribute('position').array);
    for (let k = 0; k < uv.count; k++) {
      uvs.push((i + uv.getX(k)) / 4, (1 - row + uv.getY(k)) / 2);
      normals.push(0, 1, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// How many flowers in all, how big their clumps are, and how many dark
// grass tufts and clover mats.
export const meadowLook = { flowers: 750, clump: 1, tufts: 420, clover: 300 };

export function createMeadow(scene: THREE.Scene) {
  let s = 4243;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Where each kind grows thickest.
  const drift = KINDS.map((_, i) => field2(31 + i, 3.5 + i * 0.5));
  const sward: THREE.Matrix4[] = [], swardTint: THREE.Color[] = [];
  const tufts: THREE.Matrix4[] = [], tuftTint: THREE.Color[] = [];
  const clover: THREE.Matrix4[] = [], cloverTint: THREE.Color[] = [];
  const flowers: THREE.Matrix4[][] = KINDS.map(() => []), flowerTint: THREE.Color[][] = KINDS.map(() => []);
  const up = new THREE.Vector3(0, 1, 0);
  const place = (x: number, z: number, tall: number, wide: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, PLATFORM_TOP, z),
    new THREE.Quaternion().setFromAxisAngle(up, random() * Math.PI * 2), new THREE.Vector3(wide, tall, wide));
  // The grass's colour is the ground's, drifts and all (drift.ts): a tint
  // here only sets one kind apart from another. (The random draw once gave
  // each tuft a shade of its own; kept so the planting stays where it was.)
  const tint = (_x: number, _z: number) => {
    random();
    return new THREE.Color(1, 1, 1);
  };
  // Right out to the rim, and up against the plinth (a little under its
  // chipped edge, so no bare ground shows between).
  const onTop = (x: number, z: number, rim = 0.05) => Math.hypot(x, z - PLATFORM.z) < PLATFORM.r - rim && !(Math.abs(x) < 2.52 && z > -27.32) && !onPlatformFeature(x, z, 0.1, -0.04);
  // Where the clover grows, first, so the grass keeps out of it.
  const patches: { cx: number, cz: number, radius: number, count: number }[] = [];
  for (let n = 0; n < meadowLook.clover;) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * PLATFORM.r, cx = Math.cos(a) * d, cz = PLATFORM.z + Math.sin(a) * d;
    if (!onTop(cx, cz)) continue;
    const count = 4 + Math.floor(random() * 9);
    patches.push({ cx, cz, radius: 0.25 + Math.sqrt(count) * 0.2, count });
    n += count;
  }
  for (let gx = -PLATFORM.r; gx < PLATFORM.r; gx += 0.32) {
    for (let gz = PLATFORM.z - PLATFORM.r; gz < PLATFORM.z + PLATFORM.r; gz += 0.32) {
      const x = gx + (random() - 0.5) * 0.3, z = gz + (random() - 0.5) * 0.3;
      // On the top, not in the notch the stair comes up through, nor on
      // the pool, paving, column or east notch.
      if (!onTop(x, z, 0.02)) continue;
      // Thinned out over the clover, gone in its middle.
      if (patches.some(({ cx, cz, radius }) => Math.hypot(x - cx, z - cz) < radius * (0.55 + 0.4 * random()))) continue;
      const lush = drift[2](x, z);
      const tall = 0.2 + Math.max(0, lush) * 0.3 + random() * 0.12;
      sward.push(place(x, z, tall, tall * (1.6 + random() * 0.6)));
      swardTint.push(tint(x, z));
    }
  }
  // The flowers, in tight clumps: about as many as before, but gathered.
  // A clump's kind is set by where it falls (two fields taken together by
  // their angle, so the four kinds share the ground evenly), so clumps of a
  // kind sit near each other in loose drifts; its flowers crowd its middle.
  // Broad-bladed tufts, darker, gathered into clumps of their own the same
  // way, any of them a little apart from the rest.
  for (let grown = 0; grown < meadowLook.tufts;) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * PLATFORM.r, cx = Math.cos(a) * d, cz = PLATFORM.z + Math.sin(a) * d;
    if (!onTop(cx, cz)) continue;
    const count = 5 + Math.floor(random() * 12), radius = 0.2 + Math.sqrt(count) * 0.12;
    for (let k = 0; k < count; k++) {
      const b = random() * Math.PI * 2, r = radius * random() ** 0.8, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r;
      if (!onTop(x, z)) continue;
      const t = 0.35 + random() * 0.3;
      tufts.push(place(x, z, t, t * (0.8 + random() * 0.4)));
      tuftTint.push(tint(x, z).multiplyScalar(0.78));
      grown++;
    }
  }
  // Clover in low mats, spreading in patches where it's crowded out the
  // grass.
  for (const { cx, cz, radius, count } of patches) {
    for (let k = 0; k < count; k++) {
      const b = random() * Math.PI * 2, r = radius * random() ** 0.6, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r;
      if (!onTop(x, z)) continue;
      const w = 0.45 + random() * 0.3;
      clover.push(place(x, z, 0.2 + random() * 0.08, w));
      // A cooler, deeper green than the grass round it.
      cloverTint.push(tint(x, z).multiply(new THREE.Color(0.9, 1.0, 1.0)));
    }
  }
  let planted = 0;
  while (planted < meadowLook.flowers) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * PLATFORM.r, cx = Math.cos(a) * d, cz = PLATFORM.z + Math.sin(a) * d;
    if (!onTop(cx, cz)) continue;
    const f = drift[0](cx, cz), g = drift[1](cx, cz), kind = Math.floor((Math.atan2(g, f) + Math.PI) / (Math.PI / 2)) % 4;
    // Big clumps deep in a drift, small ones at its edges.
    const deep = THREE.MathUtils.smoothstep(Math.hypot(f, g), 0.2, 1.1);
    const count = Math.round((4 + random() * 8) * (0.5 + deep * 1.5) * meadowLook.clump), radius = 0.25 + Math.sqrt(count) * 0.11;
    for (let k = 0; k < count; k++) {
      // Packed toward the middle.
      const b = random() * Math.PI * 2, r = radius * random() ** 0.8, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r;
      if (!onTop(x, z)) continue;
      const h = [0.5, 0.5, 0.62, 0.42][kind] * (0.8 + random() * 0.4);
      flowers[kind].push(place(x, z, h, h));
      flowerTint[kind].push(new THREE.Color().setScalar(0.92 + random() * 0.08));
      planted++;
    }
  }

  // A fringe of tufts where the mower never reached: thick along the plinth's
  // foot and in ragged runs round the rim, hiding where the grass meets stone.
  const fringe = (x: number, z: number, t: number) => {
    tufts.push(place(x, z, t, t * (0.9 + random() * 0.4)));
    tuftTint.push(tint(x, z).multiplyScalar(0.8));
  };
  {
    const { x: cx, z: cz, plinth } = PLATFORM_COLUMN, h = plinth / 2;
    for (let along = 0; along < plinth * 4; along += 0.1 + random() * 0.1) {
      const side = Math.floor(along / plinth), u = along % plinth - h, out = h + 0.02 + random() * 0.12;
      const [x, z] = [[u, -out], [out, u], [-u, out], [-out, -u]][side];
      if (onTop(cx + x, cz + z)) fringe(cx + x, cz + z, 0.4 + random() * 0.3);
    }
  }
  // Round the rim, and round the stair's cut, the grass grows a little way
  // over the edge, as in the film: a soft lip leaning out, and here and
  // there a few blades spilling down the stone. Each tilted out about the
  // edge, away from the grass, and kept the meadow's own green.
  const drape: THREE.Matrix4[] = [], drapeTint: THREE.Color[] = [];
  const hang = (x: number, z: number, ox: number, oz: number, lean: number, tall: number) => {
    // Only where there's grass behind it: not over the notch.
    if (!onTop(x - ox * 0.3, z - oz * 0.3, 0.02) || onPlatformFeature(x, z, 0.05)) return;
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(oz, 0, -ox), lean);
    const turn = new THREE.Quaternion().setFromAxisAngle(up, random() * Math.PI * 2);
    drape.push(new THREE.Matrix4().compose(new THREE.Vector3(x, PLATFORM_TOP - 0.01, z), tilt.multiply(turn), new THREE.Vector3(tall * 1.4, tall, tall * 1.4)));
    drapeTint.push(tint(x, z).multiplyScalar(1.05));
  };
  // Along an edge, given each point on it and the way out: the lip all
  // along, the spill only in runs.
  const edge = (at: (u: number) => [number, number, number, number], length: number) => {
    for (let u = 0; u < length; u += 0.14 + random() * 0.1) {
      const [x, z, ox, oz] = at(u), inset = 0.03 + random() * 0.08;
      hang(x - ox * inset, z - oz * inset, ox, oz, 0.35 + random() * 0.3, 0.22 + random() * 0.12);
      const run = Math.sin(x * 1.7 + z * 0.9) + Math.sin(x * 0.6 - z * 1.3);
      if (run > 0.3 && random() < 0.6) hang(x - ox * 0.02, z - oz * 0.02, ox, oz, 0.9 + random() * 0.35, 0.16 + random() * 0.14);
    }
  };
  edge(u => { const a = u / PLATFORM.r; return [Math.cos(a) * PLATFORM.r, PLATFORM.z + Math.sin(a) * PLATFORM.r, Math.cos(a), Math.sin(a)]; }, Math.PI * 2 * PLATFORM.r);
  // The stair's two side walls, facing in over the steps.
  const stairEnd = PLATFORM.z + Math.sqrt(PLATFORM.r ** 2 - 2.5 ** 2);
  for (const side of [-1, 1]) edge(u => [side * 2.5, -27.3 + u, -side, 0], stairEnd - -27.3);
  // And over the top step's riser, where the stair comes up onto the grass.
  edge(u => [-2.5 + u, -27.3, 0, 1], 5);

  // The robot's flat shadow: drawn after it, and left out where it lies, as
  // the lawn's grass is (foliage.ts, robot.ts).
  const add = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, placed: THREE.Matrix4[], tints: THREE.Color[]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, placed.length);
    placed.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, tints[i]); });
    mesh.receiveShadow = true;
    mesh.userData.unreflected = true;
    mesh.renderOrder = DRAWN.grass;
    Object.assign(material, { stencilWrite: true, stencilWriteMask: 0, stencilRef: SHADOW_STENCIL, stencilFunc: THREE.NotEqualStencilFunc });
    scene.add(mesh);
    return mesh;
  };
  const leafy = (map: THREE.Texture) => drifting(swaying(bothSidesAlike(painted(palette.grass, { map, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })), SWAY.grass), DRIFTS.meadow);
  add(tuftGeometry(true), leafy(swardTexture(173)), sward, swardTint);
  add(tuftGeometry(), leafy(tuftTexture(179, false)), tufts, tuftTint);
  add(tuftGeometry(true), leafy(swardTexture(173)), drape, drapeTint);
  add(cloverGeometry(), leafy(cloverTexture(181)), clover, cloverTint);
  const petals = swaying(bothSidesAlike(painted([0xe8e6de, 0x9a9cc8], { map: flowerAtlas(), alphaTest: 0.5, side: THREE.DoubleSide })), SWAY.grass);
  // The same flowers down in the garden: only white ones, to start.
  for (const { x, z } of gardenFlowers) {
    const h = 0.5 * (0.8 + random() * 0.4);
    flowers[0].push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(up, random() * Math.PI * 2), new THREE.Vector3(h, h, h)));
    flowerTint[0].push(new THREE.Color().setScalar(0.92 + random() * 0.08));
  }
  KINDS.forEach((_, i) => add(flowerGeometry(i), petals, flowers[i], flowerTint[i]).castShadow = false);
  return { grass: sward.length + tufts.length + clover.length, flowers: flowers.map(f => f.length) };
}
