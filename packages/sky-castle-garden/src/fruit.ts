import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { crownMeshes, fruitTrees } from './foliage';
import { CAMERA_GROUPS, EAST_LAWN, lawnSouth, MOATS_FROM, POOLS, WEST_LAWN } from './level';
import { painted } from './look';
import { type Reach, type Robot, STOOP } from './robot';
import { burst } from './slices';
import { play } from './sounds';

// Fruit for the fish, first step: the garden's small trees bear orange
// fruit, hanging under and round their crowns. Walking into a trunk shakes
// the tree and some drop: one or two at a walk, more at a run, flung wider,
// so those are likelier to roll off into the water and be lost. What lands
// on the grass lies there.
//
// Second step: picking by hand, the main way to gather it. Whatever fruit is
// within the robot's reach, on the tree or on the ground, shows itself by
// swelling a little, and E picks it: the robot stops, reaches for it with
// its right hand (bowing and bending its knees for one on the ground) and
// sets it in the crook of its left arm, bent across its body as a bowl,
// where it carries up to five. Carrying, it only walks. The highest fruit
// is out of reach and has to be shaken down. Fruit lying on the ground is
// squashed if it's trodden on.
//
// Third step: feeding the fish. At the edge of a moat, with fruit in its arm
// and none within reach to pick, E throws one: it turns to the water, takes
// a fruit from the bowl, swings it back and tosses it underarm out over the
// moat, where it comes apart into slices for the fish (slices.ts).
//
// The trees bear again: every so often each grows a new fruit where one has
// gone, small at first, ripe (and ready to pick or shake down) a while later.

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
  arm: 2.3,
  near: 0.7,
  // A pick, in seconds: reaching out, bringing the fruit to the left arm,
  // and the hand going back to its side. One on the ground takes longer.
  out: 0.75,
  bring: 0.75,
  back: 0.5,
  stooping: 1.35,
  // How long the left arm takes to come up as a bowl, or go down (s).
  cradle: 0.45,
  // How near a foot comes to squash one (m).
  tread: 0.3,
  // Throwing. How near the water's edge it has to stand (m) and how far
  // out the fruit's thrown (m beyond the edge); the throw in seconds: taking
  // a fruit from the bowl, swinging it back, the toss, and the arm coming
  // down again; how long the fruit's in the air and how soon it comes apart.
  bank: 3.2,
  far: 3.6,
  take: 0.6,
  wind: 0.55,
  swing: 0.28,
  follow: 0.6,
  flight: 1.25,
  apart: 0.4,
  // Growing back: a tree starts a new fruit this often (s) while it has
  // any missing, and it takes this long to ripen (s). One that's been
  // squashed lies there this long before it's gone (s).
  regrow: 40,
  ripen: 20,
  rots: 45,
};
// Where the carried fruit sits along the left arm, from shoulder (0) to
// hand (1), how far above it and how far back towards the chest (m): four
// in a row along the bottom of the bowl and one on top.
const SLOTS: [number, number, number][] = [[0.62, 0.21, 0.06], [0.78, 0.21, 0.06], [0.46, 0.22, 0.08], [0.94, 0.21, 0.04], [0.7, 0.46, 0.14]];

const GRAVITY = 9.81;
type Tree = (typeof fruitTrees)[number] & { shaken: number, strength: number, way: THREE.Vector2, rested: number, left: boolean, crowns: THREE.Matrix4[], bears: number };
type Fruit = {
  tree: Tree, home: THREE.Vector3, at: THREE.Vector3, velocity: THREE.Vector3, spin: THREE.Vector3, turn: THREE.Quaternion,
  state: 'hanging' | 'falling' | 'lying' | 'sinking' | 'gone' | 'held' | 'carried' | 'squashed' | 'thrown' | 'nibbled', scale: number, wait: number, slot: number,
  // How far it's grown, 0 to 1: ripe at 1.
  grown: number,
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
export const overWater = (x: number, z: number) => POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 5.5)
  // (The grass landing before the arch reaches out into the south moat.)
  || (z > lawnSouth(x) && !(x > -4.5 && x < 4.6)) || (z > MOATS_FROM && (x < WEST_LAWN || x > EAST_LAWN));

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
    const tree: Tree = { ...planted, shaken: Infinity, strength: 0, way: new THREE.Vector2(), rested: 0, left: true, crowns: [], bears: 0 };
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
        state: 'hanging', scale: fruit.size * (0.85 + random() * 0.3), wait: 0, slot: -1, grown: 1,
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
    else sized.setScalar(f.scale * (0.15 + 0.85 * f.grown) * (f === within?.fruit && !pick ? 1.12 + 0.1 * Math.sin(pulse * 7) : 1));
    mesh!.setMatrixAt(i, placing.compose(f.at, f.turn, sized));
  });
  mesh.instanceMatrix.needsUpdate = true;
}

