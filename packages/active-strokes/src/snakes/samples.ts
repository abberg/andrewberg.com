// One frame of line samples, as read back from the GPU. Pixels, y-down.
export interface Samples {
  count: number;
  // x, y, tx, ty per sample; the tangent is unit length, its sign arbitrary.
  points: Float32Array;
  // vx, vy, strength, distance per sample; velocity is the motion over the
  // last frame, distance is from the camera in world units (0 if unknown).
  motion: Float32Array;
}

// Whether two distances from the camera belong to the same surface, within a
// fraction tolerance of the first. Unknown (NaN or 0) distances match anything.
export function sameDepth(a: number, b: number, tolerance: number) {
  return !(a > 0 && b > 0) || Math.abs(a - b) <= tolerance * a;
}
