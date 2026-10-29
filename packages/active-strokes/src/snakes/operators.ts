import type { Coverage } from './coverage';
import { grow } from './extend';
import { Grid } from './grid';
import type { Params } from './params';
import { sameDepth } from './samples';
import { addPoints, append, length, reverse, slice, sliceInPlace, tangent, type Snake } from './snake';

// The vectorization operators of section 5.1. Each takes the frame's snakes
// (already advected and relaxed) and returns them changed. The engine runs
// them in the paper's order: delete, split, trim, extend, merge, insert.

const longestFirst = (snakes: Snake[]) => snakes.map(s => ({ s, l: length(s) })).sort((a, b) => b.l - a.l).map(e => e.s);

// Keeps runs of a snake's vertices, as new snakes, dropping runs too short to be a line.
function runs(snake: Snake, keep: (i: number) => boolean): Snake[] {
  const out: Snake[] = [];
  let start = -1;
  for (let i = 0; i <= snake.x.length; i++) {
    if (i < snake.x.length && keep(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start >= 2) {
        // The longest run keeps the snake's identity (and later its brush paths).
        out.push(slice(snake, start, i));
      }
      start = -1;
    }
  }
  if (out.length === 1 && out[0].x.length === snake.x.length) return [snake];
  if (out.length) out.reduce((a, b) => (b.x.length > a.x.length ? b : a)).id = snake.id;
  return out;
}

// Delete: vertices that cover no sample go. This cuts snakes where their line
// has been occluded, and removes them entirely where it has gone. The pieces
// removed are handed to removed(), so their strokes can fade out.
export function deleteVertices(snakes: Snake[], coverage: Coverage, removed?: (piece: Snake) => void): Snake[] {
  return snakes.flatMap(snake => {
    const alive = snake.x.map((x, i) => coverage.hasFootprint(x, snake.y[i], ...tangent(snake, i), snake.z[i]));
    if (removed) for (const piece of runs(snake, i => !alive[i])) if (piece !== snake) removed(piece);
    return runs(snake, i => alive[i]);
  });
}

// Split: a snake bends too sharply at vertex i when the tangents either side,
// at i-1 and i+1, meet at a cosine below thetaPerp. It's cut there, with the
// corner vertex going to both halves.
export function split(snakes: Snake[], params: Params): Snake[] {
  const out: Snake[] = [];
  for (const snake of snakes) {
    const cuts = [0];
    for (let i = 1; i + 1 < snake.x.length; i++) {
      const [ax, ay] = tangent(snake, i - 1), [bx, by] = tangent(snake, i + 1);
      if (ax * bx + ay * by < params.thetaPerp) cuts.push(i);
    }
    if (cuts.length === 1) { out.push(snake); continue; }
    cuts.push(snake.x.length - 1);
    const pieces: Snake[] = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      if (cuts[k + 1] > cuts[k]) pieces.push(slice(snake, cuts[k], cuts[k + 1] + 1));
    }
    // The longest piece carries on as the original snake.
    pieces.reduce((a, b) => (b.x.length > a.x.length ? b : a)).id = snake.id;
    out.push(...pieces);
  }
  return out;
}

