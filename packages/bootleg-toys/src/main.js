import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import robots from "virtual:robots";
import { slots, prepare, kitbash, canLend, donor } from "./kitbash.js";
import { colours as resinColours, resin } from "./resin.js";
import { bake } from "./bake.js";

// A scene for looking at models: one model at a time, framed to fit, lit by a
// neutral studio environment, with orbit controls. The robots in
// public/models are listed on the left; pick one, or step through them with
// the arrow keys. Kitbash mode builds a robot from four others' parts. Drop a
// .glb (or a self-contained .gltf) on the page to swap it in. ?thumbnail=1
// holds the camera still and flags the page ready once the first frame is
// drawn.
const thumbnailMode = new URLSearchParams(location.search).has("thumbnail");
if (thumbnailMode) document.documentElement.classList.add("thumbnail");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x16181c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = !thumbnailMode;
controls.autoRotateSpeed = 1;
// Any drag stops the turntable.
controls.addEventListener("start", () => (controls.autoRotate = false));

// Kitbash mode looks down on its belt of figures through a fixed orthographic
// camera, turned off the grid's axes so the rows run away diagonally, lower
// than the true isometric angle and close in, so the figures are big.
const isoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const lookAt = new THREE.Vector3(0, 0.6, 0);
const elevation = THREE.MathUtils.degToRad(28);
const azimuth = THREE.MathUtils.degToRad(30);
// Along the ground towards the camera.
const towardsCamera = new THREE.Vector3(Math.sin(azimuth), 0, Math.cos(azimuth));

function frameField() {
  isoCamera.position
    .copy(towardsCamera)
    .multiplyScalar(Math.cos(elevation))
    .setY(Math.sin(elevation))
    .multiplyScalar(40)
    .add(lookAt);
  isoCamera.lookAt(lookAt);
  // Now, rather than at the next render: the belt works out what's on
  // screen from it straight away.
  isoCamera.updateMatrixWorld();
  sizeIsoCamera();
}

// Half the view's height, in scene units.
const halfHeight = 3.2;

function sizeIsoCamera() {
  const aspect = innerWidth / innerHeight;
  isoCamera.left = -halfHeight * aspect;
  isoCamera.right = halfHeight * aspect;
  isoCamera.top = halfHeight;
  isoCamera.bottom = -halfHeight;
  isoCamera.updateProjectionMatrix();
}

// The robots' FBX materials are Phong, which ignores the environment map, so
// they need lights of their own.
const sky = new THREE.HemisphereLight(0xffffff, 0x444455, 2);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(1, 2, 1.5);
scene.add(sky, sun);

// In kitbash mode a light sits behind the figure, opposite the camera, so
// light comes through the resin towards you; thin parts only glow where it
// does.
const rim = new THREE.DirectionalLight(0xfff4e6, 0);
scene.add(rim, rim.target);
const behind = new THREE.Vector3();
function placeRim() {
  rim.intensity = mode === "kitbash" ? 3 : 0;
  behind.subVectors(lookAt, isoCamera.position).setY(0).normalize();
  rim.position.copy(lookAt).addScaledVector(behind, 3).setY(1.2);
  rim.target.position.copy(lookAt);
}

const loader = new GLTFLoader();
const fbxLoader = new FBXLoader();
let model = null;

// Put the model at the origin, sized so its bounding sphere has radius 1,
// and pull the camera back to fit it. Only visible meshes count, so a robot is
// framed without the weapons it's hiding.
// keepCamera leaves the view alone, for swapping kitbash parts.
function show(object, { keepCamera = false } = {}) {
  if (model) scene.remove(model);
  model = object;
  const box = visibleBox(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  model.position.sub(sphere.center);
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(1 / sphere.radius);
  scene.add(holder);
  model = holder;
  if (keepCamera) return;

  const distance = 1 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0.35, 1).normalize().multiplyScalar(distance * 0.9);
  controls.target.set(0, 0, 0);
  controls.update();
}

