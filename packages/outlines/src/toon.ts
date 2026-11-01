import * as THREE from 'three';

// Toon shading in flat part colours, olive armour or gray frame, which show
// as they are in the light. Faces turned most directly to the light get a
// third, highlight step, a light gray added over the colour. Shadow
// multiplies a tone over them, and the change
// from light to shadow is a band of halftone dots: they start small on the lit
// side and grow until they merge into the shadow.
//
// The dot grid is pinned to the model, not the screen, or the model slides
// through the dots as it moves (the shower door effect). Each face takes the
// grid from whichever axis plane it faces most, laid out in its rest
// position, so the dots ride along with their part. The Batara is mostly
// flat panels, which this suits.
export function toonMaterial(light: THREE.Vector3) {
  const uniforms = {
    light: { value: light.clone().normalize() },
    green: { value: new THREE.Color(0x8b8d62) },
    gray: { value: new THREE.Color(0x6e6f72) },
    // Multiplied over the part colour in shadow.
    shadow: { value: new THREE.Color(0xb4b4b4) },
    // Fully lit above this, fully in shadow below the other, as the cosine of
    // the angle to the light; dotted between. Only what faces well away from
    // the light (the undersides) goes all the way to the shadow tone.
    litAbove: { value: 0.19 },
    shadowBelow: { value: -0.5 },
    // Dot spacing in model units (it stands about 20 tall), and the grid's angle.
    cell: { value: 0.25 },
    angle: { value: THREE.MathUtils.degToRad(45) },
    // Added over the colour where faces turn to the light more than this.
    highlight: { value: new THREE.Color(0x7a7a7a) },
    highlightAbove: { value: 0.95 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute float tone;
      varying vec3 vNormal, vRest, vRestNormal;
      varying float vTone;
      void main() {
        vTone = tone;
        vRest = position;
        vRestNormal = normal;
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vNormal = normalize(mat3(modelMatrix) * objectNormal);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 light, green, gray, shadow, highlight;
      uniform float litAbove, shadowBelow, cell, angle, highlightAbove;
      varying vec3 vNormal, vRest, vRestNormal;
      varying float vTone;
      void main() {
        float facing = dot(normalize(vNormal), light);
        // 0 fully lit, 1 fully in shadow.
        float dark = 1.0 - smoothstep(shadowBelow, litAbove, facing);
        // Distance to the nearest dot centre, as a fraction of the spacing.
        vec3 n = abs(vRestNormal);
        vec2 plane = n.x > n.y && n.x > n.z ? vRest.zy : n.y > n.z ? vRest.xz : vRest.xy;
        vec2 p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * plane / cell;
        float distance = length(fract(p) - 0.5);
        // Dot area tracks darkness; past about 0.7 of the spacing they merge.
        float radius = sqrt(dark) * 0.72;
        float aa = fwidth(distance);
        float ink = dark >= 0.999 ? 1.0 : 1.0 - smoothstep(radius - aa, radius + aa, distance);
        vec3 base = mix(gray, green, step(0.5, vTone));
        vec3 colour = base * mix(vec3(1.0), shadow, ink);
        // A hard step, softened only by a pixel's worth.
        float soft = fwidth(facing);
        colour += highlight * smoothstep(highlightAbove - soft, highlightAbove + soft, facing);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { material, uniforms };
}

// Which faces are olive armour and which gray frame, read from the model's
// texture: each face looks at the texels under its corners and middle, and
// is armour if most of them are yellow-green rather than neutral. Very dark
// texels (the baked occlusion) don't vote. Stored per vertex as `tone`.
export function partTones(geometry: THREE.BufferGeometry, image: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const uv = geometry.attributes.uv, index = geometry.index!;
  const frac = (v: number) => v - Math.floor(v);
  // 1 armour, -1 frame, 0 too dark to tell.
  const vote = (u: number, v: number) => {
    const i = (Math.floor(frac(v) * height) * width + Math.floor(frac(u) * width)) * 4;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, g, b);
    if (max < 25) return 0;
    return (Math.max(r, g) - b) / max > 0.15 ? 1 : -1;
  };
  const votes = new Float32Array(uv.count);
  for (let f = 0; f < index.count; f += 3) {
    const corners = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
    const samples: [number, number][] = corners.map(c => [uv.getX(c), uv.getY(c)]);
    // Corners pulled a little inside, so they don't read the next island over.
    const cu = samples.reduce((sum, [u]) => sum + u, 0) / 3, cv = samples.reduce((sum, [, v]) => sum + v, 0) / 3;
    let sum = vote(cu, cv);
    for (const [u, v] of samples) sum += vote(u + (cu - u) * 0.3, v + (cv - v) * 0.3);
    for (const c of corners) votes[c] += Math.sign(sum);
  }
  geometry.setAttribute('tone', new THREE.BufferAttribute(votes.map(v => (v > 0 ? 1 : 0)), 1));
}

