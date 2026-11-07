import * as THREE from 'three';

// The retaining wall under the garden's front, from Andrew's references
// (docs/wall-reference-painting.png and docs/wall-reference-profile.png).
// In section: a lip of stone under the lawn, then the underside curving
// back in under the garden like the soffit of a vault, level at the lip and
// plumb at the foot, then straight down into the clouds. Round-headed
// arches are sunk into the curve side by side, a blind arcade, each one
// framed by a band between two dark joints, with a few small dark openings
// in it.

export const WALL = {
  // The lip, from the lawn's underside down to where the curve starts.
  lip: 4.5,
  // How far the curve runs back in under the garden, and how far down.
  overhang: 11,
  drop: 11,
  bottom: -40,
  // The arches: one every pitch metres along the lip, half wide, their crown
  // crown metres down the face from the lip and their feet reach metres
  // below the curve's foot. The band round each, how far the arch is sunk,
  // and the openings' extra depth.
  pitch: 18,
  half: 7,
  crown: 1.2,
  reach: 7,
  band: 0.8,
  recess: 0.6,
  hole: 0.35,
};
// The lawn's underside, where the wall starts.
const TOP = -0.3;

export type WallLine = { x: number, z: number, nx: number, nz: number, s: number, depth: number }[];

// The front, as points along it from one end to the other, resampled every
// step metres, each with its inward normal, its distance along the lip
// (0 where it crosses x = 0) and how far the curve runs back in there. The
// curve comes in flush at the ends, and runs in no further than 1.5 m short
// of room(x, z): how far in from the lip the nearest thing is that the
// curve mustn't cut into (the moats, if they come close).
export function wallLine(front: number[][], room: (x: number, z: number) => number, step = 0.2): WallLine {
  const lengths = [0];
  for (let i = 1; i < front.length; i++) lengths.push(lengths[i - 1] + Math.hypot(front[i][0] - front[i - 1][0], front[i][1] - front[i - 1][1]));
  const total = lengths[lengths.length - 1];
  const at = (s: number) => {
    let k = 1;
    while (k < lengths.length - 1 && lengths[k] < s) k++;
    const f = (s - lengths[k - 1]) / (lengths[k] - lengths[k - 1] || 1);
    return [front[k - 1][0] + (front[k][0] - front[k - 1][0]) * f, front[k - 1][1] + (front[k][1] - front[k - 1][1]) * f];
  };
  // Where it crosses x = 0.
  let zero = 0;
  for (let i = 1; i < front.length; i++) if (front[i - 1][0] <= 0 && front[i][0] > 0) {
    zero = lengths[i - 1] + (lengths[i] - lengths[i - 1]) * (-front[i - 1][0]) / (front[i][0] - front[i - 1][0]);
  }
  const smooth = (e0: number, e1: number, v: number) => { const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
  const first = Math.ceil(-zero / step), last = Math.floor((total - zero) / step);
  const line: WallLine = [];
  for (let i = first; i <= last; i++) {
    const s = i * step, [x, z] = at(zero + s);
    const [ax, az] = at(Math.max(zero + s - 0.5, 0)), [bx, bz] = at(Math.min(zero + s + 0.5, total));
    const tl = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / tl, tz = (bz - az) / tl;
    const ends = smooth(0, 24, Math.min(zero + s, total - zero - s));
    const depth = Math.min(WALL.overhang * ends, Math.max(room(x, z) - 1.5, 0));
    line.push({ x, z, nx: -tz, nz: tx, s, depth });
  }
  return line;
}

// The line the stone behind the wall stops at: the foot of the curve, a
// little further in, every so often along it.
export const wallInset = (line: WallLine, every = 5) =>
  line.filter((_, i) => i % every === 0 || i === line.length - 1).map(({ x, z, nx, nz, depth }) => [x + nx * (depth + 0.1), z + nz * (depth + 0.1)]);

// A seeded random, for the openings.
const rand = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

// A hole in the lip for a root to come out of: where it is along the lip
// and down from the lawn, its radius and a seed for its ragged edge.
// big: three roots out of it, bundled as one.
export type RootHole = { s: number, t: number, r: number, seed: number, big?: boolean };

export function wallGeometry(line: WallLine, metres: number, rootHoles: RootHole[] = []) {
  const { lip, overhang: D, drop: H, bottom } = WALL;
  // The curve's length at full size, and at each step down it.
  const curveSteps = 110, theta = (j: number) => j / curveSteps * Math.PI / 2;
  const arc = [0];
  for (let j = 1; j <= curveSteps; j++) {
    const a = theta(j - 1), b = theta(j);
    arc.push(arc[j - 1] + Math.hypot(D * (Math.sin(b) - Math.sin(a)), H * (Math.cos(b) - Math.cos(a))));
  }
  const curve = arc[curveSteps];
  // The rows down the face: on the lip, round the curve, then down the
  // plumb face, finely while the arches reach, coarsely after.
  type Row = { kind: 'lip', a: number } | { kind: 'curve', j: number } | { kind: 'plumb', y: number };
  const rows: Row[] = [];
  // Finely on the lip, for the roots' holes.
  for (let k = 0; k <= 24; k++) rows.push({ kind: 'lip', a: k / 24 });
  for (let j = 1; j <= curveSteps; j++) rows.push({ kind: 'curve', j });
  const foot = TOP - lip - H;
  for (let y = 0.2; y <= WALL.reach + 1.5; y += 0.2) rows.push({ kind: 'plumb', y: foot - y });
  for (const y of [-25, -32, bottom]) if (y < foot - WALL.reach - 1.5) rows.push({ kind: 'plumb', y });

  // The arches: their middles every pitch along the lip, one at s = 0
  // (under the bridge, which lands in it). Each one as a distance in from its edge, in the
  // face's own metres (s along, t down): negative outside it.
  const { pitch, half, crown, reach, band } = WALL;
  const spring = lip + crown + half, feet = lip + curve + reach;
  const archAt = (s: number, t: number) => {
    const c = Math.round(s / pitch) * pitch, dx = Math.abs(s - c);
    const edge = t > spring ? half - dx : half - Math.hypot(dx, t - spring);
    return { c, inside: Math.min(edge, feet - t) };
  };
  // Only where the curve runs its full depth, all across the arch.
  const full = new Set<number>();
  for (const { s, depth } of line) if (depth < D * 0.98) full.add(Math.round(s / pitch));
  // The openings in each arch: a few small dark rectangles, as middles and
  // half sizes in (s, t).
  const holes = new Map<number, number[][]>();
  const holesIn = (c: number) => {
    const key = Math.round(c / pitch * 2);
    if (!holes.has(key)) {
      const random = rand(4049 + key * 131), list: number[][] = [];
      const count = 3 + Math.floor(random() * 4);
      for (let k = 0; k < count; k++) {
        const hs = 0.22 + random() * 0.12, ht = 0.3 + random() * 0.15;
        list.push([c + (random() - 0.5) * 2 * (half - band - 1), spring + 1 + random() * (feet - spring - 5), hs, ht]);
      }
      holes.set(key, list);
    }
    return holes.get(key)!;
  };

  const positions: number[] = [], uvs: number[] = [], colors: number[] = [];
  const smooth = (e0: number, e1: number, v: number) => { const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
  for (const { x, z, nx, nz, s, depth } of line) {
    const k = depth / D, arched = !full.has(Math.round(s / pitch));
    for (const row of rows) {
      // Where it is in section (how far in, and its height), its outward
      // normal there, and how far down the face it is, at this point's
      // own size and at full size.
      let inset: number, y: number, ni: number, ny: number, t: number, tFull: number;
      if (row.kind === 'lip') {
        inset = 0; y = TOP - row.a * lip; ni = -1; ny = 0; t = tFull = row.a * lip;
      } else if (row.kind === 'curve') {
        const a = theta(row.j);
        inset = k * D * Math.sin(a); y = TOP - lip - k * H * (1 - Math.cos(a));
        const l = Math.hypot(Math.sin(a) / D, Math.cos(a) / H);
        ni = -Math.sin(a) / D / l; ny = -Math.cos(a) / H / l;
        if (k < 1e-3) { ni = -1; ny = 0; }
        t = lip + k * arc[row.j]; tFull = lip + arc[row.j];
      } else {
        inset = k * D; y = row.y; ni = -1; ny = 0;
        t = lip + k * curve + (foot + (1 - k) * H - row.y); tFull = lip + curve + (foot - row.y);
      }
      // Sunk where it's in an arch: the band round it stays at the face,
      // a dark joint either side of it, and the openings sink further.
      let sink = 0, shade = 1;
      if (arched) {
        const { c, inside } = archAt(s, tFull);
        const joint = (d: number) => 1 - 0.55 * (1 - smooth(0.04, 0.16, Math.abs(d)));
        shade *= joint(inside) * joint(inside - band);
        if (inside > band) {
          sink = WALL.recess * smooth(band, band + 0.25, inside);
          shade *= 0.86;
          for (const [hs, ht, ws, wt] of holesIn(c)) {
            const d = Math.min(ws - Math.abs(s - hs), wt - Math.abs(tFull - ht));
            if (d > -0.05) {
              const m = smooth(-0.05, 0.08, d);
              sink += WALL.hole * m;
              shade *= 1 - 0.75 * m;
            }
          }
        }
      }
      // The roots' holes in the lip: dark and sunk, ragged at the edge,
      // a little moss round some of them.
      let moss = 0;
      if (row.kind === 'lip') for (const hole of rootHoles) {
        const ds = s - hole.s, dt = t - hole.t;
        if (Math.abs(ds) > hole.r * 2 || Math.abs(dt) > hole.r * 2) continue;
        const angle = Math.atan2(dt, ds), rough = 1 + 0.16 * Math.sin(3 * angle + hole.seed) + 0.09 * Math.sin(5 * angle + hole.seed * 2.3);
        const d = Math.hypot(ds, dt) / (hole.r * rough);
        // A steep ragged rim, then a deep throat going black at the back,
        // so the hole reads as running far into the stone.
        // Darkening gradually down it, through the stone's deepest shadow,
        // to black at the back (with the dark disc there, roots.ts).
        const m = 1 - smooth(0.82, 1.02, d), deep = 1 - smooth(0.55, 0.9, d), dim = 1 - smooth(0.2, 1.0, d);
        sink += 0.45 * m + 1.1 * deep;
        shade *= (1 - 0.45 * m) * (1 - 0.9 * dim);
        if (hole.seed % 3 < 1.6) moss = Math.max(moss, (1 - smooth(1.0, 1.5, d)) * smooth(0.85, 1.0, d) * (dt < 0 ? 1 : 0.5));
      }
      inset -= ni * sink; y -= ny * sink;
      positions.push(x + nx * inset, y, z + nz * inset);
      uvs.push(s / metres, -t / metres);
      // Joints a little violet, as the painting's.
      colors.push(shade * (1 - 0.45 * moss), shade * (0.97 - 0.05 * moss), (shade * 0.97 + (1 - shade) * 0.12) * (1 - 0.55 * moss));
    }
  }
  const n = rows.length, indices: number[] = [];
  for (let i = 0; i < line.length - 1; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = a + n;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Do two polylines (as closed outlines, or open lines) cross? For checking
// the stone's new outline against the moats and itself.
export function crossings(a: number[][], b: number[][] = a) {
  const self = a === b;
  const cross = (p: number[], q: number[], r: number[], s: number[]) => {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (Math.abs(d) < 1e-12) return false;
    const u = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
    const v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return u > 1e-9 && u < 1 - 1e-9 && v > 1e-9 && v < 1 - 1e-9;
  };
  let count = 0;
  for (let i = 0; i < a.length; i++) for (let j = self ? i + 2 : 0; j < b.length; j++) {
    if (self && i === 0 && j === a.length - 1) continue;
    if (cross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) count++;
  }
  return count;
}

// Where the face is, in section, a given way down it from the lawn: how far
// in from the lip and how high, and its outward normal there (in, up), for a
// point of the line whose curve runs back k of the way. down is in metres
// down the face at full depth, as the arches use.
export function wallSection(k: number, down: number) {
  const { lip, overhang: D, drop: H } = WALL;
  if (down <= lip) return { inset: 0, y: TOP - down, ni: -1, ny: 0 };
  // Down the curve by its angle, roughly by arc length.
  const quarter = Math.PI / 2, full = curveLength();
  if (down < lip + full) {
    let a = 0;
    const want = down - lip;
    // Newton-free: step along until the arc length is reached.
    let got = 0;
    const steps = 200;
    for (let j = 1; j <= steps && got < want; j++) {
      const a0 = (j - 1) / steps * quarter, a1 = j / steps * quarter;
      got += Math.hypot(D * (Math.sin(a1) - Math.sin(a0)), H * (Math.cos(a1) - Math.cos(a0)));
      a = a1;
    }
    const l = Math.hypot(Math.sin(a) / D, Math.cos(a) / H);
    return { inset: k * D * Math.sin(a), y: TOP - lip - k * H * (1 - Math.cos(a)), ni: k < 1e-3 ? -1 : -Math.sin(a) / D / l, ny: k < 1e-3 ? 0 : -Math.cos(a) / H / l };
  }
  return { inset: k * D, y: TOP - lip - k * H - (down - lip - full), ni: -1, ny: 0 };
}
let curveCache = 0;
function curveLength() {
  if (curveCache) return curveCache;
  const { overhang: D, drop: H } = WALL, steps = 200;
  for (let j = 1; j <= steps; j++) {
    const a0 = (j - 1) / steps * Math.PI / 2, a1 = j / steps * Math.PI / 2;
    curveCache += Math.hypot(D * (Math.sin(a1) - Math.sin(a0)), H * (Math.cos(a1) - Math.cos(a0)));
  }
  return curveCache;
}
