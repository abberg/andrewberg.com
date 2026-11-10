import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crownMeshes, fruitTrees } from './foliage';
import { CAMERA_GROUPS, EAST_LAWN, lawnSouth, MOATS_FROM, POOLS, WEST_LAWN } from './level';
import { painted } from './look';
import { type Reach, type Robot, STOOP } from './robot';

// Fruit for the fish, first step: the garden's small trees bear orange
// fruit, hanging under and round their crowns. Walking into a trunk shakes
// the tree and some drop: one or two at a walk, more at a run, flung wider,
// so those are likelier to roll off into the water and be lost. What lands
// on the grass lies there.
//
// Second step: picking by hand, the main way to gather it. Whatever fruit is
// within the robot's reach, on the tree or on the ground, shows itself by
// swelling a little, and E picks it: the robot stops, reaches for it (bowing
// and bending its knees for one on the ground), and tosses it up onto its
// shoulders, where it carries up to five. The highest fruit is out of reach
// and has to be shaken down. Fruit lying on the ground is squashed if it's
// trodden on.

export const fruit = {
  // On each tree, and how big (m across).
  each: 9,
  size: 0.34,
  // How close to a trunk counts as walking into it (m, between middles),
  // and how long a tree's left alone after a shake (s). It has to be
  // stepped back from, too, before it can be shaken again.
  bump: 1.45,
  rest: 1.6,
  // How long a shaken crown wobbles (s) and how far (m, at a run).
  wobble: 1.3,
  sway: 0.28,
  // How many it carries, how long an arm is from shoulder to grip (m), and
  // the nearest it can pick (m, from the shoulder).
  carried: 5,
  arm: 2.4,
  near: 0.7,
  // A pick, in seconds: reaching out, then drawing back while the fruit's
  // tossed up onto the shoulders. One on the ground takes longer.
  out: 0.6,
  back: 0.7,
  stooping: 1.5,
  // How near a foot comes to squash one (m).
  tread: 0.3,
};
// Where the carried fruit sits, in the upper body's own space (x across,
// y up, z back): along the tops of the shoulders, and one behind the head.
const SLOTS: [number, number, number][] = [[-0.5, 1.44, 0.02], [0.5, 1.44, 0.02], [-0.8, 1.37, 0.02], [0.8, 1.37, 0.02], [0, 1.44, 0.34]];

const GRAVITY = 9.81;
type Tree = (typeof fruitTrees)[number] & { shaken: number, strength: number, way: THREE.Vector2, rested: number, left: boolean, crowns: THREE.Matrix4[] };
type Fruit = {
  tree: Tree, home: THREE.Vector3, at: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3, turn: THREE.Quaternion,
  state: 'hanging' | 'falling' | 'lying' | 'sinking' | 'gone' | 'held' | 'tossed' | 'carried' | 'squashed', scale: number, wait: number, slot: number,
};

let mesh: THREE.InstancedMesh | undefined, world: RAPIER.World;
const trees: Tree[] = [], fruits: Fruit[] = [];
let s = 6151;
const random = () => (s = (s * 16807) % 2147483647) / 2147483647;

// One fruit, a metre across: a ball a little flattened, dimpled at the top
// under a small green cap of sepals. The material's colour is the fruit's,
// so the cap's own is given as what to multiply it by.
function fruitGeometry() {
  const ball = new THREE.SphereGeometry(0.5, 14, 10).scale(1, 0.88, 1).toNonIndexed();
  const cap = new THREE.ConeGeometry(0.2, 0.09, 6).translate(0, 0.46, 0).toNonIndexed();
  const tint = (geometry: THREE.BufferGeometry, r: number, g: number, b: number) => {
    const count = geometry.getAttribute('position').count, colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
    return geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3)).deleteAttribute('uv');
  };
  return mergeGeometries([tint(ball, 1, 1, 1), tint(cap, 0.3, 0.9, 0.9)])!;
}

// Whether a point on the ground is water: the two pools, and the moats
// beyond the lawn's edges.
const overWater = (x: number, z: number) => POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 5.5)
  || z > lawnSouth(x) || (z > MOATS_FROM && (x < WEST_LAWN || x > EAST_LAWN));

