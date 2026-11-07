import * as THREE from 'three';
import { CASTLE } from './city';
import { type Card, cardGeometry, clusterTexture, instanced, leafCards, SHRUB, slopeTree } from './foliage';
import { painted } from './look';
import { WINDOW } from './masonry';
import { SWAY } from './wind';

// The green mantle over the castle, from Andrew's reference (2026-11-07):
// one plant, not separate grass, moss and ivy. This is the rough underlay
// the leaves will sit on, in two parts:
//
// - A thin skin a hand's width off the stone, on the great tower and the
//   colonnade drum, where the reference has green. Where is traced from the
//   reference itself (public/mantle-mask.png, its green picked out by
//   colour), each point of the castle mapped to the picture by the great
//   tower's bands (heights) and by angle round it or distance along the drum
//   from the seam (across).
// - The slope the mantle makes of its own over the drum's roof: from the top
//   of the great tower's shoulder band down to the drum's lip, up the slim
//   tower a way, and round the little turret to just under its windows.

// The reference as traced, in its own pixels (1285 x 911): where the arch's
// middle is, where the great tower's limb and its seam with the drum are.
const REF = { width: 1285, height: 911, arch: 682, limb: 230, seam: 940 };
// Height on the great tower (m above its foot) to row in the reference, by
// its bands. The shoulder band's lower edge, where a line of green runs
// along it, measured across the picture (it dips towards the limb); set to
// the middle of that line so the line sits right on the seam.
const SEAM_ROWS = [[440, 392], [500, 376], [560, 368], [680, 372], [940, 370]];
const seamRow = (u: number) => {
  if (u <= SEAM_ROWS[0][0]) return SEAM_ROWS[0][1];
  let k = 1;
  while (k < SEAM_ROWS.length - 1 && SEAM_ROWS[k][0] < u) k++;
  const [u0, y0] = SEAM_ROWS[k - 1], [u1, y1] = SEAM_ROWS[k];
  return y0 + (y1 - y0) * THREE.MathUtils.clamp((u - u0) / (u1 - u0), 0, 1);
};
const rowAt = (h: number, u = REF.arch) => {
  const rows = [[0, 895], [16.88, 605], [20.15, 558], [30.65, seamRow(u)], [34.07, 325]];
  let k = 1;
  while (k < rows.length - 1 && rows[k][0] < h) k++;
  const [h0, y0] = rows[k - 1], [h1, y1] = rows[k];
  return y0 + (y1 - y0) * (h - h0) / (h1 - h0);
};
// The skin's distance off the stone.
const OFF = 0.12;
// The top of the great tower's shoulder band, where the mantle starts.
const SHOULDER = 34.07;

// A mask image, sampled in a picture's pixels (the picture it was traced
// from being size wide and high).
async function loadMask(url: string, size: [number, number] = [REF.width, REF.height]) {
  const image = await new THREE.ImageLoader().loadAsync(url);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(image, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, image.width, image.height);
  const sx = width / size[0], sy = height / size[1];
  // 0 to 1, bilinear, at a point in the picture's pixels.
  return (u: number, v: number) => {
    const x = THREE.MathUtils.clamp(u * sx, 0, width - 1.001), y = THREE.MathUtils.clamp(v * sy, 0, height - 1.001);
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const at = (a: number, b: number) => data[(b * width + a) * 4] / 255;
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };
}

