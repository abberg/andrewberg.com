import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fadesDeep, painted } from './look';
import { RootHole, WALL, WallLine, wallSection } from './wall';
import { wander as smoothNoise } from './growth';

// Roots from the garden above, as in Andrew's painting of the wall
// (docs/wall-reference-painting.png): thick and rope-like, out of holes in
// the lip and clinging to the stone all the way down, over the lip, round
// the vault's curve and on down the plumb face into the clouds. They wander
// across the face as they go; one splits, the big one is three twisted
// together, and thin side roots spread out over the stone like veins. Every root is half sunk in the face, so it grips it.

const material = fadesDeep(painted([0xa8844e, 0x5e4a5a]));

const rand = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

// The holes: just four, two either side of where the bridge meets the lip,
// the nearer one on the west the big one.
export function rootHoles(_line: WallLine): RootHole[] {
  return [
    { s: -10.5, t: 2.4, r: 1.3, seed: 11, big: true },
    { s: -23, t: 1.9, r: 0.7, seed: 37 },
    { s: 11.5, t: 2.1, r: 0.65, seed: 53 },
    { s: 25, t: 2.7, r: 0.7, seed: 71 },
  ];
}

// A root as its course over the face: points (s along the lip, down the face
// from the lawn), each with its radius and how far its middle stands off the
// stone, as a part of its radius (negative: still in the hole).
type Course = { s: number, down: number, r: number, off: number }[];

export function buildRoots(line: WallLine, holes: RootHole[]) {
  const random = rand(5501);
  const onFace = (s: number, down: number, off: number) => facePoint(line, s, down, off);

  // A wandering course down the face from (s, down): drift is how far it
  // slants along the lip for each metre down, sway how far it snakes either
  // side, over length metres; thick at the top, thinning to its end.
  const wander = (s: number, down: number, r0: number, r1: number, length: number, drift: number, sway: number, seed: number): Course => {
    const course: Course = [];
    const w1 = 0.12 + (seed % 7) * 0.02, w2 = 0.31 + (seed % 5) * 0.03, p = seed * 0.37;
    for (let d = 0; d <= length; d += 0.5) {
      const u = d / length;
      course.push({
        s: s + drift * d + sway * (Math.sin(d * w1 + p) - Math.sin(p)) + sway * 0.35 * (Math.sin(d * w2 + p * 2) - Math.sin(p * 2)),
        down: down + d, r: r0 + (r1 - r0) * u, off: 0.6,
      });
    }
    return course;
  };

  const tubes: THREE.BufferGeometry[] = [];
  // A tube along a course, its radius knobbly along its length.
  const tube = (course: Course, seed: number, sides = 10) => {
    if (course.length < 2) return;
    tubes.push(knobbly(course.map(({ s, down, r, off }) => onFace(s, down, r * off)), u => {
      const f = u * (course.length - 1), k = Math.min(Math.floor(f), course.length - 2);
      return course[k].r + (course[k + 1].r - course[k].r) * (f - k);
    }, seed, sides));
  };
  // Out of its hole: from inside it, out and turning down onto the face.
  const exit = (hole: RootHole, r: number, ds = 0): Course => [
    { s: hole.s + ds, down: hole.t - 0.5, r, off: -1.0 },
    { s: hole.s + ds, down: hole.t + 0.3, r, off: 0.35 },
  ];
  // Thin side roots spreading out from a course over the stone.
  const veins = (course: Course, count: number) => {
    for (let k = 0; k < count; k++) {
      const at = course[Math.floor((0.15 + random() * 0.7) * (course.length - 1))];
      const side = random() < 0.5 ? -1 : 1, length = 4 + random() * 8;
      tube(wander(at.s, at.down, Math.min(at.r * 0.35, 0.16), 0.03, length, side * (0.5 + random() * 1.2), 0.4 + random() * 0.8, Math.floor(random() * 1000)), k, 6);
    }
  };

  holes.forEach((hole, index) => {
    const length = 30 + random() * 8, drift = (random() - 0.5) * 0.6;
    const sway = 0.8 + random() * 1.2, seed = hole.seed, r = hole.r * 0.8;
    if (hole.big) {
      // Three roots out of the one hole, bundled tight and twisting round
      // each other so they read as one massive root, coming apart lower
      // down.
      const strand = 0.5, base = wander(hole.s, hole.t + 1.4, 1, 0.55, length, drift * 0.5, sway, seed);
      const together = 18;
      for (let k = 0; k < 3; k++) {
        const phase = k * Math.PI * 2 / 3, spread = (k - 1) * (0.35 + random() * 0.25);
        const course = base.map((c, i) => {
          const a = i * 0.5 * 0.6 + phase, apart = Math.max(c.down - hole.t - together, 0);
          const ring = strand * c.r * 1.05;
          return { ...c, s: c.s + Math.cos(a) * ring + spread * apart, r: strand * c.r, off: 0.7 + 0.9 * Math.sin(a) * c.r * 0.55 };
        });
        tube([...exit(hole, strand, Math.cos(phase) * 0.45), ...course], seed + k);
        veins(course.slice(Math.floor(course.length * 0.5)), 1 + Math.floor(random() * 2));
      }
    } else if (index === 1) {
      // One root that splits in two partway down, the two going their own
      // ways.
      const split = 7 + random() * 8, upper = wander(hole.s, hole.t + 1.3, r, r * 0.85, split, drift, sway * 0.5, seed);
      tube([...exit(hole, r), ...upper], seed);
      const end = upper[upper.length - 1];
      for (const side of [-1, 1]) {
        const course = wander(end.s, end.down, end.r * 0.75, end.r * 0.35, length - split, drift + side * (0.25 + random() * 0.35), sway, seed + side * 17);
        tube(course, seed + side);
        veins(course, 1 + Math.floor(random() * 2));
      }
    } else {
      const course = wander(hole.s, hole.t + 1.3, r, r * 0.4, length, drift, sway, seed);
      tube([...exit(hole, r), ...course], seed);
      veins(course, 1 + Math.floor(random() * 3));
    }
  });
  const geometry = mergeGeometries(tubes);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'roots';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}


