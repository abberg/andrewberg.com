import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { claps } from './claps';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d9d9);
// Nothing in the scene is lit: the figure shades itself in two tones from
// this direction, the way to the light.
const light = new THREE.Vector3(-4, 5, 2.5).normalize();

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
// Straight on from the front, at about the figure's chest, close enough that it fills most of the height.
camera.position.set(0, 1.05, 4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;
controls.update();

// The figure is 1.8 units tall, feet at the origin, facing +z. Its bones all
// rest unrotated, so rotation.x swings a part forward and back.
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./walker.glb');
scene.add(gltf.scene);
gltf.scene.traverse(object => { object.frustumCulled = false; });

// The outline is an inverted hull: a second copy of the figure on the same
// skeleton, black, drawn inside out and pushed outwards a little, so only the
// rim of it shows round the figure.
let skin!: THREE.SkinnedMesh;
gltf.scene.traverse(object => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) skin = object as THREE.SkinnedMesh; });
// It is pushed out along directions shared by every vertex at a spot. The
// model's own normals differ across hard edges and texture seams, and a hull
// pushed along those would split open there.
{
  const { position, normal } = skin.geometry.attributes;
  const sums = new Map<string, THREE.Vector3>(), keys: string[] = [];
  const at = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    keys.push(key);
    if (!sums.has(key)) sums.set(key, new THREE.Vector3());
    sums.get(key)!.add(at.fromBufferAttribute(normal, i));
  }
  const out = new Float32Array(position.count * 3);
  keys.forEach((key, i) => sums.get(key)!.normalize().toArray(out, i * 3));
  skin.geometry.setAttribute('outward', new THREE.BufferAttribute(out, 3));
}
// The figure is drawn in two tones, with no gradation. Where it faces the
// light it is its paint, flat. Where it faces away it is hatched with evenly
// spaced upright lines. The lines belong to the figure: each is where an
// upright plane, fixed in the figure as it stands at rest, cuts its surface,
// so they bend and travel with the body and don't slide over it. The planes
// face sideways where the surface faces front or back, and front where it
// faces sideways, or they would lie flat against it and smear into bands.
const shade = {
  edge: { value: 0.13 },     // how far round from the light the dark side starts
  spacing: { value: 0.015 }, // from one hatch line to the next, in metres on the figure
  weight: { value: 0.35 },   // how much of that spacing is line
  towards: { value: new THREE.Vector3() },
};
const paint = new THREE.MeshBasicMaterial({ map: (skin.material as THREE.MeshStandardMaterial).map });
paint.onBeforeCompile = shader => {
  Object.assign(shader.uniforms, shade);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 facing, restAt, restFacing;')
    // With a skeleton the basic material works out its normal, in view space, though it has no use for it.
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nfacing = transformedNormal; restAt = position; restFacing = normal;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', /* glsl */ `#include <common>
      varying vec3 facing, restAt, restFacing;
      uniform vec3 towards;
      uniform float edge, spacing, weight;`)
    .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
      float dark = step(dot(normalize(facing), towards), edge);
      vec2 along = restAt.xz / spacing;
      // How much of a line's spacing a pixel covers, to soften its edges by.
      vec2 pixel = fwidth(along);
      bool sideways = abs(restFacing.x) > abs(restFacing.z);
      float across = fract(sideways ? along.y : along.x);
      float soft = min(sideways ? pixel.y : pixel.x, 0.5);
      float line = smoothstep(0.0, soft, across) - smoothstep(weight, weight + soft, across);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07), dark * line);`);
};
skin.material = paint;

