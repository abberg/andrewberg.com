import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { contours } from './contours';
import { invertedHull, MAX_LINES } from './outline';
import { screenEdges } from './screenEdges';
import { boilSeed, newSketch, noise3 } from './sketch';
import { partTones, toonMaterial } from './toon';
import { bindToRest, retargetMixamo } from './retarget';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd9d9d9);
scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x2a2622, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(10, 25, 15);
scene.add(sun);

// The model stands about 20 units tall, feet at the origin.
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.5, 500);
camera.position.set(22, 14, 40);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, 0);
controls.enableDamping = true;
controls.update();

const clock = new THREE.Clock();

// The loading bar (index.html) follows both downloads together.
const loading = document.getElementById('loading')!;
const progressBar = loading.querySelector<HTMLElement>('.bar span')!;
const loaded = [0, 0], totals = [0, 0];
const progress = (i: number) => (event: ProgressEvent) => {
  loaded[i] = event.loaded;
  totals[i] = event.total;
  if (totals[0] && totals[1]) progressBar.style.width = `${Math.round((loaded[0] + loaded[1]) / (totals[0] + totals[1]) * 100)}%`;
};
const [gltf, mocap] = await Promise.all([
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./batara.glb', progress(0)),
  new FBXLoader().loadAsync('./Mutant Walking.fbx', progress(1)),
]);
scene.add(gltf.scene);
let batara!: THREE.SkinnedMesh;
gltf.scene.traverse(object => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) batara = object as THREE.SkinnedMesh; });
bindToRest(batara);
// Toon shaded from the sun's direction, in flat part colours read from the texture.
partTones(batara.geometry, (batara.material as THREE.MeshStandardMaterial).map!.image as ImageBitmap);
const toon = toonMaterial(sun.position);
batara.material = toon.material;
const hull = invertedHull(batara);
const edges = screenEdges(renderer);
const strokes = contours(batara, renderer);
// Rooted at the mesh, whose skeleton the retargeted clip's tracks address.
const mixer = new THREE.AnimationMixer(batara);
const walk = mixer.clipAction(retargetMixamo(batara, mocap, mocap.animations[0])).play();

// A click (not an orbit drag) blends one of the Batara's own reaction clips
// into the walk, picked by which way it faces on screen: d000 facing the
// camera, d002 facing away, d001 facing right, d003 facing left. The walk
// keeps time underneath and blends back in as the reaction ends.
const reactions = ['d000', 'd001', 'd002', 'd003'].map(name => {
  const action = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, `charanim/${name}`)!);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  return action;
});
// Seconds to blend in, and back out to the walk. The way out starts a little
// before the reaction ends and runs on past it, holding its last pose.
const BLEND_IN = 0.15, BLEND_OUT = 0.7, OUT_EARLY = 0.3;
let reaction: THREE.AnimationAction | null = null;
let blend = 0;
const react = () => {
  // The model faces +z; which way that points in the camera's view.
  const facing = new THREE.Vector3(0, 0, 1).transformDirection(camera.matrixWorldInverse);
  const index = Math.abs(facing.z) >= Math.abs(facing.x) ? (facing.z > 0 ? 0 : 2) : (facing.x > 0 ? 1 : 3);
  if (reaction && reaction !== reactions[index]) reaction.stop();
  reaction = reactions[index];
  reaction.reset().setEffectiveWeight(blend).play();
};
const blendReaction = (delta: number) => {
  const playing = reaction && reaction.time < reaction.getClip().duration - OUT_EARLY;
  blend = THREE.MathUtils.clamp(blend + (playing ? delta / BLEND_IN : -delta / BLEND_OUT), 0, 1);
  // Eased, so the weights ease into and out of each change rather than ramp.
  const weight = THREE.MathUtils.smoothstep(blend, 0, 1);
  if (reaction) reaction.setEffectiveWeight(weight);
  walk.setEffectiveWeight(1 - weight);
  if (reaction && blend === 0 && !playing) { reaction.stop(); reaction = null; }
};
const press = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', event => press.set(event.clientX, event.clientY));
renderer.domElement.addEventListener('pointerup', event => {
  if (press.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 5) react();
});

