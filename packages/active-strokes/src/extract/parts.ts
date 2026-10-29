import * as THREE from 'three/webgpu';
import { instancedArray, storage, uniform } from 'three/tsl';
import type { GBuffer } from '../render/gbuffer';

// Level of detail per part. Some parts carry more geometry than their pixels
// can show: the head has nearly 700 triangles in about 50 px square, each
// finger joint 76 in a few dozen pixels. Lines found inside them re-form
// every frame, so for those parts only the outline is drawn: their shading
// and creases are left out of the line filter's input (see creases.ts and
// steerable.ts), while the depth term and part boundaries still outline them.
//
// A part is busy by its triangles per pixel of its size on screen: the area
// of its bounding circle, projected each frame. That's the part's own size,
// whatever hides it, so a part half behind another isn't taken for busy.
export const partParams = {
  // Triangles per pixel of bounding circle at which a part starts to lose its
  // inner lines, and (at twice this) has lost them entirely. At the default
  // framing the head, neck, chest, hands and fingers are over it.
  density: uniform(0.05),
  // 0 keeps every part's inner lines, 1 drops them from busy parts.
  amount: uniform(1),
};

interface Part { bone: THREE.Bone; center: THREE.Vector3; radius: number; triangles: number }

export function createPartDetail(gbuffer: GBuffer, model: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  // Each part's triangles, and a bounding sphere in its bone's space. Every
  // vertex is bound to one bone, so a triangle belongs to its first vertex's
  // bone; part ids are bone indices plus one.
  const parts: (Part | null)[] = [null];
  const points: THREE.Vector3[][] = [];
  model.updateMatrixWorld(true);
  model.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const { skeleton, bindMatrix, geometry } = mesh;
    const bones = geometry.getAttribute('skinIndex'), position = geometry.getAttribute('position');
    const index = geometry.index;
    const toBone = skeleton.boneInverses.map(inverse => new THREE.Matrix4().multiplyMatrices(inverse, bindMatrix));
    for (let v = 0; v < position.count; v++) {
      const b = bones.getX(v);
      (points[b] ??= []).push(new THREE.Vector3().fromBufferAttribute(position, v).applyMatrix4(toBone[b]));
    }
    const triangles = index ? index.count / 3 : position.count / 3;
    for (let t = 0; t < triangles; t++) {
      const b = bones.getX(index ? index.getX(t * 3) : t * 3);
      parts[b + 1] ??= { bone: skeleton.bones[b], center: new THREE.Vector3(), radius: 0, triangles: 0 };
      parts[b + 1]!.triangles++;
    }
  });
  for (const [i, part] of parts.entries()) {
    if (!part) continue;
    const sphere = new THREE.Sphere().setFromPoints(points[i - 1]);
    part.center.copy(sphere.center);
    part.radius = sphere.radius;
  }
  const busy = instancedArray(new Float32Array(parts.length), 'float');
  // The same buffer, read-only, for fragment shaders.
  const busyRead = storage(busy.value, 'float', parts.length).toReadOnly();
  const densities = new Float32Array(parts.length);
  const world = new THREE.Vector3(), scale = new THREE.Vector3();

  return {
    // How busy (0-1) the part at an integer texel of the full-size G-buffer is.
    busyAt: (texel: THREE.Node<'ivec2'>) => busyRead.element(gbuffer.partAt(texel).add(0.5).toUint()),
    // Before rendering, with the pose updated.
    update() {
      const { density, amount } = partParams;
      // Pixels per world unit at unit distance.
      const focal = gbuffer.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const values = busy.value.array as Float32Array;
      parts.forEach((part, i) => {
        if (!part) return;
        world.copy(part.center).applyMatrix4(part.bone.matrixWorld);
        const distance = Math.max(world.applyMatrix4(camera.matrixWorldInverse).z * -1, camera.near);
        const radius = part.radius * scale.setFromMatrixScale(part.bone.matrixWorld).x * focal / distance;
        densities[i] = part.triangles / (Math.PI * radius * radius);
        const t = THREE.MathUtils.smoothstep(densities[i], density.value, density.value * 2) * amount.value;
        // Eased a little from frame to frame, so a part hovering at the limit
        // doesn't flicker between drawn and not.
        values[i] += (t - values[i]) * 0.25;
      });
      busy.value.needsUpdate = true;
    },
    // For checking the numbers from the console.
    read: () => parts.map((part, i) => part && { part: i, bone: part.bone.name, triangles: part.triangles, density: densities[i], busy: (busy.value.array as Float32Array)[i] }).filter(Boolean),
  };
}

export type PartDetail = ReturnType<typeof createPartDetail>;
