// Solves A u = r for a banded matrix with two diagonals either side of the
// main one (the snake's internal-energy matrix is pentadiagonal), for two
// right-hand sides at once. Gaussian elimination without pivoting, which is
// safe because A + gamma I is diagonally dominant. Overwrites its inputs.
//
// band holds row i's entries for columns i-2..i+2 at band[i*5 + 0..4].
export function solveBanded(band: Float64Array, rx: Float64Array, ry: Float64Array, n: number) {
  for (let k = 0; k < n; k++) {
    const pivot = band[k * 5 + 2];
    for (let r = k + 1; r <= Math.min(k + 2, n - 1); r++) {
      // Entry (r, k) sits at offset k - r + 2 in row r.
      const factor = band[r * 5 + (k - r + 2)] / pivot;
      if (factor === 0) continue;
      for (let c = k; c <= Math.min(k + 2, n - 1); c++) band[r * 5 + (c - r + 2)] -= factor * band[k * 5 + (c - k + 2)];
      rx[r] -= factor * rx[k];
      ry[r] -= factor * ry[k];
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let sx = rx[k], sy = ry[k];
    for (let c = k + 1; c <= Math.min(k + 2, n - 1); c++) {
      sx -= band[k * 5 + (c - k + 2)] * rx[c];
      sy -= band[k * 5 + (c - k + 2)] * ry[c];
    }
    rx[k] = sx / band[k * 5 + 2];
    ry[k] = sy / band[k * 5 + 2];
  }
}

// A + gamma I for an open snake of n vertices: alpha on every edge's
// (v[i+1] - v[i])², beta on every interior vertex's (v[i-1] - 2v[i] + v[i+1])².
// Summing per edge and per triple gives the right free-end rows without
// special cases.
export function internalMatrix(n: number, alpha: number, beta: number, gamma: number) {
  const band = new Float64Array(n * 5);
  const add = (r: number, c: number, value: number) => { band[r * 5 + (c - r + 2)] += value; };
  for (let i = 0; i < n; i++) add(i, i, gamma);
  for (let i = 0; i + 1 < n; i++) {
    add(i, i, alpha); add(i + 1, i + 1, alpha);
    add(i, i + 1, -alpha); add(i + 1, i, -alpha);
  }
  const d = [1, -2, 1];
  for (let i = 1; i + 1 < n; i++) {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) add(i - 1 + a, i - 1 + b, beta * d[a] * d[b]);
  }
  return band;
}