// Picking. What's within reach just now (the fruit, which arm, and how far
// it has to stoop for it), and the pick under way: how long it's been going
// and where the fruit was when it left the hand.
type Within = { fruit: Fruit, stoop: number, facing: number | null };
let within: Within | null = null;
let pick: (Within & { t: number, reach: Reach, from: THREE.Vector3, grabbed: boolean }) | null = null;
let cradle = 0;
// A throw under way: which way to face first and where the fruit's to land,
// the fruit, and how far through it is.
let toss: { facing: number | null, target: THREE.Vector3, fruit: Fruit, t: number, reach: Reach, from: THREE.Vector3, taken: boolean, thrown: boolean } | null = null;
// Standing at the edge of a moat (not the pools: the fish are in the moats):
// which way the water is, and a point out over it to throw to.
function bank(feet: THREE.Vector3): { yaw: number, target: THREE.Vector3 } | null {
  if (Math.abs(feet.y) > 0.6) return null;
  let nx = 0, nz = 0, gap = Infinity;
  if (feet.z > MOATS_FROM + 1 && feet.x - WEST_LAWN < gap) { gap = feet.x - WEST_LAWN; nx = -1; nz = 0; }
  if (feet.z > MOATS_FROM + 1 && EAST_LAWN - feet.x < gap) { gap = EAST_LAWN - feet.x; nx = 1; nz = 0; }
  // On the landing before the arch, with the south moat to either side.
  if (feet.x > -4.5 && feet.x < 4.6 && feet.z > lawnSouth(4.5) + 0.2 && feet.z < 50.4) {
    if (feet.x + 4.5 < gap) { gap = feet.x + 4.5; nx = -1; nz = 0; }
    if (4.6 - feet.x < gap) { gap = 4.6 - feet.x; nx = 1; nz = 0; }
  }
  // The south moat, either side of it.
  else if (lawnSouth(feet.x) - feet.z < gap) {
    gap = lawnSouth(feet.x) - feet.z;
    const slope = feet.x / 149, l = Math.hypot(slope, 1);
    nx = -slope / l; nz = 1 / l;
  }
  // (Anywhere on the landing will do: it's narrow, with water both sides.)
  const landing = nz === 0 && Math.abs(feet.x) < 4.6;
  if (gap > (landing ? 5 : fruit.bank) || gap < 0) return null;
  const out = gap + fruit.far, target = new THREE.Vector3(feet.x + nx * out, -0.1, feet.z + nz * out);
  // From the lawn beside the landing, clear of the landing's side.
  if (!landing && Math.abs(target.x) < 7.5 && target.z > lawnSouth(target.x)) target.x = Math.sign(feet.x || 1) * 7.5;
  return { yaw: Math.atan2(-(target.x - feet.x), -(target.z - feet.z)), target };
}
// A point by the robot: so far to its right, ahead of it and above its feet.
const beside = (feet: THREE.Vector3, yaw: number, right: number, ahead: number, up: number, out: THREE.Vector3) =>
  out.set(feet.x + Math.cos(yaw) * right - Math.sin(yaw) * ahead, feet.y + up, feet.z - Math.sin(yaw) * right - Math.cos(yaw) * ahead);
