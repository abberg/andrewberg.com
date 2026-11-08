import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { drowned, painted, palette } from './look';
import { textures, WINDOW, windowTexture } from './masonry';
import { blockMaterial, shifted } from './columns';

// Step 7: the castle behind the south moat. For now just the great tower in
// the middle of the front, as in the reference: tiers of big pale blocks,
// each rounding over at the top and stepping back under a sloping band of
// rust tiles, small arched windows scattered over them and the arch at its
// foot (the bands bare of moss). (The towers round it and the ivy are gone, to
// be rebuilt.) Only the colliders at the base are solid.

// The city's front, where its lowest tier meets the moat, following the curve
// of the garden.
export const cityFront = (x: number) => 52.5 + x * x / 292;
// Where the giant tree stands over the castle: how far south, and the
// height its trunk and canopy are reckoned from.
export const CROWN = { z: 170, top: 39 };
// The arch the main path climbs into: its opening (as wide as the path,
// its peak half a metre over the robot's head), the stair up to it from the
// grass landing (six steps), its floor and the sealed door at the back.
export const ARCH = { half: 2.5, stair: 50.4, front: 52.5, back: 61.2, steps: 6, floor: 1.8, height: 4.5 };

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

// The castle's main shapes, filled in by buildCity, for the growth over it
// (mantle.ts): the great tower's radius at a height, the colonnade drum, the
// slim tower on its roof and the little turret.
export const CASTLE = {
  gate: { z: 0, foot: 0, radiusAt: (_h: number) => 0 },
  // piers: the angles round the drum of the arcade's piers between its bays
  // (as round() takes them), each pierHalf (m) either side.
  drum: { cx: 0, cz: 0, r: 0, top: 0, piers: [] as number[], pierHalf: 0 },
  slim: { x: 0, z: 0, r: 0 },
  turret: { x: 0, z: 0, r: 0, lip: 0 },
  // Every window's middle and size (a share of the full window).
  windows: [] as { at: THREE.Vector3, size: number }[],
  // The arch's opening height a distance across from its middle, grown
  // outwards by some metres (its lining is 0.8 m wide).
  archAt: (_x: number, _grow = 0) => -Infinity,
  // The turret hung in the seam between the great tower and the east tower:
  // its middle, radius, foot (the lip under it), the top of its wall, its
  // dome's rise, the cone's tip under it, the seam's line at a height and
  // the east tower (middle, radius at a height and its terracotta band's
  // foot and top).
  hung: {
    x: 0, z: 0, r: 0, foot: 0, lip: 0, rise: 0, tipY: 0, tip: [0, 0],
    seamAt: (_y: number) => [0, 0],
    east: { x: 0, z: 0, radiusAt: (_y: number) => 0, bandLow: 0, bandHigh: 0 },
  },
};

