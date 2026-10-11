import { AdditiveBlending, CanvasTexture, Color, Group, PointLight, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// A flickering blue exhaust glow: a wide halo and a hot core per nozzle, plus a light on the tail.
// Positions and sizes are in the model's own units. The core is pushed past full brightness so the
// bloom pass picks it up.
export function createEngineGlow(nozzles, { color = '#3d7bff', core = '#d8ecff', size = 18, coreBoost = 3 } = {}) {
  const map = glowTexture();
  const materials = [[color, 1], [core, coreBoost]].map(([tint, boost]) => new SpriteMaterial({
    map, color: new Color(tint).multiplyScalar(boost), blending: AdditiveBlending, depthWrite: false, transparent: true,
  }));
  const group = new Group();
  const sprites = [];
  for (const nozzle of nozzles) {
    const halo = new Sprite(materials[0]);
    const hot = new Sprite(materials[1]);
    halo.position.copy(nozzle);
    hot.position.copy(nozzle);
    group.add(halo, hot);
    sprites.push({ halo, hot });
  }
  const light = new PointLight(color, 2, 3, 2);
  light.position.copy(nozzles.reduce((sum, nozzle) => sum.add(nozzle), new Vector3()).divideScalar(nozzles.length));
  group.add(light);

  return {
    object: group,
    update(time) {
      for (const [i, { halo, hot }] of sprites.entries()) {
        const flicker = 1 + 0.08 * Math.sin(time * 41 + i * 2.1) + 0.05 * Math.sin(time * 67 + i);
        halo.scale.setScalar(size * flicker);
        hot.scale.setScalar(size * 0.4 * flicker);
      }
      light.intensity = 2 * (1 + 0.1 * Math.sin(time * 53));
    },
    dispose() {
      map.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