// A point of the wall's face in the world, from its place along the lip (s)
// and down the face from the lawn, off the stone by off metres.
function facePoint(line: WallLine, s: number, down: number, off: number) {
  const start = line[0].s, step = line[1].s - line[0].s;
  const f = Math.min(Math.max((s - start) / step, 0), line.length - 1.001), i = Math.floor(f), u = f - i;
  const a = line[i], b = line[i + 1];
  const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
  let nx = a.nx + (b.nx - a.nx) * u, nz = a.nz + (b.nz - a.nz) * u;
  const l = Math.hypot(nx, nz);
  nx /= l; nz /= l;
  const k = (a.depth + (b.depth - a.depth) * u) / WALL.overhang;
  const { inset, y, ni, ny } = wallSection(k, down);
  const i2 = inset + ni * off;
  return new THREE.Vector3(x + nx * i2, y + ny * off, z + nz * i2);
}

// A knobbly tube through points, its radius from radius(u), u running from
// 0 at the first point to 1 at the last.
function knobbly(points: THREE.Vector3[], radius: (u: number) => number, seed: number, sides = 10) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / 0.4));
  const frames = curve.computeFrenetFrames(n, false);
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u);
    const r = radius(u) * (1 + 0.1 * Math.sin(u * 37 + seed) + 0.06 * Math.sin(u * 91 + seed * 2));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, lump = 1 + 0.07 * Math.sin(a * 3 + u * 23 + seed);
      const N = frames.normals[i], B = frames.binormals[i];
      positions.push(p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r * lump, p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r * lump, p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r * lump);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    // Wound so the faces look out from the tube.
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A branch off the big root that wraps round the bridge: it peels away from
// the bundle just under its hole, runs east along the lip face to where the
// bridge meets it, turns the corner onto the bridge's west side, and winds
// round the bridge twice over the first part of the span: under the arch, up
// the east side, over the deck (pressed nearly flat into the paving, so the
// robot walks over it) and back down the west side. bottom(z) is the
// underside of the bridge at z; its sides are at x = +-2.5 and its deck at
// y = 0. It's one strand all the way, its middle kept the same distance off
// both faces round every edge, so it bends over each arris like a root
// gripping a corner, its cross-section squashed flat on the deck and round
// again over the first half metre down the side.
export function bridgeBranch(line: WallLine, holes: RootHole[], bottom: (z: number) => number) {
  const big = holes.find(hole => hole.big);
  if (!big) return new THREE.Group();
  // knuckle: how much it swells where it grips an edge.
  type Sample = { p: THREE.Vector3, n: THREE.Vector3, r: number, flat: number, edge?: number };
  const samples: Sample[] = [];
  const r0 = 0.3, r1 = 0.09, W = 2.5;
  // Along the lip, from inside the bundle to just short of the bridge.
  const lipFrom = big.s + 0.3, lipTo = -W - 0.75;
  for (let s = lipFrom; s <= lipTo; s += 0.25) {
    const u = (s - lipFrom) / (lipTo - lipFrom), down = big.t + 1.6 + 0.35 * u + 0.15 * Math.sin(u * 7);
    samples.push({ p: facePoint(line, s, down, (u < 0.06 ? 0.2 : 0.6) * r0), n: new THREE.Vector3(0, 0, -1), r: r0, flat: 1 });
  }
  // A point round the bridge's section at z, at arc position t along its
  // perimeter (from the top of the west side, down it, under the arch, up
  // the east side and back over the deck), its middle off the stone by an
  // amount that is the side's below the deck's edges and the deck's on it
  // and round its edges. Corners count corner metres of perimeter.
  const corner = 0.7;
  const section = (z: number, t: number, r: number) => {
    const h = -bottom(z), lo = -h;
    const side = 0.6 * r, flatR = 0.5, onTop = 0.19 - r * flatR;
    const lengths = [h, corner, 2 * W, corner, h, corner, 2 * W, corner], total = lengths.reduce((a, b) => a + b);
    let at = ((t % total) + total) % total, k = 0;
    while (at > lengths[k]) at -= lengths[k++];
    // How much it's on the deck: all of it on the top and round its edges,
    // easing off over half a metre down each side.
    const topness = k === 0 ? 1 - THREE.MathUtils.smoothstep(at, 0, 0.5) : k === 4 ? 1 - THREE.MathUtils.smoothstep(h - at, 0, 0.5) : k >= 5 || k === 7 ? 1 : 0;
    // Round each edge it bulges a little off the arris, not a tight elbow.
    const edge = k % 2 === 1 ? Math.sin(Math.PI * Math.min(at / corner, 1)) : 0;
    const off = side + (onTop - side) * topness + 0.07 * edge, flat = 1 + (flatR - 1) * topness;
    let base: THREE.Vector3, normal: THREE.Vector3;
    const arc = (cx: number, cy: number, from: number) => {
      const a = from + (at / corner) * Math.PI / 2;
      normal = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      base = new THREE.Vector3(cx, cy, z);
    };
    if (k === 0) { base = new THREE.Vector3(-W, -at, z); normal = new THREE.Vector3(-1, 0, 0); }
    else if (k === 1) arc(-W, lo, Math.PI);
    else if (k === 2) { base = new THREE.Vector3(-W + at, lo, z); normal = new THREE.Vector3(0, -1, 0); }
    else if (k === 3) arc(W, lo, Math.PI * 1.5);
    else if (k === 4) { base = new THREE.Vector3(W, lo + at, z); normal = new THREE.Vector3(1, 0, 0); }
    else if (k === 5) arc(W, 0, 0);
    else if (k === 6) { base = new THREE.Vector3(W - at, 0, z); normal = new THREE.Vector3(0, 1, 0); }
    else arc(-W, 0, Math.PI / 2);
    return { p: base!.clone().addScaledVector(normal!, off), n: normal!, flat, total, edge, k };
  };
  // Round the inside corner from the lip onto the bridge's west side.
  const last = samples[samples.length - 1], startT = -last.p.y;
  for (let k = 1; k <= 4; k++) {
    const f = k / 5, n = new THREE.Vector3(-f, 0, -(1 - f)).normalize(), off = 0.6 * r0;
    samples.push({ p: new THREE.Vector3(-W - off - (1 - f) * 0.5, last.p.y, -off - f * 0.4).addScaledVector(n, 0), n, r: r0, flat: 1 });
  }
  // The wraps, sampled every few centimetres along them: not an even
  // helix but advancing unevenly along the span (the first turn tighter, and
  // slow over one crossing of the deck, so it goes nearly square there and
  // long and slanted over the other), and meandering sideways a little on
  // every face as it goes.
  const turns = 2, length = 10, z0 = -0.75;
  const total0 = section(z0, 0, r0).total, steps = Math.ceil(turns * total0 / 0.06);
  const sway = smoothNoise(17, 2.2), swell = smoothNoise(29, 1.4);
  const rate = (u: number) => 0.55 + 0.9 * u + 0.55 * Math.sin(u * Math.PI * 2 * 1.9 + 0.9);
  let advance = 0;
  const advances = [0];
  for (let i = 1; i <= steps; i++) advances.push(advance += Math.max(rate(i / steps), 0.05));
  // Knuckles at a couple of the edges it grips.
  const knuckles = new Set([1, 4, 6]);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, along = u * turns * total0;
    const z = z0 - length * advances[i] / advance + 0.75 * sway(along) * Math.min(1, along / 2);
    const r = (r0 + (r1 - r0) * u) * (1 + 0.22 * swell(along));
    const { total } = section(z, 0, r);
    const at = section(z, startT + u * turns * total, r);
    const count = Math.floor((u * turns * total + startT) / total * 4 + 0.5);
    samples.push({ p: at.p, n: at.n, r: r * (1 + (knuckles.has(count) ? 0.3 : 0.1) * at.edge), flat: at.flat, edge: at.edge });
  }
  // The strand as one tube, framed by the stone's normal so it doesn't
  // twist or pinch round the bends, flattened along that normal on the deck.
  const sides = 12, positions: number[] = [], indices: number[] = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  samples.forEach((sample, i) => {
    const prev = samples[Math.max(i - 1, 0)].p, next = samples[Math.min(i + 1, samples.length - 1)].p;
    T.subVectors(next, prev).normalize();
    N.copy(sample.n).addScaledVector(T, -sample.n.dot(T)).normalize();
    B.crossVectors(T, N);
    const u = i / (samples.length - 1), r = sample.r * (1 + 0.06 * Math.sin(u * 61) + 0.04 * Math.sin(u * 143));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, oval = 1 + 0.13 * Math.cos(2 * (a - u * 9)) + 0.05 * Math.sin(3 * a + u * 23);
      const c = Math.cos(a) * r * oval, sn = Math.sin(a) * r * oval * sample.flat;
      positions.push(sample.p.x + B.x * c + N.x * sn, sample.p.y + B.y * c + N.y * sn, sample.p.z + B.z * c + N.z * sn);
    }
  });
  for (let i = 0; i < samples.length - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    // Wound so the faces look out (the ring runs from B towards N).
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const strand = new THREE.BufferGeometry();
  strand.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  strand.setIndex(indices);
  strand.computeVertexNormals();
  const parts = [strand];
  // Side shoots: one gripping the deck's edge along it, and two curling off
  // over the sides, of different lengths.
  let seed = 811;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  {
    // Along the deck's west edge from where a wrap crosses it, bending over
    // the arris as the strand does.
    const i = samples.findIndex((sample, k) => k > samples.length * 0.3 && (sample.edge ?? 0) > 0.9 && sample.n.x < -0.5 && sample.n.y > 0.5);
    if (i > 0) {
      const from = samples[i].p, shoot: THREE.Vector3[] = [], n = new THREE.Vector3(-1, 1, 0).normalize();
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        shoot.push(new THREE.Vector3(-W, 0, from.z - t * 2.6).addScaledVector(n, 0.1 + 0.03 * Math.sin(t * 9))
          .add(new THREE.Vector3(-0.05 * Math.sin(t * 5), 0.04 * Math.sin(t * 7), 0)));
      }
      parts.push(knobbly(shoot, t => 0.11 * (1 - t * 0.75), 57, 7));
    }
  }
  for (let k = 0, tries = 0; k < 2 && tries < 80; tries++) {
    const i = Math.floor(samples.length * (0.4 + random() * 0.5)), sample = samples[i];
    if (sample.flat < 0.99 || Math.abs(sample.n.x) < 0.99) continue;
    const p = sample.p, normal = sample.n, tangent = samples[i + 1].p.clone().sub(p).normalize();
    const side = normal.clone().cross(tangent).multiplyScalar(random() < 0.5 ? -1 : 1), curl: THREE.Vector3[] = [];
    const reach = k === 0 ? 1.4 : 0.7, turn = 2 + random() * 0.6;
    for (let j = 0; j <= 16; j++) {
      const t = j / 16, a = t * Math.PI * turn, rr = reach * (1 - t * 0.6);
      curl.push(p.clone().addScaledVector(side, Math.sin(a) * rr * t + t * reach * 0.7).addScaledVector(tangent, (1 - Math.cos(a)) * rr * 0.4)
        .addScaledVector(normal, -sample.r * 0.4 + 0.03));
    }
    parts.push(knobbly(curl, t => (k === 0 ? 0.08 : 0.05) * (1 - t * 0.6), 41 + k, 6));
    k++;
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.name = 'root round the bridge';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