// Trim: an end vertex goes when it's within rTrim of a vertex on another
// snake, the two are near parallel, and everything it covers is covered by
// some other vertex anyway. Shortest snakes first, so long ones keep their length.
export function trim(snakes: Snake[], coverage: Coverage, params: Params): Snake[] {
  const { rTrim, rCover, thetaPar, thetaC, depthTolerance } = params;
  // Every vertex, with its tangent and depth, in one table. Trimming only ever removes
  // from the ends, so a vertex is still there while its index is inside its
  // snake's [lo, hi].
  const owner: number[] = [], index: number[] = [], vx: number[] = [], vy: number[] = [], vtx: number[] = [], vty: number[] = [], vz: number[] = [];
  const grid = new Grid(2 * rCover);
  snakes.forEach((snake, s) => {
    for (let i = 0; i < snake.x.length; i++) {
      const [tx, ty] = tangent(snake, i);
      grid.add(vx.length, snake.x[i], snake.y[i]);
      owner.push(s); index.push(i); vx.push(snake.x[i]); vy.push(snake.y[i]); vtx.push(tx); vty.push(ty); vz.push(snake.z[i]);
    }
  });
  const lo = snakes.map(() => 0), hi = snakes.map(s => s.x.length - 1);
  const alive = (v: number) => index[v] >= lo[owner[v]] && index[v] <= hi[owner[v]];
  const vertexAt = (s: number, i: number) => {
    // Vertices were added snake by snake, so the first of snake s is at the running offset.
    let offset = 0;
    for (let k = 0; k < s; k++) offset += snakes[k].x.length;
    return offset + i;
  };

  const { points, motion } = coverage.samples;
  // Snakes on different limbs crossing on screen aren't overlapping lines.
  const trimmable = (v: number) => {
    const x = vx[v], y = vy[v], tx = vtx[v], ty = vty[v];
    let close = false;
    grid.near(x, y, rTrim, w => {
      if (close || owner[w] === owner[v] || !alive(w) || !sameDepth(vz[v], vz[w], depthTolerance)) return;
      const dx = vx[w] - x, dy = vy[w] - y;
      if (dx * dx + dy * dy < rTrim * rTrim && Math.abs(tx * vtx[w] + ty * vty[w]) > thetaPar) close = true;
    });
    if (!close) return false;
    // footprint(v) ⊆ ∪ footprint(other snakes). Not this snake's own
    // vertices: they may be trimmed next, and a snake trimmed away that way
    // leaves samples nothing covers, so insert seeds it again, frame after frame.
    let redundant = true;
    coverage.footprint(x, y, tx, ty, i => {
      if (!redundant) return;
      const sx = points[i * 4], sy = points[i * 4 + 1], stx = points[i * 4 + 2], sty = points[i * 4 + 3];
      let covered = false;
      grid.near(sx, sy, rCover, w => {
        if (covered || owner[w] === owner[v] || !alive(w) || !sameDepth(vz[w], motion[i * 4 + 3], depthTolerance)) return;
        const dx = vx[w] - sx, dy = vy[w] - sy;
        if (dx * dx + dy * dy < rCover * rCover && Math.abs(stx * vtx[w] + sty * vty[w]) > thetaC) covered = true;
      });
      if (!covered) redundant = false;
    }, vz[v]);
    return redundant;
  };

  const order = snakes.map((snake, s) => ({ s, l: length(snake) })).sort((a, b) => a.l - b.l).map(e => e.s);
  for (const s of order) {
    const offset = vertexAt(s, 0);
    let changed = true;
    while (changed && hi[s] - lo[s] >= 1) {
      changed = false;
      if (trimmable(offset + lo[s])) { lo[s]++; changed = true; }
      if (hi[s] - lo[s] >= 1 && trimmable(offset + hi[s])) { hi[s]--; changed = true; }
    }
  }
  const out: Snake[] = [];
  snakes.forEach((snake, s) => {
    if (hi[s] - lo[s] < 1) return;
    if (lo[s] === 0 && hi[s] === snake.x.length - 1) { out.push(snake); return; }
    sliceInPlace(snake, lo[s], hi[s] + 1);
    out.push(snake);
  });
  return out;
}

// Extend: grows both ends of every snake, longest first, onto uncovered
// samples that carry the line on (the same rule initialization uses).
// coverage must already include every snake's footprint.
export function extend(snakes: Snake[], coverage: Coverage, params: Params): Snake[] {
  for (const snake of longestFirst(snakes)) {
    const n = snake.x.length;
    const [ex, ey] = [snake.x[n - 1], snake.y[n - 1]];
    const [tx, ty] = tangent(snake, n - 1);
    const ahead = grow(coverage, params, ex, ey, tx, ty, snake.id, snake.z[n - 1]);
    const [bx, by] = tangent(snake, 0);
    const behind = grow(coverage, params, snake.x[0], snake.y[0], -bx, -by, snake.id, snake.z[0]);
    addPoints(snake, ahead.xs, ahead.ys, false, ahead.zs);
    addPoints(snake, behind.xs.reverse(), behind.ys.reverse(), true, behind.zs.reverse());
  }
  return snakes;
}

