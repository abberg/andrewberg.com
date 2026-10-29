import { SnakeEngine } from './snakes/engine';
import type { Samples } from './extract/compact';
import type { Params } from './snakes/params';
import { buildStrips } from './brush/strips';
import { slide } from './brush/paths';

// Runs the snakes off the main thread. Takes one frame of samples at a time
// and answers with every snake's vertices, flattened.
export interface SnakeFrame {
  frame: number;
  // x, y pairs for every snake, back to back
  vertices: Float32Array;
  // Where each snake starts in vertices (in pairs), plus a final end offset
  offsets: Uint32Array;
  // Each snake's id, stable while the snake survives
  ids: Uint32Array;
  // Brush paths as triangle strips (see brush/strips.ts)
  strips: Float32Array;
  stripIndices: Uint32Array;
  // Milliseconds spent in step() and building strips
  time: number;
  // Mean distance the brush parameter slid this frame, in pixels
  slide: number;
}

export type WorkerMessage =
  | { type: 'samples'; samples: Samples }
  | { type: 'params'; params: Partial<Params> }
  | { type: 'reset' };

const engine = new SnakeEngine();
let lastFrame = -1;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === 'reset') {
    engine.reset();
    return;
  }
  if (message.type === 'params') {
    Object.assign(engine.params, message.params);
    return;
  }
  const { samples } = message;
  const start = performance.now();
  slide.total = slide.count = 0;
  engine.step(samples, lastFrame < 0 ? 1 : samples.frame - lastFrame);
  lastFrame = samples.frame;
  let total = 0;
  for (const snake of engine.snakes) total += snake.x.length;
  const vertices = new Float32Array(total * 2);
  const offsets = new Uint32Array(engine.snakes.length + 1);
  const ids = Uint32Array.from(engine.snakes, snake => snake.id);
  let at = 0;
  engine.snakes.forEach((snake, i) => {
    offsets[i] = at;
    for (let k = 0; k < snake.x.length; k++, at++) {
      vertices[at * 2] = snake.x[k];
      vertices[at * 2 + 1] = snake.y[k];
    }
  });
  offsets[engine.snakes.length] = at;
  const { vertices: strips, indices: stripIndices } = buildStrips(engine.snakes, engine.ghosts, engine.params);
  const frame: SnakeFrame = { frame: samples.frame, vertices, offsets, ids, strips, stripIndices, time: performance.now() - start,
    slide: slide.count ? slide.total / slide.count : 0 };
  (self as unknown as Worker).postMessage(frame, [vertices.buffer, offsets.buffer, ids.buffer, strips.buffer, stripIndices.buffer]);
};
