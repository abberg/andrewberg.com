import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, Sprite, SpriteMaterial, Vector3,
} from 'three';

// Itano Circus missiles. Each one is a boid steered by Reynolds-style behaviours: pursuit of the jet
// (aiming where it will be), separation from its neighbours, and a rotating sideways push that makes it
// corkscrew. Limited turning force means they overshoot and swing round rather than snapping on target.
// They launch in volleys from just behind the chase camera, leave long smoke trails, and are recycled once
// spent. There are always at least `minFlying` in the air.
export const MISSILES = {
  pool: 40,
  minFlying: 10, // topped up with a fresh launch whenever fewer are flying
  volley: [8, 14], // missiles per extra volley
  every: [5, 9], // seconds between extra volleys
  firstVolley: 2,
  spawnBehindCamera: [1.5, 4], // how far behind the camera a launch starts
  spawnSpread: 2.5, // how far apart a volley's missiles start
  maxSpeed: 17.5, // faster than the boosting jet (15.6), so a boost can't shake them for long
  minSpeed: 7,
  maxForce: 14, // limits how hard they can turn
  separation: { radius: 1.5, weight: 6 },
  spiral: { force: [3, 7], frequency: [4, 9] }, // corkscrew push and its turns per second (radians)
  nearMiss: 0.8, // closer than this, a missile stops seeking and flies on
  life: [7, 10],
  explosion: { time: 0.45, size: [0.3, 3.2], color: '#ffb46b', glow: 4, pool: 16 },
  trail: { spacing: 0.3, maxAge: 3.5, width: [0.04, 0.22], opacity: 0.6, color: '#f5f0e6', fadeOut: 2.5 },
};

const between = ([min, max]) => min + Math.random() * (max - min);

function glowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

