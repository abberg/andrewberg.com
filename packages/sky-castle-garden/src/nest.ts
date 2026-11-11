import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blockStone, columnStone, shifted, urnGeometry } from './columns';
import { urnPlant } from './foliage';
import { WALL_GROUPS } from './level';
import { painted } from './look';
import type { Reach, Robot } from './robot';
import { play, type Sound } from './sounds';

// Helping the flycatchers. One of the garden's planters has been knocked
// over and lies on its side in the grass, right over a nest: the eggs are
// unharmed in the hollow under its stem, but the birds can't get to them. A
// pair of red-breasted flycatchers flutters over it, calling. It can't be
// shoved aside (that would roll it over the nest): at its side, with its
// arms empty, E has the robot stoop, take it in both hands, lift it clear,
// turn, and set it down upright a few steps off. Then the birds come down:
// one settles on the eggs, the other perches on the planter's rim and sings.

// Where the planter stood (it's one of stones.ts's urns, left out there).
export const FALLEN = { x: -7.8, z: 10 };

export const nest = {
  // How near its middle the robot has to stand to lift it (m).
  reach: 3,
  // The lift, in seconds: stooping to it, lifting it, turning with it,
  // lowering it, and letting go.
  stoop: 1.5,
  lift: 1.9,
  turn: 1.7,
  lower: 1.9,
  free: 0.9,
  // How far it turns with it (radians), how far in front of it the planter's
  // held and set down (m), and how high it's lifted (m, its foot off the grass).
  swing: 1.5,
  ahead: 1.75,
  high: 1.15,
  // How big the birds are (m, bill to tail): bigger than life, to be seen.
  bird: 0.34,
};

// The planter as it lies: its foot towards the south-west, tipped so it
// rests on the edge of its foot and the lip of its bowl.
const LIE = 2.2, TILT = 0.385;
const axis = new THREE.Vector3(Math.sin(LIE) * Math.cos(TILT), Math.sin(TILT), Math.cos(LIE) * Math.cos(TILT));
const lying = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
const fallen = new THREE.Vector3(FALLEN.x, 0.3, FALLEN.z);
// Its middle, up its axis from its foot, where it's held (m); and the nest,
// under its stem.
const WAIST = 0.8;
const eggs = new THREE.Vector3(fallen.x + axis.x * 0.52, 0, fallen.z + axis.z * 0.52);

type Phase = 'lying' | 'lifting' | 'freed';
let phase: Phase = 'lying', planter: THREE.Group, guard: RAPIER.Collider, world: RAPIER.World;
// The lift under way: how long it's been going, which way the robot faced
// when it took hold, where the planter is set down, and the reach.
let lift: { t: number, facing: number | null, yaw: number, held: boolean, down: boolean, reach: Reach & { left: THREE.Vector3 } } | null = null;
const set = new THREE.Vector3(), upright = new THREE.Quaternion();
let since = 0;

type Bird = { group: THREE.Group, wings: THREE.Mesh[], at: THREE.Vector3, to: THREE.Vector3, heading: number, phase: number, perched: number, calls: number, home: THREE.Vector3 };
const birds: Bird[] = [];
let s = 2203;
const random = () => (s = (s * 16807) % 2147483647) / 2147483647;

const tinted = (geometry: THREE.BufferGeometry, colour: number[] | ((at: THREE.Vector3) => number[])) => {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  const places = plain.getAttribute('position'), colours = new Float32Array(places.count * 3), at = new THREE.Vector3();
  for (let i = 0; i < places.count; i++) colours.set(typeof colour === 'function' ? colour(at.fromBufferAttribute(places, i)) : colour, i * 3);
  return plain.setAttribute('color', new THREE.BufferAttribute(colours, 3)).deleteAttribute('uv');
};
const ball = (rx: number, ry: number, rz: number, x = 0, y = 0, z = 0) => new THREE.SphereGeometry(1, 10, 8).scale(rx, ry, rz).translate(x, y, z);

