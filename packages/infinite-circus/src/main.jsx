import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { AnimationMixer, Box3, CubeTextureLoader, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');

// Built directly rather than as JSX so the Mesh constructor sets up the morph targets for the geometry.
// Normal maps were generated from the skins with DeepBump.
function md2Mesh(geometry, skin, normalMap) {
  skin.colorSpace = SRGBColorSpace;
  return new Mesh(geometry, new MeshStandardMaterial({ map: skin, normalMap, roughness: 0.8, flatShading: true }));
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
    const mixer = new AnimationMixer(group);
    for (const mesh of meshes) {
      group.add(mesh);
      if (mesh.geometry.animations.length) mixer.clipAction(mesh.geometry.animations[0], mesh).play();
    }
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
    <ambientLight intensity={0.8} />
    <directionalLight position={[3, 4, 5]} intensity={2} />
    <Controls />
    <Suspense fallback={null}>
      <Skybox />
      <Jetfire />
      <Ready />
    </Suspense>
  </Canvas>
);
