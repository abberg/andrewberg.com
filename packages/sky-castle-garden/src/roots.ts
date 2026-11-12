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
// Black in the middle, fading out to nothing at its edge, so the throat's
// shadow goes to black gradually.
const dark = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d')!, fade = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, 'rgba(6,4,8,1)');
  fade.addColorStop(0.45, 'rgba(10,7,14,0.97)');
  fade.addColorStop(0.75, 'rgba(22,15,28,0.6)');
  fade.addColorStop(1, 'rgba(30,20,36,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), alphaHash: true });
})();

const rand = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

// The holes: just four, two either side of where the bridge meets the lip,
// the nearer one on the west the big one.
// Spaced and set at heights unevenly (Andrew: an even row looked
// unnatural): a lone low one far out west, and a pair close together east
// of the bridge, one high, one low.
export function rootHoles(_line: WallLine): RootHole[] {
  return [
    { s: -10.5, t: 2.3, r: 1.45, seed: 11, big: true },
    { s: -28.5, t: 3.3, r: 0.6, seed: 37 },
    { s: 6.5, t: 1.4, r: 0.8, seed: 53 },
    { s: 14, t: 3.0, r: 0.5, seed: 71 },
    { s: 19.5, t: 1.9, r: 0.85, seed: 89 },
  ];
}

// A root as its course over the face: points (s along the lip, down the face
// from the lawn), each with its radius and how far its middle stands off the
// stone, as a part of its radius (negative: still in the hole).
type Course = { s: number, down: number, r: number, off: number }[];
type Turn = { s: number, down: number };

// A run of straight lines through corners, as points every step metres, each
// corner rounded off over up to radius metres either side of it.
function rounded(corners: Turn[], radius: number, step: number) {
  const out: Turn[] = [corners[0]];
  const to = (p: Turn) => {
    const from = out[out.length - 1], n = Math.max(1, Math.ceil(Math.hypot(p.s - from.s, p.down - from.down) / step));
    for (let j = 1; j <= n; j++) out.push({ s: from.s + (p.s - from.s) * j / n, down: from.down + (p.down - from.down) * j / n });
  };
  for (let i = 1; i < corners.length - 1; i++) {
    const a = corners[i - 1], b = corners[i], c = corners[i + 1];
    const l1 = Math.hypot(b.s - a.s, b.down - a.down), l2 = Math.hypot(c.s - b.s, c.down - b.down);
    if (l1 < 1e-4 || l2 < 1e-4) continue;
    const cut = Math.min(radius, l1 * 0.45, l2 * 0.45);
    const p0 = { s: b.s - (b.s - a.s) / l1 * cut, down: b.down - (b.down - a.down) / l1 * cut };
    const p2 = { s: b.s + (c.s - b.s) / l2 * cut, down: b.down + (c.down - b.down) / l2 * cut };
    to(p0);
    const n = Math.max(3, Math.ceil(cut * 2 / step));
    for (let j = 1; j <= n; j++) {
      const t = j / n, a0 = (1 - t) ** 2, a1 = 2 * (1 - t) * t, a2 = t * t;
      out.push({ s: a0 * p0.s + a1 * b.s + a2 * p2.s, down: a0 * p0.down + a1 * b.down + a2 * p2.down });
    }
  }
  to(corners[corners.length - 1]);
  return out;
}
// Points with how far along their whole length each one is, 0 to 1.
function along(path: Turn[]) {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i].s - path[i - 1].s, path[i].down - path[i - 1].down));
  const total = lengths[lengths.length - 1] || 1;
  return path.map((p, i) => ({ ...p, u: lengths[i] / total }));
}

