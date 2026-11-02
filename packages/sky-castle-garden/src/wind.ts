import * as THREE from 'three';

// Step 8's breeze: one wind for the whole garden, blowing from the north-west
// like the light, in slow gusts that roll across the level, so grass, shrubs
// and trees lean and rock together where a gust passes and settle behind it,
// with a quicker flutter on top. Done in the vertex shader, nothing on the CPU.

export const wind = {
  // How hard it blows, 0 still, and how far (in metres) a full-height
  // weight moves at the height of a gust.
  strength: 1,
  // Blowing towards the south-east.
  from: -60,
};
const uniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2() },
  uStrength: { value: wind.strength },
};

export function updateWind(seconds: number) {
  const from = THREE.MathUtils.degToRad(wind.from);
  uniforms.uTime.value = seconds;
  uniforms.uWind.value.set(-Math.sin(from), Math.cos(from));
  uniforms.uStrength.value = wind.strength;
}

// How each kind of plant moves: weight is a GLSL expression for how far a
// vertex goes, in metres, from transformed (the vertex in the plant's own
// space) and height (the instance's height scale); flutter is how much of
// that is quick shiver rather than lean.
export type Sway = { weight: string, flutter: number };
export const SWAY = {
  // Grass bends from the root, tall tufts more.
  grass: { weight: '0.35 * transformed.y * transformed.y * height', flutter: 0.3 },
  // Shrubs, hedges and crowns rock as a mass, their tops more.
  shrub: { weight: '0.05 * (0.4 + transformed.y) * height', flutter: 0.6 },
  crown: { weight: '0.04 * height', flutter: 0.7 },
  // A cypress whips from its foot, the tip most.
  cypress: { weight: '0.012 * pow(transformed.y, 1.6) * height', flutter: 0.4 },
  // Ivy flat on stone only shivers.
  ivy: { weight: '0.05', flutter: 1 },
} satisfies Record<string, Sway>;

const chunk = /* glsl */`
  uniform float uTime, uStrength;
  uniform vec2 uWind;
  // How far a point at p (in the garden) is blown, for a weight.
  vec3 windSway(vec3 p, float weight, float flutter) {
    float along = dot(p.xz, uWind);
    // Gusts, broad and slow, rolling downwind.
    float gust = 0.5 + 0.5 * sin(along * 0.06 - uTime * 0.7) * sin(along * 0.023 + p.x * 0.017 - uTime * 0.31);
    // Rocking on the gust, mostly downwind.
    float rock = 0.55 + 0.45 * sin(uTime * 1.6 - along * 0.3 + p.y * 0.15);
    float shiver = sin(uTime * 5.3 + dot(p, vec3(2.7, 1.9, 3.3))) * 0.5 + sin(uTime * 8.1 + dot(p, vec3(-1.3, 2.9, 0.7))) * 0.5;
    vec3 down = vec3(uWind.x, 0.0, uWind.y);
    vec3 side = vec3(-uWind.y, 0.0, uWind.x);
    return (down * rock * gust * (1.0 - flutter) + (down * 0.5 + side + vec3(0.0, 0.4, 0.0)) * shiver * (0.3 + gust) * flutter * 0.5) * weight * uStrength;
  }`;

// Makes a material's plants sway. Chained after whatever it already does to
// its shaders, so it works with the painted look and the facing leaf cards.
export function swaying<M extends THREE.Material>(material: M, sway: Sway) {
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex)
      .replace('#include <common>', `#include <common>\n${chunk}`)
      .replace('mvPosition = modelViewMatrix * mvPosition;', /* glsl */`{
        float height = 1.0;
        #ifdef USE_INSTANCING
          height = length(instanceMatrix[1].xyz);
        #endif
        mvPosition.xyz += windSway((modelMatrix * mvPosition).xyz, ${sway.weight}, ${sway.flutter.toFixed(2)});
      }
      mvPosition = modelViewMatrix * mvPosition;`);
  };
  // Shared programs are told apart by this.
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => key() + sway.weight + sway.flutter;
  return material;
}