function visibleBox(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverseVisible((child) => {
    if (!child.isMesh) return;
    child.geometry.computeBoundingBox();
    box.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(object) : box;
}

// A robot is several meshes on one skeleton: the body, called "model", plus
// weapons (wp_*) and extra parts (eq_*: holstered gear, but also alternate
// hands, wings and faces). Show just the body to begin with, and list every
// part so any of them can be switched back on. The odd robot without a
// "model" mesh shows everything.
const parts = document.getElementById("parts");
const coreMesh = /^(model|body|mode)$/;

function listParts(object) {
  const meshes = [];
  object.traverse((child) => child.isMesh && meshes.push(child));
  const hasCore = meshes.some((mesh) => coreMesh.test(mesh.name));
  parts.replaceChildren(
    ...meshes.map((mesh) => {
      mesh.visible = !hasCore || coreMesh.test(mesh.name);
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = mesh.visible;
      box.addEventListener("change", () => (mesh.visible = box.checked));
      label.append(box, mesh.name || "(unnamed)");
      return label;
    }),
  );
}

// The robot list. Typing filters it; up and down step through what's shown.
const list = document.getElementById("robots");
const filter = document.getElementById("filter");
let current = null;
let loading = 0;

function renderList() {
  const query = filter.value.trim().toLowerCase();
  list.replaceChildren(
    ...robots
      .filter((robot) => robot.id.toLowerCase().includes(query))
      .map((robot) => {
        const item = document.createElement("li");
        item.textContent = robot.name;
        item.title = robot.id;
        item.dataset.id = robot.id;
        item.classList.toggle("current", robot.id === current);
        item.addEventListener("click", () => loadRobot(robot.id));
        return item;
      }),
  );
}

async function loadRobot(id) {
  setMode("viewer");
  current = id;
  history.replaceState(null, "", `#${id}`);
  for (const item of list.children) item.classList.toggle("current", item.dataset.id === id);
  list.querySelector(".current")?.scrollIntoView({ block: "nearest" });
  // Ignore a load that finishes after a newer one has started.
  const ticket = ++loading;
  try {
    const object = await fbxLoader.loadAsync(`./models/${id}/${id}.fbx`);
    if (ticket !== loading) return;
    listParts(object);
    show(object);
  } catch (error) {
    console.error(`Couldn't load ${id}`, error);
  }
}

function step(by) {
  const items = [...list.children];
  if (!items.length) return;
  const index = items.findIndex((item) => item.dataset.id === current);
  const next = items[(index + by + items.length) % items.length];
  loadRobot(next.dataset.id);
}

filter.addEventListener("input", renderList);
// Editing the hash by hand loads that robot too.
addEventListener("hashchange", () => {
  const hash = location.hash.slice(1);
  if (hash.startsWith("kitbash=")) {
    if (mode !== "kitbash" || hash !== fieldHash()) openKitbash(hash);
  } else if (hash === "viewer") loadRobot(current ?? robots[0].id);
  else if (hash !== current && robots.some((robot) => robot.id === hash)) loadRobot(hash);
});
addEventListener("keydown", (event) => {
  if (event.target.matches("input, select")) {
    if (event.key === "Escape") event.target.blur();
    if (event.target !== filter || mode !== "viewer") return;
  }
  if (mode === "viewer" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    step(event.key === "ArrowDown" ? 1 : -1);
  }
  if (mode === "kitbash" && event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey) newField();
  if (mode === "kitbash" && event.key === "Escape") putDown();
});
renderList();

// Kitbash mode: an endless conveyor belt of kitbashed robots cast in resin,
// like bootleg figures coming off the line. Each figure borrows its head,
// body, arms and legs from four robots and comes in one resin colour. The
// belt grows from a seed, so the hash (#kitbash=seed) brings the same one
// back.
let mode = "viewer";
const prepared = new Map();

function setMode(next) {
  mode = next;
  document.documentElement.dataset.mode = next;
  // Clear resin needs something bright behind it to glow against. The studio
  // environment is turned down for it: at full strength its bright walls and
  // lamps reflect off nearly every facet and wash the colour out to white.
  scene.background.set(next === "kitbash" ? 0xeceae6 : 0x16181c);
  scene.environmentIntensity = next === "kitbash" ? 0.6 : 1;
  field.visible = next === "kitbash";
  if (model) model.visible = next === "viewer";
  controls.enabled = next === "viewer";
}

// Load a robot once and keep what the kitbash needs from it.
function preparedRobot(id) {
  if (!prepared.has(id)) {
    prepared.set(id, fbxLoader.loadAsync(`./models/${id}/${id}.fbx`).then(prepare));
  }
  return prepared.get(id);
}

const humanoids = robots.filter((robot) => robot.humanoid);
const colourNames = Object.keys(resinColours);
const pickFrom = (list, random) => list[Math.floor(random() * list.length)];
const isRobot = (id) => robots.some((robot) => robot.id === id);

// A small seeded random number generator (mulberry32), so a seed always grows
// the same field.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSpec(random = Math.random) {
  const spec = Object.fromEntries(slots.map((slot) => [slot, pickFrom(humanoids, random).id]));
  spec.colour = pickFrom(colourNames, random);
  return spec;
}

// head,body,arms,legs,colour from a link, or null if it doesn't name robots.
function parseSpec(values) {
  const ids = values?.split(",") ?? [];
  if (!slots.every((_, n) => isRobot(ids[n]))) return null;
  const spec = Object.fromEntries(slots.map((slot, n) => [slot, ids[n]]));
  spec.colour = ids[4] in resinColours ? ids[4] : colourNames[0];
  return spec;
}

// The belt: a square tile of slots, 14 a side, every figure scaled to the
// same height and standing on its base in the middle of its slot. The whole
// tile slides the way the figures face, towards the camera; a slot that runs off the front comes round
// again at the back, out of sight, with a new figure in it. Only slots on
// screen are drawn, and only those on or near it are built.
const across = 14;
const spacing = 2.4;
const figureHeight = 1.8;
const tile = across * spacing;
// The robots all face +z.
const facing = new THREE.Vector3(0, 0, 1);
const speed = 0.35;
const field = new THREE.Group();
field.visible = false;
scene.add(field);
let seed = 1;
let travelled = 0;
// Hand edits, by slot and lap; they last until that figure leaves.
const overrides = new Map();

const belt = Array.from({ length: across * across }, (_, i) => ({
  index: i,
  home: new THREE.Vector3(((i % across) - (across - 1) / 2) * spacing, 0, (Math.floor(i / across) - (across - 1) / 2) * spacing),
  position: new THREE.Vector3(),
  lap: 0,
  holder: null,
  building: false,
  spec: null,
}));

// Where a slot is after the tile has travelled so far, wrapped back into the
// tile, and how many times it's come round (a new figure each time).
const wrap = (value) => [THREE.MathUtils.euclideanModulo(value + tile / 2, tile) - tile / 2, Math.floor((value + tile / 2) / tile)];
function place(slot) {
  const [x, lapX] = wrap(slot.home.x + facing.x * travelled);
  const [z, lapZ] = wrap(slot.home.z + facing.z * travelled);
  slot.position.set(x, 0, z);
  return lapX + lapZ;
}

// A figure's robots and colour follow from the seed, its slot and its lap.
const mix = (a, b, c) => Math.imul(a ^ Math.imul(b + 1, 0x9e3779b1) ^ Math.imul(c + 1, 0x85ebca6b), 0xc2b2ae35) >>> 0;
const keyOf = (slot) => `${slot.index}:${slot.lap}`;
const specFor = (slot) => overrides.get(keyOf(slot)) ?? slot.spec ?? randomSpec(seeded(mix(seed, slot.index, slot.lap)));

const fieldHash = () => `kitbash=${seed}`;

let fieldTicket = 0;
// Load the robots a figure borrows from. One that can't lend the part asked
// of it (no skinned body mesh, or that part kept outside it) is swapped for
// another, drawn from the same seed so the belt still comes back the same.
async function lenders(slot, spec) {
  const random = seeded(mix(seed, slot.index, slot.lap) ^ 0x5eed);
  const ready = {};
  await Promise.all(
    slots.map(async (part) => {
      for (let tries = 0; tries < 12; tries++) {
        const robot = await preparedRobot(spec[part]);
        if (robot && canLend(robot, part)) return (ready[part] = robot);
        spec[part] = pickFrom(humanoids, random).id;
      }
    }),
  );
  return ready;
}

async function buildFigure(slot) {
  const ticket = fieldTicket;
  const lap = slot.lap;
  const stale = () => ticket !== fieldTicket || lap !== slot.lap;
  const spec = { ...specFor(slot) };
  const ready = await lenders(slot, spec);
  if (stale() || slots.some((part) => !ready[part])) return;
  // Remember any swaps, so the panel shows what's really there.
  slot.spec = spec;
  if (overrides.has(keyOf(slot))) overrides.set(keyOf(slot), spec);
  const figure = await bake(kitbash(ready, resin(spec.colour), seeded(mix(seed, slot.index, slot.lap) ^ 0x9053)));
  if (stale()) return dispose(figure);
  const box = new THREE.Box3().setFromObject(figure);
  const size = box.getSize(new THREE.Vector3());
  figure.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const holder = new THREE.Group();
  holder.add(figure);
  // As tall as the rest, unless that would spill out of the slot.
  holder.scale.setScalar(Math.min(figureHeight / size.y, (spacing * 0.92) / Math.max(size.x, size.z)));
  holder.position.copy(slot.position);
  holder.userData = { slot, colour: spec.colour };
  clear(slot);
  slot.holder = holder;
  field.add(holder);
}

function dispose(object) {
  object.traverse((child) => (child.isMesh || child.isLine) && child.geometry.dispose());
}

function clear(slot) {
  if (!slot.holder) return;
  field.remove(slot.holder);
  dispose(slot.holder);
  slot.holder = null;
}

// How far a point is from the middle of the screen, in screen halves: under
// 1 is on screen.
const projected = new THREE.Vector3();
function fromCentre(position, height = figureHeight / 2) {
  projected.copy(position).setY(height).project(isoCamera);
  return Math.max(Math.abs(projected.x), Math.abs(projected.y));
}

// Builds run a few at a time so the bake workers all have something to do,
// nearest the screen first. A slot is built once it's within half a screen
// of the edge, which on the belt is well before it comes into view.
const building = new Set();
function buildSoon() {
  const waiting = belt
    .filter((slot) => !slot.holder && !building.has(slot) && fromCentre(slot.position) < 1.5)
    .sort((a, b) => fromCentre(a.position) - fromCentre(b.position));
  for (const slot of waiting) {
    if (building.size >= 8) break;
    building.add(slot);
    buildFigure(slot).finally(() => {
      building.delete(slot);
      buildSoon();
    });
  }
}

// Each frame: move the belt along (it stops while a figure is held), send
// slots that came round to the back off for a new figure, and draw only the
// figures on screen. A figure that's been picked up is left to the pick-up
// below.
function runBelt(seconds) {
  if (!held) travelled += speed * Math.min(seconds, 0.1);
  for (const slot of belt) {
    const lap = place(slot);
    if (lap !== slot.lap) {
      slot.lap = lap;
      slot.spec = null;
      if (slot.holder && slot.holder === held?.holder) slot.holder = null;
      else clear(slot);
    }
    if (slot.holder && slot.holder !== held?.holder) {
      slot.holder.position.copy(slot.position);
      // Measured from its middle, so with room for its top, bottom and sides.
      slot.holder.visible = fromCentre(slot.position) < 1.4;
    }
  }
  buildSoon();
  runPickUp(Math.min(seconds, 0.1));
}

function buildField() {
  fieldTicket++;
  history.replaceState(null, "", `#${fieldHash()}`);
  if (held && held.slot.holder !== held.holder) dispose(held.holder);
  held = null;
  travelled = 0;
  for (const slot of belt) {
    clear(slot);
    slot.spec = null;
    slot.lap = place(slot);
  }
  buildSoon();
}

function newField() {
  seed = Math.floor(Math.random() * 1e9);
  overrides.clear();
  buildField();
}

// Picking a figure up. Hovering one shows a pointer; clicking lifts it off
// the belt and flies it up in front of the camera, large, while the belt
// stops and dims behind it. Dragging turns it to look it over. Clicking it
// (without dragging), clicking off it or Esc sets it back down in its slot,
// and the belt rolls on.
const liftTime = 0.7;
const heldSize = 2.1;
let held = null;

const up = new THREE.Vector3(0, 1, 0);
// Along the line of sight, so things stay put on screen however near they come.
const sight = () => isoCamera.position.clone().sub(lookAt).normalize();

// A white veil over the whole belt. It's drawn last and through everything,
// and the held figure is drawn after it on a layer of its own (see the
// render loop), so no figure on the belt, however near, comes out in front.
const veil = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
);
veil.renderOrder = 1;
veil.visible = false;
field.add(veil);
const heldLayer = 1;
const onLayer = (object, layer) => object.traverse((child) => child.layers.set(layer));

