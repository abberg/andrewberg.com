import * as THREE from "three";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

// Kitbashing: build one robot from the head, body, arms and legs of others.
//
// Every robot's body mesh is skinned to the same family of bones (mot_pelvis,
// mot_spine, mot_head, mot_arm_l, mot_upleg_r, ...), so each vertex can be
// sorted into a part by the bone that moves it most. The body robot supplies
// the skeleton; every borrowed vertex is carried over in the space of its own
// bone and set down on the body robot's bone of the same name, so arms land on
// shoulders and legs on hips. Each part is scaled to the frame's proportions:
// arms to its arm length, legs to its leg length, head and body to its torso.

export const slots = ["head", "body", "arms", "legs"];

// Walk up from a bone to the first one that says which part it belongs to.
// Shoulder armour goes with the arms and skirt armour with the body.
function partOf(bone) {
  for (let b = bone; b?.isBone; b = b.parent) {
    const name = b.name;
    if (/^mot_head/.test(name)) return "head";
    if (/^mot_(clavicle|shoulder|arm|forearm|hand)/.test(name)) return "arms";
    if (/^mot_(upleg|leg|foot|toe|heel)/.test(name)) return "legs";
    if (/^mot_(pelvis|spine|chest|neck)/.test(name)) return "body";
  }
  return "body";
}

// The bone-to-bone distances each part is measured by.
const measures = {
  head: ["mot_pelvis", "mot_head"],
  body: ["mot_pelvis", "mot_head"],
  arms: ["mot_arm_l", "mot_hand_l", "mot_forearm_l"],
  legs: ["mot_upleg_l", "mot_foot_l", "mot_leg_l"],
};

// The distance from the first bone to the second, or to the third when a
// robot has no second (some arms end without a hand bone).
function measure(bones, [from, to, fallback]) {
  const start = bones.get(from);
  const end = bones.get(to) ?? bones.get(fallback);
  if (!start || !end) return null;
  const a = new THREE.Vector3().setFromMatrixPosition(start.matrixWorld);
  return a.distanceTo(new THREE.Vector3().setFromMatrixPosition(end.matrixWorld)) || null;
}

// What a kitbash needs from a loaded robot: its body mesh, a lookup of its
// bones by name, how tall it stands, and how much it has of each part.
export function prepare(object) {
  object.updateMatrixWorld(true);
  let mesh = null;
  object.traverse((child) => {
    if (child.isSkinnedMesh && /^(model|body|mode)$/.test(child.name)) mesh = child;
  });
  if (!mesh) return null;
  const bones = new Map();
  for (const bone of mesh.skeleton.bones) if (!bones.has(bone.name)) bones.set(bone.name, bone);
  // Measured posed, from the skinned vertices: the converted robots' positions
  // are stored compressed, scaled up into the bones' bind matrices.
  mesh.computeBoundingBox();
  const box = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  const height = box.max.y - box.min.y;
  // The share of the body mesh's vertices in each part. Some robots keep a
  // part outside the body mesh (Noir Getter 2's arms are separate extras), so
  // they've little or nothing to lend for it.
  const dominant = dominantBones(mesh);
  const partOfBone = mesh.skeleton.bones.map(partOf);
  const shares = Object.fromEntries(slots.map((slot) => [slot, 0]));
  for (const bone of dominant) shares[partOfBone[bone]] += 1 / dominant.length;
  return { mesh, bones, height, shares };
}

// Whether a prepared robot has enough of a part to lend it.
// Small heads (Qubeley's) are around 3%; the robots with nothing for a part
// are at or near zero.
// It also needs the bones the part is set on: a body, as the frame, needs
// somewhere for every other part to go (Big Duo's has no arms or legs, so
// borrowed arms would end up at its hips).
const needs = {
  head: ["mot_head"],
  body: ["mot_pelvis", "mot_head", "mot_arm_l", "mot_arm_r", "mot_upleg_l", "mot_upleg_r"],
  arms: ["mot_arm_l", "mot_arm_r"],
  legs: ["mot_upleg_l", "mot_upleg_r"],
};
export const canLend = (robot, part) => robot.shares[part] >= 0.015 && needs[part].every((bone) => robot.bones.has(bone));

// A ready stance for the frame's skeleton: feet planted wide, one a little
// ahead of the other, upper arms down and forward, forearms raised to guard.
// Rigs stand differently at rest (arms out, arms down, legs together), so
// rather than turn each bone by a set angle, each limb segment is turned to
// point a set way: from its joint towards the next one down the limb. Feet
// keep their rest orientation, so they stay flat. The robots face +z.
//
// Returns the frame's bones' matrices in that pose, worked out on the side:
// the robots' own skeletons are shared and left as they are.
const limbs = [
  // bone, the joint it points to, where it should point (x is outwards)
  ["upleg", "leg", [0.36, -1, 0.12]],
  ["leg", "foot", [0.1, -1, -0.04]],
  ["arm", "forearm", [0.45, -0.75, 0.45]],
  ["forearm", "hand", [-0.2, 0.3, 1]],
];

