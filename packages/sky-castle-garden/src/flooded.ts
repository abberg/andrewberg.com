import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityFront } from './city';
import { buildFish } from './fish';
import { drowned, painted, palette } from './look';
import { textures, WINDOW, windowTexture } from './masonry';

// Step 9: the drowned city under the moats, as in the film's flooded
// streets: tall blocks of the city's pale stone standing in rows along the
// moats, streets between them, floors of small arched windows and here and
// there a balcony, their roofs at different depths, a few nearly breaking
// the surface. Everything sinks into the water's colour the deeper it is.

// The moats' middles, as [x, z, width] runs: down each side, then along the
// south one to the stair. FLOOD is the depth of the streets.
export function buildFlooded(scene: THREE.Scene, { west, westLawn, east, eastLawn, from, lawnSouth, flood }:
  { west: number, westLawn: number, east: number, eastLawn: number, from: number, lawnSouth: (x: number) => number, flood: number }) {
  let s = 907;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const blocks: THREE.BufferGeometry[] = [], windows: THREE.Matrix4[] = [];
  // Each block's footprint and roof, for the fish to swim over.
  const roofs: { x: number, z: number, heading: number, length: number, width: number, roof: number }[] = [];

  // A run of points down the middle of a moat, with its width at each.
  const runs: number[][][] = [];
  for (const side of [-1, 1]) {
    const [edge, lawn] = side > 0 ? [east, eastLawn] : [west, westLawn];
    const x = (edge + lawn) / 2, corner = (lawnSouth(x) + cityFront(x) + 2) / 2, run: number[][] = [];
    for (let z = from + 2; z < corner - 4; z += 0.5) run.push([x, z, Math.abs(edge - lawn)]);
    for (let u = 0; u <= 1; u += 0.05) {
      const a = u * Math.PI / 2;
      run.push([x - side * 4 * (1 - Math.cos(a)), corner - 4 + 4 * Math.sin(a), Math.abs(edge - lawn)]);
    }
    for (let along = Math.abs(x) - 4; along > 7; along -= 0.5) {
      const px = side * along;
      run.push([px, (lawnSouth(px) + cityFront(px) + 2) / 2, cityFront(px) + 2 - lawnSouth(px)]);
    }
    runs.push(run);
  }

  const UP = new THREE.Vector3(0, 1, 0);
  // A block standing on the street: its middle, which way it runs, length,
  // width, and how far up it comes (its roof, below the water).
  const block = (x: number, z: number, heading: number, length: number, width: number, roof: number) => {
    roofs.push({ x, z, heading, length, width, roof: roof + 0.8 });
    const height = roof + flood, place = new THREE.Matrix4().makeRotationY(-heading).setPosition(x, -flood + height / 2, z);
    blocks.push(new THREE.BoxGeometry(length, height, width).applyMatrix4(place));
    // A low parapet round the roof, broken here and there.
    for (const [dx, dz, w, d] of [[0, width / 2 - 0.2, length, 0.4], [0, -width / 2 + 0.2, length, 0.4], [length / 2 - 0.2, 0, 0.4, width], [-length / 2 + 0.2, 0, 0.4, width]]) {
      if (random() < 0.3) continue;
      blocks.push(new THREE.BoxGeometry(w, 0.8, d).translate(dx, height / 2 + 0.4, dz).applyMatrix4(place));
    }
    // Floors of windows on the long faces, 3.6 m apart, and a balcony now and
    // then under one.
    const along = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    for (const face of [-1, 1]) {
      const out = new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(face);
      const right = UP.clone().cross(out);
      for (let y = -flood + 2.5; y < roof - 1.5; y += 3.6) {
        for (let d = -length / 2 + 1.4; d < length / 2 - 1; d += 2.4) {
          if (random() < 0.25) continue;
          const at = new THREE.Vector3(x, y, z).addScaledVector(along, d).addScaledVector(out, width / 2 + 0.03);
          windows.push(new THREE.Matrix4().makeBasis(right, UP, out).setPosition(at));
          if (random() < 0.06) blocks.push(new THREE.BoxGeometry(2.2, 0.3, 0.9).applyMatrix4(new THREE.Matrix4().makeBasis(right, UP, out)
            .setPosition(at.clone().addScaledVector(UP, -1.05).addScaledVector(out, 0.42))));
        }
      }
    }
  };
  // Blocks along each run, streets between them.
  for (const run of runs) {
    const walked = [0];
    run.slice(1).forEach(([x, z], k) => walked.push(walked[k] + Math.hypot(x - run[k][0], z - run[k][1])));
    const at = (d: number) => run[Math.min(run.length - 1, walked.findIndex(w => w >= d))];
    for (let d = 1; ;) {
      const length = 5 + random() * 7;
      if (d + length > walked[walked.length - 1] - 1) break;
      const [ax, az, width] = at(d), [bx, bz] = at(d + length);
      // Mostly deep, now and then a roof just under the surface.
      const roof = random() < 0.2 ? -1 - random() * 0.6 : -2.5 - random() ** 0.7 * 5;
      // Narrower than the moat, set to one side of it, so a canal of a street
      // runs past its windows on the other.
      const heading = Math.atan2(bz - az, bx - ax), wide = width * (0.5 + random() * 0.2), off = (width - wide) / 2 * (random() < 0.5 ? -1 : 1) * 0.8;
      block((ax + bx) / 2 - Math.sin(heading) * off, (az + bz) / 2 + Math.cos(heading) * off, heading, Math.hypot(bx - ax, bz - az), wide, roof);
      d += length + 1.5 + random() * 2.5;
    }
  }
  const stone = drowned(painted(palette.stone, { map: textures.city.map() }, textures.city.metres));
  const mesh = new THREE.Mesh(mergeGeometries(blocks.map(g => g.index ? g.toNonIndexed() : g))!, stone);
  mesh.receiveShadow = true;
  scene.add(mesh);
  const glass = new THREE.InstancedMesh(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height),
    drowned(painted(palette.stone, { map: windowTexture(), alphaTest: 0.5 })), windows.length);
  windows.forEach((matrix, i) => glass.setMatrixAt(i, matrix));
  scene.add(glass);
  buildFish(scene, runs, (x, z) => Math.max(-Infinity, ...roofs.map(b => {
    const dx = x - b.x, dz = z - b.z, c = Math.cos(b.heading), s = Math.sin(b.heading);
    return Math.abs(dx * c + dz * s) < b.length / 2 + 1 && Math.abs(-dx * s + dz * c) < b.width / 2 + 1 ? b.roof : -Infinity;
  })));
}