// A red-breasted flycatcher, a metre long (scaled down in the garden),
// facing +z: grey-brown above, an orange-red throat and breast, white
// below, and a dark tail with white at the sides of its root.
function birdModel(material: THREE.Material) {
  const BROWN = [0.5, 0.42, 0.36], RED = [0.95, 0.4, 0.14], WHITE = [0.97, 0.95, 0.9], DARK = [0.14, 0.12, 0.12], GREY = [0.52, 0.52, 0.56];
  const group = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries([
    tinted(ball(0.2, 0.19, 0.3, 0, 0, 0), at => at.y > 0.02 ? BROWN : at.z > 0.02 ? RED : WHITE),
    tinted(ball(0.15, 0.14, 0.15, 0, 0.13, 0.27), at => at.y < 0.09 && at.z > 0.24 ? RED : at.y > 0.17 ? BROWN : GREY),
    tinted(new THREE.ConeGeometry(0.035, 0.13, 5).rotateX(Math.PI / 2).translate(0, 0.13, 0.46), DARK),
    tinted(ball(0.028, 0.028, 0.02, 0.1, 0.17, 0.36), DARK),
    tinted(ball(0.028, 0.028, 0.02, -0.1, 0.17, 0.36), DARK),
    // The tail, cocked a little: dark, white at the sides of its root.
    tinted(new THREE.BoxGeometry(0.16, 0.025, 0.34).rotateX(-0.3).translate(0, 0.07, -0.42), at => Math.abs(at.x) > 0.045 && at.z > -0.45 ? WHITE : DARK),
    tinted(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(0.06, -0.24, 0.02), DARK),
    tinted(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(-0.06, -0.24, 0.02), DARK),
  ])!, material);
  body.castShadow = true;
  group.add(body);
  const wings = [1, -1].map(side => {
    const shape = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0.16, side * 0.46, 0, -0.06, 0, 0, -0.2,
      0, 0, -0.2, side * 0.46, 0, -0.06, 0, 0, 0.16,
    ], 3));
    shape.computeVertexNormals();
    const wing = new THREE.Mesh(tinted(shape, at => Math.abs(at.x) > 0.3 ? DARK : BROWN), material);
    wing.position.set(side * 0.14, 0.08, 0.02);
    wing.castShadow = true;
    group.add(wing);
    return wing;
  });
  return { group, wings };
}

// The nest: a ring of twigs with three pale eggs in it.
function nestModel() {
  const group = new THREE.Group();
  const twig = painted([0x8a6a48, 0x5a4136]);
  const ring = new THREE.Mesh(mergeGeometries([
    new THREE.TorusGeometry(0.2, 0.065, 6, 14).rotateX(Math.PI / 2).translate(0, 0.06, 0).deleteAttribute('uv'),
    new THREE.TorusGeometry(0.15, 0.05, 5, 12).rotateX(Math.PI / 2).rotateY(0.4).translate(0, 0.03, 0).deleteAttribute('uv'),
    new THREE.CylinderGeometry(0.17, 0.2, 0.03, 12).translate(0, 0.015, 0).deleteAttribute('uv'),
  ])!, twig);
  ring.receiveShadow = true;
  const shell = painted([0xdfe8e2, 0x9db0b4]);
  const laid = new THREE.Mesh(mergeGeometries([[0.06, 0], [-0.05, 0.045], [-0.02, -0.065]].map(([x, z], k) =>
    new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.8, 1.25).rotateY(k * 1.3).translate(x, 0.07, z).deleteAttribute('uv')))!, shell);
  group.add(ring, laid);
  return group;
}

export function createNest(scene: THREE.Scene, physics: RAPIER.World) {
  world = physics;
  // The planter, as stones.ts makes the others, but not a body to shove:
  // an unseen wall round it keeps the robot off it and the nest.
  const urn = urnGeometry();
  planter = new THREE.Group();
  for (const [geometry, material] of [[shifted(urn.foot), blockStone], [urn.body, columnStone]] as const) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    planter.add(mesh);
  }
  planter.add(urnPlant(2, 1.22, 0.64, 0.83));
  planter.position.copy(fallen);
  planter.quaternion.copy(lying);
  planter.userData.unreflected = 'low';
  scene.add(planter);
  guard = world.createCollider(RAPIER.ColliderDesc.cylinder(1.3, 1).setTranslation(fallen.x + axis.x * 0.6, 1.3, fallen.z + axis.z * 0.6).setCollisionGroups(WALL_GROUPS));

  const twigs = nestModel();
  twigs.position.copy(eggs);
  scene.add(twigs);

  const feathers = painted([0xffffff, 0x8f8ba6], { vertexColors: true, side: THREE.DoubleSide });
  for (let k = 0; k < 2; k++) {
    const { group, wings } = birdModel(feathers);
    group.scale.setScalar(nest.bird);
    const at = new THREE.Vector3(eggs.x + (k ? 0.7 : -0.6), 2 + k * 0.4, eggs.z + (k ? -0.5 : 0.6));
    birds.push({ group, wings, at, to: at.clone(), heading: k * 2, phase: k * 1.7, perched: 0, calls: 0.5 + k, home: new THREE.Vector3() });
    scene.add(group);
  }
}

