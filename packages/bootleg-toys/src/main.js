import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import robots from "virtual:robots";
import { slots, prepare, kitbash, canLend, donor } from "./kitbash.js";
import { colours as resinColours, resin } from "./resin.js";
import { bake } from "./bake.js";
import { robotNames, robotSeries, seriesNames } from "./names.js";

// A scene for looking at models: one model at a time, framed to fit, lit by a
// neutral studio environment, with orbit controls. The robots in
// public/models (kept locally, not published) are listed on the left; pick one, or step through them with
// the arrow keys. Kitbash mode builds a robot from four others' parts. Drop a
// .glb (or a self-contained .gltf) on the page to swap it in. ?thumbnail=1
// holds the camera still and flags the page ready once the first frame is
// drawn.
const thumbnailMode = new URLSearchParams(location.search).has("thumbnail");
if (thumbnailMode) document.documentElement.classList.add("thumbnail");

// With alpha, so the canvas can be cleared to show the card under it, and a
// stencil buffer for the hover outline.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true });
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

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
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

// The robot list: those with their FBX here. Typing filters it; up and down
// step through what's shown.
const viewable = robots.filter((robot) => robot.fbx);
const list = document.getElementById("robots");
const filter = document.getElementById("filter");
let current = null;
let loading = 0;

