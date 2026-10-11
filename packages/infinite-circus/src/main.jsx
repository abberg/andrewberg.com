import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Cloud, Clouds, Environment, Trail } from '@react-three/drei';
import { Bloom, EffectComposer, LensFlare } from '@react-three/postprocessing';
import {
  AnimationClip, AnimationMixer, Box3, EquirectangularReflectionMapping, FloatType, Group, LoopOnce, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NumberKeyframeTrack, SRGBColorSpace, TextureLoader, Vector3,
} from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { RadialBlurEffect } from './blur.js';
import { createEngineGlow } from './effects.js';
import { createMissileSwarm } from './missiles.js';

const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');

// Built directly rather than as JSX so the Mesh constructor sets up the morph targets for the geometry.
// Normal maps were generated from the skins with DeepBump.
function md2Mesh(geometry, skin, normalMap) {
  skin.colorSpace = SRGBColorSpace;
  return new Mesh(geometry, new MeshStandardMaterial({ map: skin, normalMap, roughness: 0.6, flatShading: true }));
}

const JET_FRAME = 'jet1';

// Flight tuning, in world units and seconds.
const SPEED = 6;
const MAX_TURN = 1.4; // radians per second
const BOUNDS = 60; // steer back towards the origin beyond this radius
const ALTITUDE = [-6, 14];
const BANK = 1.1; // roll per unit of turn rate
const TURN_EASE = 2.6; // how quickly turns and banks settle
// A full barrel roll, in the direction of the new bank, whenever the jet switches from a right turn to a left one.
const ROLL = { duration: 1.1, minTurn: 0.3 };
// The camera aims above the jet (aim) so the horizon sits low and the clouds fill the frame.
const CHASE = { up: 0.4, ahead: 3, aim: 1.5, follow: 3 };

// Boost: the jet surges forward, the engines flare, the camera drops back and widens, and the frame
// streaks with radial motion blur. It fires on its own every so often, and while Space or a pointer is held.
const BOOST = {
  speed: 2.6, // speed multiplier at full boost
  fov: [55, 74],
  back: [3.8, 10], // chase distance, on top of the lag from the extra speed
  blur: 0.04,
  shake: 0.025,
  attack: 2.5, // easing rates in and out of boost
  release: 0.9,
  every: [5, 11], // seconds between automatic boosts
  lasting: [1.8, 3.2],
};
// Shared boost level, 0 to 1, read by the engine glow and the blur, and where the jet is this frame.
const boost = { value: 0, held: false, auto: false, timer: 3 };
const jetPosition = new Vector3();
const jetVelocity = new Vector3();
const between = ([min, max]) => min + Math.random() * (max - min);
const mix = ([a, b], t) => a + (b - a) * t;

// Effect anchors on the jet pose, in model units relative to its centre (+X is the nose, Z is the span).
const NOZZLES = [new Vector3(-30.5, -4.3, -6.4), new Vector3(-30.5, -4.3, 6.4)];
const WINGTIPS = [new Vector3(-16.3, -1, -27.2), new Vector3(-16.3, -1, 27.2)];

// drei's Trail tapers to nothing at the tail; its length is in frames, so it shortens on high-refresh displays.
const TRAIL = { width: 0.15, length: 3, color: '#e8f1ff' };

// Transformation cycle: jet, transform up to the robot, a few seconds standing with the gun, then
// transform back down. It happens on its own every so often, and when T is pressed.
const TRANSFORM = {
  every: [15, 25], // seconds in jet mode between transformations
  robotFor: [4, 6], // seconds in robot mode
  fps: 10,
  crossfade: 0.15,
  robotSpeed: 0.35, // flight speed multiplier while a robot
  faceCameraChance: 0.5, // how often the robot turns round to face the camera
  chestHeight: 0.72, // robot pivot, as a fraction of his height
};

// The robot hangs from his chest like a pendulum: his legs trail behind his motion and swing out in
// turns, on a damped spring so they overshoot and settle when speed or direction changes.
const SWING = {
  lean: 0.6, // radians of trailing lean at full jet speed
  bank: 0.6, // radians of outward swing per unit of turn rate at full jet speed
  inertia: 0.25, // extra swing per unit of acceleration, relative to jet speed (legs lag, then overshoot)
  stiffness: 14,
  damping: 3.5,
};
// What the flight is doing this frame, for the swing.
const motion = { speed: 0, turn: 0 };
// Shared with the flight: robot eases 0 (jet) to 1 (robot) through the transforms.
const transform = { phase: 'jet', timer: between(TRANSFORM.every), robot: 0, request: false, faceCamera: false, facing: 0 };