// Merge: joins two snakes whose ends are within rMerge and which would carry
// on into each other smoothly: the joining segment u has to continue each
// snake's outward tangent (t_i·u > thetaPar, t_j·-u > thetaPar). Candidates
// are taken best first by the paper's goodness score; each snake merges at
// most once a frame, which also keeps a snake from closing on itself. The
// join itself has to lie on samples (every deltaMax along it covers one):
// joined across a real gap, the new vertices would cover nothing, delete would
// cut them next frame, and the two would merge again, frame after frame.
export function merge(snakes: Snake[], params: Params, coverage: Coverage): Snake[] {
  const { rMerge, rCover, thetaPar, goodness } = params;
  // Ends with their outward tangents. end 0 is the start, 1 the finish.
  const ends: { s: number; end: 0 | 1; x: number; y: number; tx: number; ty: number; z: number }[] = [];
  const grid = new Grid(rMerge);
  snakes.forEach((snake, s) => {
    const n = snake.x.length;
    const [ax, ay] = tangent(snake, 0), [bx, by] = tangent(snake, n - 1);
    for (const e of [{ s, end: 0 as const, x: snake.x[0], y: snake.y[0], tx: -ax, ty: -ay, z: snake.z[0] },
      { s, end: 1 as const, x: snake.x[n - 1], y: snake.y[n - 1], tx: bx, ty: by, z: snake.z[n - 1] }]) {
      grid.add(ends.length, e.x, e.y);
      ends.push(e);
    }
  });
  const candidates: { a: number; b: number; score: number }[] = [];
  ends.forEach((a, ia) => {
    grid.near(a.x, a.y, rMerge, ib => {
      const b = ends[ib];
      if (ib <= ia || b.s === a.s || !sameDepth(a.z, b.z, params.depthTolerance)) return;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= rMerge) return;
      // Ends on top of each other: only the tangents need to oppose.
      const ux = d > 1e-6 ? dx / d : a.tx, uy = d > 1e-6 ? dy / d : a.ty;
      const ca = a.tx * ux + a.ty * uy, cb = -(b.tx * ux + b.ty * uy);
      if (ca <= thetaPar || cb <= thetaPar) return;
      for (let k = 1, steps = Math.ceil(d / params.deltaMax); k < steps; k++) {
        if (!coverage.hasFootprint(a.x + dx * k / steps, a.y + dy * k / steps, ux, uy, a.z)) return;
      }
      const score = goodness * (Math.min(ca, cb) - thetaPar) / (1 - thetaPar)
        + (1 - goodness) * Math.min(1, (rMerge - d) / (rMerge - rCover));
      candidates.push({ a: ia, b: ib, score });
    });
  });
  candidates.sort((p, q) => q.score - p.score);
  const used = new Set<number>(), gone = new Set<number>();
  for (const { a, b } of candidates) {
    const A = ends[a], B = ends[b];
    if (used.has(A.s) || used.has(B.s)) continue;
    used.add(A.s); used.add(B.s);
    const sa = snakes[A.s], sb = snakes[B.s];
    // Arrange as sa's finish meeting sb's start.
    if (A.end === 0) reverse(sa);
    if (B.end === 1) reverse(sb);
    // Their brush paths stay separate (section 6.2): they only join once
    // they're continuous in parameter too.
    const keepA = length(sa) >= length(sb);
    if (keepA) append(sa, sb);
    else { const tail = { ...sb }; Object.assign(sb, { ...sa, id: sb.id }); append(sb, tail); }
    gone.add(keepA ? B.s : A.s);
  }
  return snakes.filter((_, s) => !gone.has(s));
}
