import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityFront } from './city';
import { EAST, EAST_LAWN, lawnSouth, POOLS, WEST, WEST_LAWN } from './level';
import { painted } from './look';

// Step 9: water lilies and petals, as in the plan: clusters of pads with a
// white flower here and there, round the pools' edges and in the quieter
// stretches of the side moats, and white petals scattered over the water,
// drifting slowly. Flat painted colour like the lawn.

const PAD = [0x7fb04e, 0x3e6c52] as const, FLOWER = [0xfdf8f0, 0xb4b6d8] as const, HEART = [0xf2cc52, 0xa88c58] as const;
// The water's levels: the moats' sheet and the pools'.
const MOAT = -0.1, POOL = 0.05;

// A pad: a disc with a notch cut to its middle, lying flat, radius 1.
const padGeometry = () => new THREE.CircleGeometry(1, 22, 0.28, Math.PI * 2 - 0.56).rotateX(-Math.PI / 2);

// A flower: two rings of pointed petals cupped upwards round a yellow heart,
// about 0.3 m across.
function flowerGeometry() {
  const petal = new THREE.CircleGeometry(1, 10).scale(0.045, 0.12, 1).translate(0, 0.11, 0);
  const petals: THREE.BufferGeometry[] = [];
  for (const [count, tilt, size, turn] of [[8, 1.05, 1, 0], [6, 0.55, 0.8, 0.3]]) {
    for (let k = 0; k < count; k++) {
      // Laid flat pointing out, then tipped up towards the middle.
      petals.push(petal.clone().scale(size, size, size).rotateX(-tilt).rotateY(turn + k * Math.PI * 2 / count));
    }
  }
  return mergeGeometries(petals.map(g => g.toNonIndexed()))!;
}

type Petal = { x: number, z: number, y: number, wander: number, speed: number, turn: number, phase: number };
let petals: THREE.InstancedMesh, floating: Petal[] = [];

