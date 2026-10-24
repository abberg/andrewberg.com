import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import robots from "virtual:robots";
import { slots, prepare, kitbash, canLend } from "./kitbash.js";
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

// Kitbash mode looks down on its field through an orthographic camera at the
// isometric angle: equal parts of x, y and z, so the grid's rows run off at
// thirty degrees either side.
const isoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const isoControls = new OrbitControls(isoCamera, renderer.domElement);
isoControls.enableDamping = true;
isoControls.enabled = false;
// Keep it looking down; it can turn and zoom but not go under the table.
isoControls.maxPolarAngle = THREE.MathUtils.degToRad(80);

// Fit the field to the window: wide enough that the grid runs off the sides,
// so it reads as a table full of figures rather than a diamond of them.
function frameField() {
  isoCamera.position.set(1, 1, 1).multiplyScalar(40);
  isoControls.target.set(0, 0, 0);
  isoCamera.zoom = 1;
  sizeIsoCamera();
  isoControls.update();
}

function sizeIsoCamera() {
  const halfHeight = columns * spacing * 0.32;
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
  behind.subVectors(isoControls.target, isoCamera.position).setY(0).normalize();
  rim.position.copy(isoControls.target).addScaledVector(behind, 3).setY(1.2);
  rim.target.position.copy(isoControls.target);
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
  } else if (hash !== current && robots.some((robot) => robot.id === hash)) loadRobot(hash);
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
  if (mode === "kitbash" && event.key === "Escape") select(null);
});
renderList();

// Kitbash mode: a field of kitbashed robots cast in resin, seen from above at
// an isometric angle, like a table of bootleg figures. Each figure borrows its
// head, body, arms and legs from four robots and comes in one resin colour.
// The field grows from a seed, so the hash (#kitbash=seed) brings the
// same one back; figures edited by hand are added to it as
// ;index:head,body,arms,legs,colour.
let mode = "viewer";
const prepared = new Map();
const slotPickers = {};

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
  isoControls.enabled = next === "kitbash";
  for (const button of document.querySelectorAll("[data-mode-button]")) {
    button.setAttribute("aria-pressed", button.dataset.modeButton === next);
  }
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

// The field: an 8 by 8 grid, every figure scaled to the same height and
// standing on its base at the centre of its cell.
const columns = 8;
const spacing = 2.1;
const figureHeight = 1.8;
const field = new THREE.Group();
field.visible = false;
scene.add(field);
let seed = 1;
const overrides = new Map();
const figures = [];
let selected = null;

const cells = Array.from({ length: columns * columns }, (_, i) => {
  const offset = (columns - 1) / 2;
  return new THREE.Vector3(((i % columns) - offset) * spacing, 0, (Math.floor(i / columns) - offset) * spacing);
});
// Build from the middle out, so the view fills in around its centre.
const buildOrder = cells.map((_, i) => i).sort((a, b) => cells[a].length() - cells[b].length());

// Figures whose robots were swapped for ones that can lend their parts.
const resolved = new Map();
const specFor = (i) => overrides.get(i) ?? resolved.get(i) ?? randomSpec(seeded(seed * 4099 + i));

const fieldHash = () =>
  `kitbash=${seed}` +
  [...overrides].map(([i, spec]) => `;${i}:${[...slots.map((slot) => spec[slot]), spec.colour].join(",")}`).join("");

let fieldTicket = 0;
// Load the robots a figure borrows from. One that can't lend the part asked
// of it (no skinned body mesh, or that part kept outside it) is swapped for
// another, drawn from the same seed so the field still comes back the same.
async function lenders(i, spec) {
  const random = seeded(seed * 4099 + i + 0x5eed);
  const ready = {};
  await Promise.all(
    slots.map(async (slot) => {
      for (let tries = 0; tries < 12; tries++) {
        const robot = await preparedRobot(spec[slot]);
        if (robot && canLend(robot, slot)) return (ready[slot] = robot);
        spec[slot] = pickFrom(humanoids, random).id;
      }
    }),
  );
  return ready;
}

async function buildFigure(i, ticket) {
  const spec = { ...specFor(i) };
  const ready = await lenders(i, spec);
  if (ticket !== fieldTicket) return;
  if (slots.some((slot) => !ready[slot])) return;
  // Remember any swaps, so the panel shows what's really there.
  (overrides.has(i) ? overrides : resolved).set(i, spec);
  const figure = await bake(kitbash(ready, resin(spec.colour)));
  if (ticket !== fieldTicket) return;
  const box = new THREE.Box3().setFromObject(figure);
  const size = box.getSize(new THREE.Vector3());
  figure.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  const holder = new THREE.Group();
  holder.add(figure);
  // As tall as the rest, unless that would spill out of the cell.
  holder.scale.setScalar(Math.min(figureHeight / size.y, (spacing * 0.92) / Math.max(size.x, size.z)));
  holder.position.copy(cells[i]);
  holder.userData = { index: i, colour: spec.colour };
  removeFigure(i);
  figures[i] = holder;
  field.add(holder);
}

function removeFigure(i) {
  const old = figures[i];
  if (!old) return;
  field.remove(old);
  old.traverse((child) => child.isMesh && child.geometry.dispose());
  figures[i] = null;
}

// Let the page draw before carrying on. A message rather than a timeout,
// which browsers slow to once a second in a background tab.
function nextTask() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = resolve;
    channel.port2.postMessage(null);
  });
}

