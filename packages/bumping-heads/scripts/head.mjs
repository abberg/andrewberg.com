// Takes the helmet off an ACE R unit: the triangles skinned wholly to its
// "head" bone, unskinned and centred on the skull, at the game's own scale,
// with each material's diffuse texture cropped to the area the head's
// UVs cover. Also works out the head's colliders and a coarse silhouette for
// picking a varied set (see survey-heads.mjs).
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { Euler, Matrix4, Vector3 } from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';

await MeshoptEncoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// Texel padding round each cropped area, so filtering doesn't bleed in the edge.
const pad = 4;
const maxTexture = 1024;

export async function extractHead(file) {
  const doc = await io.read(file);
  const info = doc.getRoot().getAsset().extras?.ace_r ?? {};
  const code = info.code ?? file.match(/([^/]+)\.glb$/)[1];

  const parts = [];
  // The whole unit's height, from its bind pose.
  let bottom = Infinity;
  let top = -Infinity;
  for (const node of doc.getRoot().listNodes()) {
    const skin = node.getSkin();
    if (!skin || !node.getMesh()) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      bottom = Math.min(bottom, position.getMin([])[1]);
      top = Math.max(top, position.getMax([])[1]);
    }
    const head = skin.listJoints().findIndex((joint) => /^head$/i.test(joint.getName()));
    if (head < 0) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      const part = headPart(primitive, head);
      if (part) parts.push(part);
    }
  }
  if (!parts.length) throw new Error(`${code} has nothing skinned to a head bone`);

  // Centre on the skull, ignoring spikes: the middle 94% of the vertices along each axis.
  const all = parts.flatMap((part) => part.position);
  const core = coreBox(all);
  const centre = core.min.map((x, k) => (x + core.max[k]) / 2);
  for (const part of parts) for (let i = 0; i < part.position.length; i++) part.position[i] -= centre[i % 3];
  const skull = { min: core.min.map((x, k) => x - centre[k]), max: core.max.map((x, k) => x - centre[k]) };

  return {
    code,
    info,
    parts,
    height: top - bottom,
    colliders: colliders(parts, skull),
    silhouette: silhouette(parts),
    write: (path) => writeHead(path, code, info, parts),
  };
}

// The primitive's triangles whose three vertices are all skinned to the head.
function headPart(primitive, head) {
  const joints = primitive.getAttribute('JOINTS_0');
  const weights = primitive.getAttribute('WEIGHTS_0');
  const indices = primitive.getIndices();
  if (!joints || !weights || !indices) return null;
  const j = [];
  const w = [];
  const isHead = (v) => {
    joints.getElement(v, j);
    weights.getElement(v, w);
    return j.reduce((sum, joint, k) => sum + (joint === head ? w[k] : 0), 0) > 0.99;
  };
  const keep = [];
  for (let i = 0; i < indices.getCount(); i += 3) {
    const tri = [indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)];
    if (tri.every(isHead)) keep.push(...tri);
  }
  if (!keep.length) return null;

  const remap = new Map();
  const position = [];
  const normal = [];
  const uv = [];
  const uvs = primitive.getAttribute('TEXCOORD_0');
  for (const v of keep) {
    if (remap.has(v)) continue;
    remap.set(v, remap.size);
    position.push(...primitive.getAttribute('POSITION').getElement(v, []));
    normal.push(...primitive.getAttribute('NORMAL').getElement(v, []));
    uv.push(...(uvs ? uvs.getElement(v, []) : [0, 0]));
  }
  return { material: primitive.getMaterial(), index: keep.map((v) => remap.get(v)), position, normal, uv };
}

function coreBox(position) {
  const min = [];
  const max = [];
  for (let k = 0; k < 3; k++) {
    const values = position.filter((_, i) => i % 3 === k).sort((a, b) => a - b);
    min[k] = values[Math.floor(values.length * 0.03)];
    max[k] = values[Math.ceil(values.length * 0.97) - 1];
  }
  return { min, max };
}

