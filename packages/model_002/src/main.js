import {
  BoxGeometry,
  Mesh,
  MeshPhongMaterial,
} from 'three/build/three.module.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createModelBase } from 'model_base';
import { MersenneTwister } from 'fast-mersenne-twister';

const seed = 1663;
const mersenne = MersenneTwister(seed);

const {
  scene,
  start,
  baseMaterial,
  shadowMaterial,
  cameraLookTarget,
  keyLight,
  setCameraRadius,
} = createModelBase();

keyLight.position.set(-3, 10, 2);

const shadowFrustumSize = 7;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 15;
keyLight.shadow.camera.top = shadowFrustumSize;
keyLight.shadow.camera.bottom = -shadowFrustumSize;
keyLight.shadow.camera.left = -shadowFrustumSize;
keyLight.shadow.camera.right = shadowFrustumSize;

let geometries = [new BoxGeometry(10, 1, 10)];
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
      const building = new BoxGeometry(1, height, 1);
      building.translate(i - 4.5, 0.5 + height * 0.5, j - 4.5);
      geometries.push(building);
    }
  }
}

let geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
const plane = new Mesh(geometry, baseMaterial);
plane.position.y = -1;
plane.castShadow = true;
scene.add(plane);

const shadowPlane = new Mesh(geometry, shadowMaterial);
shadowPlane.position.y = -1;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const height = 0.2;
geometry = new BoxGeometry(1.5, height, 1.5);
material = new MeshPhongMaterial({ color: 0xffffff });
let previousY = -0.38;
for (let i = 0; i < 57; i++) {
  const mesh = new Mesh(geometry, material);
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

cameraLookTarget.set(0, 2, 0);
setCameraRadius(10);

start();
