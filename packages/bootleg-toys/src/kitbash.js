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
  // How tall its head is, from the head's own vertices.
  const head = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let v = 0; v < dominant.length; v++) {
    if (partOfBone[dominant[v]] !== "head") continue;
    p.fromBufferAttribute(mesh.geometry.attributes.position, v);
    head.expandByPoint(mesh.applyBoneTransform(v, p).applyMatrix4(mesh.matrixWorld));
  }
  const headHeight = head.isEmpty() ? null : head.max.y - head.min.y;
  return { mesh, bones, height, shares, headHeight };
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
  // Knees too: without them a rig's "legs" are pods or treads.
  legs: ["mot_upleg_l", "mot_upleg_r", "mot_leg_l", "mot_leg_r"],
};
export const canLend = (robot, part) => robot.shares[part] >= 0.015 && needs[part].every((bone) => robot.bones.has(bone));

// A ready stance for the frame's skeleton: feet planted wide, one a little
// ahead of the other, upper arms down and out, forearms reaching forward a
// little below level. (Raised higher, to guard, they pointed straight at the
// camera and a long arm read as a fist floating over the chest.)
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
  ["arm", "forearm", [0.35, -0.9, 0.2]],
  ["forearm", "hand", [0.05, -0.25, 1]],
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

// Cut one part out of `source`, each vertex moved by move(bone) for the bone
// it follows most. Returns a mesh per material the part uses.
function transplant(source, part, material, move) {
  const { mesh } = source;
  const geometry = mesh.geometry;
  const bones = mesh.skeleton.bones;
  const dominant = dominantBones(mesh);
  const parts = bones.map(partOf);
  const moves = bones.map(move);
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
      // A corner that follows a bone of another part (where an arm meets the
      // chest, say) moves with the part instead, as its other corners do:
      // moved by its own bone, it would be pulled off to wherever that bone
      // goes, stretching the triangle into a long spike. (The body stays on
      // its own skeleton, so its corners can follow their own bones.)
      const lead = corners.find((v) => parts[dominant[v]] === part);
      for (const v of corners) {
        const bone = parts[dominant[v]] === part || part === "body" ? dominant[v] : dominant[lead];
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
//
// Each part is built like a kit part: it keeps its own robot's proportions,
// posed on its own skeleton, and is fitted to the frame at one socket (the
// neck for a head, each shoulder for an arm, each hip for a leg), scaled as
// one piece. A limb can't come apart inside itself, however differently its
// robot is built from the frame.
export function kitbash(pick, material, random = Math.random) {
  const group = new THREE.Group();
  const frame = pick.body;
  const framePose = stance(frame, random);
  const joints = new Map([...frame.bones].map(([name, bone]) => [name, at(framePose(bone))]));
  // Taken now: the borrowed arms bring their own collarbones' joints.
  const collarbones = collarboneLines(frame, joints);
  for (const slot of slots) {
    const source = pick[slot];
    const pose = slot === "body" ? framePose : stance(source, random);
    const fit = fitting(source, frame, slot, pose, joints);
    const move = (bone) => fit(bone).multiply(pose(bone)).multiply(bone.matrixWorld.clone().invert());
    for (const piece of transplant(source, slot, material, move)) group.add(piece);
    // Where the part's own joints ended up, for pinning things to.
    if (slot !== "body") {
      for (const [name, bone] of source.bones) if (partOf(bone) === slot) joints.set(name, at(fit(bone).multiply(pose(bone))));
    }
  }
  closeShoulders(group, joints, frame.height, collarbones);
  seatHead(group, joints, frame.height);
  seatLegs(group, joints, frame.height);
  for (const joint of ballJoints(group, joints, material, frame.height)) group.add(joint);
  if (material) {
    group.add(base(group, material));
  }
  group.userData.joints = joints;
  return group;
}

const at = (matrix) => new THREE.Vector3().setFromMatrixPosition(matrix);

// The socket each part fits the frame at, by side.
const sockets = { head: { "": "mot_head" }, arms: { l: "mot_arm_l", r: "mot_arm_r" }, legs: { l: "mot_upleg_l", r: "mot_upleg_r" } };

// Which side of the robot a bone's on, from its name or its ancestors'.
function sideOf(bone) {
  for (let b = bone; b?.isBone; b = b.parent) {
    const side = b.name.match(/_([lr])(?:_|$)/)?.[1];
    if (side) return side;
  }
  return "";
}

// How one part of `source`, posed by its own pose, is fitted to the frame:
// for each bone, the matrix scaling the part about its socket and moving it
// to the frame's socket on that side. The body is the frame, and stays put.
function fitting(source, frame, part, pose, joints) {
  if (part === "body") return () => new THREE.Matrix4();
  const scale = partScale(source, frame, part);
  const fits = {};
  for (const [side, name] of Object.entries(sockets[part])) {
    const from = at(pose(source.bones.get(name)));
    const to = joints.get(name);
    fits[side] = new THREE.Matrix4()
      .makeTranslation(to.x, to.y, to.z)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(new THREE.Matrix4().makeTranslation(-from.x, -from.y, -from.z));
  }
  return (bone) => (fits[sideOf(bone)] ?? fits.l ?? fits[""]).clone();
}

// One scale for the whole part: the frame's size against its robot's, nudged
// towards the frame's own length for the limb, so long limbs stay long, but
// within a fifth either way.
function partScale(source, frame, part) {
  const overall = frame.height / source.height;
  // A head, the size of the frame's own head: a squat robot's head is big
  // for its height, and scaled by height alone would loom.
  if (part === "head") {
    if (!frame.headHeight || !source.headHeight) return overall;
    return overall * THREE.MathUtils.clamp(frame.headHeight / source.headHeight / overall, 0.6, 1.4);
  }
  const own = measure(source.bones, measures[part]);
  const theirs = measure(frame.bones, measures[part]);
  if (!own || !theirs) return overall;
  return overall * THREE.MathUtils.clamp(theirs / own / overall, 0.8, 1.2);
}

// The head sits at the frame's neck, but a head built to sit low in its own
// collar can float above a frame's chest: if so, it's lowered onto it.
function seatHead(figure, joints, height) {
  const head = new THREE.Box3();
  for (const piece of figure.children) if (piece.name === "head") head.union(new THREE.Box3().setFromBufferAttribute(piece.geometry.attributes.position));
  if (head.isEmpty()) return;
  // The top of the chest under the head.
  let top = -Infinity;
  const p = new THREE.Vector3();
  for (const piece of figure.children) {
    if (piece.name !== "body") continue;
    const position = piece.geometry.attributes.position;
    for (let v = 0; v < position.count; v++) {
      p.fromBufferAttribute(position, v);
      if (p.x > head.min.x && p.x < head.max.x && p.z > head.min.z && p.z < head.max.z && p.y < head.min.y + height * 0.2) top = Math.max(top, p.y);
    }
  }
  const drop = head.min.y - top - height * 0.01;
  if (!Number.isFinite(drop) || drop <= 0) return;
  for (const piece of figure.children) {
    if (piece.name !== "head") continue;
    piece.geometry.translate(0, -drop, 0);
  }
  for (const [name, joint] of joints) if (/^mot_head/.test(name)) joint.y -= drop;
}

// A ball joint at each socket, as on a kit, so a part always connects to
// the body through it, however differently the two are shaped: each sized
// to reach both, within limits.
// The largest each may be, as a share of the figure's height.
const ballSockets = [
  ["mot_head", "head", 0.045],
  ["mot_arm_l", "arms", 0.04],
  ["mot_arm_r", "arms", 0.04],
  ["mot_upleg_l", "legs", 0.06],
  ["mot_upleg_r", "legs", 0.06],
];

function ballJoints(figure, joints, material, height) {
  const p = new THREE.Vector3();
  const centreX = joints.get("mot_pelvis").x;
  const sideOfPoint = (point) => Math.sign(point.x - centreX);
  // The nearest point of a part (of one side of it, for a pair) to a point.
  const nearest = (centre, name, side) => {
    let best = Infinity;
    const at = new THREE.Vector3();
    for (const piece of figure.children) {
      if (piece.name !== name) continue;
      const position = piece.geometry.attributes.position;
      for (let v = 0; v < position.count; v++) {
        p.fromBufferAttribute(position, v);
        if (side && sideOfPoint(p) !== side) continue;
        const d = p.distanceTo(centre);
        if (d < best) {
          best = d;
          at.copy(p);
        }
      }
    }
    return { distance: best, at };
  };
  const balls = [];
  for (const [socket, part, largest] of ballSockets) {
    const centre = joints.get(socket);
    if (!centre) continue;
    const side = socket.endsWith("_l") || socket.endsWith("_r") ? sideOfPoint(centre) || (socket.endsWith("_l") ? 1 : -1) : 0;
    const limit = height * largest;
    // Where the body is further than the largest ball reaches, the part and
    // its socket move towards it until it's within reach, rather than the
    // ball growing.
    const body = nearest(centre, "body", 0);
    if (Number.isFinite(body.distance) && body.distance > limit / 1.1) {
      const move = body.at.clone().sub(centre).multiplyScalar(1 - limit / 1.1 / body.distance);
      for (const piece of figure.children) {
        if (piece.name !== part) continue;
        const position = piece.geometry.attributes.position;
        for (let v = 0; v < position.count; v++) {
          p.fromBufferAttribute(position, v);
          if (side && sideOfPoint(p) !== side) continue;
          position.setXYZ(v, p.x + move.x, p.y + move.y, p.z + move.z);
        }
        position.needsUpdate = true;
      }
      for (const [name, joint] of joints) {
        if (name !== socket && partOfName(name) !== part) continue;
        if (side && sideOfPoint(joint) !== side) continue;
        joint.add(move);
      }
    }
    const reach = Math.max(nearest(centre, "body", 0).distance, nearest(centre, part, side).distance);
    const radius = THREE.MathUtils.clamp(reach * 1.1, height * 0.02, limit);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), material ?? new THREE.MeshStandardMaterial({ color: 0x888888 }));
    ball.geometry.translate(centre.x, centre.y, centre.z);
    ball.name = "joint";
    balls.push(ball);
  }
  return balls;
}

