import * as THREE from 'three';
import { noiseGLSL } from './sketch';

// The inverted hull: copies of the mesh, sharing its geometry and skeleton,
// pushed out along its skinned normals and drawn black with only their back
// faces, so they show as a rim around the model and wherever parts overlap.
//
// The Batara is hard-edged, so the vertices at a corner are copies with a
// normal for each face, and pushing them apart along those splits the hull
// open. The hull is pushed along averaged normals instead: one shared
// direction for all the copies of a vertex.
//
// For the sketchy look there's a hull for each line, each pushed out by a
// different, wandering amount and shifted on screen by a smooth noise field.
// A solid hull would fill in the gap a shift opens up and the lines would
// merge into one thick one, so each line is drawn on its own: its hull, then
// the model shifted the same way to cut the inside back out, leaving a ring,
// which is laid over the picture. Where a ring strays inside the silhouette
// it draws over the model, which is part of the look.
export const MAX_LINES = 4;

export function invertedHull(mesh: THREE.SkinnedMesh) {
  const uniforms = {
    thickness: { value: 0.05 },
    jitter: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    boil: { value: 0 },
  };
  // Each ring is laid on partly see-through, so where they cross they build up darker.
  const opacity = { value: 0.6 };
  mesh.geometry.setAttribute('outlineNormal', averagedNormals(mesh.geometry));
  const shifted = (line: number, hull: boolean, material: THREE.Material) => {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `uniform float thickness, jitter, boil;
uniform vec2 resolution;
attribute vec3 outlineNormal;
${noiseGLSL}
${shader.vertexShader}`
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
          // Noise on the rest position, so it sticks to the model as it moves.
          vec3 seed = position * 0.25 + vec3(${line * 19}.7, ${line * 7}.3, boil);
          ${hull ? `float wander = 1.0 + 0.6 * sketchNoise(seed) * (jitter > 0.0 ? 1.0 : 0.0);
          // skinMatrix comes from <skinnormal_vertex>, earlier.
          transformed += normalize((skinMatrix * vec4(outlineNormal, 0.0)).xyz) * thickness * wander;` : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec2 shift = vec2(sketchNoise(seed + 31.0), sketchNoise(seed + 57.0)) * jitter;
          gl_Position.xy += shift * 2.0 / resolution * gl_Position.w;`);
    };
    // Otherwise three.js reuses the first line's program for all of them,
    // since their onBeforeCompile functions read the same.
    material.customProgramCacheKey = () => `outline-${line}-${hull}`;
    const copy = new THREE.SkinnedMesh(mesh.geometry, material);
    copy.bind(mesh.skeleton, mesh.bindMatrix);
    copy.frustumCulled = false;
    return copy;
  };
  const lines = Array.from({ length: MAX_LINES }, (_, line) => {
    const scene = new THREE.Scene();
    const hull = shifted(line, true, new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
    // Writes nothing at all, clearing what's behind it.
    const cut = shifted(line, false, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.NoBlending }));
    cut.renderOrder = 1;
    scene.add(hull, cut);
    return scene;
  });

  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { ring: { value: target.texture }, opacity },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D ring; uniform float opacity; varying vec2 vUv; void main() { gl_FragColor = texture2D(ring, vUv) * opacity; }',
  }));
  const overlayScene = new THREE.Scene().add(overlay);
  const overlayCamera = new THREE.Camera();
  const clear = new THREE.Color();

  return {
    uniforms,
    opacity,
    setSize(width: number, height: number) {
      target.setSize(width, height);
      uniforms.resolution.value.set(width, height);
    },
    // Lays each line's ring over what's already drawn.
    render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, count: number) {
      const autoClear = renderer.autoClear, alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setClearColor(0x000000, 0);
      for (let line = 0; line < count; line++) {
        renderer.setRenderTarget(target);
        renderer.autoClear = true;
        renderer.render(lines[line], camera);
        renderer.setRenderTarget(null);
        renderer.autoClear = false;
        renderer.render(overlayScene, overlayCamera);
      }
      renderer.autoClear = autoClear;
      renderer.setClearColor(clear, alpha);
    },
  };
}

// Sums the distinct normals of the vertices that share a position and a bone
// (so parts that only touch at rest stay apart when they move).
function averagedNormals(geometry: THREE.BufferGeometry) {
  const { position, normal, skinIndex } = geometry.attributes;
  const key = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e3)).join() + `/${skinIndex.getX(i)}`;
  const groups = new Map<string, { sum: THREE.Vector3; seen: Set<string> }>();
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const group = groups.get(key(i)) ?? { sum: new THREE.Vector3(), seen: new Set<string>() };
    groups.set(key(i), group);
    n.fromBufferAttribute(normal, i).normalize();
    // Each face direction once, however many vertices it has at the corner.
    const direction = n.toArray().map(v => v.toFixed(2)).join();
    if (group.seen.has(direction)) continue;
    group.seen.add(direction);
    group.sum.add(n);
  }
  const averaged = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) groups.get(key(i))!.sum.clone().normalize().toArray(averaged, i * 3);
  return new THREE.BufferAttribute(averaged, 3);
}
