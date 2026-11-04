import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFlyIn } from './flyIn';
import { createFootsteps, footsteps } from './footsteps';
import { createMusic, music, rememberMute } from './music';
import { createFoliage, fadeAround, leafLook, updateLeaves } from './foliage';
import { createClouds, updateClouds } from './clouds';
import { createLilies, updateLilies } from './lilies';
import { mergeStatic } from './merge';
import { createPause } from './pause';
import { createPost } from './post';
import { createFollowCamera, follow } from './followCamera';
import { createHint } from './hint';
import { createInput } from './input';
import { createLook } from './look';
import { buildLevel, PLATFORM_TOP } from './level';
import { createPlayer, movement } from './player';
import { aimShadow, createRobot, inkShadow, shadow, shadowAngle } from './robot';
import { createStart } from './start';
import { createStones } from './stones';
import { updateFish } from './fish';
import { reflectWater, updateWater, waterLook } from './water';
import { updateWind, wind } from './wind';

// Sky Castle Garden, built in steps from the plan (docs/design-plan.md). So
// far: the robot (modelled in blender/robot.py), the follow camera, the level
// blocked out, stones to push about, and the light, sky and palette (look.ts). 1 unit = 1 m, y up, north −z.
//
// The loading bar (start.ts) follows what actually takes the time: the robot
// downloading (by its bytes), the garden being built (step by step, letting
// the bar redraw between them), the shaders compiling and the first frame
// drawn. The robot downloads while the garden's built.
const start = createStart();
const progress = { robot: 0, built: 0, compiled: 0 };
const report = () => start.progress(0.35 * progress.robot + 0.45 * progress.built + 0.15 * progress.compiled);
// Until the browser's had a chance to draw the bar (or, in a hidden tab, a moment).
const breathe = () => new Promise<void>(resolve => {
  const go = () => setTimeout(resolve);
  const timeout = setTimeout(go, 100);
  requestAnimationFrame(() => { clearTimeout(timeout); go(); });
});
const built = async (share: number) => { progress.built = share; report(); await breathe(); };
const robotGlb = new GLTFLoader().loadAsync('./robot.glb', event => {
  if (event.total) { progress.robot = event.loaded / event.total; report(); }
});
await RAPIER.init();
await built(0.1);
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const look = createLook(scene);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);

const { spawn, walls } = buildLevel(world, scene);
await built(0.35);
const stones = createStones(world, scene);
await built(0.45);
createFoliage(world, scene);
await built(0.75);
createLilies(scene);
mergeStatic(scene);
await built(0.9);
createClouds(scene, look.sun);
await built(1);
const gltf = await robotGlb;
progress.robot = 1;

const input = createInput(renderer.domElement);
const player = createPlayer(world, scene, { ...spawn, y: PLATFORM_TOP }, createRobot(gltf));
const steps = createFootsteps(gltf.scene);
const soundtrack = createMusic();
const follower = createFollowCamera(camera, world, player.collider, spawn.yaw);
const flight = createFlyIn();
const finish = createPost(renderer, scene, camera);
createHint();
const pause = createPause(renderer.domElement, { reset: () => stones.reset(), replay: () => flight.replay() });
// ?thumbnail=1 (scripts/thumbnails.mjs at the root): no start screen and no
// opening, just the garden from behind the robot.
const thumbnail = new URLSearchParams(location.search).has('thumbnail');
if (thumbnail) document.body.dataset.thumbnail = '';

