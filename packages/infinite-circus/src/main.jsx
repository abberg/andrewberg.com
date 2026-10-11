import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import {
  AnimationClip, AnimationMixer, Box3, CubeTextureLoader, Group, LoopOnce, Mesh, MeshStandardMaterial, NumberKeyframeTrack,
  SRGBColorSpace, TextureLoader, Vector3,
} from 'three';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');

// Built directly rather than as JSX so the Mesh constructor sets up the morph targets for the geometry.
// Normal maps were generated from the skins with DeepBump.
function md2Mesh(geometry, skin, normalMap) {
  skin.colorSpace = SRGBColorSpace;
  return new Mesh(geometry, new MeshStandardMaterial({ map: skin, normalMap, roughness: 0.6, flatShading: true }));
}

// Looping performance. The weapon only has frames for the robot animations, so it is hidden
// while Jetfire transforms or flies as a jet.
const SEQUENCE = [
  { clip: 'stand' },
  { clip: 'taunt' },
  { clip: 'transformdn', hideWeapon: true },
  { clip: 'jet', hold: 3, hideWeapon: true },
  { clip: 'transformup', hideWeapon: true },
];
const FPS = 10;
const CROSSFADE = 0.15;

function clipsFor(geometry) {
  // Play-once clips that end on their last frame instead of wrapping back to the first.
  const clips = AnimationClip.CreateClipsFromMorphTargetSequences(geometry.morphAttributes.position, FPS, true);
  for (const { clip, hold } of SEQUENCE) {
    if (!hold) continue;
    const frame = geometry.morphAttributes.position.find(target => target.name.startsWith(clip));
    if (frame) clips.push(new AnimationClip(clip, hold, [new NumberKeyframeTrack(`.morphTargetInfluences[${frame.name}]`, [0, hold], [1, 1])]));
  }
  return clips;
}

function playSequence(mixer, [body, weapon]) {
  const actions = [body, weapon].map(mesh => {
    const clips = clipsFor(mesh.geometry);
    return SEQUENCE.map(({ clip }) => {
      const found = clips.findLast(candidate => candidate.name === clip);
      if (!found) return null;
      const action = mixer.clipAction(found, mesh);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      return action;
    });
  });
  let step = -1;
  const advance = () => {
    const previous = step;
    step = (step + 1) % SEQUENCE.length;
    weapon.visible = !SEQUENCE[step].hideWeapon;
    for (const meshActions of actions) {
      const next = meshActions[step];
      const prev = previous >= 0 ? meshActions[previous] : null;
      if (!next) { prev?.stop(); continue; }
      next.reset().play();
      if (prev) next.crossFadeFrom(prev, CROSSFADE);
    }
  };
  mixer.addEventListener('finished', event => { if (event.action === actions[0][step]) advance(); });
  advance();
}

function Jetfire() {
  const [body, weapon] = useLoader(MD2Loader, ['jetfire/tris.md2', 'jetfire/weapon.md2']);
  const [bodySkin, weaponSkin, bodyNormals, weaponNormals] = useLoader(TextureLoader, [
    'jetfire/vf1s_fokker.jpg', 'jetfire/weapon.jpg', 'jetfire/vf1s_fokker_normal.jpg', 'jetfire/weapon_normal.jpg',
  ]);

  const { group, mixer, scale } = useMemo(() => {
    const group = new Group();
    const meshes = [md2Mesh(body, bodySkin, bodyNormals), md2Mesh(weapon, weaponSkin, weaponNormals)];
    // Centre on the body and scale it to roughly two units tall. The weapon shares the body's
    // coordinate space and frame list, so it gets the same offset and plays in step.
    const box = new Box3().setFromBufferAttribute(body.attributes.position);
    group.position.copy(box.getCenter(new Vector3()).negate());
    group.add(...meshes);
    const mixer = new AnimationMixer(group);
    playSequence(mixer, meshes);
    return { group, mixer, scale: 2 / box.getSize(new Vector3()).y };
  }, [body, weapon, bodySkin, weaponSkin, bodyNormals, weaponNormals]);

  useEffect(() => () => {
    mixer.stopAllAction();
    group.traverse(object => object.material?.dispose());
  }, [group, mixer]);
  useFrame((_, delta) => { if (!thumbnailMode) mixer.update(delta); });

  return (
    <group scale={scale}>
      <primitive object={group} />
    </group>
  );
}

function Skybox() {
  // Faces split from the "Daylight Box UV" cross layout, in Three's px, nx, py, ny, pz, nz order.
  const [texture] = useLoader(CubeTextureLoader, [['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(face => `skybox/${face}.jpg`)]);
  texture.colorSpace = SRGBColorSpace;
  return <primitive attach="background" object={texture} />;
}

function Controls() {
  const camera = useThree(state => state.camera);
  const domElement = useThree(state => state.gl.domElement);
  const controls = useMemo(() => new OrbitControls(camera, domElement), [camera, domElement]);
  useEffect(() => {
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    return () => controls.dispose();
  }, [controls]);
  useFrame(() => controls.update());
  return null;
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
  <Canvas camera={{ position: [3, 1, 3], fov: 45 }} dpr={[1, 2]}>
    {/* Dim sky fill, a low warm key from the front and a strong cool rim from behind. */}
    <hemisphereLight args={['#9cc4ff', '#2a3448', 0.35]} />
    <directionalLight position={[5, 1.5, 1]} intensity={3.5} color="#ffd2a0" />
    <directionalLight position={[-4, 3, -3]} intensity={4} color="#8fb8ff" />
    <Controls />
    <Suspense fallback={null}>
      <Skybox />
      <Jetfire />
      <Ready />
    </Suspense>
  </Canvas>
);
