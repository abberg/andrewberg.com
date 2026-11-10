import * as THREE from 'three';
import { type Food, scatter } from './fish';
import { painted } from './look';

// Feeding the fish: an orange thrown out over the moat comes apart in the
// air into its slices, which scatter, fall onto the water and float there
// until the fish come up and take them (fish.ts), each leaving a ring on
// the water where it lands and where it's taken.

export const slices = {
  // To an orange, how much bigger than life (so they read from the bank),
  // how hard they're flung apart (m/s), and how long one that's missed the
  // water or gone uneaten lies about (s).
  each: 8,
  scale: 1.3,
  apart: 1.1,
  stays: 60,
};

const SURFACE = -0.1, GRAVITY = 9.81;
type Slice = Food & { velocity: THREE.Vector3, spin: THREE.Vector3, turn: THREE.Quaternion, size: number, state: 'flying' | 'floating' | 'gone', age: number, bob: number };
type Ring = { at: THREE.Vector3, age: number, size: number };

let mesh: THREE.InstancedMesh | undefined, rings: THREE.InstancedMesh;
const all: Slice[] = [], rippling: Ring[] = [];
const MOST = 160, RINGS = 48;

// One slice of a fruit a metre across: an eighth of the ball, its peel
// outside and two flat cut faces meeting along the core. The material's
// colour is the peel's; the flesh is given as what to multiply it by.
function sliceGeometry() {
  const wide = Math.PI / 4, steps = 8, position: number[] = [], colour: number[] = [];
  const point = (theta: number, phi: number) => [-0.5 * Math.cos(phi) * Math.sin(theta), 0.5 * Math.cos(theta), 0.5 * Math.sin(phi) * Math.sin(theta)];
  const face = (a: number[], b: number[], c: number[], tint: number[]) => { position.push(...a, ...b, ...c); colour.push(...tint, ...tint, ...tint); };
  const peel = [1, 1, 1], flesh = [1.04, 1.42, 1.9];
  for (let k = 0; k < steps; k++) {
    const t0 = k / steps * Math.PI, t1 = (k + 1) / steps * Math.PI;
    for (let j = 0; j < 2; j++) {
      const p0 = j / 2 * wide, p1 = (j + 1) / 2 * wide;
      face(point(t0, p0), point(t1, p0), point(t1, p1), peel);
      face(point(t0, p0), point(t1, p1), point(t0, p1), peel);
    }
    // The cut faces, in to the core.
    face([0, 0, 0], point(t1, 0), point(t0, 0), flesh);
    face([0, 0, 0], point(t0, wide), point(t1, wide), flesh);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
  geometry.computeVertexNormals();
  // About its own middle, so it tumbles about itself.
  geometry.computeBoundingBox();
  const middle = geometry.boundingBox!.getCenter(new THREE.Vector3());
  return geometry.translate(-middle.x, -middle.y, -middle.z);
}

export function createSlices(scene: THREE.Scene) {
  mesh = new THREE.InstancedMesh(sliceGeometry(), painted([0xf08a2c, 0xb04a34], { vertexColors: true, side: THREE.DoubleSide }), MOST);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
  // Rings on the water: flat, white, growing and thinning away.
  rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), RINGS);
  rings.count = 0;
  rings.frustumCulled = false;
  rings.renderOrder = 5;
  rings.userData.unreflected = true;
  scene.add(rings);
}

const ring = (at: THREE.Vector3, size: number) => {
  if (rippling.length >= RINGS) rippling.shift();
  rippling.push({ at: new THREE.Vector3(at.x, SURFACE + 0.02, at.z), age: 0, size });
};