const down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
// The ground (or stone) under a point, from just above it.
const groundUnder = (at: THREE.Vector3) => {
  down.origin = { x: at.x, y: at.y + 0.5, z: at.z };
  const hit = world.castRay(down, 40, true, undefined, CAMERA_GROUPS);
  return hit ? at.y + 0.5 - hit.timeOfImpact : -Infinity;
};

export function createFruit(scene: THREE.Scene, physics: RAPIER.World) {
  world = physics;
  const [leaves] = crownMeshes;
  if (!leaves) return;
  const matrix = new THREE.Matrix4(), centre = new THREE.Vector3(), turn = new THREE.Quaternion(), size = new THREE.Vector3();
  for (const planted of fruitTrees) {
    const tree: Tree = { ...planted, shaken: Infinity, strength: 0, way: new THREE.Vector2(), rested: 0, left: true, crowns: [] };
    trees.push(tree);
    // Its crown's balls, as they stand: where and how big.
    const balls: { centre: THREE.Vector3, across: number }[] = [];
    for (let k = 0; k < tree.count; k++) {
      leaves.getMatrixAt(tree.first + k, matrix);
      tree.crowns.push(matrix.clone());
      matrix.decompose(centre, turn, size);
      balls.push({ centre: centre.clone(), across: size.x });
    }
    // Hung on the balls' sides and undersides, clear of the trunk, each just
    // proud of the leaves and not buried in a neighbouring ball.
    let hung = 0;
    for (let tries = 0; tries < 400 && hung < fruit.each; tries++) {
      const ball = balls[Math.floor(random() * balls.length)];
      const a = random() * Math.PI * 2, up = -0.75 + random() * 0.9, flat = Math.sqrt(Math.max(0, 1 - up * up));
      const out = new THREE.Vector3(Math.cos(a) * flat, up, Math.sin(a) * flat);
      const home = ball.centre.clone().add(new THREE.Vector3(out.x * ball.across * 0.5, out.y * ball.across * 0.4, out.z * ball.across * 0.5));
      if (Math.hypot(home.x - tree.x, home.z - tree.z) < 0.9) continue;
      if (balls.some(other => other !== ball && new THREE.Vector3().subVectors(home, other.centre).divide(new THREE.Vector3(1, 0.8, 1)).length() < other.across * 0.42)) continue;
      if (fruits.some(f => f.tree === tree && f.home.distanceTo(home) < 0.9)) continue;
      hung++;
      fruits.push({
        tree, home, at: home.clone(), velocity: new THREE.Vector3(), spin: new THREE.Vector3(),
        turn: new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.5, random() * 6, (random() - 0.5) * 0.5)),
        state: 'hanging', scale: fruit.size * (0.85 + random() * 0.3), wait: 0, slot: -1,
      });
    }
  }
  mesh = new THREE.InstancedMesh(fruitGeometry(), painted([0xf08a2c, 0xb04a34], { vertexColors: true }), fruits.length);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  place();
}

