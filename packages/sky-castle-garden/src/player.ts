import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// The robot stands about 4 m tall. Until it's modelled it's a capsule, with a
// visor to show which way it faces (−z at yaw 0).
export const HEIGHT = 4, RADIUS = 0.8;

export const movement = {
  walk: 1.6,
  run: 3,
  // Seconds from standing to full speed, and back.
  accelerate: 0.4,
  // How fast it turns to face the way it's asked to go, in degrees a second.
  turn: 150,
};

const GRAVITY = 9.81;

export function createPlayer(world: RAPIER.World, scene: THREE.Scene, spawn: { x: number; y: number; z: number; yaw: number }) {
  // Spawned a little above the ground: starting in contact, it sinks.
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + HEIGHT / 2 + 0.1, spawn.z));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(HEIGHT / 2 - RADIUS, RADIUS), body);
  const controller = world.createCharacterController(0.02);
  // Steps, rims and low slabs up to 0.5 m need no special move.
  controller.enableAutostep(0.5, 0.3, false);
  controller.enableSnapToGround(0.5);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(40));

  const mesh = new THREE.Group();
  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.8 }),
  );
  capsule.position.y = HEIGHT / 2;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), new THREE.MeshStandardMaterial({ color: 0x1f1f1f }));
  visor.position.set(0, HEIGHT - 0.6, -RADIUS + 0.1);
  mesh.add(capsule, visor);
  mesh.traverse(object => { object.castShadow = true; });
  scene.add(mesh);

  // Where the feet are and which way it faces, at the last two physics steps,
  // so frames between steps can be drawn in between.
  const feet = new THREE.Vector3(spawn.x, spawn.y, spawn.z), previous = feet.clone();
  let yaw = spawn.yaw, previousYaw = yaw;
  let speed = 0, fall = 0;
  const desired = new THREE.Vector3();

  return {
    collider,
    feet,
    // A fixed step. direction is the world-space way to go on the ground
    // (x, z), at most 1 long.
    step(dt: number, direction: THREE.Vector2, running: boolean) {
      previous.copy(feet);
      previousYaw = yaw;
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

      fall = controller.computedGrounded() ? Math.min(fall, 0) : fall;
      fall -= GRAVITY * dt;
      desired.set(-Math.sin(yaw) * speed * dt, fall * dt, -Math.cos(yaw) * speed * dt);
      controller.computeColliderMovement(collider, desired);
      const moved = controller.computedMovement();
      if (controller.computedGrounded()) fall = 0;
      const at = body.translation();
      body.setNextKinematicTranslation({ x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z });
      feet.set(at.x + moved.x, at.y + moved.y - HEIGHT / 2, at.z + moved.z);
    },
    // Back to the start, for a fall off the edge.
    reset() {
      body.setTranslation({ x: spawn.x, y: spawn.y + HEIGHT / 2 + 0.1, z: spawn.z }, true);
      feet.set(spawn.x, spawn.y, spawn.z);
      previous.copy(feet);
      yaw = previousYaw = spawn.yaw;
      speed = fall = 0;
    },
    // Place the mesh between the last two steps.
    draw(alpha: number) {
      mesh.position.lerpVectors(previous, feet, alpha);
      mesh.rotation.y = previousYaw + (yaw - previousYaw) * alpha;
    },
    get mesh() { return mesh; },
    // Which way it faces, and how fast it's going as a share of a run.
    get yaw() { return yaw; },
    get pace() { return speed / movement.run; },
  };
}
export type Player = ReturnType<typeof createPlayer>;
