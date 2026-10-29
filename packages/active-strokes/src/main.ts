import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { atan, clamp, cos, float, mix, pass, screenCoordinate, select, texture, uniform, vec3, vec4 } from 'three/tsl';
import { createGBuffer } from './render/gbuffer';
import { createExtraction } from './extract/steerable';
import { createCreases } from './extract/creases';
import { createPartDetail } from './extract/parts';
import { createCompaction } from './extract/compact';
import { createTickOverlay } from './debug/ticks';
import { createStrokes } from './render/strokes';
import { createToonHistory, toonParams } from './render/toon';
import { createSnakeClient } from './snakes/client';
import { createPanel } from './debug/panel';
import { createMotion, motionParams } from './render/motion';

// No WebGL2 fallback: the pipeline leans on compute shaders. Firefox is the main
// browser that lands here, since its WebGPU is still off by default.
if (!navigator.gpu || !(await navigator.gpu.requestAdapter())) {
  document.getElementById('unsupported')!.dataset.show = '';
  document.getElementById('loading')!.hidden = true;
  throw new Error('WebGPU unavailable');
}

const renderer = new THREE.WebGPURenderer({ antialias: false });
await renderer.init();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ea);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 4, 5);
scene.add(sun);

// The Behemoth from Full Metal Panic!, walking on the spot and now and then
// swiping (scripts/extract-model.mjs, render/motion.ts).
// The loading bar (index.html) follows the model, which is most of the download.
const loading = document.getElementById('loading')!;
const progressBar = loading.querySelector<HTMLElement>('.bar span')!;
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./behemoth.glb', event => {
  if (event.total) progressBar.style.width = `${Math.round(event.loaded / event.total * 100)}%`;
});
progressBar.style.width = '100%';
const model = gltf.scene;
scene.add(model);
const motion = createMotion(model, gltf.animations);

// Frame the model from the bind pose, so the walk doesn't shift the camera.
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
const distance = size.y / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.7;
// From 25 degrees off straight on, round to the model's right, the side its
// swiping arm is on: the fist reaches out across the frame rather than
// passing behind the body. The view is also panned left, by a sixth of the
// model's height, so the fist has room to reach at the left of the frame.
const azimuth = THREE.MathUtils.degToRad(-25);
const target = center.clone().addScaledVector(new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)), -size.y / 6);
camera.position.set(target.x + distance * Math.sin(azimuth), target.y, target.z + distance * Math.cos(azimuth));
camera.lookAt(target);
camera.near = distance / 100;
camera.far = distance * 10;
camera.updateProjectionMatrix();

// Debug views: 1 shading, 2 velocity, 3 depth, 4 line strength, 5 line samples
// after non-maxima suppression, 6 the samples as read back to the CPU, with
// tangent ticks tinted by speed (blue still, red 4 px/frame or more), 7 the
// snakes over faint samples, 8 (the default) the strokes, 9 the crease and
// part lines fed to the filter, over busy parts in grey. D switches the
// strokes between ink and a dashed test texture; S switches the drawing style
// (ink, overdrawn sketchy lines). Space pauses the walk; R reseeds the snakes.
const detailMap = await new THREE.TextureLoader().loadAsync('./behemoth-detail.png');
// glTF texture coordinates run top-down, and the mask is data, not colour.
detailMap.flipY = false;
detailMap.colorSpace = THREE.NoColorSpace;
detailMap.anisotropy = 4;
const gbuffer = createGBuffer(renderer, scene, camera, detailMap);
const parts = createPartDetail(gbuffer, model, camera);
const creases = createCreases(gbuffer, parts, renderer.getPixelRatio());
const extraction = createExtraction(gbuffer, creases, renderer.getPixelRatio());
const compaction = createCompaction(renderer, gbuffer, extraction);
const ticks = createTickOverlay();
const snakes = createSnakeClient();
compaction.onSamples(samples => snakes.push(samples));
// For poking at samples from the console while developing.
if (import.meta.env.DEV) Object.assign(window, { compaction, snakes, parts });
const strengthGain = uniform(4);
const view = uniform(7);
const strokes = createStrokes();
const strokePass = pass(strokes.scene, strokes.camera, { samples: 4 });
const toon = createToonHistory(renderer, gbuffer, 0xf4f1ea);
// Paper grain over everything, ink included, from a greyscale scan (a 3DJungle
// seamless paper, baked to grey). It only scales brightness around the scan's
// mean (0.88), so the colours stay ours; one texel to a CSS pixel, tiled.
const paperMap = await new THREE.TextureLoader().loadAsync('./paper.jpg');
paperMap.colorSpace = THREE.NoColorSpace;
paperMap.wrapS = paperMap.wrapT = THREE.RepeatWrapping;
const paperScale = uniform(1 / (1000 * renderer.getPixelRatio()));
const grain = mix(float(1), texture(paperMap, screenCoordinate.xy.mul(paperScale)).r.div(0.88), toonParams.paper);
const drawing = vec4(mix(toon.node, strokePass.rgb, strokePass.a).mul(grain), 1);
// Velocity as optical flow is usually drawn: hue for direction, brightness for
// speed. It's divided by the frame time, so the view reads in pixels per second
// and doesn't flicker when frames come unevenly (the samples keep it per frame,
// which is what advection wants). Full colour at 150 px/s.
const resolution = uniform(new THREE.Vector2());
const frameTime = uniform(1 / 60);
const pixels = gbuffer.velocity.xy.mul(resolution).mul(0.5).div(frameTime);
const hue = atan(pixels.y, pixels.x).div(Math.PI * 2);
const wheel = cos(vec3(hue, hue.add(1 / 3), hue.add(2 / 3)).mul(Math.PI * 2)).mul(0.5).add(0.5);
const velocityColor = mix(vec3(0.12), wheel, clamp(pixels.length().div(150), 0, 1));
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputNode = select(view.equal(1), vec4(velocityColor, 1),
  select(view.equal(2), vec4(vec3(float(1).sub(gbuffer.depth)), 1),
    select(view.equal(3), vec4(vec3(float(1).sub(extraction.energy.x.mul(strengthGain))), 1),
      select(view.equal(4), vec4(vec3(extraction.samples.x.greaterThan(0).select(0, 1)), 1),
        select(view.equal(7), drawing,
          select(view.equal(8), vec4(vec3(float(1).sub(creases.lines.y.mul(0.25)).sub(creases.lines.x.mul(1 / 0.3)).clamp(0, 1)), 1), gbuffer.shading))))));
