import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { painted, palette } from './look';
import { stroke } from './masonry';

// Step 7: moss and ivy on the city, where the reference has them. Moss and
// grass settle on the surfaces that face up, the tops of the rust bands and
// ledges, in patches, and here and there blanket a band and spill over its
// lip. Ivy grows from those ledges and hangs down the wall below in curtains
// of different lengths, ragged at the foot, thickest where the moss is and
// all the way to the ground round the arch. The walls between stay clean.
//
// Both are laid down a path from the top of a band, over its lip and down
// the wall, along a row of columns, each column's growth starting and
// stopping where it likes: a dark sheet hugging the stone for the shadowed
// depths, and over it clumps of leaf cards. Each clump's normals point out
// from its middle, as if it were a ball, so the light shades it as one soft
// mass instead of picking out every card (the trick Breath of the Wild's
// foliage uses), and the masses read as brushwork.

// A smooth wandering value along a line, about -1 to 1, the same every time
// for a seed.
export function wander(seed: number, scale: number) {
  let s = seed * 7919 + 13;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const waves = Array.from({ length: 4 }, (_, k) => [(0.6 + random()) * 2 ** k / scale, random() * Math.PI * 2, 1 / 2 ** k]);
  return (x: number) => waves.reduce((sum, [f, p, a]) => sum + Math.sin(x * f + p) * a, 0) / 1.6;
}

// Paints a tileable sheet of growth the way the reference does: a flat mid
// green, built up into broad clumps, each with a few wide strokes of lighter
// green across its top where the sun catches it and a darker one under it.
// No small detail: from the garden it should read as soft masses.
function growthTexture(kind: 'moss' | 'ivy', seed: number) {
  const px = 512, metres = 6, m = px / metres;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const [base, light, lighter, dark] = kind === 'moss'
    ? ['#a6cc5c', '#bcdc72', '#d2e88e', '#86ac4a'] : ['#8cbc58', '#a6d06a', '#c2e08a', '#6a9a4a'];
  g.fillStyle = base;
  g.fillRect(0, 0, px, px);
  const rgba = (hex: string, a: number) => { const c = new THREE.Color(hex); return `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`; };
  const wrap = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const dx of [-px, 0, px]) for (const dy of [-px, 0, px]) {
      if (x + dx > -r && x + dx < px + r && y + dy > -r && y + dy < px + r) draw(x + dx, y + dy);
    }
  };
  const clumps = Math.round(metres * metres / 1.6);
  for (let k = 0; k < clumps; k++) {
    const x = random() * px, y = random() * px, r = (0.5 + random() * 0.6) * m;
    const lean = (random() - 0.5) * 0.3;
    const marks: [number, number, number, number, number, number, string][] = [];
    // A darker stroke under the clump.
    marks.push([Math.floor(random() * 10), x - r, y + r * 0.45, x + r, y + r * 0.45 + lean * r, r * 0.5, rgba(dark, 0.45 + random() * 0.2)]);
    // Two or three wide strokes of light across its top.
    for (let j = 2 + Math.floor(random() * 2); j > 0; j--) {
      const across = r * (0.6 + random() * 0.6), up = -r * (0.15 + random() * 0.35), shift = (random() - 0.5) * r * 0.6;
      marks.push([Math.floor(random() * 10), x - across + shift, y + up, x + across + shift, y + up + lean * across, r * (0.3 + random() * 0.2),
        rgba(random() < 0.5 ? light : lighter, 0.5 + random() * 0.3)]);
    }
    wrap(x, y, r * 1.6, (cx, cy) => {
      for (const [mask, ax, ay, bx, by, width, colour] of marks) stroke(g, mask, ax + cx - x, ay + cy - y, bx + cx - x, by + cy - y, width, colour);
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return { texture, metres };
}

export type Column = (out: number, y: number) => THREE.Vector3;

// A small spray of painted leaves on a clear ground, for the cards. Near
// white: the material gives the green.
function leafTexture(seed: number) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 46; k++) {
    // Leaves gathered towards the middle, fewer at the edge.
    const r = Math.sqrt(random()) * px * 0.4, a = random() * Math.PI * 2;
    // Round leaves hanging down, not blades.
    const x = px / 2 + Math.cos(a) * r, y = px / 2 + Math.sin(a) * r, turn = Math.PI / 2 + (random() - 0.5) * 1.2, long = px * (0.07 + random() * 0.05);
    const shade = 0.82 + random() * 0.18;
    stroke(g, Math.floor(random() * 10), x, y, x + Math.cos(turn) * long, y + Math.sin(turn) * long, long * 1.2,
      `rgba(${255 * shade | 0},${255 * shade | 0},${245 * shade | 0},1)`);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// One clump: cards laid like shingles, nearly flat to the wall (local z is
// out of the wall, local y up it), each tipped so its lower edge stands off
// and overlaps the card below, with their normals pointing out from a point
// behind the middle, so the clump shades like a ball.
function clumpGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cards: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const card = new THREE.PlaneGeometry(1, 1);
    card.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-(0.25 + random() * 0.4), (random() - 0.5) * 0.4, (random() - 0.5) * 0.6)));
    card.translate((random() - 0.5) * 0.7, (random() - 0.5) * 0.7, random() * 0.25);
    cards.push(card);
  }
  const geometry = mergeGeometries(cards)!;
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), v = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    v.set(p.getX(k), p.getY(k), p.getZ(k) + 0.35).normalize();
    n.setXYZ(k, v.x, v.y, v.z);
  }
  return geometry;
}

