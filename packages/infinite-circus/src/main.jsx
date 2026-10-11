import { createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, createPortal, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Box3, CubeTextureLoader, Group, Mesh, MeshStandardMaterial, Object3D, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { createEngineGlow, createTrail } from './effects.js';

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
const CHASE = { back: 3.8, up: 1.1, ahead: 3, follow: 3 };

// Effect anchors on the jet pose, in model units relative to its centre (+X is the nose, Z is the span).
const NOZZLES = [new Vector3(-30.5, -4.3, -6.4), new Vector3(-30.5, -4.3, 6.4)];
const WINGTIPS = [new Vector3(-16.3, -1, -27.2), new Vector3(-16.3, -1, 27.2)];

// Runs callbacks once the jet and camera have moved each frame, so effects never lag a frame behind.
const FlightContext = createContext(null);

function Jetfire() {
  const body = useLoader(MD2Loader, 'jetfire/tris.md2');
  const [skin, normals] = useLoader(TextureLoader, ['jetfire/vf1s_fokker.jpg', 'jetfire/vf1s_fokker_normal.jpg']);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const afterMove = useContext(FlightContext);

  const { model, scale, glow, trails } = useMemo(() => {
    const mesh = md2Mesh(body, skin, normals);
    const frame = body.morphAttributes.position.find(target => target.name === JET_FRAME);
    mesh.morphTargetInfluences[mesh.morphTargetDictionary[JET_FRAME]] = 1;
    // Centre on the jet pose and keep the robot's scale (roughly two units tall standing up).
    const box = new Box3().setFromBufferAttribute(frame);
    mesh.position.copy(box.getCenter(new Vector3()).negate());
    // MD2 models face +X; turn the nose to +Z, which is where Object3D.lookAt points.
    const model = new Group();
    model.rotation.y = -Math.PI / 2;
    model.add(mesh);
    const glow = createEngineGlow(NOZZLES);
    model.add(glow.object);
    const trails = WINGTIPS.map(tip => {
      const anchor = new Object3D();
      anchor.position.copy(tip);
      model.add(anchor);
      return { anchor, ...createTrail() };
    });
    const height = new Box3().setFromBufferAttribute(body.attributes.position).getSize(new Vector3()).y;
    return { model, scale: 2 / height, glow, trails };
  }, [body, skin, normals]);

  useEffect(() => {
    const tip = new Vector3();
    const update = (delta, time) => {
      glow.update(time);
      for (const trail of trails) trail.update(trail.anchor.getWorldPosition(tip), camera.position);
    };
    afterMove.add(update);
    return () => afterMove.delete(update);
  }, [afterMove, glow, trails, camera]);
  useEffect(() => () => {
    model.traverse(object => object.material?.dispose());
    glow.dispose();
    for (const trail of trails) trail.dispose();
  }, [model, glow, trails]);

  return (
    <>
      <group scale={scale}>
        <primitive object={model} />
      </group>
      {/* Trails live in world space so they stay where the wingtips have been. */}
      {createPortal(trails.map((trail, i) => <primitive key={i} object={trail.object} />), scene)}
    </>
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
  const afterMove = useMemo(() => new Set(), []);

  useFrame(({ clock }, rawDelta) => {
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
    const follow = thumbnailMode ? 1 : 1 - Math.exp(-delta * CHASE.follow);
    if (state.lookAt.lengthSq() === 0) { camera.position.copy(desired); state.lookAt.copy(look); }
    camera.position.lerp(desired, follow);
    state.lookAt.lerp(look, follow);
    camera.lookAt(state.lookAt);

    for (const callback of afterMove) callback(delta, clock.elapsedTime);
  });

  return (
    <FlightContext.Provider value={afterMove}>
      <group ref={ref}>{children}</group>
    </FlightContext.Provider>
  );
}

function Skybox() {
  // Faces split from the "Daylight Box UV" cross layout, in Three's px, nx, py, ny, pz, nz order.
  const [texture] = useLoader(CubeTextureLoader, [['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(face => `skybox/${face}.jpg`)]);
  texture.colorSpace = SRGBColorSpace;
  return <primitive attach="background" object={texture} />;
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
  <Canvas camera={{ position: [0, 6, -6], fov: 55, far: 2000 }} dpr={[1, 2]}>
    {/* Dim sky fill, a low warm key from the front and a strong cool rim from behind. */}
    <hemisphereLight args={['#9cc4ff', '#2a3448', 0.35]} />
    <directionalLight position={[5, 1.5, 1]} intensity={3.5} color="#ffd2a0" />
    <directionalLight position={[-4, 3, -3]} intensity={4} color="#8fb8ff" />
    <Suspense fallback={null}>
      <Skybox />
      <Flight>
        <Jetfire />
      </Flight>
      <Ready />
    </Suspense>
  </Canvas>
);
