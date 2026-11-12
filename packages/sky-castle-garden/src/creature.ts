import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createCreatureModel, type CreatureModel } from './creatureModel';
import { fruitTrees } from './foliage';
import { claim, leave, nibble, overWater, type Windfall, windfalls } from './fruit';
import { CAMERA_GROUPS } from './level';
import type { Robot } from './robot';
import { play, type Sound } from './sounds';

// A small creature that lives in the garden's fruit trees, first step. It
// keeps out of sight in a crown until fruit lies on the grass near its tree
// (shaken down, say). If the robot's too near it only comes part-way down
// the trunk to watch, calling; once the robot's stepped back it runs down
// and across the grass in short dashes, stopping to sit up and look about,
// settles by the fruit and eats it. Come too close and it drops the fruit
// and bolts for the nearest tree. Every fruit eaten in peace makes it a
// little bolder: it lets the robot come nearer the next time.
//
// When there's been nothing for it for a while, it moves to a tree nearer
// the robot, so it's glimpsed crossing the grass now and then.
//
// Second step: once it's tame it takes to the robot. With nothing left to
// eat it runs to the robot instead of a tree, leaps to its right hand, runs
// up the arm and rides on its shoulder, wherever the robot walks. It comes
// down from its tree to do the same when the robot stands a while near by.
// From the shoulder it still hops off for fruit lying near, and comes back.

export const creature = {
  // How big it is, against the model as made (a metre from nose to tail
  // tip): small, its body a little over half the robot's head, so its ears
  // and tail show above the grass.
  size: 0.45,
  // How near the robot can come before it bolts (m): at first, and once
  // it's tame; and how many fruit eaten in peace it takes to get there.
  fear: 9,
  bold: 2.2,
  tame: 4,
  // How many it has eaten in peace so far.
  trust: 0,
  // How far from its tree it'll go for fruit (m), how fast it runs (m/s)
  // and how long a fruit takes to eat (s).
  range: 18,
  speed: 4.4,
  eats: 4.5,
  // How long it lies low after going up a tree (s), how high up the trunk
  // it watches from (m), and how long with nothing to eat before it moves
  // to another tree (s).
  waits: 3,
  perch: 2.2,
  restless: 25,
  // Tame: how near its tree the robot has to stand for it to come down to
  // it (m), how far off the robot can be for it to run to it (m), how near
  // fruit has to lie for it to hop off the shoulder for it (m), and where it
  // sits: how far above the robot's surface, and in from the shoulder
  // joint towards the neck (m).
  calls: 8,
  follows: 30,
  hops: 9,
  seat: 0,
  inward: 0.14,
};

type Tree = (typeof fruitTrees)[number];
type State = 'hidden' | 'peeking' | 'down' | 'run' | 'look' | 'eat' | 'up' | 'leap' | 'climb' | 'ride' | 'drop';
type Goal = { fruit: Windfall } | { tree: Tree } | { robot: true };

let model: CreatureModel | undefined, world: RAPIER.World;
let state: State = 'hidden', home: Tree, goal: Goal | null = null;
// How long in this state, where it is, which way it's heading, how high up
// the trunk and on which side of it; whether it's bolting; how far it has
// left of this dash, where it is in its bound, and the bites it's taken.
let t = 0, heading = 0, height = 0, side = 0, bolting = false, dash = 0, stride = 0, bites = 0, called = 0;
const at = new THREE.Vector3(), from = new THREE.Vector3(), leapt = new THREE.Vector3();
// How long the robot's stood still (s).
let stood = 0;
let sit = 0, run = 0;
let s = 4801;
const random = () => (s = (s * 16807) % 2147483647) / 2147483647;