function stance(frame, random) {
  const at = (name) => {
    const bone = frame.bones.get(name);
    return bone && new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  };
  // Which way is the robot's left?
  const left = at("mot_arm_l") && at("mot_arm_r") ? Math.sign(at("mot_arm_l").x - at("mot_arm_r").x) || 1 : 1;
  const wobble = () => (random() - 0.5) * 0.25;
  const aims = new Map();
  for (const side of ["l", "r"]) {
    const outwards = side === "l" ? left : -left;
    // The right foot steps back where the left steps forward, and the right
    // arm guards a little higher.
    const lead = side === "l" ? 1 : -0.8;
    for (const [name, next, [x, y, z]] of limbs) {
      const from = at(`mot_${name}_${side}`);
      const to = at(`mot_${next}_${side}`);
      if (!from || !to) continue;
      const leg = name.endsWith("leg");
      const aim = new THREE.Vector3(
        x * outwards + wobble(),
        y + (leg ? 0 : side === "r" ? 0.15 : 0) + wobble(),
        (leg ? z * lead : z) + wobble(),
      ).normalize();
      aims.set(`mot_${name}_${side}`, { rest: to.sub(from).normalize(), aim });
    }
    aims.set(`mot_foot_${side}`, { flat: true });
  }

  // Each bone's move from rest to the pose, built down from the root: its
  // parent's move, then (for the limbs above) a turn about its own joint.
  const moves = new Map();
  const turn = new THREE.Quaternion();
  function moveOf(bone) {
    if (moves.has(bone)) return moves.get(bone);
    const parent = bone.parent?.isBone ? moveOf(bone.parent) : new THREE.Matrix4();
    let move = parent;
    // A bone can appear as a run of nested copies; pose only the outermost.
    const aim = bone.parent?.name !== bone.name ? aims.get(bone.name) : null;
    if (aim) {
      const pivot = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
      const moved = pivot.clone().applyMatrix4(parent);
      const carried = new THREE.Quaternion().setFromRotationMatrix(parent);
      const rotation = aim.flat
        ? new THREE.Quaternion()
        : turn.setFromUnitVectors(aim.rest.clone().applyQuaternion(carried), aim.aim).clone().multiply(carried);
      move = new THREE.Matrix4()
        .makeTranslation(moved.x, moved.y, moved.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
        .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    }
    moves.set(bone, move);
    return move;
  }
  return (bone) => (bone.isBone ? moveOf(bone).clone().multiply(bone.matrixWorld) : bone.matrixWorld.clone());
}

// The bone each vertex follows most closely.
function dominantBones(mesh) {
  const index = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  const result = new Uint16Array(index.count);
  for (let v = 0; v < index.count; v++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (weight.getComponent(v, k) > weight.getComponent(v, best)) best = k;
    result[v] = index.getComponent(v, best);
  }
  return result;
}

// Cut one part out of `source` and fit it to the skeleton of `frame`.
// Returns a mesh per material the part uses.
function transplant(source, frame, part, material, pose) {
  const { mesh } = source;
  const geometry = mesh.geometry;
  const bones = mesh.skeleton.bones;
  const dominant = dominantBones(mesh);
  const parts = bones.map(partOf);
  // Both measured between the same bones: a frame whose legs end at the
  // knee (Dybuster's) is measured hip to knee, and so is the part.
  const [from, to, fallback] = measures[part];
  const end = frame.bones.has(to) && source.bones.has(to) ? to : fallback;
  const frameSize = measure(frame.bones, [from, end]);
  const sourceSize = measure(source.bones, [from, end]);
  const scale = frameSize && sourceSize ? frameSize / sourceSize : frame.height / source.height;

  // For each source bone, the matrix taking a point from where it sits on the
  // source robot to where it should sit on the frame: into the space of the
  // bone, or of its nearest ancestor the frame has a bone of the same name
  // for, scaled, and out of that frame bone. So where the frame has no foot
  // bone, the part's foot rides on its shin, where it was.
  const moves = bones.map((bone) => {
    let matched = bone;
    while (matched?.isBone && !frame.bones.has(matched.name)) matched = matched.parent;
    const target = matched?.isBone ? frame.bones.get(matched.name) : (frame.bones.get("mot_pelvis") ?? frame.mesh);
    const from = matched?.isBone ? matched : (source.bones.get("mot_pelvis") ?? bone);
    return pose(target)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(from.matrixWorld.clone().invert());
  });
  const turns = moves.map((move) => new THREE.Matrix3().getNormalMatrix(move));

  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const vertexCount = geometry.index ? geometry.index.count : position.count;
  const vertexAt = (i) => (geometry.index ? geometry.index.getX(i) : i);
  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: vertexCount, materialIndex: 0 }];
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const meshes = [];
  for (const group of groups) {
    const out = { position: [], normal: [], uv: [] };
    const end = Math.min(group.start + group.count, vertexCount);
    for (let i = group.start; i + 2 < end; i += 3) {
      const corners = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)];
      // A triangle goes with the part most of its corners belong to.
      const votes = corners.filter((v) => parts[dominant[v]] === part).length;
      if (votes < 2) continue;
      for (const v of corners) {
        const bone = dominant[v];
        // Where the vertex is drawn on the source robot, then moved over.
        p.fromBufferAttribute(position, v);
        mesh.applyBoneTransform(v, p);
        p.applyMatrix4(mesh.matrixWorld).applyMatrix4(moves[bone]);
        out.position.push(p.x, p.y, p.z);
        if (normal) {
          n.fromBufferAttribute(normal, v).transformDirection(mesh.matrixWorld);
          n.applyMatrix3(turns[bone]).normalize();
          out.normal.push(n.x, n.y, n.z);
        }
        if (uv) out.uv.push(uv.getX(v), uv.getY(v));
      }
    }
    if (!out.position.length) continue;
    let piece = new THREE.BufferGeometry();
    piece.setAttribute("position", new THREE.Float32BufferAttribute(out.position, 3));
    if (material) {
      // Cast in resin there's no texture to keep, and the game's low-poly
      // normals look faceted, so smooth them, keeping the sculpt's hard edges.
      piece = toCreasedNormals(piece, THREE.MathUtils.degToRad(60));
    } else {
      if (out.normal.length) piece.setAttribute("normal", new THREE.Float32BufferAttribute(out.normal, 3));
      else piece.computeVertexNormals();
      if (out.uv.length) piece.setAttribute("uv", new THREE.Float32BufferAttribute(out.uv, 2));
    }
    const result = new THREE.Mesh(piece, material ?? materials[group.materialIndex] ?? materials[0]);
    result.name = `${part}`;
    meshes.push(result);
  }
  return meshes;
}