function beltPlace(pick) {
  const { slot, holder } = pick;
  // Still its slot's figure: back to the slot. Otherwise the slot came round
  // without it (a new belt), and it's simply put away.
  return slot.holder === holder ? slot.position.clone() : null;
}

// Put a figure straight back where it belongs, mid-flight or not.
function settle(pick) {
  const { holder } = pick;
  onLayer(holder, 0);
  for (const source of pick.sources) {
    field.remove(source.view);
    dispose(source.view);
    source.label.remove();
  }
  pick.sources = [];
  highlight(pick, null);
  holder.scale.setScalar(pick.size);
  holder.quaternion.identity();
  const place = beltPlace(pick);
  if (place) holder.position.copy(place);
  else {
    field.remove(holder);
    dispose(holder);
  }
}

function pickUp(holder) {
  if (held) settle(held);
  const size = holder.scale.x;
  // Its middle, in its own units, to turn it about.
  const box = new THREE.Box3().setFromObject(holder);
  const middle = new THREE.Vector3(0, (box.max.y - box.min.y) / 2 / size, 0);
  held = { slot: holder.userData.slot, holder, progress: 0, lifting: true, size, middle, turn: 0, tilt: 0, sources: [], lit: null };
  holder.visible = true;
  onLayer(holder, heldLayer);
  showSources(held);
}

