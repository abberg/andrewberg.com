import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Group, Mesh, MeshBasicMaterial,
  PointLight, SRGBColorSpace, Sprite, SpriteMaterial, Vector3,
} from 'three';

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
// Positions and sizes are in the model's own units.
export function createEngineGlow(nozzles, { color = '#3d7bff', core = '#d8ecff', size = 18 } = {}) {
  const map = glowTexture();
  const materials = [color, core].map(tint => new SpriteMaterial({
    map, color: tint, blending: AdditiveBlending, depthWrite: false, transparent: true,
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

// A world-space ribbon that follows a point, turned to face the camera and fading out along its length.
// Points are laid down every `spacing` units travelled, so its length doesn't depend on frame rate.
export function createTrail({ length = 32, spacing = 0.08, width = 0.05, color = '#ffffff', opacity = 0.7 } = {}) {
  const points = [];
  const positions = new Float32Array(length * 2 * 3);
  const colors = new Float32Array(length * 2 * 4);
  const indices = [];
  for (let i = 0; i < length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  const tint = new Color(color);
  const along = new Vector3();
  const toCamera = new Vector3();
  const side = new Vector3();

  return {
    object: mesh,
    // Adds the latest point and rebuilds the ribbon around it.
    update(point, cameraPosition) {
      // The newest point tracks the anchor exactly; a new one is started once it has moved far enough.
      if (points.length < 2 || points.at(-1).distanceTo(points.at(-2)) >= spacing) {
        points.push(points.length >= length ? points.shift().copy(point) : point.clone());
      } else {
        points.at(-1).copy(point);
      }
      const count = points.length;
      for (let i = 0; i < count; i++) {
        const p = points[count - 1 - i]; // newest first
        const next = points[Math.max(0, count - 2 - i)];
        const prev = points[Math.min(count - 1, count - i)];
        along.subVectors(prev, next);
        toCamera.subVectors(cameraPosition, p);
        side.crossVectors(along, toCamera).normalize();
        const fade = 1 - i / (length - 1);
        side.multiplyScalar(width * 0.5 * (0.3 + 0.7 * fade));
        positions.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        const alpha = opacity * fade * fade;
        colors.set([tint.r, tint.g, tint.b, alpha, tint.r, tint.g, tint.b, alpha], i * 8);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
      geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