// Each phase of the cycle, in order, with the frames it plays. Named animations come from the model;
// `frames` builds a clip from specific frames. The attack's frames 1-4 aim and fire with a little recoil
// and 5-8 lower the gun back to rest, so the gun is raised once, fires on a loop, then lowered, rather
// than looping all 8 frames and snapping it back up each time.
const PHASES = {
  jet: { body: { hold: JET_FRAME }, next: 'up' },
  up: { body: { animation: 'transformup' }, once: true, next: 'raise' },
  raise: { frames: ['attack8', 'attack7', 'attack6', 'attack5', 'attack4'], once: true, gun: true, next: 'robot' },
  robot: { frames: ['attack1', 'attack2', 'attack3', 'attack4'], gun: true, next: 'lower' },
  lower: { frames: ['attack5', 'attack6', 'attack7', 'attack8'], once: true, gun: true, next: 'down' },
  down: { body: { animation: 'transformdn' }, once: true, next: 'jet' },
};
const ROBOT_PHASES = new Set(['up', 'raise', 'robot', 'lower']);

function phaseClip(geometry, name, phase) {
  const targets = geometry.morphAttributes.position;
  const frames = phase.frames ?? (phase.body.animation ? targets.filter(target => target.name.replace(/\d+$/, '') === phase.body.animation).map(target => target.name) : null);
  if (phase.body?.hold) {
    if (!targets.some(target => target.name === phase.body.hold)) return null;
    return new AnimationClip(name, 1, [new NumberKeyframeTrack(`.morphTargetInfluences[${phase.body.hold}]`, [0, 1], [1, 1])]);
  }
  const sequence = frames.map(frame => targets.find(target => target.name === frame));
  if (sequence.some(target => !target)) return null;
  // Play-once clips end on their last frame; looping clips wrap back to their first.
  return AnimationClip.CreateFromMorphTargetSequence(name, sequence, TRANSFORM.fps, Boolean(phase.once));
}