// A camera-facing ribbon through timestamped points, widening and fading with age like spreading smoke.
function createSmoke(settings) {
  const capacity = Math.ceil((settings.maxAge * MISSILES.maxSpeed) / settings.spacing) + 8;
  const points = []; // { position, time }
  const positions = new Float32Array(capacity * 2 * 3);
  const colors = new Float32Array(capacity * 2 * 4);
  const indices = [];
  for (let i = 0; i < capacity - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.lensflare = 'no-occlusion';
  const tint = new Color(settings.color);
  const along = new Vector3();
  const toCamera = new Vector3();
  const side = new Vector3();

  return {
    object: mesh,
    get empty() { return points.length === 0; },
    reset() {
      points.length = 0;
      geometry.setDrawRange(0, 0);
    },
    // `head` is the missile's position, or null once it has stopped emitting. `fade` scales the whole trail.
    update(head, time, cameraPosition, fade) {
      if (head) {
        const last = points.at(-1);
        const before = points.at(-2);
        if (!last || !before || last.position.distanceTo(before.position) >= settings.spacing) {
          points.push({ position: head.clone(), time });
        } else {
          last.position.copy(head);
          last.time = time;
        }
      }
      while (points.length && (time - points[0].time > settings.maxAge || points.length > capacity)) points.shift();
      const count = points.length;
      for (let i = 0; i < count; i++) {
        const { position: p, time: born } = points[i];
        const age = Math.min((time - born) / settings.maxAge, 1);
        const prev = points[Math.max(i - 1, 0)].position;
        const next = points[Math.min(i + 1, count - 1)].position;
        along.subVectors(next, prev);
        toCamera.subVectors(cameraPosition, p);
        side.crossVectors(along, toCamera).normalize().multiplyScalar(
          (settings.width[0] + (settings.width[1] - settings.width[0]) * Math.sqrt(age)) / 2,
        );
        positions.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
        const alpha = settings.opacity * (1 - age) * (1 - age) * fade;
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

export function createMissileSwarm(settings = MISSILES) {
  const group = new Group();
  const bodyGeometry = new CylinderGeometry(0.035, 0.035, 0.32, 8).rotateX(Math.PI / 2);
  const noseGeometry = new ConeGeometry(0.035, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.21);
  const bodyMaterial = new MeshStandardMaterial({ color: '#d9dde3', roughness: 0.5, metalness: 0.3 });
  const glowMap = glowTexture();
  // Pinkish exhaust, pushed past white so the bloom catches it.
  const flameMaterial = new SpriteMaterial({
    map: glowMap, color: new Color('#ffb3d9').multiplyScalar(3), blending: AdditiveBlending, depthWrite: false, transparent: true,
  });

  const missiles = Array.from({ length: settings.pool }, () => {
    const body = new Group();
    const shell = new Mesh(bodyGeometry, bodyMaterial);
    const nose = new Mesh(noseGeometry, bodyMaterial);
    const flame = new Sprite(flameMaterial);
    flame.position.z = -0.2;
    flame.scale.setScalar(0.35);
    for (const part of [shell, nose, flame]) part.userData.lensflare = 'no-occlusion';
    body.add(shell, nose, flame);
    body.visible = false;
    const smoke = createSmoke(settings.trail);
    group.add(body, smoke.object);
    return {
      body, flame, smoke,
      state: 'idle', // idle, flying, or fading (trail dissolving after the missile is spent)
      position: new Vector3(), velocity: new Vector3(),
      age: 0, life: 0, fade: 1, seeking: true,
      spiralForce: 0, spiralFrequency: 0, spiralPhase: 0,
    };
  });

  const scratch = {
    desired: new Vector3(), steer: new Vector3(), away: new Vector3(), predicted: new Vector3(),
    u: new Vector3(), w: new Vector3(), up: new Vector3(0, 1, 0), look: new Vector3(), forward: new Vector3(),
  };
  let volleyTimer = settings.firstVolley;
  const flyingPositions = [];

  // Explosions: an additive fireball that swells and fades where a missile is shot down.
  const explosionMaterial = new SpriteMaterial({
    map: glowMap, color: new Color(settings.explosion.color).multiplyScalar(settings.explosion.glow),
    blending: AdditiveBlending, depthWrite: false, transparent: true,
  });
  const explosions = Array.from({ length: settings.explosion.pool }, () => {
    const sprite = new Sprite(explosionMaterial.clone());
    sprite.visible = false;
    sprite.userData = { age: 0, lensflare: 'no-occlusion' };
    group.add(sprite);
    return sprite;
  });
  function explode(position) {
    const sprite = explosions.find(entry => !entry.visible) ?? explosions.reduce((a, b) => (a.userData.age > b.userData.age ? a : b));
    sprite.position.copy(position);
    sprite.userData.age = 0;
    sprite.material.rotation = Math.random() * Math.PI * 2;
    sprite.visible = true;
  }
  const closest = new Vector3();
  const segment = new Vector3();

  function launch(count, target, cameraPosition) {
    const idle = missiles.filter(missile => missile.state === 'idle').slice(0, count);
    // Launch from just behind the camera, so the volley streams past it towards the jet.
    const away = scratch.forward.subVectors(cameraPosition, target).normalize();
    const origin = new Vector3().copy(cameraPosition).addScaledVector(away, between(settings.spawnBehindCamera));
    for (const missile of idle) {
      missile.state = 'flying';
      missile.position.copy(origin)
        .add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(settings.spawnSpread * 2));
      // Launch roughly towards the jet, fanned out, at a little under full speed.
      missile.velocity.subVectors(target, missile.position).normalize()
        .add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.8))
        .normalize().multiplyScalar(settings.maxSpeed * 0.7);
      missile.age = 0;
      missile.life = between(settings.life);
      missile.fade = 1;
      missile.seeking = true;
      missile.spiralForce = between(settings.spiral.force);
      missile.spiralFrequency = between(settings.spiral.frequency) * (Math.random() < 0.5 ? -1 : 1);
      missile.spiralPhase = Math.random() * Math.PI * 2;
      missile.body.visible = true;
      missile.smoke.reset();
    }
  }

  function steer(missile, target, targetVelocity, delta) {
    const { desired, steer: force, away, predicted, u, w, up } = scratch;
    force.set(0, 0, 0);
    // Pursuit: aim where the jet will be by the time we could get there.
    if (missile.seeking) {
      const distance = missile.position.distanceTo(target);
      if (distance < settings.nearMiss) missile.seeking = false;
      const lead = Math.min(distance / settings.maxSpeed, 1.5);
      predicted.copy(target).addScaledVector(targetVelocity, lead);
      desired.subVectors(predicted, missile.position).normalize().multiplyScalar(settings.maxSpeed);
      force.add(desired.sub(missile.velocity));
    }
    // Separation: push away from close neighbours, more strongly the closer they are.
    for (const other of missiles) {
      if (other === missile || other.state !== 'flying') continue;
      away.subVectors(missile.position, other.position);
      const d = away.length();
      if (d > 0 && d < settings.separation.radius) force.addScaledVector(away, settings.separation.weight / (d * d));
    }
    // Corkscrew: a sideways push that rotates around the direction of travel.
    u.crossVectors(missile.velocity, up);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    w.crossVectors(missile.velocity, u).normalize();
    missile.spiralPhase += missile.spiralFrequency * delta;
    force.addScaledVector(u, Math.cos(missile.spiralPhase) * missile.spiralForce)
      .addScaledVector(w, Math.sin(missile.spiralPhase) * missile.spiralForce);

    if (force.length() > settings.maxForce) force.setLength(settings.maxForce);
    missile.velocity.addScaledVector(force, delta);
    const speed = missile.velocity.length();
    if (speed > settings.maxSpeed) missile.velocity.setLength(settings.maxSpeed);
    else if (speed < settings.minSpeed) missile.velocity.setLength(settings.minSpeed);
    missile.position.addScaledVector(missile.velocity, delta);
  }

  return {
    object: group,
    // Positions of the missiles in flight this frame (shared array, valid until the next update).
    // Destroys the first missile within `radius` of the segment `from`-`to` (a bolt's path this frame).
    hit(from, to, radius) {
      segment.subVectors(to, from);
      const lengthSq = segment.lengthSq();
      for (const missile of missiles) {
        if (missile.state !== 'flying') continue;
        const t = lengthSq > 0 ? Math.min(Math.max(closest.subVectors(missile.position, from).dot(segment) / lengthSq, 0), 1) : 0;
        closest.copy(from).addScaledVector(segment, t);
        if (closest.distanceTo(missile.position) > radius) continue;
        explode(missile.position);
        missile.state = 'fading';
        missile.body.visible = false;
        return true;
      }
      return false;
    },
    // The flying missile nearest `position` within `range`, or null.
    nearest(position, range) {
      let best = null;
      let bestDistance = range;
      for (const missile of missiles) {
        if (missile.state !== 'flying') continue;
        const distance = missile.position.distanceTo(position);
        if (distance < bestDistance) { best = missile; bestDistance = distance; }
      }
      return best;
    },
    flying() {
      flyingPositions.length = 0;
      for (const missile of missiles) if (missile.state === 'flying') flyingPositions.push(missile.position);
      return flyingPositions;
    },
    update(delta, time, target, targetVelocity, cameraPosition) {
      if (delta > 0) {
        const flying = missiles.filter(missile => missile.state === 'flying').length;
        if (flying < settings.minFlying) launch(settings.minFlying - flying, target, cameraPosition);
        volleyTimer -= delta;
        if (volleyTimer <= 0) {
          launch(Math.round(between(settings.volley)), target, cameraPosition);
          volleyTimer = between(settings.every);
        }
      }
      for (const sprite of explosions) {
        if (!sprite.visible) continue;
        sprite.userData.age += delta;
        const t = sprite.userData.age / settings.explosion.time;
        if (t >= 1) { sprite.visible = false; continue; }
        sprite.scale.setScalar(settings.explosion.size[0] + (settings.explosion.size[1] - settings.explosion.size[0]) * Math.sqrt(t));
        sprite.material.opacity = 1 - t * t;
      }
      for (const missile of missiles) {
        if (missile.state === 'idle') continue;
        if (missile.state === 'flying') {
          steer(missile, target, targetVelocity, delta);
          missile.age += delta;
          missile.body.position.copy(missile.position);
          missile.body.lookAt(scratch.look.copy(missile.position).add(missile.velocity));
          missile.flame.scale.setScalar(0.3 + 0.08 * Math.sin(time * 40 + missile.spiralPhase));
          if (missile.age > missile.life) {
            missile.state = 'fading';
            missile.body.visible = false;
          }
          missile.smoke.update(missile.position, time, cameraPosition, 1);
        } else {
          missile.fade = Math.max(0, missile.fade - delta / settings.trail.fadeOut);
          missile.smoke.update(null, time, cameraPosition, missile.fade);
          if (missile.fade === 0 || missile.smoke.empty) {
            missile.state = 'idle';
            missile.smoke.reset();
          }
        }
      }
    },
    dispose() {
      bodyGeometry.dispose();
      noseGeometry.dispose();
      bodyMaterial.dispose();
      flameMaterial.dispose();
      explosionMaterial.dispose();
      for (const sprite of explosions) sprite.material.dispose();
      glowMap.dispose();
      for (const missile of missiles) missile.smoke.dispose();
    },
  };
}
