import { Mesh, BoxGeometry, CameraHelper, MeshPhongMaterial } from 'three';
import Modeling from '@jscad/modeling';
import { createModelBase } from 'model_base';
import csgToBufferGeometry from './csg-to-buffer-geometry';

const {
  keyLight,
  scene,
  start,
  baseMaterial,
  shadowMaterial,
} = createModelBase();

keyLight.position.set(2, 7, 2);
const shadowFrustumSize = 7;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 14;
keyLight.shadow.camera.top = shadowFrustumSize;
keyLight.shadow.camera.bottom = -shadowFrustumSize;
keyLight.shadow.camera.left = -shadowFrustumSize;
keyLight.shadow.camera.right = shadowFrustumSize;

var helper = new CameraHelper(keyLight.shadow.camera);
//scene.add(helper);

const { cube, cuboid, rectangle } = Modeling.primitives;
const { translate, rotate, scale } = Modeling.transforms;
const { intersect, subtract, union } = Modeling.booleans;
const { expand, offset } = Modeling.expansions;
const {
  extrudeLinear,
  extrudeRectangular,
  extrudeRotate,
} = Modeling.extrusions;

const whiteMaterial = new MeshPhongMaterial();
const csgGeometry = csgToBufferGeometry(
  union(
    cuboid({ size: [2, 0.25, 3], center: [0, 0.75, 0.1] }),
    union(
      cuboid({ size: [2, 0.25, 3], center: [0, 0.5, -0.1] }),
      union(
        cuboid({ size: [1.5, 0.25, 2.5], center: [0, 0.25, 0] }),
        cuboid({ size: [2, 0.25, 3] })
      )
    )
  )
);
const csgMesh = new Mesh(csgGeometry, whiteMaterial);
csgMesh.castShadow = true;
scene.add(csgMesh);

const baseGeometry = new BoxGeometry(10, 2, 10);
const baseMesh = new Mesh(baseGeometry, baseMaterial);
baseMesh.position.y = -1;
scene.add(baseMesh);

const baseShadowMesh = baseMesh.clone();
baseShadowMesh.material = shadowMaterial;
baseShadowMesh.receiveShadow = true;
scene.add(baseShadowMesh);

start();