let seed = 9973;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// An orange coming apart: where it is, how it's moving and how big it was.
export function burst(at: THREE.Vector3, velocity: THREE.Vector3, size: number) {
  for (let k = 0; k < slices.each; k++) {
    if (all.length >= MOST) all.splice(all.findIndex(s => s.state !== 'flying'), 1);
    // Flung out from the middle, each the way it faced in the fruit.
    const a = k / slices.each * Math.PI * 2 + random() * 0.5, out = new THREE.Vector3(Math.cos(a), (random() - 0.35) * 0.9, Math.sin(a));
    all.push({
      at: at.clone().addScaledVector(out, size * 0.2), eaten: false,
      velocity: velocity.clone().addScaledVector(out, slices.apart * (0.45 + random() * 0.55)),
      spin: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(14),
      turn: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)),
      size: size * slices.scale, state: 'flying', age: 0, bob: random() * 6,
    });
  }
}

const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(), spun = new THREE.Quaternion(), axis = new THREE.Vector3();
const flat = new THREE.Quaternion();
// water: whether a point on the ground is over water (fruit.ts).
export function updateSlices(delta: number, seconds: number, water: (x: number, z: number) => boolean) {
  if (!mesh) return;
  const landed: Slice[] = [];
  for (const slice of all) {
    slice.age += delta;
    if (slice.state === 'flying') {
      slice.velocity.y -= GRAVITY * delta;
      slice.at.addScaledVector(slice.velocity, delta);
      const turned = slice.spin.length() * delta;
      if (turned > 0) slice.turn.premultiply(spun.setFromAxisAngle(axis.copy(slice.spin).normalize(), turned));
      if (slice.at.y > SURFACE) continue;
      // Onto the water, to float; anywhere else, it's lost.
      if (!water(slice.at.x, slice.at.z)) { slice.state = 'gone'; continue; }
      slice.state = 'floating';
      slice.age = 0;
      slice.at.y = SURFACE;
      ring(slice.at, 0.55);
      landed.push(slice);
    } else if (slice.state === 'floating') {
      if (slice.eaten) { slice.state = 'gone'; ring(slice.at, 0.8); continue; }
      if (slice.age > slices.stays) { slice.state = 'gone'; slice.eaten = true; continue; }
      // Settling on its side, bobbing, drifting to a stop.
      slice.velocity.y = 0;
      slice.velocity.multiplyScalar(Math.exp(-delta * 2.5));
      slice.at.x += slice.velocity.x * delta * 0.3;
      slice.at.z += slice.velocity.z * delta * 0.3;
      slice.at.y = SURFACE + 0.02 + Math.sin(seconds * 2.2 + slice.bob) * 0.015;
      flat.setFromEuler(new THREE.Euler(Math.PI / 2, slice.bob, 0, 'YXZ'));
      slice.turn.slerp(flat, 1 - Math.exp(-delta * 4));
    }
  }
  if (landed.length) scatter(landed);
  for (let k = all.length - 1; k >= 0; k--) if (all[k].state === 'gone') all.splice(k, 1);
  all.forEach((slice, k) => mesh!.setMatrixAt(k, matrix.compose(slice.at, slice.turn, scale.setScalar(slice.size))));
  mesh.count = all.length;
  mesh.instanceMatrix.needsUpdate = true;
  // The rings: spreading, and thinning to nothing as they go.
  for (let k = rippling.length - 1; k >= 0; k--) if ((rippling[k].age += delta) > 0.9) rippling.splice(k, 1);
  rippling.forEach((r, k) => {
    const t = r.age / 0.9, wide = r.size * (0.25 + 0.75 * Math.sqrt(t));
    rings.setMatrixAt(k, matrix.compose(r.at, flat.identity(), scale.set(wide, 1, wide)));
  });
  rings.count = rippling.length;
  rings.instanceMatrix.needsUpdate = true;
  (rings.material as THREE.MeshBasicMaterial).opacity = 0.75;
}

// Whether there's anything in the air or freshly on the water to watch.
export const watched = () => all.some(s => s.state === 'flying' || (s.state === 'floating' && s.age < 14));
// For testing: how many are in the air, afloat, and how many rings show.
export const sliceCount = () => ({ flying: all.filter(s => s.state === 'flying').length, floating: all.filter(s => s.state === 'floating').length });
