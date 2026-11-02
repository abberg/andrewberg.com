import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drowned, painted } from './look';

// Step 9: white fish in the drowned streets, as in the film's flooded city:
// small schools nosing along the canals a few metres down, rising over the
// rooftops and dipping back into the streets, turning round at the ends of
// the moats. Painted flat white like everything else, so they sink into the
// water's colour the deeper they swim (look.ts, drowned()).

// One fish, nose along +x: a slim body and a forked tail, flat side on.
function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 12, 8).scale(0.36, 0.11, 0.07).translate(0.04, 0, 0);
  const tail = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    -0.26, 0, 0, -0.5, 0.15, 0, -0.42, 0, 0,
    -0.26, 0, 0, -0.42, 0, 0, -0.5, -0.15, 0,
  ], 3));
  tail.computeVertexNormals();
  // Fins: a dorsal one along the back.
  const fin = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
    0.1, 0.09, 0, -0.14, 0.17, 0, -0.18, 0.06, 0,
  ], 3));
  fin.computeVertexNormals();
  return mergeGeometries([body.deleteAttribute('uv').toNonIndexed(), tail, fin])!;
}

// A school: which run it swims, where along it, how fast and which way, how
// deep it likes to be, and where each of its fish keeps in it.
type School = { run: number[][], walked: number[], at: number, speed: number, way: number, depth: number, wander: number, y: number };
type Fish = { school: School, ahead: number, aside: number, below: number, position: THREE.Vector3, yaw: number, scale: number, phase: number };

const time = { value: 0 };
let mesh: THREE.InstancedMesh, fishes: Fish[] = [], roof: (x: number, z: number) => number = () => -Infinity;

// runs: points down the middle of each moat as [x, z, width]. roofAt: how high
// the drowned stonework comes at a point (or -Infinity over a street).
export function buildFish(scene: THREE.Scene, runs: number[][][], roofAt: (x: number, z: number) => number) {
  let s = 4219;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  roof = roofAt;
  for (const run of runs) {
    const walked = [0];
    run.slice(1).forEach(([x, z], k) => walked.push(walked[k] + Math.hypot(x - run[k][0], z - run[k][1])));
    for (let k = 0; k < 4; k++) {
      const school: School = {
        run, walked, at: random() * walked[walked.length - 1], speed: 0.7 + random() * 0.6, way: random() < 0.5 ? -1 : 1,
        depth: -2 - random() * 3.5, wander: random() * 100, y: -3,
      };
      const count = 3 + Math.floor(random() * 6);
      for (let f = 0; f < count; f++) {
        fishes.push({
          school, ahead: (random() - 0.5) * 3.5, aside: (random() - 0.5) * 2.4, below: (random() - 0.5) * 0.9,
          position: new THREE.Vector3(), yaw: 0, scale: 0.8 + random() * 0.45, phase: random() * 6,
        });
      }
    }
  }
  const material = drowned(painted([0xfbf8f0, 0xa8b8d0], { side: THREE.DoubleSide }));
  // The tail beats, the body following it in a wave from the head back.
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'uniform float uTime;\n#include <common>')
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        {
          float phase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.61;
          float bend = pow(clamp((0.2 - position.x) / 0.7, 0.0, 1.0), 1.6);
          transformed.z += sin(uTime * 7.0 + phase - position.x * 5.0) * 0.12 * bend;
        }`);
  };
  material.customProgramCacheKey = () => 'fish';
  mesh = new THREE.InstancedMesh(fishGeometry(), material, fishes.length);
  mesh.frustumCulled = false;
  scene.add(mesh);
  // Start each fish in its place.
  for (const fish of fishes) {
    const [x, y, z, heading] = place(fish);
    fish.position.set(x, y, z);
    fish.yaw = heading;
  }
  updateFish(0, 0);
}

// Where along its run a school is: the point, which way the run heads there,
// and its width.
function along(school: School, d: number) {
  const { run, walked } = school, end = walked[walked.length - 1];
  d = Math.max(0, Math.min(end, d));
  let k = walked.findIndex(w => w >= d);
  k = Math.max(1, k);
  const [ax, az, width] = run[k - 1], [bx, bz] = run[k], u = (d - walked[k - 1]) / Math.max(1e-6, walked[k] - walked[k - 1]);
  return [ax + (bx - ax) * u, az + (bz - az) * u, Math.atan2(bz - az, bx - ax), width];
}

// Where a fish wants to be: its place in the school, kept inside the moat and
// lifted over any rooftop below it.
function place(fish: Fish) {
  const school = fish.school, d = school.at + fish.ahead * school.way;
  const [x, z, heading, width] = along(school, d);
  const aside = Math.max(-0.38, Math.min(0.38, fish.aside / width)) * width;
  const px = x - Math.sin(heading) * aside, pz = z + Math.cos(heading) * aside;
  return [px, school.y + fish.below, pz, school.way > 0 ? heading : heading + Math.PI];
}

const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), size = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const target = new THREE.Vector3();

export function updateFish(seconds: number, delta: number) {
  if (!mesh) return;
  time.value = seconds;
  const schools = new Set(fishes.map(f => f.school));
  for (const school of schools) {
    const end = school.walked[school.walked.length - 1];
    school.at += school.speed * school.way * delta;
    // Turn round at the ends of the moat.
    if (school.at > end - 3) school.way = -1;
    if (school.at < 3) school.way = 1;
    // Rise over a rooftop ahead, sink back down over a street.
    const [x, z] = along(school, school.at + 3 * school.way);
    const wave = Math.sin(seconds * 0.23 + school.wander) * 0.8;
    const want = Math.min(-0.9, Math.max(school.depth + wave, roof(x, z) + 1.1));
    school.y += (want - school.y) * Math.min(1, delta * 0.8);
  }
  fishes.forEach((fish, i) => {
    const [x, y, z] = place(fish);
    target.set(x, y, z);
    const dx = target.x - fish.position.x, dz = target.z - fish.position.z, distance = Math.hypot(dx, dz);
    // Steer towards its place, turning no faster than a fish can, quicker
    // when it's fallen behind.
    if (distance > 0.05) {
      let change = Math.atan2(dz, dx) - fish.yaw;
      change = Math.atan2(Math.sin(change), Math.cos(change));
      fish.yaw += Math.max(-1.6 * delta, Math.min(1.6 * delta, change));
    }
    const speed = Math.min(2.4, distance * 1.2) * Math.max(0, Math.cos(Math.atan2(dz, dx) - fish.yaw));
    fish.position.x += Math.cos(fish.yaw) * speed * delta;
    fish.position.z += Math.sin(fish.yaw) * speed * delta;
    fish.position.y += (target.y - fish.position.y) * Math.min(1, delta * 1.5);
    const wobble = Math.sin(seconds * 3.5 + fish.phase) * 0.06;
    turn.setFromAxisAngle(UP, -fish.yaw + wobble);
    mesh.setMatrixAt(i, matrix.compose(fish.position, turn, size.setScalar(fish.scale)));
  });
  mesh.instanceMatrix.needsUpdate = true;
}
