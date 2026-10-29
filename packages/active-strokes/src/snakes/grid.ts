// A sparse uniform grid over points, for disc queries. The paper uses a hashed
// grid with cells of 2 rCover, so a disc of radius rCover touches four cells.
export class Grid {
  private cells = new Map<number, number[]>();

  constructor(private size: number) {}

  private key(cx: number, cy: number) {
    // Cells stay well inside ±2^15 for any screen, so this packing is unique.
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear() { this.cells.clear(); }

  add(id: number, x: number, y: number) {
    const key = this.key(Math.floor(x / this.size), Math.floor(y / this.size));
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, cell = []);
    cell.push(id);
  }

  // Calls visit with every id whose cell overlaps the disc; the caller checks distance.
  near(x: number, y: number, radius: number, visit: (id: number) => void) {
    const x0 = Math.floor((x - radius) / this.size), x1 = Math.floor((x + radius) / this.size);
    const y0 = Math.floor((y - radius) / this.size), y1 = Math.floor((y + radius) / this.size);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const id of cell) visit(id);
      }
    }
  }
}

// A dense grid over a set of points for the hottest disc queries
// (relaxation runs one per vertex, per iteration): the points sorted by cell
// into flat arrays, so a query is index arithmetic, with no hashing and no
// callback.
export class DenseGrid {
  // Points in cell c are items[start[c]] .. items[start[c + 1] - 1].
  readonly start: Int32Array;
  readonly items: Int32Array;
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;

  // xy holds x, y at xy[i * stride], xy[i * stride + 1].
  constructor(xy: Float32Array, count: number, stride: number, readonly size: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = xy[i * stride], y = xy[i * stride + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!count) x0 = y0 = x1 = y1 = 0;
    this.x0 = x0; this.y0 = y0;
    this.cols = Math.floor((x1 - x0) / size) + 1;
    this.rows = Math.floor((y1 - y0) / size) + 1;
    const cell = new Int32Array(count);
    this.start = new Int32Array(this.cols * this.rows + 1);
    for (let i = 0; i < count; i++) {
      cell[i] = Math.floor((xy[i * stride + 1] - y0) / size) * this.cols + Math.floor((xy[i * stride] - x0) / size);
      this.start[cell[i] + 1]++;
    }
    for (let c = 0; c < this.cols * this.rows; c++) this.start[c + 1] += this.start[c];
    const fill = this.start.slice(0, -1);
    this.items = new Int32Array(count);
    for (let i = 0; i < count; i++) this.items[fill[cell[i]]++] = i;
  }
}
