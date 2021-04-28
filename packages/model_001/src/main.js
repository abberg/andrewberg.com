import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { MersenneTwister } from 'fast-mersenne-twister';

const seed = 837;
const mersenne = MersenneTwister( seed );

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 1, 50 );
const renderer = new THREE.WebGLRenderer();
renderer.setClearColor(0xdddddd);
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

composer = new EffectComposer( renderer );

const ssaoPass = new SSAOPass( scene, camera, window.innerWidth, window.innerHeight );
ssaoPass.kernelRadius = 0.22;
ssaoPass.minDistance = 0.0007;
ssaoPass.maxDistance = 0.015;
composer.addPass( ssaoPass );

const fxaaPass = new ShaderPass( FXAAShader );
fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / window.innerWidth;
fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / window.innerHeight;
composer.addPass( fxaaPass );

const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
keyLight.castShadow = true; 
keyLight.position.set(3, 10, 3);
scene.add(keyLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

keyLight.shadow.bias = 0.0002;
keyLight.shadow.mapSize.width = 1024;
keyLight.shadow.mapSize.height = 1024;
const size = 5;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 15;
keyLight.shadow.camera.top = size;
keyLight.shadow.camera.bottom = -size;
keyLight.shadow.camera.left = -size;
keyLight.shadow.camera.right = size;

let geometry = new THREE.BoxGeometry(10, 2, 10);
let material = new THREE.MeshLambertMaterial( { color: 0xc19a6c } );
const plane = new THREE.Mesh( geometry, material );
plane.position.y = -1;

scene.add( plane );

const shadowMaterial = new THREE.ShadowMaterial();
shadowMaterial.transparent = true;
shadowMaterial.opacity = 0.5;
const planeShadow = plane.clone();
planeShadow.material = shadowMaterial;
planeShadow.receiveShadow = true;
scene.add(planeShadow);

const container = new THREE.Object3D();
for(let i = 0; i < 90; i++){
  geometry = new THREE.BoxGeometry(1, 0.5, 1);
  material = new THREE.MeshPhongMaterial({color: 0xffffff});
  const cube = new THREE.Mesh( geometry, material );
  cube.position.set(mersenne.random() * 5 - 2.5, mersenne.random() * 3, mersenne.random() * 5 - 2.5);
  cube.castShadow = true;
  container.add( cube );

  const cubeShadow = cube.clone();
  cubeShadow.material = shadowMaterial;
  cubeShadow.receiveShadow = true;
  container.add(cubeShadow);

}

const cubeBox = new THREE.Box3().setFromObject(container);
container.position.set(-0.5, 0, 0.5);
scene.add(container);

const clock = new THREE.Clock();
const radius = 9;
const yPos = 6;
const cameraLookTarget = new THREE.Vector3(0, 0, 0);

function update(){
  const t = clock.getElapsedTime() * 0.2;
  const xPos = Math.sin(t) * radius;
  const zPos = Math.cos(t) * radius;
  camera.position.set(xPos, yPos, zPos);
  camera.lookAt(cameraLookTarget);
}

function render(){
  //renderer.render(scene, camera);
  composer.render();
}

function handleAnimationFrame(){
  update();
  render();
  window.requestAnimationFrame(handleAnimationFrame);
}

function handleResize(){
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize( width, height );
  composer.setSize( width, height );
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
