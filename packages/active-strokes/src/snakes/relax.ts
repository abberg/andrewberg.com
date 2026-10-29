import { internalMatrix, solveBanded } from './banded';
import type { DenseGrid } from './grid';
import type { Params } from './params';
import type { Samples } from './samples';
import type { Snake } from './snake';

// Pulls a snake onto this frame's lines (section 4.2) by semi-implicit
// gradient descent, Kass et al. style: (A + gamma I) v' = gamma v + f(v).
//
// f is the attraction plus springs. The attraction follows the gradient of the
// sample image blurred by a Gaussian of width sigma, evaluated straight from
// the samples within 2 sigma, so nothing but the samples leaves the GPU. (The
// paper writes the energy as -|grad(G*I)|², but describes the blurred image's
// gradient as the field; with I already a line image the latter is what pulls
// a snake onto the line's centre.)
//
// Springs keep each edge near its rest length (its length after advection),
// so snakes don't shrink off the ends of their lines. In the end every vertex
// only moves across its line (see below).
//
// This is most of the Worker's time, so it allocates nothing per vertex and
// finds samples through a dense grid (built once a frame, with cells of
// sigma) rather than the hashed one.
export function relax(snake: Snake, rest: number[], samples: Samples, grid: DenseGrid, params: Params) {
  const n = snake.x.length;
  if (n < 2) return;
  const { alpha, beta, gamma, sigma, attraction, attractionFar, stiffness, iterations, depthTolerance } = params;
  const { points, motion } = samples;
  const { start, items, x0, y0, cols, rows, size } = grid;
  const reach = 2 * sigma, reach2 = reach * reach, twoSigma2 = 2 * sigma * sigma;
  const fx = new Float64Array(n), fy = new Float64Array(n);
  const rx = new Float64Array(n), ry = new Float64Array(n);
  // A + gamma I doesn't change between iterations; the solve overwrites it.
  const matrix = internalMatrix(n, alpha, beta, gamma);
  for (let iteration = 0; iteration < iterations; iteration++) {
    fx.fill(0); fy.fill(0);
    for (let i = 0; i < n; i++) {
      const x = snake.x[i], y = snake.y[i], z = snake.z[i];
      let gx = 0, gy = 0, total = 0;
      const cx0 = Math.max(0, Math.floor((x - reach - x0) / size)), cx1 = Math.min(cols - 1, Math.floor((x + reach - x0) / size));
      const cy0 = Math.max(0, Math.floor((y - reach - y0) / size)), cy1 = Math.min(rows - 1, Math.floor((y + reach - y0) / size));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let c = cy * cols + cx0, last = cy * cols + cx1; c <= last; c++) {
          for (let k = start[c], end = start[c + 1]; k < end; k++) {
            const j = items[k];
            const dx = points[j * 4] - x, dy = points[j * 4 + 1] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= reach2) continue;
            // Only lines on the surface this vertex tracks attract it, not one
            // on a limb passing in front (sameDepth in samples.ts, inlined).
            const zs = motion[j * 4 + 3];
            if (z > 0 && zs > 0 && Math.abs(z - zs) > depthTolerance * z) continue;
            const w = Math.exp(-d2 / twoSigma2);
            gx += dx * w; gy += dy * w; total += w;
          }
        }
      }
      if (total < 1e-6) continue;
      // Offset to the Gaussian-weighted centre of the nearby samples: the
      // gradient of the blurred sample image, normalised by how many samples
      // there are, so its length is roughly the distance to the line. The pull
      // grows with that distance: gentle within a pixel or so, where samples
      // only wobble with pixel quantization (pulling hard there is jitter),
      // and strong once a snake has fallen behind its line, as where limbs
      // cross (pulling gently there is smearing). Each is the fraction of the
      // offset closed per iteration.
      const ox = gx / total, oy = gy / total, d = Math.hypot(ox, oy);
      const far = Math.min(1, Math.max(0, (d - 1) / 3));
      const gain = gamma * (attraction + (attractionFar - attraction) * far * far * (3 - 2 * far));
      fx[i] += gain * ox;
      fy[i] += gain * oy;
    }
    for (let i = 0; i + 1 < n; i++) {
      const dx = snake.x[i + 1] - snake.x[i], dy = snake.y[i + 1] - snake.y[i];
      const len = Math.hypot(dx, dy) || 1;
      const pull = stiffness * (len - rest[i]) / len;
      fx[i] += pull * dx; fy[i] += pull * dy;
      fx[i + 1] -= pull * dx; fy[i + 1] -= pull * dy;
    }
    const band = matrix.slice();
    for (let i = 0; i < n; i++) {
      rx[i] = gamma * snake.x[i] + fx[i];
      ry[i] = gamma * snake.y[i] + fy[i];
    }
    solveBanded(band, rx, ry, n);
    // Vertices may only move across the line, not along it. Motion along the
    // line is advection's job; left to itself, relaxation keeps sliding
    // vertices along (the membrane contracts every frame, and rest lengths
    // reset every frame), so nothing ever settles, the ends creep, and the
    // brush parameter riding on the vertices slides with them.
    for (let i = 0; i < n; i++) {
      // The tangent at i (as tangent() in snake.ts has it).
      const a = Math.max(i - 1, 0), b = Math.min(i + 1, n - 1);
      const ex = snake.x[b] - snake.x[a], ey = snake.y[b] - snake.y[a], l = Math.hypot(ex, ey) || 1;
      const tx = ex / l, ty = ey / l;
      const along = (rx[i] - snake.x[i]) * tx + (ry[i] - snake.y[i]) * ty;
      rx[i] -= along * tx; ry[i] -= along * ty;
    }
    for (let i = 0; i < n; i++) { snake.x[i] = rx[i]; snake.y[i] = ry[i]; }
  }
}

export function edgeLengths(snake: Snake) {
  const rest: number[] = [];
  for (let i = 0; i + 1 < snake.x.length; i++) rest.push(Math.hypot(snake.x[i + 1] - snake.x[i], snake.y[i + 1] - snake.y[i]));
  return rest;
}
