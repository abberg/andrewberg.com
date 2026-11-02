import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { painted } from './look';

// Step 7: the statue and the low arched fence, as in the garden painting.

// Bronze gone green, as the statue is painted.
export const patina = painted([0x9cba86, 0x4f7480]);

// A limb or staff as a capsule from one point to another.
function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const length = from.distanceTo(to);
  return new THREE.CapsuleGeometry(radius, length, 4, 10)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()))
    .translate(...from.clone().lerp(to, 0.5).toArray());
}

// A robed figure about 3 m tall standing on the origin, facing -z: a long
// robe flaring to the ground, the left arm hanging at its side, the right
// raised high holding a staff up.
export function statueGeometry() {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const robe = new THREE.LatheGeometry([[0, 0], [0.56, 0], [0.5, 0.3], [0.42, 1], [0.36, 1.6], [0.38, 2.1], [0.4, 2.3], [0.3, 2.45], [0, 2.5]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 16).scale(1, 1, 0.75);
  const head = new THREE.SphereGeometry(0.19, 12, 8).scale(0.9, 1.1, 1).translate(0, 2.72, -0.03);
  const shoulder = v(0.36, 2.3, 0), elbow = v(0.62, 2.75, -0.05), hand = v(0.7, 3.25, -0.1);
  const parts = [
    robe, head,
    limb(v(0, 2.4, 0), v(0, 2.6, -0.02), 0.09),
    // The right arm up, and the staff it holds.
    limb(shoulder, elbow, 0.1), limb(elbow, hand, 0.085),
    limb(v(0.66, 2.7, -0.1), v(0.78, 4.1, -0.12), 0.035),
    // The left arm down by the side.
    limb(v(-0.36, 2.3, 0), v(-0.46, 1.8, -0.04), 0.1), limb(v(-0.46, 1.8, -0.04), v(-0.44, 1.35, -0.12), 0.085),
  ].map(g => g.toNonIndexed());
  for (const g of parts) g.deleteAttribute('uv');
  return mergeGeometries(parts)!;
}

// One bay of the fence: a block spanning from the middle of one pier to the
// middle of the next, with a round arch cut out of its underside, sitting
// on the piers' tops. Centred along x, standing on the origin, depth deep.
export function archBlockGeometry(span: number, opening: number, height: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2, 0);
  shape.lineTo(-opening / 2, 0);
  shape.absarc(0, 0, opening / 2, Math.PI, 0, true);
  shape.lineTo(span / 2, 0);
  shape.lineTo(span / 2, height);
  shape.lineTo(-span / 2, height);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 16 })
    .translate(0, 0, -depth / 2);
}