function Jetfire() {
  const [body, weapon] = useLoader(MD2Loader, ['jetfire/tris.md2', 'jetfire/weapon.md2']);
  const [skin, normals, weaponSkin, weaponNormals] = useLoader(TextureLoader, [
    'jetfire/vf1s_fokker.jpg', 'jetfire/vf1s_fokker_normal.jpg', 'jetfire/weapon.jpg', 'jetfire/weapon_normal.jpg',
  ]);

  const { model, centers, scale, glow, mixer, actions, gun } = useMemo(() => {
    const mesh = md2Mesh(body, skin, normals);
    const gun = md2Mesh(weapon, weaponSkin, weaponNormals);
    gun.visible = false;
    const model = new Group();
    model.add(mesh, gun);
    // Pivot on the jet's centre, or the robot's chest so his legs can swing below it, blending
    // between them while transforming.
    const boxOf = name => new Box3().setFromBufferAttribute(body.morphAttributes.position.find(target => target.name === name));
    const robotBox = boxOf('attack1');
    const chest = robotBox.getCenter(new Vector3());
    chest.y = robotBox.min.y + (robotBox.max.y - robotBox.min.y) * TRANSFORM.chestHeight;
    const centers = { jet: boxOf(JET_FRAME).getCenter(new Vector3()), robot: chest };
    const height = new Box3().setFromBufferAttribute(body.attributes.position).getSize(new Vector3()).y;

    const mixer = new AnimationMixer(model);
    const actionFor = (geometry, target, name, phase) => {
      const clip = phaseClip(geometry, name, phase);
      if (!clip) return null;
      const action = mixer.clipAction(clip, target);
      if (phase.once) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      return action;
    };
    const actions = Object.fromEntries(Object.entries(PHASES).map(([name, phase]) => [name, {
      body: actionFor(body, mesh, name, phase),
      gun: phase.gun ? actionFor(weapon, gun, name, phase) : null,
    }]));
    actions.jet.body.play();
    return { model, centers, scale: 2 / height, glow: createEngineGlow(NOZZLES), mixer, actions, gun };
  }, [body, weapon, skin, normals, weaponSkin, weaponNormals]);

  const turn = useRef();
  const hang = useRef();
  const swing = useMemo(() => ({ angle: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, lastSpeed: 0 }), []);

  useEffect(() => {
    const press = event => { if (event.code === 'KeyT') transform.request = true; };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, []);

  useEffect(() => {
    // Play-once phases move on when their clip finishes; the others wait for a timer or T.
    const finished = ({ action }) => {
      if (action === actions[transform.phase].body && PHASES[transform.phase].once) switchTo(PHASES[transform.phase].next);
    };
    const switchTo = phase => {
      const from = actions[transform.phase];
      const to = actions[phase];
      transform.phase = phase;
      for (const part of ['body', 'gun']) {
        if (!to[part]) { from[part]?.stop(); continue; }
        to[part].reset().play();
        if (from[part] && from[part] !== to[part]) to[part].crossFadeFrom(from[part], TRANSFORM.crossfade);
      }
      // The gun only has frames for the robot animations, not the transforms.
      gun.visible = Boolean(PHASES[phase].gun);
      if (phase === 'jet') transform.timer = between(TRANSFORM.every);
      if (phase === 'up') transform.faceCamera = Math.random() < TRANSFORM.faceCameraChance;
      if (phase === 'robot') transform.timer = between(TRANSFORM.robotFor);
    };
    mixer.addEventListener('finished', finished);
    transform.switchTo = switchTo;
    return () => mixer.removeEventListener('finished', finished);
  }, [mixer, actions, gun]);

  useFrame(({ clock }, rawDelta) => {
    const delta = thumbnailMode ? 0 : Math.min(rawDelta, 0.1);
    transform.timer -= delta;
    const due = transform.timer <= 0 || transform.request;
    transform.request = false;
    if (due && (transform.phase === 'jet' || transform.phase === 'robot')) transform.switchTo(PHASES[transform.phase].next);
    mixer.update(delta);

    const robotTarget = ROBOT_PHASES.has(transform.phase) ? 1 : 0;
    transform.robot += (robotTarget - transform.robot) * (1 - Math.exp(-delta * 3));
    model.position.lerpVectors(centers.jet, centers.robot, transform.robot).negate();
    // Sometimes the robot turns round to face the chase camera, turning back as it becomes a jet.
    const facingTarget = transform.faceCamera && ROBOT_PHASES.has(transform.phase) ? 1 : 0;
    transform.facing += (facingTarget - transform.facing) * (1 - Math.exp(-delta * 2.5));
    turn.current.rotation.y = -Math.PI / 2 + Math.PI * transform.facing;

    // Pendulum swing about the chest, only as a robot. Rotating about +X tips the head forward and the
    // legs back. Positive turns head left (+X here), so the legs swing out to the right with a negative
    // rotation about +Z.
    const speedFactor = motion.speed / SPEED;
    const acceleration = delta > 0 ? (motion.speed - swing.lastSpeed) / delta / SPEED : 0;
    swing.lastSpeed = motion.speed;
    const targets = {
      x: SWING.lean * speedFactor + SWING.inertia * acceleration,
      z: -SWING.bank * motion.turn * speedFactor,
    };
    for (const axis of ['x', 'z']) {
      const target = targets[axis] * transform.robot;
      swing.velocity[axis] += (SWING.stiffness * (target - swing.angle[axis]) - SWING.damping * swing.velocity[axis]) * delta;
      swing.angle[axis] += swing.velocity[axis] * delta;
    }
    hang.current.rotation.set(swing.angle.x, 0, swing.angle.z);
    // The engines are only lit in jet mode.
    glow.object.visible = transform.robot < 0.5;
    glow.update(clock.elapsedTime, boost.value);
  });
  useEffect(() => () => {
    mixer.stopAllAction();
    model.traverse(object => object.material?.dispose());
    glow.dispose();
  }, [model, mixer, glow]);

  return (
    <group scale={scale}>
      {/* Swings about the pivot in the direction of travel, whichever way the robot faces. */}
      <group ref={hang}>
      {/* MD2 models face +X; turn the nose to +Z, which is where Object3D.lookAt points. */}
      <group ref={turn} rotation-y={-Math.PI / 2}>
        <primitive object={model} />
        <primitive object={glow.object} />
        {WINGTIPS.map((tip, i) => (
          <Trail key={i} width={TRAIL.width} length={TRAIL.length} color={TRAIL.color} attenuation={t => t * t}>
            <object3D position={tip} />
          </Trail>
        ))}
      </group>
      </group>
    </group>
  );
}

// Wanders smoothly in a bounded volume, banks into turns, and drags the camera along behind.
function Flight({ children }) {
  const ref = useRef();
  const camera = useThree(state => state.camera);
  const state = useMemo(() => ({
    position: new Vector3(0, 4, 0),
    heading: 0,
    pitch: 0,
    turn: 0,
    turnTarget: 0,
    pitchTarget: 0,
    roll: 0,
    barrel: 0, // extra roll from a barrel roll in progress
    barrelTime: -1, // seconds into the barrel roll, or -1 when not rolling
    barrelSign: 1,
    retarget: 0,
    lookAt: new Vector3(),
  }), []);
  const scratch = useMemo(() => ({ forward: new Vector3(), desired: new Vector3(), look: new Vector3(), toOrigin: new Vector3() }), []);

  useEffect(() => {
    const press = event => { if (event.type !== 'keydown' || event.code === 'Space') boost.held = true; };
    const release = event => { if (event.type !== 'keyup' || event.code === 'Space') boost.held = false; };
    const events = [['keydown', press], ['keyup', release], ['pointerdown', press], ['pointerup', release], ['pointercancel', release]];
    for (const [name, handler] of events) window.addEventListener(name, handler);
    return () => { for (const [name, handler] of events) window.removeEventListener(name, handler); };
  }, []);

  // Runs before other frame callbacks so the trails sample this frame's wingtip positions.
  useFrame((_, rawDelta) => {
    const delta = thumbnailMode ? 0 : Math.min(rawDelta, 0.1);
    const { forward, desired, look, toOrigin } = scratch;

    // Pick a new random turn and climb every couple of seconds, easing between them.
    state.retarget -= delta;
    if (state.retarget <= 0) {
      state.retarget = 1.5 + Math.random() * 2.5;
      // Commit to proper turns: at least half the maximum rate, either way.
      const previous = state.turnTarget;
      state.turnTarget = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5) * MAX_TURN;
      // Positive turns head left from the chase camera's view. Roll the way the new bank leans.
      if (previous < -ROLL.minTurn && state.turnTarget > ROLL.minTurn && state.barrelTime < 0 && transform.phase === 'jet') {
        state.barrelTime = 0;
        state.barrelSign = -1;
      }
      state.pitchTarget = (Math.random() * 2 - 1) * 0.25;
    }
    // Head home when straying too far, and level out near the altitude limits.
    toOrigin.set(-state.position.x, 0, -state.position.z);
    if (toOrigin.length() > BOUNDS) {
      const homeHeading = Math.atan2(toOrigin.x, toOrigin.z);
      const error = Math.atan2(Math.sin(homeHeading - state.heading), Math.cos(homeHeading - state.heading));
      state.turnTarget = Math.sign(error) * MAX_TURN;
    }
    if (state.position.y > ALTITUDE[1]) state.pitchTarget = -0.2;
    if (state.position.y < ALTITUDE[0]) state.pitchTarget = 0.2;

    const ease = 1 - Math.exp(-delta * TURN_EASE);
    state.turn += (state.turnTarget - state.turn) * ease;
    state.pitch += (state.pitchTarget - state.pitch) * ease;
    state.heading += state.turn * delta;
    state.roll += (-state.turn * BANK - state.roll) * ease;
    if (state.barrelTime >= 0) {
      state.barrelTime += delta;
      const p = Math.min(state.barrelTime / ROLL.duration, 1);
      const eased = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      state.barrel = state.barrelSign * Math.PI * 2 * eased;
      if (p === 1) { state.barrelTime = -1; state.barrel = 0; }
    }

    // Automatic boosts switch on and off on a timer; holding the input boosts too.
    boost.timer -= delta;
    if (boost.timer <= 0) {
      boost.auto = !boost.auto;
      boost.timer = between(boost.auto ? BOOST.lasting : BOOST.every);
    }
    const boostTarget = (boost.auto || boost.held) && transform.phase === 'jet' ? 1 : 0;
    const boostRate = boostTarget > boost.value ? BOOST.attack : BOOST.release;
    boost.value += (boostTarget - boost.value) * (1 - Math.exp(-delta * boostRate));

    forward.set(Math.sin(state.heading) * Math.cos(state.pitch), Math.sin(state.pitch), Math.cos(state.heading) * Math.cos(state.pitch));
    const robotSlow = 1 + (TRANSFORM.robotSpeed - 1) * transform.robot;
    motion.speed = SPEED * (1 + (BOOST.speed - 1) * boost.value) * robotSlow;
    motion.turn = state.turn;
    state.position.addScaledVector(forward, motion.speed * delta);
    jetVelocity.copy(forward).multiplyScalar(motion.speed);

    const jet = ref.current;
    jet.position.copy(state.position);
    jetPosition.copy(state.position);
    jet.lookAt(look.copy(state.position).add(forward));
    // Level out as a robot.
    jet.rotateZ((state.roll + state.barrel) * (1 - transform.robot));

    // Chase camera: sit behind and above, aim a little ahead of the jet. It lags behind as speed builds,
    // so the jet surges ahead when boosting.
    desired.copy(state.position).addScaledVector(forward, -mix(BOOST.back, boost.value));
    desired.y += CHASE.up;
    look.copy(state.position).addScaledVector(forward, CHASE.ahead);
    look.y += CHASE.aim * (1 - 0.8 * transform.robot); // aim lower to frame the hanging robot
    const follow = thumbnailMode ? 1 : 1 - Math.exp(-delta * CHASE.follow);
    if (state.lookAt.lengthSq() === 0) { camera.position.copy(desired); state.lookAt.copy(look); }
    camera.position.lerp(desired, follow);
    state.lookAt.lerp(look, follow);
    camera.lookAt(state.lookAt);
    // Shake a little at speed, and widen the view.
    const shake = BOOST.shake * boost.value;
    if (shake > 0) camera.position.add(look.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
    const fov = mix(BOOST.fov, boost.value);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    SUN.position.copy(camera.position).addScaledVector(SUN.direction, SUN.distance);
  }, -1);

  return <group ref={ref}>{children}</group>;
}

// A field of drei clouds that wraps around the camera, so clouds left behind reappear far ahead.
// Clouds fade out between fadeNear and fadeFar (horizontal distance from the camera), which is inside
// half the area, so they are invisible by the time they wrap. The colour is sampled from the HDRI's lit clouds.
const CLOUDS = { count: 64, area: 240, altitude: [-14, 26], fadeNear: 60, fadeFar: 105, color: '#e7ddc9' };

// Small seeded generator so the layout is the same on every load.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function CloudField() {
  const camera = useThree(state => state.camera);
  const layout = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: CLOUDS.count }, () => ({
      offset: new Vector3(
        (random() - 0.5) * CLOUDS.area,
        CLOUDS.altitude[0] + random() * (CLOUDS.altitude[1] - CLOUDS.altitude[0]),
        (random() - 0.5) * CLOUDS.area,
      ),
      seed: Math.floor(random() * 1000),
      bounds: [6 + random() * 8, 1.5 + random() * 2, 4 + random() * 6],
      volume: 5 + random() * 5,
    }));
  }, []);
  const refs = useRef([]);
  const field = useRef();
  const wrap = value => value - CLOUDS.area * Math.floor((value + CLOUDS.area / 2) / CLOUDS.area);

  useFrame(() => {
    for (const [i, { offset }] of layout.entries()) {
      const cloud = refs.current[i];
      if (!cloud) continue;
      // Keep each cloud within half the area of the camera on x and z.
      cloud.position.set(
        camera.position.x + wrap(offset.x - camera.position.x),
        offset.y,
        camera.position.z + wrap(offset.z - camera.position.z),
      );
    }
  });

  // Faded clouds would still block the lens flare's occlusion ray, so let it see through them.
  useEffect(() => {
    const sprites = field.current?.children.find(child => child.isInstancedMesh);
    if (sprites) sprites.userData.lensflare = 'no-occlusion';
  }, []);

  // drei only fades clouds near the camera, so fade the far ones here. This runs after drei has written
  // this frame's per-sprite opacities (priority 0) and before the composer renders (priority 1).
  useFrame(() => {
    const sprites = field.current?.children.find(child => child.isInstancedMesh);
    if (!sprites) return;
    const matrices = sprites.instanceMatrix.array;
    const opacity = sprites.geometry.attributes.cloudOpacity;
    for (let i = 0; i < sprites.count; i++) {
      const distance = Math.hypot(matrices[i * 16 + 12] - camera.position.x, matrices[i * 16 + 14] - camera.position.z);
      const t = Math.min(Math.max((distance - CLOUDS.fadeNear) / (CLOUDS.fadeFar - CLOUDS.fadeNear), 0), 1);
      opacity.array[i] *= 1 - t * t * (3 - 2 * t);
    }
    opacity.needsUpdate = true;
  }, 0.5);

  return (
    <>
      {/* Not frustum culled: the instanced mesh's bounds are computed once, before the clouds are placed,
          so culling would hide or show the whole field at once as the camera turns. */}
      <Clouds ref={field} texture="clouds/cloud.png" material={MeshBasicMaterial} limit={CLOUDS.count * 12} frustumCulled={false}>
        {layout.map(({ seed, bounds, volume }, i) => (
          <Cloud
            key={i}
            ref={cloud => { refs.current[i] = cloud; }}
            seed={seed}
            segments={12}
            bounds={bounds}
            volume={volume}
            color={CLOUDS.color}
            opacity={0.8}
            fade={10}
          />
        ))}
      </Clouds>
    </>
  );
}