// Tuning, folded away top right.
const gui = new GUI({ title: 'tuning' });
const moving = gui.addFolder('robot');
moving.add(movement, 'walk', 0.5, 4, 0.1).name('walk (m/s)');
moving.add(movement, 'run', 1, 8, 0.1).name('run (m/s)');
moving.add(movement, 'accelerate', 0.05, 1.5, 0.05).name('to full speed (s)');
moving.add(movement, 'turn', 30, 540, 10).name('turn (°/s)');
moving.add(movement, 'push', 20, 800, 10).name('push (kN)');
moving.add(movement, 'stepOver', 0.5, 3, 0.1).name('step-over (s)');
moving.add(shadowAngle, 'turn', -180, 180, 1).name('shadow, turned from the sun (°)');
moving.add(shadowAngle, 'height', -40, 40, 1).name('shadow, sun higher by (°)');
moving.add(shadowAngle, 'back', 0, 0.5, 0.01).name('shadow, slid back (m)');
moving.add(shadowAngle, 'across').name('shadow across steps (off: flat)');
const following = gui.addFolder('camera');
following.add(follow, 'distance', follow.nearest, follow.farthest, 0.5).name('distance (m)').listen();
following.add(follow, 'shoulder', 1, 5, 0.1).name('pivot height (m)');
following.add(follow, 'lag', 0.01, 0.6, 0.01).name('lag (s)');
following.add(follow, 'sensitivity', 0.0005, 0.008, 0.0005);
following.add(follow, 'swing', 0, 4, 0.1).name('swing behind (s, 0 off)');
following.add(follow, 'hold', 0, 5, 0.1).name('after mouse (s)');
following.add(camera, 'fov', 30, 80, 1).name('fov (°)').onChange(() => camera.updateProjectionMatrix());
look.tune(gui);
const leafy = gui.addFolder('leaves');
leafy.add(leafLook, 'variation', 0, 1, 0.01).name('leaf variation (1: as before)');
leafy.add(leafLook, 'flatBy', 5, 200, 1).name('flat from (m)');
leafy.close();
const sound = gui.addFolder('sound');
sound.add(footsteps, 'volume', 0, 1, 0.01).name('footsteps');
sound.add(footsteps, 'muted').name('mute footsteps');
sound.add(music, 'volume', 0, 1, 0.01).name('music');
sound.add(music, 'muted').name('mute music').onChange(rememberMute).listen();
sound.close();
const blowing = gui.addFolder('wind');
blowing.add(wind, 'strength', 0, 3, 0.1);
blowing.add(wind, 'from', -180, 180, 1).name('from, east of north (°)');
blowing.close();
const watery = gui.addFolder('water');
watery.add(waterLook, 'down', 0, 1, 0.01).name('reflection, looking down');
watery.add(waterLook, 'across', 0, 1, 0.01).name('reflection, looking across');
watery.add(waterLook, 'blur', 0, 0.05, 0.001).name('reflection blur');
watery.add(waterLook, 'reflectBright', 0, 1, 0.01).name('reflection brightness');
watery.add(waterLook, 'washBright', 0.3, 1, 0.01).name('water brightness');
watery.add(waterLook, 'sparse', 0.3, 0.9, 0.01).name('highlights, sparseness');
watery.add(waterLook, 'size', 0.5, 6, 0.1).name('highlights, size (m)');
watery.add(waterLook, 'stretch', 1, 12, 0.1).name('highlights, stretch');
watery.add(waterLook, 'pace', 0, 1, 0.01).name('highlights, pace');
watery.add(waterLook, 'flow', 0, 3, 0.05).name('highlights, drift (m/s)');
watery.add(waterLook, 'towards', -180, 180, 1).name('drift towards, east of north (°)');
watery.close();
gui.add(walls, 'visible').name('show invisible walls');
// What a frame costs: frames a second, and draw calls in all its passes
// (shadows, the water's reflection and the view).
const cost = { fps: 0, 'draw calls': 0, triangles: '' };
gui.add(flight, 'replay').name('replay the fly-in');
finish.tune(gui);
const costs = gui.addFolder('performance');
costs.add(cost, 'fps').listen().disable();
costs.add(cost, 'draw calls').listen().disable();
costs.add(cost, 'triangles').listen().disable();
costs.close();
renderer.info.autoReset = false;
let frames = 0, since = performance.now();
gui.close();

// Whether the start screen's been clicked through, the first frame drawn,
// and the still frame behind the start screen needs drawing again.
let entered = false, drawn = false, redraw = false;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  finish.resize();
  redraw = true;
});