// The part a bone belongs to, by its name alone.
function partOfName(name) {
  if (/^mot_head/.test(name)) return "head";
  if (/^mot_(clavicle|shoulder|arm|forearm|hand)/.test(name)) return "arms";
  if (/^mot_(upleg|leg|foot|toe|heel)/.test(name)) return "legs";
  return "body";
}

// Legs hang from the frame's hips, but legs whose tops sit low in their own
// hips can hang short of a frame's: if there's a gap between the tops of the
// legs and the body above them, the legs are raised to close it.
function seatLegs(figure, joints, height) {
  const p = new THREE.Vector3();
  let gap = 0;
  for (const side of ["l", "r"]) {
    const hip = joints.get(`mot_upleg_${side}`);
    if (!hip) continue;
    const near = (point) => Math.abs(point.x - hip.x) < height * 0.06 && Math.abs(point.z - hip.z) < height * 0.06;
    let top = -Infinity;
    let bottom = Infinity;
    for (const piece of figure.children) {
      if (piece.name !== "legs" && piece.name !== "body") continue;
      const position = piece.geometry.attributes.position;
      for (let v = 0; v < position.count; v++) {
        p.fromBufferAttribute(position, v);
        if (!near(p)) continue;
        if (piece.name === "legs") top = Math.max(top, p.y);
        else if (p.y > hip.y - height * 0.15) bottom = Math.min(bottom, p.y);
      }
    }
    if (Number.isFinite(top) && Number.isFinite(bottom)) gap = Math.max(gap, bottom - top + height * 0.01);
  }
  if (gap <= 0) return;
  for (const piece of figure.children) if (piece.name === "legs") piece.geometry.translate(0, gap, 0);
  for (const [name, joint] of joints) if (/^mot_(upleg|leg|foot|toe|heel)/.test(name)) joint.y += gap;
}

