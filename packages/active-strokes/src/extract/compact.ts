import * as THREE from 'three/webgpu';
import {
  Fn, If, atomicAdd, atomicStore, float, instanceIndex, instancedArray, ivec2, textureLoad, uint, uniform, vec2, vec4,
} from 'three/tsl';
import type { GBuffer } from '../render/gbuffer';
import type { Extraction } from './steerable';
import type { Samples as SnakeSamples } from '../snakes/samples';

// Most samples a frame can hold. The Behemoth at full screen makes ~15k.
export const capacity = 1 << 16;

// One frame's line samples, packed: position (px), tangent, velocity (px per
// frame), filter strength and distance from the camera. Pixels are y-down throughout.
export interface Samples extends SnakeSamples {
  // The rendered frame they came from, so gaps can be measured.
  frame: number;
  width: number;
  height: number;
}

// Packs the pixels that survived non-maxima suppression into a dense buffer,
// each thread taking a slot with atomicAdd (so the order changes from frame to
// frame, which the snakes don't mind), then reads it back without stalling.
export function createCompaction(renderer: THREE.WebGPURenderer, gbuffer: GBuffer, extraction: Extraction) {
  const points = instancedArray(capacity, 'vec4');
  const motion = instancedArray(capacity, 'vec4');
  const counter = instancedArray(1, 'uint').toAtomic();
  const width = uniform(0, 'uint');
  const height = uniform(0, 'uint');

  const reset = Fn(() => { atomicStore(counter.element(0), uint(0)); })().compute(1);

  const pack = Fn(() => {
    const pixel = ivec2(instanceIndex.mod(width).toInt(), instanceIndex.div(width).toInt());
    const sample = textureLoad(extraction.samples.value, pixel);
    If(sample.x.greaterThan(0), () => {
      const slot = atomicAdd(counter.element(0), uint(1));
      If(slot.lessThan(uint(capacity)), () => {
        // A line sample often sits just off the surface it outlines (on a
        // silhouette, on the background), where velocity is zero and depth is
        // the far plane. Velocity and depth come from the nearest surface in
        // the 3x3 neighbourhood instead: the one in front owns the edge.
        const best = ivec2(pixel).toVar();
        const nearest = float(1e30).toVar();
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const p = pixel.add(ivec2(dx, dy));
          const inside = p.x.greaterThanEqual(0).and(p.y.greaterThanEqual(0)).and(p.x.lessThan(width.toInt())).and(p.y.lessThan(height.toInt()));
          If(inside, () => {
            const d = gbuffer.distanceAt(p);
            If(d.lessThan(nearest), () => { nearest.assign(d); best.assign(p); });
          });
        }
        // NDC (y-up, 2 units across) to pixels (y-down).
        const velocity = gbuffer.velocityAt(best).mul(vec2(width, height)).mul(vec2(0.5, -0.5));
        points.element(slot).assign(vec4(vec2(pixel).add(0.5), sample.yz));
        motion.element(slot).assign(vec4(velocity, sample.x, nearest));
      });
    });
  })().compute(1);

  // A ring of readback targets, so a new frame can be read while earlier ones
  // are still mapping. Frames only get skipped if all of them are busy.
  const ring = Array.from({ length: 3 }, () => ({
    points: new THREE.ReadbackBuffer(capacity * 16),
    motion: new THREE.ReadbackBuffer(capacity * 16),
    counter: new THREE.ReadbackBuffer(4),
    busy: false,
  }));
  let latest: Samples | null = null;
  let frame = 0;
  const listeners: ((samples: Samples) => void)[] = [];

  async function read(slot: typeof ring[number], frame: number, w: number, h: number) {
    slot.busy = true;
    try {
      // Resolves with each ReadbackBuffer mapped; its .buffer is valid until release().
      const [count, p, m] = (await Promise.all([
        renderer.getArrayBufferAsync(counter.value, slot.counter),
        renderer.getArrayBufferAsync(points.value, slot.points),
        renderer.getArrayBufferAsync(motion.value, slot.motion),
      ])).map(target => target.buffer as ArrayBuffer);
      const n = Math.min(new Uint32Array(count)[0], capacity);
      const samples = {
        frame,
        count: n,
        width: w,
        height: h,
        points: new Float32Array(p, 0, n * 4).slice(),
        motion: new Float32Array(m, 0, n * 4).slice(),
      };
      // Readbacks can resolve out of order; never go backwards.
      if (!latest || frame > latest.frame) {
        latest = samples;
        for (const listener of listeners) listener(samples);
      }
    } finally {
      slot.points.release();
      slot.motion.release();
      slot.counter.release();
      slot.busy = false;
    }
  }

  return {
    // Run after the extraction passes have rendered this frame.
    update() {
      const w = gbuffer.width, h = gbuffer.height;
      width.value = w;
      height.value = h;
      pack.count = w * h;
      renderer.compute(reset);
      renderer.compute(pack);
      frame++;
      const slot = ring.find(slot => !slot.busy);
      if (slot) void read(slot, frame, w, h);
    },
    get latest() { return latest; },
    // The id the next update() will give its frame.
    get nextFrame() { return frame + 1; },
    onSamples(listener: (samples: Samples) => void) { listeners.push(listener); },
  };
}
