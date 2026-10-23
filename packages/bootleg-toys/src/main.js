import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import robots from "virtual:robots";

// A scene for looking at models: one model at a time, framed to fit, lit by a
// neutral studio environment, with orbit controls. The robots in
// public/models are listed on the left; pick one, or step through them with
// the arrow keys. Drop a .glb (or a self-contained .gltf) on the page to swap
// it in. ?thumbnail=1 holds the
// camera still and flags the page ready once the first frame is drawn.
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
// and pull the camera back to fit it.
function show(object) {
  if (model) scene.remove(model);
  model = object;
  const box = new THREE.Box3().setFromObject(model);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  model.position.sub(sphere.center);
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.setScalar(1 / sphere.radius);
  scene.add(holder);
  model = holder;

  const distance = 1 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, 0.35, 1).normalize().multiplyScalar(distance * 0.9);
  controls.target.set(0, 0, 0);
  controls.update();
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
  current = id;
  history.replaceState(null, "", `#${id}`);
  for (const item of list.children) item.classList.toggle("current", item.dataset.id === id);
  list.querySelector(".current")?.scrollIntoView({ block: "nearest" });
  // Ignore a load that finishes after a newer one has started.
  const ticket = ++loading;
  try {
    const object = await fbxLoader.loadAsync(`./models/${id}/${id}.fbx`);
    if (ticket === loading) show(object);
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
addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  step(event.key === "ArrowDown" ? 1 : -1);
});
renderList();

const start = robots.find((robot) => robot.id === location.hash.slice(1)) ?? robots[0];
if (start && !thumbnailMode) loadRobot(start.id);
else document.documentElement.classList.add("no-robots");

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
    show((await loader.parseAsync(await file.arrayBuffer(), "")).scene);
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
