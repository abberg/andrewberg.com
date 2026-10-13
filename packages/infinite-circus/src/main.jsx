import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, createPortal, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Cloud, Clouds, Environment, Trail, useTexture } from '@react-three/drei';
import { Bloom, EffectComposer, LensFlare } from '@react-three/postprocessing';
import {
  AnimationClip, AnimationMixer, Box3, EquirectangularReflectionMapping, Group, LoopOnce, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NumberKeyframeTrack, Object3D, PerspectiveCamera, Quaternion, SRGBColorSpace, TextureLoader, Vector2, Vector3,
} from 'three';
import { UltraHDRLoader } from 'three/examples/jsm/loaders/UltraHDRLoader.js';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { RadialBlurEffect } from './blur.js';
import { createEngineGlow } from './effects.js';
import { createGunfire, GUNFIRE } from './gunfire.js';
import { addTransformGunFrames, GUN_POD_FRAME } from './gunframes.js';
import { createMissileSwarm } from './missiles.js';

const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');

// Built directly rather than as JSX so the Mesh constructor sets up the morph targets for the geometry.
// Normal maps were generated from the skins with DeepBump.
function md2Mesh(geometry, skin, normalMap) {
  skin.colorSpace = SRGBColorSpace;
  return new Mesh(geometry, new MeshStandardMaterial({ map: skin, normalMap, roughness: 0.6, flatShading: true }));
}

const JET_FRAME = 'jet1';
const MODELS = ['jetfire/tris.md2', 'jetfire/weapon.md2'];
const SKINS = ['jetfire/vf1s_fokker.jpg', 'jetfire/vf1s_fokker_normal.jpg', 'jetfire/weapon.jpg', 'jetfire/weapon_normal.jpg'];
const CLOUD_TEXTURE = 'clouds/cloud.png';

// Flight tuning, in world units and seconds.
const SPEED = 6;
// Which of the jet's own behaviours run. All off for now, so it flies straight and level while its
// reactions to the missiles are built up. Space (boost) and T (transform) still work by hand.
const AUTOPILOT = { wander: false, boost: false, transform: false, flee: true, boostOnThreat: true, fightOnThreat: true };

// Flee: missiles inside `radius` push the jet away, more strongly the closer they are. The push, in the
// jet's own frame, sets how hard it turns (sideways part) and climbs or dives (vertical part).
// Missiles coming from behind don't push him sideways (chasers end up outside his turn, which would just
// tighten the same turn forever); instead he jinks, breaking to one side and switching every `jink` seconds.
const FLEE = { radius: 9, turnGain: 2.5, pitchGain: 2, maxPitch: 0.6, jink: [1.2, 2.5] };
// Boost away when the flee pressure (closeness-weighted count of nearby missiles) passes `pressure`, for
// `lasting` seconds, then wait out a `cooldown` before boosting again.
const THREAT_BOOST = { pressure: 0.5, lasting: [1.5, 2.5], cooldown: [2, 4] };
// Fight: when missiles still crowd him and he isn't boosting, transform, turn to face the nearest missile
// within `range`, and shoot at it, leading the shot. He folds back into a jet when his robot time is up or
// nothing has been in range for `giveUp` seconds, then waits out a `cooldown`.
// He only fires once the barrel points within `fireCone` of where the shot needs to go, and each bolt
// leaves within `correction` of the barrel, so shots never leave the gun at odd angles. He also tilts to
// aim up or down, up to `maxPitch`.
const FIGHT = {
  pressure: 0.8, range: 25, hitRadius: 0.7, giveUp: 1.2, cooldown: [6, 10], turnRate: 14,
  fireCone: 0.5, correction: 0.15, maxPitch: 0.7, // radians (about 29, 9 and 40 degrees)
  startDelay: 8, // seconds as a jet after the page loads before he'll first fight
};
// Missile positions in flight, refreshed each frame by the swarm, for the jet to react to.
const threats = { positions: [], pressure: 0, swarm: null };

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
  robotSpeed: 0.9, // flight speed multiplier while a robot: he keeps moving while he fights
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
// Ragdoll legs. The MD2 has no skeleton, so the vertex shader bends everything below the hips (robot pose,
// raw model units) about a pivot for each leg, blending in between `blend` heights. Each leg's angle is a
// loose spring, with slightly different stiffness per leg, kicked by the body swing, by how fast the robot
// turns to aim, and by a little wobble, so the legs lag, flop and overshoot.
const LEGS = {
  hip: new Vector3(0.5, 4, 0), spread: 6, blend: [0, 6],
  stiffness: [8, 12], damping: 1.4,
  follow: 0.32, // lag behind the body swing's angular velocity
  fling: 0.12, // swing out from turning to aim (per radian per second)
  wobble: 0.22, max: 1,
};