const fear = () => THREE.MathUtils.lerp(creature.fear, creature.bold, Math.min(1, creature.trust / creature.tame));
const flat = (a: { x: number, z: number }, b: { x: number, z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const trunk = (tree: Tree) => tree.tall * 0.028 + 0.02;
const foot = (tree: Tree, angle: number, out: THREE.Vector3) => out.set(tree.x + Math.sin(angle) * (trunk(tree) + 0.1), 0, tree.z + Math.cos(angle) * (trunk(tree) + 0.1));

const down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
// The ground (or the stone) under it, from knee height above where it is.
const ground = (x: number, y: number, z: number) => {
  down.origin = { x, y: y + 1.2, z };
  const hit = world.castRay(down, 30, false, undefined, CAMERA_GROUPS);
  return hit ? y + 1.2 - hit.timeOfImpact : y;
};
// Whether the straight way between two places keeps to dry land.
const dry = (from: { x: number, z: number }, to: { x: number, z: number }) => {
  for (let k = 1; k < 12; k++) if (overWater(from.x + (to.x - from.x) * k / 12, from.z + (to.z - from.z) * k / 12)) return false;
  return true;
};

export function createCreature(scene: THREE.Scene, physics: RAPIER.World, gltf: GLTF) {
  world = physics;
  if (!fruitTrees.length) return;
  model = createCreatureModel(gltf);
  model.group.visible = false;
  scene.add(model.group);
  // To begin with, in the tree nearest where the path comes into the garden.
  home = [...fruitTrees].sort((a, b) => flat(a, { x: 0, z: 8 }) - flat(b, { x: 0, z: 8 }))[0];
}

// Quieter the further it is from the robot.
const sound = (name: Sound, feet: THREE.Vector3, gain = 1) => play(name, { gain: gain * THREE.MathUtils.clamp(1 - flat(at, feet) / 45, 0.12, 1) ** 2 });

const enter = (next: State) => { state = next; t = 0; };

// The fruit it would go for: the nearest lying within its range of a place,
// that it can get to dry-footed and the robot isn't standing over.
function wanted(from: { x: number, z: number }, feet: THREE.Vector3, range: number) {
  let best: Windfall | null = null, nearest = range;
  for (const f of windfalls()) {
    const far = flat(f.at, from);
    if (far < nearest && f.at.y < 1.5 && flat(f.at, feet) > fear() && dry(from, f.at)) { best = f; nearest = far; }
  }
  return best;
}
// Any at all lying within its range, whoever's standing by it.
const tempting = (from: { x: number, z: number }, range: number) => windfalls().some(f => flat(f.at, from) < range && f.at.y < 1.5 && dry(from, f.at));

// Off to a tree, and up it: the one that's nearest, counting the robot's
// nearness to it against it.
function retreat(feet: THREE.Vector3) {
  const tree = [...fruitTrees].filter(tree => dry(at, tree)).sort((a, b) => (flat(a, at) - 0.6 * flat(a, feet)) - (flat(b, at) - 0.6 * flat(b, feet)))[0] ?? home;
  goal = { tree };
}

// The robot's own surface, for its feet: the first of it met from a point,
// looking a given way, within a reach (m). Its skin is tested as it's posed.
const caster = new THREE.Raycaster();
let roomy = false;
function surface(robot: Robot, origin: THREE.Vector3, way: THREE.Vector3, reach: number, out: THREE.Vector3) {
  if (!roomy) {
    // Its arms reach well outside the bounds it was given standing.
    robot.object.traverse(child => {
      const mesh = child as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 8);
      mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-8, -6, -8), new THREE.Vector3(8, 10, 8));
    });
    roomy = true;
  }
  caster.set(origin, way);
  caster.far = reach;
  const [hit] = caster.intersectObject(robot.object, true);
  if (hit) out.copy(hit.point);
  return !!hit;
}

const tame = () => creature.trust >= creature.tame;
// With nothing to eat: to the robot, if it's tame and the robot's not too
// far off over dry land; or else to a tree.
function settle(feet: THREE.Vector3) {
  if (tame() && flat(at, feet) < creature.follows && dry(at, feet)) goal = { robot: true };
  else retreat(feet);
}