// A grid of points as a mesh, each with its coverage as vertex alpha.
function grid(columns: number, rows: number, point: (i: number, j: number) => [THREE.Vector3, number], step = 0.25) {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const [p, a] = point(i, j);
    positions.push(p.x, p.y, p.z);
    colours.push(1, 1, 1, a);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < columns - 1; i++) {
    const a = j * columns + i, b = a + 1, c = a + columns, d = c + 1;
    // Leave out squares with nothing on them.
    if (Math.max(colours[a * 4 + 3], colours[b * 4 + 3], colours[c * 4 + 3], colours[d * 4 + 3]) < 0.5) continue;
    indices.push(a, c, b, b, c, d);
  }
  // How far each point is in from the green's edge (m), counted over the
  // grid: 0 outside, growing inward. Off the grid's own sides counts as
  // more green, so skins meeting there don't each round off.
  const n = columns * rows, edge = new Float32Array(n);
  for (let k = 0; k < n; k++) edge[k] = colours[k * 4 + 3] < 0.5 ? 0 : 1e9;
  const pass = (k: number, i: number, j: number, steps: [number, number, number][]) => {
    for (const [di, dj, w] of steps) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= columns || b >= rows) continue;
      edge[k] = Math.min(edge[k], edge[b * columns + a] + w);
    }
  };
  const D = Math.SQRT2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) pass(j * columns + i, i, j, [[-1, 0, 1], [0, -1, 1], [-1, -1, D], [1, -1, D]]);
  for (let j = rows - 1; j >= 0; j--) for (let i = columns - 1; i >= 0; i--) pass(j * columns + i, i, j, [[1, 0, 1], [0, 1, 1], [1, 1, D], [-1, 1, D]]);
  for (let k = 0; k < n; k++) edge[k] = Math.min(edge[k], 1e3) * step;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
  geometry.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The crown's lumps: the union of sphere caps round points on a jittered
// lattice through the world, so neighbouring skins share them. 0 to 1.
const LUMP = { cell: 4.4, radius: 3.1 };
const hash = (i: number, j: number, k: number, n: number) => {
  let h = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791) ^ Math.imul(n + 1, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const lump = (p: THREE.Vector3) => {
  const c = LUMP.cell, ci = Math.floor(p.x / c), cj = Math.floor(p.y / c), ck = Math.floor(p.z / c);
  let best = 0;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
    const i = ci + di, j = cj + dj, k = ck + dk;
    const r = LUMP.radius * (0.75 + 0.5 * hash(i, j, k, 3));
    const dx = (i + hash(i, j, k, 0)) * c - p.x, dy = (j + hash(i, j, k, 1)) * c - p.y, dz = (k + hash(i, j, k, 2)) * c - p.z;
    const d2 = (dx * dx + dy * dy + dz * dz) / (r * r);
    if (d2 < 1) best = Math.max(best, Math.sqrt(1 - d2));
  }
  return best;
};