function putDown() {
  if (held) held.lifting = false;
}

const yaw = new THREE.Quaternion();
const pitch = new THREE.Quaternion();
function runPickUp(seconds) {
  veil.visible = !!held;
  if (!held) return;
  const { holder } = held;
  held.progress = THREE.MathUtils.clamp(held.progress + (held.lifting ? 1 : -1) * (seconds / liftTime), 0, 1);
  // On the way down it turns back to face the front.
  if (!held.lifting) {
    const ease = Math.min(1, seconds * 6);
    held.turn = THREE.MathUtils.lerp(held.turn, Math.round(held.turn / (Math.PI * 2)) * Math.PI * 2, ease);
    held.tilt = THREE.MathUtils.lerp(held.tilt, 0, ease);
  }
  const t = THREE.MathUtils.smootherstep(held.progress, 0, 1);
  const view = sight();
  veil.material.opacity = 0.9 * t;
  veil.position.copy(lookAt).addScaledVector(view, 6);
  veil.quaternion.copy(isoCamera.quaternion);

  // Fly its middle from the belt to the middle of the view, in an arc, and
  // turn it about that middle.
  const scale = held.size * THREE.MathUtils.lerp(1, heldSize, t);
  const from = beltPlace(held) ?? holder.position.clone();
  const fromMiddle = from.addScaledVector(up, held.middle.y * held.size);
  const toMiddle = lookAt.clone().addScaledVector(view, 12);
  const middle = fromMiddle.lerp(toMiddle, t).addScaledVector(up, Math.sin(Math.PI * t) * 1.2);
  // Tilting is about the screen's horizontal, so up and down drags tip it
  // towards and away from you.
  const across = new THREE.Vector3().crossVectors(up, view).normalize();
  // Turned to face the camera square on as it comes up: round by the
  // camera's turn off the belt (the figures face +z) and tipped back by its
  // height, so its front looks straight out of the screen. Dragging turns it
  // from there.
  holder.quaternion
    .copy(pitch.setFromAxisAngle(across, held.tilt - elevation * t))
    .multiply(yaw.setFromAxisAngle(up, held.turn + azimuth * t));
  holder.scale.setScalar(scale);
  holder.position.copy(middle).sub(held.middle.clone().multiplyScalar(scale).applyQuaternion(holder.quaternion));

  placeSources(held, t);

  if (!held.lifting && held.progress === 0) {
    settle(held);
    held = null;
    veil.visible = false;
  }
}