export function buildCity(world: RAPIER.World, scene: THREE.Scene) {
  CASTLE.windows = [];
  const city = painted(palette.stone, { map: textures.city.map() });
  // The towers' feet go on down into the flooded moats.
  const cityDrowned = drowned(painted(palette.stone, { map: textures.city.map() }));
  const sunk = (cx: number, cz: number, r: number, segments: number) =>
    add(round(cx, cz, [[r, -15], [r, -7], [r, -0.3]], textures.city.metres, segments), cityDrowned);
  const tiles = painted(palette.rust, { map: textures.tiles.map() });
  // The arch's stone, the blocks' white marble (columns.ts), darkening into
  // the passage by its vertex colours.
  const portalStone = blockMaterial({ vertexColors: true });
  // The colonnade's arcade: the wall's blocks, darkening into its gallery.
  const arcadeStone = painted(palette.stone, { map: city.map, vertexColors: true });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const solid = (x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));

  // The arch's opening: a plain pointed arch, two arcs meeting at the crown,
  // each centred a little past the middle. archAt is how high the opening
  // is a distance across from its middle.
  const archTop = ARCH.floor + ARCH.height;
  const c = 0.5, R = ARCH.half + c, rise = Math.sqrt(R * R - c * c), spring = archTop - rise;
  const archAt = CASTLE.archAt = (x: number, grow = 0) => Math.abs(x) < ARCH.half + grow ? spring + Math.sqrt((R + grow) ** 2 - (Math.abs(x) + c) ** 2) : -Infinity;
  // The great tower in the middle of the front, the arch at its foot, from
  // Andrew's drawing of its profile (traced at a 26 m base, widened to GATE.r below). Its
  // outline as [radius, height above the foot] going up: the foot leaning
  // in a little, more above, then a sloping band, a tall upper stage, a
  // second sloping band and a low dome. Painted in stretches: wall, bands of
  // tiles (one flat on the lower wall, one over each slope) and the dome.
  // The window rows by their middles' heights.
  const GATE = { r: 32, z: ARCH.front + 32 };
  const GATE_FOOT = -0.3;
  // How high the towers' domes rise, as a share of their radius: one
  // roundness for all of them (the great tower's skylight and the little
  // turrets aside), between the old tall round ones and the low flat ones.
  const DOME_RISE = 0.75;
  // A half-ellipse dome as [radius, y] points, off a wall of radius rim at y.
  const domeOf = (rim: number, y: number, out = 0) => Array.from({ length: 25 }, (_, k) => {
    const t = k / 24 * Math.PI / 2;
    return [Math.max(0.01, (rim + out) * Math.cos(t)), y + rim * DOME_RISE * Math.sin(t)];
  });
  // The drawing as traced at a 26 m base, then widened to the base's
  // radius: the walls keep their heights and slopes, every radius growing by
  // the same, and the dome keeps its arc's shape over the wider top.
  const WIDER = GATE.r - 26;
  const OUTLINE = [[26, 0], [24.39, 14.45], [21.95, 27.2], [18.2, 34.07], [15.87, 53.77], [13.62, 57.86]];
  const DOME = [[13.62, 57.86], [12.57, 58.9], [10.8, 59.8], [8.82, 60.5], [6.5, 61.1], [4.31, 61.6], [2, 61.95], [0.01, 62.1]];
  const STRETCHES: [number, number, 'wall' | 'tiles'][] = [[0, 9, 'wall'], [9, 16.88, 'wall'], [16.88, 20.15, 'tiles'], [20.15, 30.65, 'wall'], [30.65, 34.07, 'tiles'], [34.07, 53.28, 'wall'], [53.28, 57.86, 'tiles']];
  const ROWS = [1.8, 11.7, 21.2, 35.3, 44.6, 49.5];
  {
    const [rim, spring] = DOME[0], grow = (rim + WIDER) / rim;
    for (const point of OUTLINE) point[0] += WIDER;
    for (const point of DOME) { point[0] = point[0] * grow; point[1] = GATE_FOOT + spring + (point[1] - spring) * grow; }
  }
  // The outline's radius at a height, and how much it narrows per metre up.
  const gateAt = (h: number) => {
    let k = 1;
    while (k < OUTLINE.length - 1 && OUTLINE[k][1] < h) k++;
    const [r0, h0] = OUTLINE[k - 1], [r1, h1] = OUTLINE[k], narrows = (r0 - r1) / (h1 - h0);
    return [r0 - narrows * (h - h0), narrows];
  };
  // A stretch of it as [radius, y] points, every half metre or so.
  const gateSection = (from: number, to: number, every = 0.5) => {
    const steps = Math.max(2, Math.ceil((to - from) / every));
    return Array.from({ length: steps + 1 }, (_, i) => { const h = from + (to - from) * i / steps; return [gateAt(h)[0], GATE_FOOT + h]; });
  };

  // Windows, as one instanced quad each, set into the face where it is at
  // their height and tilted with it.
  const windows: THREE.Matrix4[] = [];
  // The little tower's and the hung turret's windows, to their scale.
  const SMALL = 0.75;
  const UP = new THREE.Vector3(0, 1, 0);
  // Smaller (size, a share of the full window) on the little towers.
  const setWindow = (at: THREE.Vector3, facing: THREE.Vector3, size = 1) => {
    const up = UP.clone().addScaledVector(facing, -facing.dot(UP)).normalize(), right = up.clone().cross(facing);
    CASTLE.windows.push({ at: at.clone(), size });
    windows.push(new THREE.Matrix4().makeBasis(right, up, facing).scale(new THREE.Vector3(size, size, 1)).setPosition(at.addScaledVector(facing, 0.04)));
  };
  // A window on the great tower at height h, s metres round from the front
  // centre, leaving the arch and the colonnade clear.
  const towerWindow = (h: number, s: number) => {
    const [radius, slope] = gateAt(h), y = GATE_FOOT + h;
    const a = s / radius, out = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
    if (out.z < 0 && Math.abs(out.x * radius) < ARCH.half + 2.2 && y < archTop + 1.8) return;
    if (Math.hypot(out.x * radius - COLONNADE.cx, GATE.z + out.z * radius - COLONNADE.cz) < COLONNADE.r + 1 && y < COLONNADE.arcade + 1) return;
    setWindow(new THREE.Vector3(0, y, GATE.z).addScaledVector(out, radius), out.clone().addScaledVector(UP, slope).normalize());
  };
  // An even row round the great tower: as near every spacing metres as fits
  // a whole number of times round, so there's no seam, mirrored about the
  // front centre: a spot on it (centred) or two either side of it. Each spot
  // is a window, or a group of them at the offsets given (a pair, say).
  // Or, given count, exactly that many round, so rows at different heights
  // share their columns however much the tower narrows between them.
  const evenRing = (h: number, spacing: number, centred: boolean, offsets = [0], count?: number) => {
    const round = Math.PI * 2 * gateAt(h)[0], n = count ?? Math.max(1, Math.round(round / spacing)), step = round / n;
    for (let k = 0; k < n; k++) for (const o of offsets) towerWindow(h, (k + (centred ? 0 : 0.5)) * step + o);
  };

  // A round tower drum, as [radius, y] points, centred on (cx, cz). Or just
  // the stretch of it from one angle to another, its texture where the
  // whole drum's would be.
  const round = (cx: number, cz: number, section: number[][], metres: number, segments = 72, skip?: (x: number, y: number, z: number) => boolean,
    from = 0, to = Math.PI * 2) => {
    const reference = section[0][0];
    const turns = Math.max(1, Math.round(Math.PI * 2 * reference / metres));
    const angles = Array.from({ length: segments + 1 }, (_, i) => from + i / segments * (to - from));
    return surface(angles.map(a => a / (Math.PI * 2) * turns * metres), section,
      (i, r, y) => new THREE.Vector3(cx + Math.sin(angles[i]) * r, y, cz - Math.cos(angles[i]) * r), metres, skip);
  };
  // The great tower, standing forward in the middle of the front with the
  // arch cut into its foot. Its lowest stretch is finely built (a quarter
  // metre across, 15 cm up) so the opening is cut cleanly, inside the
  // arch's lining.
  // The colonnade beside the tower (below): its radius, middle, and the
  // height of the arcade round its foot. Worked out here so the tower's foot
  // can be cut away where the arcade's gallery runs into it.
  const COLONNADE = (() => {
    const r = GATE.r * 0.75, seam = -4 * ARCH.half - 5;
    const cz = ARCH.front + r, seamZ = GATE.z - Math.sqrt(GATE.r ** 2 - seam ** 2);
    return { r, cz, cx: seam - Math.sqrt(r * r - (seamZ - cz) ** 2), arcade: 6.8 };
  })();
  CASTLE.gate = { z: GATE.z, foot: GATE_FOOT, radiusAt: h => gateAt(h)[0] };
  CASTLE.drum = { cx: COLONNADE.cx, cz: COLONNADE.cz, r: COLONNADE.r, top: GATE_FOOT + STRETCHES[2][0], piers: [], pierHalf: 0 };
  const inColonnade = (x: number, y: number, z: number) => y < COLONNADE.arcade && Math.hypot(x - COLONNADE.cx, z - COLONNADE.cz) < COLONNADE.r - 0.5;
  STRETCHES.forEach(([from, to, paint], i) => add(round(0, GATE.z, gateSection(from, to, i ? 0.5 : 0.15), (paint === 'wall' ? textures.city : textures.tiles).metres,
    i ? 96 : Math.ceil(Math.PI * 2 * GATE.r / 0.25), i ? undefined : (x, y, z) => (z < GATE.z && y + 0.15 < archAt(x, 0.5)) || inColonnade(x, y, z)), paint === 'wall' ? city : tiles));
  // The great tower's roof, from Andrew's detail reference: the dome is one
  // great skylight, dark glass split by ribs running up it, with a raised
  // rim round its foot; round the band of tiles under it, white teardrops
  // standing proud, round at the top and pointing down to the wall.
  {
    const glass = painted([0x4c5f78, 0x232b42], { roughness: 0.5 });
    // The ribs and rim pale, nearly the stone's white.
    const frame = painted([0xd6d3cc, 0x8a8cae]);
    const white = painted(palette.stone);
    // Raised over the old tiled dome: 1.6 times as high at its crown.
    const [rim, foot] = DOME[0], LIFT = 1.6;
    const SKYLIGHT = DOME.map(([r, y]) => [r, foot + (y - foot) * LIFT]);
    add(round(0, GATE.z, SKYLIGHT, 2, 96), glass);
    add(round(0, GATE.z, [[rim - 0.1, foot - 0.1], [rim + 0.45, foot - 0.1], [rim + 0.45, foot + 0.35], [rim - 0.2, foot + 0.55]], 2, 96), frame);
    // The ribs: thin bars over the glass, following its curve.
    const RIBS = 16;
    for (let k = 0; k < RIBS; k++) {
      const a = (k + 0.5) / RIBS * Math.PI * 2, out = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      const points = SKYLIGHT.slice(0, -1).map(([r, y]) => new THREE.Vector3(0, y + 0.08, GATE.z).addScaledVector(out, r + 0.08));
      points.push(new THREE.Vector3(0, SKYLIGHT[SKYLIGHT.length - 1][1] + 0.1, GATE.z));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.16, 6, false), frame);
    }
    // The teardrops, a lathe flattened to a third of its depth, half sunk
    // in the tiles, its point at the foot of the band.
    const W = 0.85, NARROW = 0.68;
    const drop = new THREE.LatheGeometry(Array.from({ length: 25 }, (_, i) => {
      const s = i / 24;
      const r = s <= NARROW ? W * (s / NARROW) ** 1.1 : W * Math.sqrt(Math.max(0, 1 - ((s - NARROW) / (1 - NARROW)) ** 2));
      return new THREE.Vector2(Math.max(0.001, r), s);
    }), 24).scale(1, 1, 0.35);
    drop.computeVertexNormals();
    const [from, to] = STRETCHES[STRETCHES.length - 1], low = from + 0.25, high = to - 0.35;
    const DROPS = 16;
    for (let k = 0; k < DROPS; k++) {
      const a = k / DROPS * Math.PI * 2, out = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
      const bottom = new THREE.Vector3(0, GATE_FOOT + low, GATE.z).addScaledVector(out, gateAt(low)[0]);
      const top = new THREE.Vector3(0, GATE_FOOT + high, GATE.z).addScaledVector(out, gateAt(high)[0]);
      const along = top.clone().sub(bottom), length = along.length();
      const up = along.normalize(), facing = out.clone().addScaledVector(UP, gateAt(low)[1]).normalize(), right = up.clone().cross(facing);
      const place = new THREE.Matrix4().makeBasis(right, up, facing).scale(new THREE.Vector3(1, length, 1)).setPosition(bottom.addScaledVector(facing, 0.05));
      add(drop.clone().applyMatrix4(place), white);
    }
  }
  sunk(0, GATE.z, GATE.r, 72);
  // The colonnade: a single storey, flat topped drum three quarters the
  // tower's width, up to the foot of its first band of tiles, its front in
  // line with the tower's and sunk into it on the right as you face it, the
  // seam three path widths over (west, x negative). Round its foot, wherever
  // it stands clear of the tower, the arcade (from the old bastion): a row of
  // round arches over the moat, on a plinth with a ledge, opening into a
  // gallery with a second row of arches further back, set half a bay over so
  // a column stands in the middle of each opening. Each bay is square to the
  // curve, and everything fades dark the deeper it is.
  {
    const { r, cx, cz } = COLONNADE, top = GATE_FOOT + STRETCHES[2][0], arcadeTop = COLONNADE.arcade;
    const inTower = (x: number, y: number, z: number, margin = 0.4) => Math.hypot(x, z - GATE.z) < gateAt(Math.max(0, y - GATE_FOOT))[0] - margin;
    const plinth = 1.2, half = 1.6, spring = 4.6, front = 0.9, inner = 2.6, deep = 4.5;
    const ceiling = spring + half + 0.35;
    // The arc of the drum the arcade runs round, by angle (as round() takes
    // it): from the seam with the tower round to where it meets the tower
    // again, starting 1.5 m along the drum's face from each seam. Where the
    // gallery runs on into the tower, the tower's foot is cut away for it
    // (above).
    const at = (a: number, out: number) => [cx + Math.sin(a) * out, cz - Math.cos(a) * out];
    const clear = (a: number) => { const [x, z] = at(a, r); return !inTower(x, 0, z, 0); };
    const towards = Math.atan2(-cx, -(GATE.z - cz)), SEAM_GAP = 1.5;
    let a0 = towards, a1 = towards + Math.PI * 2;
    while (!clear(a0) && a0 < a1) a0 += 0.001;
    while (!clear(a1) && a1 > a0) a1 -= 0.001;
    a0 += SEAM_GAP / r;
    a1 -= SEAM_GAP / r;
    const angleOf = (x: number, z: number) => {
      let a = Math.atan2(x - cx, -(z - cz));
      while (a < towards) a += Math.PI * 2;
      return a;
    };
    // The wall over the arcade all the way round, and under it only the
    // stretch the arcade leaves, from its last bay round to its first, so
    // the wall's edges meet the bays' ends exactly with no gap.
    const below: number[][] = [], above: number[][] = [];
    for (let y = GATE_FOOT; y < arcadeTop; y += 0.5) below.push([r, y]);
    below.push([r, arcadeTop]);
    for (let y = arcadeTop; y < top; y += 0.5) above.push([r, y]);
    above.push([r, top]);
    add(round(cx, cz, above, textures.city.metres, 144, inTower), city);
    add(round(cx, cz, below, textures.city.metres, Math.ceil((Math.PI * 2 - (a1 - a0)) / (Math.PI * 2) * 144), inTower, a1, a0 + Math.PI * 2), city);
    add(round(cx, cz, [[r, top], [0.01, top]], textures.city.metres, 144), city);
    sunk(cx, cz, r, 96);
    world.createCollider(RAPIER.ColliderDesc.cylinder((top + 15) / 2, r).setTranslation(cx, (top - 15) / 2, cz));

    const bays = Math.floor((a1 - a0) * r / 4.3), turn = (a1 - a0) / bays;
    // Each bay as wide as the chord across its share of the curve.
    const bay = 2 * r * Math.sin(turn / 2);
    CASTLE.drum.piers = Array.from({ length: bays - 1 }, (_, i) => a0 + turn * (i + 1));
    CASTLE.drum.pierHalf = bay / 2 - half;
    const arch = (x: number, half: number) => new THREE.Path().moveTo(x - half, plinth).lineTo(x + half, plinth).lineTo(x + half, spring)
      .absarc(x, spring, half, 0, Math.PI, false).lineTo(x - half, plinth);
    const wall = (bottom: number, top: number, holes: THREE.Path[], depth: number, at: number) => {
      const shape = new THREE.Shape().moveTo(-bay / 2, bottom).lineTo(bay / 2, bottom).lineTo(bay / 2, top).lineTo(-bay / 2, top).closePath();
      shape.holes = holes;
      return new THREE.ExtrudeGeometry(shape, { depth, steps: 2, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, at);
    };
    const block = (width: number, height: number, depth: number, x: number, y: number, z: number) =>
      new THREE.BoxGeometry(width, height, depth).translate(x, y, z).toNonIndexed();
    const back = new THREE.PlaneGeometry(bay, ceiling - plinth).rotateY(Math.PI).translate(0, (plinth + ceiling) / 2, deep);
    const parts = [
      wall(-0.3, arcadeTop, [arch(0, half)], front, 0),
      // The inner arches, half a bay over.
      wall(plinth, ceiling, [arch(-bay / 4, bay / 4 - 0.35), arch(bay / 4, bay / 4 - 0.35)], 0.5, inner),
      // The gallery's floor and ceiling.
      block(bay, plinth + 0.3, deep - front, 0, (plinth - 0.3) / 2, (front + deep) / 2),
      block(bay, arcadeTop - ceiling, deep - front, 0, (ceiling + arcadeTop) / 2, (front + deep) / 2),
      back,
      // The ledge along the plinth.
      block(bay, 0.25, 0.5, 0, plinth - 0.125, -0.2),
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
    // In the drum's own wall blocks (Andrew), laid on so they run on from
    // the wall round it: across the front by the drum's texture at that
    // angle and height, and each other face from the two directions it
    // runs in (the reveals by depth and height, floors and soffits across
    // and by depth).
    // Each bay is built flat, then cut into small triangles and bent round
    // the drum, its front on the drum's face, so the bays meet each other
    // and the wall either side with no seam or step.
    const metres = textures.city.metres, perTurn = Math.max(1, Math.round(Math.PI * 2 * r / metres)) * metres / (Math.PI * 2);
    const fine = new TessellateModifier(0.5, 8);
    const laid = (geometry: THREE.BufferGeometry, a: number) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      flat.computeVertexNormals();
      const g = fine.modify(flat);
      const p = g.getAttribute('position'), n = g.getAttribute('normal'), uvs: number[] = [];
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k), nx = n.getX(k), ny = n.getY(k), nz = n.getZ(k);
        // Its angle round the drum, and how far round that is on the wall.
        const angle = a + x / (bay / 2) * (turn / 2), along = angle * perTurn;
        const [u, v] = Math.abs(nz) >= Math.abs(nx) && Math.abs(nz) >= Math.abs(ny) ? [along, y] : Math.abs(nx) >= Math.abs(ny) ? [along + z, y] : [along, z];
        uvs.push(u / metres, v / metres);
        // x runs round the drum, z in towards its middle.
        const s = Math.sin(angle), c = Math.cos(angle);
        p.setXYZ(k, cx + s * (r - z), y, cz - c * (r - z));
        n.setXYZ(k, nx * c - nz * s, ny, nx * s + nz * c);
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      return g;
    };
    for (let i = 0; i < bays; i++) {
      const a = a0 + turn * (i + 0.5);
      const these = [...parts, ...(i === 0 ? [end(-1)] : []), ...(i === bays - 1 ? [end(1)] : [])];
      for (const part of these) add(laid(part, a), arcadeStone);
    }
    // The little tower's crown, which the tall tower's lowest windows are
    // set from.
    let littleTop = 0;
    // A little tower on the roof over the second and third arches from the
    // front seam (the arcade runs from the back seam round to the front),
    // as in the reference: a plain round wall tapering in a little as it
    // rises, a ring of small arched windows near its top, and straight on
    // into a tall, bullet shaped rust dome, rounded at its crown.
    {
      const BASE = 3.2, R = 2.8, tall = 5.8, a = a1 - 2 * turn, out = r - BASE - 0.6;
      const tx = cx + Math.sin(a) * out, tz = cz - Math.cos(a) * out, foot = top - 0.2, lip = top + tall;
      const radiusAt = (y: number) => BASE + (R - BASE) * (y - foot) / (lip - foot);
      const wall: number[][] = [];
      for (let y = foot; y < lip; y += 0.5) wall.push([radiusAt(y), y]);
      wall.push([R, lip]);
      add(round(tx, tz, wall, textures.city.metres, 48), city);
      CASTLE.turret = { x: tx, z: tz, r: BASE, lip };
      // Rises straight off the wall and rounds over: half an ellipse,
      // 15% lower than the old bullet (Andrew). The tall tower's windows
      // stay set from the old crown.
      const L = R * 1.5 * 0.85;
      littleTop = lip + R * 1.5;
      add(round(tx, tz, Array.from({ length: 25 }, (_, k) => {
        const t = k / 24 * Math.PI / 2;
        return [Math.max(0.01, R * Math.cos(t)), lip + L * Math.sin(t)];
      }), textures.tiles.metres, 48), tiles);
      const slope = (BASE - R) / (lip - foot), windowAt = lip - 1.6;
      for (let k = 0; k < 9; k++) {
        const w = a + k / 9 * Math.PI * 2, facing = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
        setWindow(new THREE.Vector3(tx, windowAt, tz).addScaledVector(facing, radiusAt(windowAt)), facing.clone().addScaledVector(UP, slope).normalize(), SMALL);
      }
      world.createCollider(RAPIER.ColliderDesc.cylinder(tall / 2 + 2, BASE).setTranslation(tx, foot + tall / 2 + 2, tz));
    }
    // A tall slim tower standing on the drum's roof and cutting into the
    // great tower: half its width, straight sided with no steps, a little
    // lower than the great tower. It stands 1 m in from the drum's edge, as
    // far round towards the front as it goes while staying behind the little
    // turret. Plain wall all the way up, with windows only near its top,
    // then a tall round dome springing 1 m below the
    // foot of the great tower's top band of tiles.
    {
      const R2 = GATE.r / 2, d = r - R2 - 1, gap = 1;
      const turretAt = at(a1 - 2 * turn, r - 3.2 - 0.6);
      let b = a1 - 2 * turn;
      const centre = () => at(b, d);
      while (b > a0 && Math.hypot(centre()[0] - turretAt[0], centre()[1] - turretAt[1]) < R2 + 3.2 + gap) b -= 0.002;
      const [sx, sz] = centre();
      CASTLE.slim = { x: sx, z: sz, r: R2 };
      const wallTop = GATE_FOOT + STRETCHES[STRETCHES.length - 1][0] - 1, base = top - 0.2;
      const straight = (from: number, to: number) => {
        const steps = Math.max(2, Math.ceil((to - from) / 0.5));
        return Array.from({ length: steps + 1 }, (_, i) => [R2, from + (to - from) * i / steps]);
      };
      add(round(sx, sz, straight(base, wallTop), textures.city.metres, 96), city);
      add(round(sx, sz, domeOf(R2, wallTop), textures.tiles.metres, 96), tiles);
      // From Andrew's fourth reference: windows in pairs with 0.55 m of wall
      // between them, a pair every eight window widths round, one pair on the
      // front's centre line, in three rows on the same columns: the first
      // with its top 2 m and half a window height under the roof, the others three
      // window heights apart. The wall below is bare.
      const H = WINDOW.height, W = WINDOW.width, pairs = Math.round(Math.PI * 2 * R2 / (8 * W)), half = (W + 0.55) / 2;
      for (let row = 0; row < 3; row++) {
        const h = wallTop - H - 2 - row * 3 * H;
        for (let k = 0; k < pairs; k++) for (const o of [-half, half]) {
          const w = k / pairs * Math.PI * 2 + o / R2, out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
          const x = sx + out.x * R2, z = sz + out.z * R2;
          if (inTower(x, h, z, -1)) continue;
          setWindow(new THREE.Vector3(x, h, z), out);
        }
      }
      // And a row of single windows halfway down from the lowest pairs to
      // the little tower's crown, less 2 m, each centred under a pair's gap.
      const lowest = wallTop - H - 2 - 6 * H, h = (lowest + littleTop) / 2 - 2;
      for (let k = 0; k < pairs; k++) {
        const w = k / pairs * Math.PI * 2, out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
        const x = sx + out.x * R2, z = sz + out.z * R2;
        if (!inTower(x, h, z, -1)) setWindow(new THREE.Vector3(x, h, z), out);
      }
      world.createCollider(RAPIER.ColliderDesc.cylinder((wallTop - base) / 2, R2).setTranslation(sx, (base + wallTop) / 2, sz));
    }
  }
  // The lower half from Andrew's reference, measured in band heights: a row
  // with its sills on the first band, a row with its tops one band height
  // under it, both evenly spaced, and bare wall down to the foot, where the windows come in pairs two window widths
  // apart, a pair every 12.5 m or so, with one either side of the arch.
  const BAND = STRETCHES[2][1] - STRETCHES[2][0];
  evenRing(ROWS[0], 12.5, false, [-WINDOW.width, WINDOW.width]);
  evenRing(STRETCHES[2][0] - BAND - WINDOW.height / 2, 4, true);
  evenRing(STRETCHES[2][1] - 0.2 + WINDOW.height / 2, 4, false);
  // The upper wall from the second reference: three rows on shared columns
  // about five windows apart, one on the centre line over the arch. The top
  // row a little over a window height under the roof, the next two and a
  // half window heights lower, then bare wall down to a row just above the
  // second band.
  {
    const eave = STRETCHES[5][1], H = WINDOW.height, top = eave - 1.2 * H - H / 2;
    const columns = Math.round(Math.PI * 2 * gateAt(top)[0] / (5 * WINDOW.width));
    for (const h of [top, top - 2.6 * H, STRETCHES[4][1] + 0.3 + H / 2]) evenRing(h, 0, true, [0], columns);
  }
  // Every tower drum so far, as its middle and its radius at a height, so the
  // towers further out can keep their windows off them.
  const drums: [number, number, (y: number) => number][] = [
    [0, GATE.z, y => gateAt(Math.max(0, y - GATE_FOOT))[0]],
    [COLONNADE.cx, COLONNADE.cz, y => y < GATE_FOOT + STRETCHES[2][0] ? COLONNADE.r : 0],
  ];
  // A tower on the east side (x positive, left as you face the castle), from
  // Andrew's second drawing, traced in pixels as [radius, height] and set at
  // a 26 m base like the first: a tall foot leaning in a little, a sloping
  // shoulder with a band of tiles over its top, a straight upper wall and a
  // dome (DOME_RISE, like the others). Its front is in line with the
  // great tower's and it is sunk into it, the seam three path widths over,
  // mirroring the colonnade.
  {
    const PX = 26 / 667;
    // The shoulder dropped so its band of tiles ends 1 m below the foot of
    // the great tower's second band; the upper wall's top and the dome stay.
    const DROP = 828 - (STRETCHES[4][0] - 1) / PX;
    const WALL = [[667, 0], [630, 654 - DROP], [589, 736 - DROP]], BAND = [[589, 736 - DROP], [545, 828 - DROP]], UPPER = [[545, 828 - DROP], [545, 1379]];
    // Then moved 12 m further east and 7 m back.
    const r = 667 * PX, seam = 4 * ARCH.half + 5, cz = ARCH.front + r + 7;
    const seamZ = GATE.z - Math.sqrt(GATE.r ** 2 - seam ** 2), ex = seam + Math.sqrt(r * r - (seamZ - (cz - 7)) ** 2) + 12;
    const metres = (points: number[][]) => points.map(([rr, h]) => [rr * PX, GATE_FOOT + h * PX]);
    // Finely along each straight stretch, every half metre or so.
    const along = (points: number[][]) => {
      const out: number[][] = [];
      metres(points).forEach((p, i, all) => {
        if (i === 0) { out.push(p); return; }
        const [r0, y0] = all[i - 1], steps = Math.max(1, Math.ceil(Math.abs(p[1] - y0) / 0.5));
        for (let k = 1; k <= steps; k++) out.push([r0 + (p[0] - r0) * k / steps, y0 + (p[1] - y0) * k / steps]);
      });
      return out;
    };
    add(round(ex, cz, along(WALL), textures.city.metres, 96), city);
    add(round(ex, cz, along(BAND), textures.tiles.metres, 96), tiles);
    add(round(ex, cz, along(UPPER), textures.city.metres, 96), city);
    add(round(ex, cz, domeOf(UPPER[1][0] * PX, GATE_FOOT + UPPER[1][1] * PX), textures.tiles.metres, 96), tiles);
    sunk(ex, cz, r, 72);
    // The outline's radius and slope at a height above the foot.
    const OUTLINE = metres([...WALL, ...UPPER]);
    const radiusAt = (y: number) => {
      let k = 1;
      while (k < OUTLINE.length - 1 && OUTLINE[k][1] < y) k++;
      const [r0, y0] = OUTLINE[k - 1], [r1, y1] = OUTLINE[k], narrows = (r0 - r1) / (y1 - y0);
      return [r0 - narrows * (y - y0), narrows];
    };
    const [bandLow, bandHigh] = [BAND[0][1] * PX + GATE_FOOT, BAND[1][1] * PX + GATE_FOOT], top = UPPER[1][1] * PX + GATE_FOOT;
    // A window on this tower at height y, s metres round from its front,
    // unless it would be inside the great tower.
    const towerWindow = (y: number, s: number) => {
      const [radius, slope] = radiusAt(y), w = s / radius, out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
      const x = ex + out.x * radius, z = cz + out.z * radius;
      if (Math.hypot(x, z - GATE.z) < gateAt(y - GATE_FOOT)[0] + 1) return;
      setWindow(new THREE.Vector3(x, y, z), out.clone().addScaledVector(UP, slope).normalize());
    };
    // From Andrew's third reference. Above the band, four rows on shared
    // columns about four windows apart, one on the front's centre line, the
    // lowest sitting three and a third window heights over the band and the
    // rest 2.6 window heights apart. Under the band, one row with its tops a
    // window height down: pairs two window widths apart, a pair every 8 m.
    const H = WINDOW.height, W = WINDOW.width, upper = UPPER[0][0] * PX;
    const columns = Math.round(Math.PI * 2 * upper / (4 * W));
    for (let row = 0; row < 4; row++) {
      const y = bandHigh + 3.3 * H + H / 2 + row * 2.6 * H;
      for (let k = 0; k < columns; k++) towerWindow(y, k * Math.PI * 2 * upper / columns);
    }
    {
      const y = bandLow - 1.2 * H - H / 2, round = Math.PI * 2 * radiusAt(y)[0], pairs = Math.round(round / 8);
      for (let k = 0; k < pairs; k++) for (const o of [-W, W]) towerWindow(y, k * round / pairs + o);
    }
    world.createCollider(RAPIER.ColliderDesc.cylinder(bandHigh / 2, r).setTranslation(ex, bandHigh / 2, cz));
    world.createCollider(RAPIER.ColliderDesc.cylinder(top / 2, UPPER[0][0] * PX).setTranslation(ex, top / 2, cz));
    drums.push([ex, cz, y => y < top ? radiusAt(y)[0] : 0]);
    // A turret hung in the valley between the great tower and this one, on
    // the front, from Andrew's reference: a round wall with two rows of
    // windows, a low round dome over it, a little lip round its foot and,
    // under that, a cone narrowing down into the seam between the towers.
    {
      const R = 5, foot = GATE_FOOT + STRETCHES[4][1], lip = foot + 10, coneTall = 10;
      // Where the two towers' walls meet on the front at a height.
      const seamAt = (y: number) => {
        const r1 = gateAt(y - GATE_FOOT)[0], r2 = radiusAt(y)[0];
        const dx = ex, dz = cz - GATE.z, d = Math.hypot(dx, dz);
        const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
        const mx = dx * a / d, mz = GATE.z + dz * a / d;
        const options = [[mx - dz / d * h, mz + dx / d * h], [mx + dz / d * h, mz - dx / d * h]];
        return options[0][1] < options[1][1] ? options[0] : options[1];
      };
      const [px, pz] = seamAt(foot + 5);
      const outX = px / gateAt(foot + 5 - GATE_FOOT)[0] + (px - ex) / radiusAt(foot + 5)[0];
      const outZ = (pz - GATE.z) / gateAt(foot + 5 - GATE_FOOT)[0] + (pz - cz) / radiusAt(foot + 5)[0];
      const outLength = Math.hypot(outX, outZ), stand = R * 1.1;
      const tx = px + outX / outLength * stand, tz = pz + outZ / outLength * stand;
      const straight = (r: number, from: number, to: number) => {
        const steps = Math.max(2, Math.ceil((to - from) / 0.5));
        return Array.from({ length: steps + 1 }, (_, i) => [r, from + (to - from) * i / steps]);
      };
      add(round(tx, tz, straight(R, foot, lip), textures.city.metres, 64), city);
      // The lip round its foot.
      add(round(tx, tz, [[R, foot - 0.6], [R + 0.35, foot - 0.6], [R + 0.35, foot], [R, foot + 0.01]], textures.city.metres, 64), city);
      // The low round dome.
      add(round(tx, tz, Array.from({ length: 25 }, (_, k) => {
        const t = k / 24 * Math.PI / 2;
        return [Math.max(0.01, (R + 0.25) * Math.cos(t)), lip + R * 0.75 * Math.sin(t)];
      }), textures.tiles.metres, 64), tiles);
      // The cone, its point leaning back into the seam as it narrows.
      const tipY = foot - 0.6 - coneTall, [qx, qz] = seamAt(tipY);
      const cone = round(tx, tz, Array.from({ length: 19 }, (_, k) => {
        const t = 1 - k / 18;
        return [Math.max(0.01, R * t), tipY + coneTall * t];
      }).reverse(), textures.city.metres, 64);
      {
        const p = cone.getAttribute('position');
        for (let k = 0; k < p.count; k++) {
          const t = THREE.MathUtils.clamp((foot - 0.6 - p.getY(k)) / coneTall, 0, 1);
          p.setX(k, p.getX(k) + (qx - tx) * t);
          p.setZ(k, p.getZ(k) + (qz - tz) * t);
        }
        cone.computeVertexNormals();
      }
      add(cone, city);
      CASTLE.hung = { x: tx, z: tz, r: R, foot, lip, rise: R * 0.75, tipY, tip: [qx, qz], seamAt, east: { x: ex, z: cz, radiusAt: y => radiusAt(y)[0], bandLow, bandHigh } };
      // Two rows of windows, wherever the wall stands clear of both towers.
      [foot + 3, foot + 7].forEach((y, row) => {
        for (let k = 0; k < 10; k++) {
          const w = (k + row * 0.5) / 10 * Math.PI * 2, out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
          const x = tx + out.x * R, z = tz + out.z * R;
          if (Math.hypot(x, z - GATE.z) < gateAt(y - GATE_FOOT)[0] + 0.8 || Math.hypot(x - ex, z - cz) < radiusAt(y)[0] + 0.8) continue;
          setWindow(new THREE.Vector3(x, y, z), out, SMALL);
        }
      });
      world.createCollider(RAPIER.ColliderDesc.cylinder((lip - foot) / 2, R).setTranslation(tx, (foot + lip) / 2, tz));
    }
  }
  // The wall of towers running on from the colonnade and the east tower out
  // to the platform's edges, each one's front on the city's curving front
  // and sunk into the one before. Each as its radius, where along x its
  // front touches the curve and the height of its wall. Plain straight
  // walls, no bands or steps. Lower and slimmer the further out.
  // Their windows take the patterns from Andrew's references, alternating
  // so no two neighbours match: rows of pairs under the roof (as on the
  // tall tower on the drum), with singles under them if asked for, or rows
  // on single columns (as on the east tower). All of them also get a row
  // of pairs low down over the water, level with the great tower's.
  type Outer = { r: number, at: number, top: number, look: 'pairs' | 'columns' | 'great', rows: number, singles?: boolean };
  const OUTERS: Outer[] = [
    // East (x positive).
    { r: 17, at: 80, top: 44, look: 'pairs', rows: 3, singles: true },
    { r: 12.5, at: 98, top: 32, look: 'columns', rows: 2 },
    // West: taller beside the low colonnade.
    { r: 18, at: -74, top: 50, look: 'great', rows: 3 },
    { r: 13.5, at: -98, top: 36, look: 'pairs', rows: 2 },
  ];
  {
    const inOther = (x: number, y: number, z: number, self: number, margin: number) =>
      drums.some(([dx, dz, radius], k) => k !== self && Math.hypot(x - dx, z - dz) < radius(y) + margin);
    for (const { r, at, top, look, rows, singles } of OUTERS) {
      // Square to the curve where its front touches it.
      const slope = 2 * at / 292, n = Math.hypot(slope, 1);
      const cx = at - slope / n * r, cz = cityFront(at) + r / n;
      const steps = Math.ceil(top / 0.5);
      add(round(cx, cz, Array.from({ length: steps + 1 }, (_, i) => [r, GATE_FOOT + top * i / steps]), textures.city.metres, 96), city);
      add(round(cx, cz, domeOf(r, GATE_FOOT + top, 0.2), textures.tiles.metres, 96), tiles);
      sunk(cx, cz, r, 72);
      const self = drums.length;
      drums.push([cx, cz, y => y < GATE_FOOT + top ? r : 0]);
      // Windows mirrored about its front, the point on the curve, w round
      // from it, unless another tower hides the wall there.
      const front = Math.atan2(at - cx, cz - cityFront(at));
      const put = (y: number, w: number) => {
        const out = new THREE.Vector3(Math.sin(front + w), 0, -Math.cos(front + w));
        const x = cx + out.x * r, z = cz + out.z * r;
        if (!inOther(x, y, z, self, 1)) setWindow(new THREE.Vector3(x, y, z), out);
      };
      // count spots evenly round, one on the front, each a window or a group
      // at the offsets (in metres along the wall).
      const ring = (y: number, count: number, offsets = [0]) => {
        for (let k = 0; k < count; k++) for (const o of offsets) put(y, k / count * Math.PI * 2 + o / r);
      };
      const H = WINDOW.height, W = WINDOW.width, wallTop = GATE_FOOT + top, around = Math.PI * 2 * r;
      if (look === 'pairs') {
        // Pairs with 0.55 m between, every eight window widths, the top row
        // 2 m and half a window height under the roof, then every three
        // window heights, and singles under the gaps 4.5 window heights below.
        const pairs = Math.round(around / (8 * W)), half = (W + 0.55) / 2;
        for (let row = 0; row < rows; row++) ring(wallTop - H - 2 - row * 3 * H, pairs, [-half, half]);
        if (singles) ring(wallTop - H - 2 - (rows - 1) * 3 * H - 4.5 * H, pairs);
      } else if (look === 'great') {
        // As the great tower's upper wall, the same distances down from the
        // roof: columns five window widths apart, two rows under the roof and
        // one far below them.
        const columns = Math.round(around / (5 * W)), first = wallTop - 1.7 * H;
        const third = first - (STRETCHES[5][1] - 1.7 * H) + (STRETCHES[4][1] + 0.3 + H / 2);
        for (const y of [first, first - 2.6 * H, third]) ring(y, columns);
      } else {
        // Single columns about four window widths apart, the top row a little
        // over a window height under the roof, then every 2.6 window heights.
        const columns = Math.round(around / (4 * W));
        for (let row = 0; row < rows; row++) ring(wallTop - 1.7 * H - row * 2.6 * H, columns);
      }
      // The pairs over the water, two window widths apart, every 12.5 m.
      ring(GATE_FOOT + ROWS[0], Math.round(around / 12.5), [-W, W]);
      world.createCollider(RAPIER.ColliderDesc.cylinder((top + 15) / 2, r).setTranslation(cx, (top - 15) / 2, cz));
    }
  }
  // Solid either side of the passage.
  for (const side of [-1, 1]) solid(side * (ARCH.half + GATE.r) / 2, 15, GATE.z, (GATE.r - ARCH.half) / 2, 15.3, GATE.r * 0.85);
  solid(0, (archTop + 30) / 2, GATE.z, ARCH.half, (30 - archTop) / 2, GATE.r * 0.85);

  const glass = new THREE.InstancedMesh(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height),
    painted(palette.stone, { map: windowTexture(), alphaTest: 0.5 }), windows.length);
  windows.forEach((matrix, i) => glass.setMatrixAt(i, matrix));
  glass.receiveShadow = true;
  scene.add(glass);

  // The arch's lining: a ring of stone the shape of the opening, a little
  // wider, standing just proud of the tower's curve at its sides, and the
  // passage through it to the sealed door.
  const z0 = ARCH.front - 0.15, depth = ARCH.back - z0, w = 0.8, riseOut = Math.sqrt((R + w) ** 2 - c * c);
  const shape = new THREE.Shape()
    .moveTo(-ARCH.half - w, -0.3).lineTo(-ARCH.half - w, spring)
    .absarc(c, spring, R + w, Math.PI, Math.atan2(riseOut, -c), true)
    .absarc(-c, spring, R + w, Math.atan2(riseOut, c), 0, true)
    .lineTo(ARCH.half + w, -0.3).lineTo(ARCH.half, -0.3).lineTo(ARCH.half, spring)
    .absarc(-c, spring, R, 0, Math.atan2(rise, c), false)
    .absarc(c, spring, R, Math.atan2(rise, -c), Math.PI, false)
    .lineTo(-ARCH.half, -0.3).closePath();
  const portal = new THREE.ExtrudeGeometry(shape, { depth, steps: 12, bevelEnabled: false, curveSegments: 24 });
  portal.translate(0, 0, z0);
  {
    // Its face leans back with the tower's foot, the passage behind taking
    // up the difference.
    const p = portal.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const back = GATE.r - gateAt(Math.max(0, p.getY(k) - GATE_FOOT))[0];
      p.setZ(k, p.getZ(k) + back * (1 - (p.getZ(k) - z0) / depth));
    }
    portal.computeVertexNormals();
  }
  {
    const p = portal.getAttribute('position'), colours: number[] = [];
    for (let k = 0; k < p.count; k++) {
      const inside = Math.abs(p.getX(k)) < ARCH.half + 0.01 && p.getY(k) < archTop + 0.01;
      const dark = inside ? 1 - 0.85 * THREE.MathUtils.smoothstep(p.getZ(k) - z0, 0.5, 7) : 1;
      colours.push(dark, dark, dark);
    }
    portal.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  }
  add(shifted(portal), portalStone);
}