// A convex hull round the skull (the vertices in its box, a little enlarged),
// and an oriented box round each spike: each connected group of triangles that
// reaches out of that box far enough to matter, up to eight.
function colliders(parts, skull) {
  const grow = skull.min.map((x, k) => (skull.max[k] - x) * 0.08);
  const inside = (p) => p.every((x, k) => x >= skull.min[k] - grow[k] && x <= skull.max[k] + grow[k]);
  const points = [];
  const spikes = [];
  // Vertices joined by position across all the parts.
  const key = (p) => p.map((x) => x.toFixed(3)).join();
  const parent = new Map();
  const find = (k) => (parent.get(k) === k ? k : (parent.set(k, find(parent.get(k))), parent.get(k)));
  const union = (a, b) => parent.set(find(a), find(b));
  for (const { position, index } of parts) {
    const vertex = (v) => position.slice(v * 3, v * 3 + 3);
    for (let v = 0; v < position.length / 3; v++) {
      const p = vertex(v);
      if (inside(p)) points.push(new Vector3(...p));
    }
    for (let i = 0; i < index.length; i += 3) {
      const tri = [0, 1, 2].map((k) => vertex(index[i + k]));
      if (tri.every(inside)) continue;
      const keys = tri.map(key);
      for (const k of keys) if (!parent.has(k)) parent.set(k, k);
      union(keys[0], keys[1]);
      union(keys[0], keys[2]);
      spikes.push({ keys, tri });
    }
  }
  const groups = new Map();
  for (const { keys, tri } of spikes) {
    const group = groups.get(find(keys[0])) ?? new Map();
    keys.forEach((k, i) => group.set(k, tri[i]));
    groups.set(find(keys[0]), group);
  }

  // The hull's corners, at most 48 of them, spread out (each the farthest
  // from those already taken), which Rapier rebuilds the hull from.
  const corners = new Set();
  for (const face of new ConvexHull().setFromPoints(points).faces) {
    let edge = face.edge;
    do {
      corners.add(edge.head().point);
      edge = edge.next;
    } while (edge !== face.edge);
  }
  const skullHull = spread([...corners], 48).flatMap((point) => point.toArray().map(round));
  const boxes = [...groups.values()]
    .map((group) => orientedBox([...group.values()]))
    .filter((box) => box.args[1] > 0.25)
    .sort((a, b) => b.args[1] - a.args[1])
    .slice(0, 8);
  return { skull: skullHull, spikes: boxes };
}

function spread(points, count) {
  if (points.length <= count) return points;
  const taken = [points[0]];
  const nearest = points.map((point) => point.distanceTo(points[0]));
  while (taken.length < count) {
    const next = nearest.indexOf(Math.max(...nearest));
    taken.push(points[next]);
    points.forEach((point, i) => (nearest[i] = Math.min(nearest[i], point.distanceTo(points[next]))));
  }
  return taken;
}

const round = (x) => Math.round(x * 1000) / 1000;

// The box round some points along their principal axes, longest as y.
function orientedBox(points) {
  const mean = [0, 1, 2].map((k) => points.reduce((sum, p) => sum + p[k], 0) / points.length);
  const cov = [0, 1, 2].map((a) => [0, 1, 2].map((b) => points.reduce((sum, p) => sum + (p[a] - mean[a]) * (p[b] - mean[b]), 0) / points.length));
  const axes = eigenvectors(cov).map((v) => new Vector3(...v));
  const extents = axes.map((axis) => {
    const along = points.map((p) => axis.x * (p[0] - mean[0]) + axis.y * (p[1] - mean[1]) + axis.z * (p[2] - mean[2]));
    return [Math.min(...along), Math.max(...along)];
  });
  // Longest along y, then x, then z; keep the basis right-handed.
  const order = [0, 1, 2].sort((a, b) => extents[b][1] - extents[b][0] - (extents[a][1] - extents[a][0]));
  const [y, x, z] = order;
  const zAxis = axes[x].clone().cross(axes[y]);
  const centre = new Vector3(...mean);
  for (const k of [x, y]) centre.addScaledVector(axes[k], (extents[k][0] + extents[k][1]) / 2);
  const zAlong = points.map((p) => zAxis.x * (p[0] - mean[0]) + zAxis.y * (p[1] - mean[1]) + zAxis.z * (p[2] - mean[2]));
  const zExtent = [Math.min(...zAlong), Math.max(...zAlong)];
  centre.addScaledVector(zAxis, (zExtent[0] + zExtent[1]) / 2);
  const half = (e) => Math.max(0.04, (e[1] - e[0]) / 2);
  const rotation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(axes[x], axes[y], zAxis));
  return {
    args: [half(extents[x]), half(extents[y]), half(zExtent)].map(round),
    position: centre.toArray().map(round),
    rotation: [rotation.x, rotation.y, rotation.z].map(round),
  };
}