// The held figure's sources: the four robots it was built from, in a column
// down the left, each as it was, the part it lent in its own game textures
// and the rest of it a white ghost drawn in outline, and named. Hovering one lights up its part on
// the figure, and hovering a part of the figure lights up its source.
const sourcesBox = document.getElementById("sources");
const ghost = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const fade = () => ghost;
const creases = new THREE.LineBasicMaterial({ color: 0x2a2c30, toneMapped: false });
// The outline: the ghost's back faces, pushed out along their normals by the
// same distance on screen everywhere (the camera's orthographic, so a
// distance in view space is a fixed number of pixels).
const outline = new THREE.MeshBasicMaterial({ color: 0x2a2c30, side: THREE.BackSide, toneMapped: false });
outline.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <project_vertex>",
    `vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
mvPosition.xyz += normalize( normalMatrix * normal ) * 0.012;
gl_Position = projectionMatrix * mvPosition;`,
  );
};
// The textured parts, lit up: the same texture with a glow over it.
const glowing = new Map();
function glow(material) {
  if (!glowing.has(material)) {
    const copy = material.clone();
    copy.emissive?.set(0x555555);
    glowing.set(material, copy);
  }
  return glowing.get(material);
}
const robotName = (id) => robots.find((robot) => robot.id === id)?.name ?? id;
const sourceHeight = 1.2;

