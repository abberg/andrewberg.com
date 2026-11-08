import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { inkUniforms, paint } from './look';

// The robot model (blender/robot.py builds it and exports public/robot.glb):
// about 4 m tall, feet at the origin, facing −z, every part rigid on one bone.
// Its clips are in place, and this plays them to match what the controller
// does.

// Metres covered in one walk and one run cycle, as robot.py makes them. Played
// at the speed the robot actually covers ground, the feet don't slide.
const STRIDE = { walk: 2.64, run: 1.95 };
// The bones the push takes over, the rest stay on the walk.
const UPPER = /^(spine|head|upperarm|forearm|hand)/;
// Seconds to fade a clip in or out.
const FADE = 0.25;

export type RobotState = {
  // How fast the feet are covering ground, m/s, and the walk and run speeds.
  speed: number;
  walk: number;
  run: number;
  // How fast it's turning, radians a second.
  turning: number;
  pushing: boolean;
  // How far through a step-over, 0 to 1, or null.
  stepping: number | null;
};

// An ink outline: the mesh again, drawn from behind and pushed out along its
// normals by a set fraction of its distance, so the line keeps one width on
// screen however near or far. The normals are averaged where the robot's
// flat faces meet, so the line doesn't split at the corners.
const INK = new THREE.Color(0x2b2220), WIDTH = 0.002;
// Multiplies the paint in shade (its material's colour is white).
const ROBOT_SHADE = 0xa7bce4;
function outlined(mesh: THREE.SkinnedMesh) {
  const geometry = mesh.geometry, position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>(), key = (i: number) =>
    `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
  for (let i = 0; i < position.count; i++) {
    const sum = sums.get(key(i)) ?? sums.set(key(i), new THREE.Vector3()).get(key(i))!;
    sum.x += normal.getX(i); sum.y += normal.getY(i); sum.z += normal.getZ(i);
  }
  const smooth = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) sums.get(key(i))!.clone().normalize().toArray(smooth, i * 3);
  geometry.setAttribute('outlineNormal', new THREE.BufferAttribute(smooth, 3));
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.uWidth = { value: WIDTH };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 outlineNormal;\nuniform float uWidth;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = outlineNormal;')
      .replace('#include <project_vertex>', /* glsl */`vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        // (Not transformedNormal: drawn from behind, that's turned inwards.)
        mvPosition.xyz += normalize(normalMatrix * objectNormal) * uWidth * -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const outline = new THREE.SkinnedMesh(geometry, material);
  outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.position.copy(mesh.position);
  outline.quaternion.copy(mesh.quaternion);
  outline.scale.copy(mesh.scale);
  outline.frustumCulled = false;
  outline.renderOrder = DRAWN.robot;
  return outline;
}

