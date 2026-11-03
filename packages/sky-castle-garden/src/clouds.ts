import * as THREE from 'three';
import { SKY } from './look';

// Clouds, painted flat like everything else: heaped cumulus with crisp,
// rounded lobes, white where the sun catches their tops and a cool lavender
// underneath, no soft gradients. A ring of them in the sky round the level,
// and a lower layer drifting below the island, seen over the north edge and
// from the causeway. All one draw call: camera-facing cards cut from a sheet
// of four cloud shapes, turning slowly round the level.

const LIT = '#fdfcf6', MID = '#e6e7f3', SHADE = '#a9b4dc';

// Four clouds on one sheet, 2 x 2.
function cloudSheet() {
  const cell = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * 2;
  const g = canvas.getContext('2d')!;
  let s = 2027;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    // Lobes heaped into a mound: biggest in the middle, a flat-ish base.
    const base = oy + cell * 0.72, lobes: [number, number, number][] = [];
    const count = 6 + Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count, x = ox + cell * (0.2 + 0.6 * u + (random() - 0.5) * 0.04);
      // Never past the cell's sides.
      const r = Math.min(cell * (0.07 + 0.13 * Math.sin(Math.PI * u) ** 1.2 * (0.7 + random() * 0.5)), x - ox - 4, ox + cell - x - 4);
      lobes.push([x, base - r * (0.55 + random() * 0.5), r]);
    }
    // A few on top of those.
    for (let i = 0; i < 3; i++) {
      const [x, y, r] = lobes[1 + Math.floor(random() * (count - 2))];
      const r2 = r * (0.55 + random() * 0.3);
      // Never past the cell's top or sides.
      const x2 = THREE.MathUtils.clamp(x + (random() - 0.5) * r, ox + r2 + 4, ox + cell - r2 - 4);
      lobes.push([x2, Math.max(oy + r2 + 4, y - r * (0.5 + random() * 0.3)), r2]);
    }
    g.save();
    g.beginPath();
    g.rect(ox, oy, cell, cell);
    g.clip();
    // The whole shape in the shade colour, cut flat along the bottom.
    const shape = new Path2D();
    for (const [x, y, r] of lobes) shape.moveTo(x + r, y), shape.arc(x, y, r, 0, Math.PI * 2);
    shape.rect(ox + cell * 0.2, base - cell * 0.06, cell * 0.6, cell * 0.06);
    g.fillStyle = SHADE;
    g.fill(shape);
    g.save();
    g.clip(shape);
    // Then the lit tops, each lobe again nudged up towards the sun, in two
    // steps.
    for (const [colour, lift, shrink] of [[MID, 0.3, 0.88], [LIT, 0.5, 0.72]] as const) {
      g.fillStyle = colour;
      for (const [x, y, r] of lobes) {
        g.beginPath();
        g.arc(x - r * lift * 0.4, y - r * lift, r * shrink, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    g.restore();
    // Clear a strip under the base so nothing bleeds from the next cell.
    g.clearRect(ox, base + 1, cell, oy + cell - base - 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const uniforms = { uTime: { value: 0 } };

export function createClouds(scene: THREE.Scene) {
  let s = 811;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const centres: number[] = [], sizes: number[] = [], cells: number[] = [], hazes: number[] = [];
  const cloud = (distance: number, y: number, width: number, a = random() * Math.PI * 2) => {
    centres.push(Math.cos(a) * distance, y, Math.sin(a) * distance + 40);
    sizes.push(width, width * 0.72);
    cells.push(Math.floor(random() * 4));
    // Further off, more of the sky's colour.
    hazes.push(THREE.MathUtils.clamp((distance - 200) / 1200, 0.03, 0.35));
  };
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
  geometry.setAttribute('centre', new THREE.InstancedBufferAttribute(new Float32Array(centres), 3));
  geometry.setAttribute('size', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 2));
  geometry.setAttribute('cell', new THREE.InstancedBufferAttribute(new Float32Array(cells), 1));
  geometry.setAttribute('haze', new THREE.InstancedBufferAttribute(new Float32Array(hazes), 1));
  geometry.instanceCount = cells.length;
  const material = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, map: { value: cloudSheet() }, horizon: { value: new THREE.Color(SKY) } },
    vertexShader: /* glsl */`
      attribute vec3 centre;
      attribute vec2 size;
      attribute float cell, haze;
      uniform float uTime;
      varying vec2 vUv;
      varying float vHaze;
      void main() {
        // Turning slowly round the level.
        float a = uTime * 0.0015;
        vec3 at = vec3(centre.x * cos(a) - (centre.z - 40.0) * sin(a), centre.y, centre.x * sin(a) + (centre.z - 40.0) * cos(a) + 40.0);
        vec4 view = viewMatrix * vec4(at, 1.0);
        // The sheet's cells: the card's base is the cloud's base.
        view.xy += position.xy * size;
        gl_Position = projectionMatrix * view;
        // (row 0 is the sheet's top half; the base sits 0.72 down its cell).
        float row = floor(cell / 2.0);
        vUv = vec2((mod(cell, 2.0) + uv.x) * 0.5, 1.0 - (row + 0.72) * 0.5 + uv.y * 0.36);
        vHaze = haze;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      uniform vec3 horizon;
      varying vec2 vUv;
      varying float vHaze;
      void main() {
        vec4 paint = texture2D(map, vUv);
        if (paint.a < 0.5) discard;
        gl_FragColor = vec4(mix(paint.rgb, horizon, vHaze), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.unmerged = true;
  scene.add(mesh);
}

export function updateClouds(seconds: number) {
  uniforms.uTime.value = seconds;
}
