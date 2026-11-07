import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityFront, CROWN as CITY_TOP } from './city';
import { DRIFTS, drifting } from './drift';
import { bothSidesAlike, wander } from './growth';
import { EAST, EAST_LAWN, lawnSouth, ledgeEdge, ledgeFront, MOATS_FROM, northEdge, onSunk, PATHS, PLATFORM, OUTER, PLATFORM_TOP, POOLS, WALL_GROUPS, WEST, WEST_LAWN } from './level';
import { painted, palette } from './look';
import { SWAY, type Sway, swaying } from './wind';
import { DRAWN, SHADOW_STENCIL } from './robot';

// Step 8: the garden's planting, built like the ivy (growth.ts): leaf cards
// whose normals point out from the middle of the plant, so the light shades
// each one as a soft round mass with a bright rim, the way the painting's
// shrubs read, and never picks out single leaves.

// Shrubs a little deeper and cooler than the lawn so they stand off it, with
// a dark core so you never see through them.
export const SHRUB = [0x78ad4a, 0x3a6650] as const, CORE = [0x4f8442, 0x2c5246] as const;
// The small trees' crowns a fresher green than the shrubs, their bark warm
// grey-brown.
const CROWN = [0x8cc25a, 0x467458] as const, CROWN_CORE = [0x5e9446, 0x2f5848] as const, BARK = [0x8f7a5e, 0x5a5058] as const;
// Cypresses dark and blue-green, the vertical accent.
const CYPRESS = [0x55905c, 0x264a4c] as const, CYPRESS_CORE = [0x3a6a4a, 0x1e3c40] as const;

// A cluster of broad leaves on a clear ground, for the trees and big
// shrubs: a dozen round-ended leaves radiating from the middle and
// overlapping, so a card's outline is a ring of lobes and never a fringe of
// strokes. Near white, each leaf its own shade: the material gives the green.
export function clusterTexture(seed: number) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Outer leaves first, the middle ones over them.
  const leaves = Array.from({ length: 22 }, (_, k) => {
    const r = k < 14 ? px * (0.17 + random() * 0.08) : px * (0.04 + random() * 0.1), a = k * 2.4 + random() * 0.6;
    return { x: px / 2 + Math.cos(a) * r, y: px / 2 + Math.sin(a) * r, a: a + (random() - 0.5) * 0.7, long: px * (0.13 + random() * 0.06) };
  });
  for (const { x, y, a, long } of leaves) {
    const wide = long * (0.5 + random() * 0.15), shade = 0.8 + random() * 0.2;
    const [ux, uy, vx, vy] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    const tx = x + ux * long, ty = y + uy * long;
    g.fillStyle = `rgb(${255 * shade | 0},${255 * shade | 0},${242 * shade | 0})`;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + vx * wide * 0.7, y + vy * wide * 0.7, tx + vx * wide * 0.55 - ux * wide * 0.2, ty + vy * wide * 0.55 - uy * wide * 0.2, tx, ty);
    g.bezierCurveTo(tx - vx * wide * 0.55 - ux * wide * 0.2, ty - vy * wide * 0.55 - uy * wide * 0.2, x - vx * wide * 0.7, y - vy * wide * 0.7, x, y);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A cypress's foliage on a clear ground: an upright spray, tiny scale
// leaves packed into a narrow flame that points up, its edge broken into
// little upward tufts. Near white, each scale its own shade and the lower
// ones a little darker, so a card has some depth of its own: the material
// gives the green.
function sprayTexture(seed: number) {
  const W = 192, H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Half its width at a height, 0 at the foot to 1 at the tip.
  const half = (v: number) => 0.46 * Math.min(1, v * 5) * (1 - v) ** 0.55;
  // Scales: the lower ones first, the upper ones laid over them.
  const scales = Array.from({ length: 260 }, () => {
    const v = random() * 0.97, u = (random() * 2 - 1) * half(v);
    return { v, u };
  }).sort((a, b) => a.v - b.v);
  for (const { v, u } of scales) {
    const x = W * (0.5 + u), y = H * (1 - v), long = H * (0.035 + random() * 0.025), wide = long * (0.55 + random() * 0.15);
    // Leaning out from the middle as they go up, like a spray's sprigs.
    const a = -Math.PI / 2 + u * 1.6 + (random() - 0.5) * 0.4;
    const shade = (0.72 + random() * 0.2) * (0.86 + 0.14 * v);
    g.fillStyle = `rgb(${255 * shade | 0},${255 * shade | 0},${242 * shade | 0})`;
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    // A pointed scale, its tip up.
    g.moveTo(0, -long);
    g.quadraticCurveTo(wide, -long * 0.2, 0, long * 0.5);
    g.quadraticCurveTo(-wide, -long * 0.2, 0, -long);
    g.fill();
    g.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Leaf cards that always turn to face the eye: each card is one point, its
// centre, and its corners are pushed out across the view in the vertex
// shader, so a crown's edge is always the cards' lobed outlines and never
// cards seen edge on, which read as hair. Normals still point out from the
// middle of the plant, so it shades as one soft mass.
export type Card = { at: THREE.Vector3, w: number, h: number, normal: THREE.Vector3, spin: number };
export function cardGeometry(cards: Card[]) {
  const positions: number[] = [], normals: number[] = [], corners: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const { at, w, h, normal, spin } of cards) {
    const base = positions.length / 3, [c, s] = [Math.cos(spin), Math.sin(spin)];
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = (u - 0.5) * w, y = (v - 0.5) * h;
      positions.push(...at.toArray());
      normals.push(...normal.toArray());
      corners.push(x * c - y * s, x * s + y * c);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // The corners reach past the centres the bounds are made from.
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += Math.max(...cards.map(({ w, h }) => Math.hypot(w, h) / 2));
  return geometry;
}

// Spreads a card's corners across the view, at the instance's scale.
const facing = (shader: { vertexShader: string }) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 corner;')
    .replace('#include <project_vertex>', /* glsl */`vec4 mvPosition = vec4(transformed, 1.0);
      float grow = length(modelMatrix[0].xyz);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        grow *= length(instanceMatrix[0].xyz);
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      mvPosition.xy += corner * grow;
      gl_Position = projectionMatrix * mvPosition;`)
    // Every card takes its shadow at its centre, which the sun's view of the
    // cards also passes through: looked up from a little nearer the sun, a
    // plant isn't speckled by its own cards.
    .replace('#include <shadowmap_vertex>', /* glsl */`#include <shadowmap_vertex>
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        vDirectionalShadowCoord[0].z -= 0.003;
      #endif`);
};
// How much of the round leaves' own leaf-to-leaf shading shows, 0 (one flat
// tone, so a crown reads only by its light: lit, mid and shade in broad
// bands) to 1 (every leaf its own shade, as painted on the card), and how
// far off (m) it has faded to flat, from half that distance.
export const leafLook = { variation: 0.2, flatBy: 40 };
const leafUniforms = { uLeafVariation: { value: leafLook.variation }, uLeafFlatBy: { value: leafLook.flatBy } };
export const updateLeaves = () => {
  leafUniforms.uLeafVariation.value = leafLook.variation;
  leafUniforms.uLeafFlatBy.value = leafLook.flatBy;
};
// Evens out the leaves on a card towards one tone, keeping their outlines.
const flattening = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  Object.assign(shader.uniforms, leafUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uLeafVariation, uLeafFlatBy;')
    .replace('#include <color_fragment>', /* glsl */`
      // The leaf's shade on the card, from what the map made of the colour.
      const vec3 leafLuma = vec3(0.2126, 0.7152, 0.0722);
      float leafShade = dot(diffuseColor.rgb, leafLuma) / max(dot(diffuse, leafLuma), 1e-4);
      float leafKeep = uLeafVariation * (1.0 - smoothstep(uLeafFlatBy * 0.5, uLeafFlatBy, length(vViewPosition)));
      diffuseColor.rgb = diffuse * mix(0.92, leafShade, leafKeep);
      #include <color_fragment>`);
};
// A painted leaf material for camera-facing cards, with a shadow pass that
// turns the cards to the sun the same way. Flat, its leaves are evened out
// to one tone (leafLook).
export function leafCards(colours: readonly [number, number], map: THREE.Texture, sway: Sway, flat = true) {
  const material = bothSidesAlike(painted(colours, { map, alphaTest: 0.5, side: THREE.DoubleSide }));
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    paint.call(material, shader, renderer);
    facing(shader);
    if (flat) flattening(shader);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => key() + (flat ? 'flat' : '');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide });
  depth.onBeforeCompile = facing;
  return { material: swaying(material, sway), depth: swaying(depth, sway) };
}
// Plants between the camera and the robot dissolve away, in a fine dither
// so there's nothing to sort, and come back as the view clears: anything
// near the line from the eye to the robot's middle, short of the robot.
// The robot's middle is set each frame (fadeAround).
const fadeUniforms = { uFocus: { value: new THREE.Vector3() }, uFadeRadius: { value: 2.4 } };
export const fadeAround = (feet: THREE.Vector3) => fadeUniforms.uFocus.value.copy(feet).setY(feet.y + 2.4);
function fading(material: THREE.Material) {
  if (material.userData.fading) return material;
  material.userData.fading = true;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, fadeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeAt;')
      .replace('#include <clipping_planes_vertex>', '#include <clipping_planes_vertex>\nvFadeAt = (inverse(viewMatrix) * mvPosition).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeAt;\nuniform vec3 uFocus;\nuniform float uFadeRadius;')
      .replace('#include <clipping_planes_fragment>', /* glsl */`#include <clipping_planes_fragment>
        {
          vec3 line = uFocus - cameraPosition;
          float along = dot(vFadeAt - cameraPosition, line) / dot(line, line);
          float off = distance(vFadeAt, cameraPosition + line * clamp(along, 0.0, 1.0));
          float fade = (1.0 - smoothstep(uFadeRadius * 0.45, uFadeRadius, off)) * smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.82, 0.96, along));
          // A 4 x 4 ordered dither.
          ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
          int k = p.x + p.y * 4;
          float bayer[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          if (fade > (bayer[k] + 0.5) / 16.0) discard;
        }`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => key() + 'fading';
  return material;
}
export function instanced(geometry: THREE.BufferGeometry, leaves: ReturnType<typeof leafCards> | THREE.Material, placed: THREE.Matrix4[], scene: THREE.Scene) {
  const mesh = new THREE.InstancedMesh(geometry, fading('depth' in leaves ? leaves.material : leaves), placed.length);
  if ('depth' in leaves) mesh.customDepthMaterial = leaves.depth;
  placed.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// One shrub: a dome of leaf cards sitting on the ground, a metre across at
// scale 1 and a little less high, normals out from a point below the middle.
// Spread evenly over the dome, down to its foot, some standing proud for a
// ragged outline, and a layer further in, so a gap shows leaves behind
// rather than the core.
export function shrubGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const middle = new THREE.Vector3(0, 0.1, 0), cards: Card[] = [];
  for (let k = 0; k < 200; k++) {
    // A point over the dome, as many low down as high up.
    const a = random() * Math.PI * 2, up = Math.asin(random());
    const out = new THREE.Vector3(Math.cos(up) * Math.cos(a), Math.sin(up), Math.cos(up) * Math.sin(a));
    const depth = k < 150 ? 0.92 + random() ** 2 * 0.22 : 0.6 + random() * 0.2;
    const at = new THREE.Vector3(out.x * 0.42, 0.1 + out.y * 0.3, out.z * 0.42).multiplyScalar(depth);
    const size = 0.34 + random() * 0.14;
    cards.push({ at, w: size, h: size, normal: at.clone().sub(middle).normalize(), spin: random() * Math.PI * 2 });
  }
  return cardGeometry(cards);
}

// A cypress's outline, its radius at a height, both as shares of its
// height: fullest a quarter of the way up, drawn in to a point at the top
// and tucked in a little at the foot.
const cypressRadius = (h: number) => 0.13 * Math.min(1, 0.55 + h * 2.2) * (1 - h) ** 0.75;

// One cypress, a unit tall: spray cards over its whole surface, as many
// anywhere as its girth there asks for, so the foot and the shoulders are
// as well covered as the middle, normals out from its axis and a little up,
// so it shades as one soft flame of a shape. Some stand a little proud, so
// its outline is ragged rather than a smooth cone.
function cypressGeometry(seed: number) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cards: Card[] = [];
  const widest = Math.max(...Array.from({ length: 50 }, (_, i) => cypressRadius(i / 50)));
  while (cards.length < 420) {
    const h = random() * 0.97;
    if (random() > cypressRadius(h) / widest) continue;
    const a = random() * Math.PI * 2, r = cypressRadius(h) * (0.85 + random() ** 2 * 0.35);
    // Upright sprays, near enough upright on screen, smaller towards the tip.
    const w = (0.07 + random() * 0.04) * (0.6 + 0.4 * Math.min(1, (1 - h) * 3));
    cards.push({ at: new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r), w, h: w * 1.65,
      normal: new THREE.Vector3(Math.cos(a) * 0.94, 0.35, Math.sin(a) * 0.94).normalize(), spin: (random() - 0.5) * 0.5 });
  }
  return cardGeometry(cards);
}