// Equirectangular HDRI from hdrmaps.com, used as the background and as image-based light on the jet.
// The sun peaks around 1300, which floods the bloom pass, so values are capped at `cap`.
const SKY = { file: 'sky/086_hdrmaps_com_free_1K.exr', environmentIntensity: 0.6, cap: 6 };

// The sun's direction in the HDRI (brightness-weighted centre of its brightest pixels, about 20 degrees
// up), its light colour, and a point far along that direction that the lens flare tracks.
const SUN = {
  direction: new Vector3(0.781, 0.342, 0.522).normalize(),
  color: '#ffe9c4',
  distance: 500,
  position: new Vector3(),
};

function Sky() {
  const texture = useLoader(EXRLoader, SKY.file, loader => loader.setDataType(FloatType));
  useMemo(() => {
    const { data } = texture.image;
    for (let i = 0; i < data.length; i++) if (data[i] > SKY.cap) data[i] = SKY.cap;
    texture.mapping = EquirectangularReflectionMapping;
    texture.needsUpdate = true;
  }, [texture]);
  return <Environment map={texture} background environmentIntensity={SKY.environmentIntensity} />;
}

// The missile swarm lives in world space and chases the jet.
function Missiles() {
  const camera = useThree(state => state.camera);
  const swarm = useMemo(() => createMissileSwarm(), []);
  useEffect(() => () => swarm.dispose(), [swarm]);
  useFrame(({ clock }, rawDelta) => {
    const delta = thumbnailMode ? 0 : Math.min(rawDelta, 0.1);
    swarm.update(delta, clock.elapsedTime, jetPosition, jetVelocity, camera.position);
  });
  return <primitive object={swarm.object} />;
}

