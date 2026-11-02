import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFoliage } from './foliage';
import { createFollowCamera, follow } from './followCamera';
import { createInput } from './input';
import { createLook } from './look';
import { buildLevel, PLATFORM_TOP } from './level';
import { createPlayer, movement } from './player';
import { createRobot } from './robot';
import { createStones } from './stones';
import { updateFish } from './fish';
import { updateWater } from './water';
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
gui.add(walls, 'visible').name('show invisible walls');
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
  timer.update(time);
  const delta = Math.min(timer.getDelta(), 0.1);
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
  renderer.render(scene, camera);
});
