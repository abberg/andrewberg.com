import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

// The browser half of convert-kitbash.mjs: load a robot's FBX, through the
// patched FBXLoader the sketch uses, and export what a kitbash needs of it as
// a GLB, along with a fingerprint of its shape.
export async function convert(id) {
  const fbx = await new FBXLoader().loadAsync(`./models/${id}/${id}.fbx`);
  fbx.updateMatrixWorld(true);
  let body = null;
  fbx.traverse((object) => {
    if (object.isSkinnedMesh && /^(model|body|mode)$/.test(object.name)) body = object;
  });
  if (!body) throw new Error("no body mesh");

  // Only the body mesh, which is all a kitbash uses, and no textures: a plain
  // material in each of its material slots.
  const others = [];
  fbx.traverse((object) => object.isMesh && object !== body && others.push(object));
  for (const object of others) object.removeFromParent();
  const plain = new THREE.MeshStandardMaterial();
  body.material = Array.isArray(body.material) ? body.material.map(() => plain) : plain;

  // The rig nests each bone in copies of itself, one run per mesh. In glTF the
  // copies would be plain nodes, which the stance can't pose through, so hang
  // each joint from its nearest joint ancestor instead (a copy standing for
  // the joint of its name), keeping where it is, and drop the copies.
  const joints = new Set(body.skeleton.bones);
  const named = new Map();
  for (const bone of body.skeleton.bones) if (!named.has(bone.name)) named.set(bone.name, bone);
  const parents = new Map();
  // A node stands for a joint if it is one, or is a copy of one (other than
  // this bone's own copies).
  const standsFor = (node, bone) => (joints.has(node) ? node : named.get(node.name) !== bone ? named.get(node.name) : undefined);
  for (const bone of body.skeleton.bones) {
    let above = bone.parent;
    while (above && above !== fbx && !standsFor(above, bone)) above = above.parent;
    parents.set(bone, above && above !== fbx ? standsFor(above, bone) : fbx);
  }
  for (const [bone, parent] of parents) parent.attach(bone);
  // Some robots hang the body mesh from a bone of the same name (see the
  // FBXLoader patch in vite.config.js); move it to the top, keeping where it
  // is, so it doesn't go with the copies.
  fbx.attach(body);
  // Those share their name with that bone, which glTF loaders then rename
  // apart; give every body the same name of its own.
  body.name = "body";
  const copies = [];
  fbx.traverse((object) => object.isBone && !joints.has(object) && copies.push(object));
  for (const copy of copies) copy.removeFromParent();

  // The fingerprint: the posed vertices, rounded to half a percent of the
  // robot's size, as a set. Two robots with the same one are the same model.
  fbx.updateMatrixWorld(true);
  const position = body.geometry.attributes.position;
  const points = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    body.applyBoneTransform(i, v).applyMatrix4(body.matrixWorld);
    points.push(v.clone());
  }
  const size = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length();
  const key = points.map((p) => p.toArray().map((c) => Math.round((c / size) * 200)).join(",")).sort().join(";");
  let fingerprint = 0;
  for (let i = 0; i < key.length; i++) fingerprint = (Math.imul(fingerprint, 31) + key.charCodeAt(i)) | 0;

  const glb = new Uint8Array(await new GLTFExporter().parseAsync(fbx, { binary: true, animations: [] }));
  let binary = "";
  for (let i = 0; i < glb.length; i += 0x8000) binary += String.fromCharCode(...glb.subarray(i, i + 0x8000));
  return { glb: btoa(binary), fingerprint };
}
