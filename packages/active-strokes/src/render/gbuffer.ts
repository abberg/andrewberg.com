import * as THREE from 'three/webgpu';
import {
  abs, attribute, float, ivec2, min, mrt, normalView, normalize, output, pass, perspectiveDepthToViewZ, reference, select, sign, texture,
  textureLoad, uniform, varying, vec2, vec3, vec4, velocity, viewZToOrthographicDepth,
} from 'three/tsl';

// The scene as the line extractor sees it: plain grey shading without the
// model's textures (their rivets and panel lines would flood the filter with
// tiny samples), depth, screen-space velocity, and the texture's small
// details (rivets, seams; see scripts/extract-model.mjs) as ink amount, the
// view-space normal for creases, and a part id for where separate parts meet.
// The paper's thresholds are all in screen pixels, so everything downstream
// works at CSS-pixel size, but the G-buffer itself is rendered at supersample
// times that and averaged down as it's read. Without that, detail finer than a
// pixel (the head has nearly 700 triangles in about 50 px square) renders as
// broken dashes that change every frame, and the line filter turns them into
// a new tangle of lines each time. Averaged, it reads as steady grey.

// WebGPU only promises 32 bytes of colour attachments per pixel, four
// half-float targets, so the normal is folded into two channels (octahedral
// encoding) and shares a target with the detail amount and part id.
const encodeNormal = (n: THREE.Node<'vec3'>) => {
  const p = n.xy.div(abs(n.x).add(abs(n.y)).add(abs(n.z)));
  return select(n.z.lessThan(0), float(1).sub(abs(p.yx)).mul(sign(p)), p);
};
const decodeNormal = (p: THREE.Node<'vec2'>) => {
  const z = float(1).sub(abs(p.x)).sub(abs(p.y));
  const xy = select(z.lessThan(0), float(1).sub(abs(p.yx)).mul(sign(p)), p);
  return normalize(vec3(xy, z));
};

export function createGBuffer(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, detailMap: THREE.Texture, supersample = 2) {
  const material = new THREE.MeshStandardNodeMaterial({ color: 0xbbbbbb, roughness: 0.9 });
  const scenePass = pass(scene, camera, { samples: 0 });
  // Asking for velocity is what makes three keep last frame's bone matrices,
  // so skinned vertices get their true motion, not just the object's.
  // Every vertex of the Behemoth is bound to a single bone, so the bone is the
  // rigid part it belongs to. Stored plus one so the background (0) is no part,
  // and flat so a triangle spanning two bones doesn't blend between them.
  const part = varying(float(attribute('skinIndex', 'uvec4').x).add(1)).setInterpolation('flat');
  scenePass.setMRT(mrt({ output, velocity, surface: vec4(encodeNormal(normalView), texture(detailMap).r, part) }));
  scenePass.setResolutionScale(supersample / renderer.getPixelRatio());
  const velocityTexture = scenePass.getTexture('velocity');
  velocityTexture.type = THREE.HalfFloatType;
  scenePass.getTexture('surface').type = THREE.HalfFloatType;
  const surface = scenePass.getTextureNode('surface');
  const depthTexture = scenePass.getTextureNode('depth');
  // Read from this camera, not cameraNear/cameraFar: passes that sample the
  // G-buffer later run with their own full-screen camera.
  const near = reference('near', 'float', camera);
  const far = reference('far', 'float', camera);
  const viewZAt = (texel: THREE.Node<'ivec2'>) => perspectiveDepthToViewZ(textureLoad(depthTexture.value, texel).x, near, far);
  // The supersample x supersample texels under a CSS pixel.
  const texels = (pixel: THREE.Node<'ivec2'>) => {
    const out: THREE.Node<'ivec2'>[] = [];
    for (let y = 0; y < supersample; y++) for (let x = 0; x < supersample; x++) out.push(pixel.mul(supersample).add(ivec2(x, y)));
    return out;
  };
  // The CSS-pixel size, kept current for shaders.
  const cssSize = uniform(new THREE.Vector2()).onRenderUpdate((_, self) => {
    self.value.set(scenePass.renderTarget.width / supersample, scenePass.renderTarget.height / supersample);
  });
  const average = (values: THREE.Node<'float'>[]) => values.reduce((a, b) => a.add(b)).div(values.length);
  const average2 = (values: THREE.Node<'vec2'>[]) => values.reduce((a, b) => a.add(b)).div(values.length);

  // Swap the flat material in only for this pass.
  const updateBefore = scenePass.updateBefore.bind(scenePass);
  scenePass.updateBefore = frame => {
    const previous = scene.overrideMaterial;
    scene.overrideMaterial = material;
    updateBefore(frame);
    scene.overrideMaterial = previous;
  };

  return {
    pass: scenePass,
    supersample,
    // Sampled bilinearly at a CSS pixel's centre, these average the texels
    // under it.
    shading: scenePass.getTextureNode('output'),
    // Velocity in NDC per frame; NDC spans 2 units across the target.
    velocity: scenePass.getTextureNode('velocity'),
    // Ink amount from the texture's details, 0 for none.
    detail: surface.z,
    // Velocity at an integer CSS pixel, averaged, for compute shaders.
    velocityAt: (pixel: THREE.Node<'ivec2'>) => average2(texels(pixel).map(t => textureLoad(scenePass.getTexture('velocity'), t).xy)),
    // View-space unit normal at an integer texel of the full-size G-buffer
    // (meaningless off the model).
    normalAt: (texel: THREE.Node<'ivec2'>) => decodeNormal(textureLoad(surface.value, texel).xy),
    // Bone index plus one at an integer texel of the full-size G-buffer, 0 off
    // the model. (The background clears to 1, so it's told by its depth.)
    partAt: (texel: THREE.Node<'ivec2'>) => select(textureLoad(depthTexture.value, texel).x.lessThan(1), textureLoad(surface.value, texel).w, float(0)),
    depth: scenePass.getLinearDepthNode(),
    // Linear depth, 0 at the near plane and 1 at the far plane, at a CSS
    // pixel's centre uv, averaged over its texels. (Depth can't be filtered.)
    depthAt: (uv: THREE.Node<'vec2'>) => {
      const pixel = ivec2(uv.mul(cssSize));
      return average(texels(pixel).map(t => viewZToOrthographicDepth(viewZAt(t), near, far)));
    },
    // Distance in front of the camera (world units) at an integer CSS pixel:
    // the nearest of its texels, for compute shaders, which can't sample.
    distanceAt: (pixel: THREE.Node<'ivec2'>) => texels(pixel).map(t => viewZAt(t).negate()).reduce((a, b) => min(a, b)),
    // CSS-pixel size, which everything downstream works at.
    get width() { return Math.round(scenePass.renderTarget.width / supersample); },
    get height() { return Math.round(scenePass.renderTarget.height / supersample); },
  };
}

export type GBuffer = ReturnType<typeof createGBuffer>;
