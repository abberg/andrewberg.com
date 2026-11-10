import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BODY_GROUPS, CAMERA_GROUPS, FEET_GROUPS } from './level';
import type { Robot } from './robot';

// The robot stands about 4 m tall, and collides as a capsule.
export const HEIGHT = 4, RADIUS = 0.8;

export const movement = {
  walk: 1.1,
  run: 3,
  // Seconds from standing to full speed, and back.
  accelerate: 0.4,
  // How fast it turns to face the way it's asked to go, in degrees a second.
  turn: 150,
  // The most it shoves with, in kN, and how long a step-over takes.
  push: 250,
  stepOver: 1.5,
};

const GRAVITY = 9.81;
// What it steps over rather than walks round: 0.5 to 1.6 m tall (lower, it
// just walks up) and up to 2.5 m deep, once it's been held up against it for
// a moment. Stones that low are stepped over rather than shoved, unless
// they're light (urns, loose drums), which it just bowls along.
const STEP = { low: 0.5, high: 1.6, deep: 2.5, held: 0.3, light: 5000 };
// How high up it shoves, above its feet: about its hands.
const REACH = 2.5;

export function createPlayer(world: RAPIER.World, scene: THREE.Scene, spawn: { x: number; y: number; z: number; yaw: number }, robot: Robot) {
  // Spawned a little above the ground: starting in contact, it sinks.
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + HEIGHT / 2 + 0.1, spawn.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HEIGHT / 2 - RADIUS, RADIUS), body);
  const controller = world.createCharacterController(0.02);
  // Steps, rims and low slabs up to 0.5 m need no special move.
  controller.enableAutostep(0.5, 0.3, true);
  controller.enableSnapToGround(0.5);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(40));

  const mesh = new THREE.Group().add(robot.object);
  scene.add(mesh);

  // Where the feet are and which way it faces, at the last two physics steps,
  // so frames between steps can be drawn in between.
  const feet = new THREE.Vector3(spawn.x, spawn.y, spawn.z), previous = feet.clone();
  let yaw = spawn.yaw, previousYaw = yaw;
  let speed = 0, fall = 0;
  // For the animation: how fast the feet are really covering ground (less
  // than speed when it's held up), and whether it shoved anything last step.
  let ground = 0, pushing = false;
  // How steeply it's climbing (rise over run). Going up a slope, the
  // controller slides what it's asked for along the slope and it covers
  // less ground; asked for a little more, it keeps its pace along the slope.
  let climb = 0;
  const desired = new THREE.Vector3();
  const ahead = new THREE.Vector3();

  // Shove every stone it's walking into: enough to carry the contact point
  // along at the robot's own speed, but never more than movement.push. Light
  // things are carried along at once; heavy ones take a while to give, and
  // a column, pushed high up, rocks and topples rather than slides.
  const shoved = new Set<number>();
  const push = (dt: number) => {
    shoved.clear();
    pushing = false;
    let low: boolean | undefined;
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const contact = controller.computedCollision(i);
      const stone = contact?.collider?.parent();
      if (!contact || !stone || !stone.isDynamic() || shoved.has(stone.handle)) continue;
      shoved.add(stone.handle);
      const toward = new THREE.Vector3(contact.witness1.x - feet.x, 0, contact.witness1.z - feet.z).normalize();
      if (toward.dot(ahead) < 0.3) continue;
      if (stone.mass() > STEP.light && (low ??= obstacle() <= STEP.high)) continue;
      const point = { x: contact.witness1.x, y: Math.min(feet.y + REACH, stone.translation().y + 0.5), z: contact.witness1.z };
      const v = stone.velocityAtPoint(point);
      const impulse = THREE.MathUtils.clamp(stone.mass() * (speed - (v.x * ahead.x + v.z * ahead.z)), 0, movement.push * 1000 * dt);
      stone.applyImpulseAtPoint({ x: ahead.x * impulse, y: 0, z: ahead.z * impulse }, point, true);
      pushing = true;
    }
  };

  // How far the ground or anything on it rises above the feet, d metres ahead.
  const probe = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const rise = (d: number) => {
    const from = STEP.high + 0.3;
    probe.origin = { x: feet.x + ahead.x * d, y: feet.y + from, z: feet.z + ahead.z * d };
    const hit = world.castRay(probe, from + 1, true, undefined, undefined, collider);
    return hit ? from - hit.timeOfImpact : -1;
  };
  const shape = new RAPIER.Capsule(HEIGHT / 2 - RADIUS, RADIUS);
  // A step-over under way: from and to the feet, how high to lift and how far through.
  let stepping: { from: THREE.Vector3; to: THREE.Vector3; lift: number; t: number } | null = null;
  let held = 0;
  // Held up by something low and short enough, with clear ground on the far
  // side: step over it.
  // The top of whatever's just in front.
  const obstacle = () => {
    let top = -1;
    for (let d = RADIUS + 0.05; d <= RADIUS + 0.7; d += 0.1) top = Math.max(top, rise(d));
    return top;
  };
  const tryStepOver = () => {
    const top = obstacle();
    if (top < STEP.low || top > STEP.high) return;
    let far = -1;
    for (let d = RADIUS + 0.2; d <= RADIUS + 0.2 + STEP.deep; d += 0.1) if (rise(d) < 0.3) { far = d; break; }
    if (far < 0) return;
    const reach = far + RADIUS + 0.15, ground = rise(reach);
    if (ground > 0.5 || ground < -0.5) return;
    const to = feet.clone().addScaledVector(ahead, reach);
    to.y += ground;
    if (world.intersectionWithShape({ x: to.x, y: to.y + HEIGHT / 2 + 0.05, z: to.z }, { x: 0, y: 0, z: 0, w: 1 }, shape,
      undefined, undefined, collider)) return;
    // Nor through anything standing on what it steps over: a column's plinth
    // is low enough, but the column on it is in the way. Carried across at
    // the height of the step, it must clear everything.
    const lift = top + 0.15;
    for (let k = 1; k < 6; k++) {
      const at = feet.clone().lerp(to, k / 6);
      if (world.intersectionWithShape({ x: at.x, y: feet.y + lift + HEIGHT / 2 + 0.05, z: at.z }, { x: 0, y: 0, z: 0, w: 1 }, shape,
        undefined, BODY_GROUPS, collider)) return;
    }
    stepping = { from: feet.clone(), to, lift, t: 0 };
    // Passing through what it steps over, without knocking it.
    collider.setSensor(true);
  };
  // Lift, carry across on a short arc, set down.
  const stepOver = (dt: number) => {
    const s = stepping!;
    s.t = Math.min(1, s.t + dt / movement.stepOver);
    const smooth = THREE.MathUtils.smoothstep;
    feet.lerpVectors(s.from, s.to, smooth(s.t, 0.3, 0.85));
    feet.y = THREE.MathUtils.lerp(s.from.y, s.to.y, smooth(s.t, 0.6, 1)) + s.lift * (smooth(s.t, 0, 0.35) - smooth(s.t, 0.7, 1));
    body.setNextKinematicTranslation({ x: feet.x, y: feet.y + HEIGHT / 2, z: feet.z });
    if (s.t < 1) return;
    stepping = null;
    collider.setSensor(false);
    speed *= 0.5;
    fall = 0;
  };

  // The ground under a point, for the feet (the steps) or the body (the
  // ramps over them): fixed things only, not the stonework it pushes about.
  const down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const groundAt = (x: number, y: number, z: number, depth: number, under: 'feet' | 'body') => {
    down.origin = { x, y, z };
    // Not solid: from inside something, it finds the bottom of it.
    const hit = world.castRay(down, depth, false, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
      under === 'feet' ? FEET_GROUPS : CAMERA_GROUPS, collider);
    return hit ? y - hit.timeOfImpact : null;
  };

  return {
    collider,
    feet,
    // A fixed step. direction is the world-space way to go on the ground
    // (x, z), at most 1 long.
    step(dt: number, direction: THREE.Vector2, running: boolean) {
      previous.copy(feet);
      previousYaw = yaw;
      if (stepping) return stepOver(dt);
      const asked = direction.length();
      const top = running ? movement.run : movement.walk;
      let target = 0;
      if (asked > 0) {
        // Turn towards where it's asked to go, and only drive forward as far
        // as it's already facing that way, so a sharp turn slows it down.
        const want = Math.atan2(-direction.x, -direction.y);
        const difference = THREE.MathUtils.euclideanModulo(want - yaw + Math.PI, Math.PI * 2) - Math.PI;
        const turn = THREE.MathUtils.degToRad(movement.turn) * dt;
        yaw += THREE.MathUtils.clamp(difference, -turn, turn);
        target = top * asked * Math.max(0, Math.cos(difference));
      }
      const rate = top / movement.accelerate * dt;
      speed += THREE.MathUtils.clamp(target - speed, -rate, rate);

      // Only falling once it's off the ground: pressed down into it every
      // step, the controller now and then stops dead against it for a step,
      // forward movement and all, and the walk stutters. Snapping to the
      // ground keeps it on slopes and down steps.
      fall = controller.computedGrounded() ? 0 : fall - GRAVITY * dt;
      ahead.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const along = Math.hypot(1, climb);
      desired.set(ahead.x * speed * dt * along, fall * dt, ahead.z * speed * dt * along);
      // (Not meeting the steps under the ramps, only the ramps.)
      controller.computeColliderMovement(collider, desired, undefined, BODY_GROUPS);
      const moved = controller.computedMovement();
      const grounded = controller.computedGrounded();
      if (grounded) fall = 0;
      push(dt);
      // Held up while trying to go forward (sliding along something doesn't
      // count): something's in the way.
      const progress = moved.x * ahead.x + moved.z * ahead.z;
      held = speed > 0.5 && grounded && progress < speed * dt * 0.3 ? held + dt : 0;
      if (held > STEP.held) {
        held = 0;
        tryStepOver();
        if (stepping) return;
      }
      // Covered along the ground, up and down slopes too, so the stride on
      // a stair is as long as on the flat.
      const covered = progress > 0 ? Math.hypot(progress, moved.y) : 0;
      ground = THREE.MathUtils.lerp(ground, covered / dt, 0.3);
      climb = THREE.MathUtils.lerp(climb, grounded && progress > speed * dt * 0.3 ? THREE.MathUtils.clamp(moved.y / progress, 0, 0.7) : 0, 0.2);
      const at = body.translation();
      body.setNextKinematicTranslation({ x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z });
      feet.set(at.x + moved.x, at.y + moved.y - HEIGHT / 2, at.z + moved.z);
    },
    // Back to the start, for a fall off the edge.
    reset() {
      if (stepping) { stepping = null; collider.setSensor(false); }
      body.setTranslation({ x: spawn.x, y: spawn.y + HEIGHT / 2 + 0.1, z: spawn.z }, true);
      feet.set(spawn.x, spawn.y, spawn.z);
      previous.copy(feet);
      yaw = previousYaw = spawn.yaw;
      speed = fall = ground = 0;
    },
    // Place the mesh between the last two steps.
    draw(alpha: number) {
      mesh.position.lerpVectors(previous, feet, alpha);
      mesh.rotation.y = previousYaw + (yaw - previousYaw) * alpha;
    },
    // Pose the robot to match, dt seconds on from the last frame.
    animate(dt: number, step: number) {
      robot.update(dt, {
        speed: stepping ? 0 : ground, walk: movement.walk, run: movement.run,
        turning: (yaw - previousYaw) / step, pushing: pushing && !stepping, stepping: stepping?.t ?? null,
        ground: groundAt,
      });
    },
    get mesh() { return mesh; },
    // Which way it faces, and how fast it's going as a share of a run.
    get yaw() { return yaw; },
    get pace() { return speed / movement.run; },
    get stepping() { return stepping !== null; },
  };
}
export type Player = ReturnType<typeof createPlayer>;