const flat = (a: { x: number, z: number }, b: { x: number, z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
// Quieter the further off the robot is, but heard a good way across the garden.
const sound = (name: Sound, at: THREE.Vector3, feet: THREE.Vector3, gain = 1) => play(name, { gain: gain * THREE.MathUtils.clamp(1 - flat(at, feet) / 60, 0.08, 1) ** 1.5 });

const middle = new THREE.Vector3(), across = new THREE.Vector3(), turned = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
// The planter's middle, where the hands go, as it stands or lies now.
const waist = (out: THREE.Vector3) => out.set(0, WAIST, 0).applyQuaternion(planter.quaternion).add(planter.position);

// Whether the robot's where it could lift it: by its side, standing.
const beside = (feet: THREE.Vector3, pace: number) => phase === 'lying' && pace < 0.5 && Math.abs(feet.y) < 0.6 && flat(waist(middle), feet) < nest.reach;

// Before the robot's posed. wanted: E's been pressed, with its arms free.
// Gives the reach for both its arms while it's lifting.
export function updateLift(delta: number, feet: THREE.Vector3, yaw: number, pace: number, wanted: boolean): Reach | null {
  if (!planter) return null;
  if (!lift) {
    if (!wanted || !beside(feet, pace)) return null;
    waist(middle);
    lift = { t: 0, facing: Math.atan2(-(middle.x - feet.x), -(middle.z - feet.z)), yaw, held: false, down: false, reach: { goal: new THREE.Vector3(), left: new THREE.Vector3(), share: 0, stoop: 0 } };
    phase = 'lifting';
  }
  // First it turns to the planter.
  if (lift.facing !== null && !lift.held) {
    const off = THREE.MathUtils.euclideanModulo(lift.facing - yaw + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(off) > 0.05) return lift.reach;
    lift.yaw = yaw;
    lift.facing = null;
  }
  lift.t += delta;
  const smooth = THREE.MathUtils.smootherstep, { reach } = lift;
  const t1 = nest.stoop, t2 = t1 + nest.lift, t3 = t2 + nest.turn, t4 = t3 + nest.lower, t5 = t4 + nest.free;
  const forward = across.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  // Held: out in front of it, turning as it turns, upright.
  const hold = (high: number, out: THREE.Vector3) => out.copy(feet).addScaledVector(forward, nest.ahead).setY(feet.y + high);
  if (lift.t < t1) {
    // Stooping, a hand to either side of it.
    reach.share = smooth(lift.t, t1 * 0.2, t1 * 0.95);
    reach.stoop = 0.85 * smooth(lift.t, 0, t1 * 0.7);
  } else if (lift.t < t3) {
    if (!lift.held) {
      lift.held = true;
      play('grate', { gain: 0.5 });
      world.removeCollider(guard, false);
      // Round with it, the way that carries it clear of the nest.
      const side = Math.sign((eggs.x - feet.x) * forward.z - (eggs.z - feet.z) * forward.x) || 1;
      lift.facing = lift.yaw - side * nest.swing;
    }
    // Up, righting it gently as it comes; then round with it.
    const u = smooth(lift.t, t1, t2);
    hold(nest.high, set);
    planter.position.lerpVectors(fallen, set, u);
    upright.setFromAxisAngle(UP, yaw - lift.yaw);
    planter.quaternion.slerpQuaternions(lying, upright, smooth(lift.t, t1 + nest.lift * 0.15, t2));
    reach.share = 1;
    reach.stoop = 0.85 * (1 - smooth(lift.t, t1, t2 * 0.95));
  } else if (lift.t < t4) {
    // Down onto the grass, stooping with it.
    const u = smooth(lift.t, t3, t4);
    hold(nest.high * (1 - u), planter.position);
    planter.quaternion.setFromAxisAngle(UP, yaw - lift.yaw);
    reach.stoop = 0.8 * u;
    if (u >= 1 && !lift.down) lift.down = true;
  } else {
    if (phase !== 'freed') {
      // Set down: it stands there now, the nest clear.
      phase = 'freed';
      since = 0;
      play('thud', { gain: 0.7 });
      const at = planter.position;
      world.createCollider(RAPIER.ColliderDesc.cylinder(0.66, 0.7).setTranslation(at.x, at.y + 0.66, at.z));
      // (And nothing treads on the eggs.)
      world.createCollider(RAPIER.ColliderDesc.cylinder(1.3, 0.45).setTranslation(eggs.x, 1.3, eggs.z).setCollisionGroups(WALL_GROUPS));
    }
    const u = smooth(lift.t, t4, t5);
    reach.share = 1 - u;
    reach.stoop = 0.8 * (1 - u);
    if (lift.t >= t5) { lift = null; return null; }
  }
  // A hand on either side of its middle.
  if (reach.share > 0 && lift) {
    waist(middle);
    const right = turned.setFromAxisAngle(UP, yaw), wide = 0.4;
    across.set(1, 0, 0).applyQuaternion(right);
    reach.goal.copy(middle).addScaledVector(across, wide);
    reach.left.copy(middle).addScaledVector(across, -wide);
  }
  return reach;
}
// Which way it turns for the lift, if it's turning; whether one's under way.
export const liftFacing = () => lift?.facing ?? null;
export const lifting = () => lift !== null;

const aim = new THREE.Vector3();
export function updateNest(delta: number, seconds: number, feet: THREE.Vector3) {
  if (!planter || delta <= 0) return;
  since += delta;
  birds.forEach((bird, k) => {
    bird.phase += delta;
    let flap = 1;
    if (phase === 'freed' && since > 0.8 + k * 0.9) {
      // Down to the eggs, or to the planter's rim.
      if (k === 0) bird.home.set(eggs.x, 0.1, eggs.z);
      else bird.home.set(planter.position.x + 0.55, planter.position.y + 1.33, planter.position.z + 0.45);
      bird.to.copy(bird.home);
    } else if (bird.phase > 0) {
      // Fluttering over it: off to a new place in the air every moment or
      // two, further off and higher while the robot has hold of it.
      const wide = phase === 'lifting' ? 3 : 0.9, low = phase === 'lifting' ? 3.2 : 1.5;
      const a = random() * Math.PI * 2, r = wide * (0.4 + 0.6 * random());
      bird.to.set(eggs.x + Math.cos(a) * r, low + random() * 0.9, eggs.z + Math.sin(a) * r);
      bird.phase = -(0.35 + random() * 0.8);
    }
    // To where it's going, quick at first and easing in.
    aim.subVectors(bird.to, bird.at);
    const far = aim.length(), step = Math.min(far, (1.2 + far * 3.5) * delta);
    if (far > 0.02) {
      bird.at.addScaledVector(aim, step / far);
      if (Math.hypot(aim.x, aim.z) > 0.05) {
        const want = Math.atan2(aim.x, aim.z);
        bird.heading += Math.atan2(Math.sin(want - bird.heading), Math.cos(want - bird.heading)) * Math.min(1, delta * 10);
      }
    }
    const settled = phase === 'freed' && bird.at.distanceTo(bird.home) < 0.03;
    bird.perched = THREE.MathUtils.clamp(bird.perched + (settled ? delta : -delta) * 4, 0, 1);
    if (settled) {
      flap = 0;
      // The one on the rim looks out over the garden; the one on the eggs
      // keeps turning to settle.
      bird.heading += k ? Math.sin(seconds * 0.5) * 0.004 : 0;
    }
    // Calling: alarmed while the nest's covered, singing once it's free.
    if ((bird.calls -= delta) < 0) {
      if (phase !== 'freed') { sound('alarm', bird.at, feet); bird.calls = 0.5 + random() * 1.4; }
      else if (settled && k === 1) { sound('song', bird.at, feet); bird.calls = 5 + random() * 6; }
      else bird.calls = 1;
    }
    const hover = flap ? Math.sin(seconds * 31 + k) * 0.02 : 0;
    bird.group.position.set(bird.at.x, bird.at.y + hover + (1 - bird.perched) * 0 + 0.3 * nest.bird * bird.perched, bird.at.z);
    bird.group.rotation.set(flap ? -0.5 : k ? 0 : 0.15, bird.heading, 0, 'YXZ');
    bird.group.scale.setScalar(nest.bird);
    // Wings beating, or folded along its back.
    bird.wings.forEach((wing, w) => {
      const side = w ? -1 : 1;
      wing.rotation.set(0, 0, 0);
      if (flap) wing.rotation.z = side * Math.sin(seconds * 62 + k * 2) * 1.1;
      else { wing.rotation.z = -side * 1.25; wing.rotation.y = side * 0.25; }
    });
  });
}

// For testing.
export const nestState = () => ({ phase, lifting: lift && { t: lift.t, held: lift.held }, planter: planter && planter.position.toArray(), eggs: eggs.toArray(), birds: birds.map(b => b.at.toArray()) });
