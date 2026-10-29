import * as THREE from 'three/webgpu';
import { attribute, color, float, fract, select, smoothstep, uniform } from 'three/tsl';
import { STRIP_FLOATS, type Strips } from '../brush/strips';

// Most strip vertices drawn in a frame. Strips beyond it are dropped.
const capacity = 1 << 18;

// Draws the Worker's brush-path strips in pixel space over the frame. Buffers
// are allocated once and only their draw range changes, since the number of
// strokes changes every frame.
export function createStrokes() {
  const data = new Float32Array(capacity * STRIP_FLOATS);
  const buffer = new THREE.InterleavedBuffer(data, STRIP_FLOATS).setUsage(THREE.DynamicDrawUsage);
  const indices = new THREE.BufferAttribute(new Uint32Array(capacity * 3), 1).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 2, 0));
  geometry.setAttribute('stroke', new THREE.InterleavedBufferAttribute(buffer, 3, 2));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);

  // Style 0 is plain ink; 1 dashes along the brush parameter, which makes any
  // sliding or popping of the parameterization easy to see.
  const style = uniform(0);
  const dashLength = uniform(10);
  const stroke = attribute<'vec3'>('stroke');
  const across = stroke.y.abs();
  const edge = float(1).sub(smoothstep(0.6, 1, across));
  const dash = select(style.equal(1), smoothstep(0.45, 0.5, fract(stroke.x.div(dashLength.mul(2)))).oneMinus(), float(1));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  material.colorNode = select(style.equal(1), color(0xa8322a), color(0x231f1c));
  material.opacityNode = stroke.z.mul(edge).mul(dash);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  // No background: the pass's alpha is the ink, composited over the paper.
  const scene = new THREE.Scene();
  scene.add(mesh);
  // Pixel space, y down, like the samples.
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);

  return {
    scene,
    camera,
    style,
    update(strips: Strips, width: number, height: number) {
      if (camera.right !== width || camera.bottom !== height) {
        camera.right = width;
        camera.bottom = height;
        camera.updateProjectionMatrix();
      }
      const vertexCount = Math.min(strips.vertices.length / STRIP_FLOATS, capacity);
      data.set(strips.vertices.subarray(0, vertexCount * STRIP_FLOATS));
      buffer.addUpdateRange(0, vertexCount * STRIP_FLOATS);
      buffer.needsUpdate = true;
      // Keep only triangles whose vertices all made it into the buffer.
      let count = 0;
      const out = indices.array as Uint32Array;
      for (let i = 0; i + 2 < strips.indices.length && count + 3 <= out.length; i += 3) {
        if (strips.indices[i + 2] >= vertexCount || strips.indices[i + 1] >= vertexCount) break;
        out[count++] = strips.indices[i]; out[count++] = strips.indices[i + 1]; out[count++] = strips.indices[i + 2];
      }
      indices.addUpdateRange(0, count);
      indices.needsUpdate = true;
      geometry.setDrawRange(0, count);
      mesh.visible = count > 0;
    },
  };
}
