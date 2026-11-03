import * as THREE from 'three';

// Step 10: the opening fly-in. The camera starts far out and high over the
// clouds to the north, looking at the castle floating beyond the garden,
// sweeps down past the start tower and settles exactly where the follow
// camera sits behind the robot, turning from the castle to the robot only in
// the last part. Any key or click skips it, and the robot can't be moved
// until it's done.

export const flyIn = {
  // Seconds from the start to settling behind the robot.
  seconds: 9,
};
// Where it starts and passes through on the way in; the last point is the
// follow camera's own, each frame.
const PATH = [new THREE.Vector3(-110, 70, -230), new THREE.Vector3(-55, 38, -135), new THREE.Vector3(-16, 14, -68)];
// What it looks at first: the castle, over the gate.
const CASTLE = new THREE.Vector3(0, 40, 90);

export function createFlyIn() {
  let t = 0, done = false;
  const skip = () => { t = flyIn.seconds; };
  const listen = () => {
    addEventListener('keydown', skip, { once: true });
    addEventListener('pointerdown', skip, { once: true });
  };
  listen();
  const curve = new THREE.CatmullRomCurve3([...PATH.map(p => p.clone()), new THREE.Vector3()], false, 'centripetal');
  const position = new THREE.Vector3(), target = new THREE.Vector3(), pivot = new THREE.Vector3(), forward = new THREE.Vector3();

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
      // The follow camera's pose: where it is, and the pivot it looks at.
      curve.points[curve.points.length - 1].copy(camera.position);
      camera.getWorldDirection(forward);
      pivot.copy(camera.position).addScaledVector(forward, 9);
      // Slow out, slow in.
      const eased = u * u * u * (u * (u * 6 - 15) + 10);
      curve.getPoint(eased, position);
      target.lerpVectors(CASTLE, pivot, THREE.MathUtils.smootherstep(u, 0.45, 1));
      camera.position.copy(position);
      camera.lookAt(target);
    },
  };
}