// Each fruit's place in the mesh.
const placing = new THREE.Matrix4(), sized = new THREE.Vector3();
let pulse = 0;
function place() {
  if (!mesh) return;
  fruits.forEach((f, i) => {
    if (f.state === 'gone') sized.setScalar(0);
    // Trodden flat.
    else if (f.state === 'squashed') sized.set(f.scale * 1.7, f.scale * 0.12, f.scale * 1.7);
    // Within reach: swelling and settling.
    else sized.setScalar(f.scale * (f === within?.fruit && !pick ? 1.12 + 0.1 * Math.sin(pulse * 7) : 1));
    mesh!.setMatrixAt(i, placing.compose(f.at, f.turn, sized));
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// Picking. What's within reach just now (the fruit, which arm, and how far
// it has to stoop for it), and the pick under way: how long it's been going
// and where the fruit was when it left the hand.
type Within = { fruit: Fruit, arm: 0 | 1, stoop: number };
let within: Within | null = null;
let pick: (Within & { t: number, reach: Reach, from: THREE.Vector3, grabbed: boolean }) | null = null;
const carried = () => fruits.filter(f => f.state === 'carried' || f.state === 'tossed' || f.state === 'held');
const shoulder = new THREE.Vector3(), toFruit = new THREE.Vector3(), slotAt = new THREE.Vector3(), foot = new THREE.Vector3();
// The fruit nearest to hand, if any: with the least stooping, then the
// nearest. An arm reaches what's on its own side, up to straight ahead;
// what's on the ground has to be in front, since it's bowed down to.
function reachable(feet: THREE.Vector3, yaw: number): Within | null {
  let best: Within | null = null, least = Infinity;
  const ahead = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  for (const f of fruits) {
    if (f.state !== 'hanging' && f.state !== 'lying') continue;
    const dx = f.at.x - feet.x, dz = f.at.z - feet.z;
    if (dx * dx + dz * dz > 16 || Math.abs(f.at.y - feet.y - 3) > 4) continue;
    const forward = dx * ahead.x + dz * ahead.z, across = dx * right.x + dz * right.z;
    const arm = across < 0 ? 0 : 1;
    for (let stoop = 0; stoop <= 1.001; stoop += 0.125) {
      if (stoop > 0 && (f.state !== 'lying' || forward < 0.6)) break;
      // Where the shoulder is, stooped that far: the waist lower, the body
      // bowed forward about it.
      const bow = STOOP.bow * stoop, up = feet.y + 2.05 - STOOP.hips * stoop + 1.16 * Math.cos(bow), out = 1.16 * Math.sin(bow) + 0.04;
      const far = Math.hypot(forward - out, across - (arm ? 0.68 : -0.68), f.at.y - up);
      if (far > fruit.arm || far < fruit.near) continue;
      // Not behind its back.
      if (forward < -0.5 && f.at.y - up < 1) break;
      const score = stoop * 10 + far;
      if (score < least) { least = score; best = { fruit: f, arm, stoop }; }
      break;
    }
  }
  return best;
}

// Before the robot's posed: what's within reach, and the pick under way, if
// E started one or one's going. Gives the reach for its arm (player.animate).
export function updatePick(delta: number, feet: THREE.Vector3, yaw: number, pace: number, wanted: boolean, robot: Robot): Reach | null {
  if (!mesh) return null;
  pulse += delta;
  if (!pick) {
    const full = carried().length >= fruit.carried;
    within = full || pace > 0.5 ? null : reachable(feet, yaw);
    if (!wanted || !within) return null;
    pick = { ...within, t: 0, from: new THREE.Vector3(), grabbed: false, reach: { arm: within.arm, goal: within.fruit.at.clone(), share: 0, stoop: 0 } };
  }
  pick.t += delta;
  const out = pick.stoop > 0 ? fruit.out * fruit.stooping : fruit.out, back = pick.stoop > 0 ? fruit.back * fruit.stooping : fruit.back;
  const smooth = THREE.MathUtils.smootherstep;
  if (pick.t < out) {
    // Reaching (the fruit may be swaying in a shaken tree).
    pick.reach.goal.copy(pick.fruit.at);
    pick.reach.share = smooth(pick.t, 0, out * 0.9);
    pick.reach.stoop = pick.stoop * smooth(pick.t, 0, out * 0.75);
  } else {
    if (!pick.grabbed) {
      pick.grabbed = true;
      pick.fruit.state = 'held';
      pick.fruit.slot = [0, 1, 2, 3, 4].find(k => !fruits.some(f => f.slot === k))!;
    }
    // Drawing back, straightening up.
    const t = (pick.t - out) / back;
    pick.reach.share = 1 - smooth(t, 0.15, 1);
    pick.reach.stoop = pick.stoop * (1 - smooth(t, 0.1, 0.9));
    if (t >= 1) { pick = null; return null; }
  }
  return pick.reach;
}
// Whether it's busy picking: it stands still for it.
export const picking = () => pick !== null;

// How far a shaken tree's crown is off its place just now: a wobble along
// the way it was pushed, dying away.
const offset = new THREE.Vector3();
const wobble = (tree: Tree) => {
  const t = tree.shaken / fruit.wobble;
  if (t >= 1) return offset.set(0, 0, 0);
  const swing = Math.sin(tree.shaken * 13) * (1 - t) ** 2 * fruit.sway * tree.strength;
  return offset.set(tree.way.x * swing, -Math.abs(swing) * 0.15, tree.way.y * swing);
};

// feet: where the robot stands; yaw: which way it faces; pace: how fast
// it's going, as a share of a run.
export function updateFruit(delta: number, feet: THREE.Vector3, yaw: number, pace: number, robot: Robot) {
  if (!mesh || delta <= 0) return;
  // Always placed: what's within reach swells and settles.
  let moved = true;
  // In the hand until it's drawn back a little, then tossed up in an arc
  // onto the shoulders, where it rides.
  const body = robot.spine;
  for (const f of fruits) {
    if (f.slot < 0) continue;
    slotAt.set(...SLOTS[f.slot]).applyMatrix4(body);
    if (f.state === 'held' && pick?.fruit === f) {
      robot.grip(pick.arm, f.at);
      const back = (pick.stoop > 0 ? fruit.back * fruit.stooping : fruit.back), t = (pick.t - (pick.stoop > 0 ? fruit.out * fruit.stooping : fruit.out)) / back;
      if (t > 0.3) { f.state = 'tossed'; f.wait = 0; pick.from.copy(f.at); f.velocity.copy(f.at); }
    } else if (f.state === 'held') {
      f.state = 'tossed'; f.wait = 0; f.velocity.copy(f.at);
    } else if (f.state === 'tossed') {
      // (velocity keeps where it left the hand.)
      f.wait += delta / 0.5;
      const t = Math.min(1, f.wait);
      f.at.lerpVectors(f.velocity, slotAt, t).y += Math.sin(t * Math.PI) * 0.9;
      f.turn.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), delta * 9));
      if (t >= 1) { f.state = 'carried'; f.velocity.set(0, 0, 0); }
    } else if (f.state === 'carried') {
      f.at.copy(slotAt);
    }
  }
  // Trodden on: walked over while it's lying there, under the robot's
  // body or under either foot as it comes down.
  if (pace > 0.03 && !pick) {
    const down = ([0, 1] as const).map(k => robot.foot(k, foot) ? foot.clone() : null);
    for (const f of fruits) {
      if (f.state !== 'lying' || Math.abs(f.at.y - feet.y) > 0.6) continue;
      const under = Math.hypot(f.at.x - feet.x, f.at.z - feet.z) < fruit.tread * 1.5
        || down.some(at => at && Math.hypot(f.at.x - at.x, f.at.z - at.z) < fruit.tread);
      if (!under) continue;
      f.state = 'squashed';
      f.at.y -= f.scale * 0.4;
      f.turn.identity();
    }
  }
  const shifted = new THREE.Matrix4();
  for (const tree of trees) {
    tree.rested += delta;
    // Walked into: close to the trunk, heading at it.
    const dx = tree.x - feet.x, dz = tree.z - feet.z, far = Math.hypot(dx, dz);
    // Once for each time it's walked into: leaning on the trunk shakes
    // nothing more down until it has stepped back from it.
    if (far > fruit.bump + 0.6) tree.left = true;
    if (tree.left && tree.rested > fruit.rest && pace > 0.12 && far < fruit.bump && Math.abs(feet.y) < 1.5 && (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / far > 0.35) {
      tree.rested = 0;
      tree.left = false;
      tree.shaken = 0;
      tree.strength = THREE.MathUtils.clamp(pace, 0.35, 1);
      tree.way.set(dx / far, dz / far);
      // One or two at a walk, up to five at a run.
      const hanging = fruits.filter(f => f.tree === tree && f.state === 'hanging');
      let drop = Math.min(hanging.length, pace < 0.6 ? 1 + Math.floor(random() * 2) : 3 + Math.floor(random() * 3));
      while (drop-- > 0) {
        const f = hanging.splice(Math.floor(random() * hanging.length), 1)[0];
        f.state = 'falling';
        // Not all at once.
        f.wait = 0.08 + random() * 0.5;
        // Out from the trunk and along the push, harder the harder the bump.
        const out = new THREE.Vector2(f.home.x - tree.x, f.home.z - tree.z).normalize(), fling = tree.strength * (0.4 + random() * 2.2);
        f.velocity.set(out.x * fling * 0.6 + tree.way.x * fling * 0.5, 0, out.y * fling * 0.6 + tree.way.y * fling * 0.5);
        f.spin.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(8);
      }
    }
    if (tree.shaken < fruit.wobble) {
      tree.shaken += delta;
      const by = wobble(tree);
      // The crown's balls, leaves and cores alike, each a little out of
      // step with the next so the crown shivers rather than slides.
      tree.crowns.forEach((home, k) => {
        shifted.copy(home);
        const share = 0.7 + 0.3 * Math.sin(k * 2.4 + tree.shaken * 9);
        shifted.elements[12] += by.x * share;
        shifted.elements[13] += by.y * share;
        shifted.elements[14] += by.z * share;
        for (const crown of crownMeshes) crown.setMatrixAt(tree.first + k, shifted);
      });
      for (const crown of crownMeshes) crown.instanceMatrix.needsUpdate = true;
      for (const f of fruits) if (f.tree === tree && (f.state === 'hanging' || f.wait > 0)) f.at.copy(f.home).add(by);
      moved = true;
    }
  }
  const spun = new THREE.Quaternion(), axis = new THREE.Vector3();
  for (const f of fruits) {
    if (f.state === 'sinking') {
      // Under, slowing, and gone.
      f.at.y += f.velocity.y * delta;
      f.velocity.y *= Math.exp(-delta * 3);
      f.wait += delta;
      if (f.wait > 2.5) f.state = 'gone';
      moved = true;
      continue;
    }
    if (f.state !== 'falling') continue;
    moved = true;
    if (f.wait > 0) { f.wait -= delta; continue; }
    f.velocity.y -= GRAVITY * delta;
    f.at.addScaledVector(f.velocity, delta);
    const turned = f.spin.length() * delta;
    if (turned > 0) f.turn.premultiply(spun.setFromAxisAngle(axis.copy(f.spin).normalize(), turned));
    const ground = groundUnder(f.at), radius = f.scale * 0.44;
    if (f.at.y - radius > ground) continue;
    if (overWater(f.at.x, f.at.z) && ground < 0.05) {
      f.state = 'sinking';
      f.wait = 0;
      f.velocity.set(0, -1.2, 0);
      continue;
    }
    f.at.y = ground + radius;
    // A bounce or two, then a short roll to rest.
    if (f.velocity.y < -1.2) {
      f.velocity.y *= -0.32;
      f.velocity.x *= 0.7;
      f.velocity.z *= 0.7;
      f.spin.multiplyScalar(0.6);
    } else {
      f.velocity.y = 0;
      const slow = Math.exp(-delta * 4);
      f.velocity.x *= slow;
      f.velocity.z *= slow;
      // Rolling: turning about the axis across the way it's going.
      f.spin.set(f.velocity.z, 0, -f.velocity.x).divideScalar(radius);
      if (Math.hypot(f.velocity.x, f.velocity.z) < 0.08) {
        f.state = 'lying';
        f.velocity.set(0, 0, 0);
      }
    }
  }
  if (moved) place();
}

// For a later step and for testing: how many hang, lie on the ground, and
// have been lost to the water.
export const fruitCount = () => ({
  hanging: fruits.filter(f => f.state === 'hanging').length,
  falling: fruits.filter(f => f.state === 'falling').length,
  lying: fruits.filter(f => f.state === 'lying').length,
  lost: fruits.filter(f => f.state === 'sinking' || f.state === 'gone').length,
  squashed: fruits.filter(f => f.state === 'squashed').length,
  carried: carried().length,
  within: within && { state: within.fruit.state, stoop: within.stoop, arm: within.arm },
  picking: pick !== null,
  ground: fruits.filter(f => f.state === 'lying').map(f => [f.at.x, f.at.z]),
  trees: trees.map(tree => ({ x: tree.x, z: tree.z, tall: tree.tall, hanging: fruits.filter(f => f.tree === tree && f.state === 'hanging').length })),
});
