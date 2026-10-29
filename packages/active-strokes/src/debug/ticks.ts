import type { Samples } from '../extract/compact';
import type { SnakeFrame } from '../worker';

// Draws read-back samples on a 2D canvas over the WebGPU one: either a short
// tick along each tangent, tinted by speed so the velocity can be checked too,
// or faint dots under the snakes, each snake its own colour (by id, so it holds
// while the snake survives).
export function createTickOverlay() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
  canvas.hidden = true;
  document.body.append(canvas);
  const context = canvas.getContext('2d')!;
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:16px;bottom:12px;font:12px/1.4 ui-monospace,monospace;color:#555;pointer-events:none';
  label.hidden = true;
  document.body.append(label);

  return {
    set visible(value: boolean) { canvas.hidden = label.hidden = !value; },
    draw(samples: Samples | null, snakes: SnakeFrame | null = null) {
      if (canvas.hidden || !samples) return;
      const { count, width, height, points, motion } = samples;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      if (snakes) {
        context.fillStyle = '#ccc';
        for (let i = 0; i < count; i++) context.fillRect(points[i * 4] - 0.5, points[i * 4 + 1] - 0.5, 1, 1);
        const { vertices, offsets } = snakes;
        let vertexCount = 0;
        for (let s = 0; s + 1 < offsets.length; s++) {
          context.strokeStyle = `hsl(${(snakes.ids[s] * 137.5) % 360} 70% 42%)`;
          context.lineWidth = 1.5;
          context.beginPath();
          for (let k = offsets[s]; k < offsets[s + 1]; k++) {
            if (k === offsets[s]) context.moveTo(vertices[k * 2], vertices[k * 2 + 1]);
            else context.lineTo(vertices[k * 2], vertices[k * 2 + 1]);
          }
          context.stroke();
          vertexCount += offsets[s + 1] - offsets[s];
        }
        label.textContent = `${count} samples, ${offsets.length - 1} snakes, ${vertexCount} vertices, ` +
          `${snakes.time.toFixed(1)} ms, ${samples.frame - snakes.frame} frame(s) behind`;
        return;
      }
      context.lineWidth = 1;
      // Every other sample keeps the ticks legible; they're a pixel apart.
      for (let i = 0; i < count; i += 2) {
        const x = points[i * 4], y = points[i * 4 + 1], tx = points[i * 4 + 2], ty = points[i * 4 + 3];
        const speed = Math.hypot(motion[i * 4], motion[i * 4 + 1]);
        const t = Math.min(speed / 4, 1);
        context.strokeStyle = `rgb(${Math.round(220 * t)},${Math.round(40 * t)},${Math.round(40 * (1 - t))})`;
        context.beginPath();
        context.moveTo(x - tx * 3, y - ty * 3);
        context.lineTo(x + tx * 3, y + ty * 3);
        context.stroke();
      }
      label.textContent = `${count} samples`;
    },
  };
}
