import * as THREE from 'three';
import { SKY } from './look';

// Clouds, soft and puffy as the films paint them: heaped cumulus built up
// from many small billows, feathered at the edges, white where the sun
// catches their tops and blending softly into a cool grey-blue underneath.
// A ring of them in the sky round the level, and a lower layer drifting
// below the island, seen over the north edge and from the causeway. All one
// draw call: camera-facing cards cut from a sheet of four cloud shapes,
// turning slowly round the level.

const SHADE = [138, 158, 188], MID = [208, 218, 232], LIT = [252, 252, 248];
const rgba = ([r, g, b]: number[], a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;

// Four clouds on one sheet, 2 x 2.
function cloudSheet() {
  const cell = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * 2;
  const g = canvas.getContext('2d')!;
  let s = 2027;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // A soft round billow: solid in the middle, feathered to nothing.
  const billow = (x: number, y: number, r: number, colour: number[], alpha: number, solid = 0.45) => {
    const fill = g.createRadialGradient(x, y, 0, x, y, r);
    fill.addColorStop(0, rgba(colour, alpha));
    fill.addColorStop(solid, rgba(colour, alpha));
    fill.addColorStop(1, rgba(colour, 0));
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    // The mound's big lobes: biggest in the middle, a flat-ish base.
    const base = oy + cell * 0.72, lobes: [number, number, number][] = [];
    const count = 5 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count, x = ox + cell * (0.24 + 0.52 * u + (random() - 0.5) * 0.04);
      const r = cell * (0.07 + 0.12 * Math.sin(Math.PI * u) ** 1.2 * (0.7 + random() * 0.5));
      lobes.push([x, base - r * (0.6 + random() * 0.5), r]);
    }
    for (let i = 0; i < 2; i++) {
      const [x, y, r] = lobes[1 + Math.floor(random() * (count - 2))];
      lobes.push([x + (random() - 0.5) * r, y - r * (0.5 + random() * 0.3), r * (0.55 + random() * 0.3)]);
    }
    // Billows filling each lobe, and smaller ones round its upper edge so
    // the outline is lumpy, all of them kept inside the cell.
    const top = Math.min(...lobes.map(([, y, r]) => y - r));
    const billows: [number, number, number][] = [];
    for (const [x, y, r] of lobes) {
      for (let i = 0; i < 14; i++) {
        const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r * 0.7;
        billows.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.35 + random() * 0.25)]);
      }
      for (let i = 0; i < 12; i++) {
        const a = Math.PI * (1.05 + random() * 0.9);
        billows.push([x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * (0.18 + random() * 0.17)]);
      }
    }
    const inside = billows.map(([x, y, r]) => [
      THREE.MathUtils.clamp(x, ox + r + 2, ox + cell - r - 2), Math.max(oy + r + 2, y), r,
    ] as [number, number, number]);
    g.save();
    g.beginPath();
    g.rect(ox, oy, cell, base - oy + cell * 0.03);
    g.clip();
    // The body in the shade colour, which also sets its soft outline.
    for (const [x, y, r] of inside) billow(x, y, r, SHADE, 1);
    // Then the light on it, only where there's cloud: mid tone over the
    // upper two thirds, white on the tops, each nudged towards the sun.
    g.globalCompositeOperation = 'source-atop';
    for (const [x, y, r] of inside) {
      const up = 1 - THREE.MathUtils.clamp((y - top) / (base - top), 0, 1);
      billow(x - r * 0.18, y - r * 0.22, r * 0.85, MID, 0.2 + 0.7 * up, 0.3);
    }
    for (const [x, y, r] of inside) {
      const up = 1 - THREE.MathUtils.clamp((y - top) / (base - top), 0, 1);
      if (up > 0.3) billow(x - r * 0.28, y - r * 0.38, r * 0.68, LIT, Math.min(1, (up - 0.3) * 1.8), 0.3);
    }
    // The base fading out softly rather than cut.
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, base - cell * 0.15, 0, base + cell * 0.03);
    fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
    g.fillStyle = fade;
    g.fillRect(ox, base - cell * 0.15, cell, cell * 0.18);
    g.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Each cloud, and the attributes they're written into, furthest first each