async function showSources(pick) {
  const spec = pick.slot.spec ?? specFor(pick.slot);
  await Promise.all(
    slots.map(async (part, row) => {
      const robot = await preparedRobot(spec[part]);
      if (!robot || held !== pick) return;
      const model = donor(robot, part, fade);
      // Everything gets an outline; the ghost also gets its sharp creases
      // drawn in, so its panel lines read.
      for (const piece of [...model.children]) {
        piece.add(new THREE.Mesh(piece.geometry, outline));
        if (piece.material === ghost) piece.add(new THREE.LineSegments(new THREE.EdgesGeometry(piece.geometry, 35), creases));
      }
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      const view = new THREE.Group();
      view.add(model);
      view.userData = { part, size: Math.min(sourceHeight / size.y, 1.5 / Math.max(size.x, size.z)) };
      view.scale.setScalar(0);
      onLayer(view, heldLayer);
      field.add(view);
      const label = document.createElement("div");
      label.className = "source";
      label.innerHTML = `<b>${part}</b>${robotName(spec[part])}`;
      sourcesBox.append(label);
      pick.sources.push({ part, row, view, label });
    }),
  );
}

const screenAcross = new THREE.Vector3();
const screenUp = new THREE.Vector3();
const labelAt = new THREE.Vector3();
function placeSources(pick, t) {
  const view = sight();
  screenAcross.setFromMatrixColumn(isoCamera.matrixWorld, 0);
  screenUp.setFromMatrixColumn(isoCamera.matrixWorld, 1);
  const centre = lookAt.clone().addScaledVector(view, 12);
  const left = -halfHeight * (innerWidth / innerHeight) + 1;
  const rowHeight = (halfHeight * 2 - 0.8) / slots.length;
  for (const { row, view: model, label } of pick.sources) {
    // Its row's bottom, a little up from the edge of the row.
    const bottom = halfHeight - 0.4 - (row + 1) * rowHeight + 0.3;
    model.position.copy(centre).addScaledVector(screenAcross, left).addScaledVector(screenUp, bottom);
    model.scale.setScalar(model.userData.size * t);
    model.rotation.y = 0.5;
    labelAt.copy(model.position).addScaledVector(screenAcross, 0.85).addScaledVector(screenUp, sourceHeight / 2).project(isoCamera);
    label.style.left = `${((labelAt.x + 1) / 2) * innerWidth}px`;
    label.style.top = `${((1 - labelAt.y) / 2) * innerHeight}px`;
    label.style.opacity = t;
  }
}

