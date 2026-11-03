import * as THREE from 'three';

// Step 6 of the plan: the light, the sky and the fog, and the palette laid on
// the greybox. The painted look comes from flat, hand-picked colour: each
// surface has a lit colour and a shade colour, and the sun picks between them
// in a few soft bands instead of shading it darker. Shade leans blue-green, or
// lavender on the stone, never grey.

// The plan's palette (docs/design-plan.md), as [lit, shade].
export const palette = {
  stone: [0xeee6d4, 0x9497c4],
  // The garden's tan sandstone, as in the references' bridge and tower: the
  // platform, causeway and stairs, and darker in the terrace's masonry under
  // the lawn and the cliff below it.
  sandstone: [0xdcc08a, 0x8f86a8],
  masonry: [0xd0b07a, 0x847a9f],
  lawn: [0x8dbf4a, 0x4f7f3a],
  // Moss and ivy on the stonework.
  moss: [0xb4d66a, 0x5f9468],
  ivy: [0x98c85c, 0x4f8664],
  // The shadowed depths under them.
  mossDepth: [0x86b052, 0x507e5c],
  ivyDepth: [0x76a44a, 0x466e54],
  path: [0xe0c99a, 0x9c93b2],
  rust: [0xb47a45, 0x7a5a78],
  water: [0x5aa3a6, 0x3a7488],
  // The moats' canals, darker.
  canal: [0x2f6f7a, 0x22506a],
  door: [0x2a2622, 0x1c1d2a],
} as const;
export const SKY = 0xa9d2e8;

// Shared by every painted material, and tuned from the panel.
export const look = {
  // How much of the light the middle band is, and where it sits: shade below
  // the first edge, full light past the second.
  mid: 0.55,
  // The sky fill on top of the bands, and the rim on the sunny side.
  fill: 0.25,
  rim: 0.25,
  // Fog below the garden: clear down to y = 0, gone by this far down.
  depth: 25,
  // Under the moats' water: how far down until things are lost in its
  // colour, and how much of it they take at most.
  drown: 13,
  murk: 0.85,
};
// The colour the drowned city sinks into.
export const DEEP = 0x1f5a62;
const uniforms = {
  uSun: { value: new THREE.Color() },
  uWarm: { value: new THREE.Color() },
  uMid: { value: look.mid },
  uFill: { value: look.fill },
  uRim: { value: look.rim },
  uDepth: { value: look.depth },
  uDrown: { value: look.drown },
  uMurk: { value: look.murk },
  uDeep: { value: new THREE.Color(DEEP) },
};
// The robot's ink shadow, falling on whatever it lies across (robot.ts sets
// these each frame): on or off, the depth of the robot seen from its own
// light, how to find a point in that view, how far to slide the shadow, and
// its colour. Everything painted takes it but the robot itself.
export const inkUniforms = {
  uInkOn: { value: 0 },
  uInkDepth: { value: null as THREE.Texture | null },
  uInkMatrix: { value: new THREE.Matrix4() },
  uInkShift: { value: new THREE.Vector3() },
  uInk: { value: new THREE.Color() },
};

// Shade picked from lit by multiplying, per channel, so materials with a map
// (the robot's) keep it in both.
const ratio = (lit: number, shade: number) => {
  const a = new THREE.Color(lit), b = new THREE.Color(shade);
  return new THREE.Vector3(b.r / a.r, b.g / a.g, b.b / a.b);
};
// For anything without a shade of its own: towards blue-green.
const COOL = ratio(0xd8c8a0, 0x7f9aa8);

