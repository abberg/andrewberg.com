import { Grid } from './grid';
import type { Params } from './params';
import { sameDepth, type Samples } from './samples';
import { tangent, type Snake } from './snake';

// Which samples are covered: a sample is covered when some snake vertex lies
// within rCover and their tangents are aligned, |T·t| > thetaC (section 5.1).
export class Coverage {
  readonly grid: Grid;
  readonly covered: Uint8Array;
  // Every vertex of the snakes covered so far, with its tangent and owner,
  // so growth can keep clear of other snakes (see crowded).
  private vertices = { grid: new Grid(1), x: [] as number[], y: [] as number[], tx: [] as number[], ty: [] as number[], z: [] as number[], owner: [] as number[] };

  constructor(readonly samples: Samples, private params: Params) {
    this.grid = new Grid(2 * params.rCover);
    for (let i = 0; i < samples.count; i++) this.grid.add(i, samples.points[i * 4], samples.points[i * 4 + 1]);
    this.covered = new Uint8Array(samples.count);
    this.vertices.grid = new Grid(2 * params.rTrim);
  }

  // Marks the footprint of a point with tangent (tx, ty); returns how many
  // samples it newly covered.
  cover(x: number, y: number, tx: number, ty: number, z = NaN) {
    let added = 0;
    this.footprint(x, y, tx, ty, i => {
      if (this.covered[i]) return;
      this.covered[i] = 1;
      added++;
    }, z);
    return added;
  }

  // Whether a point with tangent (tx, ty) covers at least one sample.
  hasFootprint(x: number, y: number, tx: number, ty: number, z = NaN) {
    let found = false;
    this.footprint(x, y, tx, ty, () => { found = true; }, z);
    return found;
  }

  // Calls visit with each sample a point with tangent (tx, ty), at distance z
  // from the camera, would cover.
  footprint(x: number, y: number, tx: number, ty: number, visit: (i: number) => void, z = NaN) {
    const { points, motion } = this.samples;
    const { rCover, thetaC, depthTolerance } = this.params;
    this.grid.near(x, y, rCover, i => {
      const dx = points[i * 4] - x, dy = points[i * 4 + 1] - y;
      if (dx * dx + dy * dy >= rCover * rCover) return;
      if (Math.abs(points[i * 4 + 2] * tx + points[i * 4 + 3] * ty) <= thetaC) return;
      if (!sameDepth(z, motion[i * 4 + 3], depthTolerance)) return;
      visit(i);
    });
  }

  coverSnake(snake: Snake) {
    const v = this.vertices;
    for (let i = 0; i < snake.x.length; i++) {
      const [tx, ty] = tangent(snake, i);
      this.cover(snake.x[i], snake.y[i], tx, ty, snake.z[i]);
      v.grid.add(v.x.length, snake.x[i], snake.y[i]);
      v.x.push(snake.x[i]); v.y.push(snake.y[i]); v.tx.push(tx); v.ty.push(ty); v.z.push(snake.z[i]); v.owner.push(snake.id);
    }
  }

  // Whether a point heading along (tx, ty) would sit close to, and parallel
  // to, a vertex of some snake other than owner: where trim would take it off
  // again. Judged with a margin (twice rTrim, a looser angle), since
  // relaxation will still pull a new vertex onto the shared line.
  crowded(x: number, y: number, tx: number, ty: number, owner: number, z = NaN) {
    const { rTrim, thetaPar, depthTolerance } = this.params, v = this.vertices, reach = 2 * rTrim;
    let found = false;
    v.grid.near(x, y, reach, w => {
      if (found || v.owner[w] === owner || !sameDepth(z, v.z[w], depthTolerance)) return;
      const dx = v.x[w] - x, dy = v.y[w] - y;
      if (dx * dx + dy * dy < reach * reach && Math.abs(tx * v.tx[w] + ty * v.ty[w]) > thetaPar - 0.1) found = true;
    });
    return found;
  }
}
