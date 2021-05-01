import {
  BoxGeometry,
  MeshLambertMaterial,
  Mesh,
  MeshPhongMaterial,
  ShadowMaterial,
  Object3D,
} from 'three/build/three.module.js';
import { MersenneTwister } from 'fast-mersenne-twister';
import { createModelBase } from 'model_base';

const {
  scene,
  keyLight,
  start,
  baseMaterial,
  shadowMaterial,
} = createModelBase();

const seed = 837;
const mersenne = MersenneTwister(seed);

keyLight.position.set(3, 10, 3);
//keyLight.shadow.bias = -0.0001;
const shadowFrustumSize = 5;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 15;
keyLight.shadow.camera.top = shadowFrustumSize;
keyLight.shadow.camera.bottom = -shadowFrustumSize;
keyLight.shadow.camera.left = -shadowFrustumSize;
keyLight.shadow.camera.right = shadowFrustumSize;

let geometry = new BoxGeometry(10, 2, 10);
const plane = new Mesh(geometry, baseMaterial);
plane.position.y = -1;
scene.add(plane);

const planeShadow = plane.clone();
planeShadow.material = shadowMaterial;
planeShadow.receiveShadow = true;
scene.add(planeShadow);

const container = new Object3D();
for (let i = 0; i < 90; i++) {
  geometry = new BoxGeometry(1, 0.5, 1);
  material = new MeshPhongMaterial({ color: 0xffffff });
  const cube = new Mesh(geometry, material);
  cube.position.set(
    mersenne.random() * 5 - 2.5,
    mersenne.random() * 3,
    mersenne.random() * 5 - 2.5
  );
  cube.castShadow = true;
  container.add(cube);

  const cubeShadow = cube.clone();
  cubeShadow.material = shadowMaterial;
  cubeShadow.receiveShadow = true;
  container.add(cubeShadow);
}

container.position.set(-0.5, 0, 0.5);
scene.add(container);

start();
