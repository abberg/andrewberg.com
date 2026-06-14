import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  PCFSoftShadowMap,
  DirectionalLight,
  AmbientLight,
  Vector3,
  MeshLambertMaterial,
  ShadowMaterial,
} from 'three/build/three.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export function createModelBase() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    1,
    50
  );
  const renderer = new WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xdddddd);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);

  const ssaoPass = new SSAOPass(
    scene,
    camera,
    window.innerWidth,
    window.innerHeight
  );
  ssaoPass.kernelRadius = 0.22;
  ssaoPass.minDistance = 0.0007;
  ssaoPass.maxDistance = 0.015;
  composer.addPass(ssaoPass);

  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms['resolution'].value.x = 1 / window.innerWidth;
  fxaaPass.material.uniforms['resolution'].value.y = 1 / window.innerHeight;
  composer.addPass(fxaaPass);

  const keyLight = new DirectionalLight(0xffffff, 0.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 128;
  keyLight.shadow.mapSize.height = 128;
  scene.add(keyLight);

  const ambientLight = new AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const baseMaterial = new MeshLambertMaterial({ color: 0xc19a6c });

  const shadowMaterial = new ShadowMaterial();
  shadowMaterial.transparent = true;
  shadowMaterial.opacity = 0.3;

  let radius = 9;
  const yPos = 6;
  const cameraLookTarget = new Vector3(0, 0, 0);

  let autoRotate = true;
  let velocity = 0;
  let t = 0;

  function update() {
    if (autoRotate) {
      t += 0.003;
    } else {
      if (Math.abs(velocity) > 0.001) {
        t += velocity;
        velocity *= 0.88;
      }
    }
    const xPos = Math.sin(t) * radius;
    const zPos = Math.cos(t) * radius;
    camera.position.set(xPos, yPos, zPos);
    camera.lookAt(cameraLookTarget);
  }

  let resumeInterval = -1;
  let previousX = 0;
  document.body.addEventListener('mousedown', handleDownAndStart);
  document.body.addEventListener('mouseup', handleUpAndEnd);
  document.body.addEventListener('touchstart', handleDownAndStart);
  document.body.addEventListener('touchend', handleUpAndEnd);

  function handleDownAndStart(event) {
    previousX = event.pageX || event.changedTouches[0].pageX;
    autoRotate = false;
    document.body.addEventListener('mousemove', handleMove, { passive: false });
    document.body.addEventListener('touchmove', handleMove, { passive: false });
    clearInterval(resumeInterval);
  }

  function handleMove(event) {
    event.preventDefault();
    const pageX = event.pageX || event.changedTouches[0].pageX;
    const movementX = pageX - previousX;
    velocity -= movementX * 0.001;
    previousX = pageX;
  }

  function handleUpAndEnd() {
    document.body.removeEventListener('mousemove', handleMove);
    document.body.removeEventListener('touchmove', handleMove);
    resumeInterval = setInterval(() => {
      autoRotate = true;
    }, 2000);
  }

  document.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const scrollVelocity = event.deltaY * 0.05;
      const minRadius = 6;
      const maxRadius = 12;
      if (radius + scrollVelocity < minRadius) {
        radius = minRadius;
      } else if (radius + scrollVelocity > maxRadius) {
        radius = maxRadius;
      } else {
        radius += scrollVelocity;
      }
    },
    { passive: false }
  );

  function render() {
    //renderer.render(scene, camera);
    composer.render();
  }

  function handleAnimationFrame() {
    window.requestAnimationFrame(handleAnimationFrame);
    update();
    render();
  }

  function handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    composer.setSize(width, height);

    fxaaPass.material.uniforms['resolution'].value.x = 1 / window.innerWidth;
    fxaaPass.material.uniforms['resolution'].value.y = 1 / window.innerHeight;
  }

  function debounce(callback, wait) {
    let timeoutId = null;
    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        callback.apply(null, args);
      }, wait);
    };
  }

  window.addEventListener('resize', debounce(handleResize, 300), false);

  return {
    scene: scene,
    camera: camera,
    cameraLookTarget: cameraLookTarget,
    setCameraRadius: (r) => {
      radius = r;
    },
    renderer: renderer,
    keyLight: keyLight,
    baseMaterial,
    shadowMaterial,
    start: () => {
      handleAnimationFrame();
    },
  };
}
