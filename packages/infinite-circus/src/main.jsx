import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Cloud, Clouds, Environment, Trail } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { Box3, EquirectangularReflectionMapping, FloatType, Mesh, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { createEngineGlow } from './effects.js';

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
const MAX_TURN = 0.9; // radians per second
const BOUNDS = 60; // steer back towards the origin beyond this radius
const ALTITUDE = [-6, 14];
const BANK = 0.9; // roll per unit of turn rate
// The camera aims above the jet (aim) so the horizon sits low and the clouds fill the frame.
const CHASE = { back: 3.8, up: 0.4, ahead: 3, aim: 1.5, follow: 3 };

// Effect anchors on the jet pose, in model units relative to its centre (+X is the nose, Z is the span).
const NOZZLES = [new Vector3(-30.5, -4.3, -6.4), new Vector3(-30.5, -4.3, 6.4)];
const WINGTIPS = [new Vector3(-16.3, -1, -27.2), new Vector3(-16.3, -1, 27.2)];

// drei's Trail tapers to nothing at the tail; its length is in frames, so it shortens on high-refresh displays.
const TRAIL = { width: 0.15, length: 3, color: '#e8f1ff' };

function Jetfire() {
  const body = useLoader(MD2Loader, 'jetfire/tris.md2');
  const [skin, normals] = useLoader(TextureLoader, ['jetfire/vf1s_fokker.jpg', 'jetfire/vf1s_fokker_normal.jpg']);

  const { mesh, scale, glow } = useMemo(() => {
    const mesh = md2Mesh(body, skin, normals);
    const frame = body.morphAttributes.position.find(target => target.name === JET_FRAME);
    mesh.morphTargetInfluences[mesh.morphTargetDictionary[JET_FRAME]] = 1;
    // Centre on the jet pose and keep the robot's scale (roughly two units tall standing up).
    const box = new Box3().setFromBufferAttribute(frame);
    mesh.position.copy(box.getCenter(new Vector3()).negate());
    const height = new Box3().setFromBufferAttribute(body.attributes.position).getSize(new Vector3()).y;
    return { mesh, scale: 2 / height, glow: createEngineGlow(NOZZLES) };
  }, [body, skin, normals]);

  useFrame(({ clock }) => glow.update(clock.elapsedTime));
  useEffect(() => () => {
    mesh.material.dispose();
    glow.dispose();
  }, [mesh, glow]);

  return (
    <group scale={scale}>
      {/* MD2 models face +X; turn the nose to +Z, which is where Object3D.lookAt points. */}
      <group rotation-y={-Math.PI / 2}>
        <primitive object={mesh} />
        <primitive object={glow.object} />
        {WINGTIPS.map((tip, i) => (
          <Trail key={i} width={TRAIL.width} length={TRAIL.length} color={TRAIL.color} attenuation={t => t * t}>
            <object3D position={tip} />
          </Trail>
        ))}
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
    retarget: 0,
    lookAt: new Vector3(),
  }), []);
  const scratch = useMemo(() => ({ forward: new Vector3(), desired: new Vector3(), look: new Vector3(), toOrigin: new Vector3() }), []);
  // Runs before other frame callbacks so the trails sample this frame's wingtip positions.
  useFrame((_, rawDelta) => {
    const delta = thumbnailMode ? 0 : Math.min(rawDelta, 0.1);
    const { forward, desired, look, toOrigin } = scratch;

    // Pick a new random turn and climb every couple of seconds, easing between them.
    state.retarget -= delta;
    if (state.retarget <= 0) {
      state.retarget = 1.5 + Math.random() * 2.5;
      state.turnTarget = (Math.random() * 2 - 1) * MAX_TURN;
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

    const ease = 1 - Math.exp(-delta * 1.5);
    state.turn += (state.turnTarget - state.turn) * ease;
    state.pitch += (state.pitchTarget - state.pitch) * ease;
    state.heading += state.turn * delta;
    state.roll += (-state.turn * BANK - state.roll) * ease;

    forward.set(Math.sin(state.heading) * Math.cos(state.pitch), Math.sin(state.pitch), Math.cos(state.heading) * Math.cos(state.pitch));
    state.position.addScaledVector(forward, SPEED * delta);

    const jet = ref.current;
    jet.position.copy(state.position);
    jet.lookAt(look.copy(state.position).add(forward));
    jet.rotateZ(state.roll);

    // Chase camera: sit behind and above, aim a little ahead of the jet.
    desired.copy(state.position).addScaledVector(forward, -CHASE.back);
    desired.y += CHASE.up;
    look.copy(state.position).addScaledVector(forward, CHASE.ahead);
    look.y += CHASE.aim;
    const follow = thumbnailMode ? 1 : 1 - Math.exp(-delta * CHASE.follow);
    if (state.lookAt.lengthSq() === 0) { camera.position.copy(desired); state.lookAt.copy(look); }
    camera.position.lerp(desired, follow);
    state.lookAt.lerp(look, follow);
    camera.lookAt(state.lookAt);
  }, -1);

  return <group ref={ref}>{children}</group>;
}

// A field of drei clouds that wraps around the camera, so clouds left behind reappear far ahead.
const CLOUDS = { count: 64, area: 240, altitude: [-14, 26], fogNear: 60, fogFar: 115, fogColor: '#d6e8f5' };

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

  return (
    <>
      {/* Haze swallows clouds before they reach the wrap edge, so they never visibly pop. */}
      <fog attach="fog" args={[CLOUDS.fogColor, CLOUDS.fogNear, CLOUDS.fogFar]} />
      {/* Not frustum culled: the instanced mesh's bounds are computed once, before the clouds are placed,
          so culling would hide or show the whole field at once as the camera turns. */}
      <Clouds texture="clouds/cloud.png" material={MeshBasicMaterial} limit={CLOUDS.count * 12} frustumCulled={false}>
        {layout.map(({ seed, bounds, volume }, i) => (
          <Cloud
            key={i}
            ref={cloud => { refs.current[i] = cloud; }}
            seed={seed}
            segments={12}
            bounds={bounds}
            volume={volume}
            color="#f4f8ff"
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
    {/* Dim sky fill, a low warm key from the front and a strong cool rim from behind. */}
    <hemisphereLight args={['#9cc4ff', '#2a3448', 0.35]} />
    <directionalLight position={[5, 1.5, 1]} intensity={3.5} color="#ffd2a0" />
    <directionalLight position={[-4, 3, -3]} intensity={4} color="#8fb8ff" />
    <Suspense fallback={null}>
      <Sky />
      <CloudField />
      <Flight>
        <Jetfire />
      </Flight>
      <Ready />
    </Suspense>
    {/* Only values brighter than white bloom, so the sky stays crisp while the boosted engine cores flare. */}
    <EffectComposer>
      <Bloom luminanceThreshold={1} intensity={0.8} mipmapBlur />
    </EffectComposer>
  </Canvas>
);
