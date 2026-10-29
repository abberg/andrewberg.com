// A snake is an open 2D polyline that tracks one feature line. Each vertex
// also carries what its brush path needs from frame to frame (section 6):
//   t      the brush parameter (NaN until the path's first fit)
//   kappa  its lifespan, in frames
//   path   which brush path it belongs to; one snake can carry several brush
//          paths, as runs of vertices with the same path id
//   z      distance from the camera of the surface it's tracking (NaN until
//          advection first finds it), so it follows that surface, not
//          whatever passes in front
export interface Snake {
  id: number;
  x: number[];
  y: number[];
  t: number[];
  kappa: number[];
  path: number[];
  z: number[];
  // Drawing only, recomputed each frame (brush/junctions.ts): how visible the
  // snake is (0-1, eased towards hidden or shown), and where its ends should
  // be drawn on to so they meet the line they run into (null: as they are).
  shown: number;
  capStart: [number, number] | null;
  capEnd: [number, number] | null;
  // Drawing only: how far each end is drawn on (start, end), in pixels,
  // eased from frame to frame so ends don't jump as junctions come and go.
  capReach: [number, number];
}

const attributes = ['x', 'y', 't', 'kappa', 'path', 'z'] as const;
type Attribute = typeof attributes[number];
type Vertex = Record<Attribute, number>;

let nextId = 1;
export const newId = () => nextId++;

export function createSnake(x: number[], y: number[]): Snake {
  const id = newId();
  return {
    id, x, y,
    t: x.map(() => NaN), kappa: x.map(() => 0), path: x.map(() => id),
    z: x.map(() => NaN),
    shown: 1, capStart: null, capEnd: null, capReach: [0, 0],
  };
}

function vertex(snake: Snake, i: number): Vertex {
  const v = {} as Vertex;
  for (const key of attributes) v[key] = snake[key][i];
  return v;
}

// Vertices a..b-1 as a new snake, attributes and all.
export function slice(snake: Snake, a: number, b: number): Snake {
  const out = createSnake([], []);
  for (const key of attributes) out[key] = snake[key].slice(a, b);
  return out;
}

export function sliceInPlace(snake: Snake, a: number, b: number) {
  for (const key of attributes) snake[key] = snake[key].slice(a, b);
}

export function reverse(snake: Snake) {
  for (const key of attributes) snake[key].reverse();
}

// b's vertices after a's, into a.
export function append(a: Snake, b: Snake) {
  for (const key of attributes) a[key] = [...a[key], ...b[key]];
}

// Adds new vertices (from extension) at the end, or before the start. They
// join the brush path at that end, with no parameter yet and no lifespan.
export function addPoints(snake: Snake, xs: number[], ys: number[], atStart: boolean, zs?: number[]) {
  if (!xs.length) return;
  const path = atStart ? snake.path[0] : snake.path[snake.path.length - 1];
  const added = xs.map((x, i): Vertex => ({ x, y: ys[i], t: NaN, kappa: 0, path, z: zs?.[i] ?? NaN }));
  for (const key of attributes) {
    const values = added.map(v => v[key]);
    snake[key] = atStart ? [...values, ...snake[key]] : [...snake[key], ...values];
  }
}

// Unit tangent at vertex i, from its neighbours (one-sided at the ends).
export function tangent(snake: Snake, i: number): [number, number] {
  const n = snake.x.length;
  if (n < 2) return [1, 0];
  const a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1);
  const dx = snake.x[b] - snake.x[a], dy = snake.y[b] - snake.y[a];
  const length = Math.hypot(dx, dy) || 1;
  return [dx / length, dy / length];
}

// Keeps vertices roughly evenly spaced (after Delingette and Montagnat 2000):
// edges longer than deltaMax get midpoints, and vertices on edges shorter than
// a third of it go. The ends never move. Midpoints take their values between
// the vertices either side: parameter interpolated, lifespan the lower, path
// from the earlier one.
export function resample(snake: Snake, deltaMax: number) {
  const n = snake.x.length;
  const out: Vertex[] = [vertex(snake, 0)];
  for (let i = 1; i < n; i++) {
    const v = vertex(snake, i), p = out[out.length - 1], last = i === n - 1;
    const length = Math.hypot(v.x - p.x, v.y - p.y);
    if (length < deltaMax / 3 && !last) continue;
    const pieces = Math.ceil(length / deltaMax);
    for (let k = 1; k < pieces; k++) {
      const f = k / pieces, mix = (key: 'x' | 'y' | 't' | 'z') => p[key] + (v[key] - p[key]) * f;
      out.push({ x: mix('x'), y: mix('y'), t: mix('t'), z: mix('z'), kappa: Math.min(p.kappa, v.kappa), path: p.path });
    }
    // Too close to the end: the end replaces the previous vertex.
    if (last && length < deltaMax / 3 && out.length > 1) out.pop();
    out.push(v);
  }
  for (const key of attributes) snake[key] = out.map(v => v[key]);
}

export function length(snake: Snake) {
  let total = 0;
  for (let i = 1; i < snake.x.length; i++) total += Math.hypot(snake.x[i] - snake.x[i - 1], snake.y[i] - snake.y[i - 1]);
  return total;
}