// frame so the soft edges of nearer ones lie over those behind.
type Cloud = { centre: THREE.Vector3, size: [number, number], cell: number, haze: number };
const clouds: Cloud[] = [];
let attributes: Record<'centre' | 'size' | 'cell' | 'haze', THREE.InstancedBufferAttribute> | undefined;
// How fast they turn round the level (rad/s), and the point they turn about.
const TURN = 0.0015, ROUND = new THREE.Vector3(0, 0, 40);

export function createClouds(scene: THREE.Scene) {
  let s = 811;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cloud = (distance: number, y: number, width: number, a = random() * Math.PI * 2) => clouds.push({
    centre: new THREE.Vector3(Math.cos(a) * distance, y, Math.sin(a) * distance).add(ROUND),
    size: [width, width * 0.76],
    cell: Math.floor(random() * 4),
    // Further off, more of the sky's colour.
    haze: THREE.MathUtils.clamp((distance - 200) / 1200, 0.03, 0.35),
  });
  // In the sky all round, low over the horizon.
  for (let k = 0; k < 24; k++) cloud(380 + random() * 320, 15 + random() ** 1.5 * 130, 120 + random() * 160);
  // Below the island, most of them out to the north (-z) where the garden
  // drops away.
  for (let k = 0; k < 20; k++) {
    const a = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.6;
    // Their tops well under the garden's edge.
    const width = 90 + random() * 150;
    cloud(240 + random() * 320, -25 - width * 0.72 - random() * 50, width, a);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const n = clouds.length;
  attributes = {
    centre: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    size: new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2),
    cell: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
    haze: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
  };
  for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute.setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = n;
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: cloudSheet() }, horizon: { value: new THREE.Color(SKY) } },
    vertexShader: /* glsl */`
      attribute vec3 centre;
      attribute vec2 size;
      attribute float cell, haze;
      varying vec2 vUv;
      varying float vHaze;
      void main() {
        // Already turned round the level (updateClouds).
        vec4 view = viewMatrix * vec4(centre, 1.0);
        // The sheet's cells: the card's base is the cloud's base.
        view.xy += position.xy * size;
        gl_Position = projectionMatrix * view;
        // (row 0 is the sheet's top half; the base sits 0.72 down its cell,
        // and the card reaches a little under it, where it fades out).
        float row = floor(cell / 2.0);
        vUv = vec2((mod(cell, 2.0) + uv.x) * 0.5, 1.0 - (row + 0.76) * 0.5 + uv.y * 0.38);
        vHaze = haze;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform vec3 horizon;
      varying vec2 vUv;
      varying float vHaze;
      void main() {
        vec4 paint = texture2D(map, vUv);
        if (paint.a < 0.01) discard;
        gl_FragColor = vec4(mix(paint.rgb, horizon, vHaze), paint.a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.unmerged = true;
  scene.add(mesh);
}

const turned = new THREE.Vector3(), order: { cloud: Cloud, at: THREE.Vector3, distance: number }[] = [];
export function updateClouds(seconds: number, camera: THREE.Camera) {
  if (!attributes) return;
  // Turned slowly round the level, then sorted furthest first.
  order.length = 0;
  for (const cloud of clouds) {
    const at = turned.copy(cloud.centre).sub(ROUND).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -seconds * TURN).add(ROUND).clone();
    order.push({ cloud, at, distance: at.distanceToSquared(camera.position) });
  }
  order.sort((a, b) => b.distance - a.distance);
  order.forEach(({ cloud, at }, i) => {
    attributes!.centre.setXYZ(i, at.x, at.y, at.z);
    attributes!.size.setXY(i, ...cloud.size);
    attributes!.cell.setX(i, cloud.cell);
    attributes!.haze.setX(i, cloud.haze);
  });
  for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
}
