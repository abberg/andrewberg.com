import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { painted, palette } from './look';
import { stroke } from './masonry';

// Step 7: the columns, as in the garden painting: white stone, fluted, built
// of stacked drums so the only joints are the horizontal seams between them.
// The vertical lines the painting shows are staining, darker where rain has
// run down the flutes. A round moulded base, a ring at the neck and, on the
// tall standing columns, a capital of two rings and a bell of rounded ribs
// under a thick, overhanging round slab. The
// colonnade's columns have a plainer flare under the square block that
// carries the lintels. The fallen column and the loose drums are lengths of
// the same shaft.

// Flutes round the shaft, and how deep each is, as a share of the radius.
const FLUTES = 20, DEPTH = 0.07;
// Ribs round the tall columns' capitals.
const RIBS = 10;
// The texture runs once round the shaft and up a whole standing column.
const TALL = 14;
// Heights of the seams between drums, up from a column's foot: drums of 1.1
// to 1.7 m, the same every time.
const SEAMS = (() => {
  let s = 29;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const seams: number[] = [];
  for (let y = 0.9 + random() * 0.4; y < TALL - 1; y += 1.1 + random() * 0.6) seams.push(y);
  return seams;
})();

// White stone with a little warmth, the seams as thin violet lines and the
// stains run down the middle of the flutes from the seams and the top: broad
// and faint, a few darker, some long, most short, never grey.
function shaftTexture() {
  const width = 512, height = 2048, m = height / TALL;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  let s = 53;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#fbf9f2';
  g.fillRect(0, 0, width, height);
  // A few broad, faint washes down the shaft.
  for (let k = 0; k < 30; k++) {
    const x = random() * width, y = random() * height, long = (1 + random() * 3) * m;
    stroke(g, Math.floor(random() * 10), x, y, x + (random() - 0.5) * 8, y + long, width * (0.1 + random() * 0.15),
      random() < 0.5 ? 'rgba(244,236,214,0.5)' : 'rgba(236,234,248,0.5)');
  }
  // Canvas y runs down; the texture's v runs up from the foot.
  const at = (y: number) => height - y * m;
  const flute = width / FLUTES;
  for (let f = 0; f < FLUTES; f++) {
    const x = (f + 0.5) * flute;
    for (const from of [TALL, ...SEAMS]) {
      if (random() < 0.35) continue;
      const long = (0.3 + random() ** 2 * 4.5) * m, dark = random() < 0.3;
      const colour = dark ? `rgba(128,120,184,${0.45 + random() * 0.25})` : `rgba(156,150,206,${0.3 + random() * 0.25})`;
      stroke(g, Math.floor(random() * 10), x + (random() - 0.5) * 3, at(from) - 2, x + (random() - 0.5) * 6, at(from) - 2 + long,
        flute * (0.35 + random() * 0.3), colour);
    }
    // Green near the foot, now and then.
    if (random() < 0.4) stroke(g, Math.floor(random() * 10), x, at(0), x, at(0) - (0.4 + random()) * m, flute * 0.6, 'rgba(150,176,96,0.35)');
  }
  // The seams, drawn across in short wavering strokes.
  for (const y of SEAMS) {
    for (let x = -20; x < width; x += 60 + random() * 40) {
      stroke(g, Math.floor(random() * 10), x, at(y) + (random() - 0.5) * 2, x + 90, at(y) + (random() - 0.5) * 2, 4 + random() * 3, 'rgba(120,108,176,0.75)');
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

const shaft = shaftTexture();
export const columnStone = painted(palette.stone, { map: shaft, vertexColors: true });
// The same white stone for the blocky pieces (plinths, the arch fence,
// blocks, the urns' feet), without the flutes' stripes: soft washes of warm
// and cool in every direction, and weathered: blotchy discolouring, a little
// lichen and fine forking cracks.
function blockTexture() {
  const px = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = 59;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#fbf9f2';
  g.fillRect(0, 0, px, px);
  // Drawn three times over, shifted by the tile, so the washes run on across
  // its edges without a seam.
  const tiled = (draw: (dx: number, dy: number) => void) => { for (const dx of [-px, 0, px]) for (const dy of [-px, 0, px]) draw(dx, dy); };
  for (let k = 0; k < 40; k++) {
    const x = random() * px, y = random() * px, a = random() * Math.PI, long = px * (0.15 + random() * 0.25), wide = px * (0.08 + random() * 0.12);
    const colour = random() < 0.5 ? 'rgba(244,236,214,0.45)' : 'rgba(236,234,248,0.45)', mask = Math.floor(random() * 10);
    tiled((dx, dy) => stroke(g, mask, x + dx, y + dy, x + dx + Math.cos(a) * long, y + dy + Math.sin(a) * long, wide, colour));
  }
  // Age: stains in the column's own colours (its two violets and its green),
  // with a big brush, gathered into clumps of overlapping marks rather than
  // scattered one by one.
  for (let c = 0; c < 9; c++) {
    const cx = random() * px, cy = random() * px, green = random() < 0.35, spread = px * (0.05 + random() * 0.07);
    for (let k = 0, n = 4 + Math.floor(random() * 6); k < n; k++) {
      const x = cx + (random() - 0.5) * spread * 2, y = cy + (random() - 0.5) * spread * 2, a = random() * Math.PI;
      const long = px * (0.05 + random() * 0.09), wide = px * (0.04 + random() * 0.05), mask = Math.floor(random() * 10);
      const colour = green ? `rgba(150,176,96,${0.2 + random() * 0.15})`
        : random() < 0.3 ? `rgba(128,120,184,${0.18 + random() * 0.15})` : `rgba(156,150,206,${0.2 + random() * 0.15})`;
      tiled((dx, dy) => stroke(g, mask, x + dx, y + dy, x + dx + Math.cos(a) * long, y + dy + Math.sin(a) * long, wide, colour));
    }
  }
  // Cracks: a few long thin dark lines that wander and seldom fork (a
  // fork never forks again), each with a
  // white lit edge beside it, in a faint shade, so it reads as cut into the
  // stone.
  const crackLine = (x: number, y: number, a: number, steps: number, width: number, fork = true): void => {
    for (let k = 0; k < steps; k++) {
      a += (random() - 0.5) * 0.9;
      const len = 10 + random() * 18, nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len, w = width * (1 - k / steps * 0.6);
      tiled((dx, dy) => {
        const line = (ox: number, oy: number, colour: string, width: number) => {
          g.strokeStyle = colour;
          g.lineWidth = width;
          g.beginPath(); g.moveTo(x + dx + ox, y + dy + oy); g.lineTo(nx + dx + ox, ny + dy + oy); g.stroke();
        };
        g.lineCap = 'round';
        // A soft shade along the crack, so the highlight has something to
        // show against on the near-white stone; then the lit edge on the
        // light's side, then the dark line itself.
        line(-1, -1, 'rgba(176,168,206,0.22)', w * 5);
        line(w * 0.9, w * 0.9, 'rgba(255,255,255,1)', w * 1.1);
        line(0, 0, 'rgba(104,92,160,0.85)', w);
      });
      if (fork && random() < 0.05 && steps - k > 6) crackLine(nx, ny, a + (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.5), Math.floor((steps - k) * 0.4), w * 0.7, false);
      x = nx; y = ny;
    }
  };
  for (let k = 0; k < 5; k++) crackLine(random() * px, random() * px, random() * Math.PI * 2, 22 + Math.floor(random() * 14), 2.5 + random() * 1.5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
// Laid on from three sides, for blocks with no UVs to speak of. Each piece
// takes it from its own place in the stone (shifted), so copies of a shape
// don't wear the same stains and cracks.
export const blockStone = painted(palette.stone, { map: blockTexture() }, 4.4);
blockStone.defines = { ...blockStone.defines, TEX_SHIFT: '' };
let shifts = 0;
export function shifted(geometry: THREE.BufferGeometry, span = 4.4, margin = 0) {
  const copy = geometry.clone(), n = copy.getAttribute('position').count, k = ++shifts;
  // Spread well apart across the tile, the same for every corner of the piece.
  const place = (f: number) => margin + (f % 1) * (span - 2 * margin);
  const shift = [place(k * 0.618034), place(k * 0.414214), place(k * 0.732051)];
  copy.setAttribute('texShift', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => shift).flat(), 3));
  return copy;
}

// A profile ([radius, y, cut] points, bottom first) turned round the y
// axis. Points cut 1 are fluted, scalloped flutes with sharp ridges between;
// points cut 2 are the capital's ribs, broad and rounded with deep dark
// slots between them. The texture runs once round, and up from the given
// height.
function lathe(profile: number[][], from: number) {
  const segments = FLUTES * 8;
  const positions: number[] = [], uvs: number[] = [], colours: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, t = (i / segments * FLUTES) % 1;
    const scallop = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
    const slot = Math.exp(-((((i / segments * RIBS) % 1 - 0.5) / 0.13) ** 2));
    profile.forEach(([r, y, cut]) => {
      const radius = r * (1 - (cut === 1 ? DEPTH * scallop : cut === 2 ? 0.28 * slot : 0));
      positions.push(Math.sin(a) * radius, y, Math.cos(a) * radius);
      uvs.push(i / segments, (y - from) / TALL);
      // Shadowed deep in the slots.
      const shade = cut === 2 ? 1 - 0.6 * slot : 1;
      colours.push(shade, shade, shade);
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
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A quarter or half round moulding, as points from one angle to another
// about a centre.
const arc = (r: number, y: number, radius: number, from: number, to: number, steps = 6) =>
  Array.from({ length: steps + 1 }, (_, k) => { const a = from + (to - from) * k / steps; return [r + Math.cos(a) * radius, y + Math.sin(a) * radius]; });

// A fluted length of shaft from y0 to y1, its radius given by height, with a
// shallow groove at every seam between drums. foot is where the column's
// foot is, for the seams.
function fluted(radius: (y: number) => number, y0: number, y1: number, foot: number) {
  const points: number[][] = [];
  const add = (y: number, inset = 1) => points.push([radius(y) * inset, y, 1]);
  for (let k = 0; k <= 8; k++) {
    const y = y0 + (y1 - y0) * k / 8, next = y0 + (y1 - y0) * (k + 1) / 8;
    add(y);
    if (k === 8) break;
    for (const seam of SEAMS.map(h => h + foot)) {
      if (seam > y + 0.04 && seam < next - 0.04) {
        add(seam - 0.03);
        add(seam - 0.012, 0.985);
        add(seam + 0.012, 0.985);
        add(seam + 0.03);
      }
    }
  }
  return points;
}

// The ring at the neck and the capital over it, from the top of the shaft
// to the top of the column.
function capitalProfile(radius: number, shaftTop: number, top: number, capital: 'cup' | 'flat') {
  const k = radius / 0.7;
  const neck = radius * 0.88;
  const ring = arc(neck + 0.02 * k, shaftTop + 0.09 * k, 0.07 * k, -Math.PI / 2, Math.PI / 2, 4);
  return [...ring, ...(capital === 'cup'
    // A band and a second ring, then a bell of rounded ribs flaring out,
    // under a thick round slab that overhangs it, flat on top.
    ? [
      [neck * 0.97, shaftTop + 0.17 * k], [neck * 0.97, shaftTop + 0.26 * k],
      ...arc(neck, shaftTop + 0.32 * k, 0.06 * k, -Math.PI / 2, Math.PI / 2, 4),
      ...Array.from({ length: 7 }, (_, i) => {
        const t = i / 6;
        return [neck * 0.94 + (0.98 * k - neck * 0.94) * t ** 0.8, shaftTop + 0.38 * k + (0.8 * k) * t, 2];
      }),
      [0.96 * k, top - 0.26 * k], [1.14 * k, top - 0.26 * k],
      ...arc(1.12 * k, top - 0.14 * k, 0.1 * k, -Math.PI / 2, Math.PI / 2, 4),
      [1.06 * k, top - 0.04 * k], [1.0 * k, top - 0.01 * k], [0, top - 0.01 * k],
    ]
    // A plain flare under the square block (a box of its own).
    : [
      [neck * 0.96, shaftTop + 0.2 * k],
      ...Array.from({ length: 5 }, (_, i) => {
        const t = (i + 1) / 5;
        return [neck * 0.96 + (1.1 * k - neck * 0.96) * Math.sin(t * Math.PI / 2), shaftTop + 0.2 * k + 0.55 * k * t];
      }),
      [0, top],
    ])];
}

// A tall column's capital on its own, broken off at the top of the shaft,
// standing on the origin.
export function capitalGeometry(radius: number) {
  const height = 1.45 * radius / 0.7;
  return lathe([[0, 0], [radius * 0.9, 0], ...capitalProfile(radius, 0, height, 'cup')], -12.55);
}

// A column of a radius and height, standing centred on the origin. The
// mouldings scale with the radius. On a plinth it has only a thin ring at
// its foot.
export function columnGeometry(radius: number, height: number, capital: 'cup' | 'flat', plinth = false) {
  const k = radius / 0.7, bottom = -height / 2, top = height / 2;
  const base = plinth ? [[0, bottom], [0.82 * k, bottom], ...arc(0.8 * k, bottom + 0.08 * k, 0.08 * k, -Math.PI / 2, Math.PI / 2, 4)] : [
    [0, bottom], [1.02 * k, bottom], [1.02 * k, bottom + 0.2 * k],
    // A fat round, a hollow, and a thin round, up to the shaft.
    ...arc(0.86 * k, bottom + 0.36 * k, 0.16 * k, -Math.PI / 2, Math.PI / 2),
    [0.8 * k, bottom + 0.54 * k],
    ...arc(0.78 * k, bottom + 0.6 * k, 0.07 * k, -Math.PI / 2, Math.PI / 2, 4),
  ];
  const shaftFoot = bottom + (plinth ? 0.18 : 0.7) * k, shaftTop = top - (capital === 'cup' ? 1.45 : 0.75) * k;
  // The shaft narrows a little as it rises, with a slight swell.
  const taper = (y: number) => {
    const t = (y - shaftFoot) / (shaftTop - shaftFoot);
    return radius * (1 - 0.12 * t * t + 0.025 * Math.sin(t * Math.PI));
  };
  return lathe([...base, ...fluted(taper, shaftFoot, shaftTop, bottom), ...capitalProfile(radius, shaftTop, top, capital)], bottom);
}

// A broken column, as on the start tower in Andrew's stills of it: the round
// moulded base and a plain shaft of drums, no flutes, snapped off with a
// slanting, ragged top. Standing on the origin.
export function brokenColumnGeometry(radius: number, height: number, seed: number, tile: number) {
  const k = radius / 0.7, foot = 0.7 * k;
  const base = [
    [0, 0], [1.02 * k, 0], [1.02 * k, 0.2 * k],
    ...arc(0.86 * k, 0.36 * k, 0.16 * k, -Math.PI / 2, Math.PI / 2),
    [0.8 * k, 0.54 * k],
    ...arc(0.78 * k, 0.6 * k, 0.07 * k, -Math.PI / 2, Math.PI / 2, 4),
  ];
  // The drums, a shallow groove at every seam, the last whole one well
  // under the break.
  const shaftPoints: number[][] = [[radius, foot]];
  for (let y = foot + 0.75; y < height - 0.7; y += 0.8) {
    shaftPoints.push([radius, y - 0.03], [radius * 0.97, y - 0.01], [radius * 0.97, y + 0.01], [radius, y + 0.03]);
  }
  shaftPoints.push([radius, height - 0.5], [radius, height], [0, height]);
  const geometry = lathe([...base, ...shaftPoints], -3);
  // The break: the rim slants down one way and wanders, the middle a little
  // proud of it, like a snapped-off stump.
  const p = geometry.getAttribute('position'), rows = base.length + shaftPoints.length;
  for (let v = 0; v < p.count; v++) {
    const j = v % rows, x = p.getX(v), z = p.getZ(v), a = Math.atan2(x, z);
    if (j === rows - 2) p.setY(v, height + 0.22 * x / radius + 0.07 * Math.sin(3 * a + seed) + 0.04 * Math.sin(7 * a + seed * 2.3));
    if (j === rows - 1) p.setY(v, height + 0.08);
  }
  // Laid on by UVs for a block texture, shrunk by tile (metres of texture
  // to a metre of stone) so the blocks are to the shaft's scale, and the
  // same size all the way round.
  const uv = geometry.getAttribute('uv'), segments = p.count / rows - 1, round = Math.PI * 2 * radius;
  for (let v = 0; v < p.count; v++) uv.setXY(v, Math.floor(v / rows) / segments * round / tile, p.getY(v) / tile);
  geometry.computeVertexNormals();
  return geometry;
}

// A plain length of fluted shaft, centred on the origin along y, cut from
// partway up a column (from, in metres above its foot) so its seams line up
// with the texture's.
// The ends are flat faces, their rims doubled so the edge stays sharp.
export function drumGeometry(radius: number, length: number, from = 2) {
  const side = fluted(() => radius, -length / 2, length / 2, -length / 2 - from);
  const rows = side.length + 4, geometry = lathe([[0, -length / 2], side[0], ...side, side[side.length - 1], [0, length / 2]], -length / 2 - from);
  // The faces take one plain spot of the texture, between flutes and seams,
  // rather than streaking it out from the middle.
  const uv = geometry.getAttribute('uv'), plain = (SEAMS[3] + SEAMS[4]) / 2 / TALL;
  for (let k = 0; k < uv.count; k++) if ([0, 1, rows - 2, rows - 1].includes(k % rows)) uv.setXY(k, 0, plain);
  return geometry;
}

// A square block for a column to stand on, as in the painting: straight
// sides, and a sloped top rising to a square just wider than the shaft.
// Sitting on the origin.
export function plinthGeometry(width: number, height: number, slope: number, top: number) {
  const points: THREE.Vector3[] = [];
  for (const [w, y] of [[width, 0], [width, height - slope], [top, height]]) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) points.push(new THREE.Vector3(x * w / 2, y, z * w / 2));
  }
  return new ConvexGeometry(points);
}

// An urn on a pedestal, as in the garden's references: a square foot, a
// short stem swelling between rings, and a wide shallow bowl whose
// underside is a ring of rounded ribs, under a thick flat lip, planted up
// (foliage.ts urnPlant). Standing on the origin, about 1.5 m tall.
export function urnGeometry() {
  const foot = new THREE.BoxGeometry(0.64, 0.22, 0.64).translate(0, 0.11, 0);
  const body = lathe([
    [0, 0.22], [0.24, 0.22], ...arc(0.22, 0.28, 0.05, -Math.PI / 2, Math.PI / 2, 4),
    [0.15, 0.34],
    // The stem, swelling a little.
    ...Array.from({ length: 5 }, (_, i) => { const t = (i + 1) / 6; return [0.15 + 0.04 * Math.sin(t * Math.PI), 0.34 + 0.3 * t]; }),
    [0.15, 0.66], ...arc(0.18, 0.7, 0.045, -Math.PI / 2, Math.PI / 2, 4),
    // The bowl: ribbed underneath, flaring out to the lip.
    ...Array.from({ length: 8 }, (_, i) => { const t = i / 7; return [0.2 + 0.5 * Math.sin(t * Math.PI / 2) ** 0.8, 0.75 + 0.4 * t ** 1.3, 2]; }),
    [0.68, 1.17], [0.78, 1.17], ...arc(0.76, 1.24, 0.07, -Math.PI / 2, Math.PI / 2, 4), [0.72, 1.31], [0.64, 1.31], [0.62, 1.24], [0, 1.22],
  ], -10);
  return { foot, body };
}

// A block of stone, its edges worn and its corners chipped, each corner its
// own way: most just rounded off a little, a few with a big piece knocked
// off. The points, for a hull, centred on the origin.
export function chippedBlock(width: number, height: number, depth: number, seed: number) {
  let s = seed * 7919 + 3;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const points: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const corner = new THREE.Vector3(x * width / 2, y * height / 2, z * depth / 2);
    const big = random() < 0.25, size = big ? 0.15 + random() * 0.25 : 0.03 + random() * 0.06;
    // Cut back along each of the three edges meeting here, by different amounts.
    for (const axis of [0, 1, 2]) {
      const p = corner.clone(), extent = [width, height, depth][axis];
      p.setComponent(axis, p.getComponent(axis) - Math.sign(p.getComponent(axis)) * Math.min(extent * 0.4, size * (0.5 + random())));
      points.push(p);
    }
  }
  return points;
}

// The points of a convex block cut in two by a plane (normal n through
// the origin), each half with the points where its edges cross the plane.
export function crack(points: THREE.Vector3[], n: THREE.Vector3) {
  const hull = new ConvexGeometry(points), p = hull.getAttribute('position');
  const sides: THREE.Vector3[][] = [[], []];
  const corner = (k: number) => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
  for (let t = 0; t < p.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = corner(t + e), b = corner(t + (e + 1) % 3), da = a.dot(n), db = b.dot(n);
      sides[da < 0 ? 0 : 1].push(a);
      if ((da < 0) !== (db < 0)) {
        const cut = a.clone().lerp(b, da / (da - db));
        sides[0].push(cut);
        sides[1].push(cut.clone());
      }
    }
  }
  return sides;
}