// Where the figure folds in on itself, like the joint of an ear and the
// head, the two sides of the hull would push into each other and show as a
// black seam. The model marks those places (its second UV layer, 1 on open
// surface and less in a crease) and the hull is pushed out less there.
skin.geometry.setAttribute('crease', skin.geometry.attributes.uv1);
const outline = {
  thickness: { value: 0.012 },
  // How uneven the line's weight is: 0 is an even line, 1 swells to double
  // and thins to nothing along its length.
  rough: { value: 0.43 },
  // Redraws a second. The roughness holds still between them, like animation
  // on twos; at 0 it never changes and just rides on the figure.
  boil: 6,
  seed: { value: 0 },
};
const ink = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.BackSide });
ink.onBeforeCompile = shader => {
  Object.assign(shader.uniforms, { thickness: outline.thickness, rough: outline.rough, seed: outline.seed });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', /* glsl */ `#include <common>
      attribute vec3 outward;
      attribute vec2 crease;
      uniform float thickness, rough, seed;
      float inkHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float inkNoise(vec3 p) {
        vec3 i = floor(p), f = p - i;
        f = f * f * (3.0 - 2.0 * f);
        float x00 = mix(inkHash(i), inkHash(i + vec3(1, 0, 0)), f.x);
        float x10 = mix(inkHash(i + vec3(0, 1, 0)), inkHash(i + vec3(1, 1, 0)), f.x);
        float x01 = mix(inkHash(i + vec3(0, 0, 1)), inkHash(i + vec3(1, 0, 1)), f.x);
        float x11 = mix(inkHash(i + vec3(0, 1, 1)), inkHash(i + vec3(1, 1, 1)), f.x);
        return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z) * 2.0 - 1.0;
      }`)
    .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
      // Noise fixed to the figure's surface: long swells and a finer tremble.
      float swell = inkNoise(position * 7.0 + seed) * 0.65 + inkNoise(position * 23.0 - seed) * 0.35;
      transformed += outward * thickness * crease.x * max(0.0, 1.0 + rough * 1.6 * swell);`);
};
const hull = new THREE.SkinnedMesh(skin.geometry, ink);
hull.bind(skin.skeleton, skin.bindMatrix);
hull.frustumCulled = false;
skin.parent!.add(hull);

const bone = (name: string) => {
  // three.js strips the dots from names like leg.L when it loads them.
  const found = gltf.scene.getObjectByName(name.replace('.', ''));
  if (!found) throw new Error(`No bone called ${name}`);
  return found;
};
const hips = bone('hips'), torso = bone('torso'), head = bone('head');
const sides = (['L', 'R'] as const).map((side, i) => ({
  sign: i ? -1 : 1,
  leg: bone(`leg.${side}`), shin: bone(`shin.${side}`), sleeve: bone(`sleeve.${side}`), rod: bone(`rod.${side}`), hand: bone(`hand.${side}`),
}));
const hipsRest = hips.position.clone(), headRest = head.position.clone(), torsoRest = torso.position.clone();
// From the hip joint to the ground, from the middle of the hips out to a hip
// joint, and from the middle out to where a foot stands.
const LEG = 0.62, HIP = 0.108, FOOT = 0.15;
const point = new THREE.Vector3();

const walk = {
  pace: 0.46,       // strides a second, a stride being a step with each foot
  stride: 0.67,     // how far a leg swings each way, in radians
  knee: 0.74,       // how far a knee bends as its leg swings forward
  shift: 0.11,      // how far the hips slide sideways over the standing foot
  hips: 0.22,       // the hips' tilt, dropping on the lifted leg's side
  shoulders: 0.23,  // the shoulders' tilt the other way
  twist: 0.4,       // the torso turning against the hips
  arms: 0.77,       // the sleeves' swing
  dangle: 0.41,     // how far the rods and hands trail behind the sleeves
  nod: 0.095,
  squash: 0.045,    // how far the torso drops and compresses as each foot lands
  settle: 0.24,     // how long after the footfall the torso bottoms out
  follow: 0.8,      // how much later again the head does
};
const gui = new GUI({ title: 'Walk' });
gui.add(walk, 'pace', 0, 2, 0.01);
gui.add(walk, 'stride', 0, 0.8, 0.01);
gui.add(walk, 'knee', 0, 1.2, 0.01);
gui.add(walk, 'shift', 0, 0.15, 0.005);
gui.add(walk, 'hips', 0, 0.4, 0.005);
gui.add(walk, 'shoulders', 0, 0.4, 0.005);
gui.add(walk, 'twist', 0, 0.4, 0.01);
gui.add(walk, 'arms', 0, 1.2, 0.01);
gui.add(walk, 'dangle', 0, 1, 0.01);
gui.add(walk, 'nod', 0, 0.2, 0.005);
gui.add(walk, 'squash', 0, 0.3, 0.005);
gui.add(walk, 'settle', 0, 1.6, 0.01);
gui.add(walk, 'follow', 0, 1.2, 0.01);
gui.add(outline.thickness, 'value', 0, 0.06, 0.0005).name('outline');
gui.add(outline.rough, 'value', 0, 1, 0.01).name('rough');
gui.add(outline, 'boil', 0, 24, 1);
gui.add(shade.edge, 'value', -1, 1, 0.01).name('shade');
gui.add(shade.spacing, 'value', 0.005, 0.08, 0.001).name('hatch spacing');
gui.add(shade.weight, 'value', 0.05, 0.95, 0.01).name('hatch weight');

