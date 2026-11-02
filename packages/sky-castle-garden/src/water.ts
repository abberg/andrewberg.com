import * as THREE from 'three';
import { painted, palette } from './look';

// Step 9: the water, painted rather than real, the way the films paint it:
// a flat see-through wash of teal over the drowned city, turning to the sky's
// pale colour in two soft bands where you look across it rather than into it,
// and a few crisp ripples, clusters of thin wavy pale lines, drifting slowly
// over it. No reflections, no waves. The deeper the stonework below, the more
// it sinks into the water's colour (look.ts, drowned()), so the wash itself
// stays even.

// One tile of ripples, pale lines on black: clusters of two to four short
// wavy lines, one over another, each tapering at its ends, drawn again
// across each edge so it tiles.
function ripples(seed: number, count: number) {
  const size = 512, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  let s = seed;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < count; k++) {
    const cx = random() * size, cy = random() * size, lines = 2 + Math.floor(random() * 3), length = 30 + random() * 50;
    for (let l = 0; l < lines; l++) {
      const y0 = cy + l * (7 + random() * 4), x0 = cx + (random() - 0.5) * 16 + l * 4, len = length * (1 - l * 0.22) * (0.8 + random() * 0.3);
      const wave = 2 + random() * 2, phase = random() * 6;
      // Tapered: drawn as short pieces, thickest in the middle.
      for (let t = 0; t < 1; t += 0.05) {
        const at = (u: number) => [x0 + u * len, y0 + Math.sin(phase + u * 7) * wave];
        const [ax, ay] = at(t), [bx, by] = at(t + 0.05), w = 0.6 + 2.6 * Math.sin(Math.PI * (t + 0.025));
        g.strokeStyle = l === 0 ? '#ffffff' : '#d8eef0';
        g.lineWidth = w;
        for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
          g.beginPath();
          g.moveTo(ax + dx, ay + dy);
          g.lineTo(bx + dx, by + dy);
          g.stroke();
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// How many metres one tile covers, and how fast the ripples drift (tiles a
// second).
const TILE = 16, DRIFT = new THREE.Vector2(0.004, 0.0015);
const layers: THREE.Texture[] = [];
const SKY_ON_WATER = new THREE.Color(0xcfe6ea);

// The water's material. UVs in metres. Opacity is how much of the wash covers
// what's under it, looking straight down.
export function waterMaterial(opacity: number) {
  const lines = ripples(73, 26);
  lines.repeat.setScalar(1 / TILE);
  layers.push(lines);
  const material = painted(palette.water, {
    emissiveMap: lines, emissive: 0xffffff, emissiveIntensity: 0.55,
    transparent: true, opacity, depthWrite: false,
  });
  // Looking across it, the sky's colour, in two soft bands, and solid.
  const paint = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    paint(shader, renderer);
    shader.uniforms.uSkyOnWater = { value: SKY_ON_WATER };
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform vec3 uSun,', 'uniform vec3 uSkyOnWater;\nuniform vec3 uSun,')
      .replace('#ifdef USE_FOG', /* glsl */`{
          float across = 1.0 - abs(dot(normal, geometryViewDir));
          float sky = smoothstep(0.72, 0.78, across) * 0.45 + smoothstep(0.9, 0.94, across) * 0.4;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uSkyOnWater, sky);
          gl_FragColor.a = mix(gl_FragColor.a, 1.0, sky);
        }
        #ifdef USE_FOG`);
  };
  return material;
}

export function updateWater(seconds: number) {
  layers.forEach(map => map.offset.copy(DRIFT).multiplyScalar(seconds));
}
