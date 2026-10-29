import * as THREE from 'three/webgpu';
import { Fn, acos, clamp, degrees, float, ivec2, max, rtt, screenCoordinate, select, smoothstep, uniform, vec2, vec4 } from 'three/tsl';
import type { GBuffer } from '../render/gbuffer';
import type { PartDetail } from './parts';

// Lines the shading and depth can miss (section 2.1 of the 2019 tutorial):
// creases, where the surface normal turns sharply, and part boundaries, where
// two rigid parts of the model meet. Each pixel takes the strongest boundary
// to its four neighbours a CSS pixel away, which makes a ridge about two CSS
// pixels wide centred on the boundary, and the line filter picks that up like
// any other line. Worked out on the full-size G-buffer, so it's supersampled
// like the rest. Creases inside parts too busy to show them (parts.ts) are
// left out; their boundaries stay. The second channel carries that busyness
// on for the filter, which flattens the shading there.
export const creaseParams = {
  // Normal turn (degrees) at which a crease counts fully; it fades in over
  // the 20 degrees below.
  angle: uniform(40),
  // How strongly creases and part boundaries register in the filter's input.
  creaseWeight: uniform(0.3),
  partWeight: uniform(0.3),
};

export function createCreases(gbuffer: GBuffer, parts: PartDetail, pixelRatio: number) {
  const { angle, creaseWeight, partWeight } = creaseParams;
  const last = uniform(new THREE.Vector2());
  const lines = rtt(Fn(() => {
    const here = ivec2(screenCoordinate.xy);
    const normal = gbuffer.normalAt(here);
    const part = gbuffer.partAt(here);
    const busy = parts.busyAt(here);
    const strongest = float(0).toVar();
    const step = gbuffer.supersample;
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      // Clamped at the edges, where a pixel is its own neighbour and finds nothing.
      const there = ivec2(clamp(screenCoordinate.xy.add(vec2(dx, dy)), vec2(0), last));
      const otherNormal = gbuffer.normalAt(there);
      const otherPart = gbuffer.partAt(there);
      // Off the model, the silhouette is the depth term's job.
      const both = part.greaterThan(0.5).and(otherPart.greaterThan(0.5));
      const turn = degrees(acos(clamp(normal.dot(otherNormal), -1, 1)));
      const crease = smoothstep(angle.sub(20), angle, turn).mul(creaseWeight).mul(float(1).sub(busy));
      const seam = select(part.sub(otherPart).abs().greaterThan(0.5), partWeight, float(0));
      strongest.assign(max(strongest, select(both, max(crease, seam), float(0))));
    }
    return vec4(strongest, busy, 0, 1);
  })(), null, null, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
    .setResolutionScale(gbuffer.supersample / pixelRatio);

  return {
    lines,
    update() { last.value.set(gbuffer.width * gbuffer.supersample - 0.5, gbuffer.height * gbuffer.supersample - 0.5); },
  };
}

export type Creases = ReturnType<typeof createCreases>;