export async function createMantle(scene: THREE.Scene) {
  const mask = await loadMask('./mantle-mask.png');
  // Andrew's own tracing of the hung turret and the seam under it, dark as
  // foliage, on a crop of the reference (486 x 1130, its left edge and top
  // 96 and 104 of the reference's full pixels, at 1.473 to one).
  const hungMask = await loadMask('./mantle-hung.png', [486, 1130]);
  const { gate, drum, slim, turret, hung } = CASTLE;
  const top = drum.top;
  // Shaded like one of the garden's tree crowns (Andrew, 2026-11-07): the
  // skin swells into a few broad lumps, rounding down to the stone at its
  // edges, in the shrubs' green and shaded only by its own smooth normals,
  // so it reads as quiet masses; leaf cards all over it, lit by the
  // shell's normals, so the lumps still read through the leaves.
  const material = painted(SHRUB, { vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  // How far the lumps stand off the skin (m), and how far in from the edge
  // they have fully risen.
  const SWELL = 1.2, ROLL = 2.2;
  // Leaves this far apart all over the shell (Andrew: leaves across the
  // whole surface, not just the edge).
  const SPACING = 0.5;
  const cards: Card[] = [];
  let seed = 3571;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shell = (geometry: THREE.BufferGeometry, out: (p: THREE.Vector3) => THREE.Vector3) => {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    const colour = geometry.getAttribute('color'), edge = geometry.getAttribute('edge');
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let k = 0; k < position.count; k++) {
      p.fromBufferAttribute(position, k);
      n.fromBufferAttribute(normal, k);
      if (n.dot(out(p)) < 0) n.negate();
      const rise = SWELL * lump(p) * THREE.MathUtils.smoothstep(edge.getX(k), 0, ROLL);
      position.setXYZ(k, p.x + n.x * rise, p.y + n.y * rise, p.z + n.z * rise);
      // A touch darker than the leaves' lit green, as the crowns' cards are
      // evened out to (foliage.ts flattening).
      colour.setXYZ(k, 0.92, 0.92, 0.92);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  // Leaf cards over all of a skin's covered triangles, evenly by area,
  // each lit by the shell's normal there.
  const fringe = (geometry: THREE.BufferGeometry, out: (p: THREE.Vector3) => THREE.Vector3) => {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    const colour = geometry.getAttribute('color'), index = geometry.getIndex()!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
    const na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3();
    let owed = random();
    for (let t = 0; t < index.count; t += 3) {
      const [ia, ib, ic] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      a.fromBufferAttribute(position, ia); b.fromBufferAttribute(position, ib); c.fromBufferAttribute(position, ic);
      const area = m.subVectors(c, b).cross(a.clone().sub(b)).length() / 2;
      owed += area / (SPACING * SPACING);
      while (owed >= 1) {
        owed -= 1;
        let u = random(), v = random();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        const w = 1 - u - v;
        if (colour.getW(ia) * w + colour.getW(ib) * u + colour.getW(ic) * v < 0.5) continue;
        na.fromBufferAttribute(normal, ia); nb.fromBufferAttribute(normal, ib); nc.fromBufferAttribute(normal, ic);
        const at = a.clone().multiplyScalar(w).addScaledVector(b, u).addScaledVector(c, v);
        const n = na.clone().multiplyScalar(w).addScaledVector(nb, u).addScaledVector(nc, v).normalize();
        if (n.dot(out(at)) < 0) n.negate();
        const size = 1.0 + random() * 0.45;
        cards.push({ at: at.addScaledVector(n, 0.06), w: size, h: size, normal: n, spin: random() * Math.PI * 2 });
      }
    }
  };
  const away = (x: number, z: number) => (p: THREE.Vector3) => new THREE.Vector3(p.x - x, 0, p.z - z);
  const add = (geometry: THREE.BufferGeometry, cast: boolean, out: (p: THREE.Vector3) => THREE.Vector3) => {
    shell(geometry, out);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    fringe(geometry, out);
  };
  // The arch's lining, how far outside its opening.
  const LINING = 0.8;
  // The green opens round one window: the one at the foot of the tongue,
  // nearest where the reference has its window hole (548, 850 in its
  // pixels: 2.6 m up, about a third of a quarter turn east of the arch).
  // The reference's other window holes are filled in when the mask is traced.
  const HOLE = new THREE.Vector3(Math.sin(0.3) * gate.radiusAt(2.6), gate.foot + 2.6, gate.z - Math.cos(0.3) * gate.radiusAt(2.6));
  const near = [...CASTLE.windows].sort((p, q) => p.at.distanceTo(HOLE) - q.at.distanceTo(HOLE)).slice(0, 1);
  const MARGIN = 0.35;
  const open = (p: THREE.Vector3) => {
    let keep = 1;
    for (const { at, size } of near) {
      const dy = p.y - at.y;
      if (Math.abs(dy) > 2.5) continue;
      const dx = Math.hypot(p.x - at.x, p.z - at.z);
      if (dx > 2) continue;
      const d = Math.hypot(dx / (WINDOW.width * size / 2 + MARGIN), dy / (WINDOW.height * size / 2 + MARGIN));
      keep = Math.min(keep, THREE.MathUtils.smoothstep(d, 0.85, 1.15));
    }
    return keep;
  };
  // Pixels a metre up the tower's foot, used across the drum too.
  const scale = (895 - rowAt(top)) / top;

  // The great tower's skin, by angle round it (positive east, the
  // reference's left) and height. Across the reference, its middle is the
  // arch; east to the limb is a quarter turn, west to the seam is the angle
  // the drum's seam is at. Clear of the arch's opening and lining.
  {
    const seamAngle = -Math.asin(15 / gate.radiusAt(top - gate.foot));
    const from = seamAngle - 0.2, to = Math.PI / 2, step = 0.25;
    const columns = Math.ceil((to - from) * gate.radiusAt(0) / step) + 1, rows = Math.ceil((SHOULDER + 0.6) / step) + 1;
    add(grid(columns, rows, (i, j) => {
      const a = from + (to - from) * i / (columns - 1), h = j * step;
      const r = gate.radiusAt(h) + OFF, y = gate.foot + h;
      const p = new THREE.Vector3(Math.sin(a) * r, y, gate.z - Math.cos(a) * r);
      const u = a > 0 ? REF.arch - Math.sin(a) * (REF.arch - REF.limb) : Math.min(REF.seam - 25, REF.arch + Math.sin(a) / Math.sin(seamAngle) * (REF.seam - REF.arch));
      // Clear of the arch's lining, and down to meet its top: just over it,
      // as green as the reference is a little higher up, where its own arch
      // (taller than ours) ends.
      const lining = CASTLE.archAt(p.x, LINING);
      if (h > SHOULDER + 0.3 || y < lining) return [p, 0];
      // Not inside the drum, where the arcade's gallery runs into the
      // tower's foot and it would show through the arches.
      if (y < CASTLE.drum.top && Math.hypot(p.x - CASTLE.drum.cx, p.z - CASTLE.drum.cz) < CASTLE.drum.r) return [p, 0];
      let cover = mask(u, rowAt(h, u));
      if (lining > 0 && y < lining + 2.2) cover = Math.max(cover, mask(u, rowAt(lining + 2.4 - gate.foot, u)));
      return [p, cover * open(p)];
    }), false, away(0, gate.z));
  }

  // The drum's skin, by distance along its face from the seam (west, the
  // reference's right), from the water up to its lip (over the arcade only
  // by the seam), where it turns
  // in over the edge. Past the reference's right edge, its last stretch
  // again, mirrored back and forth.
  {
    const seamZ = gate.z - Math.sqrt(gate.radiusAt(top - gate.foot) ** 2 - 225);
    const seamAt = Math.atan2(-15 - drum.cx, -(seamZ - drum.cz));
    const length = 60, step = 0.25, bottom = gate.foot, ARCADE = 7.2;
    const columns = Math.ceil(length / step) + 1, rows = Math.ceil((top - bottom) / step) + 2;
    const end = REF.width - 6, back = 180, SEAM_FILL = 3;
    // The strand down the tower's side of the seam, wherever it wanders
    // across the last few metres before the seam.
    const strand = (v: number) => Math.max(...[875, 895, 915, 930].map(u => mask(u, v)));
    // Where the seam is at a height: the great tower is wider lower down,
    // so the seam runs further round the drum (by angle on the drum).
    const seamAtHeight = (h: number) => {
      const R = gate.radiusAt(Math.max(0, h - gate.foot));
      const inside = (a: number) => Math.hypot(drum.cx + Math.sin(a) * drum.r, drum.cz - Math.cos(a) * drum.r - gate.z) < R;
      let lo = seamAt - 0.6, hi = seamAt + 0.6;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; }
      return (lo + hi) / 2;
    };
    // The reference's patches over the arcade (Andrew, 2026-11-07): taller
    // than the mask has them, streaks running down the wall and on down the
    // nearest pier between the arches. Where they are along the drum (m from
    // the seam, where the mask has them), how far up they start and how far
    // down the pier they reach. The one furthest west left out (Andrew).
    const STREAK_TOP = 11.5;
    const pierS = drum.piers.map(a => (((seamAt - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * drum.r);
    const streaks = [[3.5, 11.2, 2.6], [11.3, 10.4, 3.8], [28.2, 11.4, 1.8], [32.2, 9.8, 4.4], [49.1, 10.8, 3.0]].map(([at, from, to]) => {
      const pier = pierS.reduce((best, q) => Math.abs(q - at) < Math.abs(best - at) ? q : best, Infinity);
      return { at, pier, from, to };
    });
    const streak = (s: number, h: number) => {
      let cover = 0;
      for (const { at, pier, from, to } of streaks) {
        if (h < to - 0.5) continue;
        // Drifting over to the pier on the way down to the arcade.
        const toward = 1 - THREE.MathUtils.smoothstep(h, ARCADE + 0.4, from - 1);
        const centre = at + (pier - at) * toward + 0.25 * Math.sin(h * 1.3 + at) + 0.35 * Math.sin(h * 0.55 + at * 3) * THREE.MathUtils.smoothstep(h, from, from + 1.5);
        // Broad on the wall, narrowing onto the pier, tapering to a point at
        // the bottom; at its top a thin trail of green up the wall to the
        // mantle over it, whose edge dips down to meet it (Andrew's crop of
        // the reference, 2026-11-07).
        const wide = h > ARCADE ? 0.75 + 0.25 * Math.sin(h * 0.9 + at * 2) : Math.min(drum.pierHalf - 0.08, 0.5);
        const trail = 0.32 + 0.08 * Math.sin(h * 2.1 + at);
        const body = wide + (trail - wide) * THREE.MathUtils.smoothstep(h, from - 0.8, from + 0.6);
        const dip = 1.6 * THREE.MathUtils.smoothstep(h, top - 3.5, top - 0.5);
        const half = (body + dip) * THREE.MathUtils.smoothstep(h, to, to + 1.6);
        // Never over an arch's opening: under the arcade's top, only on a pier.
        if (h < ARCADE && Math.abs(s - pier) > drum.pierHalf - 0.05) continue;
        cover = Math.max(cover, 1 - THREE.MathUtils.smoothstep(Math.abs(s - centre), half - 0.08, half + 0.08));
      }
      return cover;
    };
    const drumGrid = grid(columns, rows, (i, j) => {
      // Starting a little inside the great tower, so it meets the tower's
      // skin with no gap wherever the seam runs.
      const s = Math.max(0, i * step - 2), a = seamAt - (i * step - 2) / drum.r;
      const last = j === rows - 1, h = Math.min(top, bottom + j * step);
      // The top row turns in over the lip, onto the roof.
      const r = last ? drum.r - 0.3 : drum.r + OFF, y = last ? top + OFF : h;
      const p = new THREE.Vector3(drum.cx + Math.sin(a) * r, y, drum.cz - Math.cos(a) * r);
      let u = REF.seam + s * scale;
      if (u > end) {
        const t = (u - end) % (2 * back);
        u = t < back ? end - t : end - 2 * back + t;
      }
      // The corner with the great tower filled: the strand running down the
      // tower's side of the seam carries on round onto the drum, thinning out
      // over a few metres.
      let cover = mask(u, 895 - h * scale);
      // Distance from the seam at this height.
      const fromSeam = (seamAtHeight(h) - a) * drum.r;
      // Over the arcade, only that strand, down to the water beside the
      // first arch.
      if (h < ARCADE) cover = 0;
      // The little patches over the arcade drawn as streaks instead.
      if (h < STREAK_TOP && fromSeam > SEAM_FILL) cover = 0;
      cover = Math.max(cover, streak(s, h));
      if (fromSeam < SEAM_FILL) cover = Math.max(cover, strand(895 - h * scale) * (1 - Math.max(0, fromSeam) / SEAM_FILL) * 1.4
        * (h < ARCADE ? 1 - THREE.MathUtils.smoothstep(fromSeam, 0.6, 1.2) : 1));
      return [p, cover * open(p)];
    });
    add(drumGrid, false, away(drum.cx, drum.cz));
  }

  // The slim tower's skin: the green climbing its wall from the slope, as
  // high as the reference has it on the tower to the right, mapped straight
  // across from the front (its front half only; the slope runs on down past
  // it rather than banking up against it), its top edge made uneven.
  {
    const step = 0.25, from = -Math.PI / 2 - 0.3, to = Math.PI / 2 + 0.3, h0 = top, h1 = top + 16;
    const columns = Math.ceil((to - from) * slim.r / step) + 1, rows = Math.ceil((h1 - h0) / step) + 1;
    add(grid(columns, rows, (i, j) => {
      const a = from + (to - from) * i / (columns - 1), y = h0 + j * step, r = slim.r + OFF;
      const p = new THREE.Vector3(slim.x + Math.sin(a) * r, y, slim.z - Math.cos(a) * r);
      // The reference's green there stops at one level, which wrapped
      // round the tower reads as a ruled line; so each way round, it is read
      // from a little higher or lower, a few metres either way, unevenly
      // (not low down, where it meets the slope).
      const w = 2.2 * Math.sin(3.1 * a + 0.6) + 1.3 * Math.sin(7.9 * a + 2.2) + 0.6 * Math.sin(19 * a + 1.1);
      const u = REF.seam + (-15 - p.x) * scale, v = 895 - (y - gate.foot + w * THREE.MathUtils.smoothstep(y - top, 1.5, 4)) * scale;
      return [p, u < REF.seam ? 0 : mask(Math.min(u, REF.width - 6), v)];
    }), false, away(slim.x, slim.z));
  }

  // The slope over the drum's roof, as a height over it: highest against
  // the great tower at the top of its shoulder band, falling to the lip;
  // up the slim tower as steeply as the room to the lip allows; round the
  // turret to just under its windows. Blended so the valleys between them
  // fill in softly.
  {
    const smax = (a: number, b: number, k: number) => {
      const h = Math.max(k - Math.abs(a - b), 0) / k;
      return Math.max(a, b) + h * h * k / 4;
    };
    // How far from a centre, along the line out through a point, to the
    // drum's lip.
    const toLip = (ox: number, oz: number, x: number, z: number) => {
      const dx = x - ox, dz = z - oz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const fx = ox - drum.cx, fz = oz - drum.cz, b = fx * ux + fz * uz, c = fx * fx + fz * fz - drum.r * drum.r;
      return -b + Math.sqrt(Math.max(0, b * b - c));
    };
    const fall = (d: number, length: number) => 1 - THREE.MathUtils.smoothstep(d, 0, Math.max(0.5, length));
    const shoulder = gate.radiusAt(SHOULDER);
    const base = top + OFF;
    // The great tower's own surface as a height over the roof: how high its
    // wall is at a distance from its middle (it narrows as it rises), so the
    // slope can blend into it without a crease.
    const wallTop = top - gate.foot;
    const towerAt = (d: number) => {
      // Only up to the shoulder band's top, where the mantle starts.
      if (d >= gate.radiusAt(wallTop) || d < gate.radiusAt(SHOULDER)) return -100;
      let lo = wallTop, hi = SHOULDER;
      for (let k = 0; k < 24; k++) { const h = (lo + hi) / 2; if (gate.radiusAt(h) > d) lo = h; else hi = h; }
      return gate.foot + lo;
    };
    const height = (x: number, z: number) => {
      const dG = Math.hypot(x, z - gate.z);
      const g = base + (SHOULDER + gate.foot - base) * fall(dG - shoulder, toLip(0, gate.z, x, z) - shoulder);
      const dT = Math.hypot(x - turret.x, z - turret.z);
      const t = base + (turret.lip - 2.4 - base) * fall(dT - turret.r, 5);
      // Everything comes down to the lip, rolling over it; by the seam, where
      // the lip runs into the great tower, down onto the tower's own face
      // (and its skin) instead of dropping to the roof.
      const lip = THREE.MathUtils.smoothstep(drum.r - Math.hypot(x - drum.cx, z - drum.cz), 0.3, 6);
      const tower = towerAt(dG), floor = Math.max(base, tower + OFF);
      return floor + (smax(smax(g, tower, 4), t, 5) - floor) * lip;
    };
    const step = 0.3, x0 = drum.cx - drum.r, z0 = drum.cz - drum.r, n = Math.ceil(2 * drum.r / step) + 1;
    add(grid(n, n, (i, j) => {
      const x = x0 + i * step, z = z0 + j * step;
      const y = height(x, z);
      // Only over the drum: inside the towers and turret it is hidden.
      const inside = Math.hypot(x - drum.cx, z - drum.cz) < drum.r - 0.3;
      return [new THREE.Vector3(x, y, z), inside ? 1 : 0];
    }, step), true, () => new THREE.Vector3(0, 1, 0));
    // The tree on the slope (Andrew's crop of the reference): out on the
    // slope from the great tower's shoulder, up and to the left of the
    // turret as seen from the garden. Its crown low, over the windows just
    // above the great tower's shoulder band, and well under the roofline;
    // kept clear of the great tower and the slim tower behind it.
    const keepOut = (p: THREE.Vector3, room: number) => {
      for (const [cx, cz, R] of [[0, gate.z, gate.radiusAt(Math.max(0, p.y - gate.foot))], [slim.x, slim.z, slim.r]]) {
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), want = R + room;
        if (d < want) { p.x = cx + dx / d * want; p.z = cz + dz / d * want; }
      }
      return p;
    };
    const fx = -14, fz = 60;
    slopeTree(scene, new THREE.Vector3(fx, height(fx, fz) + 0.4, fz), 15, keepOut, 5,
      // Rooted further back up the slope, against the castle (Andrew).
      new THREE.Vector3(-17, height(-17, 64.5) + 0.4, 64.5));
  }

  // The east tower's terracotta band, from Andrew's reference: tufts along
  // its top edge, where the wall over it meets the tiles, in clumps a few
  // metres long with gaps between, some trailing a way down the tiles and a
  // little way up the wall. Only what faces the garden and stands clear of
  // the great tower.
  {
    const E = hung.east, step = 0.125, y0 = E.bandLow - 0.3, y1 = E.bandHigh + 2.5;
    const R0 = E.radiusAt(E.bandHigh), from = -Math.PI * 0.75, to = Math.PI * 0.75;
    const columns = Math.ceil((to - from) * R0 / step) + 1, rows = Math.ceil((y1 - y0) / step) + 1;
    const wave = (s: number, k: number[]) => k.reduce((sum, f, i) => sum + Math.sin(s * f + i * 1.9 + 0.7), 0) / k.length;
    add(grid(columns, rows, (i, j) => {
      const b = from + (to - from) * i / (columns - 1), y = y0 + j * step;
      const R = E.radiusAt(y) + OFF, s = b * R0;
      const p = new THREE.Vector3(E.x + Math.sin(b) * R, y, E.z - Math.cos(b) * R);
      if (Math.hypot(p.x, p.z - gate.z) < gate.radiusAt(Math.max(0, y - gate.foot)) + 0.2) return [p, 0];
      // How thick the clump is here (0 in the gaps), and how far it trails.
      const clump = THREE.MathUtils.clamp(wave(s, [0.21, 0.47, 0.83]) * 1.6 + 0.35, 0, 1);
      const trail = Math.max(0, wave(s, [0.61, 1.07])) * clump;
      const up = 0.15 + 1.1 * clump * (0.5 + 0.5 * wave(s, [0.39, 0.9]));
      const down = clump * 0.9 + trail * (E.bandHigh - E.bandLow) * 1.1;
      const over = y - E.bandHigh;
      const cover = over > 0 ? 1 - THREE.MathUtils.smoothstep(over, up - 0.1, up + 0.1) : 1 - THREE.MathUtils.smoothstep(-over, down - 0.15, down + 0.15);
      return [p, clump > 0.05 ? cover : 0];
    }, step), false, away(hung.east.x, hung.east.z));
  }

  // The hung turret in the seam with the east tower, from Andrew's tracing:
  // green all over its roof, on its walls where the tracing has it (in its
  // pixels: the turret's middle at 300, 28 a metre, its wall from 200 at the
  // top down to 405), down the cone under it (410 to 720, narrowing to the
  // seam at 250) and in the seam below to the water (720 to 1110, the seam
  // at 240, the east tower to the left of it and the great tower to the
  // right). Only what faces the garden.
  {
    const PX = 28, step = 0.25, H = hung;
    const facing = (n: THREE.Vector3) => n.z < 0.15;
    const ring = (columns: number, rows: number, at: (w: number, j: number) => [THREE.Vector3, THREE.Vector3, number]) =>
      grid(columns, rows, (i, j) => {
        const [p, n, cover] = at(i / (columns - 1) * Math.PI * 2, j);
        return [p, facing(n) ? cover : 0];
      });
    const around = Math.ceil(Math.PI * 2 * H.r / step) + 1;
    // Its dome, all green but for one little triangle of tiles at the front
    // of its rim (Andrew's crop): about 3.4 m across the rim, its point
    // 40% of the way up.
    const tilesShow = (w: number, k: number) => {
      const along = Math.abs(Math.atan2(Math.sin(w), Math.cos(w))) * H.r, up = k / 24;
      return along < 1.7 * (1 - up / 0.4);
    };
    add(ring(around, 25, (w, j) => {
      const t = j / 24 * Math.PI / 2, out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
      const r = (H.r + 0.25) * Math.cos(t) + OFF * Math.cos(t), y = H.lip + H.rise * Math.sin(t) + OFF * Math.sin(t) + 0.02;
      return [new THREE.Vector3(H.x + out.x * r, y, H.z + out.z * r), out.clone().multiplyScalar(Math.cos(t)).setY(Math.sin(t)), tilesShow(w, j) ? 0 : 1];
    }), true, p => new THREE.Vector3(p.x - hung.x, p.y - hung.lip, p.z - hung.z));
    // Its wall, and the lip round its foot (0.35 m out, so the skin steps
    // out over it).
    const wallRows = Math.ceil((H.lip - H.foot + 0.6) / step) + 1;
    add(ring(around, wallRows, (w, j) => {
      const y = H.foot - 0.6 + j * step, out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
      const r = H.r + OFF + (y < H.foot + 0.05 ? 0.35 : 0);
      const p = new THREE.Vector3(H.x + out.x * r, y, H.z + out.z * r);
      const hy = 405 - (y - H.foot) / (H.lip - H.foot) * 205;
      return [p, out, hungMask(300 - (p.x - H.x) * PX, hy)];
    }), false, away(hung.x, hung.z));
    // The cone, leaning into the seam as it narrows, as built in city.ts.
    const coneTop = H.foot - 0.6, coneTall = coneTop - H.tipY, coneRows = Math.ceil(coneTall / step) + 1;
    add(ring(around, coneRows, (w, j) => {
      const t = j / (coneRows - 1), out = new THREE.Vector3(Math.sin(w), 0, -Math.cos(w));
      const cx = H.x + (H.tip[0] - H.x) * t, cz = H.z + (H.tip[1] - H.z) * t, r = H.r * (1 - t) + OFF;
      const p = new THREE.Vector3(cx + out.x * r, coneTop - coneTall * t, cz + out.z * r);
      const n = out.clone().setY(H.r / coneTall).normalize();
      return [p, n, hungMask(300 + (250 - 300) * t - (p.x - cx) * PX, 410 + 310 * t)];
    }), false, away(hung.x, hung.z));
    // The seam, from level with the turret's dome down to the water: a strip
    // on each tower, out to 5 m from the seam, solid near the seam and traced
    // beyond.
    // Finer than the rest, so its long smooth edge doesn't step.
    const fine = step / 2, seamRows = Math.ceil((H.lip + H.rise - gate.foot) / fine) + 1, across = Math.ceil(5 / fine) + 1;
    for (const side of [1, -1]) add(grid(across, seamRows, (i, j) => {
      const y = gate.foot + j * fine, d = i * fine - 0.4;
      const [sx, sz] = H.seamAt(y);
      let p: THREE.Vector3;
      if (side > 0) {
        // On the great tower, round towards its front.
        const R = gate.radiusAt(Math.max(0, y - gate.foot)) + OFF, a = Math.atan2(sx, -(sz - gate.z)) - d / R;
        p = new THREE.Vector3(Math.sin(a) * R, y, gate.z - Math.cos(a) * R);
      } else {
        // On the east tower, round towards its front.
        const R = H.east.radiusAt(y) + OFF, b = Math.atan2(sx - H.east.x, -(sz - H.east.z)) + d / R;
        p = new THREE.Vector3(H.east.x + Math.sin(b) * R, y, H.east.z - Math.cos(b) * R);
      }
      const hy = 1110 - (y - gate.foot) / (H.tipY - gate.foot) * 390;
      // The seam itself filled solid all the way down (Andrew, 2026-11-07),
      // a couple of metres out on the east tower and more on the great tower,
      // where the reference's thick column of green runs down it (Andrew's
      // lower-band crop), and on the east tower wider again beside the cone
      // and the turret, so it shows past them; its edge wandering.
      // Thinning out towards the water, below the band.
      const low = THREE.MathUtils.smoothstep(y - gate.foot, 10, 17);
      const width = (side > 0 ? 1.1 + 2.3 * low : 1.1 + 0.8 * low + 2.5 * THREE.MathUtils.smoothstep(y, H.tipY - 4, H.tipY + 2)) + (0.3 + 0.6 * low) * Math.sin(0.41 * y + 2 * side) + (0.3 + 0.4 * low) * Math.sin(0.83 * y + side) + 0.3 * Math.sin(1.4 * y + 1.7 * side);
      // Tongues reaching further out here and there.
      const tongue = Math.max(0, Math.sin(0.29 * y + 0.8 * side) * Math.sin(0.61 * y + 0.3)) * (0.8 + 1.4 * low);
      const core = 1 - THREE.MathUtils.smoothstep(d, width + tongue - 0.2, width + tongue + 0.2);
      return [p, Math.max(core, hungMask(240 + side * Math.max(0, d) * PX, hy))];
    }, fine), false, side > 0 ? away(0, gate.z) : away(hung.east.x, hung.east.z));
  }

  instanced(cardGeometry(cards), leafCards(SHRUB, clusterTexture(67), SWAY.ivy), [new THREE.Matrix4()], scene);
}