// What the flight is doing this frame, for the swing.
const motion = { speed: 0, turn: 0 };
// Shared with the flight: robot eases 0 (jet) to 1 (robot) through the transforms.
const transform = {
  phase: 'jet', timer: between(TRANSFORM.every), robot: 0, request: false, faceCamera: false,
  yaw: 0, // the robot's turn away from the direction of travel, radians
  pitch: 0, // and its tilt up (positive) or down to aim
  target: null, // the missile he's locked on to
  cooldown: FIGHT.startDelay, // seconds before he can fight (again)
  idle: 0, // seconds in robot mode with nothing in range
};

// Each phase of the cycle, in order, with the frames it plays. Named animations come from the model;
// `frames` builds a clip from specific frames. The attack's frames 1-4 aim and fire with a little recoil
// and 5-8 lower the gun back to rest, so the gun is raised once, fires on a loop, then lowered, rather
// than looping all 8 frames and snapping it back up each time.
const PHASES = {
  // The weapon has no frames for the transforms or the jet; gunframes.js generates them.
  jet: { body: { hold: JET_FRAME }, gun: { hold: GUN_POD_FRAME }, next: 'up' },
  up: { body: { animation: 'transformup' }, gun: true, once: true, next: 'raise' },
  raise: { frames: ['attack8', 'attack7', 'attack6', 'attack5', 'attack4'], once: true, gun: true, next: 'robot' },
  robot: { frames: ['attack1', 'attack2', 'attack3', 'attack4'], gun: true, next: 'lower' },
  lower: { frames: ['attack5', 'attack6', 'attack7', 'attack8'], once: true, gun: true, next: 'down' },
  down: { body: { animation: 'transformdn' }, gun: true, once: true, next: 'jet' },
};
const ROBOT_PHASES = new Set(['up', 'raise', 'robot', 'lower']);

