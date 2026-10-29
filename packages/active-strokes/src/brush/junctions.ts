import { Grid } from '../snakes/grid';
import type { Params } from '../snakes/params';
import { length, tangent, type Snake } from '../snakes/snake';

// Drawing-time clean-up at junctions, after Bénard and Hertzmann's tutorial
// (Line Drawings from 3D Models, 2019). Nothing here changes what the snakes
// track; it only decides what gets drawn.
//
// Topological simplification (section 9.3, from Bénard et al. 2014): each
// snake end is at a junction if another snake comes within junctionRadius of
// it, and a dead end otherwise. A snake shorter than simplifyLength is hidden
// if it touches a dead end, closes on itself, or is mostly overlapped by
// other snakes. Visibility eases over kappaMax frames, so nothing pops.
//
// Closing junctions (section 9.1): a line ending at another line, as at a
// T-junction where the background line stops at the foreground contour,
// should touch it. Each end is drawn on along its tangent to the nearest
// other snake it would hit within junctionReach; two ends pointing at each
// other across a corner are drawn on to where their lines cross. How far an
// end is drawn on eases by capStep pixels a frame, so a junction found or
// lost doesn't make the end jump.

// Pixels a frame by which drawn-on ends ease.
const capStep = 3;

const ease = (from: number, to: number, step: number) => from + Math.max(-step, Math.min(step, to - from));

interface Segment { s: number; ax: number; ay: number; bx: number; by: number }

// Where the ray from (px, py) along (dx, dy) crosses segment ab, as a distance
// along the ray, or Infinity.
function rayHit(px: number, py: number, dx: number, dy: number, g: Segment) {
  const ex = g.bx - g.ax, ey = g.by - g.ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return Infinity;
  const qx = g.ax - px, qy = g.ay - py;
  const t = (qx * ey - qy * ex) / den, u = (qx * dy - qy * dx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}

export function updateJunctions(snakes: Snake[], params: Params) {
  const { junctionRadius, simplifyLength, junctionReach, rTrim, kappaMax } = params;
  const segments: Segment[] = [];
  const grid = new Grid(Math.max(junctionReach, junctionRadius));
  snakes.forEach((snake, s) => {
    for (let i = 0; i + 1 < snake.x.length; i++) {
      const g = { s, ax: snake.x[i], ay: snake.y[i], bx: snake.x[i + 1], by: snake.y[i + 1] };
      grid.add(segments.length, (g.ax + g.bx) / 2, (g.ay + g.by) / 2);
      segments.push(g);
    }
  });
  const distanceTo = (x: number, y: number, g: Segment) => {
    const ex = g.bx - g.ax, ey = g.by - g.ay, l2 = ex * ex + ey * ey || 1;
    const f = Math.max(0, Math.min(1, ((x - g.ax) * ex + (y - g.ay) * ey) / l2));
    return Math.hypot(g.ax + ex * f - x, g.ay + ey * f - y);
  };
  // Whether another snake comes within r of a point.
  const near = (x: number, y: number, s: number, r: number) => {
    let found = false;
    grid.near(x, y, r + 6, k => { if (!found && segments[k].s !== s && distanceTo(x, y, segments[k]) < r) found = true; });
    return found;
  };

  snakes.forEach((snake, s) => {
    const n = snake.x.length;
    const startJoined = near(snake.x[0], snake.y[0], s, junctionRadius);
    const endJoined = near(snake.x[n - 1], snake.y[n - 1], s, junctionRadius);
    let hide = false;
    if (length(snake) < simplifyLength) {
      const loop = Math.hypot(snake.x[0] - snake.x[n - 1], snake.y[0] - snake.y[n - 1]) < junctionRadius;
      let overlapped = 0;
      for (let i = 0; i < n; i++) if (near(snake.x[i], snake.y[i], s, 2 * rTrim)) overlapped++;
      hide = !startJoined || !endJoined || loop || overlapped > 0.6 * n;
    }
    const step = 1 / kappaMax;
    snake.shown = Math.max(0, Math.min(1, snake.shown + (hide ? -step : step)));

    // Draw each end on to the nearest other snake straight ahead of it.
    const cap = (i: number, outward: number): [number, number] | null => {
      const [tx, ty] = tangent(snake, i);
      const dx = tx * outward, dy = ty * outward, x = snake.x[i], y = snake.y[i];
      let best = junctionReach;
      grid.near(x + dx * junctionReach / 2, y + dy * junctionReach / 2, junctionReach, k => {
        if (segments[k].s === s) return;
        best = Math.min(best, rayHit(x, y, dx, dy, segments[k]));
      });
      return best < junctionReach ? [x + dx * best, y + dy * best] : null;
    };
    snake.capStart = n >= 2 ? cap(0, -1) : null;
    snake.capEnd = n >= 2 ? cap(n - 1, 1) : null;
  });

  // Ends pointing at each other across a corner, neither hitting a line:
  // draw both on to where their lines cross.
  const ends: { s: number; start: boolean; x: number; y: number; dx: number; dy: number }[] = [];
  snakes.forEach((snake, s) => {
    const n = snake.x.length;
    if (n < 2) return;
    const [ax, ay] = tangent(snake, 0), [bx, by] = tangent(snake, n - 1);
    if (!snake.capStart) ends.push({ s, start: true, x: snake.x[0], y: snake.y[0], dx: -ax, dy: -ay });
    if (!snake.capEnd) ends.push({ s, start: false, x: snake.x[n - 1], y: snake.y[n - 1], dx: bx, dy: by });
  });
  const taken = new Set<number>();
  ends.forEach((a, i) => {
    if (taken.has(i)) return;
    let best = -1, bestT = Infinity, bestU = Infinity;
    ends.forEach((b, j) => {
      if (j <= i || taken.has(j) || b.s === a.s) return;
      if (Math.hypot(b.x - a.x, b.y - a.y) > 2 * junctionReach) return;
      const den = a.dx * b.dy - a.dy * b.dx;
      if (Math.abs(den) < 0.2) return; // near parallel: a gap, not a corner
      const qx = b.x - a.x, qy = b.y - a.y;
      const t = (qx * b.dy - qy * b.dx) / den, u = (qx * a.dy - qy * a.dx) / den;
      if (t > 0 && u > 0 && t < junctionReach && u < junctionReach && t + u < bestT + bestU) { best = j; bestT = t; bestU = u; }
    });
    if (best < 0) return;
    taken.add(i); taken.add(best);
    const point: [number, number] = [a.x + a.dx * bestT, a.y + a.dy * bestT];
    for (const e of [a, ends[best]]) {
      if (e.start) snakes[e.s].capStart = point;
      else snakes[e.s].capEnd = point;
    }
  });

  for (const snake of snakes) {
    const n = snake.x.length;
    if (n < 2) continue;
    // Towards the cap found this frame, or back to the end along its tangent.
    const eased = (i: number, outward: number, k: 0 | 1, target: [number, number] | null): [number, number] | null => {
      const x = snake.x[i], y = snake.y[i];
      let [dx, dy] = tangent(snake, i).map(v => v * outward), want = 0;
      if (target) {
        want = Math.hypot(target[0] - x, target[1] - y);
        if (want > 1e-6) [dx, dy] = [(target[0] - x) / want, (target[1] - y) / want];
      }
      snake.capReach[k] = ease(snake.capReach[k], want, capStep);
      return snake.capReach[k] > 0.5 ? [x + dx * snake.capReach[k], y + dy * snake.capReach[k]] : null;
    };
    snake.capStart = eased(0, -1, 0, snake.capStart);
    snake.capEnd = eased(n - 1, 1, 1, snake.capEnd);
  }
}
