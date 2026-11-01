import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Which Mixamo bone drives each Batara bone, and for bones that point
// somewhere, the child on each side that gives the direction they point in.
// Bones without an aim keep their parent's alignment, so they ride along
// rigidly (the hands and feet, the head, the shoulder shields).
//
// As in the Batara's own clips, the shoulder swings with the upper arm,
// shield and all, so the arm never swings into the shield.
type Mapping = { source: string; aim?: [target: string, source: string] };
const rig: Record<string, Mapping> = {
  center: { source: 'Hips' },
  body_control: { source: 'Hips' },
  body_anim: { source: 'Hips' },
  waist: { source: 'Hips' },
  body: { source: 'Spine2', aim: ['head', 'Neck'] },
  head: { source: 'Head' },
  antenna: { source: 'Head' },
};
for (const [side, Side] of [['R', 'Right'], ['L', 'Left']]) {
  const clavicle: Mapping = { source: `${Side}Shoulder`, aim: [`${side}_arm01`, `${Side}Arm`] };
  rig[`${side}_shoulder_control`] = clavicle;
  rig[`${side}_shoulder_anim`] = clavicle;
  rig[`${side}_shoulder`] = { source: `${Side}Arm`, aim: [`${side}_arm02`, `${Side}ForeArm`] };
  rig[`${side}_shield`] = { source: `${Side}Arm` };
  rig[`${side}_arm01`] = { source: `${Side}Arm` };
  rig[`${side}_arm02`] = { source: `${Side}ForeArm`, aim: [`${side}_hand`, `${Side}Hand`] };
  rig[`${side}_hand`] = { source: `${Side}Hand` };
  rig[`${side}_foot01`] = { source: `${Side}UpLeg`, aim: [`${side}_foot02`, `${Side}Leg`] };
  rig[`${side}_foot02`] = { source: `${Side}Leg`, aim: [`${side}_toe`, `${Side}Foot`] };
  rig[`${side}_toe`] = { source: `${Side}Foot` };
}

// The Batara's vertices are quantized, which leaves its bind pose a tenth of
// the size of its rest pose (the bones' own transforms), and retargetClip
// poses the skeleton in its bind pose. Bakes the rest pose into the geometry
// and makes it the bind pose, which looks the same and plays the model's own
// clips the same.
export function bindToRest(mesh: THREE.SkinnedMesh) {
  const { skeleton, geometry } = mesh;
  // The bones aren't under the mesh.
  skeleton.bones[0].updateWorldMatrix(true, true);
  const skinning = skeleton.bones.map((bone, i) => bone.matrixWorld.clone().multiply(skeleton.boneInverses[i]));
  const float = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const values = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) values.set([attribute.getX(i), attribute.getY(i), attribute.getZ(i)], i * 3);
    return new THREE.BufferAttribute(values, 3);
  };
  const position = float(geometry.attributes.position), normal = float(geometry.attributes.normal);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  const joints = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
  const matrix = new THREE.Matrix4(), v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    matrix.elements.fill(0);
    for (let k = 0; k < 4; k++) {
      const weight = weights.getComponent(i, k);
      if (weight === 0) continue;
      const bone = skinning[joints.getComponent(i, k)].elements;
      for (let e = 0; e < 16; e++) matrix.elements[e] += bone[e] * weight;
    }
    position.setXYZ(i, ...v.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray());
    normal.setXYZ(i, ...v.fromBufferAttribute(normal, i).transformDirection(matrix).toArray());
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  skeleton.calculateInverses();
}

// Retargets a Mixamo clip onto the Batara with SkeletonUtils.retargetClip.
//
// retargetClip sets each Batara bone's world rotation to its Mixamo bone's,
// times a local offset. Mixamo's bones carry their own orientations, and it
// stands in a T-pose where the Batara's arms hang, so each offset undoes the
// Mixamo bone's rest orientation and swings the Batara bone onto the Mixamo
// bone's direction. From there the Batara follows the Mixamo bones' rotations
// away from their T-pose.
export function retargetMixamo(target: THREE.SkinnedMesh, source: THREE.Object3D, clip: THREE.AnimationClip) {
  target.skeleton.pose();
  target.updateMatrixWorld(true);
  source.updateMatrixWorld(true);

  const worldRotation = (object: THREE.Object3D) => object.getWorldQuaternion(new THREE.Quaternion());
  const worldPosition = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());
  const sourceBone = (name: string) => source.getObjectByName(`mixamorig${name}`)!;

  // The world rotation that swings each Batara bone onto its Mixamo bone, at rest.
  const alignments = new Map<THREE.Object3D, THREE.Quaternion>();
  const names: Record<string, string> = {};
  const localOffsets: Record<string, THREE.Matrix4> = {};
  for (const bone of target.skeleton.bones) {
    const map = rig[bone.name];
    let align = alignments.get(bone.parent!) ?? new THREE.Quaternion();
    if (map?.aim) {
      const from = worldPosition(target.skeleton.getBoneByName(map.aim[0])!).sub(worldPosition(bone)).normalize();
      const to = worldPosition(sourceBone(map.aim[1])).sub(worldPosition(sourceBone(map.source))).normalize();
      align = new THREE.Quaternion().setFromUnitVectors(from, to);
    }
    alignments.set(bone, align);
    if (!map) continue;
    const driver = sourceBone(map.source);
    names[bone.name] = driver.name;
    const offset = worldRotation(driver).invert().multiply(align).multiply(worldRotation(bone));
    localOffsets[bone.name] = new THREE.Matrix4().makeRotationFromQuaternion(offset);
  }

  // The mocap is in centimetres; scale its hips to the Batara's.
  const hips = worldPosition(sourceBone('Hips'));
  const center = worldPosition(target.skeleton.getBoneByName('center')!);
  const bones: THREE.Bone[] = [];
  source.traverse(object => { if ((object as THREE.Bone).isBone) bones.push(object as THREE.Bone); });
  // localOffsets is missing from @types/three.
  const options: SkeletonUtils.RetargetClipOptions & { localOffsets: typeof localOffsets } = {
    names, localOffsets, hip: 'mixamorigHips', scale: center.y / hips.y, fps: 60,
  };
  const retargeted = SkeletonUtils.retargetClip(target, new THREE.Skeleton(bones), clip, options);
  target.skeleton.pose();
  return retargeted;
}
