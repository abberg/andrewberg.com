import type { Coverage } from './coverage';
import type { Params } from './params';
import { sameDepth } from './samples';

// The extension operator (section 5.1) at one end of a snake. From the end
// point e, heading outward along t, looks for an uncovered sample s within
// rExtend such that the new segment u = (s - e)/|s - e| carries on from the
// snake (t·u > thetaPar) and lies along the sample (|u·T| > thetaPar). The
// best by the paper's goodness score wins. Returns its index, or -1.
//
// The jump mustn't cross ground another snake already covers. Otherwise, where
// trim has just taken an end off an overlap, extension leaps straight back
// across it to samples beyond, trim takes it off again next frame, and the
// end never settles. Nor may it run alongside another snake, within rTrim
// and parallel, which is just what trim takes off. And it stays at the end's
// depth z: a line on a limb passing in front is another line.
export function findExtension(coverage: Coverage, params: Params, ex: number, ey: number, tx: number, ty: number, owner = -1, z = NaN) {
  const { points, motion } = coverage.samples;
  const { rExtend, rCover, thetaPar, goodness, depthTolerance } = params;
  let best = -1, bestScore = -Infinity;
  coverage.grid.near(ex, ey, rExtend, j => {
    if (coverage.covered[j] || !sameDepth(z, motion[j * 4 + 3], depthTolerance)) return;
    const dx = points[j * 4] - ex, dy = points[j * 4 + 1] - ey;
    const d = Math.hypot(dx, dy);
    if (d >= rExtend || d < 1) return;
    const ux = dx / d, uy = dy / d;
    const straight = tx * ux + ty * uy;
    const along = Math.abs(ux * points[j * 4 + 2] + uy * points[j * 4 + 3]);
    if (straight <= thetaPar || along <= thetaPar) return;
    const score = goodness * (Math.min(straight, along) - thetaPar) / (1 - thetaPar)
      + (1 - goodness) * (rExtend - d) / (rExtend - rCover);
    if (score <= bestScore) return;
    const steps = Math.ceil(d / params.deltaMax);
    for (let k = 1; k <= steps; k++) {
      const px = ex + dx * k / steps, py = ey + dy * k / steps;
      // Nor run alongside another snake, where trim would take it off again.
      if (coverage.crowded(px, py, ux, uy, owner, z)) return;
      if (k === steps) break;
      let some = false, open = false;
      coverage.footprint(px, py, ux, uy, i => { some = true; if (!coverage.covered[i]) open = true; }, z);
      if (some && !open) return;
    }
    bestScore = score; best = j;
  });
  return best;
}

// Grows a polyline from (ex, ey) heading along (tx, ty) for as long as
// extensions are found, covering samples as it goes. Points come back in
// order of growth, without the start point, with the depth of the sample each
// step reached.
export function grow(coverage: Coverage, params: Params, ex: number, ey: number, tx: number, ty: number, owner = -1, z = NaN, limit = 4000) {
  const { points, motion } = coverage.samples;
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  while (xs.length < limit) {
    const j = findExtension(coverage, params, ex, ey, tx, ty, owner, z);
    if (j < 0) break;
    const sx = points[j * 4], sy = points[j * 4 + 1];
    if (motion[j * 4 + 3] > 0) z = motion[j * 4 + 3];
    const d = Math.hypot(sx - ex, sy - ey);
    const ux = (sx - ex) / d, uy = (sy - ey) / d;
    // Fill in at deltaMax spacing, so the samples between get covered too.
    const pieces = Math.ceil(d / params.deltaMax);
    for (let k = 1; k <= pieces; k++) {
      const x = ex + (sx - ex) * k / pieces, y = ey + (sy - ey) * k / pieces;
      xs.push(x);
      ys.push(y);
      zs.push(z);
      coverage.cover(x, y, ux, uy, z);
    }
    ex = sx; ey = sy; tx = ux; ty = uy;
  }
  return { xs, ys, zs };
}
