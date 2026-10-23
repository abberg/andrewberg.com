import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import robots from "virtual:robots";
import { slots, prepare, kitbash } from "./kitbash.js";

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

// The robots' FBX materials are Phong, which ignores the environment map, so
// they need lights of their own.
scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(1, 2, 1.5);
scene.add(sun);

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
    if (mode !== "kitbash" || hash !== kitbashHash()) openKitbash(hash);
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
  if (mode === "kitbash" && event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey) shuffle();
});
renderList();

// Kitbash mode. Each slot names the robot it borrows from; the body robot's
// skeleton holds the rest together. The choice lives in the hash
// (#kitbash=head,body,arms,legs) so a good one can be kept.
let mode = "viewer";
const pick = {};
const prepared = new Map();
const slotPickers = {};

function setMode(next) {
  mode = next;
  document.documentElement.dataset.mode = next;
  // Clear resin needs something bright behind it to glow against.
  scene.background.set(next === "kitbash" ? 0xeceae6 : 0x16181c);
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
const randomRobot = () => humanoids[Math.floor(Math.random() * humanoids.length)].id;
const kitbashHash = () => `kitbash=${slots.map((slot) => pick[slot]).join(",")},${colour}`;

// The kitbash is cast in clear coloured resin, like the bootleg Masters of the
// Universe figures: one glossy candy colour that light passes through, paler
// in thin parts and deeper where it's thick. The palette is theirs.
const resinColours = { orange: 0xff8a1c, red: 0xff3a1a, green: 0x2fc23a, lime: 0x7ce05a, teal: 0x2a7fa8 };
const resin = new THREE.MeshPhysicalMaterial({
  roughness: 0.08,
  transmission: 1,
  thickness: 1,
  ior: 1.5,
  attenuationDistance: 0.28,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  specularIntensity: 1,
});
// Thickness comes from each vertex (measured when the kitbash is built)
// rather than one number for the whole figure.
resin.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float resinThickness;\nvarying float vResinThickness;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvResinThickness = resinThickness;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vResinThickness;")
    .replace("material.thickness = thickness;", "material.thickness = thickness * vResinThickness;");
};
let colour = null;
const white = new THREE.Color(0xffffff);
const swatches = document.getElementById("swatches");

function setColour(name) {
  colour = name;
  // The surface tint is pale; the colour builds up with depth, nearly full
  // strength through the thick parts.
  resin.color.setHex(resinColours[name]).lerp(white, 0.45);
  resin.attenuationColor.setHex(resinColours[name]).lerp(white, 0.1);
  for (const swatch of swatches.children) swatch.setAttribute("aria-pressed", swatch.dataset.colour === name);
}

for (const [name, hex] of Object.entries(resinColours)) {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.dataset.colour = name;
  swatch.title = name;
  swatch.setAttribute("aria-label", `${name} resin`);
  swatch.style.background = `#${hex.toString(16).padStart(6, "0")}`;
  swatch.addEventListener("click", () => {
    setColour(name);
    history.replaceState(null, "", `#${kitbashHash()}`);
  });
  swatches.append(swatch);
}
const randomColour = () => {
  const names = Object.keys(resinColours).filter((name) => name !== colour);
  return names[Math.floor(Math.random() * names.length)];
};

let building = 0;
async function buildKitbash({ keepCamera = true } = {}) {
  history.replaceState(null, "", `#${kitbashHash()}`);
  for (const slot of slots) slotPickers[slot].value = pick[slot];
  const ticket = ++building;
  const entries = await Promise.all(slots.map(async (slot) => [slot, await preparedRobot(pick[slot])]));
  if (ticket !== building) return;
  const ready = Object.fromEntries(entries);
  // A robot without a skinned body mesh can't lend parts; swap it out.
  const missing = slots.filter((slot) => !ready[slot]);
  if (missing.length) {
    for (const slot of missing) pick[slot] = randomRobot();
    return buildKitbash({ keepCamera });
  }
  parts.replaceChildren();
  show(kitbash(ready, resin), { keepCamera });
}

function shuffle(only) {
  for (const slot of only ? [only] : slots) pick[slot] = randomRobot();
  if (!only) setColour(randomColour());
  buildKitbash();
}

function openKitbash(hash = "") {
  setMode("kitbash");
  const ids = hash.replace(/^kitbash=/, "").split(",");
  setColour(ids[4] in resinColours ? ids[4] : (colour ?? randomColour()));
  slots.forEach((slot, i) => {
    const fallback = humanoids.some((robot) => robot.id === current) ? current : randomRobot();
    pick[slot] = robots.some((robot) => robot.id === ids[i]) ? ids[i] : (pick[slot] ?? fallback);
  });
  buildKitbash({ keepCamera: false });
}

for (const slot of slots) {
  const row = document.createElement("div");
  row.className = "slot";
  const label = document.createElement("label");
  label.textContent = slot;
  const select = document.createElement("select");
  select.setAttribute("aria-label", `${slot} from`);
  select.append(...humanoids.map((robot) => new Option(robot.name, robot.id)));
  select.addEventListener("change", () => {
    pick[slot] = select.value;
    buildKitbash();
  });
  const dice = document.createElement("button");
  dice.type = "button";
  dice.textContent = "⚄";
  dice.title = `Random ${slot}`;
  dice.addEventListener("click", () => shuffle(slot));
  label.htmlFor = select.id = `slot-${slot}`;
  row.append(label, select, dice);
  slotPickers[slot] = select;
  document.getElementById("slots").append(row);
}
document.getElementById("shuffle").addEventListener("click", () => shuffle());
document.querySelector('[data-mode-button="viewer"]').addEventListener("click", () => loadRobot(current ?? pick.body ?? robots[0].id));
document.querySelector('[data-mode-button="kitbash"]').addEventListener("click", () => openKitbash());

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
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
