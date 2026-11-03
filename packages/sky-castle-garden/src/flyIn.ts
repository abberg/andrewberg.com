import * as THREE from 'three';
import { PLATFORM } from './level';

// Step 10: the opening. The camera starts low beside the start tower,
// looking up its side to the sky, rises straight up the column past the lip
// of the platform and comes to rest where the follow camera sits behind the
// robot, tipping down to the follow camera's angle as it arrives. Any key or
// click skips it, and the robot can't be moved until it's done.

export const flyIn = {
  // Seconds from the start to settling behind the robot.
  seconds: 6,
  // How far below its resting place it starts (m), and how far out from the
  // tower's side.
  rise: 40,
  out: 8,
};

export function createFlyIn() {
  let t = 0, done = false;
  const skip = () => { t = flyIn.seconds; };
  const listen = () => {
    addEventListener('keydown', skip, { once: true });
    addEventListener('pointerdown', skip, { once: true });
  };
  listen();
  const rest = new THREE.Vector3(), forward = new THREE.Vector3(), away = new THREE.Vector3();
  const target = new THREE.Vector3(), view = new THREE.Vector3();

  return {
    get flying() { return !done; },
    // From the start again (the tuning panel's button).
    replay() { t = 0; done = false; listen(); },
    // After the follow camera has placed itself: take over until landed.
    update(dt: number, camera: THREE.PerspectiveCamera) {
      if (done) return;
      t += dt;
      const u = Math.min(1, t / flyIn.seconds);
      if (u >= 1) {
        done = true;
        removeEventListener('keydown', skip);
        removeEventListener('pointerdown', skip);
        return;
      }
      // Where the follow camera rests, and what it looks at.
      rest.copy(camera.position);
      camera.getWorldDirection(forward);
      view.copy(rest).addScaledVector(forward, 9);
      // Rising, fast at first and settling gently; out from the tower's side
      // on the way up so it never clips the column.
      const climb = 1 - (1 - u) ** 3;
      away.set(rest.x, 0, rest.z - PLATFORM.z).normalize();
      camera.position.copy(rest).addScaledVector(away, flyIn.out * (1 - climb));
      camera.position.y -= flyIn.rise * (1 - climb);
      // Looking up the column at first, tipping down to the follow camera's
      // own view over the last part of the climb.
      target.copy(camera.position).addScaledVector(away, -8);
      target.y += 8;
      camera.lookAt(target.lerp(view, THREE.MathUtils.smootherstep(u, 0.2, 0.95)));
    },
  };
}