// The three outline styles, each in a pane of its own with its own controls,
// side by side over the same model, pose and camera, or one alone, expanded
// to the full width by the button at its top right. The view is kept in the
// URL, so a reload stays on it.
type Style = 'hull' | 'screen' | 'contours';
const names: Record<Style, string> = { hull: 'inverted hull', screen: 'screen-space edges', contours: 'contour strokes' };
const params = new URLSearchParams(location.search);
const view = params.get('view') ?? params.get('style') ?? 'compare';
// ?thumbnail=1 (scripts/thumbnails.mjs at the root) shows all three with no
// controls, and flags the page ready a couple of seconds after the first frame.
const thumbnail = params.has('thumbnail');
if (thumbnail) document.body.dataset.thumbnail = '';
const settings = { view: view in names && !thumbnail ? view : 'compare' };

const panes = (Object.keys(names) as Style[]).map(style => {
  // The contour strokes read best a little tighter.
  const sketch = newSketch(style === 'contours' ? { jitter: 6 } : {});
  // The pane's panels, stacked down its top left.
  const column = document.createElement('div');
  Object.assign(column.style, { position: 'fixed', top: '8px', display: 'flex', flexDirection: 'column', gap: '8px' });
  document.body.append(column);
  const gui = new GUI({ title: names[style], autoPlace: false, width: 220, container: column });
  const toggle = document.createElement('button');
  toggle.addEventListener('click', () => setView(settings.view === 'compare' ? style : 'compare'));
  Object.assign(toggle.style, {
    position: 'fixed', top: '8px', width: '32px', height: '32px', padding: '0', border: '0', borderRadius: '4px',
    background: '#1f1f1f', color: '#eee', cursor: 'pointer', display: 'grid', placeItems: 'center',
  });
  document.body.append(toggle);
  gui.add(sketch, 'lines', 1, MAX_LINES, 1);
  gui.add(sketch, 'jitter', 0, 30, 0.1).name('jitter (px)');
  if (style !== 'hull') gui.add(sketch, 'overshoot', 0, 40, 1).name('overshoot (px)');
  gui.add(sketch, 'boil', 0, 24, 1).name('boil (per s)');
  return { style, sketch, gui, column, toggle };
});
const [hullPane, screenPane, contoursPane] = panes;

hullPane.gui.add(hull.uniforms.thickness, 'value', 0, 0.4, 0.005).name('thickness');
hullPane.gui.add(hull.opacity, 'value', 0, 1, 0.05).name('opacity');

