import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MersenneTwister } from 'fast-mersenne-twister';
import { makeNoise2D } from 'open-simplex-noise';
import { makeRectangle } from 'fractal-noise';
const ImageTracer = require('imagetracerjs');

const seed = 770; // Math.floor(Math.random() * 10000);
console.log('seed =', seed);
const mersenne = MersenneTwister(seed);
const noiseSeed = Math.floor(mersenne.random() * 10000);
const noise2D = makeNoise2D(noiseSeed);

const canvas = document.getElementById('canvas');
canvas.width = 256;
canvas.height = 256;

const ctx = canvas.getContext('2d');
const imgdata = ctx.getImageData(0, 0, canvas.width, canvas.height);
const data = imgdata.data;

const fractalNoise = makeRectangle(canvas.width, canvas.height, noise2D, {
  frequency: 0.001,
  octaves: 4,
});

for (let x = 0; x < 256; x++) {
  for (let y = 0; y < 256; y++) {
    let n = (fractalNoise[x][y] + 1) * 128;
    data[(x + y * 256) * 4 + 0] = n;
    data[(x + y * 256) * 4 + 1] = n;
    data[(x + y * 256) * 4 + 2] = n;
    data[(x + y * 256) * 4 + 3] = 255;
  }
}
ctx.putImageData(imgdata, 0, 0);

const svgstr = ImageTracer.imagedataToSVG(imgdata);
ImageTracer.appendSVGString(svgstr, 'svg-container');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  1,
  50
);
const renderer = new THREE.WebGLRenderer();
renderer.setClearColor(0xdddddd);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

composer = new EffectComposer(renderer);

const ssaoPass = new SSAOPass(
  scene,
  camera,
  window.innerWidth,
  window.innerHeight
);
ssaoPass.kernelRadius = 0.22;
ssaoPass.minDistance = 0.0007;
ssaoPass.maxDistance = 0.015;
composer.addPass(ssaoPass);

const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms['resolution'].value.x = 1 / window.innerWidth;
fxaaPass.material.uniforms['resolution'].value.y = 1 / window.innerHeight;
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

const loader = new SVGLoader();
const svgData = loader.parse(svgstr);
const geometries = [];
svgData.paths.forEach((path) => {
  const shapes = path.toShapes(true);
  shapes.forEach((shape) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 100 * path.color.r,
      bevelEnabled: true,
      bevelThickness: -0.25,
      bevelSize: 0.5,
      bevelOffset: 0,
      bevelSegments: 1,
    });
    geometries.push(geometry);
  });
});

geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
mesh = new THREE.Mesh(geometry, cardboardMaterial);
mesh.scale.set(1, -1, 1);
const box = new THREE.Box3().setFromObject(mesh);
const terrainSize = new THREE.Vector3();
box.getSize(terrainSize);
const xOffset = terrainSize.x / -2;
const yOffset = terrainSize.y / 2;
const zOffset = terrainSize.z / -2;
mesh.position.set(xOffset, yOffset, zOffset);

let shadowMesh = mesh.clone();
shadowMesh.material = shadowMaterial;
shadowMesh.receiveShadow = true;

const container = new THREE.Object3D();
container.add(mesh);
container.add(shadowMesh);
container.rotation.x = -Math.PI / 2;
const scale = 0.0394;
container.scale.set(scale, scale, scale);
scene.add(container);

box.setFromObject(container);
box.getSize(terrainSize);
let prevY = terrainSize.y / 2;
let height = 0.1;

geometry = new THREE.BoxGeometry(4, height, 4);
material = new THREE.MeshPhongMaterial();

for (let i = 0; i < 5; i++) {
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    mersenne.random() * 3 - 1.5,
    prevY,
    mersenne.random() * 3 - 1.5
  );
  mesh.castShadow = true;
  shadowMesh = mesh.clone();
  shadowMesh.material = shadowMaterial;
  shadowMesh.receiveShadow = true;
  scene.add(mesh);
  scene.add(shadowMesh);
  prevY += height * 2;
}

const clock = new THREE.Clock();
const radius = 10;
const yPos = 5;
const cameraLookTarget = new THREE.Vector3(0, 1, 0);

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
