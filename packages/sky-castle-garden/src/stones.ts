import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { blockStone, capitalGeometry, columnGeometry, columnStone, drumGeometry, plinthGeometry } from './columns';
import { stone } from './level';

// Step 4: every freestanding stone object is a dynamic body the robot can
// shove: the standing columns, the fallen column (in drums) and the loose
// drums, the statue and its plinth, the low arch ruin, the colonnade, the
// urns and the slabs. Each starts asleep, at rest, and multi-part pieces are
// separate bodies stacked up, so they come apart when knocked.

// Stone, in kg/m³.
const DENSITY = 2400;

type Offset = [number, number, number];

export function createStones(world: RAPIER.World, scene: THREE.Scene) {
  const pieces: { body: RAPIER.RigidBody; group: THREE.Group; position: THREE.Vector3; rotation: THREE.Quaternion }[] = [];

  // A body at a place and turn, built up from parts set relative to it.
  const piece = (x: number, y: number, z: number, rotation = new THREE.Quaternion()) => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z).setRotation(rotation)
      // Heavy angular damping, so toppled pieces settle rather than roll on.
      .setLinearDamping(0.1).setAngularDamping(0.8)
      .setSleeping(true));
    const group = new THREE.Group();
    scene.add(group);
    pieces.push({ body, group, position: new THREE.Vector3(x, y, z), rotation: rotation.clone() });
    // Once a finished shape is shown, the parts after it are colliders only.
    let shown = false;
    const show = (geometry: THREE.BufferGeometry, material: THREE.Material, offset: Offset, turn: THREE.Quaternion) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...offset);
      mesh.quaternion.copy(turn);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    };
    const part = (geometry: THREE.BufferGeometry, collider: RAPIER.ColliderDesc, offset: Offset, turn: THREE.Quaternion) => {
      if (!shown) show(geometry, stone, offset, turn);
      world.createCollider(collider.setTranslation(...offset).setRotation(turn).setDensity(DENSITY).setFriction(0.8), body);
    };
    const parts = {
      // A finished mesh drawn in place of the parts that follow.
      look(geometry: THREE.BufferGeometry, material: THREE.Material = columnStone, offset: Offset = [0, 0, 0]) {
        show(geometry, material, offset, new THREE.Quaternion());
        shown = true;
        return parts;
      },
      // Back to drawing each part.
      plain() {
        shown = false;
        return parts;
      },
      box(width: number, height: number, depth: number, offset: Offset = [0, 0, 0], turn = new THREE.Quaternion()) {
        part(new THREE.BoxGeometry(width, height, depth), RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2), offset, turn);
        return parts;
      },
      // Upright along the piece's y.
      cylinder(radius: number, height: number, offset: Offset = [0, 0, 0]) {
        part(new THREE.CylinderGeometry(radius, radius, height, 32), RAPIER.ColliderDesc.cylinder(height / 2, radius), offset, new THREE.Quaternion());
        return parts;
      },
          // Any convex shape, as the hull of its geometry's points.
      hull(geometry: THREE.BufferGeometry) {
        const points = new Float32Array(geometry.getAttribute('position').array);
        part(geometry, RAPIER.ColliderDesc.convexHull(points)!, [0, 0, 0], new THREE.Quaternion());
        return parts;
      },
    };
    return parts;
  };
  const turned = (yaw: number, roll = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, roll, 'YXZ'));

  // Three standing columns, 14 m tall, in a row beside the main path: a base,
  // the shaft and a capital (columns.ts), as one very heavy body.
  // Each on a square plinth with a sloped top.
  const standing = columnGeometry(0.7, 12.7, 'cup', true), plinth = plinthGeometry(2.3, 1.3, 0.35, 1.7).translate(0, -7, 0);
  for (const z of [14.6, 22.7, 31.2]) {
    piece(-4.1, 7, z).look(plinth, blockStone).look(standing, columnStone, [0, 0.65, 0])
      .hull(plinth).cylinder(0.7, 12.1, [0, 0.35, 0]).cylinder(1.15, 0.6, [0, 6.7, 0]);
  }

  // A fourth column in the row fell west, across the lowest west branch. Its
  // plinth is left where it stood, tipped and sunk into the earth, deeper on
  // one side (fixed: it has settled there). The column lies beside it in four
  // drums end to end, its foot by the plinth, and its capital broke off at the
  // far end. Three loose drums lie near it.
  {
    const plinth = new THREE.Vector3(-4.1, 0, 39.6);
    // East along the fallen column; the lying pieces' own up points west,
    // away from the foot.
    const along = new THREE.Vector3(16.2, 0, 5.8).normalize(), lying = turned(-Math.atan2(5.8, 16.2), Math.PI / 2);
    // Tipped over the way the column fell, a little turned.
    const tipped = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0).cross(along.clone().negate()).normalize(), 0.26)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1));
    const sunk = plinthGeometry(2.3, 1.3, 0.35, 1.7).applyQuaternion(tipped).translate(plinth.x, -0.6, plinth.z);
    const mesh = new THREE.Mesh(sunk, blockStone);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(sunk.getAttribute('position').array))!.setFriction(0.8),
      world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
    const middle = plinth.clone().setY(0.7).addScaledVector(along, -1.6 - 8.6);
    for (let i = 0; i < 4; i++) {
      const at = middle.clone().addScaledVector(along, (i - 1.5) * 4.3);
      piece(at.x, at.y, at.z, lying).look(drumGeometry(0.7, 4.28, (3 - i) * 3)).cylinder(0.7, 4.28);
    }
    const capital = middle.clone().addScaledVector(along, -8.7).setY(1.15);
    piece(capital.x, capital.y, capital.z, lying).look(capitalGeometry(0.7)).cylinder(1.15, 1.45, [0, 0.725, 0]);
  }
  for (const [x, z, yaw, from] of [[-25.5, 29.5, 0.4, 2], [-21.5, 40.5, 1.3, 5], [-7, 43, 2.2, 8]]) piece(x, 0.7, z, turned(yaw, Math.PI / 2)).look(drumGeometry(0.7, 1.2, from)).cylinder(0.7, 1.2);

  // The statue near the north end, east of the path: the plinth, and the
  // figure with its raised arm standing loose on top.
  piece(4.1, 1.5, 8.3).box(2.7, 3, 2.7);
  piece(4.1, 4.2, 8.3).cylinder(0.6, 2.4).cylinder(0.35, 0.6, [0, 1.5, 0])
    .box(0.3, 1.6, 0.3, [0.5, 1, 0], new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.4)));

  // The low arch ruin by the north edge: four piers, one surviving lintel and
  // a piece of another on the grass.
  for (const x of [9.1, 12, 14.8, 17.6]) piece(x, 1, 2.5).box(1, 2, 1.6);
  piece(10.55, 2.25, 2.5).box(4, 0.5, 1.6);
  piece(16.4, 0.25, 5.2, turned(0.5)).box(2.6, 0.5, 1.4);

  // The colonnade arcing round the north side of the east pool: five columns
  // 6 m tall with square capitals, and lintels resting from the middle of
  // one to the next.
  const tops: THREE.Vector3[] = [], colonnaded = columnGeometry(0.4, 5.7, 'flat');
  for (let i = -2; i <= 2; i++) {
    const a = -Math.PI / 2 + i * THREE.MathUtils.degToRad(32);
    const x = 15.3 + Math.cos(a) * 9.5, z = 34.1 + Math.sin(a) * 9.5;
    piece(x, 3, z, turned(-a)).look(colonnaded, columnStone, [0, -0.15, 0]).cylinder(0.4, 5.7, [0, -0.15, 0])
      .plain().look(new THREE.BoxGeometry(1, 0.3, 1), blockStone, [0, 2.85, 0]).box(1, 0.3, 1, [0, 2.85, 0]);
    tops.push(new THREE.Vector3(x, 6.25, z));
  }
  for (let i = 0; i < tops.length - 1; i++) {
    const [a, b] = [tops[i], tops[i + 1]];
    const middle = a.clone().add(b).multiplyScalar(0.5);
    const length = a.distanceTo(b) - 0.02;
    piece(middle.x, middle.y, middle.z, turned(-Math.atan2(b.z - a.z, b.x - a.x))).look(new THREE.BoxGeometry(length, 0.5, 0.9), blockStone).box(length, 0.5, 0.9);
  }

  // Urns beside the pools, narrower at the foot so they tip.
  for (const [x, z] of [[-24.5, 12], [-24, 21], [-7.8, 10], [24, 38], [22, 42.5]]) {
    piece(x, 0.65, z).hull(new THREE.CylinderGeometry(0.55, 0.35, 1.3, 16));
  }

  // Stone slabs and blocks along the path edges, placed at random but the
  // same every time.
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const [x, z] of [[-7, 3], [5.5, 18], [6, 24.5], [-11, 42.5], [5.8, 42.5], [-26.5, 9.8], [-36, 13], [-30, 30],
    [-36, 34], [22, 9], [33, 16], [40, 9], [-10, 22.5], [9, 40]]) {
    const width = 1 + random() * 2, depth = 1 + random() * 2, height = 0.3 + random() * 0.7;
    piece(x, height / 2, z, turned(random() * Math.PI)).box(width, height, depth);
  }

  // Asleep until touched: adding colliders woke them.
  for (const { body } of pieces) body.sleep();

  return {
    count: pieces.length,
    // Move the meshes to where the bodies are. Anything shoved off the edge
    // falls away and is taken out once it's well below the level.
    sync() {
      for (const { body, group } of pieces) {
        if (!body.isEnabled()) continue;
        const at = body.translation();
        if (at.y < -40) {
          body.setEnabled(false);
          group.visible = false;
          continue;
        }
        group.position.set(at.x, at.y, at.z);
        group.quaternion.copy(body.rotation());
      }
    },
    // Every stone back where it started, at rest.
    reset() {
      for (const { body, group, position, rotation } of pieces) {
        body.setEnabled(true);
        body.setTranslation(position, false);
        body.setRotation(rotation, false);
        body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        body.sleep();
        group.visible = true;
      }
      this.sync();
    },
  };
}