// A ball of leaf cards a metre across, centred on the origin, for tree
// crowns and hedges: cards spread evenly all over it, normals out from the
// middle, some standing proud for a ragged outline, and inner of them a
// layer further in, so a gap shows leaves behind rather than the core.
function ballGeometry(seed: number, outer = 90, inner = 0) {
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cards: Card[] = [];
  for (let k = 0; k < outer + inner; k++) {
    // Even over the sphere: a height and a turn.
    const y = random() * 2 - 1, a = random() * Math.PI * 2, round = Math.sqrt(1 - y * y);
    const out = new THREE.Vector3(round * Math.cos(a), y, round * Math.sin(a));
    const size = 0.3 + random() * 0.12, at = k < outer ? 0.36 + random() ** 2 * 0.12 : 0.22 + random() * 0.08;
    cards.push({ at: out.clone().multiplyScalar(at), w: size, h: size, normal: out, spin: random() * Math.PI * 2 });
  }
  return cardGeometry(cards);
}

// Small flowers on a clear ground, for the urns: five round petals round a
// yellow eye, a few to a card, each its own size and turn.
function flowerTexture(seed: number, colours = ['#fff6ec', '#f6c4d4', '#f2a8c0']) {
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 3; k++) {
    const x = px * (0.3 + random() * 0.4), y = px * (0.3 + random() * 0.4), r = px * (0.09 + random() * 0.05), turn = random() * Math.PI;
    g.fillStyle = colours[k % colours.length];
    for (let p = 0; p < 5; p++) {
      const a = turn + p * Math.PI * 2 / 5;
      g.beginPath();
      g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f2c84a';
    g.beginPath();
    g.arc(x, y, r * 0.45, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// What grows in an urn whose soil is radius across at height lip, inside
// a rim that far out: a
// leafy mound heaped over the rim, strands trailing down over the lip on
// every side, and flowers dotted through it. In the urn's own space, so it
// moves when the urn is knocked over.
let urnParts: { leaves: ReturnType<typeof leafCards>, flowers: ReturnType<typeof leafCards>, core: THREE.Material } | undefined;
export function urnPlant(seed: number, lip: number, radius: number, rim: number) {
  urnParts ??= {
    leaves: leafCards(SHRUB, clusterTexture(83), SWAY.crown),
    flowers: leafCards([0xffffff, 0x9a92c2], flowerTexture(89), SWAY.crown),
    core: painted(CORE),
  };
  let s = seed * 7919 + 5;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const leaves: Card[] = [], flowers: Card[] = [], middle = new THREE.Vector3(0, lip - 0.1, 0);
  // The mound.
  for (let k = 0; k < 95; k++) {
    const a = random() * Math.PI * 2, up = Math.asin(random() ** 0.7);
    const at = new THREE.Vector3(Math.cos(a) * Math.cos(up) * radius * 1.02, lip + 0.04 + Math.sin(up) * radius * 0.6, Math.sin(a) * Math.cos(up) * radius * 1.02);
    const size = 0.26 + random() * 0.1;
    leaves.push({ at, w: size, h: size, normal: at.clone().sub(middle).normalize(), spin: random() * Math.PI * 2 });
    if (random() < 0.3) flowers.push({ at: at.clone().addScaledVector(at.clone().sub(middle).normalize(), 0.06), w: 0.2, h: 0.2, normal: at.clone().sub(middle).normalize(), spin: random() * Math.PI * 2 });
  }
  // The trailing strands, out over the lip and down the bowl's side.
  for (let k = 0, strands = 7 + Math.floor(random() * 4); k < strands; k++) {
    const a = (k + random() * 0.7) * Math.PI * 2 / strands, long = 0.3 + random() * 0.55;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    for (let d = 0; d < long; d += 0.05) {
      const t = d / long, at = out.clone().multiplyScalar(rim + 0.04 + 0.05 * Math.sin(Math.min(1, d / 0.15) * Math.PI / 2)).setY(lip + 0.1 - d);
      const size = 0.2 * (1 - t * 0.4) + random() * 0.05;
      leaves.push({ at, w: size, h: size, normal: out.clone().setY(0.9).normalize(), spin: random() * Math.PI * 2 });
    }
  }
  const group = new THREE.Group();
  for (const [cards, parts] of [[leaves, urnParts.leaves], [flowers, urnParts.flowers]] as const) {
    const mesh = new THREE.Mesh(cardGeometry(cards), parts.material);
    mesh.customDepthMaterial = parts.depth;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.88, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, lip, 0), urnParts.core);
  core.castShadow = core.receiveShadow = true;
  group.add(core);
  return group;
}

// The vine spilling over an edge, as in the first reference (without its
// white blossoms): a ridge of leaves along the lip and strands hanging down
// over it, longest in the middle of the run and ragged at its ends. lip is points along the edge, out which way is over it at
// each; reach the longest strand. In whatever space the points are in, so a
// vine on a ruin can move with it.
let vineParts: { leaves: ReturnType<typeof leafCards> } | undefined;
export function vineSpill(lip: THREE.Vector3[], out: THREE.Vector3[], reach: number, seed: number) {
  const sway = { weight: '0.07', flutter: 0.6 };
  vineParts ??= { leaves: leafCards(palette.ivy, clusterTexture(97), sway) };
  let s = seed * 7919 + 13;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const leaves: Card[] = [], ragged = wander(seed * 3 + 1, 0.8);
  const curve = new THREE.CatmullRomCurve3(lip), outs = new THREE.CatmullRomCurve3(out), length = curve.getLength();
  const leaf = (at: THREE.Vector3, normal: THREE.Vector3, size: number) => {
    leaves.push({ at, w: size, h: size, normal, spin: random() * Math.PI * 2 });
    // (Where a blossom was: its draws kept, so the leaves stay put.)
    if (random() < 0.35) random();
  };
  for (let d = random() * 0.1; d < length; d += 0.1 + random() * 0.07) {
    const t = d / length, at = curve.getPointAt(t), o = outs.getPointAt(t).setY(0).normalize();
    const up = new THREE.Vector3(0, 1, 0), lit = o.clone().multiplyScalar(0.6).add(up).normalize();
    // The ridge along the lip, a little back from it.
    for (let k = 0; k < 2; k++) leaf(at.clone().addScaledVector(o, -0.1 - random() * 0.35).setY(at.y + 0.06 + random() * 0.12), lit, 0.28 + random() * 0.1);
    // A strand down over it, its length rounded over the run and ragged.
    const long = reach * Math.max(0.1, (1 - (2 * t - 1) ** 2) ** 0.6 * (0.55 + 0.45 * ragged(d)) * (0.7 + random() * 0.3));
    const drift = (random() - 0.5) * 0.3, side = new THREE.Vector3(-o.z, 0, o.x);
    for (let h = 0; h < long; h += 0.08) {
      const f = h / long, p = at.clone().addScaledVector(o, 0.07 + 0.08 * Math.sin(Math.min(1, h / 0.2) * Math.PI / 2))
        .addScaledVector(side, drift * h).setY(at.y - h);
      leaf(p, o.clone().setY(0.5).normalize(), (0.26 - 0.1 * f) * (0.85 + random() * 0.3));
    }
  }
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(cardGeometry(leaves), vineParts.leaves.material);
  mesh.customDepthMaterial = vineParts.leaves.depth;
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

// One blade's (or leaf's) own shade, from one random number: within a few
// per cent of white, a touch yellower or bluer, so stalks side by side are
// told apart without the lawn going noisy. The green and the drifts are the
// material's (drift.ts).
function bladeShade(r: number) {
  const v = 0.965 + 0.035 * r, hue = ((r * 7.31) % 1 - 0.5) * 0.03;
  return `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v * (1 - hue))})`;
}

// A painted card as a texture, with the empty pixels around each shape
// given the shapes' own near-white rather than the canvas's transparent
// black. Filtering and mipmaps blend an edge with its neighbours, and
// black there drew a dark outline round every blade.
function bled(canvas: HTMLCanvasElement, fill = [246, 246, 246]) {
  const { width, height } = canvas, data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  const flipped = new Uint8Array(data.length), row = width * 4;
  for (let y = 0; y < height; y++) {
    const from = y * row, to = (height - 1 - y) * row;
    for (let k = 0; k < row; k += 4) {
      const a = data[from + k + 3];
      for (let c = 0; c < 3; c++) flipped[to + k + c] = a === 0 ? fill[c] : data[from + k + c];
      flipped[to + k + 3] = a;
    }
  }
  const texture = new THREE.DataTexture(flipped, width, height);
  Object.assign(texture, { colorSpace: THREE.SRGBColorSpace, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, needsUpdate: true });
  return texture;
}

// A blade of grass, one smooth flat shape from its foot (x0, y0) to its tip:
// broad at the foot, narrowing to a small rounded tip, along a gentle arc.
// The arc bows by `bend` (a share of its length, + to the blade's right as
// it rises), so a blade leaning out can rise near upright and curve away.
function blade(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, colour: string, bend = 0) {
  const length = Math.hypot(x1 - x0, y1 - y0), w = width / 2, tip = w * 0.35, n = 14;
  const cx = length / 2, cy = bend * length;
  const left: number[][] = [], right: number[][] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const px = 2 * (1 - t) * t * cx + t * t * length, py = 2 * (1 - t) * t * cy;
    const dx = 2 * (1 - t) * cx + 2 * t * (length - cx), dy = 2 * (1 - t) * cy - 2 * t * cy, d = Math.hypot(dx, dy);
    const half = Math.max(tip, w * (1 - 0.65 * t ** 1.6)), nx = -dy / d, ny = dx / d;
    left.push([px + nx * half, py + ny * half]);
    right.push([px - nx * half, py - ny * half]);
  }
  const [ex, ey] = [length, 0], end = Math.atan2(-cy * 2, length - cx);
  g.save();
  g.translate(x0, y0);
  g.rotate(Math.atan2(y1 - y0, x1 - x0));
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(right[0][0], right[0][1]);
  for (const [x, y] of right) g.lineTo(x, y);
  g.arc(ex, ey, tip, end - Math.PI / 2, end + Math.PI / 2);
  for (const [x, y] of left.reverse()) g.lineTo(x, y);
  g.closePath();
  g.fill();
  g.restore();
}

// A tuft of grass painted on a clear ground, a few broad blades fanning up
// from the foot, each near white in its own shade: the material
// gives the lawn's green. With flowers, the blades are painted in
// green and the tips carry dots of white, pink and yellow.
export function tuftTexture(seed: number, flowers: boolean) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tips: number[][] = [];
  for (let k = 0; k < 5; k++) {
    // Fanned by where it stands, so blades spread apart and never cross.
    const off = random() - 0.5, x = px / 2 + off * px * 0.3, a = -Math.PI / 2 + off * 0.55 + 0 * random(), long = px * (0.45 + random() * 0.45);
    const tx = x + Math.cos(a) * long, ty = px + Math.sin(a) * long, shade = 0.78 + random() * 0.22;
    const colour = flowers ? `rgba(${120 * shade | 0},${178 * shade | 0},${78 * shade | 0},1)` : bladeShade((shade - 0.78) / 0.22);
    random();
    blade(g, x, px, tx, ty, px * (0.14 + random() * 0.04), colour, -Math.sign(off) * 0.06);
    tips.push([tx, ty]);
  }
  if (flowers) for (const [x, y] of tips.slice(0, 6)) {
    g.fillStyle = ['#fffaf0', '#f4b8cc', '#f6dc6a'][Math.floor(random() * 3)];
    g.beginPath();
    g.arc(x, y + 6, 7 + random() * 4, 0, Math.PI * 2);
    g.fill();
  }
  return bled(canvas, flowers ? [100, 150, 66] : undefined);
}

// A patch of the lawn's grass: a dozen or so blades side by side across the
// card, each near white in its own shade, so tufts packed together run
// into one carpet the same colour as the ground.
export function swardTexture(seed: number) {
  const px = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 14; k++) {
    const x = px * (0.06 + random() * 0.88), off = x / px - 0.5, a = -Math.PI / 2 + off * 0.35 + 0 * random(), long = px * (0.45 + random() * 0.5);
    const shade = bladeShade(random());
    random();
    blade(g, x, px, x + Math.cos(a) * long, px + Math.sin(a) * long, px * (0.085 + random() * 0.03), shade, -Math.sign(off) * 0.05);
  }
  return bled(canvas);
}

