import * as THREE from 'three/webgpu';

// Makes a looping clip loop without a jump. The walk's last keyframe should
// repeat its first (the loop wraps straight from one to the other), and in
// almost every track it does, but the chest's height is 0.1 short of it and
// a few leg rotations are off by up to a degree. Every two steps the upper
// body would jolt, and the strokes, which follow screen motion, with it. The
// difference is spread over the last `seconds` of each such track instead.
export function makeSeamless(clip: THREE.AnimationClip, seconds = 0.25) {
  const delta = new THREE.Quaternion(), q = new THREE.Quaternion(), first = new THREE.Quaternion(), last = new THREE.Quaternion();
  const identity = new THREE.Quaternion();
  for (const track of clip.tracks) {
    const { times, values } = track;
    const size = track.getValueSize(), n = times.length, end = times[n - 1];
    if (n < 2) continue;
    const weight = (i: number) => Math.max(0, 1 - (end - times[i]) / seconds);
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      first.fromArray(values, 0);
      last.fromArray(values, (n - 1) * size);
      // The rotation that takes the last key to the first, eased in.
      delta.copy(last).invert().multiply(first);
      if (1 - Math.abs(delta.w) < 1e-9) continue;
      for (let i = 0; i < n; i++) {
        const w = weight(i);
        if (w > 0) q.fromArray(values, i * size).multiply(identity.clone().slerp(delta, w)).toArray(values, i * size);
      }
    } else {
      for (let k = 0; k < size; k++) {
        const gap = values[k] - values[(n - 1) * size + k];
        if (Math.abs(gap) < 1e-9) continue;
        for (let i = 0; i < n; i++) values[i * size + k] += gap * weight(i);
      }
    }
  }
}
