import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';

// Conversions to and from OKLab, for boosting chroma.
const oklab = /* glsl */ `
vec3 linearToOklab(vec3 c) {
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * pow(max(lms, 0.0), vec3(1.0 / 3.0));
}
vec3 oklabToLinear(vec3 c) {
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * (lms * lms * lms);
}
bool inGamut(vec3 c) {
  return all(greaterThanEqual(c, vec3(-1e-4))) && all(lessThanEqual(c, vec3(1.0001)));
}
// More chroma at the same lightness and hue, as much as fits in sRGB, so the
// textures' muted paint reads as colour once it's lit. Greys stay grey.
vec3 boostChroma(vec3 color, float amount) {
  vec3 lab = linearToOklab(color);
  float chroma = length(lab.yz);
  if (chroma < 1e-4) return color;
  vec2 direction = lab.yz / chroma;
  float low = chroma;
  float high = chroma * amount;
  if (inGamut(oklabToLinear(vec3(lab.x, high * direction)))) low = high;
  else for (int i = 0; i < 10; i++) {
    float mid = (low + high) * 0.5;
    if (inGamut(oklabToLinear(vec3(lab.x, mid * direction)))) low = mid;
    else high = mid;
  }
  return clamp(oklabToLinear(vec3(lab.x, low * direction)), 0.0, 1.0);
}
`;

// How bright the inside is.
const inside = '0.08';
// How much more saturated than the textures (see boostChroma).
const saturation = '1.5';

// A copy of a head's material that draws both sides, with the inside dark,
// so the open bottoms of helmets read as hollow rather than as holes.
export function headMaterial(material) {
  // A physical material with the standard one's settings and textures, so it
  // can have a clearcoat: a matte painted base that takes the ambient and key
  // light, under a glossy layer that gives crisp reflections.
  const copy = new MeshPhysicalMaterial();
  MeshStandardMaterial.prototype.copy.call(copy, material);
  copy.defines = { STANDARD: '', PHYSICAL: '' };
  copy.side = DoubleSide;
  copy.metalness = 0;
  copy.roughness = 0.5;
  copy.clearcoat = 1;
  copy.clearcoatRoughness = 0.1;
  copy.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${oklab}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n\tdiffuseColor.rgb = boostChroma(diffuseColor.rgb, ${saturation});`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n\tif (!gl_FrontFacing) gl_FragColor.rgb *= ${inside};`);
  };
  // One program for all of them.
  copy.customProgramCacheKey = () => 'head';
  return copy;
}
