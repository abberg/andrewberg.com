import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, SRGBColorSpace, Sprite,
  SpriteMaterial, Vector3,
} from 'three';

export const GUNFIRE = {
  flashTime: 0.07, // seconds each muzzle flash shows
  flashSize: 16, // model units (the flash sits on the gun, inside the scaled model)
  boltSpeed: 30, // world units per second, on top of the gun's own velocity
  boltLife: 1.6,
  boltLength: 1.6,
  pool: 32,
  color: '#ffc36b',
  core: '#fff3d6',
  glow: 4, // brightness past white, so the bloom catches it
};

// A jagged star: spikes of random length around a hot centre, drawn once and rotated per shot.
function flashTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const centre = size / 2;
  const spikes = 11;
  context.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? centre * (0.55 + Math.random() * 0.45) : centre * (0.12 + Math.random() * 0.12);
    context.lineTo(centre + Math.cos(angle) * radius, centre + Math.sin(angle) * radius);
  }
  context.closePath();
  const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
  context.fillStyle = gradient;
  context.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createGunfire(settings = GUNFIRE) {
  const map = flashTexture();
  // Two layers, an orange spray and a white-hot core, each with its own material so they can spin separately.
  const flashes = [[settings.color, 1], [settings.core, 0.55]].map(([tint, size]) => {
    const sprite = new Sprite(new SpriteMaterial({
      map, color: new Color(tint).multiplyScalar(settings.glow), blending: AdditiveBlending, depthWrite: false, transparent: true,
    }));
    sprite.userData = { size, lensflare: 'no-occlusion' };
    sprite.visible = false;
    return sprite;
  });
  const flash = new Group();
  flash.add(...flashes);
  let flashTimer = 0;

  // Bolts: glowing streaks with a hot core, flying in world space.
  const bolts = new Group();
  const boltGeometry = new CylinderGeometry(0.05, 0.05, settings.boltLength, 6).rotateX(Math.PI / 2);
  const coreGeometry = new CylinderGeometry(0.02, 0.02, settings.boltLength * 0.9, 6).rotateX(Math.PI / 2);
  const boltMaterial = new MeshBasicMaterial({
    color: new Color(settings.color).multiplyScalar(settings.glow), blending: AdditiveBlending, depthWrite: false, transparent: true,
  });
  const coreMaterial = new MeshBasicMaterial({
    color: new Color(settings.core).multiplyScalar(settings.glow * 1.5), blending: AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pool = Array.from({ length: settings.pool }, () => {
    const bolt = new Group();
    const glow = new Mesh(boltGeometry, boltMaterial);
    const core = new Mesh(coreGeometry, coreMaterial);
    for (const part of [glow, core]) part.userData.lensflare = 'no-occlusion';
    bolt.add(glow, core);
    bolt.visible = false;
    bolts.add(bolt);
    return { bolt, velocity: new Vector3(), age: 0 };
  });
  const look = new Vector3();

  return {
    flash,
    bolts,
    // Fire one shot from `position` along `direction`, carried along by the shooter's `velocity`.
    fire(position, direction, velocity) {
      flashTimer = settings.flashTime;
      for (const sprite of flashes) {
        sprite.visible = true;
        sprite.material.rotation = Math.random() * Math.PI * 2;
        sprite.scale.setScalar(settings.flashSize * sprite.userData.size * (0.8 + Math.random() * 0.4));
      }
      const shot = pool.find(entry => !entry.bolt.visible) ?? pool.reduce((oldest, entry) => (entry.age > oldest.age ? entry : oldest));
      shot.age = 0;
      shot.velocity.copy(direction).normalize().multiplyScalar(settings.boltSpeed).add(velocity);
      // Start half a length ahead so the bolt leaves the muzzle rather than sitting inside the gun.
      shot.bolt.position.copy(position).addScaledVector(direction, settings.boltLength / 2);
      shot.bolt.lookAt(look.copy(shot.bolt.position).add(shot.velocity));
      shot.bolt.visible = true;
    },
    update(delta) {
      flashTimer -= delta;
      if (flashTimer <= 0) for (const sprite of flashes) sprite.visible = false;
      for (const shot of pool) {
        if (!shot.bolt.visible) continue;
        shot.age += delta;
        shot.bolt.position.addScaledVector(shot.velocity, delta);
        if (shot.age > settings.boltLife) shot.bolt.visible = false;
      }
    },
    dispose() {
      map.dispose();
      for (const sprite of flashes) sprite.material.dispose();
      boltGeometry.dispose();
      coreGeometry.dispose();
      boltMaterial.dispose();
      coreMaterial.dispose();
    },
  };
}
