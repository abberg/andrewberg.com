import { DenseGrid } from './grid';
import type { Params } from './params';
import type { Samples } from './samples';
import { tangent, type Snake } from './snake';

// Moves snakes from last frame to this one (section 4.1). Each sample knows
// its velocity over the last frame, so p - v is where its point was then.
// A vertex moves with the samples that were near it then, Gaussian-weighted,
// but only those on the same line (aligned with the vertex's tangent) and at
// the same depth. Where limbs cross, a plain average would mix the two limbs'
// motions and drag lines on the one behind along with the one in front.
// The vertex then takes on its samples' depth for next frame. Returns, per
// snake, which vertices found no samples to move with (and stayed put).
export function advect(snakes: Snake[], samples: Samples, frames: number, params: Params, reach = 20, near = 6): boolean[][] {
  const { points, motion } = samples;
  const { advectAlignment, depthTolerance, advectDepthSlack } = params;
  // Where each sample was last frame, x, y interleaved, gridded by half the reach.
  const was = new Float32Array(samples.count * 2);
  for (let i = 0; i < samples.count; i++) {
    was[i * 2] = points[i * 4] - motion[i * 4] * frames;
    was[i * 2 + 1] = points[i * 4 + 1] - motion[i * 4 + 1] * frames;
  }
  const { start, items, x0, y0, cols, rows, size } = new DenseGrid(was, samples.count, 2, reach / 2);
  const twoNear2 = 2 * near * near, weighed2 = 9 * near * near;
  return snakes.map(snake => {
    // Tangents from last frame's shape, before any vertex moves.
    const tangents = snake.x.map((_, k) => tangent(snake, k));
    const lost = snake.x.map(() => false);
    for (let k = 0; k < snake.x.length; k++) {
      const x = snake.x[k], y = snake.y[k], z = snake.z[k];
      const [tx, ty] = tangents[k];
      let wx = 0, wy = 0, wz = 0, w = 0, nearest = -1, nearestD2 = reach * reach;
      const cx0 = Math.max(0, Math.floor((x - reach - x0) / size)), cx1 = Math.min(cols - 1, Math.floor((x + reach - x0) / size));
      const cy0 = Math.max(0, Math.floor((y - reach - y0) / size)), cy1 = Math.min(rows - 1, Math.floor((y + reach - y0) / size));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let c = cy * cols + cx0, last = cy * cols + cx1; c <= last; c++) {
          for (let m = start[c], end = start[c + 1]; m < end; m++) {
            const i = items[m];
            if (Math.abs(points[i * 4 + 2] * tx + points[i * 4 + 3] * ty) < advectAlignment) continue;
            // Same surface only (sameDepth in samples.ts, inlined), allowing
            // for the depth a fast sample has changed since last frame.
            const zs = motion[i * 4 + 3];
            const tolerance = depthTolerance + advectDepthSlack * Math.hypot(motion[i * 4], motion[i * 4 + 1]) * frames;
            if (z > 0 && zs > 0 && Math.abs(z - zs) > tolerance * z) continue;
            const dx = was[i * 2] - x, dy = was[i * 2 + 1] - y, d2 = dx * dx + dy * dy;
            if (d2 < nearestD2) { nearestD2 = d2; nearest = i; }
            if (d2 < weighed2) {
              const weight = Math.exp(-d2 / twoNear2);
              wx += motion[i * 4] * weight; wy += motion[i * 4 + 1] * weight; wz += zs * weight; w += weight;
            }
          }
        }
      }
      if (w > 1e-3) {
        snake.x[k] += wx / w * frames; snake.y[k] += wy / w * frames;
        if (wz > 0) snake.z[k] = wz / w;
      } else if (nearest >= 0) {
        snake.x[k] += motion[nearest * 4] * frames; snake.y[k] += motion[nearest * 4 + 1] * frames;
        if (motion[nearest * 4 + 3] > 0) snake.z[k] = motion[nearest * 4 + 3];
      } else {
        lost[k] = true;
      }
    }
    return lost;
  });
}