// Muzzle of the gun in attack frame 1 (raw MD2 units), and the barrel's direction.
const MUZZLE = { position: new Vector3(30.6, 14.5, -4.1), direction: new Vector3(30.2, -3.3, 3.2).normalize() };

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
  const [body, weapon] = useLoader(MD2Loader, MODELS);
  const [skin, normals, weaponSkin, weaponNormals] = useLoader(TextureLoader, SKINS);

  const { legUniforms, model, mesh, centers, scale, glow, nozzles, mixer, actions, gun, gunfire, muzzle, aim } = useMemo(() => {
    addTransformGunFrames(body, weapon);
    const mesh = md2Mesh(body, skin, normals);
    const legUniforms = {
      uLegL: { value: new Vector2() }, uLegR: { value: new Vector2() },
      uHip: { value: LEGS.hip }, uSpread: { value: LEGS.spread },
      uBlend: { value: new Vector2(...LEGS.blend) }, uLegAmount: { value: 0 },
    };
    // Bend the legs after the morph has posed them. Legs are split by side (z), and each rotates about its
    // hip: first forward/back about the model's sideways axis (z), then out to the side about x.
    mesh.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, legUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uLegL; uniform vec2 uLegR; uniform vec3 uHip; uniform float uSpread;
          uniform vec2 uBlend; uniform float uLegAmount;`)
        .replace('#include <morphtarget_vertex>', `#include <morphtarget_vertex>
          float legWeight = uLegAmount * (1.0 - smoothstep(uBlend.x, uBlend.y, transformed.y));
          if (legWeight > 0.0) {
            bool leftLeg = transformed.z > uHip.z;
            vec2 legAngle = (leftLeg ? uLegL : uLegR) * legWeight;
            vec3 pivot = uHip + vec3(0.0, 0.0, leftLeg ? uSpread : -uSpread);
            vec3 p = transformed - pivot;
            float c = cos(legAngle.x), s = sin(legAngle.x);
            p = vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
            c = cos(legAngle.y); s = sin(legAngle.y);
            p = vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
            transformed = p + pivot;
          }`);
    };
    const gun = md2Mesh(weapon, weaponSkin, weaponNormals);
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
      // `gun` is true to play the same frames as the body, a list of its own frames, or a frame to hold.
      gun: phase.gun ? actionFor(weapon, gun, name, Array.isArray(phase.gun) ? { frames: phase.gun, once: phase.once }
        : phase.gun.hold ? { body: { hold: phase.gun.hold } } : phase) : null,
    }]));
    actions.jet.body.play();
    actions.jet.gun?.play();
    gun.visible = Boolean(PHASES.jet.gun);
    // The gun's muzzle and a point further along its barrel, in the model's raw MD2 coordinates, from
    // the attack pose. The muzzle flash sits on the muzzle; the pair gives the firing direction.
    const gunfire = createGunfire();
    const muzzle = new Object3D();
    muzzle.position.copy(MUZZLE.position);
    muzzle.add(gunfire.flash);
    const aim = new Object3D();
    aim.position.copy(MUZZLE.position).addScaledVector(MUZZLE.direction, 10);
    model.add(muzzle, aim);
    // The feet carry the engines: track the body vertices around each nozzle so the glow can ride along
    // with them through the transforms. Offsets keep the glow just behind the nozzle, as placed for the jet.
    const jetFrame = body.morphAttributes.position.find(target => target.name === JET_FRAME);
    const nozzles = NOZZLES.map(nozzle => {
      const raw = nozzle.clone().add(centers.jet);
      const vertices = [];
      for (let i = 0; i < jetFrame.count; i++) if (new Vector3().fromBufferAttribute(jetFrame, i).distanceTo(raw) < 4) vertices.push(i);
      const centroid = vertices.reduce((sum, i) => sum.add(new Vector3().fromBufferAttribute(jetFrame, i)), new Vector3()).divideScalar(vertices.length);
      return { vertices, offset: raw.sub(centroid), position: new Vector3() };
    });
    return { legUniforms, model, mesh, centers, scale: 2 / height, glow: createEngineGlow(NOZZLES), nozzles, mixer, actions, gun, gunfire, muzzle, aim };
  }, [body, weapon, skin, normals, weaponSkin, weaponNormals]);

  const turn = useRef();
  const hang = useRef();
  const trails = useRef([]);
  const sample = useMemo(() => new Vector3(), []);
  const scratchVertex = useMemo(() => new Vector3(), []);
  const scene = useThree(state => state.scene);
  const shooting = useMemo(() => ({ frame: -1, from: new Vector3(), direction: new Vector3(), barrel: new Vector3(), lead: new Vector3() }), []);
  const aiming = useMemo(() => ({ rotation: new Quaternion(), toward: new Vector3() }), []);
  const swing = useMemo(() => ({ angle: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, lastSpeed: 0 }), []);
  const legs = useMemo(() => ({
    amount: 0, lastYaw: 0, lastPitch: 0,
    sides: [0, 1].map(() => ({ angle: { x: 0, y: 0 }, velocity: { x: 0, y: 0 } })),
  }), []);

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
      gun.visible = Boolean(PHASES[phase].gun);
      if (phase === 'jet') {
        transform.timer = between(TRANSFORM.every);
        transform.cooldown = between(FIGHT.cooldown);
      }
      if (phase === 'robot') transform.idle = 0;
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
    transform.cooldown -= delta;
    // Stay locked on one missile while it's flying and in range, so the aim doesn't flick between targets.
    const locked = transform.target;
    const keep = locked && locked.state === 'flying' && locked.position.distanceTo(jetPosition) < FIGHT.range;
    const target = ROBOT_PHASES.has(transform.phase) ? (keep ? locked : threats.swarm?.nearest(jetPosition, FIGHT.range)) : null;
    transform.target = target;
    if (transform.phase === 'robot') transform.idle = target ? 0 : transform.idle + delta;
    const fight = AUTOPILOT.fightOnThreat && delta > 0 && (
      (transform.phase === 'jet' && transform.cooldown <= 0 && threats.pressure > FIGHT.pressure && boost.value < 0.3)
      || (transform.phase === 'robot' && (transform.timer <= 0 || transform.idle > FIGHT.giveUp))
    );
    const due = (AUTOPILOT.transform && transform.timer <= 0) || transform.request || fight;
    transform.request = false;
    if (due && (transform.phase === 'jet' || transform.phase === 'robot')) transform.switchTo(PHASES[transform.phase].next);
    mixer.update(delta);

    // Fire on attack frames 1 and 3 (the gun's forward, un-recoiled frames) while in the firing loop:
    // at the target if there is one, leading it by the bolt's flight time, otherwise along the barrel.
    if (transform.phase === 'robot' && delta > 0) {
      const frame = Math.floor(actions.robot.body.time * TRANSFORM.fps) % 4;
      if (frame !== shooting.frame && (frame === 0 || frame === 2)) {
        muzzle.getWorldPosition(shooting.from);
        aim.getWorldPosition(shooting.barrel).sub(shooting.from).normalize();
        let fire = true;
        shooting.direction.copy(shooting.barrel);
        if (target) {
          const flightTime = target.position.distanceTo(shooting.from) / GUNFIRE.boltSpeed;
          shooting.lead.copy(target.position).addScaledVector(target.velocity, flightTime)
            .addScaledVector(jetVelocity, -flightTime).sub(shooting.from).normalize();
          const off = shooting.barrel.angleTo(shooting.lead);
          // Hold fire until the gun is roughly on target, then nudge the bolt the rest of the way.
          fire = off <= FIGHT.fireCone;
          shooting.direction.lerp(shooting.lead, off > 0 ? Math.min(1, FIGHT.correction / off) : 1).normalize();
        }
        if (fire) gunfire.fire(shooting.from, shooting.direction, jetVelocity);
      }
      shooting.frame = frame;
    } else {
      shooting.frame = -1;
    }
    gunfire.update(delta, (from, to) => threats.swarm?.hit(from, to, FIGHT.hitRadius));

    const robotTarget = ROBOT_PHASES.has(transform.phase) ? 1 : 0;
    transform.robot += (robotTarget - transform.robot) * (1 - Math.exp(-delta * 3));
    model.position.lerpVectors(centers.jet, centers.robot, transform.robot).negate();
    // As a robot, turn to face the target, in the flight's own frame (0 faces the direction of travel).
    // With no target, sometimes face the chase camera instead. Turn back as he becomes a jet.
    // He also tilts (pitch) to aim up or down at the target.
    let yawTarget = 0;
    let pitchTarget = 0;
    if (ROBOT_PHASES.has(transform.phase)) {
      if (target) {
        // In the frame the turn happens in: the swing group's, which includes the pendulum lean.
        hang.current.getWorldQuaternion(aiming.rotation).invert();
        aiming.toward.subVectors(target.position, jetPosition).applyQuaternion(aiming.rotation);
        yawTarget = Math.atan2(aiming.toward.x, aiming.toward.z);
        const elevation = Math.atan2(aiming.toward.y, Math.hypot(aiming.toward.x, aiming.toward.z));
        pitchTarget = Math.max(-FIGHT.maxPitch, Math.min(FIGHT.maxPitch, elevation));
      } else if (transform.faceCamera) {
        yawTarget = Math.PI;
      }
    }
    const aimEase = 1 - Math.exp(-delta * (target ? FIGHT.turnRate : 2.5));
    const yawError = Math.atan2(Math.sin(yawTarget - transform.yaw), Math.cos(yawTarget - transform.yaw));
    transform.yaw += yawError * aimEase;
    transform.pitch += (pitchTarget - transform.pitch) * aimEase;
    // Yaw, then pitch about the model's sideways (Z) axis: the robot faces model +X, and a positive Z
    // rotation tips +X up.
    turn.current.rotation.set(0, -Math.PI / 2 + transform.yaw, transform.pitch, 'YXZ');

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

    // Ragdoll legs: only once he's standing as a robot, easing in and out around the transforms.
    const legTarget = transform.phase === 'raise' || transform.phase === 'robot' || transform.phase === 'lower' ? 1 : 0;
    legs.amount += (legTarget - legs.amount) * (1 - Math.exp(-delta * 4));
    const yawRate = delta > 0 ? Math.atan2(Math.sin(transform.yaw - legs.lastYaw), Math.cos(transform.yaw - legs.lastYaw)) / delta : 0;
    const pitchRate = delta > 0 ? (transform.pitch - legs.lastPitch) / delta : 0;
    legs.lastYaw = transform.yaw;
    legs.lastPitch = transform.pitch;
    const time = clock.elapsedTime;
    legs.sides.forEach((leg, i) => {
      const targetForward = -LEGS.follow * swing.velocity.x - LEGS.fling * pitchRate + LEGS.wobble * Math.sin(time * (2.3 + i * 0.7) + i);
      const targetOut = -LEGS.follow * swing.velocity.z + LEGS.fling * yawRate * (i === 0 ? 1 : 0.7) + LEGS.wobble * Math.sin(time * (1.7 + i * 0.9) + 2 * i);
      for (const [axis, target] of [['x', targetForward], ['y', targetOut]]) {
        leg.velocity[axis] += (LEGS.stiffness[i] * (target - leg.angle[axis]) - LEGS.damping * leg.velocity[axis]) * delta;
        leg.angle[axis] = Math.max(-LEGS.max, Math.min(LEGS.max, leg.angle[axis] + leg.velocity[axis] * delta));
      }
    });
    legUniforms.uLegAmount.value = legs.amount;
    legUniforms.uLegL.value.set(legs.sides[0].angle.x, legs.sides[0].angle.y);
    legUniforms.uLegR.value.set(legs.sides[1].angle.x, legs.sides[1].angle.y);
    // The engines light once the feet are mostly in jet position: in jet mode, late in the transform down,
    // and early in the transform up. The glow follows the animated feet.
    const progress = action => (action ? action.time / action.getClip().duration : 0);
    glow.object.visible = transform.phase === 'jet'
      || (transform.phase === 'down' && progress(actions.down.body) > 0.6)
      || (transform.phase === 'up' && progress(actions.up.body) < 0.3);
    if (glow.object.visible) {
      const influences = mesh.morphTargetInfluences;
      const targets = body.morphAttributes.position;
      const base = 1 - influences.reduce((sum, weight) => sum + weight, 0);
      for (const nozzle of nozzles) {
        nozzle.position.set(0, 0, 0);
        for (const i of nozzle.vertices) {
          sample.fromBufferAttribute(body.attributes.position, i).multiplyScalar(base);
          for (let k = 0; k < influences.length; k++) {
            if (influences[k] > 0) sample.add(scratchVertex.fromBufferAttribute(targets[k], i).multiplyScalar(influences[k]));
          }
          nozzle.position.add(sample);
        }
        nozzle.position.divideScalar(nozzle.vertices.length).add(nozzle.offset).add(model.position);
      }
      glow.place(nozzles.map(nozzle => nozzle.position));
    }
    // The wingtip trails fade out as he becomes a robot.
    for (const line of trails.current) {
      if (!line) continue;
      line.material.transparent = true;
      line.material.opacity = Math.max(0, 1 - transform.robot * 2);
      line.visible = line.material.opacity > 0;
    }
    glow.update(clock.elapsedTime, boost.value);
  });
  useEffect(() => () => {
    mixer.stopAllAction();
    model.traverse(object => object.material?.dispose());
    glow.dispose();
    gunfire.dispose();
  }, [model, mixer, glow, gunfire]);

  return (
    <group scale={scale}>
      {/* Bolts fly in world space, independent of the jet. */}
      {createPortal(<primitive object={gunfire.bolts} />, scene)}
      {/* Swings about the pivot in the direction of travel, whichever way the robot faces. */}
      <group ref={hang}>
      {/* MD2 models face +X; turn the nose to +Z, which is where Object3D.lookAt points. */}
      <group ref={turn} rotation-y={-Math.PI / 2}>
        <primitive object={model} />
        <primitive object={glow.object} />
        {WINGTIPS.map((tip, i) => (
          <Trail key={i} ref={line => { trails.current[i] = line; }} width={TRAIL.width} length={TRAIL.length} color={TRAIL.color} attenuation={t => t * t}>
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
    jinkSide: Math.random() < 0.5 ? -1 : 1,
    jinkTimer: 0,
    pressure: 0,
    boostLeft: 0, // seconds of threat boost remaining
    boostCooldown: 0,
    retarget: 0,
    lookAt: new Vector3(),
  }), []);
  const scratch = useMemo(() => ({
    forward: new Vector3(), desired: new Vector3(), look: new Vector3(), toOrigin: new Vector3(),
    flee: new Vector3(), away: new Vector3(), left: new Vector3(),
  }), []);

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
    const { forward, desired, look, toOrigin, flee, away, left } = scratch;

    // Pick a new random turn and climb every couple of seconds, easing between them.
    state.retarget -= delta;
    if (AUTOPILOT.wander && state.retarget <= 0) {
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
    if (AUTOPILOT.wander && toOrigin.length() > BOUNDS) {
      const homeHeading = Math.atan2(toOrigin.x, toOrigin.z);
      const error = Math.atan2(Math.sin(homeHeading - state.heading), Math.cos(homeHeading - state.heading));
      state.turnTarget = Math.sign(error) * MAX_TURN;
    }
    if (AUTOPILOT.wander && state.position.y > ALTITUDE[1]) state.pitchTarget = -0.2;
    if (AUTOPILOT.wander && state.position.y < ALTITUDE[0]) state.pitchTarget = 0.2;

    if (AUTOPILOT.flee) {
      // Sum the push away from each nearby missile, then read it in the jet's frame: positive left turns
      // head towards +X here (left from the chase camera), and up is world up.
      flee.set(0, 0, 0);
      left.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
      let pressure = 0;
      let sideways = 0;
      for (const missile of threats.positions) {
        away.subVectors(state.position, missile);
        const distance = away.length();
        if (distance === 0 || distance > FLEE.radius) continue;
        const weight = (1 - distance / FLEE.radius) ** 2;
        away.divideScalar(distance);
        // How much this missile is behind him: 0 dead ahead, 0.5 abeam, 1 straight behind.
        const behind = 0.5 + 0.5 * (away.x * Math.sin(state.heading) + away.z * Math.cos(state.heading));
        sideways += weight * ((1 - behind) * away.dot(left) + behind * state.jinkSide);
        flee.addScaledVector(away, weight);
        pressure += weight;
      }
      state.pressure = pressure;
      threats.pressure = pressure;
      if (pressure > 0) {
        state.jinkTimer -= delta;
        if (state.jinkTimer <= 0) {
          state.jinkSide = -state.jinkSide;
          state.jinkTimer = between(FLEE.jink);
        }
      }
      const previous = state.turnTarget;
      if (pressure > 0) {
        state.turnTarget = Math.max(-1, Math.min(1, sideways * FLEE.turnGain)) * MAX_TURN;
        state.pitchTarget = Math.max(-1, Math.min(1, flee.y * FLEE.pitchGain)) * FLEE.maxPitch;
      } else if (!AUTOPILOT.wander) {
        // Nothing close: ease back to straight and level.
        state.turnTarget = 0;
        state.pitchTarget = 0;
      }
      // Don't flee out of the cloud band.
      if (state.position.y > ALTITUDE[1]) state.pitchTarget = Math.min(state.pitchTarget, -0.2);
      if (state.position.y < ALTITUDE[0]) state.pitchTarget = Math.max(state.pitchTarget, 0.2);
      // A hard reversal from right to left still earns a barrel roll.
      if (previous < -ROLL.minTurn && state.turnTarget > ROLL.minTurn && state.barrelTime < 0 && transform.phase === 'jet') {
        state.barrelTime = 0;
        state.barrelSign = -1;
      }
    }

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
    if (AUTOPILOT.boost) {
      boost.timer -= delta;
      if (boost.timer <= 0) {
        boost.auto = !boost.auto;
        boost.timer = between(boost.auto ? BOOST.lasting : BOOST.every);
      }
    }
    if (AUTOPILOT.boostOnThreat) {
      state.boostCooldown -= delta;
      if (state.boostLeft > 0) {
        state.boostLeft -= delta;
        if (state.boostLeft <= 0) state.boostCooldown = between(THREAT_BOOST.cooldown);
      } else if (state.pressure > THREAT_BOOST.pressure && state.boostCooldown <= 0 && transform.phase === 'jet') {
        state.boostLeft = between(THREAT_BOOST.lasting);
      }
      boost.auto = state.boostLeft > 0;
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
    if (!sprites) return;
    sprites.userData.lensflare = 'no-occlusion';
    sprites.layers.set(CLOUD_LAYER);
    camera.layers.enable(CLOUD_LAYER);
  }, [camera]);

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
      <Clouds ref={field} texture={CLOUD_TEXTURE} material={MeshBasicMaterial} limit={CLOUDS.count * 12} frustumCulled={false}>
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

// Equirectangular HDRI (hdrmaps.com 086, 4K), used as the background and as image-based light on the jet.
// Stored as an Ultra HDR JPEG (an ordinary JPEG plus a gain map that restores the HDR range) at quality 85:
// 964 KB, against 20 MB for the 4K EXR. The sun, which peaked around 1300 and flooded the bloom pass, was
// capped at 6 when it was converted (with @monogrid/gainmap-js).
const SKY = { file: 'sky/sky.jpg', environmentIntensity: 0.6 };

// The sun's direction in the HDRI (brightness-weighted centre of its brightest pixels, about 20 degrees
// up), its light colour, and a point far along that direction that the lens flare tracks.
const SUN = {
  direction: new Vector3(0.781, 0.342, 0.522).normalize(),
  color: '#ffe9c4',
  distance: 500,
  position: new Vector3(),
};

function Sky() {
  const texture = useLoader(UltraHDRLoader, SKY.file);
  texture.mapping = EquirectangularReflectionMapping;
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
    threats.positions = swarm.flying();
    threats.swarm = swarm;
  });
  return <primitive object={swarm.object} />;
}

// Radial blur centred on the jet, so it stays sharp while the frame streaks around it.
// A second, inset view from off the jet's right side and pulled well back, to watch missiles approach.
// Drawn after the main (post-processed) frame into the bottom-right corner. V toggles it.
const SIDE_VIEW = { right: 15, up: 2, back: 4, lookBehind: 9, fov: 75, width: 0.32, margin: 16 };
// The 3D clouds turn to face the main camera, so from the side they'd show as streaks. They sit on
// their own layer, which only the main camera renders.
const CLOUD_LAYER = 2;
const sideView = { visible: false }; // off by default; V shows it

function SideView() {
  const { gl, scene, size } = useThree();
  const camera = useMemo(() => new PerspectiveCamera(SIDE_VIEW.fov, 4 / 3, 0.1, 2000), []);
  const vectors = useMemo(() => ({ forward: new Vector3(), right: new Vector3(), up: new Vector3(0, 1, 0), target: new Vector3() }), []);
  useFrame(() => {
    if (!sideView.visible) return;
    const { forward, right, up, target } = vectors;
    forward.copy(jetVelocity).normalize();
    if (forward.lengthSq() === 0) forward.set(0, 0, 1);
    right.crossVectors(forward, up).normalize();
    camera.position.copy(jetPosition)
      .addScaledVector(right, SIDE_VIEW.right)
      .addScaledVector(up, SIDE_VIEW.up)
      .addScaledVector(forward, -SIDE_VIEW.back);
    camera.lookAt(target.copy(jetPosition).addScaledVector(forward, -SIDE_VIEW.lookBehind));

    const width = Math.round(size.width * SIDE_VIEW.width);
    const height = Math.round(width * 3 / 4);
    const x = size.width - width - SIDE_VIEW.margin;
    const y = SIDE_VIEW.margin; // from the bottom
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    gl.autoClear = false;
    gl.setScissorTest(true);
    gl.setScissor(x, y, width, height);
    gl.setViewport(x, y, width, height);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.autoClear = true;
  }, 2);
  return null;
}

// Frames the inset view and labels it.
function SideViewFrame() {
  const [visible, setVisible] = useState(sideView.visible);
  useEffect(() => {
    const press = event => {
      if (event.code !== 'KeyV') return;
      sideView.visible = !sideView.visible;
      setVisible(sideView.visible);
    };
    window.addEventListener('keydown', press);
    return () => window.removeEventListener('keydown', press);
  }, []);
  if (!visible) return null;
  return (
    <div className="side-view" style={{ width: `${SIDE_VIEW.width * 100}vw`, right: SIDE_VIEW.margin, bottom: SIDE_VIEW.margin }}>
      <span>Side view (V)</span>
    </div>
  );
}

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

// Start every download at once. Otherwise each suspending component only starts loading once the one
// before it has finished: sky, then clouds, then the models and skins.
useLoader.preload(UltraHDRLoader, SKY.file);
useLoader.preload(MD2Loader, MODELS);
useLoader.preload(TextureLoader, SKINS);
useTexture.preload(CLOUD_TEXTURE);

createRoot(document.getElementById('root')).render(
  <>
  {/* Flat (no tone mapping): post-processing would otherwise tone map the sky, which three normally leaves alone. */}
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
    <SideView />
  </Canvas>
  <SideViewFrame />
  </>
);
