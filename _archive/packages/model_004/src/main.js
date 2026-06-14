import {
  ExtrudeGeometry,
  Mesh,
  Box3,
  Vector3,
  Object3D,
  MeshPhongMaterial,
  MeshBasicMaterial,
  BufferGeometryLoader,
  CameraHelper,
} from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MersenneTwister } from 'fast-mersenne-twister';
import { makeNoise2D } from 'open-simplex-noise';
import { makeRectangle } from 'fractal-noise';
const ImageTracer = require('imagetracerjs');
import { createModelBase } from 'model_base';
import JSCADModelling from '@jscad/modeling';
import JSCADIo from '@jscad/io';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import treeObject from './tree-geometry.json';

const { cube, cuboid } = JSCADModelling.primitives;
const { union, subtract } = JSCADModelling.booleans;
const { translate, rotate, scale } = JSCADModelling.transforms;
const outerHouse = scale(
  [2, 1, 1.25],
  union(
    cube({ size: 2 }),
    translate(
      [0, 1, 0],
      rotate([Math.PI / 4, 0, 0], scale([1.405, 1, 1], cube({ size: 1.425 })))
    )
  )
);
const innerHouse = scale([1.1, 0.8, 0.8], outerHouse);
const house = subtract(
  subtract(outerHouse, innerHouse),
  union(
    cuboid({ size: [0.7, 0.7, 3], center: [1, 1, 0] }),
    union(
      cuboid({ size: [0.5, 0.5, 3], center: [-1, 0.15, 0] }),
      cuboid({ size: [0.8, 0.8, 3], center: [-0.6, -0.2, 0] })
    )
  )
);
const { stlSerializer } = JSCADIo;
let rawData = stlSerializer.serialize({}, house);
let blob = new Blob(rawData);
let objectUrl = URL.createObjectURL(blob);
const stlLoader = new STLLoader();
stlLoader.load(objectUrl, (geometry) => {
  const houseMesh = new Mesh(geometry, new MeshPhongMaterial());
  houseMesh.castShadow = true;
  houseMesh.position.set(1.2, 1.8, -2.5);
  houseMesh.rotateY(Math.PI * 0.4);
  scene.add(houseMesh);
  const houseMeshShadow = houseMesh.clone();
  houseMeshShadow.material = shadowMaterial;
  scene.add(houseMeshShadow);
  rawData = stlSerializer.serialize({}, scale([0.7, 1, 1], innerHouse));
  blob = new Blob(rawData);
  objectUrl = URL.createObjectURL(blob);
  stlLoader.load(objectUrl, (geometry) => {
    const innerHouseMesh = new Mesh(
      geometry,
      new MeshBasicMaterial({ color: 0x111111 })
    );
    innerHouseMesh.applyMatrix4(houseMesh.matrix);
    scene.add(innerHouseMesh);
  });
});

const seed = 821; //Math.floor(Math.random() * 1000);
console.log('seed:', seed);
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
  frequency: 0.002,
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

const svgstr = ImageTracer.imagedataToSVG(imgdata, {
  numberofcolors: 4,
});
ImageTracer.appendSVGString(svgstr, 'svg-container');

const {
  keyLight,
  scene,
  start,
  baseMaterial,
  shadowMaterial,
} = createModelBase();

keyLight.position.set(-2, 7, -1);
const shadowFrustumSize = 7;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 10;
keyLight.shadow.camera.top = shadowFrustumSize;
keyLight.shadow.camera.bottom = -shadowFrustumSize;
keyLight.shadow.camera.left = -shadowFrustumSize;
keyLight.shadow.camera.right = shadowFrustumSize;

var helper = new CameraHelper(keyLight.shadow.camera);
//scene.add(helper);

const loader = new SVGLoader();
const svgData = loader.parse(svgstr);
const geometries = [];
svgData.paths.forEach((path) => {
  const shapes = path.toShapes(true);
  shapes.forEach((shape) => {
    const geometry = new ExtrudeGeometry(shape, {
      depth: 30 + 20 * path.color.r,
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
const terrainScale = 0.0394;
container.scale.set(terrainScale, terrainScale, terrainScale);
scene.add(container);

box.setFromObject(container);
box.getSize(terrainSize);
console.log(terrainSize.y);
let prevY = terrainSize.y / 2;

const treeLoader = new BufferGeometryLoader();
const treeGeometry = treeLoader.parse(treeObject);
const treeMesh = new Mesh(treeGeometry, new MeshPhongMaterial());
treeMesh.scale.set(1.75, 1.75, 1.75);
treeMesh.position.set(-3, 2.8, 1);
treeMesh.castShadow = true;
scene.add(treeMesh);

const treeShadow = treeMesh.clone();
treeShadow.material = shadowMaterial;
scene.add(treeShadow);

start();