const forward = new THREE.Vector3(), up = new THREE.Vector3(), across = new THREE.Vector3(), basis = new THREE.Matrix4(), to = new THREE.Vector3();
// Where it is on the trunk, and which way up: head first, its back outwards.
function cling(headUp: boolean) {
  const out = trunk(home);
  at.set(home.x + Math.sin(side) * out, height, home.z + Math.cos(side) * out);
  forward.set(0, headUp ? 1 : -1, 0);
  up.set(Math.sin(side), 0, Math.cos(side));
}

// feet: where the robot stands; pace: how fast it's going, as a share of a run.
// yaw: which way it faces; robot: its body, posed for this frame.
export function updateCreature(delta: number, seconds: number, feet: THREE.Vector3, pace: number, yaw: number, robot: Robot) {
  if (!model || delta <= 0) return;
  t += delta;
  stood = pace < 0.05 ? stood + delta : 0;
  const scared = fear(), near = flat(at, feet);
  let nod = 0;
  forward.set(Math.sin(heading), 0, Math.cos(heading));
  up.set(0, 1, 0);

  if (state === 'hidden') {
    model.group.visible = false;
    if (t > creature.waits) {
      if (tempting(home, creature.range)) {
        // Down the side of the trunk the robot's on, to keep an eye on it.
        side = Math.atan2(feet.x - home.x, feet.z - home.z);
        height = Math.min(home.tall * 0.3, creature.perch + 1);
        called = 1.5;
        enter('peeking');
      } else if (tame() && stood > 1.5 && flat(home, feet) < creature.calls) {
        // Tame, and the robot's standing by: down to it.
        side = Math.atan2(feet.x - home.x, feet.z - home.z);
        height = Math.min(home.tall * 0.3, creature.perch + 1);
        goal = { robot: true };
        sound('chirp', feet);
        enter('down');
      } else if (t > creature.restless && flat(home, feet) > scared + 4) {
        // Nothing here: over to a tree nearer the robot, if there is one.
        const nearer = fruitTrees.filter(tree => tree !== home && flat(tree, feet) > scared + 2 && flat(tree, feet) < flat(home, feet) - 6 && dry(home, tree))
          .sort((a, b) => flat(a, feet) - flat(b, feet))[0];
        if (nearer) {
          side = Math.atan2(nearer.x - home.x, nearer.z - home.z);
          height = Math.min(home.tall * 0.3, creature.perch + 1);
          goal = { tree: nearer };
          enter('down');
        } else t = creature.waits;
      }
    }
  }

  else if (state === 'peeking') {
    // Part-way down, watching: on down once the way's clear, back up if the
    // fruit's gone or the robot comes right up to the tree.
    model.group.visible = true;
    height = Math.max(creature.perch, height - 3 * delta);
    cling(false);
    const fruit = wanted(home, feet, creature.range);
    const shy = !tame() && flat(home, feet) < scared * 0.35;
    if (shy || !tempting(home, creature.range)) {
      if (shy) sound('squeak', feet);
      enter('up');
    } else if (fruit && (tame() || flat(home, feet) > scared) && height <= creature.perch) {
      goal = { fruit };
      enter('down');
    } else if ((called -= delta) < 0) {
      called = 3.5 + random() * 4;
      sound('chirp', feet);
    }
  }

  else if (state === 'down') {
    model.group.visible = true;
    height -= 3.2 * delta;
    cling(false);
    if (height <= 0.25) {
      foot(home, side, at);
      at.y = ground(at.x, 0.5, at.z);
      heading = side;
      dash = 2 + random() * 3;
      enter('run');
    }
  }

  else if (state === 'up') {
    height += 4.5 * delta;
    cling(true);
    if (height > Math.min(home.tall * 0.3, creature.perch + 1.2)) { bolting = false; enter('hidden'); }
  }

  else if (state === 'leap') {
    // From the grass up to the robot's right hand, in one bound.
    const u = Math.min(1, t / 0.4);
    robot.grip(1, to);
    at.lerpVectors(leapt, to, u);
    at.y += 0.5 * 4 * u * (1 - u);
    forward.subVectors(to, leapt).setY(0).normalize();
    heading = Math.atan2(forward.x, forward.z);
    if (u >= 1) { height = 1; enter('climb'); }
  }

  else if (state === 'climb') {
    // Up the arm, hand to shoulder, its back turned out from the robot.
    height = Math.max(0, height - delta * 1.1);
    robot.along(1, height, at);
    robot.along(1, Math.max(0, height - 0.08), to);
    if (height > 0.08) forward.subVectors(to, at).normalize();
    else forward.set(0, 1, 0);
    up.set(at.x - feet.x, 0.4, at.z - feet.z).normalize();
    up.addScaledVector(forward, -up.dot(forward)).normalize();
    // Its feet on the arm's outer face, not at its middle.
    from.copy(at).addScaledVector(up, 0.6);
    if (!surface(robot, from, to.copy(up).negate(), 0.6, at)) at.addScaledVector(up, 0.13);
    if (height <= 0) { sound('chirp', feet); enter('ride'); }
  }

  else if (state === 'ride') {
    // On the shoulder, facing the way the robot does.
    robot.along(1, 0, at);
    const inwards = creature.inward / (flat(at, feet) || 1);
    at.x += (feet.x - at.x) * inwards;
    at.z += (feet.z - at.z) * inwards;
    // Sat on whatever of the robot is under it there.
    from.copy(at).setY(at.y + 0.8);
    surface(robot, from, to.set(0, -1, 0), 1.4, at);
    at.y += creature.seat;
    heading = yaw + Math.PI;
    forward.set(Math.sin(heading), 0, Math.cos(heading));
    // Off for fruit lying near, when the robot's not striding along.
    const under = { x: feet.x, z: feet.z };
    const fruit = t > 2 && pace < 0.3 ? wanted(under, feet, creature.hops) : null;
    if (fruit) {
      goal = { fruit };
      leapt.copy(at);
      enter('drop');
    }
  }

  else if (state === 'drop') {
    // Down off the shoulder to the grass at the robot's right.
    const u = Math.min(1, t / 0.5);
    to.set(feet.x + Math.cos(yaw) * 1.5, 0, feet.z - Math.sin(yaw) * 1.5);
    to.y = ground(to.x, feet.y, to.z);
    at.lerpVectors(leapt, to, u);
    at.y += 0.35 * 4 * u * (1 - u);
    forward.subVectors(to, leapt).setY(0).normalize();
    heading = Math.atan2(forward.x, forward.z);
    if (u >= 1) { dash = 2 + random() * 3; sound('patter', feet); enter('run'); }
  }

  else {
    // On the grass. Frightened off by the robot coming too close, unless
    // it's already bolting. Once it's tame nothing the robot does scares it.
    if (!tame() && !bolting && near < scared && (pace > 0.05 || near < scared * 0.6)) {
      if (goal && 'fruit' in goal) leave(goal.fruit);
      sound('squeak', feet);
      retreat(feet);
      bolting = true;
      enter('run');
    }
    // The fruit it was after has been picked, or trodden on.
    if (state !== 'eat' && goal && 'fruit' in goal && !windfalls().includes(goal.fruit)) {
      const fruit = wanted(at, feet, creature.range * 0.7);
      if (fruit) goal = { fruit };
      else settle(feet);
    }
    if (!goal) settle(feet);
    // Running to the robot, but it's gone too far off, or fruit's turned up.
    if (goal && 'robot' in goal) {
      const fruit = wanted(at, feet, creature.hops);
      if (fruit) goal = { fruit };
      else if (near > creature.follows || !dry(at, feet)) retreat(feet);
    }

    if (state === 'run' && goal) {
      if ('fruit' in goal) to.copy(goal.fruit.at);
      // (To the grass under the robot's right hand.)
      else if ('robot' in goal) robot.grip(1, to);
      else foot(goal.tree, Math.atan2(at.x - goal.tree.x, at.z - goal.tree.z), to);
      const chasing = 'robot' in goal && pace > 0.05;
      const far = flat(to, at), reach = 'fruit' in goal ? model.nose * creature.size * 0.8 + goal.fruit.scale * 0.4 : 'robot' in goal ? 0.45 : 0.08, step = creature.speed * (bolting || chasing ? 1.45 : 1) * delta;
      // Turning towards it as it goes.
      const want = Math.atan2(to.x - at.x, to.z - at.z);
      heading += Math.atan2(Math.sin(want - heading), Math.cos(want - heading)) * Math.min(1, delta * 14);
      forward.set(Math.sin(heading), 0, Math.cos(heading));
      if (far <= reach + step) {
        if ('fruit' in goal) {
          at.addScaledVector(forward, Math.max(0, far - reach));
          claim(goal.fruit);
          bites = 0;
          enter('eat');
        } else if ('robot' in goal) {
          // At its side: up, once it's standing still enough to leap to.
          if (pace < 0.3) {
            leapt.copy(at);
            goal = null;
            enter('leap');
          }
        } else {
          home = goal.tree;
          side = Math.atan2(at.x - home.x, at.z - home.z);
          height = 0.25;
          goal = null;
          sit = run = 0;
          enter('up');
        }
      } else {
        at.addScaledVector(forward, step);
        const before = stride;
        stride += step / (1.5 * creature.size) * Math.PI * 2;
        // Its feet, every other bound's landing.
        if (Math.floor(stride / (Math.PI * 4)) > Math.floor(before / (Math.PI * 4))) sound('patter', feet, 0.5);
        // A dash, then a stop to look about (not when it's running for its life).
        if (!bolting && !chasing && (dash -= step) < 0 && far > 1) enter('look');
      }
      at.y = THREE.MathUtils.lerp(at.y, ground(at.x, at.y, at.z), Math.min(1, delta * 18));
    }

    else if (state === 'look') {
      if (t > 0.45 + (dash + 3) % 0.5) {
        dash = 2 + random() * 3.5;
        enter('run');
      }
    }

    else if (state === 'eat' && goal && 'fruit' in goal) {
      nod = 1;
      const eaten = t / creature.eats;
      nibble(goal.fruit, eaten);
      if (eaten * 9 > bites) { bites++; sound('nibble', feet); }
      if (eaten >= 1) {
        // Eaten in peace: a little bolder for it.
        creature.trust++;
        sound('chirp', feet);
        const fruit = wanted(at, feet, creature.range * 0.7);
        if (fruit) goal = { fruit };
        else settle(feet);
        dash = 2 + random() * 3;
        enter('run');
      }
    }
  }

  // Sitting up when it's stopped on the grass; bounding when it runs.
  // (Right up to look about; crouched over the fruit to eat.)
  const ease = Math.min(1, delta * 12);
  // (On the shoulder: sat up while the robot stands, crouched as it walks.)
  sit += ((state === 'look' ? 1 : state === 'eat' ? 0.4 : state === 'ride' ? (pace > 0.05 ? 0.15 : 0.7) : 0) - sit) * ease;
  run += ((state === 'run' ? 1 : state === 'down' || state === 'up' || state === 'climb' ? 0.6 : state === 'leap' || state === 'drop' ? 0.3 : 0) - run) * ease;
  if (state === 'down' || state === 'up' || state === 'climb') stride += delta * 22;
  model.group.visible = state !== 'hidden';
  model.pose({ sit, run, stride, nod, seconds });
  across.crossVectors(up, forward);
  model.group.position.copy(at);
  model.group.scale.setScalar(creature.size);
  model.group.quaternion.setFromRotationMatrix(basis.makeBasis(across, up, forward));
}

// For testing: what it's doing and where.
export const creatureState = () => ({ state, at: [at.x, at.y, at.z], home: home && [home.x, home.z], trust: creature.trust, fear: fear(), bolting });