export function buildRoots(line: WallLine, holes: RootHole[]) {
  const random = rand(5501);
  const onFace = (s: number, down: number, off: number) => facePoint(line, s, down, off);

  // A course down the face from (s, down), length metres down, thick at the
  // top and thinning to its end. Laid out like a circuit's traces (Andrew,
  // from the film): straight runs, turning only by 45 or 90 degrees, on
  // rounded corners. drift is which way its slants lean along the lip (its
  // sign, and how strongly); sway how often it jogs sideways level; jog false
  // keeps it always heading down (the big bundle, whose twist runs with the
  // depth).
  const wander = (s: number, down: number, r0: number, r1: number, length: number, drift: number, sway: number, seed: number, jog = true): Course => {
    const go = rand(Math.abs(seed * 7919 + 101) % 2147483646 + 1);
    const bias = Math.max(-1, Math.min(1, drift * 2)), level = jog ? Math.min(0.5, 0.08 + Math.abs(drift) * 0.25 + sway * 0.05) : 0;
    const shortest = Math.min(Math.max(length * 0.08, 0.6), 2.5);
    const corners: Turn[] = [{ s, down }];
    // Headings in eighths of a turn: 0 along the lip, 2 straight down, 4 back.
    let h = 2, at = { s, down };
    const side = () => (go() < 0.5 + bias * 0.4 ? 1 : 3);
    for (let n = 0; at.down < down + length && n < 200; n++) {
      let run = shortest * (1 + go() * 1.5) * (h === 2 ? 1.3 : h % 4 === 0 ? 0.5 : 1);
      // Kept from straying too far along the lip from where it set out.
      const stray = at.s - s, room = 4 + length * 0.2;
      const dy = Math.sin(h * Math.PI / 4);
      if (dy > 0) run = Math.min(run, (down + length - at.down) / dy + 0.01);
      at = { s: at.s + Math.cos(h * Math.PI / 4) * run, down: at.down + dy * run };
      corners.push(at);
      // The next run: a turn of 45 or 90 degrees, never back up.
      const r = go();
      if (h === 2) h = r < level ? (side() === 1 ? 0 : 4) : side();
      else if (h === 0) h = r < 0.5 ? 1 : 2;
      else if (h === 4) h = r < 0.5 ? 3 : 2;
      else h = r < level ? (h === 1 ? 0 : 4) : r < 0.75 ? 2 : (h === 1 ? 3 : 1);
      if (Math.abs(stray) > room && Math.cos(h * Math.PI / 4) * stray > 0.01) h = 2;
    }
    const path = rounded(corners, Math.min(Math.max(r0 * 2, 0.2), 1.6), 0.25);
    return along(path).map(({ s, down, u }) => ({ s, down, r: r0 + (r1 - r0) * u, off: 0.6 }));
  };

  const tubes: THREE.BufferGeometry[] = [];
  // A tube along a course, its radius knobbly along its length.
  const tube = (course: Course, seed: number, sides = 10, step = 0.4, knobs = 1) => {
    if (course.length < 2) return;
    tubes.push(knobbly(course.map(({ s, down, r, off }) => onFace(s, down, r * off)), u => {
      const f = u * (course.length - 1), k = Math.min(Math.floor(f), course.length - 2);
      return course[k].r + (course[k + 1].r - course[k].r) * (f - k);
    }, seed, sides, step, knobs));
  };
  // Out of its hole: from inside it, out and turning down onto the face.
  // Low in the hole, so its black back shows above the root.
  const exit = (hole: RootHole, r: number, ds = 0): Course => [
    { s: hole.s + ds, down: hole.t + hole.r * 0.3, r, off: -2.5 },
    { s: hole.s + ds, down: hole.t + hole.r * 0.4, r, off: -0.4 },
    { s: hole.s + ds, down: hole.t + hole.r * 0.4 + 0.35, r, off: 0.35 },
  ];
  // Thin side roots spreading out from a course over the stone. Taken out
  // (Andrew: none of the thinnest), but still drawing their random numbers,
  // so every other root keeps its course.
  const veins = (_course: Course, count: number) => {
    for (let k = 0; k < count * 6; k++) random();
  };

  // A course at fine steps (step metres down it), linearly between its
  // points, for wrapping things round it.
  const fine = (course: Course, step = 0.1): Course => {
    const out: Course = [];
    for (let i = 0; i < course.length - 1; i++) {
      const a = course[i], b = course[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.s - a.s, b.down - a.down) / step));
      for (let j = 0; j < n; j++) {
        const f = j / n;
        out.push({ s: a.s + (b.s - a.s) * f, down: a.down + (b.down - a.down) * f, r: a.r + (b.r - a.r) * f, off: a.off + (b.off - a.off) * f });
      }
    }
    out.push(course[course.length - 1]);
    return out;
  };
  // A much smaller vine twisted round a root (as in the film's
  // backgrounds): turns times round it from `from` to `to` (parts of the
  // root's course), hugging it at its radius times hug, then leaving it to
  // wander off down the stone on its own for `trail` metres.
  const wrap = (host: Course, from: number, to: number, turns: number, rv: number, hug: number, seed: number, trail: number, side = 1) => {
    const path = fine(host), i0 = Math.floor(from * (path.length - 1)), i1 = Math.floor(to * (path.length - 1));
    const points: THREE.Vector3[] = [], a0 = seed * 1.7;
    const centre = (c: Course[number]) => onFace(c.s, c.down, c.r * c.off);
    for (let i = i0; i <= i1; i++) {
      const c = path[i], C = centre(c);
      const N = onFace(c.s, c.down, c.r * c.off + 1).sub(C).normalize();
      const T = centre(path[Math.min(i + 1, path.length - 1)]).sub(centre(path[Math.max(i - 1, 0)])).normalize();
      const B = new THREE.Vector3().crossVectors(T, N).normalize();
      N.crossVectors(B, T);
      const u = (i - i0) / Math.max(i1 - i0, 1), a = a0 + side * u * turns * Math.PI * 2;
      // Pulled tight round the front, slack where it passes behind into
      // the stone.
      const rad = c.r * hug + rv * 0.6;
      points.push(C.addScaledVector(N, Math.cos(a) * rad).addScaledVector(B, Math.sin(a) * rad));
    }
    // Off on its own: from beside the root where it let go.
    const end = path[i1], leave = wander(end.s + side * end.r * 1.1, end.down + 0.3, rv, rv * 0.35, trail, side * (0.1 + random() * 0.2), 0.9, seed);
    leave.forEach(c => points.push(onFace(c.s, c.down, c.r * 0.6)));
    tubes.push(knobbly(points, u => rv * (1 - 0.6 * Math.max(0, u - 0.5) * 2), seed, 7, 0.1, 0.6));
  };
  // A creeper over the stone: from (s, down), heading (radians in the
  // face, 0 along the lip, pi/2 straight down) wandering as it goes,
  // kept between top and bottom (metres down the face), thinning from rv,
  // and putting out side branches that creep off on their own, smaller.
  // lead: points it comes from first (out of a hole, say).
  // Like the roots, it runs like a circuit's traces: straight runs, turning
  // by 45 or 90 degrees on tight rounded corners, its branches teeing off
  // at its corners.
  const creep = (s: number, down: number, heading: number, length: number, rv: number, seed: number, top = 0.4, bottom = WALL.lip - 0.4, lead: THREE.Vector3[] = [], level = 0) => {
    const go = rand(seed * 31 + 7);
    // Headings in eighths of a turn: 0 along the lip, 2 down, 6 up.
    let h = ((Math.round(heading / (Math.PI / 4)) % 8) + 8) % 8;
    const corners: (Turn & { h: number, d: number })[] = [{ s, down, h, d: 0 }];
    // Its way along the lip, kept all along it: long level runs, jogging up
    // or down a row on short slants (or now and then square) between them.
    const c0 = Math.cos(h * Math.PI / 4), dir = c0 > 0.1 ? 1 : c0 < -0.1 ? -1 : (go() < 0.5 ? 1 : -1);
    const level0 = dir > 0 ? 0 : 4, slantUp = dir > 0 ? 7 : 5, slantDown = dir > 0 ? 1 : 3;
    let travelled = 0;
    for (let n = 0; travelled < length - 0.01 && n < 200; n++) {
      const dx = Math.cos(h * Math.PI / 4), dy = Math.sin(h * Math.PI / 4);
      let run = Math.min(length - travelled, (h === level0 ? 0.8 + go() * 2.2 : 0.3 + go() * 0.6) * (level ? 0.7 : 1));
      if (dy > 0.1) run = Math.min(run, (bottom - down) / dy);
      if (dy < -0.1) run = Math.min(run, (top - down) / dy);
      if (run < 0.05) {
        // Up against the edge of where it may go: turn to run along it.
        h = level0;
        continue;
      }
      s += dx * run; down += dy * run; travelled += run;
      // The next run turns 45 degrees, or now and then 90.
      const r = go();
      if (h === level0) h = r < 0.4 ? slantDown : r < 0.8 ? slantUp : (go() < 0.5 ? 2 : 6);
      else if (r < 0.75) h = level0;
      else if (h % 2) h = dy > 0 ? 2 : 6;
      else h = dy > 0 ? slantDown : slantUp;
      corners.push({ s, down, h, d: travelled });
    }
    const points = [...lead, ...along(rounded(corners, Math.max(rv * 1.5, 0.08), 0.08)).map(p => onFace(p.s, p.down, rv * (1 - 0.55 * p.u) * 0.3))];
    tubes.push(knobbly(points, u => rv * (1 - 0.55 * u), seed, 7, 0.05, 0.3));
    // Branches teeing off at some of its corners, square or at 45.
    if (level < 1) {
      const count = Math.round(length / (level ? 3.5 : 2.2));
      for (let k = 0; k < count && corners.length > 2; k++) {
        const c = corners[1 + Math.floor(go() * (corners.length - 2))], u = c.d / length;
        const branch = (c.h + (go() < 0.5 ? -1 : 1) * (go() < 0.6 ? 2 : 1) + 8) % 8;
        creep(c.s, c.down, branch * Math.PI / 4, length * (0.3 + go() * 0.3), rv * (1 - 0.55 * u) * 0.72, seed * 7 + k + 1, top, bottom, [], level + 1);
      }
    }
  };
  // A rootlet out of a hole's rim, at an angle round it, creeping out over
  // the lip a long way and branching.
  const rootlet = (hole: RootHole, angle: number, length: number, rv: number, seed: number) => {
    const c = Math.cos(angle), sn = Math.sin(angle), rim = hole.r * 0.85;
    const lead = [onFace(hole.s + c * rim * 0.5, hole.t + sn * rim * 0.5, -0.5), onFace(hole.s + c * rim * 0.8, hole.t + sn * rim * 0.8, -0.2)];
    creep(hole.s + c * rim, hole.t + sn * rim, angle, length, rv, seed, 0.4, WALL.lip - 0.4, lead);
  };
  // A branch climbing back up from underneath: off a root's course down on
  // the curve, up over the foot of the lip and onto it, wandering across.
  const climber = (from: Course[number], length: number, rv: number, seed: number, side: number) => {
    const points: THREE.Vector3[] = [];
    // Straight up the curve from where it leaves the root.
    const s = from.s + side * from.r * 0.8;
    let down = from.down;
    while (down > WALL.lip - 0.6) {
      points.push(onFace(s, down, rv * 0.3));
      down -= 0.25;
    }
    creep(s, down, -Math.PI / 2, length, rv * 0.85, seed, 0.4, WALL.lip - 0.4, points);
  };

  holes.forEach((hole, index) => {
    const length = 30 + random() * 8, drift = (random() - 0.5) * 0.6;
    const sway = 0.8 + random() * 1.2, seed = hole.seed, r = hole.r * 0.62;
    if (hole.big) {
      // Three roots out of the one hole, of quite different sizes, twisted
      // tight round each other from the moment they leave it (a turn every
      // three metres or so, slacking off lower down) and coming apart lower
      // down, as in the film's backgrounds. They come out low in the hole,
      // filling its mouth (Andrew: the twist belongs right at the hole), bulging out proud of the lip before they
      // lie down onto the stone. A much smaller vine winds round the bundle
      // as it leaves the hole, and rootlets creep out of the rim.
      const low = hole.t - 0.35, base = wander(hole.s, low + 0.05, 1, 0.55, length, drift * 0.5, sway, seed, false);
      const together = 18, sizes = [0.6, 0.42, 0.27], rings = [0.4, 0.62, 0.78];
      const bulge = (d: number) => 0.55 * Math.sin(Math.PI * Math.min(d / 2.4, 1)) * (d < 2.4 ? 1 : 0);
      const turn = (d: number) => d * 2.1 - d * d * 0.03 * (d < 25 ? 1 : 0) - (d >= 25 ? 0 : 0);
      const strands: Course[] = [];
      for (let k = 0; k < 3; k++) {
        const phase = k * Math.PI * 2 / 3 + 0.4, spread = (k - 1) * (0.35 + random() * 0.25);
        const course = base.map(c => {
          const d = c.down - base[0].down, a = Math.min(turn(d), turn(30)) + phase, apart = Math.max(c.down - hole.t - together, 0);
          const ring = rings[k] * c.r;
          return { ...c, s: c.s + Math.cos(a) * ring + spread * apart, r: sizes[k] * c.r, off: 0.7 / sizes[k] * 0.6 + 0.9 * Math.sin(a) * c.r * 0.5 / sizes[k] + bulge(d) / (sizes[k] * c.r) };
        });
        // In from the dark of the hole.
        const first = course[0];
        tube([{ ...first, down: low - 0.1 + Math.sin(phase) * 0.25, s: first.s + Math.cos(phase) * 0.3, off: -3 / sizes[k] }, ...course], seed + k, 12, 0.15, 0.6);
        strands.push(course);
        veins(course.slice(Math.floor(course.length * 0.5)), 1 + Math.floor(random() * 2));
      }
      // A thin core filling the gaps between them near the top.
      tube([{ s: hole.s, down: low, r: 0.32, off: -4 }, ...base.slice(0, 14).map((c, i) => ({ ...c, r: 0.32 * c.r, off: (0.75 + bulge(c.down - base[0].down)) / (0.32 * c.r) }))], seed + 9, 8);
      // The small vine twisted round the bundle, out of the hole with it.
      const host = base.slice(0, 14).map(c => ({ ...c, r: c.r * 0.95, off: (0.75 + bulge(c.down - base[0].down)) / (c.r * 0.95) }));
      wrap([{ ...host[0], down: low - 0.2, off: -2.5 }, ...host], 0, 0.75, 2.6, 0.13, 1.0, 211, 9, -1);
      wrap(host, 0.25, 0.95, 1.3, 0.07, 1.05, 223, 6, 1);
      // Rootlets out of the rim, mostly along the lip and upward.
      for (const [angle, length, rv] of [[-2.7, 9, 0.3], [-0.4, 11, 0.28], [0.35, 6, 0.21], [-1.9, 4, 0.17], [2.8, 7, 0.23], [-1.2, 5, 0.16]]) rootlet(hole, angle, length, rv, Math.floor(angle * 100 + 500));
      // And one climbing back up from under the curve, west of it.
      climber(strands[2][Math.min(16, strands[2].length - 1)], 9, 0.3, 901, -1);
    } else if (index === 1) {
      // One root that splits in two partway down, the two going their own
      // ways.
      const split = 7 + random() * 8, upper = wander(hole.s, hole.t + 1.3, r, r * 0.85, split, drift, sway * 0.5, seed);
      tube([...exit(hole, r), ...upper], seed);
      wrap([...exit(hole, r).slice(1), ...upper], 0.05, 0.6, 1.8, 0.06, 1.0, seed + 300, 5, 1);
      rootlet(hole, -0.4, 6, 0.2, seed + 1);
      rootlet(hole, -2.8, 4, 0.16, seed + 3);
      const end = upper[upper.length - 1];
      for (const side of [-1, 1]) {
        const course = wander(end.s, end.down, end.r * 0.75, end.r * 0.35, length - split, drift + side * (0.25 + random() * 0.35), sway, seed + side * 17);
        tube(course, seed + side);
        veins(course, 1 + Math.floor(random() * 2));
      }
    } else {
      const course = wander(hole.s, hole.t + 1.3, r, r * 0.4, length, drift, sway, seed);
      tube([...exit(hole, r), ...course], seed);
      wrap([...exit(hole, r).slice(1), ...course.slice(0, 9)], 0.05, 0.7, 1.6 + random(), 0.055, 1.0, seed + 300, 4 + random() * 3, index % 2 ? 1 : -1);
      rootlet(hole, index % 2 ? -2.6 : -0.5, 5 + random() * 3, 0.2, seed + 2);
      rootlet(hole, index % 2 ? -0.3 : -2.9, 3 + random() * 2, 0.15, seed + 4);
      if (index === 3) climber(course[Math.min(14, course.length - 1)], 7, 0.24, seed + 40, 1);
      veins(course, 1 + Math.floor(random() * 3));
    }
  });
  const geometry = mergeGeometries(tubes);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'roots';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The back of each hole black, so it reads as running deep into the
  // stone (Andrew): a dark disc down its throat (wall.ts sinks it), which
  // the throat's sides hide but for straight on.
  for (const hole of holes) {
    const back = facePoint(line, hole.s, hole.t, -0.75), front = facePoint(line, hole.s, hole.t, 0);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(hole.r * 1.05, 32), dark);
    disc.position.copy(back);
    disc.lookAt(front);
    disc.name = 'root hole';
    mesh.add(disc);
  }
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
function knobbly(points: THREE.Vector3[], radius: (u: number) => number, seed: number, sides = 10, step = 0.4, knobs = 1) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  const frames = curve.computeFrenetFrames(n, false);
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u);
    const r = radius(u) * (1 + knobs * (0.1 * Math.sin(u * 37 + seed) + 0.06 * Math.sin(u * 91 + seed * 2)));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2, lump = 1 + knobs * 0.07 * Math.sin(a * 3 + u * 23 + seed);
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
  // It peels off the side of the trunk's curl, thick where it leaves it,
  // and sweeps out and a little up before running level.
  const lipFrom = big.s + 0.2, lipTo = -W - 0.75;
  for (let s = lipFrom; s <= lipTo; s += 0.25) {
    const u = (s - lipFrom) / (lipTo - lipFrom), peel = THREE.MathUtils.smoothstep(u, 0, 0.25);
    const down = big.t + 2.5 - 0.6 * peel + 0.35 * u + 0.15 * Math.sin(u * 7) * peel;
    const r = r0 * (1 + 0.6 * (1 - peel));
    samples.push({ p: facePoint(line, s, down, (0.1 + 0.5 * peel) * r), n: new THREE.Vector3(0, 0, -1), r, flat: 1 });
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
