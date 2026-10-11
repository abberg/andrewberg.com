import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, PointLight, ShaderMaterial, SRGBColorSpace,
  Sprite, SpriteMaterial, Vector3,
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

// An open flared tube that is brightest at the nozzle and fades to nothing at its wide end, a little
// dimmer where it is seen edge-on, so it reads as a soft plume rather than a solid shape.
function plumeMaterial(core, color, boost) {
  return new ShaderMaterial({
    uniforms: {
      core: { value: new Color(core).multiplyScalar(boost) },
      edge: { value: new Color(color) },
    },
    vertexShader: /* glsl */`
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = -position.x; // the geometry runs from the nozzle at x = 0 to the wide end at x = -1
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vView = -viewPosition.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 core;
      uniform vec3 edge;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float fade = pow(1.0 - vAlong, 2.0) * (0.35 + 0.65 * facing) * 0.6;
        gl_FragColor = vec4(mix(core, edge, vAlong) * fade, 1.0);
      }
    `,
    blending: AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: DoubleSide,
  });
}

// A flickering blue exhaust per nozzle: a plume flaring out aft (-X), a hot core and a small halo at the
// nozzle, plus a light on the tail. Positions and sizes are in the model's own units. The core is pushed
// past full brightness so the bloom pass picks it up.
export function createEngineGlow(nozzles, {
  color = '#3d7bff', core = '#d8ecff', size = 10, coreBoost = 3, radius = 2.5, flare = 9, length = 26, pulse = 0.25,
} = {}) {
  const map = glowTexture();
  const materials = [[color, 1], [core, coreBoost]].map(([tint, boost]) => new SpriteMaterial({
    map, color: new Color(tint).multiplyScalar(boost), blending: AdditiveBlending, depthWrite: false, transparent: true,
  }));
  const plume = plumeMaterial(core, color, coreBoost);
  // Narrow end at the nozzle, flaring out aft: turn the tube's +Y end round to -X and shift it back by half its length.
  const cone = new CylinderGeometry(flare, radius, 1, 24, 8, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);
  const group = new Group();
  const parts = [];
  for (const nozzle of nozzles) {
    const halo = new Sprite(materials[0]);
    const hot = new Sprite(materials[1]);
    const flame = new Mesh(cone, plume);
    for (const object of [halo, hot, flame]) {
      object.position.copy(nozzle);
      object.userData.lensflare = 'no-occlusion'; // glow shouldn't hide the sun's lens flare
    }
    group.add(flame, halo, hot);
    parts.push({ halo, hot, flame });
  }
  const light = new PointLight(color, 2, 3, 2);
  light.position.copy(nozzles.reduce((sum, nozzle) => sum.add(nozzle), new Vector3()).divideScalar(nozzles.length));
  group.add(light);

  return {
    object: group,
    update(time) {
      const t = time * pulse; // slows the flicker without changing its shape
      // Both engines pulse together.
      const flicker = 1 + 0.08 * Math.sin(t * 41) + 0.05 * Math.sin(t * 67);
      for (const { halo, hot, flame } of parts) {
        halo.scale.setScalar(size * flicker);
        hot.scale.setScalar(size * 0.5 * flicker);
        flame.scale.set(length * flicker, 1, 1);
      }
      light.intensity = 2 * (1 + 0.1 * Math.sin(t * 53));
    },
    dispose() {
      map.dispose();
      cone.dispose();
      plume.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
