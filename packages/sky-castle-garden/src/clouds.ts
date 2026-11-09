import * as THREE from 'three';
import { horizon } from './look';

// Clouds, soft and puffy as the films paint them: heaped cumulus with flat
// bases and cauliflower tops, white where the sun catches them and blending
// softly into a cool grey-blue underneath. A ring of them in the sky round
// the level, and a lower layer drifting below the island, seen over the north
// edge and from the causeway.
//
// Each cloud is a cluster of soft spheres (the mesh-cluster clouds of the
// procedural-clouds skill), so they have real depth and turn as the camera
// moves round them. Every sphere is a camera-facing card shaded as a ball,
// feathered at its rim and broken up by noise, all of them in one draw call,
// furthest first. How much of the rest of its cloud lies towards the sun
// shades each one (a short light march, on the CPU), and the light is
// banded into the palette's three tones, like the rest of the painted look.

const SHADE = new THREE.Color('rgb(138, 158, 188)'), MID = new THREE.Color('rgb(208, 218, 232)'), LIT = new THREE.Color('rgb(252, 252, 248)');

// Each sphere: where it is, how big, the base of its cloud (cut flat there),
// how high up its cloud it is, 0 to 1, how much of its cloud lies towards the
// sun, and how much of the sky's colour it takes.
type Puff = { centre: THREE.Vector3, radius: number, base: number, height: number, shadow: number, haze: number, soft: number, cloud: Cloud };
// A cloud's puffs, its width, how far it is out from the point they turn
// about, and the camera turned back by its own drift, to sort it from.
type Cloud = { puffs: Puff[], width: number, out: number, eye: THREE.Vector3 };
const clouds: Cloud[] = [], puffs: Puff[] = [];
let attributes: Record<'centre' | 'shape' | 'tone' | 'rate', THREE.InstancedBufferAttribute> | undefined;
let material: THREE.ShaderMaterial | undefined, sunLight: THREE.DirectionalLight | undefined;
// How fast they drift round the level (rad/s; the tuning panel's), and the
// point they turn about.
// That's the turn of a cloud 500 m out. Parallax: at 1 every cloud moves at
// the same real speed, so the near ones cross the view faster than the far
// ones; at 0 they all turn together.
export const cloudLook = { drift: 0.006, parallax: 1 };
const rateOf = (cloud: Cloud) => (500 / Math.max(cloud.out, 250)) ** cloudLook.parallax;
const ROUND = new THREE.Vector3(0, 0, 40);
let turn = 0, lastSeconds = 0;

// A cumulus mound `width` across, its base at `at`, broadside on to the level
// from the angle `a` round it: big billows through the body, smaller ones
// heaped over its top so the outline is lumpy. The ones under the island,
// mostly seen from above, are deeper and filled out more, so their tops read
// as one mass rather than separate billows.
function cumulus(random: () => number, at: THREE.Vector3, a: number, width: number, haze: number, below: boolean): Cloud {
  const tall = width * (0.42 + random() * 0.2), deep = width * (below ? 0.7 + random() * 0.2 : 0.35 + random() * 0.2);
  // The dome: tallest in the middle, falling away to the ends.
  const top = (u: number) => tall * (1 - u * u) ** 0.7;
  const cloud: Cloud = { puffs: [], width, out: 0, eye: new THREE.Vector3() };
  const puff = (x: number, y: number, z: number, radius: number) => cloud.puffs.push({
    centre: new THREE.Vector3(x, y, z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a + Math.PI / 2).add(at),
    radius, base: at.y, height: 0, shadow: 0, haze, soft: 0,
    // The bank below drifts slower than the clouds overhead: parallax.
    cloud,
  });
  for (let i = 0; i < (below ? 26 : 16); i++) {
    const u = (random() * 2 - 1) * 0.9, r = width * (0.1 + 0.11 * (1 - Math.abs(u)) * (0.7 + random() * 0.6));
    puff(u * (width / 2 - r * 0.6), r * 0.55 + random() * Math.max(0, top(u) - r * 1.4), (random() * 2 - 1) * (deep / 2 - r * 0.5), r);
  }
  for (let i = 0; i < 14; i++) {
    const u = (random() * 2 - 1) * 0.85, r = width * (0.05 + 0.06 * random());
    puff(u * width / 2, Math.max(r * 0.6, top(u) - r * (0.4 + random() * 0.6)), (random() * 2 - 1) * deep * (below ? 0.4 : 0.3), r);
  }
  const highest = Math.max(...cloud.puffs.map(p => p.centre.y + p.radius));
  for (const p of cloud.puffs) p.height = (p.centre.y - at.y) / (highest - at.y);
  return cloud;
}

