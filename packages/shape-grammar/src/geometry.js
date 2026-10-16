// 2D affine transforms as [a, b, c, d, e, f], the same order as SVG's
// matrix(): x' = a·x + c·y + e, y' = b·x + d·y + f.

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

const DEG_TO_RAD = Math.PI / 180;

export function translate(x, y = 0) {
  return [1, 0, 0, 1, x, y];
}

// Degrees, clockwise on screen (y points down).
export function rotate(degrees) {
  const r = degrees * DEG_TO_RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

export function scale(x, y = x) {
  return [x, 0, 0, y, 0, 0];
}

// Mirror across the y axis.
export const MIRROR = Object.freeze([-1, 0, 0, 1, 0, 0]);

// multiply(m, n) applies n first, then m.
export function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

// compose(a, b, c) reads left to right as nested frames: move into a, then b
// inside it, then c inside that. It equals multiply(multiply(a, b), c).
export function compose(...transforms) {
  return transforms.reduce(multiply, IDENTITY);
}

export function apply(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// How much a transform scales lengths (the square root of its area scale).
export function scaleOf(m) {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
}

// Geometry: a polygon or polyline in the shape's own frame, plus a marker
// point that shows the shape's orientation when it carries a label.

export function polygon(points, marker) {
  return { points, closed: true, marker: marker ?? centroid(points) };
}

export function polyline(points, marker) {
  return { points, closed: false, marker: marker ?? points[0] };
}

// A w × h rectangle centred on the origin, with its marker in the top left
// corner so a quarter turn is visible.
export function rect(w = 1, h = w) {
  const x = w / 2;
  const y = h / 2;
  const geometry = polygon(
    [[-x, -y], [x, -y], [x, y], [-x, y]],
    [-x + Math.min(w, h) * 0.18, -y + Math.min(w, h) * 0.18],
  );
  return { ...geometry, w, h };
}

export const square = (side = 1) => rect(side, side);

// An equilateral triangle with its centroid on the origin, pointing up.
export function triangle(side = 1) {
  const h = (side * Math.sqrt(3)) / 2;
  return polygon(
    [[0, (-2 * h) / 3], [side / 2, h / 3], [-side / 2, h / 3]],
    [0, (-2 * h) / 3 + h * 0.3],
  );
}

function centroid(points) {
  let x = 0;
  let y = 0;
  for (const [px, py] of points) {
    x += px;
    y += py;
  }
  return [x / points.length, y / points.length];
}