// Turns a standard material into a painted one. Shade defaults to cooling
// whatever colour the material already has.
// A map given with a tile size (in metres) is laid on by the model's own
// position from three sides and blended by its normal, so boxes and slabs
// need no UVs and the blocks stay the same size everywhere.
export function paint(material: THREE.MeshStandardMaterial, shade?: number, tile?: number) {
  const shadeRatio = shade === undefined ? COOL : ratio(material.color.getHex(), shade);
  // Masonry is painted darker than it is so its highlights can be brighter.
  if (material.map?.userData.gain) material.color.multiplyScalar(material.map.userData.gain);
  if (tile) material.defines = { TRIPLANAR: '' };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, inkUniforms, { uShade: { value: shadeRatio }, uTile: { value: tile ?? 1 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vInkAt;\nvarying float vHeight;\nvarying vec3 vModel, vModelNormal;\n#ifdef MERGED\nattribute vec3 modelPosition, modelNormal;\n#endif')
      .replace('#include <fog_vertex>', /* glsl */`#include <fog_vertex>
        vInkAt = (inverse(viewMatrix) * mvPosition).xyz;
        vec4 placed = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          placed = instanceMatrix * placed;
        #endif
        vHeight = (modelMatrix * placed).y;
        vModel = transformed;
        vModelNormal = objectNormal;
        // Merged into one mesh (merge.ts): where it was on its own model.
        #ifdef MERGED
          vModel = modelPosition;
          vModelNormal = modelNormal;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', /* glsl */`#include <fog_pars_fragment>
        uniform vec3 uSun, uWarm, uShade;
        uniform float uMid, uFill, uRim, uDepth, uTile, uDrown, uMurk;
        uniform vec3 uDeep;
        uniform float uInkOn;
        uniform sampler2D uInkDepth;
        uniform mat4 uInkMatrix;
        uniform vec3 uInkShift, uInk;
        varying vec3 vInkAt;
        varying float vHeight;
        varying vec3 vModel, vModelNormal;`)
      .replace('#include <map_fragment>', /* glsl */`#if defined(USE_MAP) && defined(TRIPLANAR)
          vec3 side = pow(abs(normalize(vModelNormal)), vec3(8.0));
          side /= side.x + side.y + side.z;
          vec3 at = vModel / uTile;
          diffuseColor *= texture2D(map, at.zy) * side.x + texture2D(map, at.xz) * side.y + texture2D(map, at.xy) * side.z;
        #else
          #include <map_fragment>
        #endif`)
      // How lit the surface is, 0 to 1, from what the sun gave it next to what
      // it would give a surface facing it square on, shadows included.
      .replace('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;', /* glsl */`
        const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
        float full = dot(diffuseColor.rgb * uSun * RECIPROCAL_PI, luma);
        float lit = full > 1e-5 ? clamp(dot(reflectedLight.directDiffuse, luma) / full, 0.0, 1.0) : 0.0;
        float band = smoothstep(0.0, 0.12, lit) * uMid + smoothstep(0.3, 0.45, lit) * (1.0 - uMid);
        // Cel shaded (the robot): just the two, cut hard, nothing between.
        // The turn from lit to shade comes from the surface's angle to the sun
        // alone, so the line is clean; shadows only switch it to shade where
        // they clearly fall, so the shadow map's speckle stays out of it.
        #if defined(CEL) && NUM_DIR_LIGHTS > 0
          float facing = dot(normal, directionalLights[0].direction);
          float shadowed = facing > 0.05 ? lit / facing : 1.0;
          band = smoothstep(0.3, 0.34, facing) * step(0.5, shadowed);
        #endif
        vec3 totalDiffuse = mix(diffuseColor.rgb * uShade, diffuseColor.rgb * uWarm, band);
        #ifndef CEL
          float rim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);
          totalDiffuse += diffuseColor.rgb * uWarm * rim * band * uRim;
          totalDiffuse += reflectedLight.indirectDiffuse * uFill;
        #endif`)
      // Distance fog, and fog rising from below so the cliff and the tower
      // melt into the sky.
      // Under the water, sinking into its colour instead.
      .replace('#include <fog_fragment>', /* glsl */`#ifndef CEL
          // In the robot's shadow: further from its light than the robot is.
          // Hard edged, in ink, then fogged like the robot's outline.
          if (uInkOn > 0.5) {
            vec4 inLight = uInkMatrix * vec4(vInkAt + uInkShift, 1.0);
            vec3 at = inLight.xyz / inLight.w * 0.5 + 0.5;
            if (all(greaterThan(at, vec3(0.0))) && all(lessThan(at, vec3(1.0))) && at.z > texture2D(uInkDepth, at.xy).r + 0.002) gl_FragColor.rgb = uInk;
          }
        #endif
        #ifdef DROWNED
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, uMurk * smoothstep(0.0, -uDrown, vHeight));
        #endif
        #ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #ifndef DROWNED
            fogFactor = max(fogFactor, smoothstep(0.0, -uDepth, vHeight));
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif`);
  };
  return material;
}

// The same, for what's under the moats' water.
export const drowned = <T extends THREE.Material>(material: T) => {
  material.defines = { ...material.defines, DROWNED: '' };
  return material;
};

// A painted material in one of the palette's pairs.
export const painted = ([lit, shade]: readonly [number, number], options: THREE.MeshStandardMaterialParameters = {}, tile?: number) =>
  paint(new THREE.MeshStandardMaterial({ color: lit, roughness: 1, metalness: 0, ...options }), shade, tile);

// The sky: a dome, deeper blue overhead, the fog's colour at the horizon and
// below it, where the garden drops away.
function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { horizon: { value: new THREE.Color(SKY) }, zenith: { value: new THREE.Color(0x5f9fd6) } },
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 horizon, zenith;
      varying vec3 vDirection;
      void main() {
        float up = max(normalize(vDirection).y, 0.0);
        gl_FragColor = vec4(mix(horizon, zenith, pow(up, 0.6)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

// What the sun's shadow has to cover: the whole level, from the platform to
// the top of the city, so shadows never pop in as the robot walks about.
const COVER = new THREE.Box3(new THREE.Vector3(-64, -10, -48), new THREE.Vector3(64, 90, 98));

export function createLook(scene: THREE.Scene) {
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 30, 350);
  const sky = createSky();
  scene.add(sky);

  const hemisphere = new THREE.HemisphereLight(0xcfe6f5, 0x4f7f3a, 1.4);
  // A warm sun, high in the north-west behind the usual view south to the
  // city, so the columns west of the main path throw shadows across it.
  const sun = new THREE.DirectionalLight(0xfff6e8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(hemisphere, sun, sun.target);
  const angles = { height: 50, from: -60 };

  // Points the sun from its angles and fits its shadow box round the level.
  const aim = () => {
    const height = THREE.MathUtils.degToRad(angles.height), from = THREE.MathUtils.degToRad(angles.from);
    const centre = COVER.getCenter(new THREE.Vector3());
    sun.target.position.copy(centre);
    sun.position.copy(centre).add(new THREE.Vector3(Math.sin(from) * Math.cos(height), Math.sin(height), -Math.cos(from) * Math.cos(height)).multiplyScalar(200));
    const camera = sun.shadow.camera;
    camera.position.copy(sun.position);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    const box = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      const corner = new THREE.Vector3(i & 1 ? COVER.max.x : COVER.min.x, i & 2 ? COVER.max.y : COVER.min.y, i & 4 ? COVER.max.z : COVER.min.z);
      box.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse));
    }
    Object.assign(camera, { left: box.min.x, right: box.max.x, bottom: box.min.y, top: box.max.y, near: -box.max.z - 1, far: -box.min.z + 1 });
    camera.updateProjectionMatrix();
  };
  aim();

  const update = (camera: THREE.Camera) => {
    sky.position.copy(camera.position);
    uniforms.uSun.value.copy(sun.color).multiplyScalar(sun.intensity);
    uniforms.uWarm.value.copy(sun.color);
    uniforms.uMid.value = look.mid;
    uniforms.uFill.value = look.fill;
    uniforms.uRim.value = look.rim;
    uniforms.uDepth.value = look.depth;
    uniforms.uDrown.value = look.drown;
    uniforms.uMurk.value = look.murk;
  };

  const tune = (gui: { addFolder(name: string): any }) => {
    const folder = gui.addFolder('light');
    folder.add(angles, 'height', 20, 85, 1).name('sun height (°)').onChange(aim);
    folder.add(angles, 'from', -180, 180, 1).name('sun from, east of north (°)').onChange(aim);
    folder.addColor(sun, 'color').name('sun');
    folder.add(look, 'mid', 0, 1, 0.05).name('middle band');
    folder.add(hemisphere, 'intensity', 0, 4, 0.1).name('sky fill');
    folder.add(look, 'fill', 0, 1, 0.05).name('fill in the bands');
    folder.add(look, 'rim', 0, 1, 0.05).name('rim');
    folder.add(scene.fog as THREE.Fog, 'near', 0, 300, 5).name('fog from (m)');
    folder.add(scene.fog as THREE.Fog, 'far', 100, 1000, 10).name('fog full (m)');
    folder.add(look, 'depth', 5, 120, 1).name('fog below (m)');
    folder.close();
  };

  return { sun, update, tune };
}
