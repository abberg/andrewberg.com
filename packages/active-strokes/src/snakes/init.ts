import type { Coverage } from './coverage';
import { grow } from './extend';
import type { Params } from './params';
import { random } from './random';
import { createSnake, length, type Snake } from './snake';

// Seeds snakes on uncovered samples (section 5.1, "Initialization"; the insert
// operator does the same after the others). Takes uncovered samples in random
// order and grows a snake from each, both ways, as far as extension allows.
export function insertSnakes(coverage: Coverage, params: Params, seed = params.seed): Snake[] {
  const { samples, covered } = coverage;
  const { points, motion } = samples;
  const next = random(seed);
  const order = Array.from({ length: samples.count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const snakes: Snake[] = [];
  for (const i of order) {
    if (covered[i]) continue;
    const x = points[i * 4], y = points[i * 4 + 1], tx = points[i * 4 + 2], ty = points[i * 4 + 3];
    // The seed's footprint is covered whether or not a snake grows from it, so
    // lone samples (noise) aren't tried again.
    const z = motion[i * 4 + 3] || NaN;
    coverage.cover(x, y, tx, ty, z);
    covered[i] = 1;
    const ahead = grow(coverage, params, x, y, tx, ty, -1, z);
    const behind = grow(coverage, params, x, y, -tx, -ty, -1, z);
    if (ahead.xs.length + behind.xs.length === 0) continue;
    const snake = createSnake([...behind.xs.reverse(), x, ...ahead.xs], [...behind.ys.reverse(), y, ...ahead.ys]);
    snake.z = [...behind.zs.reverse(), z, ...ahead.zs];
    if (length(snake) >= params.minLength) snakes.push(snake);
  }
  return snakes;
}
