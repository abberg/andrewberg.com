import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Step 10, performance: everything built in place that never moves (the
// terrace, steps, paving, the castle's towers, the drowned city) as one mesh
// per material, so it's a few dozen draw calls rather than a couple of
// hundred. Each vertex keeps where it was on its own model, so textures laid
// on by model position (look.ts, TRIPLANAR) land exactly as before.
export function mergeStatic(scene: THREE.Scene) {
  const groups = new Map<string, THREE.Mesh[]>();
  for (const object of scene.children) {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.children.length || mesh.userData.unmerged) continue;
    const material = mesh.material;
    if (!mesh.geometry.getAttribute('normal')) continue;
    if (Array.isArray(material) || !(material as THREE.MeshStandardMaterial).isMeshStandardMaterial || material.transparent) continue;
    const attributes = Object.keys(mesh.geometry.attributes).sort().join();
    const key = `${material.uuid} ${mesh.castShadow} ${mesh.receiveShadow} ${attributes}`;
    groups.set(key, [...groups.get(key) ?? [], mesh]);
  }
  let merged = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      mesh.updateMatrixWorld();
      const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
      geometry.clearGroups();
      geometry.setAttribute('modelPosition', geometry.getAttribute('position').clone());
      geometry.setAttribute('modelNormal', geometry.getAttribute('normal').clone());
      return geometry.applyMatrix4(mesh.matrixWorld);
    });
    const original = meshes[0].material as THREE.MeshStandardMaterial;
    // The same paint, told to take model positions from the new attributes.
    const material = original.clone();
    material.onBeforeCompile = original.onBeforeCompile;
    material.customProgramCacheKey = original.customProgramCacheKey;
    material.defines = { ...original.defines, MERGED: '' };
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, material);
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    for (const old of meshes) {
      scene.remove(old);
      old.geometry.dispose();
    }
    scene.add(mesh);
    merged += meshes.length - 1;
  }
  return merged;
}
