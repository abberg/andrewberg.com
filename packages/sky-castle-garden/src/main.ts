import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFoliage } from './foliage';
import { createClouds, updateClouds } from './clouds';
import { createLilies, updateLilies } from './lilies';
import { mergeStatic } from './merge';
import { createFollowCamera, follow } from './followCamera';
import { createInput } from './input';
import { createLook } from './look';
import { buildLevel, PLATFORM_TOP } from './level';
import { createPlayer, movement } from './player';
import { createRobot } from './robot';
import { createStones } from './stones';
import { updateFish } from './fish';
import { reflectWater, updateWater, waterLook } from './water';
import { updateWind, wind } from './wind';

// Sky Castle Garden, built in steps from the plan (docs/design-plan.md). So
// far: the robot (modelled in blender/robot.py), the follow camera, the level
// blocked out, stones to push about, and the light, sky and palette (look.ts). 1 unit = 1 m, y up, north −z.
const [, gltf] = await Promise.all([RAPIER.init(), new GLTFLoader().loadAsync('./robot.glb')]);
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
const stones = createStones(world, scene);
createFoliage(world, scene);
createLilies(scene);
mergeStatic(scene);
createClouds(scene);

const input = createInput(renderer.domElement);
const player = createPlayer(world, scene, { ...spawn, y: PLATFORM_TOP }, createRobot(gltf));
const follower = createFollowCamera(camera, world, player.collider, spawn.yaw);

// Tuning, folded away top right.
const gui = new GUI({ title: 'tuning' });
const moving = gui.addFolder('robot');
moving.add(movement, 'walk', 0.5, 4, 0.1).name('walk (m/s)');
moving.add(movement, 'run', 1, 8, 0.1).name('run (m/s)');
moving.add(movement, 'accelerate', 0.05, 1.5, 0.05).name('to full speed (s)');
moving.add(movement, 'turn', 30, 540, 10).name('turn (°/s)');
moving.add(movement, 'push', 20, 800, 10).name('push (kN)');
moving.add(movement, 'stepOver', 0.5, 3, 0.1).name('step-over (s)');
const following = gui.addFolder('camera');
following.add(follow, 'distance', follow.nearest, follow.farthest, 0.5).name('distance (m)').listen();
following.add(follow, 'shoulder', 1, 5, 0.1).name('pivot height (m)');
following.add(follow, 'lag', 0.01, 0.6, 0.01).name('lag (s)');
following.add(follow, 'sensitivity', 0.0005, 0.008, 0.0005);
following.add(follow, 'swing', 0, 4, 0.1).name('swing behind (s, 0 off)');
following.add(follow, 'hold', 0, 5, 0.1).name('after mouse (s)');
following.add(camera, 'fov', 30, 80, 1).name('fov (°)').onChange(() => camera.updateProjectionMatrix());
look.tune(gui);
const blowing = gui.addFolder('wind');
blowing.add(wind, 'strength', 0, 3, 0.1);
blowing.add(wind, 'from', -180, 180, 1).name('from, east of north (°)');
blowing.close();
const watery = gui.addFolder('water');
watery.add(waterLook, 'down', 0, 1, 0.01).name('reflection, looking down');
watery.add(waterLook, 'across', 0, 1, 0.01).name('reflection, looking across');
watery.add(waterLook, 'blur', 0, 0.05, 0.001).name('reflection blur');
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
const costs = gui.addFolder('performance');
costs.add(cost, 'fps').listen().disable();
costs.add(cost, 'draw calls').listen().disable();
costs.add(cost, 'triangles').listen().disable();
costs.close();
renderer.info.autoReset = false;
let frames = 0, since = performance.now();
gui.close();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Physics at a fixed 60 Hz, drawn at whatever the display runs at.
const timer = new THREE.Timer();
timer.connect(document);
const direction = new THREE.Vector2();
let accumulator = 0;
renderer.setAnimationLoop(time => {
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
  const delta = Math.max(0, Math.min(timer.getDelta(), 0.1));
  const { x, y, zoom } = input.take();
  follower.look(x, y, zoom);
  // Camera-relative: forward is away from the camera.
  const move = input.move(), yaw = follower.yaw;
  direction.set(move.x * Math.cos(yaw) - move.y * Math.sin(yaw), -move.x * Math.sin(yaw) - move.y * Math.cos(yaw));
  // R puts the stonework back.
  if (input.tapped('KeyR')) stones.reset();
  accumulator += delta;
  while (accumulator >= world.timestep) {
    player.step(world.timestep, direction, input.run());
    world.step();
    // Off the edge: back to the start.
    if (player.feet.y < -40) { player.reset(); follower.behind(spawn.yaw); }
    accumulator -= world.timestep;
  }
  player.draw(accumulator / world.timestep);
  player.animate(delta, world.timestep);
  stones.sync();
  follower.update(delta, player.mesh.position, player.mesh.rotation.y, player.pace);
  look.update(camera);
  updateWind(time / 1000);
  updateWater(time / 1000);
  updateFish(time / 1000, delta);
  updateLilies(time / 1000);
  updateClouds(time / 1000, camera);
  reflectWater(renderer, scene, camera);
  renderer.render(scene, camera);
});
