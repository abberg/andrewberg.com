import * as THREE from 'three';

// Drifts of colour across a lawn: yellower in some broad drifts, bluer in
// others, darker in small patches. One pattern over the ground, painted on
// the ground itself and on the grass growing from it, each tuft taking the
// colour of the spot it grows from, so the grass and the ground under it
// are always the same and the drifts aren't laid on over the top.

// A smooth field over the ground, about -1 to 1: a few long waves crossing
// at their own angles. Each wave as [x frequency, z frequency, phase, weight].
function waves(seed: number, scale: number) {
  let s = seed * 7919 + 5;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const list = Array.from({ length: 4 }, (_, k) => {
    const a = random() * Math.PI * 2, f = (0.7 + random() * 0.6) * 2 ** (k * 0.7) / scale;
    return [Math.cos(a) * f, Math.sin(a) * f, random() * Math.PI * 2, 1 / 2 ** (k * 0.8)];
  });
  const total = list.reduce((sum, w) => sum + w[3], 0);
  return list.map(([fx, fz, p, amp]) => new THREE.Vector4(fx, fz, p, amp / total * 1.6));
}

// A lawn's drifts: the three fields' seeds and sizes (m), and how each tints
// the green: the warm drifts' and the cool drifts' change to each channel,
// and how much the dark patches take off.
// The grass lightens from its root, the ground's colour, to its tips: top is
// how much lighter the tips are.
export type Drift = { seed: number, sizes: [number, number, number], warm: [number, number, number], cool: [number, number, number], dark: number, top: number };
// One set of tints for all the grass; each lawn keeps its own pattern.
const TINTS = { warm: [0.4, 0.15, -0.45], cool: [-0.2, 0.02, 0.35], dark: 0.21, top: 0.3 } satisfies Omit<Drift, 'seed' | 'sizes'>;
export const DRIFTS = {
  lawn: { seed: 61, sizes: [15.4, 11, 6.2], ...TINTS },
  meadow: { seed: 51, sizes: [13.2, 8.8, 5.5], ...TINTS },
} satisfies Record<string, Drift>;

// Makes a material take a lawn's drifts: where it is, for the ground; where
// each instance stands, for the grass, so a tuft's root is the colour of
// the ground it grows from, lightening up to its tips.
// Chained after whatever it already does to its shaders.
export function drifting<M extends THREE.Material>(material: M, drift: Drift) {
  const fields = drift.sizes.flatMap((size, k) => waves(drift.seed + k, size));
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      uDriftWaves: { value: fields },
      uDriftWarm: { value: new THREE.Vector3(...drift.warm) },
      uDriftCool: { value: new THREE.Vector3(...drift.cool) },
      uDriftDark: { value: drift.dark },
      uDriftTop: { value: drift.top },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDriftAt;\nvarying float vDriftUp;')
      .replace('#include <fog_vertex>', /* glsl */`#include <fog_vertex>
        #ifdef USE_INSTANCING
          vDriftAt = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          // A tuft stands a unit tall in its own space (foliage.ts).
          vDriftUp = clamp(transformed.y, 0.0, 1.0);
        #else
          vDriftUp = 0.0;
          vDriftAt = (modelMatrix * vec4(transformed, 1.0)).xz;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec2 vDriftAt;
        varying float vDriftUp;
        uniform vec4 uDriftWaves[12];
        uniform vec3 uDriftWarm, uDriftCool;
        uniform float uDriftDark, uDriftTop;
        float driftField(int from) {
          float sum = 0.0;
          for (int k = 0; k < 4; k++) {
            vec4 w = uDriftWaves[from + k];
            sum += sin(vDriftAt.x * w.x + vDriftAt.y * w.y + w.z) * w.w;
          }
          return sum;
        }`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float warm = max(0.0, driftField(0)), cool = max(0.0, driftField(4)), dark = max(0.0, driftField(8) - 0.2);
          diffuseColor.rgb *= (1.0 + uDriftWarm * warm + uDriftCool * cool) * (1.0 - uDriftDark * dark) * (1.0 + uDriftTop * vDriftUp);
        }`);
  };
  // Shared programs are told apart by this.
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => key() + 'drift' + drift.seed;
  return material;
}
