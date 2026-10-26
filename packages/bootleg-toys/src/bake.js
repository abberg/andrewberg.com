import * as THREE from "three";

// Baking a resin figure's thickness and ambient occlusion takes thousands of
// rays per figure, so it runs in a pool of workers (bake.worker.js), one per
// spare core: the field's figures bake side by side, and the page keeps
// drawing meanwhile.
const size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
const workers = [];
const idle = [];
const queue = [];
const pending = new Map();
let nextId = 0;

function worker() {
  const created = new Worker(new URL("./bake.worker.js", import.meta.url), { type: "module" });
  created.onmessage = ({ data }) => {
    pending.get(data.id)(data);
    pending.delete(data.id);
    idle.push(created);
    pump();
  };
  workers.push(created);
  return created;
}

function pump() {
  while (queue.length && (idle.length || workers.length < size)) {
    const next = idle.pop() ?? worker();
    const { message, transfer } = queue.shift();
    next.postMessage(message, transfer);
  }
}

// Bake a figure built by kitbash() in place, setting each mesh's
// resinThickness (where it doesn't have one already, as the base does) and
// resinOcclusion attributes.
export function bake(figure) {
  figure.updateMatrixWorld(true);
  const meshes = figure.children.filter((child) => child.isMesh);
  const normalMatrix = new THREE.Matrix3();
  const message = {
    id: nextId++,
    meshes: meshes.map((mesh) => {
      // Flat, unindexed copies in the figure's space.
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const position = geometry.attributes.position.clone().applyMatrix4(mesh.matrixWorld).array;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      const normal = geometry.attributes.normal.clone().applyNormalMatrix(normalMatrix).array;
      return { position, normal, measure: !mesh.geometry.attributes.resinThickness, indexed: !!mesh.geometry.index };
    }),
  };
  const transfer = message.meshes.flatMap(({ position, normal }) => [position.buffer, normal.buffer]);
  return new Promise((resolve) => {
    pending.set(message.id, ({ thickness, occlusion }) => {
      meshes.forEach((mesh, n) => {
        // The base is indexed; its unindexed copy was baked, so take one
        // value per original vertex back.
        const perVertex = (values) => (message.meshes[n].indexed ? reindex(mesh.geometry, values) : values);
        if (thickness[n]) mesh.geometry.setAttribute("resinThickness", new THREE.BufferAttribute(perVertex(thickness[n]), 1));
        mesh.geometry.setAttribute("resinOcclusion", new THREE.BufferAttribute(perVertex(occlusion[n]), 1));
      });
      resolve(figure);
    });
    queue.push({ message, transfer });
    pump();
  });
}

function reindex(geometry, values) {
  const result = new Float32Array(geometry.attributes.position.count);
  const index = geometry.index;
  for (let i = 0; i < index.count; i++) result[index.getX(i)] = values[i];
  return result;
}