// A tuft: two upright cards crossing at its middle, a unit tall and wide,
// standing on the origin, its normals all straight up so it shades just as
// the lawn under it does.
export function tuftGeometry(sward = false) {
  const cards = sward
    // The lawn's own grass: three upright cards set a little out from the
    // middle. Upright, with upright blades, so nothing crosses at an angle
    // (crossing blades read as noise).
    ? [0, 1, 2].map(k => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).translate(0, 0, 0.08).rotateY(k * Math.PI * 2 / 3))
    : [0, 1].map(k => new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateY(k * Math.PI / 2));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const card of cards) {
    const nonIndexed = card.toNonIndexed();
    positions.push(...nonIndexed.getAttribute('position').array);
    uvs.push(...nonIndexed.getAttribute('uv').array);
    for (let k = 0; k < nonIndexed.getAttribute('position').count; k++) normals.push(0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// A smooth field over the ground, about -1 to 1: a few long waves crossing
// at their own angles.
export function field2(seed: number, scale: number) {
  let s = seed * 7919 + 5;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const waves = Array.from({ length: 4 }, (_, k) => {
    const a = random() * Math.PI * 2, f = (0.7 + random() * 0.6) * 2 ** (k * 0.7) / scale;
    return [Math.cos(a) * f, Math.sin(a) * f, random() * Math.PI * 2, 1 / 2 ** (k * 0.8)];
  });
  const total = waves.reduce((sum, w) => sum + w[3], 0);
  return (x: number, z: number) => waves.reduce((sum, [fx, fz, p, amp]) => sum + Math.sin(x * fx + z * fz + p) * amp, 0) / total * 1.6;
}

// Clover, seen from above: a mat of three-part leaves, each leaflet a
// rounded heart, on a clear ground. Near white, each leaf its own shade,
// so its green comes from the material, as the grass's does.
export function cloverTexture(seed: number) {
  const px = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 26; k++) {
    // Thicker towards the middle, so the mat's edge is ragged.
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * px * 0.36, x = px / 2 + Math.cos(a) * d, y = px / 2 + Math.sin(a) * d;
    const size = px * (0.05 + random() * 0.03), turn = random() * Math.PI * 2;
    const shade = bladeShade(random());
    for (let l = 0; l < 3; l++) {
      const b = turn + l * Math.PI * 2 / 3, lx = x + Math.cos(b) * size * 0.9, ly = y + Math.sin(b) * size * 0.9;
      // A heart: two lobes at the outer end, narrowing to the middle.
      g.fillStyle = shade;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.arc(lx + Math.cos(b + side * 0.9) * size * 0.35, ly + Math.sin(b + side * 0.9) * size * 0.35, size * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(lx + Math.cos(b + 1.6) * size * 0.6, ly + Math.sin(b + 1.6) * size * 0.6);
      g.lineTo(lx + Math.cos(b - 1.6) * size * 0.6, ly + Math.sin(b - 1.6) * size * 0.6);
      g.closePath();
      g.fill();
    }
  }
  return bled(canvas);
}
// A clover mat: a level card a little off the ground and three more leaning
// low out from it, a unit wide and tall, normals straight up.
export function cloverGeometry() {
  const cards = [
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.6, 0),
    ...[0, 1, 2].map(k => new THREE.PlaneGeometry(0.8, 0.8).translate(0, 0.4, 0).rotateX(-1.25).translate(0, 0.1, 0.1).rotateY(k * Math.PI * 2 / 3 + 0.4)),
  ];
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  for (const card of cards) {
    const flat = card.toNonIndexed();
    positions.push(...flat.getAttribute('position').array);
    uvs.push(...flat.getAttribute('uv').array);
    for (let k = 0; k < flat.getAttribute('position').count; k++) normals.push(0, 1, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// Is a shrub of a radius clear of the paths (by a little, so it can lean
// over their edges), the pools and their rims, and the stonework?
const STONEWORK: [number, number, number][] = [
  // The statue's plinth, the urns, the slabs and blocks, the loose drums and
  // the broken capital.
  [4.1, 8.3, 1.9], [-24.5, 12, 1.2], [-24, 21, 1.2], [-7.8, 10, 1.2], [24, 38, 1.2], [22, 42.5, 1.2],
  [-7, 3, 1.8], [5.5, 18, 1.8], [6, 24.5, 1.8], [-11, 42.5, 1.8], [5.8, 42.5, 1.8], [-26.5, 9.8, 1.8], [-36, 13, 1.8],
  [-30, 30, 1.8], [-36, 34, 1.8], [22, 9, 1.8], [33, 16, 1.8], [40, 9, 1.8], [-10, 22.5, 1.8], [9, 40, 1.8],
  [-25.5, 29.5, 1], [-21.5, 40.5, 1], [-7, 43, 1], [-24, 32.6, 1.4],
];
function clear(x: number, z: number, r: number) {
  if (x < WEST_LAWN + 0.3 || x > EAST_LAWN - 0.3 || z > lawnSouth(x) - 0.3 || z < MOATS_FROM - 4) return false;
  if (PATHS.some(([x0, x1, z0, z1]) => x > x0 - r + 0.3 && x < x1 + r - 0.3 && z > z0 - r + 0.3 && z < z1 + r - 0.3)) return false;
  if (POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 7.6 + r)) return false;
  // The colonnade round the east pool, the broken fence, the fallen column.
  if (Math.abs(Math.hypot(x - 15.3, z - 34.1) - 9.5) < r + 1 && z < 36) return false;
  if (x > 8 - r && x < 20.5 + r && z > 1.3 - r && z < 7 + r) return false;
  const along = new THREE.Vector2(16.2, 5.8).normalize(), from = new THREE.Vector2(-5.6, 39.1), d = new THREE.Vector2(x, z).sub(from);
  const t = THREE.MathUtils.clamp(d.dot(along), -19.5, 0);
  if (d.clone().sub(along.clone().multiplyScalar(t)).length() < r + 0.9) return false;
  if (onSunk(x, z, r * 0.6)) return false;
  return !STONEWORK.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr + r * 0.8);
}

// The giant tree over the city, as in the far view: one vast canopy, wider
// than the castle, a broad dome of leaf masses drooping at its edge, with
// a flatter, lumpy underside, on a trunk hidden among the towers, and boughs reaching out
// under it. Built like the small trees' crowns, only huge: from the garden
// it's a hazy green cloud over the wall.
function giantTree(scene: THREE.Scene) {
  let s = 7717;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const middle = new THREE.Vector3(0, CITY_TOP.top + 52, CITY_TOP.z), wide = 100, deep = 38, droop = 26;
  const balls: THREE.Matrix4[] = [];
  const ball = (at: THREE.Vector3, across: number) => balls.push(new THREE.Matrix4().compose(at,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)), new THREE.Vector3(across, across * 0.75, across)));
  // Over the dome, denser and smaller towards its edge so the outline is
  // lumpy; and under it, a layer of masses hanging a little lower.
  for (let k = 0; k < 280; k++) {
    const a = random() * Math.PI * 2, up = Math.asin(random() ** 0.7) * 0.95, d = Math.cos(up);
    ball(new THREE.Vector3(Math.sin(a) * d * wide, middle.y + Math.sin(up) * deep - d ** 3 * droop, middle.z - Math.cos(a) * d * wide), 30 + random() * 22 * (1.2 - d));
  }
  for (let k = 0; k < 240; k++) {
    const a = random() * Math.PI * 2, d = Math.sqrt(random()) * wide * 0.9, under = deep * 0.85 * Math.sqrt(Math.max(0, 1 - (d / (wide * 0.88)) ** 2));
    ball(new THREE.Vector3(Math.sin(a) * d, middle.y - under * 0.6 - (d / wide) ** 3 * droop - random() * 4, middle.z - Math.cos(a) * d), 28 + random() * 18);
  }
  instanced(ballGeometry(113), leafCards(CROWN, clusterTexture(117), { weight: '0.5', flutter: 0.5 }), balls, scene);
  const core = new THREE.SphereGeometry(1, 32, 16).scale(wide * 0.88, deep * 0.85, wide * 0.88).translate(middle.x, middle.y + 2, middle.z);
  const inside = new THREE.Mesh(core, painted(CROWN_CORE));
  scene.add(inside);
  // The trunk among the towers, and boughs out under the canopy.
  const wood: THREE.BufferGeometry[] = [];
  wood.push(new THREE.CylinderGeometry(11, 17, 70, 24).translate(0, CITY_TOP.top + 30, CITY_TOP.z));
  for (let b = 0; b < 7; b++) {
    const a = b * Math.PI * 2 / 7 + random() * 0.5, reach = wide * (0.55 + random() * 0.25);
    const from = new THREE.Vector3(0, CITY_TOP.top + 40 + random() * 15, CITY_TOP.z);
    const to = new THREE.Vector3(Math.sin(a) * reach, middle.y - 4, CITY_TOP.z - Math.cos(a) * reach);
    const bend = from.clone().lerp(to, 0.5).setY(from.y + 8);
    wood.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, bend, to]), 12, 4.5 - random(), 8));
  }
  scene.add(new THREE.Mesh(mergeGeometries(wood.map(g => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }))!, painted(BARK)));
}

