import { updateJunctions } from '../brush/junctions';
import { updateBrushPaths } from '../brush/paths';
import { advect } from './advect';
import { Coverage } from './coverage';
import { DenseGrid } from './grid';
import { insertSnakes } from './init';
import { deleteVertices, extend, merge, split, trim } from './operators';
import { defaultParams, type Params } from './params';
import { edgeLengths, relax } from './relax';
import type { Samples } from './samples';
import { resample, type Snake } from './snake';

// Snakes are seeded on the first frame. After that, each frame they're
// advected and relaxed onto the new samples (tracking, section 4), then the
// operators fix up coverage and topology (vectorization, section 5): delete,
// split, trim, extend, merge, insert, in the paper's order. The paper repeats
// the operators until nothing changes; one pass a frame is enough here, since
// the next frame carries on where this one left off.
// The GPU hands samples over in whatever order its threads claimed slots, so
// the same frame comes back shuffled differently each time. Sorting them by
// position makes everything after deterministic: a still frame stays still.
function sortSamples(samples: Samples): Samples {
  const { count, points, motion } = samples;
  const order = Array.from({ length: count }, (_, i) => i)
    .sort((a, b) => points[a * 4 + 1] - points[b * 4 + 1] || points[a * 4] - points[b * 4]);
  const sorted = { count, points: new Float32Array(count * 4), motion: new Float32Array(count * 4) };
  order.forEach((from, to) => {
    sorted.points.set(points.subarray(from * 4, from * 4 + 4), to * 4);
    sorted.motion.set(motion.subarray(from * 4, from * 4 + 4), to * 4);
  });
  return sorted;
}

// Frames a still frame is worked on before the snakes are held as they are.
const settleFrames = 20;

function sameSamples(a: Samples, b: Samples) {
  if (a.count !== b.count) return false;
  for (let i = 0; i < a.count * 4; i++) if (a.points[i] !== b.points[i] || a.motion[i] !== b.motion[i]) return false;
  return true;
}

export class SnakeEngine {
  snakes: Snake[] = [];
  // Pieces of snakes that were deleted, kept for kappaMax frames while their
  // strokes fade out. They move with the scene but take no part in the rest.
  ghosts: Snake[] = [];
  params: Params;
  // Last frame's samples, sorted, to tell when nothing has moved, and for how
  // many frames in a row nothing has.
  private previous: Samples | null = null;
  private stillFrames = 0;

  constructor(params: Partial<Params> = {}) {
    this.params = { ...defaultParams, ...params };
  }

  reset() { this.snakes = []; this.ghosts = []; this.previous = null; this.stillFrames = 0; }

  // Fades carry on (lifespans, ghosts, hidden fragments), and nothing else.
  // moved and ghostsMoved, if given, are how far each vertex was just advected.
  private age(moved?: number[][], ghostsMoved?: number[][]) {
    const { params } = this;
    // Every vertex that made it to this frame has lived a frame longer; ghosts
    // fade over fadeOut frames. Lifespans count the fade-in delay too, so a
    // vertex is invisible up to fadeDelay and fully drawn from there on.
    // Where the scene moves fast (the swipe), snakes can't hold on for long
    // and the ones that replace them would never get to be seen: there a
    // vertex ages a frame more for every fastFade pixels it moved beyond
    // fastFade, so fast lines show within a frame or two. Motion hides the
    // flicker that the waiting is for. Ghosts fade out faster the same way,
    // and go at once where they lost their samples (NaN in ghostsMoved), or a
    // fast swing leaves a trail of them where the arm was.
    const full = params.fadeDelay + params.kappaMax;
    const { fastFade } = params;
    const extra = (moved: number[][] | undefined, s: number, i: number) => moved && fastFade > 0 && moved[s][i] > fastFade ? (moved[s][i] - fastFade) / fastFade : 0;
    this.snakes.forEach((snake, s) => { snake.kappa = snake.kappa.map((k, i) => Math.min(k + 1 + extra(moved, s, i), full)); });
    const fade = params.kappaMax / params.fadeOut;
    this.ghosts.forEach((ghost, s) => {
      ghost.kappa = ghost.kappa.map((k, i) => Number.isNaN(ghostsMoved?.[s][i]) ? 0 : k - fade * (1 + extra(ghostsMoved, s, i)));
    });
    this.ghosts = this.ghosts.filter(ghost => ghost.kappa.some(k => k > params.fadeDelay));
  }

  // frames: how many rendered frames since the previous call (the samples'
  // velocities are per frame).
  step(samples: Samples, frames = 1) {
    const { params } = this;
    samples = sortSamples(samples);
    // A still frame (the walk paused) brings exactly the samples of the last
    // one. The operators get settleFrames of those to finish tidying up, but
    // one pass a frame doesn't always settle: in a few tight spots trim,
    // delete and insert can hand a short snake round between them
    // indefinitely. After that there's nothing new to track, so the snakes are
    // left as they are.
    const still = this.previous !== null && sameSamples(samples, this.previous);
    this.stillFrames = still ? this.stillFrames + 1 : 0;
    this.previous = samples;
    if (this.stillFrames > settleFrames) {
      this.age();
      updateJunctions(this.snakes, params);
      return;
    }
    let coverage = new Coverage(samples, params);
    if (this.snakes.length === 0) {
      this.snakes = insertSnakes(coverage, params);
      updateBrushPaths(this.snakes, params);
      return;
    }
    // How far each vertex is advected, per frame, so a skipped frame doesn't
    // count as speed; NaN where it found nothing to move with.
    const advected = (snakes: Snake[]) => {
      const was = snakes.map(snake => ({ x: [...snake.x], y: [...snake.y] }));
      const lost = advect(snakes, samples, frames, params);
      return snakes.map((snake, s) => snake.x.map((x, i) => lost[s][i] ? NaN : Math.hypot(x - was[s].x[i], snake.y[i] - was[s].y[i]) / frames));
    };
    this.age(advected(this.snakes), advected(this.ghosts));
    const grid = new DenseGrid(samples.points, samples.count, 4, params.sigma);
    for (const snake of this.snakes) {
      relax(snake, edgeLengths(snake), samples, grid, params);
      resample(snake, params.deltaMax);
    }
    // Operators that add (extend, insert) or remove for lack of coverage
    // (delete) judge coverage loosely: a sample counts as covered from a little
    // further away, and at a looser angle, than trim's strict test. That dead
    // band is what lets a still pose settle. Without it, a vertex sitting
    // right at the threshold is cut and merged back, or trimmed and grown
    // back, or a redundant snake is trimmed and seeded again, every frame.
    const loose = { ...params, rCover: params.rCover * 1.25, thetaC: params.thetaC - 0.1 };
    let snakes = deleteVertices(this.snakes, new Coverage(samples, loose), piece => this.ghosts.push(piece));
    snakes = split(snakes, params);
    snakes = trim(snakes, coverage, params);
    coverage = new Coverage(samples, loose);
    for (const snake of snakes) coverage.coverSnake(snake);
    snakes = extend(snakes, coverage, params);
    snakes = merge(snakes, params, coverage);
    for (const snake of snakes) resample(snake, params.deltaMax);
    snakes.push(...insertSnakes(coverage, params));
    updateBrushPaths(snakes, params);
    updateJunctions(snakes, params);
    this.snakes = snakes;
  }
}
