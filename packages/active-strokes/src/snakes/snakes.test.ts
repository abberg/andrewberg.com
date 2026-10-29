import { describe, expect, it } from 'vitest';
import { internalMatrix, solveBanded } from './banded';
import { SnakeEngine } from './engine';
import type { Samples } from './samples';
import { length, resample, createSnake } from './snake';

// Samples one pixel apart along straight segments, with optional velocity.
function lines(segments: [number, number, number, number][], velocity: [number, number] = [0, 0]): Samples {
  const pts: number[] = [], mot: number[] = [];
  for (const [x0, y0, x1, y1] of segments) {
    const len = Math.hypot(x1 - x0, y1 - y0), tx = (x1 - x0) / len, ty = (y1 - y0) / len;
    for (let s = 0; s <= len; s++) {
      pts.push(x0 + tx * s, y0 + ty * s, tx, ty);
      mot.push(velocity[0], velocity[1], 1, 0);
    }
  }
  return { count: pts.length / 4, points: new Float32Array(pts), motion: new Float32Array(mot) };
}

const meanDistanceToY = (engine: SnakeEngine, y: number) => {
  let total = 0, n = 0;
  for (const s of engine.snakes) for (const v of s.y) { total += Math.abs(v - y); n++; }
  return total / n;
};

describe('banded solver', () => {
  it('matches a direct multiply', () => {
    const n = 7, band = internalMatrix(n, 0.3, 0.2, 1);
    const copy = band.slice();
    const ux = Array.from({ length: n }, (_, i) => Math.sin(i)), uy = Array.from({ length: n }, (_, i) => i * i);
    const rx = new Float64Array(n), ry = new Float64Array(n);
    for (let r = 0; r < n; r++) for (let c = Math.max(0, r - 2); c <= Math.min(n - 1, r + 2); c++) {
      rx[r] += copy[r * 5 + c - r + 2] * ux[c];
      ry[r] += copy[r * 5 + c - r + 2] * uy[c];
    }
    solveBanded(band, rx, ry, n);
    for (let i = 0; i < n; i++) {
      expect(rx[i]).toBeCloseTo(ux[i], 9);
      expect(ry[i]).toBeCloseTo(uy[i], 9);
    }
  });
});

describe('resample', () => {
  it('keeps spacing at most deltaMax and keeps the ends', () => {
    const snake = createSnake([0, 1, 1.5, 20, 40], [0, 0, 0, 0, 0]);
    resample(snake, 6);
    for (let i = 1; i < snake.x.length; i++) expect(snake.x[i] - snake.x[i - 1]).toBeLessThanOrEqual(6 + 1e-9);
    expect(snake.x[0]).toBe(0);
    expect(snake.x.at(-1)).toBe(40);
  });
});

describe('initialization', () => {
  it('covers one straight line with one snake', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    expect(engine.snakes).toHaveLength(1);
    expect(length(engine.snakes[0])).toBeGreaterThan(180);
  });

  it('gives two well-separated parallel lines a snake each', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50], [10, 100, 210, 100]]));
    expect(engine.snakes).toHaveLength(2);
  });

  it('splits at a right-angle corner', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 110, 50], [110, 50, 110, 150]]));
    expect(engine.snakes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('tracking', () => {
  it('relaxes a displaced snake back onto its line', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    // The line jumps 5 px down with no velocity to say so: relaxation alone,
    // which is a gentle correction, so it gets a few frames.
    for (let frame = 0; frame < 4; frame++) engine.step(lines([[10, 55, 210, 55]]));
    expect(meanDistanceToY(engine, 55)).toBeLessThan(1.5);
  });

  it('follows a line moving 8 px a frame', () => {
    const engine = new SnakeEngine();
    let y = 50;
    engine.step(lines([[10, y, 210, y]]));
    for (let frame = 0; frame < 20; frame++) {
      y += 8;
      engine.step(lines([[10, y, 210, y]], [0, 8]));
    }
    expect(meanDistanceToY(engine, y)).toBeLessThan(0.5);
    // Springs slow the rubber-band shrink from the membrane term; the extend
    // operator (phase 3) is what grows ends back.
    expect(length(engine.snakes[0])).toBeGreaterThan(150);
  });
});

