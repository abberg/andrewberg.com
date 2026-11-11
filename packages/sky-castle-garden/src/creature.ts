import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createCreatureModel, type CreatureModel } from './creatureModel';
import { fruitTrees } from './foliage';
import { claim, leave, nibble, overWater, type Windfall, windfalls } from './fruit';
import { CAMERA_GROUPS } from './level';
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

export const creature = {
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
  speed: 5.5,
  eats: 4.5,
  // How long it lies low after going up a tree (s), how high up the trunk
  // it watches from (m), and how long with nothing to eat before it moves
  // to another tree (s).
  waits: 3,
  perch: 2.2,
  restless: 25,
};

type Tree = (typeof fruitTrees)[number];
type State = 'hidden' | 'peeking' | 'down' | 'run' | 'look' | 'eat' | 'up';
type Goal = { fruit: Windfall } | { tree: Tree };

let model: CreatureModel | undefined, world: RAPIER.World;
let state: State = 'hidden', home: Tree, goal: Goal | null = null;
// How long in this state, where it is, which way it's heading, how high up
// the trunk and on which side of it; whether it's bolting; how far it has
// left of this dash, where it is in its bound, and the bites it's taken.
let t = 0, heading = 0, height = 0, side = 0, bolting = false, dash = 0, stride = 0, bites = 0, called = 0;
const at = new THREE.Vector3();
let sit = 0, run = 0;
let s = 4801;
const random = () => (s = (s * 16807) % 2147483647) / 2147483647;

const fear = () => THREE.MathUtils.lerp(creature.fear, creature.bold, Math.min(1, creature.trust / creature.tame));
const flat = (a: { x: number, z: number }, b: { x: number, z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const trunk = (tree: Tree) => tree.tall * 0.028 + 0.09;
const foot = (tree: Tree, angle: number, out: THREE.Vector3) => out.set(tree.x + Math.sin(angle) * (trunk(tree) + 0.25), 0, tree.z + Math.cos(angle) * (trunk(tree) + 0.25));

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

const forward = new THREE.Vector3(), up = new THREE.Vector3(), across = new THREE.Vector3(), basis = new THREE.Matrix4(), to = new THREE.Vector3();
// Where it is on the trunk, and which way up: head first, its back outwards.
function cling(headUp: boolean) {
  const out = trunk(home);
  at.set(home.x + Math.sin(side) * out, height, home.z + Math.cos(side) * out);
  forward.set(0, headUp ? 1 : -1, 0);
  up.set(Math.sin(side), 0, Math.cos(side));
}

// feet: where the robot stands; pace: how fast it's going, as a share of a run.
export function updateCreature(delta: number, seconds: number, feet: THREE.Vector3, pace: number) {
  if (!model || delta <= 0) return;
  t += delta;
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
    if (flat(home, feet) < scared * 0.35 || !tempting(home, creature.range)) {
      if (flat(home, feet) < scared * 0.35) sound('squeak', feet);
      enter('up');
    } else if (fruit && flat(home, feet) > scared && height <= creature.perch) {
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

  else {
    // On the grass. Frightened off by the robot coming too close, unless
    // it's already bolting.
    if (!bolting && near < scared && (pace > 0.05 || near < scared * 0.6)) {
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
      else retreat(feet);
    }
    if (!goal) retreat(feet);

    if (state === 'run' && goal) {
      if ('fruit' in goal) to.copy(goal.fruit.at);
      else foot(goal.tree, Math.atan2(at.x - goal.tree.x, at.z - goal.tree.z), to);
      const far = flat(to, at), reach = 'fruit' in goal ? model.nose * 0.75 : 0.12, step = creature.speed * (bolting ? 1.45 : 1) * delta;
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
        stride += step / 0.95 * Math.PI * 2;
        // Each bound's landing.
        if (Math.floor(stride / (Math.PI * 2)) > Math.floor(before / (Math.PI * 2))) sound('patter', feet, 0.7);
        // A dash, then a stop to look about (not when it's running for its life).
        if (!bolting && (dash -= step) < 0 && far > 1.5) enter('look');
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
        else retreat(feet);
        dash = 2 + random() * 3;
        enter('run');
      }
    }
  }

  // Sitting up when it's stopped on the grass; bounding when it runs.
  // (Right up to look about; crouched over the fruit to eat.)
  const ease = Math.min(1, delta * 12);
  sit += ((state === 'look' ? 1 : state === 'eat' ? 0.4 : 0) - sit) * ease;
  run += ((state === 'run' ? 1 : state === 'down' || state === 'up' ? 0.6 : 0) - run) * ease;
  if (state === 'down' || state === 'up') stride += delta * 22;
  model.pose({ sit, run, stride, nod, seconds });
  across.crossVectors(up, forward);
  model.group.position.copy(at);
  model.group.quaternion.setFromRotationMatrix(basis.makeBasis(across, up, forward));
}

// For testing: what it's doing and where.
export const creatureState = () => ({ state, at: [at.x, at.y, at.z], home: home && [home.x, home.z], trust: creature.trust, fear: fear(), bolting });