const wound = new THREE.Vector3(), released = new THREE.Vector3();
function throwing(delta: number, feet: THREE.Vector3, yaw: number, robot: Robot): Reach | null {
  const now = toss!;
  if (now.facing !== null) {
    const off = THREE.MathUtils.euclideanModulo(now.facing - yaw + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(off) > 0.06) return now.reach;
    now.facing = null;
  }
  now.t += delta;
  const smooth = THREE.MathUtils.smootherstep, { take, wind, swing, follow } = fruit;
  beside(feet, yaw, 0.95, -0.9, 1.5, wound);
  beside(feet, yaw, 0.5, 1.9, 3.5, released);
  now.reach.stoop = 0;
  if (now.t < take) {
    // Its right hand to the fruit in the bowl.
    slotOf(robot, yaw, now.fruit.slot, now.reach.goal);
    now.reach.share = smooth(now.t, 0, take * 0.95);
  } else if (now.t < take + wind) {
    if (!now.taken) {
      now.taken = true;
      now.from.copy(now.reach.goal);
      now.fruit.state = 'held';
      now.fruit.slot = -1;
    }
    // Drawn back and down beside it.
    now.reach.goal.lerpVectors(now.from, wound, smooth((now.t - take) / wind, 0, 1));
    now.reach.share = 1;
  } else if (now.t < take + wind + swing) {
    // Swung forward and up, low past its side.
    const u = (now.t - take - wind) / swing;
    now.reach.goal.lerpVectors(wound, released, u * u * (3 - 2 * u)).y -= Math.sin(u * Math.PI) * 0.7;
    now.reach.share = 1;
  } else {
    if (!now.thrown) {
      // Let go: thrown to come down on its mark.
      now.thrown = true;
      const f = now.fruit;
      robot.grip(1, f.at);
      f.state = 'thrown';
      play('swish');
      f.wait = 0;
      f.velocity.subVectors(now.target, f.at).divideScalar(fruit.flight);
      f.velocity.y += 0.5 * GRAVITY * fruit.flight;
      f.spin.set(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(10);
    }
    // The arm follows through and comes down.
    const u = (now.t - take - wind - swing) / follow;
    now.reach.goal.copy(released);
    now.reach.share = 1 - smooth(u, 0.15, 1);
    if (u >= 1) { toss = null; return null; }
  }
  return now.reach;
}
const carried = () => fruits.filter(f => f.state === 'carried' || f.state === 'held');
const slotAt = new THREE.Vector3(), foot = new THREE.Vector3();
// The fruit nearest to hand, if any: with the least stooping, then the
// nearest. It turns to whatever it picks, to have it in front and a little
// to its right, where its right hand reaches without crossing its body, so
// what's within reach is judged as it will be once it has turned.
const ASIDE = 0.3;
function reachable(feet: THREE.Vector3): Within | null {
  let best: Within | null = null, least = Infinity;
  for (const f of fruits) {
    if ((f.state !== 'hanging' && f.state !== 'lying') || f.grown < 1) continue;
    const dx = f.at.x - feet.x, dz = f.at.z - feet.z, flat = Math.hypot(dx, dz);
    if (flat > 4 || Math.abs(f.at.y - feet.y - 3) > 4) continue;
    // Right overhead, there's no turning to it: it's taken as it is.
    const turned = flat > 0.5, forward = turned ? flat * Math.cos(ASIDE) : 0.3, across = turned ? flat * Math.sin(ASIDE) : 0.5;
    for (let stoop = 0; stoop <= 1.001; stoop += 0.125) {
      if (stoop > 0 && f.state !== 'lying') break;
      // Where the shoulder is, stooped that far: the waist lower, the body
      // bowed forward about it.
      const bow = STOOP.bow * stoop, up = feet.y + 2.05 - STOOP.hips * stoop + 1.16 * Math.cos(bow), out = 1.16 * Math.sin(bow) + 0.04;
      const far = Math.hypot(forward - out, across - 0.68, f.at.y - up);
      if (far > fruit.arm || far < fruit.near) continue;
      // Not right at its feet, where it would have to fold double.
      if (stoop > 0 && flat < 1) break;
      const score = stoop * 10 + far;
      if (score < least) { least = score; best = { fruit: f, stoop, facing: turned ? Math.atan2(-dx, -dz) + ASIDE : null }; }
      break;
    }
  }
  return best;
}

// Where a carried fruit rides: on the left forearm, by its slot.
function slotOf(robot: Robot, yaw: number, slot: number, out: THREE.Vector3) {
  const [along, up, back] = SLOTS[slot];
  robot.along(0, along, out);
  out.y += up;
  out.x += Math.sin(yaw) * back;
  out.z += Math.cos(yaw) * back;
  return out;
}

// Before the robot's posed: what's within reach, and the pick under way, if
// E started one or one's going. Gives the reach for its right arm and how
// far its left is up as a bowl (player.animate).
export function updatePick(delta: number, feet: THREE.Vector3, yaw: number, pace: number, wanted: boolean, robot: Robot): Reach | null {
  if (!mesh) return null;
  pulse += delta;
  // The bowl: up while there's anything in it or on its way.
  const holding = pick !== null || toss !== null || carried().length > 0;
  cradle = THREE.MathUtils.clamp(cradle + (holding ? delta : -delta) / fruit.cradle, 0, 1);
  if (toss) return throwing(delta, feet, yaw, robot);
  if (!pick) {
    const full = carried().length >= fruit.carried;
    within = full || pace > 0.5 ? null : reachable(feet);
    // With nothing to pick, at the water's edge with fruit in its arm, it
    // throws one: the last it picked.
    if (wanted && !within && pace < 0.5) {
      const water = bank(feet), last = fruits.filter(f => f.state === 'carried').sort((a, b) => b.slot - a.slot)[0];
      if (water && last) {
        toss = { facing: water.yaw, target: water.target, fruit: last, t: 0, reach: { goal: last.at.clone(), share: 0, stoop: 0 }, from: new THREE.Vector3(), taken: false, thrown: false };
        return toss.reach;
      }
    }
    if (!wanted || !within) return null;
    pick = { ...within, t: 0, from: new THREE.Vector3(), grabbed: false, reach: { goal: within.fruit.at.clone(), share: 0, stoop: 0 } };
  }
  // First it turns to the fruit (player.ts, by pickFacing), its left arm
  // coming up meanwhile.
  if (pick.facing !== null) {
    const off = THREE.MathUtils.euclideanModulo(pick.facing - yaw + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(off) > 0.06) return pick.reach;
    pick.facing = null;
  }
  pick.t += delta;
  const slow = pick.stoop > 0 ? fruit.stooping : 1, out = fruit.out * slow, bring = fruit.bring * slow, back = fruit.back;
  const smooth = THREE.MathUtils.smootherstep;
  if (pick.t < out) {
    // Reaching (the fruit may be swaying in a shaken tree), stooping first.
    pick.reach.goal.copy(pick.fruit.at);
    pick.reach.share = smooth(pick.t, pick.stoop > 0 ? out * 0.25 : 0, out * 0.92);
    pick.reach.stoop = pick.stoop * smooth(pick.t, 0, out * 0.7);
  } else if (pick.t < out + bring) {
    if (!pick.grabbed) {
      pick.grabbed = true;
      pick.from.copy(pick.fruit.at);
      play(pick.fruit.state === 'hanging' ? 'pluck' : 'tock', { gain: 0.8 });
      pick.fruit.state = 'held';
      pick.fruit.slot = [0, 1, 2, 3, 4].find(k => !fruits.some(f => f.slot === k))!;
    }
    // Straightening up, and the hand carrying it over to the bowl, in a
    // low arc so it's set down from above.
    const t = (pick.t - out) / bring, u = smooth(t, 0.1, 1);
    slotOf(robot, yaw, pick.fruit.slot, slotAt);
    pick.reach.goal.lerpVectors(pick.from, slotAt, u).y += Math.sin(u * Math.PI) * 0.3 + (1 - u) * 0;
    pick.reach.share = 1;
    pick.reach.stoop = pick.stoop * (1 - smooth(t, 0, 0.75));
  } else {
    // Set down in the bowl; the hand goes back to its side.
    if (pick.fruit.state === 'held') { pick.fruit.state = 'carried'; play('tock'); }
    const t = (pick.t - out - bring) / back;
    pick.reach.share = 1 - smooth(t, 0, 1);
    pick.reach.stoop = 0;
    if (t >= 1) { pick = null; return null; }
  }
  return pick.reach;
}
// How far the left arm's up as a bowl, and whether anything's in it: it
// doesn't run with its arm full.
export const cradling = () => cradle;
export const carrying = () => carried().length > 0 || pick !== null || toss !== null;
// Which way it should turn to face what it's picking, while it still has
// to, or null.
export const pickFacing = () => pick?.facing ?? toss?.facing ?? null;
// Whether it's busy picking: it stands still for it.
export const picking = () => pick !== null || toss !== null;
// Whether it's throwing to the fish: the camera moves round to show the water.
export const tossing = () => toss !== null;

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
  // In its right hand until it's set down, then riding in the bowl.
  for (const f of fruits) {
    if (f.state === 'held') robot.grip(1, f.at);
    else if (f.state === 'thrown') {
      // Through the air, tumbling, and apart into its slices.
      f.velocity.y -= GRAVITY * delta;
      f.at.addScaledVector(f.velocity, delta);
      f.turn.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().copy(f.spin).normalize(), f.spin.length() * delta));
      f.wait += delta;
      if (f.wait > fruit.apart) {
        burst(f.at, f.velocity, f.scale);
        f.state = 'gone';
      }
    }
    else if (f.state === 'carried') slotOf(robot, yaw, f.slot, f.at);
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
      f.wait = 0;
      play('squash');
      f.at.y -= f.scale * 0.4;
      f.turn.identity();
    }
  }
  const shifted = new THREE.Matrix4();
  // Squashed fruit rots away; what's growing ripens.
  for (const f of fruits) {
    if (f.state === 'squashed' && (f.wait += delta) > fruit.rots) f.state = 'gone';
    if (f.state === 'hanging' && f.grown < 1) f.grown = Math.min(1, f.grown + delta / fruit.ripen);
  }
  for (const tree of trees) {
    tree.rested += delta;
    // Bearing again: a new fruit where one's gone for good (eaten, lost in
    // the water or rotted), one at a time.
    const spent = fruits.filter(f => f.tree === tree && f.state === 'gone');
    if (!spent.length) tree.bears = 0;
    else if ((tree.bears += delta) > fruit.regrow) {
      tree.bears = 0;
      const f = spent[Math.floor(random() * spent.length)];
      f.state = 'hanging';
      f.at.copy(f.home);
      f.grown = 0;
      f.slot = -1;
      f.velocity.set(0, 0, 0);
      f.turn.setFromEuler(new THREE.Euler((random() - 0.5) * 0.5, random() * 6, (random() - 0.5) * 0.5));
    }
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
      play('rustle', { gain: 0.6 + 0.4 * tree.strength });
      const hanging = fruits.filter(f => f.tree === tree && f.state === 'hanging' && f.grown >= 1);
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
      play('plop');
      f.velocity.set(0, -1.2, 0);
      continue;
    }
    f.at.y = ground + radius;
    // A bounce or two, then a short roll to rest.
    if (f.velocity.y < -1.2) {
      play('thud', { gain: Math.min(1, -f.velocity.y / 9) });
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

// For the creature (creature.ts). The fruit lying on the grass; one it has
// settled down to, which is then its own (not picked, nor trodden flat); how
// much of that it has eaten (0 to 1: all gone); and one it's been frightened
// off, left lying as it is.
export type Windfall = { readonly at: THREE.Vector3, readonly scale: number };
export const windfalls = (): Windfall[] => fruits.filter(f => f.state === 'lying');
export const claim = (lying: Windfall) => { (lying as Fruit).state = 'nibbled'; };
export function nibble(lying: Windfall, eaten: number) {
  const f = lying as Fruit;
  if (f.state !== 'nibbled') return;
  f.grown = 1 - 0.8 * Math.min(1, eaten);
  if (eaten >= 1) f.state = 'gone';
}
export const leave = (lying: Windfall) => { if ((lying as Fruit).state === 'nibbled') (lying as Fruit).state = 'lying'; };

// For a later step and for testing: how many hang, lie on the ground, and
// have been lost to the water.
export const fruitCount = () => ({
  hanging: fruits.filter(f => f.state === 'hanging').length,
  falling: fruits.filter(f => f.state === 'falling').length,
  lying: fruits.filter(f => f.state === 'lying').length,
  lost: fruits.filter(f => f.state === 'sinking' || f.state === 'gone').length,
  squashed: fruits.filter(f => f.state === 'squashed').length,
  carried: carried().length,
  thrown: fruits.filter(f => f.state === 'thrown').length,
  tossing: toss !== null,
  within: within && { state: within.fruit.state, stoop: within.stoop },
  picking: pick !== null,
  ground: fruits.filter(f => f.state === 'lying').map(f => [f.at.x, f.at.z]),
  trees: trees.map(tree => ({ x: tree.x, z: tree.z, tall: tree.tall, hanging: fruits.filter(f => f.tree === tree && f.state === 'hanging').length })),
});
