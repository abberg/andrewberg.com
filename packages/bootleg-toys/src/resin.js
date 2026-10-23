import * as THREE from "three";
import { SubsurfaceScatteringShader } from "three/addons/shaders/SubsurfaceScatteringShader.js";

// The materials a kitbash is cast in, like the bootleg Masters of the
// Universe clear figures: one candy colour, paler where the resin is thin and
// deeper where it's thick. Every finish reads the per-vertex thickness the
// kitbash measures (the resinThickness attribute) instead of one number for
// the whole figure.
//
//   clear   physical transmission: see-through, refracting what's behind it
//   gummy   three's SubsurfaceScatteringShader: milky, lit from within where
//           a light shines through from behind
//   hybrid  the clear resin with gummy's glow added on top
//
// The palette is the figures'.
export const colours = { orange: 0xff8a1c, red: 0xff3a1a, green: 0x2fc23a, lime: 0x7ce05a, teal: 0x2a7fa8 };
export const finishes = ["clear", "gummy", "hybrid"];

// How far into the resin light still gets through, in scene units (the figure
// is scaled to a radius of 1). Thin parts are well under this; chests are over.
const reach = 0.08;

// Pass the thickness on, both as measured and in scene units.
function withThickness(vertexShader) {
  return vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float resinThickness;\nvarying float vResinThickness;\nvarying float vResinDepth;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvResinThickness = resinThickness;\nvResinDepth = resinThickness * length( modelMatrix[ 0 ].xyz );",
    );
}
const thicknessVaryings = "varying float vResinThickness;\nvarying float vResinDepth;\n";
// 1 where the resin is thin, falling towards 0 where it's thick.
const lightThrough = `exp( - vResinDepth / ${reach.toFixed(3)} )`;

// Clear: physical transmission, with its thickness taken from each vertex.
const clear = new THREE.MeshPhysicalMaterial({
  roughness: 0.08,
  transmission: 1,
  thickness: 1,
  ior: 1.5,
  attenuationDistance: 0.28,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  specularIntensity: 1,
});
clear.onBeforeCompile = (shader) => {
  shader.vertexShader = withThickness(shader.vertexShader);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${thicknessVaryings}`)
    .replace("material.thickness = thickness;", "material.thickness = thickness * vResinThickness;");
};

// Gummy: three's subsurface scattering shader as it comes, except that how
// much light gets through is worked out from the thickness rather than read
// from a texture (the kitbash's parts don't share a UV layout to paint one in).
const gummy = new THREE.ShaderMaterial({
  name: "GummyResin",
  uniforms: THREE.UniformsUtils.clone(SubsurfaceScatteringShader.uniforms),
  vertexShader: withThickness(SubsurfaceScatteringShader.vertexShader),
  fragmentShader: SubsurfaceScatteringShader.fragmentShader
    .replace("uniform sampler2D thicknessMap;", `uniform sampler2D thicknessMap;\n${thicknessVaryings}`)
    .replace("texture2D(thicknessMap, uv).r", lightThrough),
  lights: true,
});
Object.assign(gummy.uniforms, {
  shininess: { value: 120 },
  thicknessDistortion: { value: 0.25 },
  thicknessAmbient: { value: 0.03 },
  thicknessAttenuation: { value: 0.5 },
  thicknessPower: { value: 2.5 },
  thicknessScale: { value: 3 },
});
gummy.uniforms.specular.value.set(0x808080);

// Hybrid: the clear resin plus the gummy glow. The same scattering term as
// the shader above, but added as specular light, because full transmission
// replaces the diffuse light the shader would otherwise add it to.
const hybrid = clear.clone();
const glowColour = { value: new THREE.Color() };
hybrid.onBeforeCompile = (shader) => {
  clear.onBeforeCompile(shader);
  shader.uniforms.glowColour = glowColour;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <lights_physical_pars_fragment>",
      `#include <lights_physical_pars_fragment>
uniform vec3 glowColour;
void resinGlow( const in IncidentLight directLight, const in vec3 geometryNormal, const in vec3 geometryViewDir, inout ReflectedLight reflectedLight ) {
	vec3 scatteringHalf = normalize( directLight.direction + geometryNormal * 0.25 );
	float scatteringDot = pow( saturate( dot( geometryViewDir, - scatteringHalf ) ), 2.5 ) * 5.0;
	reflectedLight.directSpecular += scatteringDot * ${lightThrough} * glowColour * directLight.color * 0.25;
}`,
    )
    .replace(
      "#include <lights_fragment_begin>",
      THREE.ShaderChunk.lights_fragment_begin.replaceAll(
        "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
        "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t\tresinGlow( directLight, geometryNormal, geometryViewDir, reflectedLight );",
      ),
    );
};

export const materials = { clear, gummy, hybrid };

const white = new THREE.Color(0xffffff);

// Tint every finish. The clear surface is pale and the colour builds up with
// depth; gummy is coloured through, glowing a lighter shade of it.
export function setColour(hex) {
  for (const material of [clear, hybrid]) {
    material.color.setHex(hex).lerp(white, 0.45);
    material.attenuationColor.setHex(hex).lerp(white, 0.1);
  }
  gummy.uniforms.diffuse.value.setHex(hex).multiplyScalar(0.35);
  gummy.uniforms.thicknessColor.value.setHex(hex).lerp(white, 0.1);
  glowColour.value.setHex(hex);
}