// Radial blur centred on the jet, so it stays sharp while the frame streaks around it.
function MotionBlur() {
  const camera = useThree(state => state.camera);
  const effect = useMemo(() => new RadialBlurEffect(), []);
  const projected = useMemo(() => new Vector3(), []);
  useFrame(() => {
    effect.strength = BOOST.blur * boost.value * boost.value;
    projected.copy(jetPosition).project(camera);
    effect.uniforms.get('center').value.set((projected.x + 1) / 2, (projected.y + 1) / 2);
  });
  return <primitive object={effect} />;
}

function Ready() {
  useLayoutEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.dataset.thumbnailReady = 'true';
    }));
  }, []);
  return null;
}

createRoot(document.getElementById('root')).render(
  // Flat (no tone mapping): post-processing would otherwise tone map the sky, which three normally leaves alone.
  <Canvas flat camera={{ position: [0, 6, -6], fov: 55, far: 2000 }} dpr={[1, 2]}>
    {/* Warm key light from the sun in the HDRI, a soft cool fill from the opposite side, and a dim sky fill. */}
    <hemisphereLight args={['#9cc4ff', '#2a3448', 0.35]} />
    <directionalLight position={SUN.direction.clone().multiplyScalar(10)} intensity={3.5} color={SUN.color} />
    <directionalLight position={SUN.direction.clone().multiplyScalar(-10)} intensity={0.8} color="#8fb8ff" />
    <Suspense fallback={null}>
      <Sky />
      <CloudField />
      <Flight>
        <Jetfire />
      </Flight>
      <Missiles />
      <Ready />
    </Suspense>
    {/* Only values brighter than white bloom, so the sky stays crisp while the boosted engine cores flare. */}
    <EffectComposer>
      <Bloom luminanceThreshold={1} intensity={0.8} mipmapBlur />
      {/* Follows the sun and fades out when the jet is in front of it. */}
      <LensFlare lensPosition={SUN.position} glareSize={0.2} flareSize={0.006} ghostScale={0.1} />
      <MotionBlur />
    </EffectComposer>
  </Canvas>
);