// Light up one part, on the figure and on its source, or none.
const lit = new Map();
function litResin(colour) {
  if (!lit.has(colour)) {
    // clone() copies userData through JSON, which would turn the glow colour
    // uniform into a plain object; share the original's instead.
    const material = resin(colour).clone();
    material.onBeforeCompile = resin(colour).onBeforeCompile;
    material.userData = resin(colour).userData;
    // Glowing in its own colour, rather than bleached.
    material.emissive.setHex(resinColours[colour]);
    material.emissiveIntensity = 0.6;
    lit.set(colour, material);
  }
  return lit.get(colour);
}

function highlight(pick, part) {
  if (pick.lit === part) return;
  pick.lit = part;
  const colour = pick.holder.userData.colour;
  const paint = (object) =>
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.material = part && child.name === part ? litResin(colour) : resin(colour);
    });
  paint(pick.holder);
  for (const source of pick.sources) {
    const on = source.part === part;
    source.label.classList.toggle("lit", on);
    source.view.traverse((child) => {
      if (!child.isMesh || child.material === ghost || child.material === outline) return;
      child.userData.texture ??= child.material;
      child.material = on ? glow(child.userData.texture) : child.userData.texture;
    });
  }
}

// Which figure, if any, is under the pointer: the one held first, then any
// on screen.
const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
function figureAt(event) {
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, isoCamera);
  const holders = held ? [held.holder] : belt.map((slot) => slot.holder).filter((holder) => holder?.visible);
  let hit = raycaster.intersectObjects(holders, true)[0]?.object;
  while (hit && !hit.userData.slot) hit = hit.parent;
  return hit ?? null;
}

// Dragging while a figure is held turns it; a press that doesn't move is a
// click.
let drag = null;
let lastPointer = null;
let pointerMoved = false;
renderer.domElement.addEventListener("pointerdown", (event) => {
  if (mode !== "kitbash" || !held?.lifting) return;
  drag = { x: event.clientX, y: event.clientY, moved: false };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  lastPointer = event;
  pointerMoved = true;
  if (!drag || !held) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  held.turn += dx * 0.01;
  held.tilt = THREE.MathUtils.clamp(held.tilt + dy * 0.01, -0.9, 0.9);
  drag.x = event.clientX;
  drag.y = event.clientY;
});
renderer.domElement.addEventListener("pointerup", () => {
  if (drag?.moved) drag.dragged = true;
  else drag = null;
});

// While a figure is held: the part of it, or the source, under the pointer.
function partAt(event) {
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, isoCamera);
  const hit = raycaster.intersectObjects([held.holder, ...held.sources.map((source) => source.view)], true)[0];
  if (!hit) return null;
  let object = hit.object;
  while (object && object.userData.part === undefined && !object.userData.slot) object = object.parent;
  const source = object?.userData.part;
  return { part: source ?? (slots.includes(hit.object.name) ? hit.object.name : null), source: !!source };
}

// Checked once a frame rather than on every pointer event.
function runHover() {
  if (!pointerMoved || !lastPointer) return;
  pointerMoved = false;
  if (mode !== "kitbash") return;
  if (held) {
    const over = drag?.moved ? null : partAt(lastPointer);
    if (!drag?.moved) highlight(held, over?.part ?? null);
    renderer.domElement.style.cursor = drag?.moved ? "grabbing" : over && !over.source ? "grab" : "";
    return;
  }
  renderer.domElement.style.cursor = figureAt(lastPointer) ? "pointer" : "";
}