// Which way each of the frame's collarbones runs, in its stance: from the
// shoulder socket back in towards the spine, along the bones between them
// (a clavicle, a shoulder bone or both). A frame whose upper arms hang
// straight off its spine or chest has none, and nor does one whose
// collarbone runs too steeply to slide an arm along.
function collarboneLines(frame, joints) {
  const lines = {};
  const centre = joints.get("mot_pelvis")?.x ?? 0;
  for (const side of ["l", "r"]) {
    const arm = frame.bones.get(`mot_arm_${side}`);
    if (!arm) continue;
    let root = arm;
    while (root.parent?.isBone && partOf(root.parent) === "arms") root = root.parent;
    const from = joints.get(arm.name);
    const to = joints.get(root.name);
    if (root === arm || !from || !to) continue;
    const line = to.clone().sub(from).normalize();
    // It has to run in towards the middle, and mostly across.
    if (Math.sign(line.x) !== Math.sign(centre - from.x) || Math.abs(line.x) < 0.35) continue;
    lines[side] = line;
  }
  return lines;
}

// A frame's shoulder joints sit where its own shoulders reach, often well out
// past its chest on big shoulder armour, which goes with its arms. Borrowed
// arms without such armour would hang in the air beside the chest, so each
// side's arm is slid in until it meets the chest, at shoulder height. It
// slides back along the frame's collarbone on that side, the way its own
// shoulder would come in, so it tucks into the shoulder line; with no
// collarbone to follow, it slides straight across.
function closeShoulders(figure, joints, height, collarbones = {}) {
  const shoulder = joints.get("mot_arm_l");
  const pelvis = joints.get("mot_pelvis");
  if (!shoulder || !pelvis) return;
  const centre = pelvis.x;
  const band = height * 0.08;
  const p = new THREE.Vector3();
  const each = (name, visit) => {
    for (const piece of figure.children) {
      if (piece.name !== name) continue;
      const position = piece.geometry.attributes.position;
      for (let v = 0; v < position.count; v++) visit(p.fromBufferAttribute(position, v), position, v);
    }
  };
  // How far out the chest reaches, either side, at shoulder height.
  const chest = { l: 0, r: 0 };
  each("body", (point) => {
    if (Math.abs(point.y - shoulder.y) > band) return;
    const side = point.x > centre ? "l" : "r";
    chest[side] = Math.max(chest[side], Math.abs(point.x - centre));
  });
  // Where each arm's inner edge is, at the top of the arm (some arms start
  // a little below the shoulder joint).
  const arm = { l: Infinity, r: Infinity };
  each("arms", (point) => {
    if (point.y > shoulder.y + band || point.y < shoulder.y - band * 2.5) return;
    const side = point.x > centre ? "l" : "r";
    arm[side] = Math.min(arm[side], Math.abs(point.x - centre));
  });
  // The gap is measured across; the slide covers it across, along the
  // collarbone where there is one.
  const shift = {};
  for (const side of ["l", "r"]) {
    const gap = arm[side] - chest[side] - height * 0.01;
    if (!chest[side] || !Number.isFinite(gap) || gap <= 0) continue;
    const line = collarbones[side];
    shift[side] = line ? line.clone().multiplyScalar(gap / Math.abs(line.x)) : new THREE.Vector3(gap * (side === "l" ? -1 : 1), 0, 0);
  }
  if (!shift.l && !shift.r) return;
  // Sorted by side before anything moves.
  const sideOf = (x) => (x > centre ? "l" : "r");
  each("arms", (point, position, v) => {
    const move = shift[sideOf(point.x)];
    if (move) position.setXYZ(v, point.x + move.x, point.y + move.y, point.z + move.z);
  });
  for (const piece of figure.children) {
    if (piece.name !== "arms") continue;
    piece.geometry.attributes.position.needsUpdate = true;
    piece.geometry.computeBoundingBox();
  }
  // The arms' joints move with them.
  for (const [name, joint] of joints) {
    if (!/^mot_(?:clavicle|shoulder|arm|forearm|hand)\w*_([lr])$/.test(name)) continue;
    const move = shift[sideOf(joint.x)];
    if (move) joint.add(move);
  }
}

