import * as THREE from 'three';
import { painted } from './look';

// Step 9: the water, painted rather than real, the way the films paint it:
// a see-through wash over the drowned city, a soft blurred reflection of the
// garden and the sky that grows stronger the flatter you look across it,
// and hard-edged rounded highlights that swell, shrink and drift over the
// surface. No waves. The deeper the stonework below, the more it sinks into
// the water's colour (look.ts, drowned()), so the wash itself stays even.

// The water's level for the reflection: the moats' sheet (the pools sit
// 15 cm higher, close enough).
const LEVEL = -0.1;
// The reflection is drawn at a quarter of the screen's size, then blurred.
const SHRINK = 4;

export const waterLook = {
  // How much it reflects looking straight down, and looking across it.
  down: 0.18, across: 0.8,
  // How soft the reflection is (a fraction of the screen).
  blur: 0.014,
  // How much of the surface the highlights cover (higher, fewer), how big
  // they are (m) and how fast they change.
  sparse: 0.62, size: 2.2, pace: 0.35,
};

const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
target.texture.generateMipmaps = false;
const uniforms = {
  uReflection: { value: target.texture },
  uReflectMatrix: { value: new THREE.Matrix4() },
  uTime: { value: 0 },
  // How much it reflects down and across, and how soft.
  uMirror: { value: new THREE.Vector3() },
  // The highlights: size, pace, sparseness.
  uShape: { value: new THREE.Vector3() },
  uHighlight: { value: new THREE.Color(0xf4fbf8) },
};
const materials: THREE.Material[] = [];

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT).
const noise = /* glsl */`
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    vec3 i = floor(v + dot(v, C.yyy)), x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz), l = 1.0 - g, i1 = min(g.xyz, l.zxy), i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx, x2 = x0 - i2 + 2.0 * C.xxx, x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    vec3 ns = 0.142857142857 * vec3(2.0, 0.5, 1.0) - vec3(0.0, 1.0, 0.0);
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z), x_ = floor(j * ns.z), y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy, y = y_ * ns.x + ns.yyyy, h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy), b1 = vec4(x.zw, y.zw), s0 = floor(b0) * 2.0 + 1.0, s1 = floor(b1) * 2.0 + 1.0, sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy, a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x), p1 = vec3(a0.zw, h.y), p2 = vec3(a1.xy, h.z), p3 = vec3(a1.zw, h.w);
    vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;

// The water's material, in one of the palette's pairs. Opacity is how much of
// the wash covers what's under it, looking straight down.
export function waterMaterial(colour: readonly [number, number], opacity: number) {
  const material = painted(colour, { transparent: true, opacity, depthWrite: false });
  materials.push(material);
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    paint(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'uniform mat4 uReflectMatrix;\nvarying vec4 vReflect;\nvarying vec3 vWater;\n#include <common>')
      .replace('#include <fog_vertex>', /* glsl */`#include <fog_vertex>
        vWater = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vReflect = uReflectMatrix * vec4(vWater, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform vec3 uSun,', /* glsl */`uniform sampler2D uReflection;
        uniform float uTime;
        uniform vec3 uMirror, uShape;
        uniform vec3 uHighlight;
        varying vec4 vReflect;
        varying vec3 vWater;
        ${noise}
        uniform vec3 uSun,`)
      .replace('#ifdef USE_FOG', /* glsl */`{
          // The highlights: where two slowly changing layers of noise add up
          // past a threshold, cut hard, so they're rounded blobs with crisp
          // edges that swell, split and fade as the surface moves.
          vec2 p = vWater.xz / uShape.x;
          float t = uTime * uShape.y;
          float n = snoise(vec3(p + vec2(0.11, 0.05) * t, t * 0.6)) * 0.65
            + snoise(vec3(p * 2.1 - vec2(0.07, -0.13) * t, t * 0.9 + 7.0)) * 0.35;
          float edge = fwidth(n) * 0.7;
          float highlight = smoothstep(uShape.z - edge, uShape.z + edge, n);

          // The reflection, nudged by the same surface and blurred.
          vec2 at = vReflect.xy / vReflect.w + vec2(0.004, 0.006) * n;
          vec3 reflected = vec3(0.0);
          float r = uMirror.z;
          for (int k = 0; k < 16; k++) {
            float a = float(k) * 2.39996, d = sqrt((float(k) + 0.5) / 16.0);
            reflected += texture2D(uReflection, at + vec2(cos(a), sin(a)) * d * r * vec2(1.0, 0.6)).rgb;
          }
          reflected /= 16.0;
          float across = 1.0 - abs(dot(normal, geometryViewDir));
          float mirror = mix(uMirror.x, uMirror.y, smoothstep(0.35, 0.95, across));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, reflected, mirror);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, mirror);

          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHighlight, highlight * 0.9);
          gl_FragColor.a = max(gl_FragColor.a, highlight * 0.9);
        }
        #ifdef USE_FOG`);
  };
  return material;
}