renderer.domElement.addEventListener("click", (event) => {
  if (mode !== "kitbash") return;
  // The end of a drag isn't a click.
  if (drag?.dragged) return void (drag = null);
  drag = null;
  // A click on a source leaves the figure up; anywhere else puts it down.
  if (held) return partAt(event)?.source ? undefined : putDown();
  const holder = figureAt(event);
  if (holder) pickUp(holder);
});

function openKitbash(hash = "") {
  setMode("kitbash");
  const [head] = hash.replace(/^kitbash=/, "").split(";");
  const values = head.split(",");
  overrides.clear();
  // Older links may carry a finish or hand edits after the seed; the belt
  // only keeps the seed. An older link to a single kitbash starts a belt
  // with it in the middle.
  if (/^\d+$/.test(values[0])) seed = Number(values[0]);
  else {
    seed = Math.floor(Math.random() * 1e9);
    const parsed = parseSpec(head);
    const middle = belt.reduce((best, slot) => (slot.home.length() < best.home.length() ? slot : best));
    if (parsed) overrides.set(`${middle.index}:0`, parsed);
  }
  frameField();
  buildField();
}

// The belt is the page. The viewer is still there for looking at one robot
// at a time: #viewer, or a robot's name, opens it.
const hash = location.hash.slice(1);
const start = robots.find((robot) => robot.id === hash) ?? robots[0];
if (start && !thumbnailMode) {
  if (hash === "viewer" || robots.some((robot) => robot.id === hash)) loadRobot(start.id);
  else openKitbash(hash.startsWith("kitbash=") ? hash : `kitbash=${Math.floor(Math.random() * 1e9)}`);
} else document.documentElement.classList.add("no-robots");

if (!start || thumbnailMode) loader.loadAsync("./models/DamagedHelmet.glb").then((gltf) => {
  show(gltf.scene);
  if (thumbnailMode) {
    renderer.render(scene, camera);
    requestAnimationFrame(() => (document.documentElement.dataset.thumbnailReady = "true"));
  }
});

// Drag and drop. Only single-file models load: a .gltf that points at
// separate .bin or texture files won't find them.
addEventListener("dragover", (event) => {
  event.preventDefault();
  document.documentElement.classList.add("dragging");
});
addEventListener("dragleave", () => document.documentElement.classList.remove("dragging"));
addEventListener("drop", async (event) => {
  event.preventDefault();
  if (mode !== "viewer") return;
  document.documentElement.classList.remove("dragging");
  const file = event.dataTransfer.files[0];
  if (!file) return;
  try {
    const { scene: dropped } = await loader.parseAsync(await file.arrayBuffer(), "");
    listParts(dropped);
    show(dropped);
  } catch (error) {
    console.error(`Couldn't load ${file.name}`, error);
  }
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  sizeIsoCamera();
  renderer.setSize(innerWidth, innerHeight);
});

// Lights shine on the held figure's layer too.
for (const light of [sky, sun, rim]) light.layers.enable(heldLayer);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const seconds = clock.getDelta();
  const belted = mode === "kitbash";
  if (belted) {
    runBelt(seconds);
    runHover();
  } else controls.update();
  placeRim();
  if (!belted || !held) return renderer.render(scene, belted ? isoCamera : camera);
  // A figure is held: the belt and its veil, then the figure over the top.
  renderer.render(scene, isoCamera);
  // A colour background would paint over the belt, so it's left out; the
  // clear colour matches it, for the figure's transmission to see through to.
  const background = scene.background;
  scene.background = null;
  renderer.setClearColor(background);
  renderer.autoClear = false;
  renderer.clearDepth();
  isoCamera.layers.set(heldLayer);
  renderer.render(scene, isoCamera);
  isoCamera.layers.set(0);
  renderer.autoClear = true;
  scene.background = background;
});
