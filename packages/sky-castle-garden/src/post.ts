import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type GUI from 'three/addons/libs/lil-gui.module.min.js';

// Step 10, post-processing, kept light: a soft bloom where the sun is
// brightest (white stone in full sun, the water's highlights) and a touch
// more saturation, to finish the painted look. No paper or brush overlay
// (Andrew didn't want one).

export const post = { bloom: 0.2, threshold: 0.86, spread: 0.5, saturation: 1.1 };

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // Multisampled, so edges stay as smooth as drawing straight to the screen.
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), post.bloom, post.spread, post.threshold);
  composer.addPass(bloom);
  const saturate = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, amount: { value: post.saturation } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float amount;
      varying vec2 vUv;
      void main() {
        vec4 colour = texture2D(tDiffuse, vUv);
        float grey = dot(colour.rgb, vec3(0.2126, 0.7152, 0.0722));
        gl_FragColor = vec4(max(mix(vec3(grey), colour.rgb, amount), 0.0), colour.a);
      }`,
  });
  composer.addPass(saturate);
  composer.addPass(new OutputPass());

  return {
    render() {
      bloom.strength = post.bloom;
      bloom.threshold = post.threshold;
      bloom.radius = post.spread;
      bloom.enabled = post.bloom > 0;
      saturate.uniforms.amount.value = post.saturation;
      composer.render();
    },
    resize() {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
    },
    tune(gui: GUI) {
      const folder = gui.addFolder('post-processing');
      folder.add(post, 'bloom', 0, 1.5, 0.01).name('bloom strength');
      folder.add(post, 'threshold', 0, 1.5, 0.01).name('bloom from brightness');
      folder.add(post, 'spread', 0, 1, 0.01).name('bloom spread');
      folder.add(post, 'saturation', 0.5, 1.6, 0.01);
      folder.close();
    },
  };
}
