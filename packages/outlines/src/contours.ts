import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { noise3, type Sketch } from './sketch';

// Object-space contours: every frame the mesh's edges are sorted on the CPU
// (the Batara is small enough) into silhouettes, where a front face meets a
// back face, and creases, the hard folds and part borders found once at rest.
// Those edges are chained into curves and drawn as strokes: cut into pieces
// that run past their ends, and drawn several times, each wandering off the
// curve on screen in its own way.
//
// What's hidden is decided per edge, before any of that, against a depth
// buffer of the model read back from the GPU, so the strokes themselves can
// wander over the surface without being cut by it.
const CREASE = Math.cos(THREE.MathUtils.degToRad(35));
// Strokes are cut to about this many pixels long.
const STROKE = 90;

// The model's view depth, for the visibility test.
const depthMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    #include <common>
    #include <skinning_pars_vertex>
    varying float vDepth;
    void main() {
      #include <skinbase_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
      vDepth = -mvPosition.z;
    }`,
  fragmentShader: /* glsl */ `varying float vDepth; void main() { gl_FragColor = vec4(vDepth); }`,
});

export function contours(mesh: THREE.SkinnedMesh, renderer: THREE.WebGLRenderer) {
  const { position, skinIndex } = mesh.geometry.attributes;
  const index = mesh.geometry.index!;

  // Welds the copies of each vertex (one per face at a hard corner), but only
  // on the same bone, so separate parts keep their own borders.
  const welded = new Map<string, number>();
  const representative: number[] = [];
  const weld = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)].map(v => Math.round(v * 1e3)).join() + `/${skinIndex.getX(i)}`;
    if (!welded.has(key)) { welded.set(key, representative.length); representative.push(i); }
    weld[i] = welded.get(key)!;
  }
  const faces: [number, number, number][] = [];
  for (let i = 0; i < index.count; i += 3) {
    const face: [number, number, number] = [weld[index.getX(i)], weld[index.getX(i + 1)], weld[index.getX(i + 2)]];
    if (face[0] !== face[1] && face[1] !== face[2] && face[2] !== face[0]) faces.push(face);
  }
  const edgeMap = new Map<string, { a: number; b: number; faces: number[] }>();
  faces.forEach((face, f) => {
    for (let k = 0; k < 3; k++) {
      const a = Math.min(face[k], face[(k + 1) % 3]), b = Math.max(face[k], face[(k + 1) % 3]);
      const key = `${a},${b}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { a, b, faces: [] });
      edgeMap.get(key)!.faces.push(f);
    }
  });
  const edges = [...edgeMap.values()];

  const points = representative.map(() => new THREE.Vector3());
  const normals = faces.map(() => new THREE.Vector3());
  const front = new Uint8Array(faces.length);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const faceNormals = () => faces.forEach(([a, b, c], f) => {
    normals[f].crossVectors(ab.subVectors(points[b], points[a]), ac.subVectors(points[c], points[a])).normalize();
  });

  // Creases are found once, at rest.
  representative.forEach((vertex, i) => points[i].fromBufferAttribute(position, vertex));
  faceNormals();
  const crease = edges.map(edge => edge.faces.length !== 2 || normals[edge.faces[0]].dot(normals[edge.faces[1]]) < CREASE);

  // Half the screen's resolution is plenty to tell what's hidden.
  const depthTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  let depth = new Float32Array(4);
  const depthMesh = new THREE.SkinnedMesh(mesh.geometry, depthMaterial);
  depthMesh.bind(mesh.skeleton, mesh.bindMatrix);
  depthMesh.frustumCulled = false;
  const depthScene = new THREE.Scene().add(depthMesh);
  const clear = new THREE.Color();
  const view = new THREE.Vector3();
  // Seen if nothing within a pixel of it in the depth buffer is clearly nearer.
  const seen = (p: THREE.Vector3, camera: THREE.Camera) => {
    const { width, height } = depthTarget;
    const ndc = view.copy(p).project(camera);
    const x = Math.round((ndc.x + 1) / 2 * width), y = Math.round((ndc.y + 1) / 2 * height);
    const distance = -view.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
    let farthest = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = THREE.MathUtils.clamp(y + dy, 0, height - 1) * width + THREE.MathUtils.clamp(x + dx, 0, width - 1);
        const d = depth[i * 4];
        // Nothing drawn there: the edge is on the silhouette.
        if (d === 0) return true;
        farthest = Math.max(farthest, d);
      }
    }
    return distance <= farthest * 1.01 + 0.05;
  };

  const material = new LineMaterial({ color: 0x000000, linewidth: 1, worldUnits: false, depthTest: false, vertexColors: true, transparent: true });
  // Each stroke's ink varies between these along it and from one line to
  // the next, like pencil pressure. It rides in the vertex colours' red, as
  // the fat-line material has no per-vertex alpha of its own.
  const alpha = { min: 0.1, max: 0.6 };
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
      'gl_FragColor = vec4( diffuse, alpha * vColor.r );',
    );
  };
  const geometry = new LineSegmentsGeometry();
  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  mesh.parent!.add(lines);

  const eye = new THREE.Vector3(), toEye = new THREE.Vector3();
  const resolution = new THREE.Vector2();

  // Screen pixels to and from world space, keeping depth.
  const toScreen = (p: THREE.Vector3, camera: THREE.Camera) => {
    const ndc = p.clone().project(camera);
    return new THREE.Vector3((ndc.x + 1) / 2 * resolution.x, (ndc.y + 1) / 2 * resolution.y, ndc.z);
  };
  const toWorld = (s: THREE.Vector3, camera: THREE.Camera) =>
    new THREE.Vector3(s.x / resolution.x * 2 - 1, s.y / resolution.y * 2 - 1, s.z).unproject(camera);

  return {
    lines,
    material,
    alpha,
    update(camera: THREE.Camera, width: number, height: number, boil: number, sketch: Sketch) {
      resolution.set(width, height);
      material.resolution.set(width, height);
      // The pose for this frame: the scene hasn't been drawn yet.
      mesh.updateMatrixWorld();
      mesh.skeleton.bones[0].updateWorldMatrix(true, true);
      mesh.skeleton.update();
      const { width: w, height: h } = depthTarget;
      if (w !== Math.ceil(width / 2) || h !== Math.ceil(height / 2)) {
        depthTarget.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
        depth = new Float32Array(depthTarget.width * depthTarget.height * 4);
      }
      const clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(depthTarget);
      renderer.clear();
      renderer.render(depthScene, camera);
      renderer.readRenderTargetPixels(depthTarget, 0, 0, depthTarget.width, depthTarget.height, depth);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, clearAlpha);

      representative.forEach((vertex, i) => points[i].fromBufferAttribute(position, vertex));
      points.forEach((p, i) => mesh.applyBoneTransform(representative[i], p).applyMatrix4(mesh.matrixWorld));
      faceNormals();
      camera.getWorldPosition(eye);
      faces.forEach(([a], f) => { front[f] = normals[f].dot(toEye.subVectors(eye, points[a])) > 0 ? 1 : 0; });

      // The edges to draw, as a graph.
      const neighbours = new Map<number, number[]>();
      const link = (a: number, b: number) => {
        if (!neighbours.has(a)) neighbours.set(a, []);
        neighbours.get(a)!.push(b);
      };
      edges.forEach((edge, e) => {
        const [f, g] = edge.faces;
        const silhouette = edge.faces.length === 2 && front[f] !== front[g];
        const visibleCrease = crease[e] && edge.faces.some(face => front[face]);
        if (!silhouette && !visibleCrease) return;
        const a = points[edge.a], b = points[edge.b];
        if (![0.2, 0.5, 0.8].some(t => seen(toEye.lerpVectors(a, b, t), camera))) return;
        link(edge.a, edge.b);
        link(edge.b, edge.a);
      });

      // Chains, starting from ends and junctions, then the closed loops.
      const used = new Set<string>();
      const chains: number[][] = [];
      const walk = (start: number, next: number) => {
        const chain = [start];
        let previous = start, current = next;
        for (;;) {
          used.add(`${Math.min(previous, current)},${Math.max(previous, current)}`);
          chain.push(current);
          const onward = neighbours.get(current)!.filter(n => !used.has(`${Math.min(current, n)},${Math.max(current, n)}`));
          if (neighbours.get(current)!.length !== 2 || onward.length === 0) break;
          previous = current;
          current = onward[0];
        }
        chains.push(chain);
      };
      const starts = [...neighbours.keys()].sort((a, b) => Number(neighbours.get(a)!.length === 2) - Number(neighbours.get(b)!.length === 2));
      for (const start of starts) {
        for (const next of neighbours.get(start)!) {
          if (!used.has(`${Math.min(start, next)},${Math.max(start, next)}`)) walk(start, next);
        }
      }

      // Strokes on screen: chains cut into pieces, each run past both ends.
      const segments: number[] = [], inks: number[] = [];
      const along = new THREE.Vector3();
      for (const chain of chains) {
        const screen = chain.map(v => toScreen(points[v], camera));
        let length = 0;
        for (let i = 1; i < screen.length; i++) length += Math.hypot(screen[i].x - screen[i - 1].x, screen[i].y - screen[i - 1].y);
        if (length < 3) continue;
        const pieces = Math.max(1, Math.round(length / STROKE));
        // Cut by arc length, with a little overlap between neighbouring pieces.
        const cumulative = [0];
        for (let i = 1; i < screen.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(screen[i].x - screen[i - 1].x, screen[i].y - screen[i - 1].y));
        const at = (s: number) => {
          s = THREE.MathUtils.clamp(s, 0, length);
          let i = 1;
          while (i < cumulative.length - 1 && cumulative[i] < s) i++;
          const t = (s - cumulative[i - 1]) / Math.max(1e-6, cumulative[i] - cumulative[i - 1]);
          return screen[i - 1].clone().lerp(screen[i], t);
        };
        for (let piece = 0; piece < pieces; piece++) {
          const from = piece * length / pieces, to = (piece + 1) * length / pieces;
          const steps = Math.max(1, Math.ceil((to - from) / 8));
          const stroke = Array.from({ length: steps + 1 }, (_, i) => at(from + (to - from) * i / steps));
          const world = toWorld(stroke[0], camera);
          for (let line = 0; line < sketch.lines; line++) {
            const seed = boil + line * 13.1;
            // How far this stroke runs past each end, different for each line.
            // Short strokes (bits of a jagged silhouette) run over less, or they turn into crosses.
            const over = (end: number) => sketch.overshoot * Math.min(1, (to - from) / STROKE) * (0.5 + 0.5 * noise3(world.x * 0.7 + end, world.y * 0.7, world.z * 0.7 + seed));
            const head = along.subVectors(stroke[0], stroke[1]).setZ(0).normalize().multiplyScalar(over(0)).clone().add(stroke[0]);
            const tail = along.subVectors(stroke[steps], stroke[steps - 1]).setZ(0).normalize().multiplyScalar(over(5)).clone().add(stroke[steps]);
            const drawn = [head, ...stroke, tail].map(s => {
              const p = toWorld(s, camera).multiplyScalar(0.35);
              return new THREE.Vector3(
                s.x + noise3(p.x, p.y, p.z + seed) * sketch.jitter,
                s.y + noise3(p.x + 41, p.y, p.z + seed) * sketch.jitter,
                s.z,
              );
            });
            const placed = drawn.map(s => toWorld(s, camera));
            const ink = placed.map(p => {
              const t = 0.5 + 0.5 * noise3(p.x * 0.7 + 91, p.y * 0.7, p.z * 0.7 + seed);
              return THREE.MathUtils.lerp(alpha.min, alpha.max, t);
            });
            for (let i = 1; i < placed.length; i++) {
              segments.push(...placed[i - 1].toArray(), ...placed[i].toArray());
              inks.push(ink[i - 1], 0, 0, ink[i], 0, 0);
            }
          }
        }
      }
      if (segments.length) {
        geometry.setPositions(segments);
        geometry.setColors(inks);
      }
    },
  };
}
