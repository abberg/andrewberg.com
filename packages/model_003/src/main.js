import {
  ExtrudeGeometry,
  Mesh,
  Box3,
  Vector3,
  Object3D,
  BoxGeometry,
  MeshPhongMaterial,
  //CameraHelper,
} from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MersenneTwister } from 'fast-mersenne-twister';
import { makeNoise2D } from 'open-simplex-noise';
import { makeRectangle } from 'fractal-noise';
const ImageTracer = require('imagetracerjs');
import { createModelBase } from 'model_base';

const seed = 770;
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

const {
  keyLight,
  scene,
  start,
  baseMaterial,
  shadowMaterial,
} = createModelBase();

keyLight.position.set(-3, 10, 2);
const shadowFrustumSize = 7;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 15;
keyLight.shadow.camera.top = shadowFrustumSize;
keyLight.shadow.camera.bottom = -shadowFrustumSize;
keyLight.shadow.camera.left = -shadowFrustumSize;
keyLight.shadow.camera.right = shadowFrustumSize;

//var helper = new CameraHelper(keyLight.shadow.camera);
//scene.add(helper);

const loader = new SVGLoader();
const svgData = loader.parse(svgstr);
const geometries = [];
svgData.paths.forEach((path) => {
  const shapes = path.toShapes(true);
  shapes.forEach((shape) => {
    const geometry = new ExtrudeGeometry(shape, {
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
mesh = new Mesh(geometry, baseMaterial);
mesh.scale.set(1, -1, 1);
const box = new Box3().setFromObject(mesh);
const terrainSize = new Vector3();
box.getSize(terrainSize);
const xOffset = terrainSize.x / -2;
const yOffset = terrainSize.y / 2;
const zOffset = terrainSize.z / -2;
mesh.position.set(xOffset, yOffset, zOffset);

let shadowMesh = mesh.clone();
shadowMesh.material = shadowMaterial;
shadowMesh.receiveShadow = true;

const container = new Object3D();
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

geometry = new BoxGeometry(4, height, 4);
material = new MeshPhongMaterial();

for (let i = 0; i < 5; i++) {
  mesh = new Mesh(geometry, material);
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

start();