// For poking at from the console while developing.
if (import.meta.env.DEV) Object.assign(window, { walk, sides, hips, THREE });

// Behind the figure, paint: hand-sprayed atom symbols, small circles with a
// dot in the middle, and soft clouds of spray, in black and white, on flat cards that always face the camera. Both
// come from a point behind the figure's back and spread out from it like a
// firework, up, down and to the sides but never forward, so they stay in a
// flat sheet behind it: fast at first, slowing as if through air, turning,
// growing and fading as they go.
type Spray = {
  rate: number;     // new ones a second
  life: number;     // seconds each one lasts
  size: number;     // how big across one starts, in metres
  speed: number;    // how fast they leave, in metres a second
  drag: number;     // how quickly they slow: the share of their speed lost a second, roughly
  fall: number;     // how hard they are pulled down, in metres a second squared
  grow: number;     // how many times bigger one is by the end
  opacity: number;
  black: number;    // the share that are black; the rest are white
};
const behind = { distance: 0.55 }; // how far behind the figure's middle the paint starts

// Curl noise: the paint is also carried along by a slowly shifting field of
// eddies, so no two pieces take the same path. The flow is the curl of a
// smooth noise, which makes it swirl without ever bunching the paint up or
// thinning it out. It runs across the figure only, like the spray itself.
const curl = {
  strength: 0.9,  // how fast the eddies carry the paint, in metres a second
  scale: 0.4,     // how big an eddy is across, in metres
  churn: 1.2,     // how quickly the eddies change
};
const hash = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
// Smooth noise between 0 and 1.
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const fx = ease(x - ix), fy = ease(y - iy), fz = ease(z - iz);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), fx), mix(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), fx), mix(corner(0, 1, 1), corner(1, 1, 1), fx), fy), fz);
}
// The flow at a point, into `to`: the noise's slope, turned a quarter turn.
function eddy(at: THREE.Vector3, time: number, to: THREE.Vector3) {
  const x = at.x / curl.scale, y = at.y / curl.scale, z = time * curl.churn, step = 0.05;
  const across = (noise(x + step, y, z) - noise(x - step, y, z)) / (2 * step);
  const up = (noise(x, y + step, z) - noise(x, y - step, z)) / (2 * step);
  return to.set(up, -across, 0).multiplyScalar(curl.strength);
}
const flow = new THREE.Vector3();
const atoms: Spray = { rate: 7, life: 5, size: 0.27, speed: 1.45, drag: 0.4, fall: 0, grow: 1.5, opacity: 1, black: 0.6 };
const rings: Spray = { rate: 4, life: 3, size: 0.15, speed: 1.35, drag: 0.4, fall: 0, grow: 1.5, opacity: 1, black: 0.6 };
const clouds: Spray = { rate: 60, life: 8, size: 0.6, speed: 0.4, drag: 0.85, fall: 0, grow: 1.9, opacity: 0.9, black: 0.9 };

const atomMap = await new THREE.TextureLoader().loadAsync('./atom.png');
atomMap.colorSpace = THREE.SRGBColorSpace;