// The panel (H hides it) holds every setting. The old keys still work:
// 1-9 views, D dashed, S style, Space pause, R reseed, W swipe.
const panel = createPanel({
  setParams: params => snakes.setParams(params),
  setView: value => {
    view.value = value;
    ticks.visible = value === 5 || value === 6;
  },
  setDashed: dashed => { strokes.style.value = dashed ? 1 : 0; },
  reseed: () => snakes.reset(),
  swipe: () => motion.swipe(),
});
addEventListener('keydown', event => {
  if (event.key >= '1' && event.key <= '9') panel.set('view', Number(event.key) - 1);
  if (event.key === 'd') panel.set('dashed', !panel.settings.dashed);
  if (event.key === 's') panel.set('style', 1 - panel.settings.style);
  if (event.key === 'r') snakes.reset();
  if (event.key === 'w') motion.swipe();
  if (event.key === ' ') panel.set('paused', !panel.settings.paused);
  if (event.key === 'h') panel.gui.show(panel.gui._hidden);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ?thumbnail=1 (scripts/thumbnails.mjs at the root) leaves out the panel and
// the info box and the swipe, and flags the page ready once the strokes have
// had a few seconds to settle in (counted from the first strokes, below: in
// the capture's software renderer the first frames come slowly).
const thumbnail = new URLSearchParams(location.search).has('thumbnail');
if (thumbnail) {
  motionParams.swipeEvery = 0;
  panel.gui.hide();
  document.getElementById('info')!.hidden = true;
}

let lastStrokes: typeof snakes.latest = null;
const timer = new THREE.Timer();
renderer.setAnimationLoop(time => {
  timer.update(time);
  // A hidden or collapsed window has no size, and WebGPU can't make a zero-sized target.
  if (!innerWidth || !innerHeight) return;
  const delta = timer.getDelta();
  motion.update(panel.settings.paused ? 0 : delta);
  if (delta > 0) frameTime.value = delta;
  resolution.value.set(gbuffer.width, gbuffer.height);
  extraction.update();
  parts.update();
  const latest = snakes.latest;
  if (latest && latest !== lastStrokes) {
    lastStrokes = latest;
    strokes.update({ vertices: latest.strips, indices: latest.stripIndices }, gbuffer.width, gbuffer.height);
  }
  // Draw the shading of the frame the strokes came from, so they stay in step.
  if (lastStrokes) toon.show(lastStrokes.frame);
  // Shaders compile and the snakes get going over the first frames; the
  // drawing fades in once there are strokes to show.
  if (lastStrokes && !document.body.dataset.ready) {
    document.body.dataset.ready = '';
    loading.dataset.done = '';
    if (thumbnail) setTimeout(() => { document.documentElement.dataset.thumbnailReady = 'true'; }, 3000);
  }
  pipeline.render();
  toon.capture(compaction.nextFrame);
  compaction.update();
  ticks.draw(compaction.latest, view.value === 6 ? snakes.latest : null);
});
