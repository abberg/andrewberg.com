import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { painted, palette } from './look';
import { createGrowth, wander, type Column } from './growth';
import { textures, WINDOW, windowTexture } from './masonry';

// Step 7: the city's base behind the south moat, built as in the reference
// looking south: tiers of big pale blocks, each rounding over at the top and
// dropping straight down, stepping back under a sloping band of rust tiles, small arched
// windows scattered over them, a round bastion beside the arch and a little
// domed turret. Only the colliders at the base are solid.

// The city's front, where its lowest tier meets the moat, following the curve
// of the garden.
export const cityFront = (x: number) => 52.5 + x * x / 292;
// The arch the main path climbs into: its opening, the stair up to it from
// the grass landing, its floor and the sealed door at the back.
// Where the giant tree stands over the castle: how far south, and the
// height its trunk and canopy are reckoned from.
export const CROWN = { z: 160, top: 59 };
export const ARCH = { half: 3.7, stair: 50.4, front: 52.5, back: 61.2, floor: 3.6, height: 10 };

// A tier's face from y0 to y1, as [out, y] points: out is how far back into
// the city from the front. It drops straight from the front up to halfway,
// then rounds over and back by lean towards the top.
const drum = (out: number, y0: number, y1: number, lean: number, steps = 14) =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = Math.max(0, (t - 0.45) / 0.55);
    return [out + lean * (1 - Math.sqrt(1 - u * u)), y0 + (y1 - y0) * t];
  });
// Where a drum's face is at a height: how far back, and how far back it goes
// per metre up.
function drumAt(out: number, y0: number, y1: number, lean: number, y: number) {
  const at = (y: number) => { const u = Math.max(0, Math.min(0.999, ((y - y0) / (y1 - y0) - 0.45) / 0.55)); return out + lean * (1 - Math.sqrt(1 - u * u)); };
  return [at(y), (at(y + 0.05) - at(y - 0.05)) / 0.1];
}
// A band of roof from one tier back up to the foot of the next, rounded over.
const roof = (out0: number, y0: number, out1: number, y1: number, steps = 6) =>
  Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps; return [out0 + (out1 - out0) * t, y0 + (y1 - y0) * Math.sin(t * Math.PI / 2)]; });