// A puff from a spray can: a soft middle built up from many faint dabs, with
// a spatter of fine dots thrown out round it. White, for tinting.
function cloudMap(seed: number) {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  for (let dab = 0; dab < 26; dab++) {
    const angle = random() * Math.PI * 2, out = random() ** 0.7 * 62;
    const x = 128 + Math.cos(angle) * out, y = 128 + Math.sin(angle) * out, radius = 24 + random() * 34;
    const fade = context.createRadialGradient(x, y, 0, x, y, radius);
    fade.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    fade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = fade;
    context.fillRect(0, 0, 256, 256);
  }
  for (let dot = 0; dot < 900; dot++) {
    const angle = random() * Math.PI * 2, out = 30 + random() ** 0.6 * 92;
    context.fillStyle = `rgba(255, 255, 255, ${(0.75 * (1 - out / 124)).toFixed(2)})`;
    context.beginPath();
    context.arc(128 + Math.cos(angle) * out, 128 + Math.sin(angle) * out, 0.4 + random() * 1.1, 0, Math.PI * 2);
    context.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
const cloudMaps = [11, 222, 3333, 44444].map(cloudMap);

// A circle with a dot in the middle, drawn a little unsteadily, as if by the
// same hand as the atoms: the circle doesn't quite stay round, its line
// swells and thins, and it overshoots where it closes.
function ringMap(seed: number) {
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'white';
  const wobble = [random(), random(), random()].map(r => r * Math.PI * 2);
  const start = random() * Math.PI * 2, sweep = Math.PI * 2 * (1.02 + random() * 0.06);
  for (let step = 0; step <= 400; step++) {
    const angle = start + sweep * step / 400;
    const radius = 92 + 5 * Math.sin(angle * 2 + wobble[0]) + 3 * Math.sin(angle * 3 + wobble[1]);
    context.beginPath();
    context.arc(128 + Math.cos(angle) * radius, 128 + Math.sin(angle) * radius,
      5.5 + 2 * Math.sin(angle * 1.5 + wobble[2]), 0, Math.PI * 2);
    context.fill();
  }
  context.beginPath();
  context.ellipse(128 + random() * 8 - 4, 128 + random() * 8 - 4, 15 + random() * 3, 13 + random() * 3, random() * 3, 0, Math.PI * 2);
  context.fill();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}
const ringMaps = [7, 88, 999].map(ringMap);

const BLACK = new THREE.Color(0x111111), WHITE = new THREE.Color(0xffffff);

// The soundtrack, and the hand clap in it, which falls on every other beat.
// Some of the smoke swells on each clap and settles back: a fixed set of the
// clouds, the same ones every time, so the pulse has places it lives.
const pulse = {
  level: 0,       // how far through a pulse the smoke is: 1 at the instant of a clap, falling to 0
  amount: 0.1,    // how much bigger a cloud gets at the top of a pulse, as a share of its size
  fade: 0.2,      // seconds for a pulse to die down to about a third
  share: 0.2,     // how many of the clouds pulse: always the same ones, the rest stay as they are
};
// The claps aren't listened for as the track plays, which proved jumpy and
// late: blender/claps.py found them all ahead of time, and this just watches
// the track's clock for the next one.
const sync = { early: -0.1 }; // seconds to pulse ahead of the clap, if sound and picture drift apart
// Nothing is fetched until Play is pressed.
const track = new Audio();
track.preload = 'none';
track.src = './soundtrack.mp3';
track.loop = true;
let next = 0, reached = 0;

function listen(delta: number) {
  pulse.level *= Math.exp(-delta / pulse.fade);
  if (track.paused) return;
  const now = track.currentTime + sync.early;
  // The track has looped round or been moved: find the place again.
  if (now < reached || now - reached > 1) next = claps.findIndex(clap => clap >= now);
  reached = now;
  if (next < 0) return;
  while (next < claps.length && claps[next] <= now) {
    pulse.level = 1;
    next++;
  }
}

const play = document.createElement('button');
play.textContent = 'Play';
Object.assign(play.style, {
  position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', padding: '10px 28px',
  font: '600 15px/1 system-ui, sans-serif', color: '#f2f2f2', background: '#111', border: 'none',
  borderRadius: '999px', cursor: 'pointer',
});
// Nothing moves until Play is pressed, and Pause stops all of it: the music,
// the walk and the paint, where they are.
let running = false;
play.addEventListener('click', async () => {
  running = !running;
  play.textContent = running ? 'Pause' : 'Play';
  if (running) await track.play().catch(() => {}); // it still runs if the track can't
  else track.pause();
});
document.body.append(play);
if (import.meta.env.DEV) Object.assign(window, { pulse, track });

// One kind of paint: its cards, and what moves them each frame. Cards further
// back are drawn first, so setting the clouds back puts them behind the atoms.
function spray(settings: Spray, maps: THREE.Texture[], back: number, most: number, swell?: (card: number) => number) {
  const cards = Array.from({ length: most }, (_, number) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: maps[0], transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, age: 0, life: 0, velocity: new THREE.Vector3(), spin: 0, size: 0, number };
  });
  let owed = 0;
  return (delta: number) => {
    owed += delta * settings.rate;
    for (const card of cards) {
      const { sprite } = card;
      if (sprite.visible) {
        card.age += delta;
        if (card.age > card.life) {
          sprite.visible = false;
          continue;
        }
        const through = card.age / card.life;
        card.velocity.multiplyScalar(Math.exp(-settings.drag * delta));
        card.velocity.y -= settings.fall * delta;
        sprite.position.addScaledVector(card.velocity, delta);
        sprite.position.addScaledVector(eddy(sprite.position, elapsed, flow), delta);
        sprite.material.rotation += card.spin * delta;
        sprite.scale.setScalar(card.size * (1 + through * (settings.grow - 1)) * (swell ? swell(card.number) : 1));
        // In quickly, out slowly.
        sprite.material.opacity = settings.opacity * Math.min(through / 0.1, 1) * (1 - through) ** 1.5;
      } else if (owed >= 1) {
        owed--;
        Object.assign(card, { age: 0, life: settings.life * (0.7 + Math.random() * 0.6), spin: Math.random() * 3 - 1.5 });
        card.size = settings.size * (0.6 + Math.random() * 0.8);
        // Behind the middle of the back, wherever the walk has carried it.
        sprite.position.set(hips.position.x, 1.05, -behind.distance - back);
        // Any direction across the figure, each as likely as the next and
        // no two quite as fast, but none towards the front or back.
        const angle = Math.random() * Math.PI * 2;
        card.velocity.set(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(settings.speed * (0.5 + Math.random() * 0.8));
        sprite.material.map = maps[Math.floor(Math.random() * maps.length)];
        sprite.material.color.copy(Math.random() < settings.black ? BLACK : WHITE);
        sprite.material.rotation = Math.random() * Math.PI * 2;
        sprite.material.opacity = 0;
        sprite.visible = true;
      }
    }
    // With every card in use the rest are let go, not saved up for a burst later.
    owed = Math.min(owed, 1);
  };
}
// Enough cards for the most there can be at once: the fastest rate times the
// longest life the sliders allow would be far more, so these cover the
// defaults with room to spare, and past that new paint waits for a free card.
const paintAtoms = spray(atoms, [atomMap], 0, 160), paintRings = spray(rings, ringMaps, 0.05, 160);
// Which clouds pulse is settled by a card's place in the pool, spread evenly
// through it (each step on by the golden ratio), so it never changes.
const paintClouds = spray(clouds, cloudMaps, 0.2, 700,
  card => (card * 0.618034) % 1 < pulse.share ? 1 + pulse.level * pulse.amount : 1);

const paintGui = gui.addFolder('Paint');
paintGui.add(behind, 'distance', 0, 2, 0.05).name('behind');
paintGui.add(curl, 'strength', 0, 3, 0.05).name('curl');
paintGui.add(curl, 'scale', 0.1, 4, 0.05).name('curl scale');
paintGui.add(curl, 'churn', 0, 2, 0.01).name('curl churn');
for (const [name, settings] of [['atoms', atoms], ['rings', rings], ['clouds', clouds]] as const) {
  const folder = paintGui.addFolder(name);
  folder.add(settings, 'rate', 0, 60, 0.5);
  folder.add(settings, 'life', 0.5, 8, 0.1);
  folder.add(settings, 'size', 0.05, 2.5, 0.01);
  folder.add(settings, 'speed', 0, 6, 0.05);
  folder.add(settings, 'drag', 0, 5, 0.05);
  folder.add(settings, 'fall', -1, 3, 0.05);
  folder.add(settings, 'opacity', 0, 1, 0.01);
  folder.add(settings, 'black', 0, 1, 0.01);
}

// Streaks: now and then something shoots in from the edge of the picture and
// across behind the figure, leaving a long line of spray paint that wanders
// as it goes and fades away from its far end. Each is a ribbon laid along the
// path its head has taken, in the same flat sheet as the rest of the paint.
const streaks = {
  rate: 0.25,     // new streaks a second
  speed: 2.5,     // how fast a head travels, in metres a second
  wander: 3.5,    // how sharply it weaves, in radians a second at most
  width: 0.015,   // how wide the line is, in metres
  rough: 1,       // how uneven that width is along the line: 0 is even, 1 swells and pinches a lot
  trail: 5,       // how many seconds of its path stay painted
  opacity: 0.9,
  color: '#d8362b',
};
// The part of the sheet the starting camera sees, and a little beyond: streaks start and end outside it.
const EDGE = { x: 2.9, y: 1.9, middle: 0.95 };
const POINTS = 700;
const ribbon = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(streaks.color) }, opacity: { value: streaks.opacity } },
  vertexShader: /* glsl */ `
    varying vec2 at;
    void main() {
      at = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 at;
    uniform vec3 color;
    uniform float opacity;
    void main() {
      // Soft at both edges like sprayed paint, and thinning out towards the old end.
      float across = 1.0 - abs(at.x * 2.0 - 1.0);
      gl_FragColor = vec4(color, opacity * smoothstep(0.0, 0.75, across) * pow(1.0 - at.y, 0.7));
      #include <colorspace_fragment>
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
type Streak = {
  mesh: THREE.Mesh; path: { x: number; y: number; born: number; wide: number }[];
  head: THREE.Vector2; heading: number; flying: boolean; seed: number; gone: number;
};
const flights: Streak[] = Array.from({ length: 6 }, (_, seed) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POINTS * 6), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(POINTS * 4), 2));
  const index: number[] = [];
  for (let i = 0; i < POINTS - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, ribbon);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, path: [], head: new THREE.Vector2(), heading: 0, flying: false, seed, gone: 0 };
});
let due = 0;

function streak(delta: number, time: number) {
  due += delta * streaks.rate;
  for (const flight of flights) {
    const { path, head, mesh } = flight;
    if (!flight.flying && !path.length && due >= 1) {
      due--;
      // In from a spot on one of the four edges, aimed at somewhere near the middle.
      const along = Math.random() * 2 - 1, side = Math.floor(Math.random() * 4);
      head.set(side < 2 ? (side ? EDGE.x : -EDGE.x) : along * EDGE.x, side < 2 ? along * EDGE.y : (side === 2 ? EDGE.y : -EDGE.y));
      flight.heading = Math.atan2((Math.random() - 0.5) * 1.6 - head.y, (Math.random() - 0.5) * 2 - head.x);
      flight.flying = true;
      flight.seed = Math.random() * 100;
      flight.gone = 0;
    }
    if (flight.flying) {
      // Weaving: its heading swings one way and the other on a smooth noise.
      flight.heading += (noise(flight.seed, time * 2.2, 0) - 0.5) * 2 * streaks.wander * delta;
      head.x += Math.cos(flight.heading) * streaks.speed * delta;
      head.y += Math.sin(flight.heading) * streaks.speed * delta;
      // How wide the line is here is settled as it is laid, from how far the
      // head has come, so it keeps its shape as it ages: slow swells, a
      // quicker flutter on top, and now and then nearly running dry.
      flight.gone += streaks.speed * delta;
      const uneven = (noise(flight.seed, flight.gone * 1.3, 5) - 0.5) * 1.5 + (noise(flight.seed, flight.gone * 6, 9) - 0.5) * 0.9;
      path.push({ x: head.x, y: head.y, born: time, wide: Math.max(0.12, 1 + streaks.rough * 1.6 * uneven) });
      // Gone once it is well out of the picture again; its line stays to fade.
      if (Math.abs(head.x) > EDGE.x + 0.4 || Math.abs(head.y) > EDGE.y + 0.4) flight.flying = false;
    }
    while (path.length && (time - path[0].born > streaks.trail || path.length > POINTS)) path.shift();
    mesh.visible = path.length > 1;
    if (!mesh.visible) continue;
    // The ribbon: a pair of points either side of each point on the path.
    mesh.position.set(0, EDGE.middle, -behind.distance - 0.1);
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < path.length; i++) {
      const before = path[Math.max(i - 1, 0)], after = path[Math.min(i + 1, path.length - 1)];
      const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      const half = streaks.width / 2 * path[i].wide;
      const sideX = -(after.y - before.y) / length * half, sideY = (after.x - before.x) / length * half;
      position.setXYZ(i * 2, path[i].x + sideX, path[i].y + sideY, 0);
      position.setXYZ(i * 2 + 1, path[i].x - sideX, path[i].y - sideY, 0);
      const age = (time - path[i].born) / streaks.trail;
      uv.setXY(i * 2, 0, age);
      uv.setXY(i * 2 + 1, 1, age);
    }
    position.needsUpdate = uv.needsUpdate = true;
    mesh.geometry.setDrawRange(0, (path.length - 1) * 6);
  }
  due = Math.min(due, 1);
}
// A plain red ball beside the figure that jumps in size on every clap and
// shrinks back, for seeing exactly when the claps are being fired. Hidden
// unless it is asked for in the panel.
const marker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16), new THREE.MeshBasicMaterial({ color: 0xe02020 }));
marker.position.set(-1.1, 1.75, 0.3);
marker.visible = false;
scene.add(marker);
const soundGui = gui.addFolder('Sound');
soundGui.add(marker, 'visible').name('clap marker');
soundGui.add(pulse, 'amount', 0, 2, 0.01).name('pulse');
soundGui.add(pulse, 'share', 0, 1, 0.01).name('pulse share');
soundGui.add(pulse, 'fade', 0.03, 2, 0.01).name('pulse fade');
soundGui.add(sync, 'early', -0.2, 0.2, 0.005).name('pulse early (s)');
const streaksGui = paintGui.addFolder('streaks');
streaksGui.add(streaks, 'rate', 0, 3, 0.05);
streaksGui.add(streaks, 'speed', 0.2, 8, 0.1);
streaksGui.add(streaks, 'wander', 0, 8, 0.1);
streaksGui.add(streaks, 'width', 0.005, 0.2, 0.005);
streaksGui.add(streaks, 'rough', 0, 1, 0.01);
streaksGui.add(streaks, 'trail', 0.5, 12, 0.1);
streaksGui.add(ribbon.uniforms.opacity, 'value', 0, 1, 0.01).name('opacity');
streaksGui.addColor(streaks, 'color').onChange((value: string) => ribbon.uniforms.color.value.set(value));

let phase = 0;
const clock = new THREE.Clock();
// How long it has been running, pauses left out: the paint's eddies and the outline's boil keep time by it.
let elapsed = 0;

function pose(delta: number) {
  phase += delta * walk.pace * Math.PI * 2;
  const swing = walk.stride * Math.cos(phase);

  // The legs swing from the hips like a pair of compasses,
  // the left one forward at the start of the stride, so the hips dip as the
  // legs open and rise as they pass each other.
  hips.position.copy(hipsRest);
  hips.position.y -= LEG * (1 - Math.cos(swing));
  // The weight goes over the standing leg, the left one for the first half
  // of the stride: the hips slide across above that foot, and tilt so the
  // side of the leg that's off the ground drops. Both are greatest as the
  // legs pass. Tilting about the middle would lift the standing hip, so the
  // hips come down by as much to keep that foot on the ground.
  const over = Math.sin(phase);
  const tilt = walk.hips * over;
  hips.rotation.z = tilt;
  hips.position.x = hipsRest.x + walk.shift * over;
  hips.position.y -= HIP * Math.sin(Math.abs(tilt));
  hips.rotation.y = -walk.twist * 0.5 * Math.cos(phase);
  for (const { sign, leg, shin, sleeve, rod, hand } of sides) {
    leg.rotation.x = -sign * swing;
    // The standing leg stays straight. The other bends at the knee while it
    // swings forward, most as it passes under the hips, and the thigh lifts
    // a little with it so the foot clears the ground.
    const bend = walk.knee * Math.max(0, -sign * Math.sin(phase));
    shin.rotation.set(bend, 0, 0);
    leg.rotation.x -= bend * 0.4;
    // The legs swing straight ahead whichever way the hips are turned, or
    // the turn would drag the standing foot round with it.
    leg.rotation.y = -hips.rotation.y;
    // Each foot keeps to its own line on the ground, FOOT out from the
    // middle, however the hips slide, tilt and turn above it: the leg leans
    // from its hip joint to reach that line. Without this the feet skate
    // sideways. Found by trying a lean, seeing where the foot ends up, and
    // correcting, which settles in a couple of goes.
    leg.rotation.z = -tilt;
    for (let attempt = 0; attempt < 3; attempt++) {
      leg.updateWorldMatrix(true, false);
      const foot = leg.localToWorld(point.set(sign * (FOOT - HIP), -LEG, 0));
      leg.rotation.z += (sign * FOOT - foot.x) / LEG;
    }
    // Each arm swings against its own leg, and the rod and hand trail it.
    sleeve.rotation.set(sign * walk.arms * walk.stride * Math.cos(phase), 0, 0);
    rod.rotation.set(sign * walk.dangle * walk.stride * Math.cos(phase - 0.7), 0, 0);
    hand.rotation.set(sign * walk.dangle * walk.stride * Math.cos(phase - 1.4), 0, 0);
  }
  torso.rotation.y = walk.twist * Math.cos(phase);
  // The shoulders oppose the hips: undo the hips' tilt, then tilt the other way.
  torso.rotation.z = -tilt - walk.shoulders * over;
  head.rotation.x = walk.nod * Math.sin(phase * 2);
  head.rotation.z = hips.rotation.x = torso.rotation.x = 0;
  // Squash: the weight comes down after each foot lands, twice a stride, and
  // travels up the figure. The torso drops down over the hips, carrying the
  // head and arms, and shortens a little as it does, bottoming out settle
  // after the footfall. The head sinks and tips forward on top of that, and
  // bottoms out follow later still. Both are in radians of the step, which
  // is half a stride and so pi long.
  const landing = (after: number) => (0.5 + 0.5 * Math.cos(phase * 2 - after * 2)) ** 2;
  const squash = walk.squash * landing(walk.settle);
  torso.position.set(torsoRest.x, torsoRest.y - squash * 0.9, torsoRest.z);
  torso.scale.set(1 + squash * 0.25, 1 - squash * 0.5, 1 + squash * 0.25);
  const droop = walk.squash * landing(walk.settle + walk.follow);
  head.position.set(headRest.x, headRest.y - droop * 0.5, headRest.z + droop * 0.6);
  head.rotation.x += droop * 2.5;
}

// The panel remembers. Every change is kept in this browser, and put back
// the next time the page loads, so an afternoon's adjusting isn't lost to a
// reload. That is only ever this browser's copy: everyone else gets the
// values written in this file, which is what "reset to defaults" goes back to.
// Only the settings that have been moved off their defaults are kept, so when
// a default in this file changes, it shows up for any setting left alone.
type Saved = { controllers: Record<string, unknown>; folders: Record<string, Saved> };
const SAVED = 'walk-settings-changed';
const defaults = gui.save() as Saved;
const changed = (now: Saved, from: Saved): Saved => ({
  controllers: Object.fromEntries(Object.entries(now.controllers)
    .filter(([name, value]) => value !== from.controllers[name])),
  folders: Object.fromEntries(Object.entries(now.folders)
    .map(([name, folder]) => [name, changed(folder, from.folders[name] ?? { controllers: {}, folders: {} })])),
});
try {
  // An earlier version kept every setting, moved or not, under another name.
  // Brought over once, keeping only what had been moved.
  const whole = localStorage.getItem('walk-settings');
  if (whole) {
    const moved = changed(JSON.parse(whole) as Saved, defaults);
    localStorage.setItem(SAVED, JSON.stringify(moved));
    localStorage.removeItem('walk-settings');
  }
  const kept = localStorage.getItem(SAVED);
  if (kept) gui.load(JSON.parse(kept) as Saved);
} catch {
  // Nothing kept, or nothing readable: the defaults stand.
}
gui.onChange(() => {
  try {
    localStorage.setItem(SAVED, JSON.stringify(changed(gui.save() as Saved, defaults)));
  } catch {
    // Storage is full or switched off: carry on without remembering.
  }
});
// Every setting as lines of text, a heading for each group, for pasting
// somewhere, such as back to whoever is going to make them the defaults.
const listed = (saved: Saved, heading = ''): string => [
  ...(heading ? [`\n${heading}`] : []),
  ...Object.entries(saved.controllers).map(([name, value]) => `${name}: ${value}`),
  ...Object.entries(saved.folders).map(([name, folder]) => listed(folder, heading ? `${heading} / ${name}` : name)),
].join('\n');
const settings = gui.addFolder('Settings');
const actions = {
  copy: async () => {
    await navigator.clipboard.writeText(listed(gui.save() as Saved).trim());
    copied.name('copied');
    setTimeout(() => copied.name('copy settings'), 1500);
  },
  reset: () => {
    gui.load(defaults);
    localStorage.removeItem(SAVED);
  },
};
const copied = settings.add(actions, 'copy').name('copy settings');
settings.add(actions, 'reset').name('reset to defaults');

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// The panel starts folded away, out of the picture's way.
gui.close();

// One step of everything that moves.
function advance(delta: number) {
  elapsed += delta;
  pose(delta);
  listen(delta);
  marker.scale.setScalar(1 + pulse.level * 1.5);
  paintAtoms(delta);
  paintRings(delta);
  streak(delta, elapsed);
  paintClouds(delta);
  // The seed cycles through a few small offsets: a large one costs the
  // shader's noise its precision, and the line collapses to nothing.
  outline.seed.value = (Math.floor(elapsed * outline.boil) % 32) * 1.37;
}
// Before Play he stands as the walk starts, mid stride, with nothing behind him.
pose(0);

// ?thumbnail=1 (scripts/thumbnails.mjs at the root) wants a still with no
// controls and no one to press Play: so it is run on for a few seconds'
// worth, unseen, until the paint has built up behind him, and left there.
const thumbnail = new URLSearchParams(location.search).has('thumbnail');
if (thumbnail) {
  document.body.dataset.thumbnail = '';
  for (let step = 0; step < 60 * 7; step++) advance(1 / 60);
}

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.1);
  if (running) advance(delta);
  controls.update();
  // The shader compares normals with the light in view space.
  shade.towards.value.copy(light).transformDirection(camera.matrixWorldInverse);
  renderer.render(scene, camera);
  if (thumbnail) document.documentElement.dataset.thumbnailReady = 'true';
});