screenPane.gui.add(edges.uniforms.width, 'value', 0.5, 4, 0.1).name('width (px)');
screenPane.gui.add(edges.uniforms.alphaMin, 'value', 0, 1, 0.05).name('alpha min');
screenPane.gui.add(edges.uniforms.alphaMax, 'value', 0, 1, 0.05).name('alpha max');
const noise = screenPane.gui.addFolder('noise');
noise.add(edges.uniforms.noiseScale, 'value', 0.05, 2, 0.01).name('scale');
noise.add(edges.uniforms.noiseWeights.value, 'x', 0, 1, 0.01).name('broad weight');
noise.add(edges.uniforms.noiseWeights.value, 'y', 0, 1, 0.01).name('mid weight');
noise.add(edges.uniforms.noiseFrequencies.value, 'x', 1, 16, 0.5).name('mid frequency (×)');
noise.add(edges.uniforms.noiseWeights.value, 'z', 0, 1, 0.01).name('fine weight');
noise.add(edges.uniforms.noiseFrequencies.value, 'y', 1, 32, 0.5).name('fine frequency (×)');
// A preview of the wander's sideways part, the same sum of noise as the
// shader, over a patch of the model 8 units across (about a shoulder shield).
const preview = document.createElement('canvas');
preview.width = preview.height = 128;
Object.assign(preview.style, { display: 'block', width: '128px', height: '128px', margin: '6px auto 8px', imageRendering: 'pixelated' });
noise.$children.append(preview);
const drawPreview = () => {
  const context = preview.getContext('2d')!;
  const image = context.createImageData(128, 128);
  const { noiseScale, noiseWeights, noiseFrequencies } = edges.uniforms;
  const weights = noiseWeights.value, total = weights.x + weights.y + weights.z || 1;
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const px = (x / 128) * 8 * noiseScale.value, py = (y / 128) * 8 * noiseScale.value;
      const layer = (f: number, offset: number) => noise3(px * f + offset, py * f + offset, offset);
      const w = layer(1, 0) * weights.x + layer(noiseFrequencies.value.x, 5) * weights.y + layer(noiseFrequencies.value.y, 9) * weights.z;
      const v = Math.round((0.5 + 0.5 * w / total) * 255);
      image.data.set([v, v, v, 255], (y * 128 + x) * 4);
    }
  }
  context.putImageData(image, 0, 0);
};
noise.onChange(drawPreview);
drawPreview();
noise.close();

contoursPane.gui.add(strokes.material, 'linewidth', 0.5, 4, 0.1).name('width (px)');
contoursPane.gui.add(strokes.alpha, 'min', 0, 1, 0.05).name('alpha min');
contoursPane.gui.add(strokes.alpha, 'max', 0, 1, 0.05).name('alpha max');

function setView(value: string) {
  settings.view = value;
  params.delete('style');
  params.set('view', value);
  history.replaceState(null, '', `?${params}`);
  resize();
}

// The toon shading all the panes share, in a panel of its own bottom right.
const shading = new GUI({ title: 'toon', autoPlace: false, width: 220 });
Object.assign(shading.domElement.style, { position: 'fixed', right: '8px', bottom: '8px' });
document.body.append(shading.domElement);
// As sRGB hex, so the picker shows the colours as they're seen.
const tonesNamed = { green: 'green', gray: 'gray', highlight: 'highlight (add)', shadow: 'shadow (multiply)' } as const;
const tones = Object.fromEntries(Object.keys(tonesNamed).map(name => [name, `#${toon.uniforms[name as keyof typeof tonesNamed].value.getHexString()}`]));
for (const [name, label] of Object.entries(tonesNamed) as [keyof typeof tonesNamed, string][]) {
  shading.addColor(tones, name).name(label).onChange((hex: string) => toon.uniforms[name].value.set(hex));
}
shading.add(toon.uniforms.litAbove, 'value', -1, 1, 0.01).name('lit above');
shading.add(toon.uniforms.shadowBelow, 'value', -1, 1, 0.01).name('shadow below');
shading.add(toon.uniforms.cell, 'value', 0.05, 1, 0.01).name('dot spacing');
shading.add(toon.uniforms.highlightAbove, 'value', -1, 1, 0.01).name('highlight above');
shading.close();

// Play and pause, from the button bottom middle or the space bar (unless a
// control has the keyboard).
const playPause = document.createElement('button');
Object.assign(playPause.style, {
  position: 'fixed', left: '50%', bottom: '12px', transform: 'translateX(-50%)', width: '40px', height: '40px',
  padding: '0', border: '0', borderRadius: '50%', background: '#1f1f1f', color: '#eee', cursor: 'pointer',
  display: 'grid', placeItems: 'center',
});
document.body.append(playPause);
const showPlaying = () => {
  const playing = mixer.timeScale !== 0;
  playPause.title = playing ? 'Pause (space)' : 'Play (space)';
  playPause.innerHTML = playing
    ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11a1 1 0 0 0 1.5.9l9-5.5a1 1 0 0 0 0-1.8l-9-5.5A1 1 0 0 0 4 2.5z"/></svg>';
};
const togglePlaying = () => {
  mixer.timeScale = mixer.timeScale === 0 ? 1 : 0;
  showPlaying();
};
playPause.addEventListener('click', togglePlaying);
showPlaying();
addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || (event.target as Element).closest('input, select, button')) return;
  event.preventDefault();
  togglePlaying();
});