// The shaders, compiled before the first frame rather than during it.
await renderer.compileAsync(scene, camera);
progress.compiled = 1;
report();

// Held on the start screen, with nothing moving, until it's clicked through.
const enter = () => {
  entered = true;
  soundtrack.start();
  steps.start();
  pause.enable();
  flight.begin();
  // No pointer lock on a phone; elsewhere it can still be refused, and then
  // a click on the view takes the mouse (input.ts).
  if (!matchMedia('(pointer: coarse)').matches) {
    try { Promise.resolve(renderer.domElement.requestPointerLock()).catch(() => {}); } catch { /* the same */ }
  }
};

// Physics at a fixed 60 Hz, drawn at whatever the display runs at.
const timer = new THREE.Timer();
timer.connect(document);
const direction = new THREE.Vector2();
// Straight down from the robot, for the ground its shadow falls on.
const down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
let accumulator = 0, seconds = 0;
renderer.setAnimationLoop(time => {
  // On the start screen, one still frame is enough (drawn again on resize).
  if (!entered && drawn && !redraw) return;
  redraw = false;
  cost['draw calls'] = renderer.info.render.calls;
  cost.triangles = `${(renderer.info.render.triangles / 1e6).toFixed(1)} M`;
  renderer.info.reset();
  if (++frames, performance.now() - since > 500) {
    cost.fps = Math.round(frames * 1000 / (performance.now() - since));
    frames = 0;
    since = performance.now();
  }
  timer.update(time);
  // Never backwards: the first frame's time can come before the timer's start.
  // Paused, nothing moves: the garden's own clock stands still.
  // Before entering, too.
  const held = pause.paused || !entered;
  const delta = held ? 0 : Math.max(0, Math.min(timer.getDelta(), 0.1));
  seconds += delta;
  const { x, y, zoom } = input.take();
  // Nothing moves the robot or the view until the fly-in has landed.
  if (!flight.flying && !held) follower.look(x, y, zoom);
  // Camera-relative: forward is away from the camera.
  const move = flight.flying || held ? { x: 0, y: 0 } : input.move(), yaw = follower.yaw;
  direction.set(move.x * Math.cos(yaw) - move.y * Math.sin(yaw), -move.x * Math.sin(yaw) - move.y * Math.cos(yaw));
  // R puts the stonework back.
  if (input.tapped('KeyR') && !held) stones.reset();
  accumulator += delta;
  while (accumulator >= world.timestep) {
    player.step(world.timestep, direction, input.run());
    world.step();
    // Off the edge: back to the start.
    if (player.feet.y < -40) { player.reset(); follower.behind(spawn.yaw); }
    accumulator -= world.timestep;
  }
  player.draw(accumulator / world.timestep);
  // Its shadow: along the sun, onto the ground under it.
  const at = player.mesh.position;
  down.origin = { x: at.x, y: at.y + 1, z: at.z };
  const hit = world.castRay(down, 30, true, undefined, undefined, player.collider);
  shadow.ground = hit ? at.y + 1 - hit.timeOfImpact : at.y;
  aimShadow(look.sun);
  inkShadow(renderer, scene, player.mesh);
  player.animate(delta, world.timestep);
  steps.update(camera, player.pace);
  soundtrack.update(pause.paused);
  stones.sync();
  follower.update(delta, player.mesh.position, player.mesh.rotation.y, player.pace);
  fadeAround(player.mesh.position);
  flight.update(delta, camera);
  look.update(camera);
  updateWind(seconds);
  updateLeaves();
  updateWater(seconds);
  updateFish(seconds, delta);
  updateLilies(seconds);
  updateClouds(seconds, camera);
  reflectWater(renderer, scene, camera);
  finish.render();
  // The first frame's drawn: the bar gives way to the start screen.
  if (!drawn) {
    drawn = true;
    if (thumbnail) {
      entered = true;
      flight.skip();
      start.dismiss();
      setTimeout(() => { document.documentElement.dataset.thumbnailReady = 'true'; }, 2000);
    } else start.ready(enter);
  }
});
