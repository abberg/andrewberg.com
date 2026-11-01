// What all three outline styles share: how many lines to draw, how far they
// wander, how far they run past their ends, and how often they redraw. Each
// style has its own copy.
export type Sketch = ReturnType<typeof newSketch>;
export const newSketch = (start: Partial<{ lines: number; jitter: number; overshoot: number; boil: number }> = {}) => ({
  lines: 3,
  // How far each line wanders from the edge, in pixels.
  jitter: 12,
  // How far strokes run past their ends, in pixels (not the hull).
  overshoot: 16,
  // Redraws a second: the lines hold still between them, like animation on twos.
  boil: 0,
  ...start,
});

// The boil step, as a number to seed noise with.
export const boilSeed = (time: number, boil: number) => Math.floor(time * boil) * 7.31;

// Smooth value noise in [-1, 1], for the CPU (contours).
const hash = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const smooth = (t: number) => t * t * (3 - 2 * t);
export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), fx), x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), fx);
  const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), fx), x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) * 2 - 1;
}

// The same noise in GLSL, for the hull and screen-space edges.
export const noiseGLSL = /* glsl */ `
float sketchHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float sketchNoise(vec3 p) {
  vec3 i = floor(p), f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float x00 = mix(sketchHash(i), sketchHash(i + vec3(1, 0, 0)), f.x);
  float x10 = mix(sketchHash(i + vec3(0, 1, 0)), sketchHash(i + vec3(1, 1, 0)), f.x);
  float x01 = mix(sketchHash(i + vec3(0, 0, 1)), sketchHash(i + vec3(1, 0, 1)), f.x);
  float x11 = mix(sketchHash(i + vec3(0, 1, 1)), sketchHash(i + vec3(1, 1, 1)), f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z) * 2.0 - 1.0;
}
`;
