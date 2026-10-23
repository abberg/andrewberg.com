import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// A starter scene for looking at models: one model at a time, framed to fit,
// lit by a neutral studio environment, with orbit controls. Drop a .glb (or a
// self-contained .gltf) on the page to swap it in. ?thumbnail=1 holds the
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

const loader = new GLTFLoader();
let model = null;

// Put the model at the origin, sized so its bounding sphere has radius 1,
// and pull the camera back to fit it.
function show(gltf) {
  if (model) scene.remove(model);
  model = gltf.scene;
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

loader.loadAsync("./models/DamagedHelmet.glb").then((gltf) => {
  show(gltf);
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
    show(await loader.parseAsync(await file.arrayBuffer(), ""));
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