// A surface from a row of columns along some line and a cross-section swept
// along it. place() puts a point of the section at a column; along gives each
// column's distance along the line, in metres, for the texture. Quads can be
// left out, for openings.
function surface(along: number[], section: number[][], place: (column: number, out: number, y: number) => THREE.Vector3, metres: number,
  skip?: (x: number, y: number, z: number) => boolean) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  // Distance up the section, so the bulge doesn't stretch the blocks.
  const up = [0];
  for (let j = 1; j < section.length; j++) up.push(up[j - 1] + Math.hypot(section[j][0] - section[j - 1][0], section[j][1] - section[j - 1][1]));
  along.forEach((u, i) => section.forEach(([out, y], j) => {
    positions.push(...place(i, out, y).toArray());
    uvs.push(u / metres, (up[j] + section[0][1]) / metres);
  }));
  const rows = section.length, at = (i: number, j: number) => i * rows + j;
  for (let i = 0; i < along.length - 1; i++) for (let j = 0; j < rows - 1; j++) {
    if (skip) {
      const x = (positions[at(i, j) * 3] + positions[at(i + 1, j) * 3]) / 2, z = (positions[at(i, j) * 3 + 2] + positions[at(i + 1, j) * 3 + 2]) / 2;
      if (skip(x, section[j][1], z)) continue;
    }
    // Facing out of the city.
    indices.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildCity(world: RAPIER.World, scene: THREE.Scene) {
  const city = painted(palette.stone, { map: textures.city.map() });
  const tiles = painted(palette.rust, { map: textures.tiles.map() });
  // The arch's stone, darkening into the passage by its vertex colours.
  const portalStone = painted(palette.stone, { map: textures.city.map(), vertexColors: true }, textures.city.metres);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));

  // The arch's opening, and the gatehouse it is set in: a plain block of
  // wall between the front towers, a little taller than the arch.
  const archTop = ARCH.floor + ARCH.height, surroundTop = 21;

  // Windows, as one instanced quad each, set into the face where it is at
  // their height and tilted with it.
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const windows: THREE.Matrix4[] = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const setWindow = (at: THREE.Vector3, facing: THREE.Vector3) => {
    const up = UP.clone().addScaledVector(facing, -facing.dot(UP)).normalize(), right = up.clone().cross(facing);
    windows.push(new THREE.Matrix4().makeBasis(right, up, facing).setPosition(at.addScaledVector(facing, 0.04)));
  };
  // A row along a floor: spots every spacing from one end to the other, every
  // other row shifted half a spot.
  const row = (from: number, to: number, spacing: number, keep: number, shift: number, put: (s: number) => void) => {
    for (let s = from + spacing * (0.5 + shift); s < to; s += spacing) if (random() < keep) put(s);
  };
  // The same round a tower, at radius r (and leaning in) from its centre.
  const ringOfWindows = (cx: number, cz: number, [r, y0, y1, lean]: number[], rows: number[][]) => rows.forEach(([y, spacing, keep], k) => {
    const [back, slope] = drumAt(-r, y0, y1, lean, y), radius = -back;
    row(0, Math.PI * 2 * radius, spacing, keep, k % 2 ? 0.5 : 0, s => {
      const a = s / radius, out = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      setWindow(new THREE.Vector3(cx, y, cz).addScaledVector(out, radius), out.clone().addScaledVector(UP, slope).normalize());
    });
  });

  // A round tower drum, as [radius, y] points, centred on (cx, cz).
  const round = (cx: number, cz: number, section: number[][], metres: number, segments = 72, skip?: (x: number, y: number, z: number) => boolean) => {
    const reference = section[0][0];
    const turns = Math.max(1, Math.round(Math.PI * 2 * reference / metres));
    const angles = Array.from({ length: segments + 1 }, (_, i) => i / segments * Math.PI * 2);
    return surface(angles.map(a => a / (Math.PI * 2) * turns * metres), section,
      (i, r, y) => new THREE.Vector3(cx + Math.sin(angles[i]) * r, y, cz - Math.cos(angles[i]) * r), metres, skip);
  };
  // Radius out instead of in.
  const bulging = (r: number, y0: number, y1: number, lean: number) => drum(-r, y0, y1, lean).map(([out, y]) => [-out, y]);

  // The bastion, west of the arch, in three tiers under a rust dome.
  // Its foot is an arcade (below), as in the reference, round the arc of
  // it that stands clear of the wall behind.
  // Pushed forward into the moat, to just behind the lawn's edge, so it
  // bulges well out of the wall as in the reference.
  const B = { x: -24, z: 62, r: 14.5 };
  const foot = bulging(B.r, -0.3, 20, 2);
  let reach = 0;
  while (reach < Math.PI / 2 && [-1, 1].every(side => {
    const x = B.x + Math.sin(side * reach) * B.r, z = B.z - Math.cos(reach) * B.r;
    return z < cityFront(x) - 0.5;
  })) reach += 0.01;
  const ARCADE = { reach, top: foot.find(([, y]) => y >= 6.8)![1] };
  add(round(B.x, B.z, foot, textures.city.metres, 72, (x, y, z) =>
    z < B.z && Math.abs(Math.asin(THREE.MathUtils.clamp((x - B.x) / B.r, -1, 1))) < ARCADE.reach && y < ARCADE.top), city);
  add(round(B.x, B.z, roof(12.5, 20, 10.5, 24.5), textures.tiles.metres), tiles);
  add(round(B.x, B.z, bulging(10.5, 24.5, 38, 1.5), textures.city.metres), city);
  add(round(B.x, B.z, roof(9, 38, 7, 42), textures.tiles.metres), tiles);
  add(round(B.x, B.z, bulging(7, 42, 47, 0.6), textures.city.metres), city);
  add(round(B.x, B.z, Array.from({ length: 9 }, (_, i) => { const a = i / 8 * Math.PI / 2; return [6.6 * Math.cos(a) + 0.01, 47 + 5 * Math.sin(a)]; }), textures.tiles.metres), tiles);
  ringOfWindows(B.x, B.z, [14.5, -0.3, 20, 2], [[14.5, 7.5, 0.8]]);
  ringOfWindows(B.x, B.z, [10.5, 24.5, 38, 1.5], [[28, 6.5, 0.85], [33.5, 6.5, 0.85]]);
  ringOfWindows(B.x, B.z, [7, 42, 47, 0.6], [[44, 4, 0.9]]);
  world.createCollider(RAPIER.ColliderDesc.cylinder(11.5, 14.5).setTranslation(B.x, 11.2, B.z));

  // The castle, as in the far view: a crowd of round white towers rising
  // straight from the moat under red-brown domes, packed so close that the
  // front row makes the castle's face, row after row behind getting taller
  // towards the middle, all under the one giant tree (foliage.ts). The arch's
  // gatehouse and the bastion stand in the front row.
  const towers: { x: number, z: number, r: number, depth: number, body: number[][], dome: number[][] }[] = [];
  {
    let s = 5003;
    const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const taken: [number, number, number][] = [[B.x, B.z, B.r], [0, ARCH.front + 5, 9.5]];
    // A row along the front at a depth behind it, each tower just touching
    // or overlapping the one before, so there are no gaps to see through.
    for (const [depth, from, to] of [[0, -95, 95], [12, -90, 90], [25, -84, 84], [39, -76, 76], [54, -66, 66], [70, -54, 54], [86, -40, 40]]) {
      for (let x = from + random() * 4; x < to;) {
        const r = depth ? 5 + random() ** 1.3 * 7 : 6.5 + random() * 5;
        const inward = new THREE.Vector3(-2 * x / 292, 0, 1).normalize();
        const at = new THREE.Vector3(x, 0, cityFront(x)).addScaledVector(inward, depth + r + (random() - 0.3) * 2.5);
        // In the front row nothing in the moat, nor over the gatehouse and
        // bastion; further back overlapping is fine.
        if (!taken.some(([tx, tz, tr]) => Math.hypot(at.x - tx, at.z - tz) < (tr + r) * (depth ? 0.55 : 0.9))) {
          const tall = 24 + depth * 0.5 + random() * 16 - Math.abs(x) * 0.12 + (depth ? 0 : -4);
          const body = bulging(r, -0.3, tall, 0.4 + random() * 0.6), [[r0], , [r1, t1]] = [body[0], 0, body[body.length - 1]];
          const rise = r1 * (0.6 + random() * 0.5);
          const dome = Array.from({ length: 8 }, (_, k) => { const u = k / 7 * Math.PI / 2; return [(r1 + 0.4) * Math.cos(u) + 0.01, t1 - 0.3 + rise * Math.sin(u)]; });
          towers.push({ x: at.x, z: at.z, r: r0, depth, body, dome });
          taken.push([at.x, at.z, r]);
          add(round(at.x, at.z, body, textures.city.metres, 40), city);
          add(round(at.x, at.z, dome, textures.tiles.metres, 40), tiles);
          // Now and then a narrower stage on top, under its own dome.
          if (random() < 0.25 && depth > 0) {
            const r2 = r1 * 0.55, upper = bulging(r2, t1 - 1, t1 + 6 + random() * 8, 0.3), [, t2] = upper[upper.length - 1];
            add(round(at.x, at.z, upper, textures.city.metres, 32), city);
            add(round(at.x, at.z, Array.from({ length: 7 }, (_, k) => { const u = k / 6 * Math.PI / 2; return [(r2 + 0.3) * Math.cos(u) + 0.01, t2 - 0.2 + r2 * 0.9 * Math.sin(u)]; }), textures.tiles.metres, 32), tiles);
            ringOfWindows(at.x, at.z, [r2, t1 - 1, t2, 0.3], [[t1 + 2.5, 3, 0.8]]);
          }
          // Floors of windows: a sparse one or two low down, more higher up.
          const rows: number[][] = [];
          for (let y = 5 + random() * 3; y < t1 - 2.5; y += 4.3) rows.push([y, 3.2 + random() * 1.5, y < 18 ? 0.25 : 0.5 + random() * 0.35]);
          ringOfWindows(at.x, at.z, [r, -0.3, tall, 0.5], rows);
          // The front row is solid at the foot.
          if (!depth) world.createCollider(RAPIER.ColliderDesc.cylinder(15, r0).setTranslation(at.x, 14.7, at.z));
        }
        x += r * (depth ? 1.5 : 1.7) * (0.85 + random() * 0.3);
      }
    }
  }

  // The gatehouse round the arch: a block of wall flush with the arch's
  // surround, reaching back to the towers, under a sloping band of roof.
  {
    const width = 9.5, back = ARCH.front + 14;
    add(new THREE.BoxGeometry(width * 2, 0.6, back - ARCH.front).translate(0, surroundTop + 0.3, (ARCH.front + back) / 2), tiles);
  }

  const glass = new THREE.InstancedMesh(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height),
    painted(palette.stone, { map: windowTexture(), alphaTest: 0.5 }), windows.length);
  windows.forEach((matrix, i) => glass.setMatrixAt(i, matrix));
  glass.receiveShadow = true;
  scene.add(glass);

  // The arch: a plain pointed opening in a surround standing just proud of
  // the tier, and the passage through it to the sealed door. Two arcs meet at
  // the crown, each centred a little past the middle.
  const z0 = ARCH.front - 0.15, depth = ARCH.back - z0, outer = 9.5;
  const c = 1.6, R = ARCH.half + c, rise = Math.sqrt(R * R - c * c), spring = archTop - rise;
  const shape = new THREE.Shape()
    .moveTo(-outer, -0.3).lineTo(-ARCH.half, -0.3).lineTo(-ARCH.half, spring)
    .absarc(c, spring, R, Math.PI, Math.atan2(rise, -c), true)
    .absarc(-c, spring, R, Math.atan2(rise, c), 0, true)
    .lineTo(ARCH.half, -0.3).lineTo(outer, -0.3).lineTo(outer, surroundTop).lineTo(-outer, surroundTop).closePath();
  const portal = new THREE.ExtrudeGeometry(shape, { depth, steps: 12, bevelEnabled: false, curveSegments: 24 });
  portal.translate(0, 0, z0);
  {
    const p = portal.getAttribute('position'), colours: number[] = [];
    for (let k = 0; k < p.count; k++) {
      const inside = Math.abs(p.getX(k)) < ARCH.half + 0.01 && p.getY(k) < archTop + 0.01;
      const dark = inside ? 1 - 0.85 * THREE.MathUtils.smoothstep(p.getZ(k) - z0, 0.5, 7) : 1;
      colours.push(dark, dark, dark);
    }
    portal.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  }
  add(portal, portalStone);
  for (const side of [-1, 1]) solid(side * (ARCH.half + outer) / 2, (surroundTop - 0.3) / 2, (z0 + ARCH.back) / 2, (outer - ARCH.half) / 2, (surroundTop + 0.3) / 2, depth / 2);

  // The arcade round the bastion's foot, as in the reference: a row of
  // round arches over the moat, on a plinth with a ledge, opening into a
  // gallery with a second row of arches further back, set half a bay over so
  // a column stands in the middle of each opening. Each bay is square to the
  // curve, and everything fades dark the deeper it is.
  {
    const plinth = 1.2, half = 1.6, spring = 4.6, front = 0.9, inner = 2.6, deep = 4.5;
    const ceiling = spring + half + 0.35;
    const bays = Math.floor(2 * ARCADE.reach * B.r / 4.3), turn = 2 * ARCADE.reach / bays;
    // Each bay as wide as the chord across its share of the curve.
    const bay = 2 * B.r * Math.sin(turn / 2);
    const arch = (x: number, half: number) => new THREE.Path().moveTo(x - half, plinth).lineTo(x + half, plinth).lineTo(x + half, spring)
      .absarc(x, spring, half, 0, Math.PI, false).lineTo(x - half, plinth);
    const wall = (bottom: number, top: number, holes: THREE.Path[], depth: number, at: number) => {
      const shape = new THREE.Shape().moveTo(-bay / 2 - 0.05, bottom).lineTo(bay / 2 + 0.05, bottom).lineTo(bay / 2 + 0.05, top).lineTo(-bay / 2 - 0.05, top).closePath();
      shape.holes = holes;
      return new THREE.ExtrudeGeometry(shape, { depth, steps: 2, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, at);
    };
    const block = (width: number, height: number, depth: number, x: number, y: number, z: number) =>
      new THREE.BoxGeometry(width, height, depth).translate(x, y, z).toNonIndexed();
    const back = new THREE.PlaneGeometry(bay + 0.1, ceiling - plinth).rotateY(Math.PI).translate(0, (plinth + ceiling) / 2, deep);
    const parts = [
      wall(-0.3, ARCADE.top, [arch(0, half)], front, 0),
      // The inner arches, half a bay over.
      wall(plinth, ceiling, [arch(-bay / 4, bay / 4 - 0.35), arch(bay / 4, bay / 4 - 0.35)], 0.5, inner),
      // The gallery's floor and ceiling.
      block(bay + 0.1, plinth + 0.3, deep - front, 0, (plinth - 0.3) / 2, (front + deep) / 2),
      block(bay + 0.1, ARCADE.top - ceiling, deep - front, 0, (ceiling + ARCADE.top) / 2, (front + deep) / 2),
      back,
      // The ledge along the plinth.
      block(bay + 0.1, 0.25, 0.5, 0, plinth - 0.125, -0.2),
    ];
    // Darker with depth. Vertex colours are linear: squared, so the fade
    // reads even.
    const shade = (geometry: THREE.BufferGeometry) => {
      const p = geometry.getAttribute('position'), colours: number[] = [];
      for (let k = 0; k < p.count; k++) {
        const dark = (1 - 0.8 * THREE.MathUtils.smoothstep(p.getZ(k), 0.2, deep * 0.9)) ** 2;
        colours.push(dark, dark, dark);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
      return geometry;
    };
    parts.forEach(shade);
    // Walls closing the gallery's ends.
    const end = (side: number) => shade(block(0.3, ceiling - plinth, deep - front, side * bay / 2, (plinth + ceiling) / 2, (front + deep) / 2));
    for (let i = 0; i < bays; i++) {
      const a = -ARCADE.reach + turn * (i + 0.5), out = B.r * Math.cos(turn / 2) + 0.03;
      // Baked into place, so the blocks run on across the bays.
      const place = new THREE.Matrix4().makeRotationY(-a).setPosition(B.x + Math.sin(a) * out, 0, B.z - Math.cos(a) * out);
      const these = [...parts, ...(i === 0 ? [end(-1)] : []), ...(i === bays - 1 ? [end(1)] : [])];
      for (const part of these) add(part.clone().applyMatrix4(place), portalStone);
    }
  }

  // Moss on the bands and ivy hanging from them (growth.ts). Each band's
  // path runs from the foot of the tier above, down the band, over its lip
  // and down the tier below.
  const growth = createGrowth();
  const reversed = (points: number[][]) => [...points].reverse();
  let bandSeed = 1;
  // One band over a row of columns. roofSection and below as [out, y],
  // bottom first, as roof() and drum() give them. ivyReach is how far down
  // the curtains can hang at most; more (to clear) where full() says so.
  const band = (columns: Column[], along: number[], at: number[], roofSection: number[][], below: number[][],
    { moss = 1, ivyReach = 10, full = (_: number): number => 0, floor = (_: number): number => -Infinity } = {}) => {
    const path = [...reversed(roofSection), ...reversed(below).slice(1)];
    let roofLength = 0;
    roofSection.slice(1).forEach(([o, y], k) => roofLength += Math.hypot(o - roofSection[k][0], y - roofSection[k][1]));
    const patches = wander(bandSeed++, 14), curtains = wander(bandSeed++, 6), clumps = wander(bandSeed++, 3);
    let s = bandSeed * 101;
    const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // How much of the band the moss covers, by column: patchy, now and then
    // all of it and over the lip.
    const cover = at.map(x => moss * (0.5 + 0.7 * patches(x)));
    const mossLength = cover.map(c => c < 0.08 ? 0 : Math.min(c, 1) * roofLength + Math.max(0, c - 0.95) * 18 + (random() - 0.5) * 0.4);
    // Ivy in curtains, longer under heavy moss, the foot ragged.
    const ivyLength = at.map((x, i) => {
      const hang = Math.max(0, curtains(x) * 1.4 - 0.25) * ivyReach * (cover[i] > 0.95 ? 1.6 : 1);
      return Math.max(hang, full(x)) * (0.93 + random() * 0.07);
    });
    scene.add(growth.drape('moss', columns, along, path, at.map(() => 0), mossLength, (_, d) => 0.06 + 0.12 * Math.max(0, clumps(d + _ * 0.37))));
    scene.add(growth.drape('ivy', columns, along, path, at.map(() => roofLength - 0.4), ivyLength,
      (i, d) => 0.12 + 0.2 * Math.max(0, clumps(at[i] * 1.3 + d * 0.5)) + (full(at[i]) > 0 ? 0.2 : 0), floor ? i => floor(at[i]) : undefined));
  };

  // Down the gatehouse's face, which is flat, every half metre. Round the
  // arch the ivy comes right down, raggedly, short of the opening itself.
  const xs = Array.from({ length: 39 }, (_, i) => -9.5 + i * 0.5);
  const gate = xs.map(x => (out: number, y: number) => new THREE.Vector3(x, y, z0 + out));
  const archIvy = wander(99, 2.5);
  band(gate, xs.map(x => x + 9.5), xs, roof(0, surroundTop, 6, surroundTop + 0.6), [[0, -0.3], [0, surroundTop]], {
    ivyReach: 9,
    // A rounded mass, to the ground beside the arch.
    full: x => 32 * (1 - THREE.MathUtils.smoothstep(Math.abs(x) + 3 * archIvy(x), 7, 19)) ** 1.5,
    // Over the opening it stops a hand's width outside the arch, so a ring
    // of stone shows round it, and it comes down the jambs beside it.
    floor: x => {
      const ring = R + 0.8, reach = Math.abs(x) + c;
      return reach < ring ? spring + Math.sqrt(ring * ring - reach * reach) : -Infinity;
    },
  });
  // Moss on the near towers' domes and ivy hanging from under them, round
  // the side that faces the garden. Sections are by radius, so out is taken
  // as the radius turned inside out.
  const inside = (points: number[][]) => points.map(([r, y]) => [-r, y]);
  for (const { x, z, r, depth, body, dome } of towers) {
    if (depth > 12) continue;
    const angles = Array.from({ length: 41 }, (_, i) => -1.6 + i * 3.2 / 40);
    const ring = angles.map(a => (out: number, y: number) => new THREE.Vector3(x + Math.sin(a) * -out, y, z - Math.cos(a) * -out));
    const arcAlong = angles.map(a => (a + 1.6) * r);
    band(ring, arcAlong, arcAlong.map(d => d + x * 3), inside(dome), inside(body), { moss: 0.4, ivyReach: depth ? 6 : 9 });
  }

  // Round the front of the bastion. Its sections are by radius, so out is
  // taken as the radius turned inside out.
  {
    const angles = Array.from({ length: 121 }, (_, i) => -1.7 + i * 3.4 / 120);
    const ring = angles.map(a => (out: number, y: number) => new THREE.Vector3(B.x + Math.sin(a) * -out, y, B.z - Math.cos(a) * -out));
    const arcAlong = angles.map(a => (a + 1.7) * B.r);
    band(ring, arcAlong, arcAlong, inside(roof(12.5, 20, 10.5, 24.5)), inside(foot), {
      ivyReach: 7,
      floor: d => Math.abs(d / B.r - 1.7) < ARCADE.reach + 0.05 ? ARCADE.top + 0.5 : -Infinity,
    });
    band(ring, arcAlong, arcAlong, inside(roof(9, 38, 7, 42)), inside(bulging(10.5, 24.5, 38, 1.5)), { ivyReach: 6 });
  }
  growth.finish(scene);
}
