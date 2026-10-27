import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useGLTF } from '@react-three/drei';
import { BallCollider, ConvexHullCollider, CuboidCollider, Physics, RigidBody } from '@react-three/rapier';
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { BackSide, CanvasTexture, Color, MathUtils, SRGBColorSpace, ShaderMaterial, Vector3 } from 'three';

import heads from './heads.json';
import { headMaterial } from './headMaterial.js';

const url = (code) => `${import.meta.env.BASE_URL}heads/${code}.glb`;
// ?debug draws the colliders.
const debug = new URLSearchParams(location.search).has('debug');
// ?thumbnail=1 leaves out the pointer and flags the page ready once the cloud
// has gathered (see scripts/thumbnails.mjs at the root).
const thumbnail = new URLSearchParams(location.search).has('thumbnail');

// After pmndrs' Christmas baubles example: no gravity, every head pulled
// towards the middle each frame (harder vertically, so the cloud spreads
// sideways), and a ball on the pointer that knocks them about. The heads are
// from the set (see scripts/picks.json), all at one scale, so they keep the
// sizes they have in the game (bar the smallest, grown a little; see
// scripts/extract-heads.mjs): one of the large heads, picked at random, and
// one each of the rest, 50 in all.
const scale = 0.85;
const large = heads.filter((head) => head.large);
const rest = heads.filter((head) => !head.large);
const bodies = [large[Math.floor(Math.random() * large.length)], ...rest].map((head) => ({ head, scale: scale * head.grow }));
const pull = new Vector3(-12, -36, -12);

// Each head's colliders (see scripts/head.mjs): a convex hull round the
// skull, and a box along each spike.
function Head({ head: { code, colliders }, scale }) {
  const { scene } = useGLTF(url(code));
  const model = useMemo(() => {
    const copy = scene.clone();
    copy.traverse((object) => {
      if (!object.isMesh) return;
      object.material = headMaterial(object.material);
      object.castShadow = object.receiveShadow = true;
    });
    return copy;
  }, [scene]);
  const skull = useMemo(() => new Float32Array(colliders.skull.map((x) => x * scale)), [colliders, scale]);
  const body = useRef();
  const toward = useMemo(() => new Vector3(), []);
  const position = useMemo(() => [MathUtils.randFloatSpread(20), MathUtils.randFloatSpread(20) - 25, MathUtils.randFloatSpread(20) - 10], []);
  useFrame((_, delta) => {
    if (!body.current) return;
    const step = Math.min(0.1, delta) * body.current.mass();
    toward.copy(body.current.translation()).normalize().multiply(pull).multiplyScalar(step);
    body.current.applyImpulse(toward, false);
  });
  return (
    <RigidBody ref={body} colliders={false} position={position} linearDamping={0.75} angularDamping={0.15} friction={0.2}>
      <primitive object={model} scale={scale} />
      <ConvexHullCollider args={[skull]} />
      {colliders.spikes.map((spike, i) => (
        <CuboidCollider key={i} args={spike.args.map((x) => x * scale)} position={spike.position.map((x) => x * scale)} rotation={spike.rotation} />
      ))}
    </RigidBody>
  );
}

// A kinematic ball that follows the pointer, eased, on the plane through the middle.
function Pointer() {
  const body = useRef();
  const target = useMemo(() => new Vector3(), []);
  useFrame(({ pointer, viewport }) => {
    target.lerp({ x: (pointer.x * viewport.width) / 2, y: (pointer.y * viewport.height) / 2, z: 0 }, 0.2);
    body.current?.setNextKinematicTranslation(target);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[100, 100, 100]}>
      <BallCollider args={[2]} />
    </RigidBody>
  );
}

// Marks the page ready for its thumbnail once the heads have had a while to
// gather, counted as the pull counts time, so slow frames don't rush it.
function Ready() {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += Math.min(0.1, delta);
    if (elapsed.current > 8) document.documentElement.dataset.thumbnailReady = 'true';
  });
  return null;
}

// A vertical gradient for the background, lighter at the bottom. A flat texture
// as the scene's background is drawn to fill the screen, whatever the camera does.
const background = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0c0d10');
  gradient.addColorStop(1, '#2c313b');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
})();

// The environment's walls: light grey, with a warm glow welling up from the
// floor. The colour follows the direction from the middle rather than the box's
// faces, so it fades smoothly from straight below to the grey around the sides
// and the clearcoat never picks up an edge. `fade` is how high (from -1,
// straight down, to 1, straight up) the glow has gone by.
const room = new ShaderMaterial({
  side: BackSide,
  uniforms: {
    grey: { value: new Color('#aaa') },
    glow: { value: new Color('#b55031').multiplyScalar(1.5) },
    fade: { value: -0.1 },
  },
  vertexShader: `
    varying vec3 vDirection;
    void main() {
      vDirection = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 grey;
    uniform vec3 glow;
    uniform float fade;
    varying vec3 vDirection;
    void main() {
      float t = smoothstep(-1.0, fade, normalize(vDirection).y);
      gl_FragColor = vec4(mix(glow, grey, t), 1.0);
      #include <colorspace_fragment>
    }
  `,
});

export function App() {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 20], fov: 32.5, near: 1, far: 100 }}>
      <primitive attach="background" object={background} />
      <ambientLight intensity={0.4} />
      {/* The shadow camera covers the cloud and no more, for sharper shadows. */}
      <directionalLight
        position={[5, 8, 6]}
        intensity={5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.04}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      {/* A cool rim light from behind and above, catching the edges. */}
      <directionalLight position={[-3, 6, -12]} color="#8fb8ff" intensity={3} />
      <Environment resolution={256}>
        {/* A light grey room with a warm floor, for soft reflections in the clearcoat. */}
        <mesh scale={[40, 20, 40]} material={room}>
          <boxGeometry />
        </mesh>
      </Environment>
      <Suspense fallback={null}>
        <Physics gravity={[0, 0, 0]} debug={debug}>
          {!thumbnail && <Pointer />}
          {bodies.map((body, i) => (
            <Head key={i} {...body} />
          ))}
        </Physics>
        {thumbnail && <Ready />}
      </Suspense>
      <EffectComposer>
        <N8AO aoRadius={3} distanceFalloff={1} intensity={5} quality="high" />
        {/* Rolls off highlights instead of clipping them to pastel, keeping hue. */}
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
    </Canvas>
  );
}