// How much of each sphere's cloud lies between it and the sun: a few steps
// towards the sun, adding up how deep inside the other spheres each lands.
const towards = new THREE.Vector3(), step = new THREE.Vector3(), lastSun = new THREE.Vector3();
function shadeClouds(sun: THREE.Vector3) {
  lastSun.copy(sun);
  for (const cloud of clouds) {
    for (const p of cloud.puffs) {
      let inside = 0;
      for (let k = 1; k <= 4; k++) {
        towards.copy(p.centre).addScaledVector(sun, p.radius * 0.5 + cloud.width * 0.09 * k);
        for (const q of cloud.puffs) {
          if (q === p) continue;
          inside += Math.max(0, 1 - step.subVectors(towards, q.centre).length() / q.radius);
        }
      }
      // Beer–Lambert: thicker cloud on the sun's side, deeper in shade.
      p.shadow = 1 - Math.exp(-inside * 0.9);
    }
  }
}

export function createClouds(scene: THREE.Scene, sun: THREE.DirectionalLight) {
  sunLight = sun;
  let s = 811;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cloud = (distance: number, y: number, width: number, a = random() * Math.PI * 2, below = false) => clouds.push(cumulus(
    random, new THREE.Vector3(Math.cos(a) * distance, y, Math.sin(a) * distance).add(ROUND), a, width,
    // Further off, more of the sky's colour.
    THREE.MathUtils.clamp((distance - 200) / 1200, 0.03, 0.35), below,
  ));
  // Thin over the whole dome: scattered evenly by direction, from just over
  // the horizon to straight overhead.
  for (let k = 0; k < 55; k++) {
    const up = Math.asin(0.08 + random() * 0.9), distance = 480 + random() * 260, a = random() * Math.PI * 2;
    clouds.push(cumulus(random, new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up)).multiplyScalar(distance).add(ROUND),
      a, 80 + random() * 110, THREE.MathUtils.clamp((distance - 200) / 1200, 0.03, 0.35), false));
  }
  // Below, a thick bank all round, rising with distance so its far tops reach
  // the horizon line and the sky is cloud all the way down from there.
  for (let k = 0; k < 90; k++) {
    const a = random() * Math.PI * 2, out = random() ** 0.7, distance = 230 + out * 620;
    const width = 110 + random() * 170;
    cloud(distance, THREE.MathUtils.lerp(-80, -8, out) - width * 0.55 - random() * 25, width, a, true);
  }
  // A few in the sky either side of the start tower as the opening looks up
  // it, from low beside its north side, so its first view isn't empty sky.
  const opening = new THREE.Vector3(0, -32, -53);
  for (let k = 0; k < 12; k++) {
    const side = k % 2 ? 1 : -1, round = Math.PI / 2 + side * (0.3 + random() * 0.45), up = 0.45 + random() * 0.8;
    const distance = 330 + random() * 150;
    const at = new THREE.Vector3(Math.cos(round) * Math.cos(up), Math.sin(up), Math.sin(round) * Math.cos(up)).multiplyScalar(distance).add(opening);
    clouds.push(cumulus(random, at, round, 110 + random() * 80, THREE.MathUtils.clamp((distance - 200) / 1200, 0.03, 0.35), false));
  }
  for (const c of clouds) {
    puffs.push(...c.puffs);
    const middle = c.puffs.reduce((sum, p) => sum.add(p.centre), new THREE.Vector3()).divideScalar(c.puffs.length).sub(ROUND);
    c.out = Math.hypot(middle.x, middle.z);
  }
  shadeClouds(sunDirection(new THREE.Vector3()));

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const n = puffs.length;
  attributes = {
    // xyz, and the radius.
    centre: new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4),
    // The cloud's base, a seed for the edge's noise, and how soft and wispy
    // its rims are.
    shape: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    // Height in the cloud, shadow, haze.
    tone: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    // Its share of the drift.
    rate: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
  };
  for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute.setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = n;
  material = new THREE.ShaderMaterial({
    uniforms: {
      turn: { value: 0 },
      round: { value: ROUND },
      sun: { value: new THREE.Vector3() },
      warm: { value: new THREE.Color() },
      shade: { value: SHADE },
      mid: { value: MID },
      lit: { value: LIT },
      horizon: { value: horizon },
    },
    vertexShader: /* glsl */`
      attribute vec4 centre;
      attribute vec3 shape;
      attribute vec3 tone;
      attribute float rate;
      uniform float turn;
      uniform vec3 round;
      varying vec2 vAt;
      varying vec3 vCentre, vTone;
      varying float vRadius, vBase, vSeed, vSoft;
      void main() {
        // Turned slowly round the level.
        vec3 c = centre.xyz - round;
        float s = sin(turn * rate), k = cos(turn * rate);
        c = vec3(k * c.x + s * c.z, c.y, -s * c.x + k * c.z) + round;
        vec4 view = viewMatrix * vec4(c, 1.0);
        view.xy += position.xy * centre.w;
        gl_Position = projectionMatrix * view;
        vAt = position.xy;
        vCentre = c;
        vRadius = centre.w;
        vBase = shape.x;
        vSeed = shape.y;
        vSoft = shape.z;
        vTone = tone;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sun, warm, shade, mid, lit, horizon;
      varying vec2 vAt;
      varying vec3 vCentre, vTone;
      varying float vRadius, vBase, vSeed, vSoft;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        float r = length(vAt);
        if (r > 1.0) discard;
        // The ball's surface under this point, in the world.
        vec3 viewNormal = vec3(vAt, sqrt(1.0 - r * r));
        vec3 normal = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
        vec3 surface = vCentre + normal * vRadius;
        // A lumpy, feathered rim, and the cloud's base cut flat and soft.
        // The bank below, seen big and near, gets finer, deeper wisps and a
        // wider feather, as the far clouds' rims look from a distance.
        vec3 q = normal * mix(2.5, 4.0, vSoft) + vSeed;
        float lumps = noise(q) * 0.6 + noise(q * 2.3) * 0.4;
        lumps = mix(lumps, lumps * 0.6 + noise(q * 5.7) * 0.4, vSoft);
        float alpha = smoothstep(0.98, mix(0.55, 0.3, vSoft), r + (lumps - 0.5) * mix(0.35, 0.75, vSoft));
        alpha *= smoothstep(vBase - vRadius * 0.05, vBase + vRadius * 0.35, surface.y);
        if (alpha < 0.01) discard;
        // The light: the ball turned to the sun, softened and kept gentle so
        // the spheres melt into one mass, then the shade of the cloud on the
        // sun's side, and brighter higher up.
        float light = (dot(normal, sun) * mix(0.35, 0.2, vSoft) + 0.6) * (1.0 - 0.75 * vTone.y) + (vTone.x - 0.45) * 0.4;
        light += (lumps - 0.5) * 0.12;
        vec3 colour = mix(shade, mid, smoothstep(0.22, 0.4, light));
        colour = mix(colour, lit * warm, smoothstep(0.55, 0.7, light));
        // Silver at the rims, looking towards the sun: only on spheres with
        // little of their cloud between them and it, the cloud's own edges,
        // so the ones inside don't show their outlines.
        vec3 view = normalize(vCentre - cameraPosition);
        float backlit = pow(max(dot(view, sun), 0.0), 3.0) * (1.0 - vTone.y) * (1.0 - vTone.y);
        colour = mix(colour, lit * warm, backlit * smoothstep(0.6, 0.95, r) * 0.7);
        gl_FragColor = vec4(mix(colour, horizon, vTone.z), alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.unmerged = true;
  scene.add(mesh);
}

const sunDirection = (out: THREE.Vector3) => out.subVectors(sunLight!.position, sunLight!.target.position).normalize();

// Sorted furthest first each frame, so the soft rims of nearer spheres lie
// over those behind. Rather than turning every sphere round the level, the
// camera is turned back the other way to measure from.
const sunNow = new THREE.Vector3();
let order: number[] = [], distances = new Float32Array(0);
export function updateClouds(seconds: number, camera: THREE.Camera) {
  if (!attributes || !material) return;
  // Added up a frame at a time, so a change of speed doesn't jump them.
  turn -= Math.min(0.1, Math.max(0, seconds - lastSeconds)) * cloudLook.drift;
  lastSeconds = seconds;
  // Re-shade if the sun's been moved (from the panel).
  if (sunDirection(sunNow).distanceTo(lastSun) > 1e-4) shadeClouds(sunNow);
  material.uniforms.turn.value = turn;
  material.uniforms.sun.value.copy(sunNow);
  material.uniforms.warm.value.copy(sunLight!.color);
  if (order.length !== puffs.length) {
    order = puffs.map((_, i) => i);
    distances = new Float32Array(puffs.length);
  }
  // Measured from the camera turned back the other way, for each cloud.
  for (const c of clouds) c.eye.copy(camera.position).sub(ROUND).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -turn * rateOf(c)).add(ROUND);
  puffs.forEach((p, i) => distances[i] = p.centre.distanceToSquared(p.cloud.eye));
  order.sort((a, b) => distances[b] - distances[a]);
  const { centre, shape, tone, rate } = attributes;
  order.forEach((index, i) => {
    const p = puffs[index];
    centre.setXYZW(i, p.centre.x, p.centre.y, p.centre.z, p.radius);
    // Kept small: the noise's hash loses all precision on big inputs, and
    // the rims came out hard.
    shape.setXYZ(i, p.base, (index * 7.31) % 101, p.soft);
    tone.setXYZ(i, p.height, p.shadow, p.haze);
    rate.setX(i, rateOf(p.cloud));
  });
  for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
}
