import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';

// Placeholder scene until the real one is decided.
const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');

function Spinner() {
  const mesh = useRef();
  useFrame((_, delta) => {
    if (thumbnailMode) return;
    mesh.current.rotation.x += delta * 0.4;
    mesh.current.rotation.y += delta * 0.6;
  });
  return (
    <mesh ref={mesh} rotation={[0.4, 0.6, 0]}>
      <torusKnotGeometry args={[1, 0.32, 200, 32]} />
      <meshStandardMaterial color="#e94f37" roughness={0.4} />
    </mesh>
  );
}

function markReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.dataset.thumbnailReady = 'true';
  }));
}

createRoot(document.getElementById('root')).render(
  <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]} onCreated={markReady}>
    <ambientLight intensity={0.4} />
    <directionalLight position={[3, 4, 5]} intensity={2} />
    <Spinner />
  </Canvas>
);