describe('operators', () => {
  it('deletes snakes whose line has gone', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50], [10, 150, 210, 150]]));
    engine.step(lines([[10, 50, 210, 50]]));
    expect(engine.snakes).toHaveLength(1);
    expect(engine.snakes[0].y[0]).toBeCloseTo(50, 0);
  });

  it('cuts a snake where part of its line is occluded', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    engine.step(lines([[10, 50, 80, 50], [140, 50, 210, 50]]));
    expect(engine.snakes).toHaveLength(2);
  });

  it('splits a snake bent round a sharp corner', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 110, 50]]));
    // Hand the engine a snake that runs straight round a right angle.
    const xs: number[] = [], ys: number[] = [];
    for (let x = 10; x <= 110; x += 5) { xs.push(x); ys.push(50); }
    for (let y = 55; y <= 150; y += 5) { xs.push(110); ys.push(y); }
    engine.snakes = [createSnake(xs, ys)];
    engine.step(lines([[10, 50, 110, 50], [110, 50, 110, 150]]));
    expect(engine.snakes.length).toBeGreaterThanOrEqual(2);
    for (const s of engine.snakes) {
      const vertical = Math.abs(s.x.at(-1)! - s.x[0]) < Math.abs(s.y.at(-1)! - s.y[0]);
      for (let i = 0; i < s.x.length; i++) expect(vertical ? Math.abs(s.x[i] - 110) : Math.abs(s.y[i] - 50)).toBeLessThan(3);
    }
  });

  it('trims two snakes overlapping on one line down to unit coverage', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    engine.snakes = [createSnake([10, 40, 70, 100, 130], [50, 50, 50, 50, 50]), createSnake([90, 120, 150, 180, 210], [50, 50, 50, 50, 50])];
    for (const s of engine.snakes) resample(s, 6);
    for (let frame = 0; frame < 3; frame++) engine.step(lines([[10, 50, 210, 50]]));
    // Overlap trimmed away (and the halves possibly merged): no x covered twice.
    let doubled = 0;
    for (let x = 12; x < 208; x++) {
      const on = engine.snakes.filter(s => Math.min(...s.x) <= x && x <= Math.max(...s.x)).length;
      if (on > 1) doubled++;
    }
    expect(doubled).toBeLessThan(15);
  });

  it('merges two snakes that end near each other on one line', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    engine.snakes = [createSnake([10, 100], [50, 50]), createSnake([112, 210], [50, 50])];
    for (const s of engine.snakes) resample(s, 6);
    engine.step(lines([[10, 50, 210, 50]]));
    expect(engine.snakes).toHaveLength(1);
    expect(length(engine.snakes[0])).toBeGreaterThan(180);
  });

  it('inserts a snake on a line that appears', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    engine.step(lines([[10, 50, 210, 50], [10, 150, 210, 150]]));
    expect(engine.snakes).toHaveLength(2);
  });
});

describe('brush paths', () => {
  const paramNear = (engine: SnakeEngine, x: number) => {
    let best = Infinity, t = NaN;
    for (const s of engine.snakes) s.x.forEach((vx, i) => { if (Math.abs(vx - x) < best) { best = Math.abs(vx - x); t = s.t[i]; } });
    return t;
  };

  it('keeps the parameter fixed to the line as it moves', () => {
    const engine = new SnakeEngine();
    let y = 50;
    engine.step(lines([[10, y, 210, y]]));
    const before = paramNear(engine, 110);
    for (let frame = 0; frame < 20; frame++) {
      y += 8;
      engine.step(lines([[10, y, 210, y]], [0, 8]));
    }
    expect(Math.abs(paramNear(engine, 110) - before)).toBeLessThan(3);
  });

  it('runs the parameter at about one unit per pixel', () => {
    const engine = new SnakeEngine();
    engine.step(lines([[10, 50, 210, 50]]));
    engine.step(lines([[10, 50, 210, 50]]));
    expect(Math.abs(paramNear(engine, 160) - paramNear(engine, 60))).toBeCloseTo(100, -1);
  });
});

describe('a still frame', () => {
  it('settles: the same samples, frame after frame, leave the snakes alone', () => {
    // A cross, a T-junction, two close parallels and an arc: the places where
    // operators have fought each other before.
    const shapes: [number, number, number, number][] = [
      [20, 100, 220, 100], [120, 20, 120, 180],
      [260, 40, 460, 40], [360, 40, 360, 160],
      [20, 220, 220, 220], [20, 226, 220, 226],
    ];
    for (let k = 0; k < 30; k++) {
      const a0 = Math.PI * k / 30, a1 = Math.PI * (k + 1) / 30;
      shapes.push([360 + 80 * Math.cos(a0), 300 - 80 * Math.sin(a0), 360 + 80 * Math.cos(a1), 300 - 80 * Math.sin(a1)]);
    }
    const engine = new SnakeEngine();
    const frame = lines(shapes);
    for (let f = 0; f < 30; f++) engine.step(frame);
    const before = engine.snakes.map(s => ({ id: s.id, x: [...s.x], y: [...s.y], t: [...s.t] }));
    for (let f = 0; f < 5; f++) engine.step(frame);
    expect(engine.snakes.map(s => s.id).sort()).toEqual(before.map(s => s.id).sort());
    for (const s of engine.snakes) {
      const b = before.find(p => p.id === s.id)!;
      expect(s.x.length).toBe(b.x.length);
      s.x.forEach((x, i) => {
        expect(Math.hypot(x - b.x[i], s.y[i] - b.y[i])).toBeLessThan(0.1);
        expect(Math.abs(s.t[i] - b.t[i])).toBeLessThan(0.1);
      });
    }
  });
});

describe('junctions', () => {
  it('hides a short loose fragment, but not a long line', () => {
    const engine = new SnakeEngine();
    const frame = lines([[10, 50, 210, 50], [100, 150, 112, 150]]);
    for (let f = 0; f < 12; f++) engine.step(frame);
    const long = engine.snakes.find(s => s.y[0] < 100)!, short = engine.snakes.find(s => s.y[0] > 100);
    expect(long.shown).toBe(1);
    if (short) expect(short.shown).toBe(0);
  });

  it('draws a line on to the line it meets at a T-junction', () => {
    const engine = new SnakeEngine();
    // A vertical line stopping 8 px short of a horizontal one.
    const frame = lines([[10, 50, 210, 50], [110, 58, 110, 160]]);
    for (let f = 0; f < 6; f++) engine.step(frame);
    const stem = engine.snakes.find(s => Math.abs(s.x[0] - s.x.at(-1)!) < 5)!;
    const top = stem.y[0] < stem.y.at(-1)! ? stem.capStart : stem.capEnd;
    expect(top).not.toBeNull();
    expect(Math.abs(top![1] - 50)).toBeLessThan(1.5);
  });
});
