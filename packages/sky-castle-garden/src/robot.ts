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
  // The height of the ground under (x, z), looking down from y as far as
  // depth, or null: the steps themselves (feet), or the ramps over them
  // that the robot really moves on (body).
  ground: (x: number, y: number, z: number, depth: number, under: 'feet' | 'body') => number | null;
  // Reaching for something with one hand (fruit.ts), or null.
  reaching?: Reach | null;
};
// A reach: which arm (0 left, 1 right), the point in the world its hand
// goes to, how far there it has got (0 to 1), and how far it stoops for
// it, 0 to 1: bending its knees and bowing from the waist, for what lies
// on the ground.
export type Reach = { arm: 0 | 1; goal: THREE.Vector3; share: number; stoop: number };
// The stoop at its deepest: how far the hips come down (m) and the body
// bows (radians). And how far beyond the hand's bone its grip is (m).
export const STOOP = { hips: 0.5, bow: 1.15 }, GRIP = 0.28;

// Feet and hands on uneven ground. The clips are all made on the flat, but
// on stairs (and rims and plinths) each foot, and each hand in the run,
// looks down for the ground under it, a little ahead of it while it swings
// so it lifts in time to clear the next riser, and its limb is bent and
// turned to set it down there. The hips drop to let the limb on the
// lowest step reach it, and in the run the body tips up or down with the
// stair, like an animal climbing.
const FEET = { ahead: 0.5, toe: 0.25, settle: 0.05, hips: 0.08, lowest: -0.8, slope: 0.15, tip: 0.9, lean: 0.2 };
const X_AXIS = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);
type Limb = {
  root: THREE.Object3D; bends: THREE.Object3D[]; end: THREE.Object3D; foot: boolean;
  // Which way it bends when it's straight, its end's lowest height above
  // the robot's feet in the clips (planted), how far above that it is now
  // in the clip, and how far the ground under it is above the robot's feet.
  knee: number; base: number; lift: number; offset: number;
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

  // The limbs that stand on things.
  const bone = (name: string) => object.getObjectByName(name)!;
  const hips = bone('hips'), spine = bone('spine');
  const limbs: Limb[] = [];
  for (const side of ['L', 'R']) {
    limbs.push({ root: bone(`leg1${side}`), bends: [2, 3, 4, 5].map(k => bone(`leg${k}${side}`)), end: bone(`foot${side}`), foot: true, knee: 1, base: 0, lift: 0, offset: 0 });
  }
  for (const side of ['L', 'R']) {
    limbs.push({ root: bone(`upperarm${side}`), bends: ['upperarm2', 'upperarm3', 'forearm', 'forearm2', 'forearm3', 'forearm4'].map(k => bone(`${k}${side}`)),
      end: bone(`hand${side}`), foot: false, knee: 1, base: 0, lift: 0, offset: 0 });
  }
  // Everything stand() moves, and how the clips left it: the mixer only
  // writes a bone again when its clips give it a new pose, so it's put
  // back before each frame's clips, or the changes would pile up.
  const moved = [hips, spine, ...limbs.flatMap(limb => [limb.root, ...limb.bends, limb.end])];
  const posed = moved.map(b => ({ position: b.position.clone(), quaternion: b.quaternion.clone() }));
  const unpose = () => moved.forEach((b, i) => { b.position.copy(posed[i].position); b.quaternion.copy(posed[i].quaternion); });
  const keep = () => moved.forEach((b, i) => { posed[i].position.copy(b.position); posed[i].quaternion.copy(b.quaternion); });
  const angle = (b: THREE.Object3D) => 2 * Math.atan2(b.quaternion.x, b.quaternion.w);
  const bend = (limb: Limb) => limb.bends.reduce((sum, b) => sum + angle(b), 0);
  // Measured from the clips: where each end comes lowest (feet in the walk
  // and run, hands in the run), and which way each limb bends.
  {
    const at = new THREE.Vector3(), sums = limbs.map(() => 0);
    limbs.forEach(limb => { limb.base = Infinity; });
    for (const name of ['walk', 'run'] as const) {
      for (const n of loops) { lower[n].setEffectiveWeight(n === name ? 1 : 0); upper[n].setEffectiveWeight(n === name ? 1 : 0); }
      for (let k = 0; k < 24; k++) {
        lower[name].time = upper[name].time = k / 24 * lower[name].getClip().duration;
        mixer.update(0);
        object.updateMatrixWorld(true);
        limbs.forEach((limb, i) => {
          if (limb.foot || name === 'run') limb.base = Math.min(limb.base, limb.end.getWorldPosition(at).y - object.getWorldPosition(new THREE.Vector3()).y);
          if (limb.foot ? name === 'walk' : name === 'run') sums[i] += bend(limb);
        });
      }
      lower[name].time = upper[name].time = 0;
    }
    for (const n of loops) { lower[n].setEffectiveWeight(n === 'idle' ? 1 : 0); upper[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
    limbs.forEach((limb, i) => { limb.knee = Math.sign(sums[i]) || 1; });
  }

  const root = new THREE.Vector3(), end = new THREE.Vector3(), probe = new THREE.Vector3(), target = new THREE.Vector3();
  const forward = new THREE.Vector3(), side = new THREE.Vector3(), turn = new THREE.Quaternion(), parent = new THREE.Quaternion();
  const own = new THREE.Quaternion(), twist = new THREE.Quaternion(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const footTurn = [new THREE.Quaternion(), new THREE.Quaternion()];
  const saved: THREE.Quaternion[] = Array.from({ length: 6 }, () => new THREE.Quaternion());
  let drop = 0, slope = 0;
  // Turn a bone (by a world-space rotation, about its own origin).
  const rotate = (b: THREE.Object3D, by: THREE.Quaternion) => {
    b.parent!.getWorldQuaternion(parent);
    b.getWorldQuaternion(own);
    b.quaternion.copy(parent.invert().multiply(by).multiply(own));
    b.updateWorldMatrix(false, true);
  };
  // Bend a limb more or less, as a share of the bend the clip gives it (a
  // little more, so a straight one still bends), until it reaches as far as
  // the target, then swing it from its root to point there.
  const reach = (limb: Limb, goal: THREE.Vector3) => {
    limb.root.getWorldPosition(root);
    const want = goal.distanceTo(root);
    const angles = limb.bends.map(angle), total = angles.reduce((a, b) => a + b, 0);
    const knee = Math.abs(total) > 0.05 ? Math.sign(total) : limb.knee;
    limb.bends.forEach((b, j) => saved[j].copy(b.quaternion));
    const apply = (k: number) => {
      limb.bends.forEach((b, j) => b.quaternion.copy(saved[j]).multiply(twist.setFromAxisAngle(X_AXIS, k * (angles[j] + knee * 0.03))));
      limb.root.updateWorldMatrix(false, true);
      return limb.end.getWorldPosition(end).distanceTo(root);
    };
    let k = 0, reached = apply(0);
    for (let i = 0; i < 4 && Math.abs(reached - want) > 0.003; i++) {
      const slope = (apply(k + 0.01) - reached) / 0.01;
      if (Math.abs(slope) < 1e-4) { apply(k); break; }
      k = THREE.MathUtils.clamp(k + (want - reached) / slope, -0.9, 3);
      reached = apply(k);
    }
    from.subVectors(limb.end.getWorldPosition(end), root).normalize();
    to.subVectors(goal, root).normalize();
    rotate(limb.root, turn.setFromUnitVectors(from, to));
  };
  // The highest ground under a point and, while it swings, a little ahead.
  const groundUnder = (state: RobotState, at: THREE.Vector3, base: number, ahead: number[]) => {
    let top: number | null = null;
    for (const d of ahead) {
      probe.copy(at).addScaledVector(forward, d);
      const h = state.ground(probe.x, base + 2, probe.z, 3.5, 'feet');
      if (h !== null && (top === null || h > top)) top = h;
    }
    return top;
  };
  const stand = (state: RobotState, dt: number) => {
    const feet = weight.step > 0.99 ? 0 : 1 - weight.step, hands = weight.run * feet * (1 - weight.push);
    object.updateWorldMatrix(true, true);
    const y = object.getWorldPosition(probe).y, at = probe.clone();
    forward.set(0, 0, -1).transformDirection(object.matrixWorld).setY(0).normalize();
    // How steep the ground is, along the way it's facing.
    const behind = state.ground(at.x - forward.x * 1.2, y + 2, at.z - forward.z * 1.2, 4, 'body');
    const before = state.ground(at.x + forward.x * 1.2, y + 2, at.z + forward.z * 1.2, 4, 'body');
    const rise = behind !== null && before !== null ? THREE.MathUtils.clamp((before - behind) / 2.4, -1, 1) : 0;
    slope += (rise - slope) * (1 - Math.exp(-dt / FEET.slope));
    // Where each limb's end is in the clip and the ground under it.
    limbs.forEach((limb, i) => {
      limb.end.getWorldPosition(end);
      limb.lift = Math.max(0, end.y - y - limb.base);
      const swinging = limb.lift > 0.03;
      const top = groundUnder(state, end, y, limb.foot ? (swinging ? [0, FEET.toe, FEET.ahead] : [0, FEET.toe]) : (swinging ? [0, FEET.ahead] : [0]));
      const offset = top === null ? 0 : THREE.MathUtils.clamp(top - y, -1.4, 0.9);
      limb.offset += (offset - limb.offset) * (1 - Math.exp(-dt / FEET.settle));
      if (limb.foot) limb.end.getWorldQuaternion(footTurn[i]);
    });
    if (feet <= 0) return;
    // Tip the body with the stair: right up with it in the run, and leaning
    // a little into the climb at a walk.
    const tip = Math.atan(slope) * (weight.run * FEET.tip - (1 - weight.run) * FEET.lean * (slope > 0 ? 1 : 0)) * feet;
    if (Math.abs(tip) > 1e-4) rotate(hips, turn.setFromAxisAngle(side.crossVectors(forward, UP).normalize(), tip));
    // Drop the hips as far as the limb that has furthest to reach needs,
    // or as far as it's stooping.
    let need = -STOOP.hips * (state.reaching?.stoop ?? 0);
    limbs.forEach(limb => {
      const share = limb.foot ? feet : hands;
      if (share <= 0) return;
      const want = y + limb.offset + limb.lift + limb.base;
      need = Math.min(need, share * (want - limb.end.getWorldPosition(end).y));
    });
    drop += (Math.max(FEET.lowest, need) - drop) * (1 - Math.exp(-dt / FEET.hips));
    hips.getWorldPosition(target).y += drop;
    hips.position.copy(hips.parent!.worldToLocal(target));
    hips.updateWorldMatrix(false, true);
    // And set each one down where it stands.
    limbs.forEach((limb, i) => {
      const share = limb.foot ? feet : hands;
      if (share <= 0.01) return;
      limb.end.getWorldPosition(target);
      target.y += share * (y + limb.offset + limb.lift + limb.base - target.y);
      reach(limb, target);
      // Feet flat on the step, as they were in the clip.
      if (limb.foot) {
        limb.end.parent!.getWorldQuaternion(parent);
        limb.end.quaternion.copy(parent.invert().multiply(footTurn[i]));
        limb.end.updateWorldMatrix(false, true);
      }
    });
  };

  // An arm reaching out for something (fruit.ts): the body bowed from the
  // waist if it's stooping, then the arm curled evenly at every joint until
  // it's as long as the reach, and swung from the shoulder to point there.
  // The goal is where its grip goes, a little beyond the hand's bone.
  const goal = new THREE.Vector3(), curl: THREE.Quaternion[] = Array.from({ length: 6 }, () => new THREE.Quaternion());
  const reachOut = ({ arm, goal: grip, share, stoop }: Reach) => {
    if (stoop > 0) rotate(spine, turn.setFromAxisAngle(side.crossVectors(forward, UP).normalize(), -STOOP.bow * stoop));
    if (share <= 0) return;
    const limb = limbs[2 + arm];
    limb.root.getWorldPosition(root);
    goal.copy(grip).addScaledVector(to.subVectors(grip, root).normalize(), -GRIP);
    limb.end.getWorldPosition(target).lerp(goal, share);
    const want = target.distanceTo(root);
    limb.bends.forEach((b, j) => curl[j].copy(b.quaternion));
    const apply = (by: number) => {
      limb.bends.forEach((b, j) => b.quaternion.copy(curl[j]).multiply(twist.setFromAxisAngle(X_AXIS, limb.knee * by)));
      limb.root.updateWorldMatrix(false, true);
      return limb.end.getWorldPosition(end).distanceTo(root);
    };
    // Straighter or more curled, by halves.
    let low = -0.15, high = 1.1;
    for (let i = 0; i < 12; i++) {
      const middle = (low + high) / 2;
      if (apply(middle) > want) low = middle; else high = middle;
    }
    apply((low + high) / 2);
    from.subVectors(limb.end.getWorldPosition(end), root).normalize();
    to.subVectors(target, root).normalize();
    rotate(limb.root, turn.setFromUnitVectors(from, to));
  };

  return {
    object,
    // Where an arm's shoulder is, and its hand's grip, in the world.
    shoulder(arm: 0 | 1, out: THREE.Vector3) { return limbs[2 + arm].root.getWorldPosition(out); },
    grip(arm: 0 | 1, out: THREE.Vector3) {
      const hand = limbs[2 + arm].end;
      hand.updateWorldMatrix(true, false);
      return out.set(0, GRIP, 0).applyMatrix4(hand.matrixWorld);
    },
    // The body above the waist, for what it carries on its shoulders.
    get spine() { spine.updateWorldMatrix(true, false); return spine.matrixWorld; },
    // Where each foot is, and whether it's down.
    foot(k: 0 | 1, out: THREE.Vector3) { limbs[k].end.getWorldPosition(out); return limbs[k].lift < 0.04; },
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
      unpose();
      mixer.update(dt);
      keep();
      stand(state, dt);
      if (state.reaching) reachOut(state.reaching);
    },
    // How far each foot is lifted in the clip, before it's set on the
    // ground (footsteps.ts).
    get lifts() { return [limbs[0].lift, limbs[1].lift]; },
  };
}
export type Robot = ReturnType<typeof createRobot>;
