import * as THREE from 'three/webgpu';
import { float, mix, screenUV, select, smoothstep, texture, uniform, vec3, vec4 } from 'three/tsl';
import type { GBuffer } from './gbuffer';

// Three-tone toon shading under the strokes, from the G-buffer's plain grey
// lighting: each pixel of the model is in shadow, lit, or highlit, split at
// two brightness thresholds with slightly soft edges. Shadow and light are the
// paper darkened, so the shading reads as wash on the same sheet; highlights
// are the paper lifted towards white, as if the wash were left off.
export const toonParams = {
  enabled: uniform(1),
  // Lighting brightness (0-1) where light turns to shadow.
  threshold: uniform(0.29),
  // Width of the soft edge between the two, in brightness.
  softness: uniform(0),
  // How much the paper is darkened in light and in shadow.
  lit: uniform(0.1),
  shadow: uniform(0.3),
  // Lighting brightness above which it's a highlight, and how far the paper is
  // lifted towards white there.
  highlightThreshold: uniform(0.49),
  highlight: uniform(1),
  // How strongly the texture's small details (rivets, seams, the face) are
  // inked in, in the strokes' ink colour.
  details: uniform(0.8),
  // How strongly the paper's grain (public/paper.jpg) shows, 0 for flat.
  paper: uniform(1),
};

export function toonLayer(gbuffer: GBuffer, paperColor: number) {
  // THREE.Color takes the sRGB hex into the linear working space.
  const linear = new THREE.Color(paperColor);
  const paper = vec3(linear.r, linear.g, linear.b);
  const { enabled, threshold, softness, lit, shadow, highlightThreshold, highlight, details } = toonParams;
  const color = gbuffer.shading;
  const brightness = color.r.mul(0.2126).add(color.g.mul(0.7152)).add(color.b.mul(0.0722));
  // smoothstep is undefined when its edges meet, so softness 0 means a hair.
  const soft = softness.max(1e-4);
  const light = smoothstep(threshold.sub(soft), threshold.add(soft), brightness);
  const shine = smoothstep(highlightThreshold.sub(soft), highlightThreshold.add(soft), brightness);
  const tone = mix(paper.mul(float(1).sub(mix(shadow, lit, light))), mix(paper, vec3(1), highlight), shine);
  // The background sits at the far plane.
  const model = gbuffer.depth.lessThan(0.9999);
  const shaded = select(enabled.greaterThan(0).and(model), tone, paper);
  // The strokes' ink colour (render/strokes.ts), in linear.
  const inkColor = new THREE.Color(0x231f1c);
  const ink = vec3(inkColor.r, inkColor.g, inkColor.b);
  return mix(shaded, ink, select(model, gbuffer.detail.mul(details).clamp(0, 1), float(0)));
}

// The strokes on screen always come from a frame or two ago: their samples
// are read back from the GPU asynchronously and then run through the Worker.
// So that shading and strokes show the same pose, the shading of the last few
// frames is kept in a ring of render targets, and the one the strokes were
// extracted from is what's drawn.
const historyLength = 8;

export function createToonHistory(renderer: THREE.WebGPURenderer, gbuffer: GBuffer, paperColor: number) {
  const ring = Array.from({ length: historyLength }, () => new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType }));
  const material = new THREE.NodeMaterial();
  material.fragmentNode = vec4(toonLayer(gbuffer, paperColor), 1);
  const quad = new THREE.QuadMesh(material);
  const shown = texture(ring[0].texture, screenUV);
  let captured = 0;

  return {
    // The shading to composite under the strokes.
    node: shown.rgb,
    // Before rendering: show the shading of the given frame, if it's still
    // in the ring, else the newest there is.
    show(frame: number) {
      if (captured === 0) return;
      const oldest = Math.max(1, captured - historyLength + 1);
      const pick = frame >= oldest && frame <= captured ? frame : captured;
      shown.value = ring[pick % historyLength].texture;
    },
    // After the G-buffer has rendered: keep this frame's shading.
    capture(frame: number) {
      const target = ring[frame % historyLength];
      if (target.width !== gbuffer.width || target.height !== gbuffer.height) target.setSize(gbuffer.width, gbuffer.height);
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      quad.render(renderer);
      renderer.setRenderTarget(previous);
      captured = frame;
    },
  };
}