// A robot as it was, in its own textures, showing what it lent: the rest of
// it is drawn in whatever fade() makes of its materials.
export function donor(robot, part, fade) {
  const group = new THREE.Group();
  const asItWas = () => new THREE.Matrix4();
  for (const slot of slots) {
    for (const piece of transplant(robot, slot, null, asItWas)) {
      if (slot !== part) piece.material = fade(piece.material);
      group.add(piece);
    }
  }
  return group;
}

// A round stand under the feet, sized to the legs' stance rather than wings
// or arms: an ellipse round the feet with a margin, its rim rounded off.
function base(figure, material) {
  const box = new THREE.Box3().setFromObject(figure);
  const feet = new THREE.Box3();
  for (const piece of figure.children) if (piece.name === "legs") feet.expandByObject(piece);
  if (feet.isEmpty()) feet.copy(box);
  const stance = feet.getSize(new THREE.Vector3());
  const height = (box.max.y - box.min.y) * 0.03;
  // An ellipse through the corners of the feet's footprint, and a little out.
  const across = (stance.x / 2) * Math.SQRT2 * 1.1 + height;
  const deep = (stance.z / 2) * Math.SQRT2 * 1.1 + height;
  const radius = Math.max(across, deep);
  // A disc, its rim rounded with a quarter circle top and bottom, lathed in
  // enough segments for the feet's ambient occlusion to have vertices to
  // land on, then squashed into the ellipse.
  const bevel = height * 0.45;
  const profile = [new THREE.Vector2(0, -height / 2)];
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    profile.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, -height / 2 + bevel + Math.sin(a) * bevel));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    profile.push(new THREE.Vector2(radius - bevel + Math.cos(a) * bevel, height / 2 - bevel + Math.sin(a) * bevel));
  }
  for (let r = radius - bevel; r > 0; r -= radius / 16) profile.push(new THREE.Vector2(r, height / 2));
  profile.push(new THREE.Vector2(0, height / 2));
  const geometry = new THREE.LatheGeometry(profile, 64);
  geometry.scale(across / radius, 1, deep / radius);
  geometry.computeVertexNormals();
  const slab = new THREE.Mesh(geometry, material);
  // Its thickness is simply its height.
  const slabThickness = new Float32Array(slab.geometry.attributes.position.count).fill(height);
  slab.geometry.setAttribute("resinThickness", new THREE.BufferAttribute(slabThickness, 1));
  slab.position.set((feet.min.x + feet.max.x) / 2, box.min.y - height / 2, (feet.min.z + feet.max.z) / 2);
  slab.name = "base";
  return slab;
}