// Its shadow, flat and hard edged as a cel-animated character's: the mesh
// again, skinned with it, every point slid along the sun's direction down
// onto the ground under the robot (shadow.ground), and filled solid in the
// outline's ink. Drawn in its own turn: after the ground, before the lawn's
// grass, which leaves out what it covers (by the stencil, foliage.ts), and
// before the robot, so the robot always stands on top of it. Lifted 8 cm,
// clear of the paving laid on the lawn (4 cm deep, with no collider of its
// own, so the ground under the robot is the lawn's), and offset in depth so
// it doesn't flicker in the ground it lies on.
// The order it's all drawn in, and the stencil value the shadow leaves.
export const DRAWN = { shadow: 1, grass: 2, robot: 3 }, SHADOW_STENCIL = 1;
export const shadow = { sun: new THREE.Vector3(0, 1, 0), ground: 0 };
// Its own light, turned from the sun's: round (degrees, east of north) and
// up, so it can fall at a different angle from the rest of the shadows:
// by default higher, so it gathers close round the robot's feet,
// as a cel-animated character's does, and turned a little from the sun.
// And slid back a little towards its heels (m), so a sliver shows under
// them, an ink line where the feet meet the ground.
// And whether it falls across whatever is there, steps and rims and stones
// (inkShadow), or flat on the ground under the robot (shadowed).
export const shadowAngle = { turn: 15, height: 22, back: 0.12, across: true };
export function aimShadow(sun: THREE.DirectionalLight) {
  const towards = shadow.sun.subVectors(sun.position, sun.target.position).normalize();
  const height = THREE.MathUtils.clamp(Math.asin(towards.y) + THREE.MathUtils.degToRad(shadowAngle.height), 0.15, Math.PI / 2 - 0.01);
  const round = Math.atan2(towards.x, -towards.z) + THREE.MathUtils.degToRad(shadowAngle.turn);
  towards.set(Math.sin(round) * Math.cos(height), Math.sin(height), -Math.cos(round) * Math.cos(height));
}
// The robot's shadow falling across whatever is there: the robot alone
// drawn from the shadow's own light into a depth map, 10 m square round it,
// about a centimetre to a texel, which everything painted then looks itself
// up in (look.ts) and turns to ink where the robot is nearer the light.
// Slid back towards the heels by looking up a little ahead of each point.
const INK_LAYER = 1, INK_SIZE = 5, INK_FAR = 40;
const inkTarget = new THREE.WebGLRenderTarget(1024, 1024, { depthTexture: new THREE.DepthTexture(1024, 1024) });
const inkCamera = new THREE.OrthographicCamera(-INK_SIZE, INK_SIZE, INK_SIZE, -INK_SIZE, 0.1, INK_FAR);
inkCamera.layers.set(INK_LAYER);
inkUniforms.uInkDepth.value = inkTarget.depthTexture;
inkUniforms.uInk.value.copy(INK);
const centre = new THREE.Vector3();
const flat: THREE.Material[] = [];
export function inkShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene, robot: THREE.Object3D) {
  inkUniforms.uInkOn.value = shadowAngle.across ? 1 : 0;
  for (const material of flat) material.visible = !shadowAngle.across;
  if (!shadowAngle.across) return;
  robot.updateMatrixWorld();
  centre.setFromMatrixPosition(robot.matrixWorld).y += 2;
  inkCamera.position.copy(centre).addScaledVector(shadow.sun, INK_FAR / 2);
  inkCamera.lookAt(centre);
  inkCamera.updateMatrixWorld();
  inkUniforms.uInkMatrix.value.multiplyMatrices(inkCamera.projectionMatrix, inkCamera.matrixWorldInverse);
  // Forward is -z on the model.
  inkUniforms.uInkShift.value.set(0, 0, -1).transformDirection(robot.matrixWorld).setY(0).normalize().multiplyScalar(shadowAngle.back);
  const shadows = renderer.shadowMap.autoUpdate, before = renderer.getRenderTarget();
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(inkTarget);
  renderer.clear();
  renderer.render(scene, inkCamera);
  renderer.setRenderTarget(before);
  renderer.shadowMap.autoUpdate = shadows;
}

