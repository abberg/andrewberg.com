import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CAMERA_GROUPS } from './level';

export const follow = {
  // How far back, in metres, and the wheel's range.
  distance: 9,
  nearest: 5,
  farthest: 14,
  // The pivot, at the robot's shoulder, above its feet.
  shoulder: 3.2,
  // Seconds for the pivot to catch up with the robot.
  lag: 0.15,
  // Radians per pixel of mouse movement.
  sensitivity: 0.0025,
  // Seconds for the camera to swing round behind the robot as it turns, at a
  // run (slower at a walk, not at all standing still), and how long it leaves
  // the view alone after the mouse moves it.
  swing: 1.2,
  hold: 1.5,
};
// Pitch limits: 20° looking up to 60° looking down.
const LOWEST = THREE.MathUtils.degToRad(-20), HIGHEST = THREE.MathUtils.degToRad(60);

// Orbits a pivot at the robot's shoulder. Yaw 0 puts the camera on +z,
// looking along −z.
export function createFollowCamera(camera: THREE.PerspectiveCamera, world: RAPIER.World, ignore: RAPIER.Collider, start = 0) {
  // The camera's own radius, for keeping it out of the stonework.
  const probe = new RAPIER.Ball(0.4);
  let yaw = start, pitch = Math.atan2(2.5, follow.distance);
  let distance = follow.distance;
  const pivot = new THREE.Vector3();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let placed = false;
  let held = 0;

  return {
    get yaw() { return yaw; },
    // Straight back behind the robot, for a reset.
    behind(facing: number) { yaw = facing; placed = false; },
    look(dx: number, dy: number, zoom: number) {
      if (dx || dy) held = follow.hold;
      yaw -= dx * follow.sensitivity;
      pitch = THREE.MathUtils.clamp(pitch + dy * follow.sensitivity, LOWEST, HIGHEST);
      follow.distance = THREE.MathUtils.clamp(follow.distance + zoom, follow.nearest, follow.farthest);
    },
    update(dt: number, feet: THREE.Vector3, facing: number, pace: number) {
      // Swing round behind the robot as it heads away or across the view.
      // Heading back towards the camera leaves it be, rather than chasing round.
      held = Math.max(0, held - dt);
      const difference = THREE.MathUtils.euclideanModulo(facing - yaw + Math.PI, Math.PI * 2) - Math.PI;
      if (!held && follow.swing > 0) yaw += difference * THREE.MathUtils.smoothstep(Math.cos(difference), -0.5, 0.3) * pace * (1 - Math.exp(-dt / follow.swing));
      target.copy(feet).y += follow.shoulder;
      if (!placed) { pivot.copy(target); placed = true; }
      // The pivot trails the robot a little, so the camera lags its turns.
      pivot.lerp(target, 1 - Math.exp(-dt / follow.lag));
      direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      // Sweep a ball out from the pivot and stop short of the first thing it
      // hits: snap in at once, ease back out.
      const hit = world.castShape(pivot, { x: 0, y: 0, z: 0, w: 1 }, direction, probe, 0, follow.distance, true,
        undefined, CAMERA_GROUPS, ignore);
      const clear = hit ? Math.max(0.5, hit.time_of_impact - 0.1) : follow.distance;
      distance = clear < distance ? clear : distance + (clear - distance) * (1 - Math.exp(-dt / 0.4));
      camera.position.copy(pivot).addScaledVector(direction, distance);
      camera.lookAt(pivot);
    },
  };
}