// Jacobi eigenvectors of a symmetric 3×3 matrix.
function eigenvectors(m) {
  const a = m.map((row) => row.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return [0, 1, 2].map((k) => [v[0][k], v[1][k], v[2][k]]);
}

// The head seen from the front, side and top, each as a 24 × 24 grid of
// covered cells over a fixed area, so spikes show as well as the skull.
const cells = 24;
const reach = 3.2;
function silhouette(parts) {
  const views = [
    [0, 1],
    [2, 1],
    [0, 2],
  ];
  const bits = new Uint8Array(cells * cells * views.length);
  const cell = (x) => ((x + reach) / (2 * reach)) * cells;
  views.forEach(([u, v], view) => {
    for (const { position, index } of parts) {
      for (let i = 0; i < index.length; i += 3) {
        const tri = [0, 1, 2].map((k) => [cell(position[index[i + k] * 3 + u]), cell(position[index[i + k] * 3 + v])]);
        const [x0, x1] = [Math.max(0, Math.floor(Math.min(...tri.map((p) => p[0])))), Math.min(cells - 1, Math.floor(Math.max(...tri.map((p) => p[0]))))];
        const [y0, y1] = [Math.max(0, Math.floor(Math.min(...tri.map((p) => p[1])))), Math.min(cells - 1, Math.floor(Math.max(...tri.map((p) => p[1]))))];
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (covers(tri, x + 0.5, y + 0.5)) bits[view * cells * cells + y * cells + x] = 1;
      }
    }
  });
  return bits;
}

function covers([a, b, c], x, y) {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s = [side(a, b), side(b, c), side(c, a)];
  return s.every((d) => d >= 0) || s.every((d) => d <= 0);
}

async function writeHead(path, code, info, parts) {
  const out = new Document();
  out.createBuffer();
  out.createExtension(EXTTextureWebP).setRequired(true);
  const mesh = out.createMesh(`${code} head`);
  out.createScene(code).addChild(out.createNode(`${code} head`).setMesh(mesh));
  const accessor = (type, array) => out.createAccessor().setType(type).setArray(array);

  // Crop each material's texture to its parts' UVs and refit the UVs to it.
  const byMaterial = Map.groupBy(parts, (part) => part.material);
  for (const [material, group] of byMaterial) {
    const created = out.createMaterial(material.getName()).setMetallicFactor(0).setRoughnessFactor(0.6).setBaseColorFactor(material.getBaseColorFactor());
    const texture = material.getBaseColorTexture();
    if (texture) {
      const uv = group.flatMap((part) => part.uv);
      const us = uv.filter((_, i) => i % 2 === 0);
      const vs = uv.filter((_, i) => i % 2 === 1);
      const [width, height] = texture.getSize();
      // UVs outside 0–1 (tiling) can't be cropped; keep the whole texture.
      const tiled = uv.some((x) => x < 0 || x > 1);
      const left = tiled ? 0 : Math.max(0, Math.floor(Math.min(...us) * width) - pad);
      const top = tiled ? 0 : Math.max(0, Math.floor(Math.min(...vs) * height) - pad);
      const right = tiled ? width : Math.min(width, Math.ceil(Math.max(...us) * width) + pad);
      const bottom = tiled ? height : Math.min(height, Math.ceil(Math.max(...vs) * height) + pad);
      const image = await sharp(texture.getImage())
        .extract({ left, top, width: right - left, height: bottom - top })
        .resize({ width: maxTexture, height: maxTexture, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      created.setBaseColorTexture(out.createTexture(material.getName()).setImage(new Uint8Array(image)).setMimeType('image/webp'));
      if (!tiled) {
        for (const part of group) {
          for (let i = 0; i < part.uv.length; i += 2) {
            part.uv[i] = (part.uv[i] * width - left) / (right - left);
            part.uv[i + 1] = (part.uv[i + 1] * height - top) / (bottom - top);
          }
        }
      }
    }
    for (const part of group) {
      mesh.addPrimitive(
        out
          .createPrimitive()
          .setMaterial(created)
          .setIndices(accessor('SCALAR', new Uint32Array(part.index)))
          .setAttribute('POSITION', accessor('VEC3', new Float32Array(part.position)))
          .setAttribute('NORMAL', accessor('VEC3', new Float32Array(part.normal)))
          .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(part.uv))),
      );
    }
  }

  out.getRoot().getAsset().extras = { ace_r: info };
  await out.transform(dedup(), weld(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(path, out);
}