export function createLilies(scene: THREE.Scene) {
  let s = 5113;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pads: THREE.Matrix4[] = [], flowers: THREE.Matrix4[] = [];
  const UP = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion(), at = new THREE.Vector3(), size = new THREE.Vector3();

  // A cluster round x, z, kept inside the water by fits(x, z, r).
  const cluster = (x: number, z: number, y: number, count: number, spread: number, fits: (x: number, z: number, r: number) => boolean) => {
    for (let k = 0; k < count; k++) {
      const a = random() * Math.PI * 2, d = spread * Math.sqrt(random()), r = 0.3 + random() ** 1.5 * 0.45;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!fits(px, pz, r)) continue;
      // Each a little higher than the last, so overlapping pads don't flicker.
      at.set(px, y + 0.01 + k * 0.003, pz);
      turn.setFromAxisAngle(UP, random() * Math.PI * 2);
      pads.push(new THREE.Matrix4().compose(at, turn, size.set(r, 1, r)));
      if (random() < 0.16) {
        turn.setFromAxisAngle(UP, random() * Math.PI * 2);
        flowers.push(new THREE.Matrix4().compose(at.clone().setY(at.y + 0.01), turn, size.setScalar(0.8 + random() * 0.5)));
      }
    }
  };

  // Round the pools' edges.
  for (const [x, z] of POOLS) {
    const fits = (px: number, pz: number, r: number) => Math.hypot(px - x, pz - z) < 5.2 - r;
    for (let c = 0; c < 4; c++) {
      const a = random() * Math.PI * 2, d = 2.8 + random() * 1.6;
      cluster(x + Math.cos(a) * d, z + Math.sin(a) * d, POOL, 5 + Math.floor(random() * 8), 1.2 + random(), fits);
    }
  }
  // Along the side moats, mostly by the banks, thinning to nothing towards
  // the castle.
  for (const [lawn, edge] of [[WEST_LAWN, WEST], [EAST_LAWN, EAST]]) {
    const fits = (px: number, _: number, r: number) => Math.min(Math.abs(px - lawn), Math.abs(px - edge)) > r + 0.15;
    for (let c = 0; c < 6; c++) {
      const z = 9 + random() ** 1.3 * 36, bank = random() < 0.65 ? lawn : edge;
      cluster(bank + Math.sign(edge - lawn) * (bank === lawn ? 1.2 : -1.2), z, MOAT, 6 + Math.floor(random() * 10), 1.4 + random() * 1.4, fits);
    }
  }
  // A few in the south moat, against the garden's side.
  for (const side of [-1, 1]) {
    for (let c = 0; c < 2; c++) {
      const x = side * (12 + random() * 22), z = lawnSouth(x) + 1.3;
      const fits = (px: number, pz: number, r: number) => pz > lawnSouth(px) + r + 0.15 && pz < cityFront(px) - r && Math.abs(px) > 6;
      cluster(x, z, MOAT, 5 + Math.floor(random() * 6), 1.3, fits);
    }
  }

  const padMesh = new THREE.InstancedMesh(padGeometry(), painted(PAD), pads.length);
  // Each pad a little lighter or darker, some yellower, so they don't read as stamped.
  const tint = new THREE.Color();
  pads.forEach((m, i) => {
    padMesh.setMatrixAt(i, m);
    const light = 0.85 + random() * 0.25, warm = random() * 0.12;
    padMesh.setColorAt(i, tint.setRGB(light * (1 + warm), light, light * (1 - warm)));
  });
  padMesh.receiveShadow = true;
  const flowerMesh = new THREE.InstancedMesh(flowerGeometry(), painted(FLOWER, { side: THREE.DoubleSide }), flowers.length);
  flowers.forEach((m, i) => flowerMesh.setMatrixAt(i, m));
  const heartMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 6).scale(1, 0.6, 1).translate(0, 0.03, 0), painted(HEART), flowers.length);
  flowers.forEach((m, i) => heartMesh.setMatrixAt(i, m));

  // Petals: little white ovals scattered over the pools and the moats.
  const scatter = (count: number, y: number, place: () => [number, number]) => {
    for (let k = 0; k < count; k++) {
      const [x, z] = place();
      floating.push({ x, z, y: y + 0.012, wander: 0.3 + random() * 0.6, speed: 0.03 + random() * 0.05, turn: random() * Math.PI * 2, phase: random() * 100 });
    }
  };
  for (const [x, z] of POOLS) scatter(45, POOL, () => {
    const a = random() * Math.PI * 2, d = 4.4 * Math.sqrt(random());
    return [x + Math.cos(a) * d, z + Math.sin(a) * d];
  });
  for (const [lawn, edge] of [[WEST_LAWN, WEST], [EAST_LAWN, EAST]]) scatter(130, MOAT, () => [
    lawn + (edge - lawn) * (0.12 + random() * 0.76), 8 + random() * 40,
  ]);
  scatter(80, MOAT, () => {
    const x = (random() < 0.5 ? -1 : 1) * (7 + random() * 36);
    return [x, lawnSouth(x) + 0.6 + random() * 2.5];
  });
  petals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 8).scale(0.04, 0.075, 1).rotateX(-Math.PI / 2),
    painted(FLOWER, { side: THREE.DoubleSide }), floating.length);
  petals.frustumCulled = false;

  for (const mesh of [padMesh, flowerMesh, heartMesh, petals]) {
    // Lying on the water: left out of its reflection.
    mesh.userData.unreflected = true;
    mesh.castShadow = mesh !== padMesh && mesh !== petals;
    scene.add(mesh);
  }
  updateLilies(0);
}

const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), place = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

// The petals wander slowly round where they were dropped, turning as they go.
export function updateLilies(seconds: number) {
  if (!petals) return;
  floating.forEach((p, i) => {
    const t = seconds * p.speed + p.phase;
    place.set(p.x + Math.sin(t) * p.wander, p.y, p.z + Math.sin(t * 0.73 + 1.3) * p.wander);
    turn.setFromAxisAngle(UP, p.turn + Math.sin(t * 0.5) * 1.2);
    petals.setMatrixAt(i, matrix.compose(place, turn, one));
  });
  petals.instanceMatrix.needsUpdate = true;
}
