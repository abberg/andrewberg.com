import * as THREE from "three";

// The resin a kitbash is cast in, like the bootleg Masters of the Universe
// clear figures: one candy colour, paler where the resin is thin and deeper
// where it's thick. It's physical transmission, so it's see-through and
// refracts what's behind it, with thin parts glowing where a light shines
// through from behind: the "fast translucency" term from three's
// SubsurfaceScatteringShader, added on top. Both read the per-vertex thickness
// the kitbash measures (the resinThickness attribute) instead of one number
// for the whole figure.
//
// The palette is the figures'.
export const colours = { orange: 0xff8a1c, red: 0xff2e72, green: 0x2fc23a, teal: 0x2f9ad0 };

// How far into the resin light still gets through, in scene units (the figure
// is scaled to a radius of 1). Thin parts are well under this; chests are over.
const reach = 0.08;

// Pass the thickness on, both as measured and in scene units, along with the
// ambient occlusion baked into each vertex (resinOcclusion: 1 open, 0 buried).
function withThickness(vertexShader) {
  return vertexShader
    .replace(
      "#include <common>",
      `#include <common>
attribute float resinThickness;
attribute float resinOcclusion;
varying float vResinThickness;
varying float vResinDepth;
varying float vResinOcclusion;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vResinThickness = resinThickness;
vResinDepth = resinThickness * length( modelMatrix[ 0 ].xyz );
vResinOcclusion = resinOcclusion;`,
    );
}
const thicknessVaryings = "varying float vResinThickness;\nvarying float vResinDepth;\nvarying float vResinOcclusion;\n";

// three's own ambient occlusion step, fed from the baked vertex value rather
// than an AO texture. Through clear resin it also dims the light that comes
// through in the crevices.
const occlusion = THREE.ShaderChunk.aomap_fragment
  .replace("#ifdef USE_AOMAP", "#if 1")
  .replace("( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0", "vResinOcclusion");
function withOcclusion(fragmentShader) {
  return fragmentShader
    .replace("#include <aomap_fragment>", occlusion)
    .replace("#include <transmission_fragment>", "#include <transmission_fragment>\n\ttotalDiffuse *= mix( 1.0, ambientOcclusion, 0.75 );");
}
// 1 where the resin is thin, falling towards 0 where it's thick.
const lightThrough = `exp( - vResinDepth / ${reach.toFixed(3)} )`;

const white = new THREE.Color(0xffffff);

function resinShader(shader) {
  shader.uniforms.glowColour = this.userData.glowColour;
  shader.vertexShader = withThickness(shader.vertexShader);
  shader.fragmentShader = withOcclusion(shader.fragmentShader)
    .replace("#include <common>", `#include <common>\n${thicknessVaryings}`)
    // Transmission through as much resin as each vertex measured.
    .replace("material.thickness = thickness;", "material.thickness = thickness * vResinThickness;")
    // The glow. Added as specular light, because full transmission replaces
    // the diffuse light the scattering shader would otherwise add it to.
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
}

const made = new Map();

// The resin in a named colour, made once and shared by every figure cast in
// it. The surface tint is pale and the colour builds up with depth.
export function resin(colour) {
  if (!made.has(colour)) {
    const hex = colours[colour];
    const material = new THREE.MeshPhysicalMaterial({
      roughness: 0.08,
      transmission: 1,
      thickness: 1,
      ior: 1.5,
      attenuationDistance: 0.28,
      clearcoat: 0.5,
      clearcoatRoughness: 0.05,
      specularIntensity: 1,
    });
    material.color.setHex(hex).lerp(white, 0.5);
    material.attenuationColor.setHex(hex).lerp(white, 0.3);
    material.userData.glowColour = { value: new THREE.Color(hex) };
    material.onBeforeCompile = resinShader;
    made.set(colour, material);
  }
  return made.get(colour);
}