// pick maps each slot to a prepared robot. The body robot is the frame.
// Every part is cast in `material` when one is given, and the figure stands
// on a thin base of it, like a bootleg resin toy; otherwise parts keep their
// robots' own textures. A resin figure still needs baking (see bake.js)
// before it's drawn.
// random varies the pose a little from figure to figure.
export function kitbash(pick, material, random = Math.random) {
  const group = new THREE.Group();
  const pose = stance(pick.body, random);
  for (const slot of slots) {
    for (const piece of transplant(pick[slot], pick.body, slot, material, pose)) group.add(piece);
  }
  if (material) {
    group.add(base(group, material));
  }
  // Where the frame's joints ended up, for pinning things to.
  group.userData.joints = new Map([...pick.body.bones].map(([name, bone]) => [name, new THREE.Vector3().setFromMatrixPosition(pose(bone))]));
  return group;
}

// A robot as it was, in its own textures, showing what it lent: the rest of
// it is drawn in whatever fade() makes of its materials.
export function donor(robot, part, fade) {
  const group = new THREE.Group();
  const asItWas = (bone) => bone.matrixWorld.clone();
  for (const slot of slots) {
    for (const piece of transplant(robot, robot, slot, null, asItWas)) {
      if (slot !== part) piece.material = fade(piece.material);
      group.add(piece);
    }
  }
  return group;
}

// A slab under the feet, sized to the legs' stance rather than wings or arms.
function base(figure, material) {
  const box = new THREE.Box3().setFromObject(figure);
  const feet = new THREE.Box3();
  for (const piece of figure.children) if (piece.name === "legs") feet.expandByObject(piece);
  if (feet.isEmpty()) feet.copy(box);
  const stance = feet.getSize(new THREE.Vector3());
  const height = (box.max.y - box.min.y) * 0.03;
  const width = Math.max(stance.x, stance.z) * 1.25;
  // Divided up so the feet's ambient occlusion has vertices to land on. Its
  // thickness is simply its height.
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, stance.z * 1.1 + height * 2, 32, 1, 32),
    material,
  );
  const slabThickness = new Float32Array(slab.geometry.attributes.position.count).fill(height);
  slab.geometry.setAttribute("resinThickness", new THREE.BufferAttribute(slabThickness, 1));
  slab.position.set((feet.min.x + feet.max.x) / 2, box.min.y - height / 2, (feet.min.z + feet.max.z) / 2);
  slab.name = "base";
  return slab;
}
