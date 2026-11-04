import * as THREE from 'three';

// The robot's footsteps: a thud each time a foot comes down, found from the
// animation itself (each foot bone's height above the robot's feet, so the
// walk, the run and the step-over all land on time), one of four recorded
// steps each time, a little higher or lower and louder or softer so they
// don't repeat, louder the faster it goes and quieter the further off the
// camera is. Browsers only let a page make sound once it's been clicked or
// a key pressed, so it starts when the garden's entered (start.ts). If the sounds aren't there (they're kept
// out of git), it's silent and nothing else changes.

export const footsteps = { volume: 0.01, muted: false };

const SOUNDS = [1, 2, 3, 4].map(k => `./sounds/step-${k}.m4a`);
// A foot is down once its bone is this close to where it stands planted
// (m), and lifted again once it's this far above it.
const DOWN = 0.015, LIFTED = 0.08;

export function createFootsteps(robot: THREE.Object3D) {
  const feet = ['footL', 'footR'].map(name => robot.getObjectByName(name)).filter(Boolean) as THREE.Object3D[];
  // Where each foot's bone stands planted, above the robot's feet, as in its
  // rest pose.
  robot.updateMatrixWorld(true);
  const at = new THREE.Vector3(), base = new THREE.Vector3().setFromMatrixPosition(robot.matrixWorld);
  const standing = feet.map(foot => at.setFromMatrixPosition(foot.matrixWorld).y - base.y);
  const down = feet.map(() => true);

  let context: AudioContext | undefined, buffers: AudioBuffer[] = [], next = 0;
  const start = () => {
    if (context) return;
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    Promise.all(SOUNDS.map(url => fetch(url)
      .then(response => response.ok ? response.arrayBuffer() : Promise.reject())
      .then(data => context!.decodeAudioData(data))))
      .then(loaded => { buffers = loaded; })
      .catch(() => { buffers = []; });
  };

  const play = (loudness: number) => {
    if (!context || !buffers.length || footsteps.muted || footsteps.volume <= 0) return;
    // In turn, but never the same one twice running.
    next = (next + 1 + Math.floor(Math.random() * (buffers.length - 1))) % buffers.length;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffers[next];
    source.playbackRate.value = 0.92 + Math.random() * 0.16;
    gain.gain.value = footsteps.volume * loudness * (0.85 + Math.random() * 0.15);
    source.connect(gain).connect(context.destination);
    source.start();
  };

  return {
    // From the click or key that enters the garden.
    start,
    // After the robot's been posed for this frame: pace is its speed as a
    // share of a run.
    update(camera: THREE.Camera, pace: number) {
      base.setFromMatrixPosition(robot.matrixWorld);
      const away = camera.position.distanceTo(base);
      feet.forEach((foot, k) => {
        const height = at.setFromMatrixPosition(foot.matrixWorld).y - base.y - standing[k];
        if (down[k] && height > LIFTED) down[k] = false;
        else if (!down[k] && height < DOWN) {
          down[k] = true;
          play((0.7 + 0.5 * Math.min(1, pace)) * THREE.MathUtils.clamp(10 / away, 0.3, 1));
        }
      });
    },
  };
}
