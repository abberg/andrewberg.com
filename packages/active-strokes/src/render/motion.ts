import * as THREE from 'three/webgpu';
import { makeSeamless } from './seamless';

// The walk, with the swipe attack layered over it now and then. The mixer
// plays both at once: the walk's lower half (hips and legs) always at full
// weight, and the upper half (body_control and everything on it) shared
// between the walk and the swipe, whose weight eases up as the swipe starts
// and back down as it ends. So the legs never stop walking while the arms
// swing through the attack.
//
// After the strike, the attack holds its final pose for six seconds
// (x014_020, barely moving) and then recovers to a standing pose (x014_021).
// Neither suits a robot that's still walking, so the swipe is cut short:
// swipeHold seconds into the hold, it starts easing back into the walk.
export const motionParams = {
  // Walk cycles between swipes; 0 for none.
  swipeEvery: 2,
  // Seconds of the held pose after the strike before easing back.
  swipeHold: 0.3,
};

const walkName = 'charanim/l011';
// The swipe's four clips, played back to back.
const swipeNames = ['attackanim/x014_000', 'attackanim/x014_010', 'attackanim/x014_020', 'attackanim/x014_021'];
// Seconds the swipe's weight takes to ease in and out.
const easeIn = 0.4, easeOut = 0.8;
// Seconds between clips in the concatenated swipe (see concatenate).
const gap = 1 / 60;

export function createMotion(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const byName = (name: string) => {
    const clip = clips.find(c => c.name === name);
    if (!clip) throw new Error(`No ${name} in the model`);
    return clip;
  };
  const upperBones = new Set<string>();
  model.getObjectByName('body_control')!.traverse(object => upperBones.add(object.name));
  const isUpper = (track: THREE.KeyframeTrack) => upperBones.has(track.name.slice(0, track.name.lastIndexOf('.')));
  const half = (clip: THREE.AnimationClip, upper: boolean) =>
    new THREE.AnimationClip(`${clip.name} ${upper ? 'upper' : 'lower'}`, clip.duration, clip.tracks.filter(t => isUpper(t) === upper));

  const walk = byName(walkName);
  makeSeamless(walk);
  const swipeClips = swipeNames.map(byName);
  const swipe = half(concatenate('swipe', swipeClips), true);
  // When the strike is over and the hold begins: after the first two clips.
  const struck = swipeClips[0].duration + gap + swipeClips[1].duration + gap;

  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(half(walk, false)).play();
  const walkUpper = mixer.clipAction(half(walk, true)).play();
  const swipeAction = mixer.clipAction(swipe).setLoop(THREE.LoopOnce, 1);
  swipeAction.clampWhenFinished = true;
  swipeAction.setEffectiveWeight(0);

  // Seconds of walk since the last swipe ended, and of the current swipe.
  let walked = 0, swiping = -1;
  const startSwipe = () => {
    swiping = 0;
    swipeAction.reset().play();
  };

  return {
    // Swipe now, whatever the schedule says.
    swipe() { if (swiping < 0) startSwipe(); },
    update(delta: number) {
      if (swiping < 0) {
        walked += delta;
        if (motionParams.swipeEvery > 0 && walked >= motionParams.swipeEvery * walk.duration) startSwipe();
      }
      const end = Math.min(swipe.duration, struck + motionParams.swipeHold + easeOut);
      if (swiping >= 0) {
        swiping += delta;
        if (swiping >= end) { swiping = -1; walked = 0; swipeAction.stop(); }
      }
      const t = Math.max(swiping, 0);
      const weight = swiping < 0 ? 0 : Math.max(0, Math.min(1, t / easeIn, (end - t) / easeOut));
      const smooth = weight * weight * (3 - 2 * weight);
      swipeAction.setEffectiveWeight(smooth);
      walkUpper.setEffectiveWeight(1 - smooth);
      mixer.update(delta);
    },
  };
}

// Clips one after another as one clip. They share their tracks (all the
// skeleton's channels), and each starts where the last ended, a sixtieth of
// a second on, so interpolation bridges the small mismatches between them.
function concatenate(name: string, clips: THREE.AnimationClip[]) {
  const tracks = clips[0].tracks.map(first => {
    const times: number[] = [], values: number[] = [];
    let offset = 0;
    for (const clip of clips) {
      const track = clip.tracks.find(t => t.name === first.name);
      if (!track) throw new Error(`${clip.name} has no ${first.name}`);
      for (const time of track.times) times.push(time + offset);
      values.push(...track.values);
      offset += clip.duration + gap;
    }
    const Track = first.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
    return new Track(first.name, times, values);
  });
  const duration = clips.reduce((total, clip) => total + clip.duration, 0) + gap * (clips.length - 1);
  return new THREE.AnimationClip(name, duration, tracks);
}
