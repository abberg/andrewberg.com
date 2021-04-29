import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MersenneTwister } from 'fast-mersenne-twister';

const seed = 1663;
const mersenne = MersenneTwister(seed);

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  windowWidth / windowHeight,
  1,
  50
);
const renderer = new THREE.WebGLRenderer();
renderer.setClearColor(0xdddddd);
renderer.setSize(windowWidth, windowHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

composer = new EffectComposer(renderer);

const ssaoPass = new SSAOPass(scene, camera, windowWidth, windowHeight);
ssaoPass.kernelRadius = 0.22;
ssaoPass.minDistance = 0.0007;
ssaoPass.maxDistance = 0.015;
composer.addPass(ssaoPass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms['resolution'].value.x = 1 / windowWidth;
fxaaPass.material.uniforms['resolution'].value.y = 1 / windowHeight;
composer.addPass(fxaaPass);

const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
keyLight.castShadow = true;
keyLight.position.set(-3, 10, 2);
scene.add(keyLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

keyLight.shadow.mapSize.width = 128;
keyLight.shadow.mapSize.height = 128;
const size = 7;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 15;
keyLight.shadow.camera.top = size;
keyLight.shadow.camera.bottom = -size;
keyLight.shadow.camera.left = -size;
keyLight.shadow.camera.right = size;

//var helper = new THREE.CameraHelper( keyLight.shadow.camera );
//scene.add( helper )

const cardboardMaterial = new THREE.MeshLambertMaterial({ color: 0xc19a6c });

const shadowMaterial = new THREE.ShadowMaterial();
shadowMaterial.transparent = true;
shadowMaterial.opacity = 0.3;

let geometries = [new THREE.BoxGeometry(10, 1, 10)];
for (let i = 0; i < 10; i++) {
  for (let j = 0; j < 10; j++) {
    if (
      (i === 1 && j === 3) ||
      (i === 5 && j === 3) ||
      (i === 6 && j === 3) ||
      (i === 7 && j === 3) ||
      (i === 8 && j === 3) ||
      (i === 6 && j === 4) ||
      (i === 7 && j === 4) ||
      (i === 1 && j === 8) ||
      (i === 5 && j === 8) ||
      (i === 6 && j === 8) ||
      (i === 7 && j === 8) ||
      (i === 8 && j === 8) ||
      j === 5 ||
      j === 6 ||
      j === 1 ||
      i === 3
    ) {
    } else {
      const height = 0.5 + mersenne.random();
      const building = new THREE.BoxGeometry(1, height, 1);
      building.translate(i - 4.5, 0.5 + height * 0.5, j - 4.5);
      geometries.push(building);
    }
  }
}

let geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
const plane = new THREE.Mesh(geometry, cardboardMaterial);
plane.position.y = -1;
plane.castShadow = true;
scene.add(plane);

const shadowPlane = new THREE.Mesh(geometry, shadowMaterial);
shadowPlane.position.y = -1;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const height = 0.2;
geometry = new THREE.BoxGeometry(1.5, height, 1.5);
material = new THREE.MeshPhongMaterial({ color: 0xffffff });
let previousY = -0.38;
for (let i = 0; i < 57; i++) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(2, previousY, -0.8);
  mesh.rotation.y = 0.02 * i;
  if (i % 2 !== 0) {
    mesh.scale.set(0.8, 1, 0.8);
    previousY += height * 0.5;
  } else {
    previousY += height;
  }
  mesh.castShadow = true;
  scene.add(mesh);

  const meshShadow = mesh.clone();
  meshShadow.material = shadowMaterial;
  meshShadow.receiveShadow = true;
  scene.add(meshShadow);
}

const clock = new THREE.Clock();
const radius = 10;
const yPos = 6;
const cameraLookTarget = new THREE.Vector3(0, 2, 0);

function update() {
  const t = clock.getElapsedTime() * 0.2;
  const xPos = Math.sin(t) * radius;
  const zPos = Math.cos(t) * radius;
  camera.position.set(xPos, yPos, zPos);
  camera.lookAt(cameraLookTarget);
}

function render() {
  //renderer.render(scene, camera);
  composer.render();
}

function handleAnimationFrame() {
  update();
  render();
  window.requestAnimationFrame(handleAnimationFrame);
}

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}

function debounce(callback, wait) {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback.apply(null, args);
    }, wait);
  };
}

window.addEventListener('resize', debounce(handleResize, 300), false);

// kick it!
handleAnimationFrame();
