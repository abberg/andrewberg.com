import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { PCXLoader } from './PCXLoader.js';

const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');

function Jetfire() {
  const geometry = useLoader(MD2Loader, 'jetfire/tris.md2');
  const skin = useLoader(PCXLoader, 'jetfire/vf1s_fokker.pcx');

  // Built directly rather than as JSX so the Mesh constructor sets up the morph targets for this geometry.
  const { mesh, mixer, scale } = useMemo(() => {
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ map: skin, roughness: 0.8 }));
    const box = new Box3().setFromBufferAttribute(geometry.attributes.position);
    // Centre the model on the origin and scale it to roughly two units tall.
    mesh.position.copy(box.getCenter(new Vector3()).negate());
    const mixer = new AnimationMixer(mesh);
    if (geometry.animations.length) mixer.clipAction(geometry.animations[0]).play();
    return { mesh, mixer, scale: 2 / box.getSize(new Vector3()).y };
  }, [geometry, skin]);

  useEffect(() => () => { mixer.stopAllAction(); mesh.material.dispose(); }, [mesh, mixer]);
  useFrame((_, delta) => { if (!thumbnailMode) mixer.update(delta); });

  return (
    <group scale={scale}>
      <primitive object={mesh} />
    </group>
  );
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
    <ambientLight intensity={0.8} />
    <directionalLight position={[3, 4, 5]} intensity={2} />
    <Suspense fallback={null}>
      <Jetfire />
      <Ready />
    </Suspense>
  </Canvas>
);