function shadowed(mesh: THREE.SkinnedMesh) {
  const material = new THREE.MeshBasicMaterial({
    // Fogged like the outline, so the two stay the same.
    color: INK,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
    stencilWrite: true,
    stencilRef: SHADOW_STENCIL,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uSun = { value: shadow.sun };
    shader.uniforms.uGround = { get value() { return shadow.ground; } };
    shader.uniforms.uBack = { get value() { return shadowAngle.back; } };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSun;\nuniform float uGround, uBack;')
      .replace('#include <project_vertex>', /* glsl */`vec4 world = modelMatrix * vec4(transformed, 1.0);
        world.xyz -= uSun * max(world.y - uGround, 0.0) / max(uSun.y, 0.05);
        world.y = uGround + 0.08;
        // Back is +z on the model, which faces -z.
        vec3 back = (modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
        world.xz += normalize(back.xz) * uBack;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  flat.push(material);
  const cast = new THREE.SkinnedMesh(mesh.geometry, material);
  cast.bind(mesh.skeleton, mesh.bindMatrix);
  cast.position.copy(mesh.position);
  cast.quaternion.copy(mesh.quaternion);
  cast.scale.copy(mesh.scale);
  cast.frustumCulled = false;
  cast.renderOrder = DRAWN.shadow;
  // Not in the water's reflection.
  cast.userData.unreflected = true;
  return cast;
}

export function createRobot(gltf: GLTF) {
  const object = gltf.scene;
  const skinned: THREE.SkinnedMesh[] = [];
  object.traverse(child => {
    if (!(child as THREE.Mesh).isMesh) return;
    // Its own flat shadow (shadowed) instead of the sun's soft one; still
    // shaded by the trees and columns when it walks under them.
    child.receiveShadow = true;
    // Cel shaded in two flat steps, lit and shade, with no shine.
    const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
    material.metalness = 0;
    material.roughness = 1;
    // Its shade is a darker, less blue one than the garden's (Andrew's film
    // still): deep grey-green under the olive.
    paint(material, ROBOT_SHADE);
    material.defines = { ...material.defines, CEL: '' };
    // The arms reach well outside the bind pose's bounds.
    child.frustumCulled = false;
    child.renderOrder = DRAWN.robot;
    // Seen by the ink shadow's light (inkShadow).
    child.layers.enable(INK_LAYER);
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(child as THREE.SkinnedMesh);
  });
  for (const mesh of skinned) mesh.parent!.add(outlined(mesh), shadowed(mesh));
  const mixer = new THREE.AnimationMixer(object);
  const clip = (name: string) => gltf.animations.find(c => c.name === name)!;
  // A clip split into the legs and hips, and the upper body, so the push can
  // take over the arms while the legs keep walking.
  const half = (name: string, upper: boolean) => {
    const whole = clip(name);
    const tracks = whole.tracks.filter(track => UPPER.test(track.name) === upper);
    return mixer.clipAction(new THREE.AnimationClip(`${name}.${upper ? 'upper' : 'lower'}`, whole.duration, tracks));
  };
  const loops = ['idle', 'walk', 'run', 'turn'] as const;
  const lower = Object.fromEntries(loops.map(name => [name, half(name, false)])) as Record<typeof loops[number], THREE.AnimationAction>;
  const upper = Object.fromEntries(loops.map(name => [name, half(name, true)])) as Record<typeof loops[number], THREE.AnimationAction>;
  const push = mixer.clipAction(clip('push'));
  const stepOver = mixer.clipAction(clip('stepOver'));
  for (const action of [...Object.values(lower), ...Object.values(upper), push, stepOver]) action.play().setEffectiveWeight(0);
  // The walk and run are posed by hand from how far it's gone, and the
  // step-over from how far through it the controller is, not by the clock.
  for (const name of ['walk', 'run'] as const) lower[name].timeScale = upper[name].timeScale = 0;
  stepOver.timeScale = 0;

  // Weights, eased towards their targets.
  const weight = { idle: 1, walk: 0, run: 0, turn: 0, push: 0, step: 0 };
  let phase = 0;
  const ease = (from: number, to: number, dt: number) => from + THREE.MathUtils.clamp(to - from, -dt / FADE, dt / FADE);

  return {
    object,
    update(dt: number, state: RobotState) {
      const { speed, walk, run } = state;
      // Walk up to walking pace, then into the run; turning on the spot when
      // it's standing still and turning.
      const moving = THREE.MathUtils.clamp(speed / walk, 0, 1);
      const running = THREE.MathUtils.clamp((speed - walk) / (run - walk), 0, 1);
      const spinning = (1 - moving) * THREE.MathUtils.clamp((Math.abs(state.turning) - 0.15) / 0.3, 0, 1);
      weight.walk = moving * (1 - running);
      weight.run = moving * running;
      weight.turn = ease(weight.turn, spinning, dt);
      weight.idle = Math.max(0, 1 - moving - weight.turn);
      weight.push = ease(weight.push, state.pushing ? 1 : 0, dt);
      weight.step = state.stepping === null ? ease(weight.step, 0, dt) : 1;

      // One phase drives both the walk and the run, at a stride between theirs.
      phase = (phase + speed * dt / THREE.MathUtils.lerp(STRIDE.walk, STRIDE.run, running)) % 1;
      for (const name of ['walk', 'run'] as const) lower[name].time = upper[name].time = phase * lower[name].getClip().duration;
      // Just short of the end, which would wrap round to the start.
      if (state.stepping !== null) stepOver.time = Math.min(state.stepping, 0.999) * stepOver.getClip().duration;

      const free = 1 - weight.step;
      for (const name of loops) {
        lower[name].setEffectiveWeight(weight[name] * free);
        upper[name].setEffectiveWeight(weight[name] * free * (1 - weight.push));
      }
      push.setEffectiveWeight(weight.push * free);
      stepOver.setEffectiveWeight(weight.step);
      mixer.update(dt);
    },
  };
}
export type Robot = ReturnType<typeof createRobot>;