// Rebuild everything, a pause after each figure so the page keeps drawing
// while the field fills up.
async function buildField() {
  const ticket = ++fieldTicket;
  history.replaceState(null, "", `#${fieldHash()}`);
  for (let i = 0; i < cells.length; i++) removeFigure(i);
  resolved.clear();
  select(null);
  // Start every robot loading at once; each figure waits for its own.
  for (const i of buildOrder) for (const slot of slots) preparedRobot(specFor(i)[slot]);
  // A few at a time, so the bake workers all have something to do.
  const queue = [...buildOrder];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length && ticket === fieldTicket) {
        await buildFigure(queue.shift(), ticket);
        await nextTask();
      }
    }),
  );
  if (ticket === fieldTicket) console.info(`Field built in ${Math.round(performance.now() - started)} ms`);
}

function newField() {
  seed = Math.floor(Math.random() * 1e9);
  overrides.clear();
  buildField();
}

// Clicking a figure (rather than dragging the view) selects it, ringed on the
// table; the panel's slots and swatches then edit just that one.
const selection = new THREE.Mesh(
  new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x2a2c30 }),
);
selection.scale.setScalar(spacing / 2);
selection.visible = false;
field.add(selection);

function select(i) {
  selected = i;
  selection.visible = i !== null;
  document.documentElement.classList.toggle("figure-selected", i !== null);
  if (i === null) return;
  selection.position.copy(cells[i]).setY(0.002);
  const spec = specFor(i);
  for (const slot of slots) slotPickers[slot].value = spec[slot];
  for (const swatch of swatches.children) swatch.setAttribute("aria-pressed", swatch.dataset.colour === spec.colour);
}

async function editSelected(change) {
  if (selected === null) return;
  const i = selected;
  const spec = { ...specFor(i), ...change };
  overrides.set(i, spec);
  history.replaceState(null, "", `#${fieldHash()}`);
  select(i);
  if (Object.keys(change).every((key) => key === "colour") && figures[i]) {
    // A new colour only needs a new material.
    figures[i].userData.colour = spec.colour;
    figures[i].traverse((child) => {
      if (child.isMesh) child.material = resin(spec.colour);
    });
    return;
  }
  await buildFigure(i, fieldTicket);
  if (selected === i) select(i);
}

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let pressedAt = null;
renderer.domElement.addEventListener("pointerdown", (event) => (pressedAt = [event.clientX, event.clientY]));
renderer.domElement.addEventListener("pointerup", (event) => {
  if (mode !== "kitbash" || !pressedAt) return;
  const moved = Math.hypot(event.clientX - pressedAt[0], event.clientY - pressedAt[1]);
  pressedAt = null;
  if (moved > 4) return;
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, isoCamera);
  let holder = raycaster.intersectObjects(figures.filter(Boolean), true)[0]?.object;
  while (holder && holder.userData.index === undefined) holder = holder.parent;
  select(holder ? holder.userData.index : null);
});

function openKitbash(hash = "") {
  setMode("kitbash");
  const [head, ...edits] = hash.replace(/^kitbash=/, "").split(";");
  const values = head.split(",");
  overrides.clear();
  if (/^\d+$/.test(values[0])) {
    // Older links may carry a finish after the seed; there's only one now.
    seed = Number(values[0]);
    for (const edit of edits) {
      const [index, spec] = edit.split(":");
      const parsed = parseSpec(spec);
      if (cells[index] && parsed) overrides.set(Number(index), parsed);
    }
  } else {
    // An older link to a single kitbash: grow a field around it.
    seed = Math.floor(Math.random() * 1e9);
    const parsed = parseSpec(head);
    if (parsed) overrides.set(buildOrder[0], parsed);
  }
  frameField();
  buildField();
}

const swatches = document.getElementById("swatches");

for (const [name, hex] of Object.entries(resinColours)) {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.dataset.colour = name;
  swatch.title = name;
  swatch.setAttribute("aria-label", `${name} resin`);
  swatch.style.background = `#${hex.toString(16).padStart(6, "0")}`;
  swatch.addEventListener("click", () => editSelected({ colour: name }));
  swatches.append(swatch);
}

for (const slot of slots) {
  const row = document.createElement("div");
  row.className = "slot";
  const label = document.createElement("label");
  label.textContent = slot;
  const picker = document.createElement("select");
  picker.setAttribute("aria-label", `${slot} from`);
  picker.append(...humanoids.map((robot) => new Option(robot.name, robot.id)));
  picker.addEventListener("change", () => editSelected({ [slot]: picker.value }));
  const dice = document.createElement("button");
  dice.type = "button";
  dice.textContent = "⚄";
  dice.title = `Random ${slot}`;
  dice.addEventListener("click", () => editSelected({ [slot]: pickFrom(humanoids, Math.random).id }));
  label.htmlFor = picker.id = `slot-${slot}`;
  row.append(label, picker, dice);
  slotPickers[slot] = picker;
  document.getElementById("slots").append(row);
}
document.getElementById("shuffle").addEventListener("click", () => newField());
document.getElementById("shuffle-figure").addEventListener("click", () => editSelected(randomSpec()));
document.querySelector('[data-mode-button="viewer"]').addEventListener("click", () => loadRobot(current ?? robots[0].id));
document.querySelector('[data-mode-button="kitbash"]').addEventListener("click", () => {
  // Back to the field already built, or a fresh one the first time.
  if (!fieldTicket) return openKitbash(`kitbash=${Math.floor(Math.random() * 1e9)}`);
  setMode("kitbash");
  history.replaceState(null, "", `#${fieldHash()}`);
});

const hash = location.hash.slice(1);
const start = robots.find((robot) => robot.id === hash) ?? robots[0];
if (start && !thumbnailMode) {
  if (hash.startsWith("kitbash=")) openKitbash(hash);
  else loadRobot(start.id);
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

renderer.setAnimationLoop(() => {
  const iso = mode === "kitbash";
  (iso ? isoControls : controls).update();
  placeRim();
  renderer.render(scene, iso ? isoCamera : camera);
});
