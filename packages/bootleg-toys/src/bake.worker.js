import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

// The ray casting a resin figure needs, off the main thread (see bake.js).
// Given each mesh's positions and normals in the figure's space, it works out
//   thickness  how far it is from each vertex, straight in along the normal,
//              to the far side of its own mesh; the resin material reads it,
//              so fins and fingers glow pale while chests go deep
//   occlusion  ambient occlusion, from a fan of short rays out over each
//              vertex's hemisphere against the whole figure, so parts shade
//              each other (armpits, gaps between plates, the base under the
//              feet); 1 open, 0 buried

const rayCount = 12;
const fan = Array.from({ length: rayCount }, (_, i) => {
  // Cosine-weighted directions about +z, spread on a golden-angle spiral.
  const r = Math.sqrt((i + 0.5) / rayCount);
  const angle = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), Math.sqrt(1 - r * r));
});

// Smoothing leaves every triangle with its own corners, so most points appear
// several times over; work each one out once. Points closer than this share a
// key (positions are in the source robots' units, a few across).
const pointKey = (p, v) => `${Math.round(p[v * 3] * 1e4)},${Math.round(p[v * 3 + 1] * 1e4)},${Math.round(p[v * 3 + 2] * 1e4)}`;

function geometryOf(position) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  return geometry;
}

// Where a ray finds no far side (an open edge), use a thin default.
function thickness(position, normal) {
  const geometry = geometryOf(position);
  const bvh = new MeshBVH(geometry);
  geometry.computeBoundingSphere();
  const limit = geometry.boundingSphere.radius;
  const fallback = limit * 0.05;
  const result = new Float32Array(position.length / 3);
  const known = new Map();
  const ray = new THREE.Ray();
  for (let v = 0; v < result.length; v++) {
    const key = pointKey(position, v);
    if (known.has(key)) {
      result[v] = known.get(key);
      continue;
    }
    ray.direction.fromArray(normal, v * 3).negate();
    ray.origin.fromArray(position, v * 3).addScaledVector(ray.direction, limit * 1e-3);
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    result[v] = hit ? Math.min(hit.distance, limit) : fallback;
    known.set(key, result[v]);
  }
  return result;
}

function occlusion(meshes) {
  const all = new Float32Array(meshes.reduce((n, mesh) => n + mesh.position.length, 0));
  let offset = 0;
  for (const mesh of meshes) {
    all.set(mesh.position, offset);
    offset += mesh.position.length;
  }
  const whole = geometryOf(all);
  const bvh = new MeshBVH(whole);
  whole.computeBoundingBox();
  const size = whole.boundingBox.getSize(new THREE.Vector3());
  const reach = Math.max(size.x, size.y, size.z) * 0.16;

  const ray = new THREE.Ray();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  return meshes.map(({ position, normal: normals }) => {
    const result = new Float32Array(position.length / 3);
    const known = new Map();
    for (let v = 0; v < result.length; v++) {
      const key = pointKey(position, v);
      if (known.has(key)) {
        result[v] = known.get(key);
        continue;
      }
      point.fromArray(position, v * 3);
      normal.fromArray(normals, v * 3).normalize();
      tangent.set(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0).cross(normal).normalize();
      bitangent.crossVectors(normal, tangent);
      basis.makeBasis(tangent, bitangent, normal);
      let open = 0;
      for (const direction of fan) {
        ray.direction.copy(direction).transformDirection(basis);
        ray.origin.copy(point).addScaledVector(normal, reach * 0.01);
        if (!bvh.raycastFirst(ray, THREE.DoubleSide, 0, reach)) open++;
      }
      // Curved, so partly hidden spots darken a little more than their share.
      result[v] = (open / rayCount) ** 1.5;
      known.set(key, result[v]);
    }
    return result;
  });
}

// { id, meshes: [{ position, normal, measure }] } in; { id, thickness, occlusion }
// out, an array per mesh (thickness is null where measure is false).
self.onmessage = ({ data: { id, meshes } }) => {
  const thicknesses = meshes.map((mesh) => (mesh.measure ? thickness(mesh.position, mesh.normal) : null));
  const occlusions = occlusion(meshes);
  self.postMessage(
    { id, thickness: thicknesses, occlusion: occlusions },
    [...thicknesses.filter(Boolean), ...occlusions].map((array) => array.buffer),
  );
};
