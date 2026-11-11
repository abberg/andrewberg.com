import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { paint } from './look';

// The creature's body, and how it's posed. It's kept apart from what the
// creature does (creature.ts) so another model can take this one's place:
// anything with a group (facing +z, feet at y = 0) and a pose() will do.
//
// The model is a fennec fox (public/creature.glb), a metre from its nose to
// the tip of its tail. blender/creature.py makes it from a free Sketchfab
// model, blender/fox.obj: it sizes and colours it and gives it its bones,
// which are posed here; there are no clips.

// How it holds itself: sitting up on its haunches (0 to 1), bounding (0 to
// 1, and where it is in the bound, in radians), nodding at what it's eating
// (0 to 1), and the time (s), for its tail and ears.
export type Pose = { sit: number, run: number, stride: number, nod: number, seconds: number };
// nose: how far ahead of where it stands (its hips) its nose is (m).
export type CreatureModel = { group: THREE.Group, nose: number, pose: (pose: Pose) => void };

const SHADE = 0x9c7a78;
const ACROSS = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0), ALONG = new THREE.Vector3(0, 0, 1);

export function createCreatureModel(gltf: GLTF): CreatureModel {
  const group = gltf.scene;
  const bones = new Map<string, { bone: THREE.Bone, rest: THREE.Quaternion, world: THREE.Quaternion, back: THREE.Quaternion, at: THREE.Vector3 }>();
  group.updateMatrixWorld(true);
  group.traverse(child => {
    if ((child as THREE.Bone).isBone) {
      const world = child.getWorldQuaternion(new THREE.Quaternion());
      bones.set(child.name, { bone: child as THREE.Bone, rest: child.quaternion.clone(), world, back: world.clone().invert(), at: child.position.clone() });
    }
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh, material = mesh.material as THREE.MeshStandardMaterial;
    material.metalness = 0;
    material.roughness = 1;
    material.vertexColors = true;
    material.color.set(0xffffff);
    paint(material, SHADE);
    mesh.castShadow = true;
    // Posed well outside its bounds as it stands.
    mesh.frustumCulled = false;
  });
  // A bone turned from how it stands at rest, about the model's own axes
  // (not the bone's): pitch about the axis across it (nose down is
  // positive), then yaw and roll.
  const turned = new THREE.Quaternion(), more = new THREE.Quaternion();
  const turn = (name: string, pitch: number, yaw = 0, roll = 0) => {
    const b = bones.get(name);
    if (!b) return;
    turned.setFromAxisAngle(ACROSS, pitch);
    if (yaw) turned.premultiply(more.setFromAxisAngle(UP, yaw));
    if (roll) turned.premultiply(more.setFromAxisAngle(ALONG, roll));
    b.bone.quaternion.copy(b.rest).multiply(b.back).multiply(turned).multiply(b.world);
  };
  const hips = bones.get('hips');

  const pose = ({ sit, run, stride, nod, seconds }: Pose) => {
    const up = 0.85 * sit, swing = Math.sin(stride) * 0.75 * run;
    // Up on its haunches; rocking as it bounds, and lifted by each bound.
    turn('hips', -up + Math.sin(stride + 0.6) * 0.16 * run);
    if (hips) hips.bone.position.copy(hips.at).addScaledVector(UP, Math.max(0, Math.sin(stride)) * 0.1 * run);
    // Hind legs stay under it; fore paws come up towards its mouth.
    for (const side of ['L', 'R']) {
      turn(`hind${side}`, up - swing);
      turn(`fore${side}`, swing - up * (0.35 + 0.5 * nod));
    }
    // Looking ahead still, sat up; down at the fruit for a bite.
    turn('neck', up * 0.45 + nod * 0.45 * (0.6 + 0.4 * Math.sin(seconds * 19)));
    turn('head', up * 0.35 + nod * 0.25, Math.sin(seconds * 0.7) * 0.25 * sit * (1 - nod));
    // Now and then an ear flicks.
    const flick = Math.sin(seconds * 0.9) > 0.96 ? Math.sin(seconds * 40) * 0.12 : 0;
    turn('earL', 0, 0, flick);
    turn('earR', 0, 0, -flick * 0.6);
    // The tail: curled up behind it at rest (as it's modelled), streaming
    // out as it runs, with a slow sway all along it.
    for (let k = 1; k <= 4; k++) {
      const out = k === 2 || k === 3 ? -0.5 * run : 0;
      turn(`tail${k}`, (k === 1 ? up * 0.7 : 0) + out + Math.sin(seconds * 2.6 - k * 0.7) * 0.05 - Math.sin(stride - k * 0.7) * 0.12 * run, Math.sin(seconds * 1.7 - k * 0.5) * 0.07);
    }
  };
  pose({ sit: 0, run: 0, stride: 0, nod: 0, seconds: 0 });
  return { group, nose: 0.62, pose };
}