// Lit from the clump's normals on both faces of every card: the back of a
// card would otherwise turn its normal round and go dark.
function bothSidesAlike(material: THREE.MeshStandardMaterial) {
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    paint.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
  };
  return material;
}

export function createGrowth() {
  const moss = growthTexture('moss', 21), ivy = growthTexture('ivy', 23);
  // The dark sheets under the leaves.
  const materials = {
    moss: painted(palette.mossDepth, { map: moss.texture, side: THREE.DoubleSide }),
    ivy: painted(palette.ivyDepth, { map: ivy.texture, side: THREE.DoubleSide }),
  };
  const leaves = leafTexture(31);
  const clumps = {
    moss: { geometry: clumpGeometry(41), size: 0.9, material: bothSidesAlike(painted(palette.moss, { map: leaves, alphaTest: 0.5, side: THREE.DoubleSide })), placed: [] as THREE.Matrix4[] },
    ivy: { geometry: clumpGeometry(43), size: 1.9, material: bothSidesAlike(painted(palette.ivy, { map: leaves, alphaTest: 0.5, side: THREE.DoubleSide })), placed: [] as THREE.Matrix4[] },
  };
  let s = 977;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;

  // A sheet down the path (a cross-section as [out, y] points, top first),
  // at each column from its start to its start plus its length, along the
  // path, lifted off the stone by its lift. along is each column's distance
  // along the row, for the texture.
  const drape = (kind: 'moss' | 'ivy', columns: Column[], along: number[], path: number[][],
    start: number[], length: number[], lift: (i: number, d: number) => number, floor?: (i: number) => number) => {
    const { metres } = kind === 'moss' ? moss : ivy;
    const at = [0];
    path.slice(1).forEach(([o, y], k) => at.push(at[k] + Math.hypot(o - path[k][0], y - path[k][1])));
    const total = at[at.length - 1];
    // A point on the path, and which way is out of the stone there.
    const walk = (d: number) => {
      d = THREE.MathUtils.clamp(d, 0, total);
      let k = 0;
      while (k < path.length - 2 && at[k + 1] < d) k++;
      const [o0, y0] = path[k], [o1, y1] = path[k + 1], t = (d - at[k]) / (at[k + 1] - at[k] || 1), l = Math.hypot(o1 - o0, y1 - y0) || 1;
      return [o0 + (o1 - o0) * t, y0 + (y1 - y0) * t, (y1 - y0) / l, -(o1 - o0) / l];
    };
    // Stopped short of a floor, where there is one: over an opening.
    if (floor) length = length.map((l, i) => {
      while (l > 0 && walk(start[i] + l)[1] < floor(i)) l -= 0.1;
      return Math.max(0, l);
    });
    // The dark sheet stops short of the leaves' edge, so the edge is all
    // leaves.
    const leafLength = length;
    length = length.map(l => Math.max(0, l - 0.9));
    const rows = Math.max(2, Math.ceil(Math.max(...length, 0.5) / 0.5));
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    columns.forEach((place, i) => {
      for (let r = 0; r <= rows; r++) {
        const d = start[i] + length[i] * r / rows, [o, y, no, ny] = walk(d), lift0 = lift(i, d);
        positions.push(...place(o + no * lift0, y + ny * lift0).toArray());
        uvs.push(along[i] / metres, -d / metres);
      }
    });
    for (let i = 0; i < columns.length - 1; i++) {
      if (length[i] <= 0 && length[i + 1] <= 0) continue;
      for (let r = 0; r < rows; r++) {
        const a = i * (rows + 1) + r, b = a + rows + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Clumps over it, scattered evenly over the whole area rather than
    // stacked up chosen columns (which read as stripes): a jittered grid
    // across the row and down the path, each clump between two columns,
    // lifted off the sheet, turned at random about the wall's normal and
    // sized at random.
    const { size, placed } = clumps[kind];
    const step = 0.7 * size;
    for (let a = along[0] + random() * step; a < along[along.length - 1]; a += step) {
      let i = 0;
      while (i < columns.length - 2 && along[i + 1] < a) i++;
      const t0 = (a - along[i]) / (along[i + 1] - along[i] || 1);
      const begin = THREE.MathUtils.lerp(start[i], start[i + 1], t0), reach = THREE.MathUtils.lerp(leafLength[i], leafLength[i + 1], t0);
      if (leafLength[i] <= 0 && leafLength[i + 1] <= 0) continue;
      for (let d = begin + random() * step * 0.5; d < begin + reach; d += step * (0.8 + random() * 0.4)) {
        // Each clump shifted across the row by up to half a step.
        const t = THREE.MathUtils.clamp(t0 + (random() - 0.5) * step / (along[i + 1] - along[i] || 1), 0, 1);
        const place = (o: number, y: number) => columns[i](o, y).lerp(columns[i + 1](o, y), t);
        const [o, y, no, ny] = walk(d), lift0 = THREE.MathUtils.lerp(lift(i, d), lift(i + 1, d), t) + 0.15;
        const at = place(o + no * lift0, y + ny * lift0), out = place(o + no * (lift0 + 1), y + ny * (lift0 + 1)).sub(at).normalize();
        // Up the path, towards where it grows from, so the shingles hang down it.
        const [uo, uy] = walk(d - 0.3), up = place(uo + no * lift0, uy + ny * lift0).sub(at);
        up.addScaledVector(out, -up.dot(out)).normalize();
        const side = up.clone().cross(out);
        const turn = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, out))
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (random() - 0.5) * 0.7));
        const scale = size * (0.75 + random() * 0.5);
        placed.push(new THREE.Matrix4().compose(at, turn, new THREE.Vector3(scale, scale, scale)));
      }
    }
    const mesh = new THREE.Mesh(geometry, materials[kind]);
    mesh.receiveShadow = true;
    return mesh;
  };

  // All the clumps placed so far, as one instanced mesh for each kind.
  const finish = (scene: THREE.Scene) => {
    for (const { geometry, material, placed } of Object.values(clumps)) {
      const mesh = new THREE.InstancedMesh(geometry, material, placed.length);
      placed.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
  };

  return { drape, finish };
}