// Where the garden's flowers stand, for meadow.ts to plant (white, to start).
export const gardenFlowers: THREE.Vector3[] = [];

export function createFoliage(world: RAPIER.World, scene: THREE.Scene) {
  let s = 4243;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Draws for what's out of the garden come from a sequence of their own,
  // so adding to them never shifts the garden's planting.
  const apart = (seed: number, plant: () => void) => { const kept = s; s = seed; plant(); s = kept; };
  const shrubs: THREE.Matrix4[] = [];
  // A shrub across a diameter, if there's room (or anywhere, out of the
  // garden), a little squashed or stretched and turned at random.
  const shrub = (x: number, z: number, across: number, anywhere = false) => {
    const r = across / 2;
    if (!anywhere && !clear(x, z, r * 0.7)) return false;
    const squash = 0.8 + random() * 0.4;
    shrubs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
      new THREE.Vector3(across, across * squash, across * (0.85 + random() * 0.3))));
    return true;
  };
  // Heaped along a bank: big and small together, in runs with gaps, each
  // run a few shrubs leaning on each other, the biggest at the back.
  const bank = (points: (t: number) => [number, number, number, number], length: number, seed: number) => {
    const runs = wander(seed, 9);
    for (let d = 0; d < length; d += 0.7 + random() * 1.1) {
      if (runs(d) < -0.45) continue;
      const [x, z, inx, inz] = points(d / length), across = 1.8 + random() ** 1.3 * 2.8 + Math.max(0, runs(d)) * 1.5;
      // Set back from the edge by about its radius, and now and then a
      // smaller one in front.
      shrub(x + inx * across * 0.35, z + inz * across * 0.35, across);
      if (random() < 0.5) shrub(x + inx * (across * 0.9 + 0.5), z + inz * (across * 0.9 + 0.5), 0.9 + random() * 0.8);
    }
  };
  const south = (x: number): [number, number, number, number] => {
    const slope = 2 * x / 298, l = Math.hypot(1, slope);
    return [x, lawnSouth(x), slope / l, -1 / l];
  };
  // Along the moats: down both sides, and round the south one either side
  // of the landing.
  bank(t => [WEST_LAWN, MOATS_FROM + 1 + t * (lawnSouth(WEST_LAWN) - MOATS_FROM - 2), 1, 0], lawnSouth(WEST_LAWN) - MOATS_FROM, 1);
  bank(t => [EAST_LAWN, MOATS_FROM + 1 + t * (lawnSouth(EAST_LAWN) - MOATS_FROM - 2), -1, 0], lawnSouth(EAST_LAWN) - MOATS_FROM, 2);
  bank(t => south(WEST_LAWN + 1 + t * (-WEST_LAWN - 10)), -WEST_LAWN - 10, 3);
  bank(t => south(9 + t * (EAST_LAWN - 10)), EAST_LAWN - 10, 4);
  // On the ledges beyond the garden's sides: heaped in runs along the front
  // edge, big ones banked against the towers' feet, and clumps out on the
  // lawn.
  apart(811, () => { for (const side of [-1, 1]) {
    const edge = side > 0 ? EAST : WEST, runs = wander(side > 0 ? 5 : 6, 8), feet = wander(side > 0 ? 7 : 8, 11);
    const line = ledgeEdge(side, 400), centre = [edge, ledgeFront(side * OUTER)];
    let walked = 0, next = 3;
    line.slice(1).forEach(([x, z], i) => {
      walked += Math.hypot(x - line[i][0], z - line[i][1]);
      if (walked < next) return;
      next = walked + 0.8 + random() * 1.2;
      if (runs(walked) < -0.4) return;
      const inward = Math.atan2(centre[1] - z, centre[0] - x), across = 1.8 + random() ** 1.3 * 2.6 + Math.max(0, runs(walked)) * 1.6;
      const set = across * 0.4 + random() * 0.6;
      shrub(x + Math.cos(inward) * set, z + Math.sin(inward) * set, across, true);
    });
    for (let d = 1.5; d < OUTER - Math.abs(edge) - 2; d += 0.8 + random() * 1.2) {
      const x = edge + side * d;
      if (feet(d) > -0.2) {
        const across = 2.5 + random() * 2.5 + Math.max(0, feet(d)) * 2.5;
        shrub(x, cityFront(x) - across * 0.2, across, true);
      }
    }
    for (let k = 0; k < 7; k++) {
      const x = edge + side * (6 + random() * (OUTER - Math.abs(edge) - 14)), z0 = ledgeFront(x) + 6, z1 = cityFront(x) - 8;
      if (z1 < z0) continue;
      const cz = z0 + random() * (z1 - z0);
      for (let n = 2 + Math.floor(random() * 4); n > 0; n--) shrub(x + (random() - 0.5) * 7, cz + (random() - 0.5) * 7, 1.4 + random() ** 1.5 * 2.8, true);
    }
  } });
  // Round the foot of each column, on the side away from the main path.
  for (const z of [14.6, 22.7, 31.2, 39.6]) {
    for (let k = 1 + Math.floor(random() * 3); k > 0; k--) {
      const a = Math.PI * (0.55 + random() * 0.9);
      shrub(-4.1 + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2, 1.1 + random() * 1.2);
    }
  }
  // A few clumps out in the lawns between the branch paths.
  for (const [cx, cz] of [[-30, 17], [-34, 44], [-12, 31], [30, 22], [26, 4], [36, 34], [-26, 2]]) {
    for (let k = 2 + Math.floor(random() * 3); k > 0; k--) {
      shrub(cx + (random() - 0.5) * 6, cz + (random() - 0.5) * 6, 1.2 + random() ** 1.5 * 2.4);
    }
  }

  // Cypresses: loose rows along the branch paths, each tree its own height,
  // gaps here and there. Each has a solid trunk the robot can't walk
  // through, which the camera ignores.
  let cypresses: { matrix: THREE.Matrix4, x: number, z: number, r: number, trunk: RAPIER.Collider }[] = [];
  // Where the trees stand, so the hedges keep off them.
  const taken: [number, number, number][] = [];
  const cypress = (x: number, z: number, tall: number, placed = false) => {
    const across = tall * 0.13 * 2 / 0.9;
    if (!placed && !clear(x, z, across / 2)) return;
    const wide = 0.9 + random() * 0.25;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * wide, tall, tall * wide));
    if (placed) return;
    taken.push([x, z, across / 2]);
    cypresses.push({ matrix, x, z, r: across / 2,
      trunk: world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.3, 0.5).setTranslation(x, tall * 0.3 + 0.5, z).setCollisionGroups(WALL_GROUPS)) });
  };
  // Where the pair that once framed the arch stood: drawn and dropped, so
  // the rest of the planting comes out as it was.
  cypress(-4.3, 42.8, 10.5, true);
  cypress(4.3, 42.8, 10, true);
  // Along one side or the other of each branch, about every 5 m.
  for (const [x0, x1, z0, z1] of PATHS.slice(1, 5)) {
    const side = random() < 0.5 ? z0 - 1.9 : z1 + 1.9;
    for (let x = Math.min(x0, x1) + 3 + random() * 2; x < Math.max(x0, x1) - 3; x += 4.5 + random() * 2) {
      if (random() < 0.25) continue;
      cypress(x, side + (random() - 0.5) * 0.4, 5 + random() ** 1.3 * 7);
    }
  }
  // Small trees beside the pools and at the ends of the branch paths, each
  // the focal point of its garden room: a trunk forking into three or four
  // boughs, each ending in a ball of leaves, more over the top and between,
  // running together into one lumpy crown.
  const trunks: THREE.BufferGeometry[] = [], crowns: THREE.Matrix4[] = [];
  const tree = (x: number, z: number, tall: number, anywhere = false) => {
    if (!anywhere && !clear(x, z, 1)) return;
    const lean = new THREE.Vector3((random() - 0.5) * 0.12, 1, (random() - 0.5) * 0.12).normalize();
    const fork = new THREE.Vector3(x, 0, z).addScaledVector(lean, tall * (0.3 + random() * 0.1));
    trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, -0.2, z), new THREE.Vector3(x, 0, z).addScaledVector(lean, tall * 0.15), fork]), 8, tall * 0.028, 7));
    const ball = (at: THREE.Vector3, across: number) => crowns.push(new THREE.Matrix4().compose(at,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)), new THREE.Vector3(across, across * 0.8, across)));
    const boughs = 3 + Math.floor(random() * 2), a0 = random() * Math.PI * 2, tips: THREE.Vector3[] = [];
    for (let b = 0; b < boughs; b++) {
      const a = a0 + b * Math.PI * 2 / boughs + (random() - 0.5) * 0.8, reach = tall * (0.16 + random() * 0.1);
      const tip = fork.clone().add(new THREE.Vector3(Math.cos(a) * reach, tall * (0.25 + random() * 0.2), Math.sin(a) * reach));
      const bend = fork.clone().lerp(tip, 0.5).add(new THREE.Vector3(Math.cos(a) * reach * 0.2, -tall * 0.03, Math.sin(a) * reach * 0.2));
      trunks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([fork, bend, tip]), 6, tall * 0.016, 6));
      tips.push(tip);
      ball(tip, tall * (0.42 + random() * 0.12));
    }
    // Over the top, and filling in between the boughs, so the balls run
    // together into one crown with lumps in it.
    const top = fork.clone().add(new THREE.Vector3(0, tall * 0.6, 0));
    ball(top, tall * 0.48);
    tips.forEach((tip, k) => ball(tip.clone().lerp(tips[(k + 1) % tips.length], 0.5).lerp(top, 0.3), tall * (0.34 + random() * 0.1)));
    taken.push([x, z, 1]);
    // No cypress growing up through its crown.
    cypresses = cypresses.filter(c => {
      if (Math.hypot(c.x - x, c.z - z) > tall * 0.9 + c.r) return true;
      world.removeCollider(c.trunk, false);
      taken.splice(taken.findIndex(([tx, tz]) => tx === c.x && tz === c.z), 1);
      return false;
    });
    world.createCollider(RAPIER.ColliderDesc.capsule(tall * 0.15, 0.4).setTranslation(x, tall * 0.15 + 0.4, z).setCollisionGroups(WALL_GROUPS));
  };
  // By the pools: on the west pool's far side, and the east pool's south
  // side, away from its colonnade.
  for (const [[px, pz], angles] of [[POOLS[0], [2.6, 3.9]], [POOLS[1], [0.6, 2.2]]] as const) {
    for (const a of angles) tree(px + Math.cos(a) * 9.6, pz + Math.sin(a) * 9.6, 7 + random() * 3);
  }
  // At the far ends of the branches.
  for (const [x, z] of [[-40.5, 10.2], [-37, 22.2], [-41, 41.2], [42.5, 7.6]]) tree(x, z, 6 + random() * 3.5);
  // A few out on the ledges beyond the sides, bigger.
  apart(823, () => { for (const side of [-1, 1]) {
    const edge = side > 0 ? EAST : WEST;
    for (let k = 0; k < 9; k++) {
      const x = edge + side * (5 + random() * (OUTER - Math.abs(edge) - 10)), z0 = ledgeFront(x) + 4, z1 = cityFront(x) - 5;
      if (z1 > z0) tree(x, z0 + random() * (z1 - z0), 8 + random() * 5, true);
    }
  } });
  {
    const geometry = cypressGeometry(23), core = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => {
      const h = i / 11;
      return new THREE.Vector2(cypressRadius(h) * 0.75, h * 0.96);
    }), 10);
    const placed = cypresses.map(({ matrix }) => matrix);
    instanced(geometry, leafCards(CYPRESS, sprayTexture(41), SWAY.cypress, false), placed, scene);
    instanced(core, painted(CYPRESS_CORE), placed, scene);
  }
  {
    instanced(ballGeometry(31, 130, 40), leafCards(CROWN, clusterTexture(43), SWAY.crown), crowns, scene);
    instanced(new THREE.SphereGeometry(0.26, 12, 8), painted(CROWN_CORE), crowns, scene);
    const wood = new THREE.Mesh(mergeGeometries(trunks.map(g => { g.deleteAttribute('uv'); return g; }))!, painted(BARK));
    wood.castShadow = wood.receiveShadow = true;
    scene.add(wood);
  }

  // Hedge fragments, the old edging along the paths: rows of boxy, flat-
  // topped masses of leaves, broken where something's in the way and gappy
  // anyway, each unbroken run with a box the robot can't walk through.
  const hedges: THREE.Matrix4[] = [];
  const hedge = (x0: number, z0: number, x1: number, z1: number, tall: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0), gaps = wander(Math.floor(x0 * 7 + z0 * 13), 3);
    let run: THREE.Vector3[] = [];
    const close = () => {
      if (run.length > 1) {
        const [a, b] = [run[0], run[run.length - 1]], middle = a.clone().lerp(b, 0.5);
        world.createCollider(RAPIER.ColliderDesc.cuboid(a.distanceTo(b) / 2 + 0.6, tall / 2, 0.7).setTranslation(middle.x, tall / 2, middle.z)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)).setCollisionGroups(WALL_GROUPS));
      }
      run = [];
    };
    for (let d = 0; d < length; d += 0.9 + random() * 0.4) {
      const x = x0 + (x1 - x0) * d / length, z = z0 + (z1 - z0) * d / length;
      if (gaps(d) < -0.35 || !clear(x, z, 0.8) || taken.some(([tx, tz, r]) => Math.hypot(x - tx, z - tz) < r + 0.9)) { close(); continue; }
      const height = tall * (0.75 + random() * 0.3) * (gaps(d) < -0.1 ? 0.6 : 1);
      hedges.push(new THREE.Matrix4().compose(new THREE.Vector3(x, height * 0.42, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (random() - 0.5) * 0.3), new THREE.Vector3(1.9, height, 1.6)));
      run.push(new THREE.Vector3(x, 0, z));
    }
    close();
  };
  hedge(4.1, 16, 4.1, 23, 2);
  hedge(4.1, 26, 4.1, 31, 1.8);
  hedge(-40, 9.3, -29, 9.3, 2.2);
  hedge(-37, 23, -27, 23, 1.7);
  hedge(19, 15.8, 31, 15.8, 2);
  hedge(8, 9.3, 17, 9.3, 1.6);
  hedge(-35, 40.3, -27, 40.3, 2.4);
  {
    instanced(ballGeometry(59, 130, 40), leafCards(SHRUB, clusterTexture(53), SWAY.crown), hedges, scene);
    instanced(new THREE.SphereGeometry(0.28, 12, 8), painted(CORE), hedges, scene);
  }

  // Grass: tufts creeping over the edges of every path and into the paving
  // near them, in patches, and tall grass and wildflowers where paths meet
  // the lawn and round the ruins.
  const tufts: THREE.Matrix4[] = [], blooms: THREE.Matrix4[] = [];
  gardenFlowers.length = 0;
  const tuft = (x: number, z: number, tall: number, flowering = false) => {
    if (!flowering && random() < 0.08) flowering = true;
    (flowering ? blooms : tufts).push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * (0.8 + random() * 0.6), tall, tall * (0.8 + random() * 0.6))));
  };
  PATHS.forEach(([x0, x1, z0, z1], p) => {
    const patches = wander(p * 31 + 7, 4);
    // Along each side: a line of the path's edge, which way is out of it.
    const sides: [number, number, number, number, number][] = [[x0, z0, x0, z1, -1], [x1, z0, x1, z1, 1], [x0, z0, x1, z0, -1], [x0, z1, x1, z1, 1]];
    for (const [ax, az, bx, bz, out] of sides) {
      const length = Math.hypot(bx - ax, bz - az), across = ax === bx;
      for (let d = random() * 0.4; d < length; d += 0.18 + random() * 0.3) {
        const thick = patches(d + (across ? ax : az));
        if (thick < -0.3) continue;
        // Mostly on the lawn side, some reaching into the paving.
        const off = out * (random() < 0.3 ? -random() * 0.6 : random() * 0.7), x = ax + (bx - ax) * d / length, z = az + (bz - az) * d / length;
        const [tx, tz] = across ? [x + off, z] : [x, z + off];
        if (PATHS.some(([px0, px1, pz0, pz1]) => tx > px0 + 0.8 && tx < px1 - 0.8 && tz > pz0 + 0.8 && tz < pz1 - 0.8)) continue;
        if (POOLS.some(([px, pz]) => Math.hypot(tx - px, tz - pz) < 7.6)) continue;
        tuft(tx, tz, 0.35 + random() * 0.4 + Math.max(0, thick) * 0.3);
      }
    }
  });
  // Small tufts in the paving's cracks, thick near the edges where the moss
  // creeps in, now and then out in the middle.
  const inside = (x: number, z: number) => Math.max(0, ...PATHS.map(([x0, x1, z0, z1]) => Math.min(x - x0, x1 - x, z - z0, z1 - z)));
  apart(653, () => {
    for (const [x0, x1, z0, z1] of PATHS) {
      for (let k = Math.round((x1 - x0) * (z1 - z0) * 1.2); k > 0; k--) {
        const x = x0 + random() * (x1 - x0), z = z0 + random() * (z1 - z0), d = inside(x, z);
        if (d < 0.25 || random() > 0.03 + 0.3 * Math.max(0, 1 - d / 1.4)) continue;
        tuft(x, z, 0.18 + random() * 0.2);
      }
    }
  });
  // Tall grass and flowers in patches: round the broken fence, the fallen
  // column and the column feet, and where the branches leave the main path.
  for (const [cx, cz, r] of [[11, 4.5, 4], [17, 1, 3], [-12, 35, 4], [-18, 37.5, 3], [-4, 40, 2.5], [-6, 15, 2], [-6, 23, 2],
    [-3.5, 8.5, 2.5], [-3.5, 29, 2.5], [-3.5, 39.5, 2], [3.5, 15.5, 2.5], [3.5, 37, 2.5], [-22, 32, 3]]) {
    for (let k = Math.round(r * r * 7); k > 0; k--) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (PATHS.some(([px0, px1, pz0, pz1]) => x > px0 + 0.3 && x < px1 - 0.3 && z > pz0 + 0.3 && z < pz1 - 0.3)) continue;
      // On the lawn: the fence's patch reaches past the garden's north lip.
      if (z < northEdge(x) + 0.2 || z > lawnSouth(x) - 0.2) continue;
      tuft(x, z, 0.6 + random() * 0.6 * (1 - d / r), random() < 0.3);
    }
  }
  // And short grass all over every lawn, the strip north of the moats and
  // the top of the start tower too, a patch every 30 cm or so, running together into a carpet, taller
  // and shorter in drifts, clear of the paving, the pools and the stonework.
  const sward: THREE.Matrix4[] = [];
  const drifts = [wander(97, 7), wander(98, 9)], field = (x: number, z: number, y: number) => {
    const drift = (drifts[0](x * 0.8 + z * 0.6) + drifts[1](z * 0.8 - x * 0.6)) / 2;
    const tall = 0.2 + Math.max(0, drift) * 0.35 + random() * 0.1;
    sward.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2), new THREE.Vector3(tall * (1.6 + random() * 0.6), tall, tall * (1.6 + random() * 0.6))));
  };
  const along = new THREE.Vector2(16.2, 5.8).normalize(), fallen = new THREE.Vector2(-5.6, 39.1);
  // Out in the lawn's open middle, at least some way from any paving, pool
  // or stonework: where the clover and the long grass grow.
  const open = (x: number, z: number, clear: number) => z > northEdge(x) + clear && z < lawnSouth(x) - clear && x > WEST + clear && x < EAST - clear
    && !(z > MOATS_FROM - clear && (x < WEST_LAWN + clear || x > EAST_LAWN - clear))
    && !PATHS.some(([x0, x1, z0, z1]) => x > x0 - clear && x < x1 + clear && z > z0 - clear && z < z1 + clear)
    && !POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 7.5 + clear)
    && !STONEWORK.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr + clear) && !onSunk(x, z, clear);
  // Clover patches first, so the grass keeps out of their middles. With
  // their own random numbers, so the rest of the planting stays put.
  let cs = 4447;
  const crandom = () => (cs = (cs * 16807) % 2147483647) / 2147483647;
  // Mostly in the garden's middle, where the robot walks; the rest anywhere
  // on the lawn.
  const somewhere = () => crandom() < 0.7 ? [-24 + crandom() * 48, crandom() * 46] : [WEST_LAWN + crandom() * (EAST_LAWN - WEST_LAWN), crandom() * 46];
  const cloverPatches: { cx: number, cz: number, radius: number, count: number }[] = [];
  for (let tries = 0; cloverPatches.length < 260 && tries < 20000; tries++) {
    const [cx, cz] = somewhere();
    if (!open(cx, cz, 0.5)) continue;
    const count = 6 + Math.floor(crandom() * 12);
    cloverPatches.push({ cx, cz, radius: 0.3 + Math.sqrt(count) * 0.22, count });
  }
  for (let gx = WEST; gx < EAST; gx += 0.32) {
    for (let gz = northEdge(gx) - 0.5; gz < lawnSouth(gx) + 6; gz += 0.32) {
      const x = gx + (random() - 0.5) * 0.3, z = gz + (random() - 0.5) * 0.3;
      if (z < northEdge(x) + 0.2) continue;
      if (cloverPatches.some(({ cx, cz, radius }) => Math.hypot(x - cx, z - cz) < radius * (0.5 + 0.4 * (((x * 7.3 + z * 3.1) % 1 + 1) % 1)))) continue;
      if (z > MOATS_FROM - 0.2 && (x < WEST_LAWN + 0.2 || x > EAST_LAWN - 0.2)) continue;
      if (z > lawnSouth(x) - 0.2 && !(Math.abs(x) < 4.4 && z < 50.2)) continue;
      if (PATHS.some(([x0, x1, z0, z1]) => x > x0 + 0.1 && x < x1 - 0.1 && z > z0 + 0.1 && z < z1 - 0.1)) continue;
      if (POOLS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 7.5)) continue;
      if (STONEWORK.some(([sx, sz, sr]) => Math.hypot(x - sx, z - sz) < sr * 0.75)) continue;
      // Up to the sunk paving's edges, not through it.
      if (onSunk(x, z, 0.05)) continue;
      // The colonnade's columns, and the fallen column's drums.
      if (Math.abs(Math.hypot(x - 15.3, z - 34.1) - 9.5) < 0.8 && z < 36) continue;
      const d = new THREE.Vector2(x, z).sub(fallen), t = THREE.MathUtils.clamp(d.dot(along), -19.5, 0);
      if (d.sub(along.clone().multiplyScalar(t)).length() < 1) continue;
      field(x, z, 0);
    }
  }
  // The ledges, from the front edge to the towers' feet.
  apart(829, () => { for (const side of [-1, 1]) {
    const edge = side > 0 ? EAST : WEST;
    for (let d = 0.3; d < OUTER - Math.abs(edge); d += 0.4) {
      const gx = edge + side * d;
      for (let gz = ledgeFront(gx) + 0.2; gz < cityFront(gx) + 0.5; gz += 0.4) field(gx + (random() - 0.5) * 0.36, gz + (random() - 0.5) * 0.36, 0);
    }
  } });
  // The front lip, ledges and all: the grass grows a little way over it, as
  // round the start tower's rim (meadow.ts), so the lawn doesn't stop on a
  // ruled line. A soft lip leaning out all along, ragged in how far it
  // reaches, and in runs a fringe tipped right over and blades hanging down
  // the top of the wall. Kept clear of the causeway. With its own random
  // numbers, so the rest of the planting stays put. Lit as if they still
  // stood upright, so the blades tipped over the edge keep the lawn's own
  // green instead of going dark as their faces turn from the sun.
  const drape: THREE.Matrix4[] = [];
  {
    let es = 6151;
    const erandom = () => (es = (es * 16807) % 2147483647) / 2147483647;
    const up = new THREE.Vector3(0, 1, 0), runs = wander(613, 3), reach = wander(617, 1.2);
    const lip = [...ledgeEdge(-1, 400).reverse(), ...Array.from({ length: 401 }, (_, i) => { const x = WEST + (EAST - WEST) * i / 400; return [x, northEdge(x)]; }).slice(1, -1), ...ledgeEdge(1, 400)];
    const hang = (x: number, y: number, z: number, ox: number, oz: number, lean: number, tall: number) => {
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(oz, 0, -ox), lean);
      const turn = new THREE.Quaternion().setFromAxisAngle(up, erandom() * Math.PI * 2);
      drape.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tilt.multiply(turn), new THREE.Vector3(tall * (1.4 + erandom() * 0.4), tall, tall * (1.4 + erandom() * 0.4))));
    };
    let along = 0;
    for (let i = 1; i < lip.length; i++) {
      const [ax, az] = lip[i - 1], [bx, bz] = lip[i], step = Math.hypot(bx - ax, bz - az);
      if (!step) continue;
      // Out over the edge: the line runs west to east round the front, so
      // out is to its left.
      const nx = (bz - az) / step, nz = -(bx - ax) / step;
      for (let d = along > 0 ? 0 : erandom() * 0.1; d < step; d += 0.12 + erandom() * 0.1) {
        const x = ax + (bx - ax) * d / step, z = az + (bz - az) * d / step, u = along + d;
        if (Math.abs(x) < 2.8) continue;
        const far = 0.5 + 0.5 * reach(u);
        // The lip: leaning out a little back from the edge, then tipped out
        // over it, and a fringe hanging down all along over the turf's own
        // edge, ragged in how far down it gets, so no straight line shows.
        hang(x - nx * (0.15 + erandom() * 0.3), 0, z - nz * (0.15 + erandom() * 0.3), nx, nz, 0.15 + erandom() * 0.25, 0.24 + erandom() * 0.14);
        hang(x - nx * (0.02 + erandom() * 0.08), 0, z - nz * (0.02 + erandom() * 0.08), nx, nz, 0.6 + 0.4 * far + erandom() * 0.3, 0.22 + 0.1 * far + erandom() * 0.1);
        hang(x + nx * 0.03, -0.02, z + nz * 0.03, nx, nz, 1.9 + erandom() * 0.5, 0.3 + 0.25 * far + erandom() * 0.12);
        // In runs, longer blades down the top of the wall.
        const run = runs(u);
        if (run > 0.1 && erandom() < 0.3 + run * 0.6) hang(x + nx * 0.05, -0.08 - erandom() * 0.15, z + nz * 0.05, nx, nz, 2.6 + erandom() * 0.35, 0.35 + run * 0.45 + erandom() * 0.15);
      }
      along += step;
    }
  }
  // Clover mats in those patches, and long grass in clumps of its own out
  // in the open lawn, not just along the edges.
  const clover: THREE.Matrix4[] = [];
  const level = (x: number, z: number, tall: number, wide: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), crandom() * Math.PI * 2), new THREE.Vector3(wide, tall, wide));
  for (const { cx, cz, radius, count } of cloverPatches) {
    for (let k = 0; k < count; k++) {
      const b = crandom() * Math.PI * 2, r = radius * crandom() ** 0.6, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r;
      if (open(x, z, 0.1)) clover.push(level(x, z, 0.2 + crandom() * 0.08, 0.45 + crandom() * 0.3));
    }
  }
  const long: THREE.Matrix4[] = [];
  for (let clumps = 0, tries = 0; clumps < 240 && tries < 20000; tries++) {
    const [cx, cz] = somewhere();
    if (!open(cx, cz, 0.6)) continue;
    clumps++;
    const count = 5 + Math.floor(crandom() * 12), radius = 0.2 + Math.sqrt(count) * 0.13;
    for (let k = 0; k < count; k++) {
      const b = crandom() * Math.PI * 2, r = radius * crandom() ** 0.8, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r;
      const tall = 0.6 + crandom() * 0.5;
      if (open(x, z, 0.2)) long.push(level(x, z, tall, tall * (0.8 + crandom() * 0.4)));
    }
  }
  // The flowers are the tower top's (meadow.ts plants them): where a tuft
  // would have flowered (one in three), and a few small clumps of their own
  // out in the open lawn.
  blooms.forEach((bloom, k) => { if (k % 3 === 0) gardenFlowers.push(new THREE.Vector3().setFromMatrixPosition(bloom)); });
  for (let clumps = 0, tries = 0; clumps < 55 && tries < 20000; tries++) {
    const [cx, cz] = somewhere();
    if (!open(cx, cz, 0.4)) continue;
    clumps++;
    const count = 3 + Math.floor(crandom() * 8), radius = 0.2 + Math.sqrt(count) * 0.1;
    for (let k = 0; k < count; k++) {
      const b = crandom() * Math.PI * 2, r = radius * crandom() ** 0.8, x = cx + Math.cos(b) * r, z = cz + Math.sin(b) * r;
      if (open(x, z, 0.1)) gardenFlowers.push(new THREE.Vector3(x, 0, z));
    }
  }
  // The start tower's top is a meadow of its own (meadow.ts).
  {
    const DARKER = new THREE.Color(0.85, 0.85, 0.85), COOLER = new THREE.Color(0.8, 0.92, 0.92), SAME = new THREE.Color(1, 1, 1);
    // The lawn's green, in the same drifts as the ground under it (drift.ts).
    // Normals straight up in the world, whatever way an instance is turned.
    const upright = (material: THREE.MeshStandardMaterial) => {
      const paint = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        paint.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));');
      };
      const key = material.customProgramCacheKey.bind(material);
      material.customProgramCacheKey = () => key() + 'upright';
      return material;
    };
    const grassy = (map: THREE.Texture) => drifting(swaying(bothSidesAlike(painted(palette.grass, { map, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })), SWAY.grass), DRIFTS.lawn);
    for (const [placed, material, shape] of [
      [sward, grassy(swardTexture(71)), tuftGeometry(true)],
      [tufts, grassy(tuftTexture(61, false)), tuftGeometry()],
      [long, grassy(tuftTexture(63, false)), tuftGeometry()],
      [clover, grassy(cloverTexture(69)), cloverGeometry()],
      [drape, upright(grassy(swardTexture(71))), tuftGeometry(true)],
    ] as const) {
      const mesh = new THREE.InstancedMesh(shape, material, placed.length);
      placed.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix);
        // The colour is the ground's; the long grass a little darker, the
        // clover cooler and deeper.
        mesh.setColorAt(i, placed === long ? DARKER : placed === clover ? COOLER : SAME);
      });
      mesh.receiveShadow = true;
      // Too low and too fine to tell in the water's blurred reflection.
      mesh.userData.unreflected = true;
      // Drawn after the robot's flat shadow, and left out where it lies, so
      // the shadow is one clean shape on the lawn (robot.ts).
      mesh.renderOrder = DRAWN.grass;
      Object.assign(material, { stencilWrite: true, stencilWriteMask: 0, stencilRef: SHADOW_STENCIL, stencilFunc: THREE.NotEqualStencilFunc });
      scene.add(mesh);
    }
  }

  // The flowering vine spilling over the garden's north lip, either side of
  // the causeway, and over the start tower's rim either side of its stair.
  // (The broken fence's are in stones.ts, moving with its bays.)
  const run = (n: number, point: (t: number) => [THREE.Vector3, THREE.Vector3]) => {
    const points = Array.from({ length: n + 1 }, (_, i) => point(i / n));
    return [points.map(([p]) => p), points.map(([, o]) => o)] as const;
  };
  const north = (x0: number, x1: number) => run(8, t => {
    const x = x0 + (x1 - x0) * t, z = northEdge(x);
    return [new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0, z - 250.7).normalize()];
  });
  const rim = (a0: number, a1: number) => run(8, t => {
    const a = a0 + (a1 - a0) * t;
    return [new THREE.Vector3(Math.cos(a) * PLATFORM.r, PLATFORM_TOP, PLATFORM.z + Math.sin(a) * PLATFORM.r), new THREE.Vector3(Math.cos(a), 0, Math.sin(a))];
  });
  ([[north(-31, -24.5), 2.6], [north(21, 27.5), 2.2], [rim(Math.PI / 2 + 0.45, Math.PI / 2 + 0.95), 3.4], [rim(0.66, 1.16), 2.8]] as const)
    .forEach(([[lip, out], reach], i) => scene.add(vineSpill([...lip], [...out], reach, i + 1)));
  giantTree(scene);
  instanced(shrubGeometry(19), leafCards(SHRUB, clusterTexture(29), SWAY.shrub), shrubs, scene);
  instanced(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.7, 1).translate(0, 0.1, 0), painted(CORE), shrubs, scene);
  return { shrubs: shrubs.length, cypresses: cypresses.length, trees: crowns.length, tufts: tufts.length + sward.length, flowers: gardenFlowers.length };
}
