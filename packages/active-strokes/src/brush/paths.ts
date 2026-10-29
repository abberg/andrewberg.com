import type { Params } from '../snakes/params';
import type { Snake } from '../snakes/snake';

// Brush path parameterization (section 6.2). A brush path is a run of
// vertices on one snake sharing a path id. Each frame its parameter is refit
// as T(s) = rho s + phi over screen arc length s (Kalnins et al. 2003): a
// least-squares fit to the values the vertices brought from last frame, pulled
// towards uniform arc length so the texture doesn't stretch.

// Calls visit(a, b) for each run [a, b) of one path id.
export function forEachRun(snake: Snake, visit: (a: number, b: number) => void) {
  let a = 0;
  for (let i = 1; i <= snake.x.length; i++) {
    if (i === snake.x.length || snake.path[i] !== snake.path[a]) { visit(a, i); a = i; }
  }
}

function arcLengths(snake: Snake, a: number, b: number) {
  const s = [0];
  for (let i = a + 1; i < b; i++) s.push(s[s.length - 1] + Math.hypot(snake.x[i] - snake.x[i - 1], snake.y[i] - snake.y[i - 1]));
  return s;
}

// How far fits moved the parameter at vertices that already had one, summed,
// and how many such vertices there were: texture sliding, in pixels.
export const slide = { total: 0, count: 0 };

// Refits t over [a, b) and returns the slope.
export function fitRun(snake: Snake, a: number, b: number, uniformity: number) {
  const s = arcLengths(snake, a, b);
  let n = 0, ms = 0, mt = 0;
  for (let i = a; i < b; i++) if (!Number.isNaN(snake.t[i])) { n++; ms += s[i - a]; mt += snake.t[i]; }
  let rho = 1, phi = 0;
  if (n === 1) {
    phi = mt - ms;
  } else if (n >= 2) {
    ms /= n; mt /= n;
    let sst = 0, sss = 0;
    for (let i = a; i < b; i++) {
      if (Number.isNaN(snake.t[i])) continue;
      const ds = s[i - a] - ms;
      sst += ds * (snake.t[i] - mt); sss += ds * ds;
    }
    const raw = sss > 1e-9 ? sst / sss : 1;
    // Paths can run either way along their snake (merges reverse snakes).
    const uniform = raw < 0 ? -1 : 1;
    // A path can't stretch its texture more than 2x either way in one frame;
    // without this, a short path with a bad fit feeds on itself and diverges.
    const fitted = uniform * Math.min(2, Math.max(0.5, Math.abs(raw)));
    rho = (1 - uniformity) * fitted + uniformity * uniform;
    phi = mt - rho * ms;
  }
  for (let i = a; i < b; i++) {
    const t = rho * s[i - a] + phi;
    if (!Number.isNaN(snake.t[i])) { slide.total += Math.abs(t - snake.t[i]); slide.count++; }
    snake.t[i] = t;
  }
  return rho;
}

export function updateBrushPaths(snakes: Snake[], params: Params) {
  const { uniformity, joinTolerance, level } = params;
  for (const snake of snakes) {
    const runs: { a: number; b: number; rho: number }[] = [];
    forEachRun(snake, (a, b) => runs.push({ a, b, rho: fitRun(snake, a, b, uniformity) }));
    // Neighbouring paths on one snake: join them if their parameters already
    // meet, otherwise level them a step closer.
    for (let k = 0; k + 1 < runs.length; k++) {
      const p = runs[k], q = runs[k + 1];
      if (Math.sign(p.rho) !== Math.sign(q.rho)) continue;
      const end = p.b - 1, gap = Math.hypot(snake.x[q.a] - snake.x[end], snake.y[q.a] - snake.y[end]);
      const mismatch = snake.t[q.a] - (snake.t[end] + p.rho * gap);
      if (Math.abs(mismatch) < joinTolerance) {
        for (let i = q.a; i < q.b; i++) snake.path[i] = snake.path[end];
        q.a = p.a;
        q.rho = fitRun(snake, p.a, q.b, uniformity);
      } else {
        for (let i = p.a; i < p.b; i++) snake.t[i] += level * mismatch / 2;
        for (let i = q.a; i < q.b; i++) snake.t[i] -= level * mismatch / 2;
      }
    }
  }
}