// Arrows out to the corners, and back in.
const icon = (path: string) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const expandIcon = icon('<path d="M10 2h4v4M14 2l-5 5M6 14H2v-4M2 14l5-5"/>');
const collapseIcon = icon('<path d="M13 7H9V3M9 7l5-5M3 9h4v4M7 9l-5 5"/>');

// The panes on show and where, in CSS pixels; they split the width evenly.
let shown: (typeof panes[number] & { x: number })[] = [];
let paneWidth = innerWidth;
const divider = document.createElement('div');
document.body.append(divider);
function resize() {
  const visible = settings.view === 'compare' ? panes : panes.filter(pane => pane.style === settings.view);
  paneWidth = Math.floor(innerWidth / visible.length);
  shown = visible.map((pane, i) => ({ ...pane, x: i * paneWidth }));
  for (const pane of panes) {
    const at = shown.find(p => p.style === pane.style);
    pane.column.style.display = pane.toggle.style.display = at ? '' : 'none';
    if (!at) continue;
    pane.column.style.left = `${at.x + 8}px`;
    pane.toggle.style.left = `${at.x + paneWidth - 40}px`;
    const expanded = settings.view !== 'compare';
    pane.toggle.title = expanded ? 'Back to all three' : `Expand ${names[pane.style]}`;
    pane.toggle.innerHTML = expanded ? collapseIcon : expandIcon;
  }
  // Thin rules between the panes.
  divider.innerHTML = shown.slice(1).map(pane => `<div style="position:fixed;top:0;bottom:0;left:${pane.x}px;width:1px;background:#b8b8b8"></div>`).join('');
  camera.aspect = paneWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  const ratio = renderer.getPixelRatio();
  edges.setSize(paneWidth * ratio, innerHeight * ratio);
  hull.setSize(paneWidth * ratio, innerHeight * ratio);
}
addEventListener('resize', resize);
resize();

renderer.setScissorTest(true);
renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  mixer.update(delta);
  blendReaction(delta * mixer.timeScale);
  controls.update();
  const ratio = renderer.getPixelRatio();
  for (const { style, sketch, x } of shown) {
    renderer.setViewport(x, 0, paneWidth, innerHeight);
    renderer.setScissor(x, 0, paneWidth, innerHeight);
    // Without boil, the lines hold one shape.
    const boil = sketch.boil > 0 ? boilSeed(clock.elapsedTime, sketch.boil) : 0;
    const jitter = sketch.jitter * ratio;
    strokes.lines.visible = style === 'contours';
    if (style === 'hull') {
      hull.uniforms.boil.value = boil;
      hull.uniforms.jitter.value = jitter;
      renderer.render(scene, camera);
      hull.render(renderer, camera, sketch.lines);
    } else if (style === 'screen') {
      edges.uniforms.lines.value = sketch.lines;
      edges.uniforms.boil.value = boil;
      edges.uniforms.jitter.value = jitter;
      edges.uniforms.overshoot.value = sketch.overshoot * ratio;
      edges.uniforms.origin.value.set(x * ratio, 0);
      edges.render(scene, camera, batara);
    } else {
      strokes.update(camera, paneWidth, innerHeight, boil, sketch);
      renderer.render(scene, camera);
    }
  }
  strokes.lines.visible = false;
  // The first frame is drawn: fade it in.
  if (!document.body.dataset.ready) {
    progressBar.style.width = '100%';
    document.body.dataset.ready = '';
    loading.dataset.done = '';
    if (thumbnail) setTimeout(() => { document.documentElement.dataset.thumbnailReady = 'true'; }, 2000);
  }
});