// The reflection: the scene drawn from the camera mirrored under the water,
// everything below the water's level cut away, before the frame is drawn.
const virtual = new THREE.PerspectiveCamera(), clip = new THREE.Plane(), q = new THREE.Vector4();
const size = new THREE.Vector2();
let hidden: THREE.Object3D[] | undefined;
export function reflectWater(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  renderer.getSize(size);
  const width = Math.max(1, Math.round(size.x / SHRINK)), height = Math.max(1, Math.round(size.y / SHRINK));
  if (target.width !== width || target.height !== height) target.setSize(width, height);
  // Mirror the camera: its position, and its view flipped top to bottom.
  camera.updateMatrixWorld();
  virtual.copy(camera);
  const position = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const forward = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
  position.y = 2 * LEVEL - position.y;
  forward.y = -forward.y;
  up.y = -up.y;
  virtual.position.copy(position);
  virtual.up.copy(up);
  virtual.lookAt(position.clone().add(forward));
  virtual.updateMatrixWorld();
  virtual.projectionMatrix.copy(camera.projectionMatrix);
  uniforms.uReflectMatrix.value.set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1,
  ).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
  // Cut away everything under the water with an oblique near plane
  // (Lengyel's method, as in three's Reflector).
  clip.set(new THREE.Vector3(0, 1, 0), -LEVEL).applyMatrix4(virtual.matrixWorldInverse);
  const projection = virtual.projectionMatrix.elements;
  const plane = new THREE.Vector4(clip.normal.x, clip.normal.y, clip.normal.z, clip.constant);
  q.set((Math.sign(plane.x) + projection[8]) / projection[0], (Math.sign(plane.y) + projection[9]) / projection[5], -1, (1 + projection[10]) / projection[14]);
  plane.multiplyScalar(2 / plane.dot(q));
  projection[2] = plane.x;
  projection[6] = plane.y;
  projection[10] = plane.z + 1;
  projection[14] = plane.w;
  virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();

  // Leave out the water itself and everything under it.
  hidden ??= (() => {
    const found: THREE.Object3D[] = [];
    scene.traverse(o => {
      const material = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (material && !Array.isArray(material) && (materials.includes(material) || 'DROWNED' in (material.defines ?? {}))) found.push(o);
    });
    return found;
  })();
  hidden.forEach(o => o.visible = false);
  const shadows = renderer.shadowMap.autoUpdate, before = renderer.getRenderTarget();
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, virtual);
  renderer.setRenderTarget(before);
  renderer.shadowMap.autoUpdate = shadows;
  hidden.forEach(o => o.visible = true);
}

export function updateWater(seconds: number) {
  uniforms.uTime.value = seconds;
  uniforms.uMirror.value.set(waterLook.down, waterLook.across, waterLook.blur);
  uniforms.uShape.value.set(waterLook.size, waterLook.pace, waterLook.sparse);
}
