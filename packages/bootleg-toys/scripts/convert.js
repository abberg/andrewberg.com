import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The browser half of convert-kitbash.mjs: load a robot's FBX, through the
// patched FBXLoader the sketch uses, and export what a kitbash needs of it as
// a GLB, along with a fingerprint of its shape.
// Hand meshes, by preference: a fist, then the first of a numbered set, then
// a plain one, then an open hand. Some are filed as weapons (wp_hand_l).
const handKinds = [/close|fist|grip/, /_01/, /^(eq|wp)_hand(_[lr])?$/, /open|_02/];
const isHand = (name) => /^(eq|wp)_hand/.test(name);
const pick = (meshes) => handKinds.map((kind) => meshes.find((mesh) => kind.test(mesh.name))).find(Boolean) ?? meshes[0];

// The bone each vertex follows most.
function dominantBone(mesh, v) {
  const index = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  let best = 0;
  for (let k = 1; k < 4; k++) if (weight.getComponent(v, k) > weight.getComponent(v, best)) best = k;
  return mesh.skeleton.bones[index.getComponent(v, best)];
}

function handVertices(body) {
  let count = 0;
  for (let v = 0; v < body.geometry.attributes.position.count; v++) if (/^mot_hand/.test(dominantBone(body, v).name)) count++;
  return count;
}

// When the body has next to no hands of its own, add its hand meshes to it:
// one per side (or one holding both), each vertex skinned wholly to the body's
// bone of the name it follows (or, for a rigid mesh, its nearest bone's), and
// placed so the body draws it where it's drawn now.
function addHands(fbx, body) {
  if (handVertices(body) >= 20) return;
  const meshes = [];
  fbx.traverse((object) => object.isMesh && isHand(object.name) && meshes.push(object));
  const sided = ["l", "r"].map((side) => pick(meshes.filter((mesh) => mesh.name.endsWith(`_${side}`)))).filter(Boolean);
  const hands = sided.length ? sided : [pick(meshes.filter((mesh) => !/_[lr]$/.test(mesh.name)))].filter(Boolean);
  const bones = new Map(body.skeleton.bones.map((bone, n) => [bone.name, n]));
  // world = body.matrixWorld · bindMatrixInverse · bone · boneInverse ·
  // bindMatrix · vertex, so vertex = that chain, inverted, applied to world.
  const chains = new Map();
  const chain = (n) => {
    if (!chains.has(n)) {
      chains.set(n, body.matrixWorld.clone()
        .multiply(body.bindMatrixInverse)
        .multiply(body.skeleton.bones[n].matrixWorld)
        .multiply(body.skeleton.boneInverses[n])
        .multiply(body.bindMatrix)
        .invert());
    }
    return chains.get(n);
  };
  const pieces = [];
  for (const hand of hands) {
    const geometry = hand.geometry.index ? hand.geometry.toNonIndexed() : hand.geometry.clone();
    const position = geometry.attributes.position;
    let rigidBone = null;
    if (!hand.isSkinnedMesh) for (let up = hand.parent; up && !rigidBone; up = up.parent) if (up.isBone) rigidBone = up.name;
    const follows = new Int32Array(position.count);
    const p = new THREE.Vector3();
    for (let v = 0; v < position.count; v++) {
      p.fromBufferAttribute(position, v);
      if (hand.isSkinnedMesh) hand.applyBoneTransform(v, p);
      p.applyMatrix4(hand.matrixWorld);
      const name = hand.isSkinnedMesh ? dominantBone(hand, v).name : rigidBone;
      const side = /_l(_|$)/.test(hand.name) || (!/_r(_|$)/.test(hand.name) && p.x > 0) ? "l" : "r";
      const n = bones.get(name) ?? bones.get(`mot_hand_${side}`);
      follows[v] = n ?? -1;
      if (n !== undefined) p.applyMatrix4(chain(n));
      position.setXYZ(v, p.x, p.y, p.z);
    }
    if (follows.includes(-1)) continue;
    // The body's attributes, the hand's where it has them.
    const piece = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(body.geometry.attributes)) {
      const array = new attribute.array.constructor(position.count * attribute.itemSize);
      if (name === "skinIndex") follows.forEach((n, v) => (array[v * 4] = n));
      else if (name === "skinWeight") for (let v = 0; v < position.count; v++) array[v * 4] = 1;
      else if (geometry.attributes[name]?.itemSize === attribute.itemSize) array.set(geometry.attributes[name].array.subarray(0, array.length));
      piece.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    if (piece.attributes.normal) piece.computeVertexNormals();
    pieces.push(piece);
  }
  if (!pieces.length) return;
  const own = body.geometry.index ? body.geometry.toNonIndexed() : body.geometry.clone();
  own.clearGroups();
  body.geometry = mergeGeometries([own, ...pieces]);
}

export async function convert(id) {
  const fbx = await new FBXLoader().loadAsync(`./models/${id}/${id}.fbx`);
  fbx.updateMatrixWorld(true);
  let body = null;
  fbx.traverse((object) => {
    if (object.isSkinnedMesh && /^(model|body|mode)$/.test(object.name)) body = object;
  });
  if (!body) throw new Error("no body mesh");

  // Some robots keep their hands out of the body, as equipment to swap
  // (open, closed...). Fold one of each into it.
  addHands(fbx, body);

  // Only the body mesh, which is all a kitbash uses, and no textures: one
  // plain material.
  const others = [];
  fbx.traverse((object) => object.isMesh && object !== body && others.push(object));
  for (const object of others) object.removeFromParent();
  body.geometry.clearGroups();
  body.material = new THREE.MeshStandardMaterial();

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