function renderList() {
  const query = filter.value.trim().toLowerCase();
  list.replaceChildren(
    ...viewable
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
  } else if (hash === "viewer" && viewable.length) loadRobot(current ?? viewable[0].id);
  else if (hash !== current && viewable.some((robot) => robot.id === hash)) loadRobot(hash);
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

// Load a robot once and keep what the kitbash needs from it: its body and
// skeleton, converted from the FBX into public/kitbash.
function preparedRobot(id) {
  if (!prepared.has(id)) {
    prepared.set(id, loader.loadAsync(`./kitbash/${id}.glb`).then((gltf) => prepare(gltf.scene)));
  }
  return prepared.get(id);
}

const humanoids = robots.filter((robot) => robot.kitbash);
const colourNames = Object.keys(resinColours);
const pickFrom = (list, random) => list[Math.floor(random() * list.length)];
const isRobot = (id) => humanoids.some((robot) => robot.id === id);

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

// The robots that may lend each part, as listed (robots.js can limit a robot
// to some parts; whether its rig can lend a part is only known once loaded,
// see lenders).
const pools = Object.fromEntries(slots.map((part) => [part, humanoids.filter((robot) => !robot.lends || robot.lends.includes(part))]));

// Each part is dealt from its own deck: the pool, shuffled from the seed, so
// every robot lends a part once before any lends it again. A deck that runs
// out is shuffled again, from the seed and how many times round it is.
const decks = new Map();
function deck(part, round) {
  const key = `${seed}:${part}:${round}`;
  if (!decks.has(key)) {
    const random = seeded(mix(seed, slots.indexOf(part), round));
    const cards = pools[part].map((robot) => robot.id);
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    decks.set(key, cards);
  }
  return decks.get(key);
}
// The nth card dealt for a part. Each part's deck is cut a different way,
// a quarter apart, so a figure's four cards come from far-apart places in
// the decks' order.
function dealCard(part, n) {
  const size = pools[part].length;
  const cut = Math.floor((size * slots.indexOf(part)) / slots.length);
  return deck(part, Math.floor(n / size))[(n + cut) % size];
}

// Figures are dealt in the order they reach the belt: a lap of the whole
// tile at a time, slot by slot.
const dealt = (slot) => slot.lap * belt.length + slot.index;

// Figures are dealt in pairs, so where one would take two parts from the same
// robot, it can swap that card with its partner's and neither repeats a card.
const pairs = new Map();
function dealPair(first) {
  const key = `${seed}:${first}`;
  if (pairs.has(key)) return pairs.get(key);
  const specs = [{}, {}];
  const has = (spec, id) => Object.values(spec).includes(id);
  for (const part of slots) {
    let cards = [dealCard(part, first), dealCard(part, first + 1)];
    if ((has(specs[0], cards[0]) || has(specs[1], cards[1])) && !has(specs[0], cards[1]) && !has(specs[1], cards[0])) cards = [cards[1], cards[0]];
    specs.forEach((spec, i) => {
      // Still clashing, rarely: the card a lap on.
      let k = 0;
      while (has(spec, k ? dealCard(part, first + i + k * belt.length) : cards[i])) k++;
      spec[part] = k ? dealCard(part, first + i + k * belt.length) : cards[i];
    });
  }
  pairs.set(key, specs);
  return specs;
}

function specAt(slot) {
  const n = dealt(slot);
  const spec = { ...dealPair(n - (n % 2))[n % 2] };
  spec.colour = pickFrom(colourNames, seeded(mix(seed, slot.index, slot.lap)));
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
const specFor = (slot) => overrides.get(keyOf(slot)) ?? slot.spec ?? specAt(slot);

const fieldHash = () => `kitbash=${seed}`;

let fieldTicket = 0;
// Load the robots a figure borrows from. One that can't lend the part asked
// of it (no skinned body mesh, or that part kept outside it) is swapped for
// another, drawn from the same seed so the belt still comes back the same.
async function lenders(slot, spec) {
  const ready = {};
  await Promise.all(
    slots.map(async (part) => {
      for (let tries = 1; tries <= 12; tries++) {
        const robot = await preparedRobot(spec[part]);
        const lends = humanoids.find((each) => each.id === spec[part])?.lends;
        if (robot && canLend(robot, part) && (!lends || lends.includes(part))) return (ready[part] = robot);
        // The next card along that no other part of the figure has.
        let next = dealt(slot) + tries * 7;
        while (slots.some((other) => other !== part && spec[other] === dealCard(part, next))) next++;
        spec[part] = dealCard(part, next);
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
// the belt onto a sheet of card laid over it, like a page from a kit's
// manual, with the belt blurred behind. The four parts it was built from are
// called out round it, two a side, each drawn on its own with a leader line to
// where it went. Dragging turns the figure to look it over. Clicking it
// (without dragging), clicking off it or Esc sets it back down in its slot,
// and the belt rolls on.
const liftTime = 0.7;
let held = null;

const up = new THREE.Vector3(0, 1, 0);
// Along the line of sight, so things stay put on screen however near they come.
const sight = () => isoCamera.position.clone().sub(lookAt).normalize();

const heldLayer = 1;
const onLayer = (object, layer) => object.traverse((child) => child.layers.set(layer));

// The card is HTML, under the canvas: while a figure is held the canvas is
// cleared to transparent and only the figure and its parts are drawn on it.
// The belt behind is copied, blurred, into a canvas of its own under the card.
const card = document.getElementById("card");
const stage = document.getElementById("stage");
const blurred = document.getElementById("blurred");
const closeButton = document.getElementById("close");
const shadow = stage.querySelector(".shadow");
const blurredContext = blurred.getContext("2d");
let blurredAt = -1;

function blurBelt(t) {
  // Half the page's size is plenty for something this blurred.
  const width = Math.ceil(innerWidth / 2);
  const height = Math.ceil(innerHeight / 2);
  if (blurred.width !== width || blurred.height !== height) {
    blurred.width = width;
    blurred.height = height;
  }
  blurredContext.filter = `blur(${(t * 9).toFixed(2)}px)`;
  blurredContext.drawImage(renderer.domElement, 0, 0, width, height);
  blurredAt = t;
}

// The parts, in the order they're called out, and what the manual calls them.
const callouts = {
  head: { kanji: "頭部" },
  arms: { kanji: "腕部" },
  body: { kanji: "胴体" },
  legs: { kanji: "脚部" },
};
for (const part of slots) callouts[part].box = card.querySelector(`.callout[data-part="${part}"]`);
const colourCodes = { orange: "OR", red: "RD", green: "GR", teal: "TL" };
const robotName = (id) => robots.find((robot) => robot.id === id)?.name ?? id;
// Its tidied English name from names.js, or its folder's name as a fallback,
// and its series' Japanese title, if known.
const displayName = (id) => robotNames[robotName(id)] ?? robotName(id).replace(/_/g, " ");
const seriesName = (id) => robotSeries[robotName(id)] ?? seriesNames[id.slice(0, 4)] ?? "";

// A bootleg's name: the front of its head's name run into the back of its
// body's.
// Variants in brackets (pilots, modes) are left out of it.
function bootlegName(spec) {
  const plain = (id) => displayName(id).replace(/\s*\(.*?\)/g, "");
  const head = plain(spec.head);
  const body = plain(spec.body);
  return `${head.slice(0, Math.ceil(head.length / 2))}${body.slice(Math.floor(body.length / 2))}`.toUpperCase();
}

function fillCard(pick, spec) {
  const code = `BT-${String(pick.slot.index + 1).padStart(3, "0")}/${colourCodes[spec.colour] ?? "XX"}`;
  // On the page, not the card: the leader lines and close button use it too.
  document.documentElement.style.setProperty("--accent", `#${new THREE.Color(resinColours[spec.colour] ?? 0x1d1e21).multiplyScalar(0.8).getHexString()}`);
  card.querySelector(".code").textContent = code;
  card.querySelector("h1").textContent = bootlegName(spec);
  card.querySelector(".watermark").textContent = code;
  for (const part of slots) {
    const { box, kanji } = callouts[part];
    box.querySelector("h2").innerHTML = `<i></i>${kanji}`;
    box.querySelector("p").innerHTML = "";
    box.querySelector("p").append(displayName(spec[part]), Object.assign(document.createElement("small"), { textContent: seriesName(spec[part]) }));
  }
}

function beltPlace(pick) {
  const { slot, holder } = pick;
  // Still its slot's figure: back to the slot. Otherwise the slot came round
  // without it (a new belt), and it's simply put away.
  return slot.holder === holder ? slot.position.clone() : null;
}

// Put a figure straight back where it belongs, mid-flight or not.
function settle(pick) {
  const { holder } = pick;
  highlight(pick, null);
  pick.fade = 0;
  fadeRest(pick, 0);
  leaders.replaceChildren();
  onLayer(holder, 0);
  for (const source of pick.sources) {
    field.remove(source.view);
    dispose(source.view);
  }
  pick.sources = [];
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
  // Its middle and size, in its own units, to turn it about and fit it to the
  // card.
  const box = new THREE.Box3().setFromObject(holder);
  const extent = box.getSize(new THREE.Vector3()).divideScalar(size);
  const middle = new THREE.Vector3(0, extent.y / 2, 0);
  const figure = holder.children[0];
  held = { slot: holder.userData.slot, holder, figure, progress: 0, lifting: true, size, middle, extent, turn: 0, tilt: 0, sources: [], anchors: anchorsOf(figure), hovered: null };
  holder.visible = true;
  onLayer(holder, heldLayer);
  const spec = held.slot.spec ?? specFor(held.slot);
  fillCard(held, spec);
  showSources(held, spec);
  blurredAt = -1;
  document.documentElement.classList.add("holding");
  closeButton.focus({ preventScroll: true });
}

function putDown() {
  if (held) held.lifting = false;
}

// A point on the page, in pixels, as a point in the scene in the plane the
// held figure is flown to.
const screenAcross = new THREE.Vector3();
const screenUp = new THREE.Vector3();
const perPixel = () => (halfHeight * 2) / innerHeight;
function onPage(x, y) {
  screenAcross.setFromMatrixColumn(isoCamera.matrixWorld, 0);
  screenUp.setFromMatrixColumn(isoCamera.matrixWorld, 1);
  return lookAt
    .clone()
    .addScaledVector(sight(), 12)
    .addScaledVector(screenAcross, (x - innerWidth / 2) * perPixel())
    .addScaledVector(screenUp, (innerHeight / 2 - y) * perPixel());
}

const yaw = new THREE.Quaternion();
const pitch = new THREE.Quaternion();
// Faced square on to the camera: round by the camera's turn off the belt (the
// figures face +z) and tipped back by its height, then turned by `turn` and
// tipped by `tilt`, both about the screen's axes.
function faceCamera(quaternion, turn, tilt, t = 1) {
  const view = sight();
  const across = new THREE.Vector3().crossVectors(up, view).normalize();
  return quaternion
    .copy(pitch.setFromAxisAngle(across, tilt - elevation * t))
    .multiply(yaw.setFromAxisAngle(up, turn + azimuth * t));
}

function runPickUp(seconds) {
  document.documentElement.classList.toggle("holding", !!held);
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
  card.style.opacity = t;
  card.style.transform = `translateY(${((1 - t) * 24).toFixed(1)}px)`;
  closeButton.style.opacity = t;
  blurred.style.opacity = Math.min(1, t * 3);

  // Fly its middle from the belt to the middle of the card's stage, in an
  // arc, growing to fill it, and turn it about that middle.
  const area = stage.getBoundingClientRect();
  const fit = Math.min((area.height * perPixel() * 0.94) / held.extent.y, (area.width * perPixel() * 0.94) / Math.max(held.extent.x, held.extent.z));
  const scale = THREE.MathUtils.lerp(held.size, fit, t);
  const from = beltPlace(held) ?? holder.position.clone();
  const fromMiddle = from.addScaledVector(up, held.middle.y * held.size);
  const toMiddle = onPage(area.left + area.width / 2, area.top + area.height / 2);
  const middle = fromMiddle.lerp(toMiddle, t).addScaledVector(up, Math.sin(Math.PI * t) * 1.2);
  faceCamera(holder.quaternion, held.turn, held.tilt, t);
  holder.scale.setScalar(scale);
  holder.position.copy(middle).sub(held.middle.clone().multiplyScalar(scale).applyQuaternion(holder.quaternion));

  holder.updateMatrixWorld(true);
  // The shadow on the card goes under the figure's base, a little below it.
  anchorAt.copy(holder.position).project(isoCamera);
  shadow.style.left = `${((anchorAt.x + 1) / 2) * innerWidth - area.left}px`;
  shadow.style.top = `${((1 - anchorAt.y) / 2) * innerHeight - area.top + 6}px`;
  shadow.style.width = `${(Math.max(held.extent.x, held.extent.z) * scale * 0.8) / perPixel()}px`;
  placeSources(held, t);
  fadeRest(held, seconds);

  if (!held.lifting && held.progress === 0) {
    settle(held);
    held = null;
    document.documentElement.classList.remove("holding");
    if (card.contains(document.activeElement) || document.activeElement === closeButton) document.activeElement.blur();
  }
}

// The parts, each drawn on its own as line art: a light grey fill, its sharp
// creases drawn in, and a dark grey outline.

// The average of the normals of every face meeting at each point, kept as
// outlineNormal so the shading's own normals are untouched.
function smoothNormals(geometry) {
  const position = geometry.attributes.position;
  const sums = new Map();
  const key = (v) => `${Math.round(position.getX(v) * 1e4)},${Math.round(position.getY(v) * 1e4)},${Math.round(position.getZ(v) * 1e4)}`;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const vertexAt = (i) => (geometry.index ? geometry.index.getX(i) : i);
  const count = geometry.index ? geometry.index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const corners = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)];
    a.fromBufferAttribute(position, corners[0]);
    b.fromBufferAttribute(position, corners[1]);
    c.fromBufferAttribute(position, corners[2]);
    const face = c.sub(b).cross(a.sub(b));
    for (const v of corners) {
      const k = key(v);
      if (!sums.has(k)) sums.set(k, new THREE.Vector3());
      sums.get(k).add(face);
    }
  }
  const smooth = new Float32Array(position.count * 3);
  for (let v = 0; v < position.count; v++) {
    const n = sums.get(key(v));
    if (n) n.clone().normalize().toArray(smooth, v * 3);
  }
  geometry.setAttribute("outlineNormal", new THREE.BufferAttribute(smooth, 3));
}
// Pushed back a touch in depth, so the crease lines drawn on it don't flicker.
const paper = new THREE.MeshBasicMaterial({ color: 0xdedcd7, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const unlent = new THREE.MeshBasicMaterial({ visible: false });
const creases = new THREE.LineBasicMaterial({ color: 0x5a5c62, toneMapped: false });
// The outline: the back faces, pushed out by the same distance on screen
// everywhere (the camera's orthographic, so a distance in view space is a
// fixed number of pixels). They're pushed along normals smoothed across every
// face meeting at a point (outlineNormal, above): pushed along the faces' own,
// hard-edged normals, the outline splits into shards.
function outlineMaterial(width, color) {
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 outlineNormal;").replace(
      "#include <project_vertex>",
      `vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
mvPosition.xyz += normalize( normalMatrix * outlineNormal ) * ${width.toFixed(3)};
gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  // Each width compiles its own program: three would otherwise share one
  // between every outline, the hook's source being the same.
  material.customProgramCacheKey = () => `outline-${width}`;
  return material;
}
const outline = outlineMaterial(0.014, 0x4a4c52);

async function showSources(pick, spec) {
  await Promise.all(
    slots.map(async (part) => {
      const robot = await preparedRobot(spec[part]);
      if (!robot || held !== pick) return;
      // Just the part it lent; the rest of the robot is left out.
      const model = donor(robot, part, () => unlent);
      for (const piece of [...model.children]) {
        if (piece.material === unlent) {
          model.remove(piece);
          piece.geometry.dispose();
          continue;
        }
        piece.material = paper;
        smoothNormals(piece.geometry);
        piece.add(new THREE.Mesh(piece.geometry, outline));
        piece.add(new THREE.LineSegments(new THREE.EdgesGeometry(piece.geometry, 40), creases));
      }
      // Centred on its own middle, to turn about and frame.
      const box = new THREE.Box3().setFromObject(model);
      model.position.copy(box.getCenter(new THREE.Vector3())).negate();
      const view = new THREE.Group();
      view.add(model);
      view.userData = { part, extent: box.getSize(new THREE.Vector3()) };
      view.scale.setScalar(0);
      onLayer(view, heldLayer);
      field.add(view);
      pick.sources.push({ part, view, box: callouts[part].box });
    }),
  );
}

// Each part in its callout's window, turned three-quarters on like the
// drawings in a manual. The window is cut to the part's shape, within a
// square the card sets (--window): a tall part gets a tall, narrow box and a
// wide one a wide, short one.
function placeSources(pick, t) {
  const most = card.querySelector(".probe").offsetWidth || 120;
  for (const source of pick.sources) {
    const { view: model, box } = source;
    const frame = box.querySelector(".window");
    // Turned, its width on screen is somewhere between its width and depth.
    const { x, y, z } = model.userData.extent;
    const across = Math.abs(Math.cos(0.55)) * x + Math.abs(Math.sin(0.55)) * z;
    const width = `${Math.round(across > y ? most : Math.max(most * 0.55, (most * across) / y))}px`;
    const height = `${Math.round(y > across ? most : Math.max(most * 0.55, (most * y) / across))}px`;
    if (frame.style.width !== width) frame.style.width = width;
    if (frame.style.height !== height) frame.style.height = height;
    // Inside its padding.
    const window = frame.getBoundingClientRect();
    const inner = { width: parseFloat(width), height: parseFloat(height) };
    model.position.copy(onPage(window.left + window.width / 2, window.top + window.height / 2));
    faceCamera(model.quaternion, 0.55, 0);
    const fit = Math.min((inner.height * perPixel()) / y, (inner.width * perPixel()) / across);
    model.scale.setScalar(fit * t);
    model.updateMatrixWorld(true);
  }
  drawLeaders(pick.sources.map((source) => route(pick, source)).filter(Boolean), t);
}

// Leader lines, dotted, straight from the middle of the edge of each part's
// box facing the figure to a pin on the part. Each part is pinned at the
// middle of its box, worked out once in the figure's own space and projected
// every frame, so the pins follow the figure as it flies up and turns. Arms
// and legs come in pairs: each side gets its own point, and the line goes to
// whichever is nearer.
const leaders = document.getElementById("leaders");
const paired = new Set(["arms", "legs"]);

function anchorsOf(figure) {
  // In the figure's own space, where the pieces' vertices are.
  const middle = new THREE.Box3();
  for (const piece of figure.children) {
    if (piece.name !== "body") continue;
    piece.geometry.computeBoundingBox();
    middle.union(piece.geometry.boundingBox);
  }
  const centreX = middle.isEmpty() ? 0 : (middle.min.x + middle.max.x) / 2;
  const anchors = {};
  const p = new THREE.Vector3();
  for (const part of slots) {
    const sides = paired.has(part) ? [new THREE.Box3(), new THREE.Box3()] : [new THREE.Box3()];
    for (const piece of figure.children) {
      if (piece.name !== part) continue;
      const position = piece.geometry.attributes.position;
      for (let v = 0; v < position.count; v++) {
        p.fromBufferAttribute(position, v);
        sides[sides.length > 1 && p.x < centreX ? 1 : 0].expandByPoint(p);
      }
    }
    anchors[part] = sides.filter((box) => !box.isEmpty()).map((box) => box.getCenter(new THREE.Vector3()));
  }
  // Arms are pinned at the upper arm, between shoulder and elbow: their boxes
  // can reach well below, with a shield or a long claw.
  const joints = figure.userData.joints;
  const upperArm = (side) => joints?.get(`mot_arm_${side}`) && joints.get(`mot_arm_${side}`).clone().lerp(joints.get(`mot_forearm_${side}`) ?? joints.get(`mot_arm_${side}`), 0.5);
  const arms = ["l", "r"].map(upperArm).filter(Boolean);
  if (arms.length) anchors.arms = arms;
  return anchors;
}

const anchorAt = new THREE.Vector3();
function route(pick, source) {
  const points = pick.anchors[source.part];
  if (!points?.length) return null;
  const from = source.box.querySelector(".window").getBoundingClientRect();
  const left = source.box.dataset.side === "left";
  const start = { x: left ? from.right : from.left, y: from.top + from.height / 2 };
  let end = null;
  for (const point of points) {
    anchorAt.copy(point).applyMatrix4(pick.figure.matrixWorld).project(isoCamera);
    const x = ((anchorAt.x + 1) / 2) * innerWidth;
    const y = ((1 - anchorAt.y) / 2) * innerHeight;
    if (!end || Math.hypot(x - start.x, y - start.y) < Math.hypot(end.x - start.x, end.y - start.y)) end = { x, y };
  }
  return { source, start, end };
}

function drawLeaders(routes, t) {
  for (const { source, start, end } of routes) {
    if (!source.line) {
      source.line = document.createElementNS("http://www.w3.org/2000/svg", "g");
      source.line.innerHTML = "<line></line><rect width='8' height='8'></rect><circle r='5.5'></circle>";
      source.line.dataset.part = source.part;
      leaders.append(source.line);
    }
    const [line, square, pin] = source.line.children;
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
    square.setAttribute("x", start.x - 4);
    square.setAttribute("y", start.y - 4);
    pin.setAttribute("cx", end.x);
    pin.setAttribute("cy", end.y);
    source.line.style.opacity = t;
  }
}

// Hovering a callout outlines its part on the figure in white and darkens its
// line. The outline is drawn the same way as the parts' line art, but after
// the figure, in a pass of its own (see the render loop), and over everything,
// so it shows through any part in front. The part itself is first marked in
// the stencil buffer, and the outline only drawn outside it, each pixel once.
const outlineLayer = 2;
const partMask = new THREE.MeshBasicMaterial({
  colorWrite: false, depthTest: false, depthWrite: false,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
});
const partOutline = Object.assign(outlineMaterial(0.026, 0xffffff), {
  depthTest: false, depthWrite: false,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
});

function outlineOf(piece) {
  smoothNormals(piece.geometry);
  const mask = new THREE.Mesh(piece.geometry, partMask);
  const outline = new THREE.Mesh(piece.geometry, partOutline);
  outline.renderOrder = 1;
  return new THREE.Group().add(mask, outline);
}

function highlight(pick, part) {
  if (pick.hovered === part) return;
  pick.hovered = part;
  for (const piece of pick.figure.children) {
    if (piece.name === part && !piece.userData.outline) {
      piece.userData.outline = outlineOf(piece);
      onLayer(piece.userData.outline, outlineLayer);
      piece.add(piece.userData.outline);
    }
    if (piece.userData.outline) piece.userData.outline.visible = piece.name === part;
  }
  for (const { part: each, box, line } of pick.sources) {
    box.classList.toggle("active", each === part);
    line?.classList.toggle("active", each === part);
  }
  card.classList.toggle("hovering", !!part);
}

// While a callout's hovered, the rest of the figure washes out, easing in and
// out: its parts stay solid but lose their colour, towards the card's. The
// hovered part is drawn over them, on a layer of its own after the rest (see
// the render loop), rather than hidden where they're in front of it.
const fadeTime = 0.18;
const focusLayer = 4;
const cardColour = new THREE.Color(0xeeeeec);
const white = new THREE.Color(0xffffff);
const washed = new Map();

// The resin as the rest of the figure is drawn while washed out, one per
// resin, its settings eased by fadeRest.
function washedResin(resin) {
  if (!washed.has(resin)) {
    const copy = resin.clone();
    copy.onBeforeCompile = resin.onBeforeCompile;
    copy.userData.glowColour = { value: resin.userData.glowColour.value.clone() };
    washed.set(resin, copy);
  }
  return washed.get(resin);
}

function fadeRest(pick, seconds) {
  if (pick.hovered) pick.focus = pick.hovered;
  pick.fade = THREE.MathUtils.clamp((pick.fade ?? 0) + (pick.hovered ? 1 : -1) * (seconds / fadeTime), 0, 1);
  const f = THREE.MathUtils.smoothstep(pick.fade, 0, 1);
  for (const piece of pick.figure.children) {
    const resin = (piece.userData.resin ??= piece.material);
    const focused = piece.name === pick.focus;
    piece.material = f > 0 && !focused ? washedResin(resin) : resin;
    piece.layers.set(f > 0 && focused ? focusLayer : heldLayer);
  }
  for (const [resin, copy] of washed) {
    // Towards clear, colourless resin: tinted toward the card, and no longer
    // soaking up colour with depth.
    copy.color.copy(resin.color).lerp(cardColour, f);
    copy.attenuationColor.copy(resin.attenuationColor).lerp(white, f);
    copy.attenuationDistance = THREE.MathUtils.lerp(resin.attenuationDistance, 20, f);
    copy.userData.glowColour.value.copy(resin.userData.glowColour.value).multiplyScalar(1 - f);
  }
}

// The callout under the pointer, if any.
function calloutAt(event) {
  for (const part of slots) {
    const rect = callouts[part].box.getBoundingClientRect();
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return part;
  }
  return null;
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

// While a figure is held: whether it's under the pointer.
function heldAt(event) {
  pointer.set((event.clientX / innerWidth) * 2 - 1, -(event.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, isoCamera);
  return raycaster.intersectObject(held.holder, true).length > 0;
}

// Checked once a frame rather than on every pointer event.
function runHover() {
  if (!pointerMoved || !lastPointer) return;
  pointerMoved = false;
  if (mode !== "kitbash") return;
  if (held) {
    highlight(held, drag?.moved ? null : calloutAt(lastPointer));
    renderer.domElement.style.cursor = drag?.moved ? "grabbing" : heldAt(lastPointer) ? "grab" : "";
    return;
  }
  renderer.domElement.style.cursor = figureAt(lastPointer) ? "pointer" : "";
}

// The close button puts the figure down; tabbing to a part's box picks it out
// as hovering does.
closeButton.addEventListener("click", () => putDown());
for (const part of slots) {
  const frame = callouts[part].box.querySelector(".window");
  frame.addEventListener("focus", () => held && highlight(held, part));
  frame.addEventListener("blur", () => held && highlight(held, null));
}

renderer.domElement.addEventListener("click", (event) => {
  if (mode !== "kitbash") return;
  // The end of a drag isn't a click.
  if (drag?.dragged) return void (drag = null);
  drag = null;
  // A click on a callout leaves the figure up; anywhere else puts it down.
  if (held) return calloutAt(event) ? undefined : putDown();
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
const start = viewable.find((robot) => robot.id === hash) ?? viewable[0];
const robotsHere = !thumbnailMode && (humanoids.length || start);
if (start && !thumbnailMode && (hash === "viewer" || hash === start.id || !humanoids.length)) loadRobot(start.id);
else if (robotsHere) openKitbash(hash.startsWith("kitbash=") ? hash : `kitbash=${Math.floor(Math.random() * 1e9)}`);
if (!viewable.length) document.documentElement.classList.add("no-robots");

if (!robotsHere) loader.loadAsync("./models/DamagedHelmet.glb").then((gltf) => {
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
  blurredAt = -1;
});

// Lights shine on the held figure's layer too.
for (const light of [sky, sun, rim]) {
  light.layers.enable(heldLayer);
  light.layers.enable(focusLayer);
}

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
  // A figure is held: the belt, copied blurred under the card while it's
  // changing, then the canvas cleared and the figure and its parts drawn on
  // their own, over the card.
  if (blurredAt !== held.progress) {
    renderer.render(scene, isoCamera);
    blurBelt(held.progress);
  }
  const background = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  isoCamera.layers.set(heldLayer);
  renderer.render(scene, isoCamera);
  renderer.autoClear = false;
  // A hovered part brought to the front.
  if (held.fade > 0) {
    renderer.clearDepth();
    isoCamera.layers.set(focusLayer);
    renderer.render(scene, isoCamera);
  }
  if (held.hovered) {
    renderer.clearStencil();
    isoCamera.layers.set(outlineLayer);
    renderer.render(scene, isoCamera);
  }
  renderer.autoClear = true;
  isoCamera.layers.set(0);
  scene.background = background;
});
