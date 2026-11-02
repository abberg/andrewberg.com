import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

// The robot model (blender/robot.py builds it and exports public/robot.glb):
// about 4 m tall, feet at the origin, facing −z, every part rigid on one bone.
// Its clips are in place, and this plays them to match what the controller
// does.

// Metres covered in one walk and one run cycle, as robot.py makes them. Played
// at the speed the robot actually covers ground, the feet don't slide.
const STRIDE = { walk: 2.2, run: 2.4 };
// The bones the push takes over, the rest stay on the walk.
const UPPER = /^(spine|head|upperarm|forearm|hand)/;
// Seconds to fade a clip in or out.
const FADE = 0.25;

export type RobotState = {
  // How fast the feet are covering ground, m/s, and the walk and run speeds.
  speed: number;
  walk: number;
  run: number;
  // How fast it's turning, radians a second.
  turning: number;
  pushing: boolean;
  // How far through a step-over, 0 to 1, or null.
  stepping: number | null;
};

export function createRobot(gltf: GLTF) {
  const object = gltf.scene;
  object.traverse(child => {
    if (!(child as THREE.Mesh).isMesh) return;
    child.castShadow = true;
    // The arms reach well outside the bind pose's bounds.
    child.frustumCulled = false;
  });
  const mixer = new THREE.AnimationMixer(object);
  const clip = (name: string) => gltf.animations.find(c => c.name === name)!;
  // A clip split into the legs and hips, and the upper body, so the push can
  // take over the arms while the legs keep walking.
  const half = (name: string, upper: boolean) => {
    const whole = clip(name);
    const tracks = whole.tracks.filter(track => UPPER.test(track.name) === upper);
    return mixer.clipAction(new THREE.AnimationClip(`${name}.${upper ? 'upper' : 'lower'}`, whole.duration, tracks));
  };
  const loops = ['idle', 'walk', 'run', 'turn'] as const;
  const lower = Object.fromEntries(loops.map(name => [name, half(name, false)])) as Record<typeof loops[number], THREE.AnimationAction>;
  const upper = Object.fromEntries(loops.map(name => [name, half(name, true)])) as Record<typeof loops[number], THREE.AnimationAction>;
  const push = mixer.clipAction(clip('push'));
  const stepOver = mixer.clipAction(clip('stepOver'));
  for (const action of [...Object.values(lower), ...Object.values(upper), push, stepOver]) action.play().setEffectiveWeight(0);
  // The walk and run are posed by hand from how far it's gone, and the
  // step-over from how far through it the controller is, not by the clock.
  for (const name of ['walk', 'run'] as const) lower[name].timeScale = upper[name].timeScale = 0;
  stepOver.timeScale = 0;

  // Weights, eased towards their targets.
  const weight = { idle: 1, walk: 0, run: 0, turn: 0, push: 0, step: 0 };
  let phase = 0;
  const ease = (from: number, to: number, dt: number) => from + THREE.MathUtils.clamp(to - from, -dt / FADE, dt / FADE);

  return {
    object,
    update(dt: number, state: RobotState) {
      const { speed, walk, run } = state;
      // Walk up to walking pace, then into the run; turning on the spot when
      // it's standing still and turning.
      const moving = THREE.MathUtils.clamp(speed / walk, 0, 1);
      const running = THREE.MathUtils.clamp((speed - walk) / (run - walk), 0, 1);
      const spinning = (1 - moving) * THREE.MathUtils.clamp((Math.abs(state.turning) - 0.15) / 0.3, 0, 1);
      weight.walk = moving * (1 - running);
      weight.run = moving * running;
      weight.turn = ease(weight.turn, spinning, dt);
      weight.idle = Math.max(0, 1 - moving - weight.turn);
      weight.push = ease(weight.push, state.pushing ? 1 : 0, dt);
      weight.step = state.stepping === null ? ease(weight.step, 0, dt) : 1;

      // One phase drives both the walk and the run, at a stride between theirs.
      phase = (phase + speed * dt / THREE.MathUtils.lerp(STRIDE.walk, STRIDE.run, running)) % 1;
      for (const name of ['walk', 'run'] as const) lower[name].time = upper[name].time = phase * lower[name].getClip().duration;
      // Just short of the end, which would wrap round to the start.
      if (state.stepping !== null) stepOver.time = Math.min(state.stepping, 0.999) * stepOver.getClip().duration;

      const free = 1 - weight.step;
      for (const name of loops) {
        lower[name].setEffectiveWeight(weight[name] * free);
        upper[name].setEffectiveWeight(weight[name] * free * (1 - weight.push));
      }
      push.setEffectiveWeight(weight.push * free);
      stepOver.setEffectiveWeight(weight.step);
      mixer.update(dt);
    },
  };
}
export type Robot = ReturnType<typeof createRobot>;
