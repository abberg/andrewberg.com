import type { Params } from '../snakes/params';
import type { Snake } from '../snakes/snake';
import { forEachRun } from './paths';

// Turns brush paths into triangle strips ready for the GPU. Each stroke point
// becomes two strip vertices, either side of the line, carrying:
// x, y (pixels), u (the brush parameter), v (-1 to 1 across the stroke) and
// alpha (from the lifespan), five floats each.
export const STRIP_FLOATS = 5;

export interface Strips {
  vertices: Float32Array;
  indices: Uint32Array;
}

// w scales the stroke's width at this point (1 if left out).
interface Point { x: number; y: number; t: number; alpha: number; w?: number }

class StripBuilder {
  vertices: number[] = [];
  indices: number[] = [];

  // One stroke along points, tapering to a point over taper pixels at each end.
  stroke(points: Point[], width: number, taper: number) {
    if (points.length < 2) return;
    const s = [0];
    for (let i = 1; i < points.length; i++) s.push(s[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    const total = s[s.length - 1];
    if (total < 0.5) return;
    const base = this.vertices.length / STRIP_FLOATS;
    points.forEach((p, i) => {
      const a = points[Math.max(i - 1, 0)], b = points[Math.min(i + 1, points.length - 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const end = Math.min(s[i], total - s[i]);
      const w = width * (p.w ?? 1) * Math.sqrt(Math.min(1, (end + 0.5) / Math.min(taper, total / 2 + 0.5)));
      const nx = -dy / d * w / 2, ny = dx / d * w / 2;
      this.vertices.push(p.x + nx, p.y + ny, p.t, -1, p.alpha, p.x - nx, p.y - ny, p.t, 1, p.alpha);
      if (i + 1 < points.length) {
        const k = base + i * 2;
        this.indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    });
  }

  build(): Strips {
    return { vertices: new Float32Array(this.vertices), indices: new Uint32Array(this.indices) };
  }
}

const alphaOf = (snake: Snake, i: number, params: Params) => snake.shown * Math.max(0, Math.min(1, (snake.kappa[i] - params.fadeDelay) / params.kappaMax));

// Ink: one stroke per brush path, through the snake's own vertices.
function ink(builder: StripBuilder, snake: Snake, params: Params) {
  forEachRun(snake, (a, b) => {
    const points: Point[] = [];
    for (let i = a; i < b; i++) points.push({ x: snake.x[i], y: snake.y[i], t: snake.t[i], alpha: alphaOf(snake, i, params) });
    builder.stroke(points, params.strokeWidth, params.taper);
  });
}

// A repeatable pseudo-random number in [-1, 1) for integer inputs.
function hash(a: number, b: number) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

// Smooth 1D value noise in [-1, 1], from hash at the integers.
function noise(x: number, seed: number) {
  const i = Math.floor(x), f = x - i, e = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - e) + hash(i + 1, seed) * e;
}

// Carries a stroke straight on past its first and last points, along its end
// directions, by the given lengths.
function extendEnds(points: Point[], before: number, after: number) {
  const run = (p: Point, q: Point, by: number): Point => {
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
    return { ...p, x: p.x + dx / d * by, y: p.y + dy / d * by, t: p.t + (p.t > q.t ? by : -by) };
  };
  if (before > 0) points.unshift(run(points[0], points[1], before));
  if (after > 0) points.push(run(points[points.length - 1], points[points.length - 2], after));
}

// Overdrawn sketchy lines: several layers of short strokes along each path.
// Which stroke a vertex falls in comes from its brush parameter, so strokes
// keep their place on the drawing. Like a hand going over a line, a stroke
// doesn't run parallel to it: it starts on one side and ends on another, bows
// a little and wobbles gently, so strokes cross and overlap. Lengths and
// starts vary stroke to stroke, and each layer has its own rhythm. Strokes
// run on a little past their ends, except at the ends of the path.
function sketchy(builder: StripBuilder, snake: Snake, params: Params) {
  const { sketchLayers, sketchLength, sketchCoverage, sketchOffset, sketchWobble, strokeWidth } = params;
  const { sketchWidthVariation, sketchOpacityVariation, sketchPressure } = params;
  // Biased towards the middle, so most strokes stay close to the line.
  const offset = (stroke: number, layer: number, salt: number) =>
    sketchOffset * (hash(stroke, layer * 7 + salt) + hash(stroke, layer * 7 + salt + 3)) / 2;
  forEachRun(snake, (a, b) => {
    for (let layer = 0; layer < sketchLayers; layer++) {
      const period = sketchLength / sketchCoverage * (1 + 0.23 * layer);
      const phase = period * (0.37 * layer + 0.11);
      let points: Point[] = [], current = NaN, first = -1, last = -1;
      const flush = () => {
        if (points.length >= 2) {
          const extra = (atEnd: boolean, salt: number) => atEnd ? 0 : 3 * Math.abs(hash(current, layer * 7 + salt));
          extendEnds(points, extra(first === a, 103), extra(last === b - 1, 104));
          builder.stroke(points, strokeWidth * 0.6, 10);
        }
        points = [];
      };
      for (let i = a; i < b; i++) {
        const u = (snake.t[i] + phase) / period, stroke = Math.floor(u), along = u - stroke;
        // This stroke's own extent within its period.
        const start = 0.1 * Math.abs(hash(stroke, layer * 7 + 101));
        const end = Math.min(0.97, sketchCoverage + 0.18 * hash(stroke, layer * 7 + 102));
        const inside = along >= start && along <= end;
        if (stroke !== current || !inside) { flush(); current = stroke; }
        if (!inside) continue;
        if (!points.length) first = i;
        last = i;
        const f = (along - start) / (end - start);
        // Each stroke's own weight and darkness, and pressure along it: a
        // swell somewhere along the stroke, plus a slow wander.
        const weight = 1 + sketchWidthVariation * hash(stroke, layer * 7 + 105);
        const ink = 0.7 * (1 + sketchOpacityVariation * hash(stroke, layer * 7 + 106));
        const peak = 0.5 + 0.3 * hash(stroke, layer * 7 + 107);
        const pressure = 1 + sketchPressure * (Math.cos(Math.PI * Math.min(1, Math.abs(f - peak) * 1.6)) * 0.7 + 0.3 * noise(snake.t[i] / 12, layer + 60));
        const p = Math.max(i - 1, a), q = Math.min(i + 1, b - 1);
        const dx = snake.x[q] - snake.x[p], dy = snake.y[q] - snake.y[p], d = Math.hypot(dx, dy) || 1;
        const across = offset(stroke, layer, 0) * (1 - f) + offset(stroke, layer, 1) * f
          + 0.5 * sketchOffset * hash(stroke, layer * 7 + 2) * 4 * f * (1 - f)
          + sketchWobble * noise(snake.t[i] / 25, layer + 50);
        points.push({
          x: snake.x[i] - dy / d * across, y: snake.y[i] + dx / d * across,
          t: snake.t[i], alpha: Math.min(1, ink) * alphaOf(snake, i, params), w: weight * pressure,
        });
      }
      flush();
    }
  });
}

// The snake as drawn: with its ends drawn on to the lines they meet (see
// junctions.ts), as extra vertices continuing its first and last brush paths.
function withCaps(snake: Snake): Snake {
  if (!snake.capStart && !snake.capEnd) return snake;
  const drawn = { ...snake };
  for (const key of ['x', 'y', 't', 'kappa', 'path', 'z'] as const) drawn[key] = [...snake[key]];
  const add = (cap: [number, number], at: number, start: boolean) => {
    const d = Math.hypot(cap[0] - snake.x[at], cap[1] - snake.y[at]);
    const next = start ? 1 : -1, slope = snake.t[at] - snake.t[at + next];
    const vertex = { x: cap[0], y: cap[1], t: snake.t[at] + Math.sign(slope || 1) * d, kappa: snake.kappa[at], path: snake.path[at], z: snake.z[at] };
    for (const key of ['x', 'y', 't', 'kappa', 'path', 'z'] as const) {
      if (start) drawn[key].unshift(vertex[key]); else drawn[key].push(vertex[key]);
    }
  };
  if (snake.capStart) add(snake.capStart, 0, true);
  if (snake.capEnd) add(snake.capEnd, snake.x.length - 1, false);
  return drawn;
}

export function buildStrips(snakes: Snake[], ghosts: Snake[], params: Params): Strips {
  const builder = new StripBuilder();
  const style = [ink, sketchy][params.style] ?? ink;
  for (const snake of [...snakes, ...ghosts]) if (snake.shown > 0.01) style(builder, withCaps(snake), params);
  return builder.build();
}
