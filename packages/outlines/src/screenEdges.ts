import * as THREE from 'three';
import { noiseGLSL } from './sketch';

// Screen-space edges: the model is drawn once more into a float buffer of
// view-space normals, depth and part (the bone each vertex rides on), and a
// full-screen pass draws ink wherever neighbouring pixels disagree: a
// different part, a jump in depth, or a fold in the surface.
//
// For the sketchy look, the edge pass looks the edges up several times, each
// through its own smooth noise displacement of the screen, so each line
// wanders off the true edge in its own way and they cross. Overshoot comes
// from extending each edge along its own direction: a pixel inks itself if
// an edge further along the same line points straight at it.
//
// The wander is seeded from the model, not the screen, or with boil off the
// model slides through a still noise field (the shower door effect). As in
// Nienhaus and Döllner's sketchy rendering (GPU Gems 2, chapter 15), the
// model is drawn enlarged into one more buffer that holds each pixel's rest
// position, and the noise is looked up there. Enlarged, so the pixels just
// outside the silhouette, where its lines wander to, have a position too.
const positionMaterial = new THREE.ShaderMaterial({
  uniforms: { enlarge: { value: 0.6 } },
  vertexShader: /* glsl */ `
    #include <common>
    #include <skinning_pars_vertex>
    uniform float enlarge;
    attribute vec3 outlineNormal;
    varying vec3 vRest;
    void main() {
      vRest = position;
      #include <skinbase_vertex>
      #include <begin_vertex>
      // Out along the averaged normals, like the hull, so it doesn't split at corners.
      transformed += outlineNormal * enlarge;
      #include <skinning_vertex>
      #include <project_vertex>
    }`,
  fragmentShader: /* glsl */ `varying vec3 vRest; void main() { gl_FragColor = vec4(vRest, 1.0); }`,
});

const geometryMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    #include <common>
    #include <skinning_pars_vertex>
    varying vec3 vNormal;
    varying float vDepth, vPart;
    void main() {
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      #include <project_vertex>
      vNormal = normalize(transformedNormal);
      vDepth = -mvPosition.z;
      vPart = skinIndex.x;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal;
    varying float vDepth, vPart;
    // Part and depth share a channel: part * 1000 + depth. Empty pixels are 0.
    void main() { gl_FragColor = vec4(normalize(vNormal), floor(vPart + 0.5) * 1000.0 + vDepth); }`,
});

export function screenEdges(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const positionTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  // The edges found in it: how strong, and which way they run.
  const edgeTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const uniforms = {
    geometry: { value: target.texture },
    edges: { value: edgeTarget.texture },
    positions: { value: positionTarget.texture },
    resolution: { value: new THREE.Vector2(1, 1) },
    // Where the viewport starts on the canvas, in pixels, when it shares it.
    origin: { value: new THREE.Vector2() },
    lines: { value: 3 },
    jitter: { value: 3 },
    width: { value: 1.5 },
    overshoot: { value: 12 },
    // Each line's ink varies between these, along the line and from one line
    // to the next, like pencil pressure.
    alphaMin: { value: 0.1 },
    alphaMax: { value: 0.6 },
    // The wander's noise: how fine its broad drift is on the model, and the
    // weights and frequencies of the three layers that make it up.
    noiseScale: { value: 0.08 },
    noiseWeights: { value: new THREE.Vector3(0.08, 0.46, 0.42) },
    noiseFrequencies: { value: new THREE.Vector2(11.5, 25.5) },
    boil: { value: 0 },
  };
  const vertexShader = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

  // Edge strength, and the edge's direction: the main axis of the 8
  // neighbours' differences (a little structure tensor) is across the edge,
  // so the edge runs perpendicular to it.
  const findEdges = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D geometry;
      uniform vec2 resolution;
      uniform float width;
      struct Sample { vec3 normal; float depth, part; };
      Sample read(vec2 pixel) {
        vec4 g = texture2D(geometry, pixel / resolution);
        float part = floor(g.w / 1000.0);
        return Sample(g.xyz, g.w - part * 1000.0, g.w > 0.0 ? part : -1.0);
      }
      // How much of an edge lies between two pixels, 0 to 1.
      float between(Sample a, Sample b) {
        if (a.part < 0.0 && b.part < 0.0) return 0.0;
        if (a.part != b.part) return 1.0;
        float fold = smoothstep(0.85, 0.6, dot(a.normal, b.normal));
        float step = smoothstep(0.01, 0.03, abs(a.depth - b.depth) / min(a.depth, b.depth));
        return max(fold, step);
      }
      void main() {
        vec2 pixel = gl_FragCoord.xy;
        Sample c = read(pixel);
        float strength = 0.0;
        vec3 tensor = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982;
          vec2 o = vec2(cos(a), sin(a));
          float d = between(c, read(pixel + o * width));
          // The four straight neighbours set the strength, as before.
          if (i % 2 == 0) strength = max(strength, d);
          tensor += d * vec3(o.x * o.x, o.x * o.y, o.y * o.y);
        }
        float across = 0.5 * atan(2.0 * tensor.y, tensor.x - tensor.z);
        // How clearly it has one direction: 1 for a clean straight edge, 0
        // for a speck that differs every way.
        float coherence = length(vec2(tensor.x - tensor.z, 2.0 * tensor.y)) / (tensor.x + tensor.z + 1e-5);
        gl_FragColor = vec4(strength, -sin(across), cos(across), coherence);
      }`,
  }));
  const findScene = new THREE.Scene().add(findEdges);

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader,
    fragmentShader: /* glsl */ `
      uniform sampler2D edges, positions;
      uniform vec2 resolution, origin;
      uniform float jitter, overshoot, boil, alphaMin, alphaMax, noiseScale;
      uniform vec3 noiseWeights;
      uniform vec2 noiseFrequencies;
      uniform int lines;
      ${noiseGLSL}
      // How far a line wanders, in units of jitter: a broad drift, plus
      // finer wobbles so the line isn't a straight copy of the edge up close.
      vec2 wander(vec3 seed) {
        vec3 a = seed * noiseFrequencies.x, b = seed * noiseFrequencies.y;
        vec2 w = vec2(sketchNoise(seed), sketchNoise(seed + 41.0)) * noiseWeights.x;
        w += vec2(sketchNoise(a + 5.0), sketchNoise(a + 46.0)) * noiseWeights.y;
        w += vec2(sketchNoise(b + 9.0), sketchNoise(b + 50.0)) * noiseWeights.z;
        return w;
      }
      vec4 edgeAt(vec2 pixel) { return texture2D(edges, pixel / resolution); }
      // A clean edge pixel running along the ray.
      bool runsAlong(vec2 pixel, vec2 ray) {
        vec4 e = edgeAt(pixel);
        return e.x > 0.9 && e.w > 0.7 && abs(dot(e.yz, ray)) > 0.985;
      }
      // Overshoot: whether this pixel lies on an edge's own line, run on past
      // it by up to reach pixels. Looks out along 16 directions for an edge
      // running (almost exactly) straight back at this one, for at least two
      // samples, so specks and corners don't sprout whiskers.
      float extended(vec2 pixel, float reach) {
        for (int i = 0; i < 16; i++) {
          float a = float(i) * 0.3926991;
          vec2 ray = vec2(cos(a), sin(a));
          for (int k = 1; k <= 20; k++) {
            float distance = float(k) * 2.0;
            if (distance > reach) break;
            if (runsAlong(pixel + ray * distance, ray) && runsAlong(pixel + ray * (distance + 2.0), ray)) return 1.0;
          }
        }
        return 0.0;
      }
      void main() {
        float ink = 0.0;
        for (int line = 0; line < 4; line++) {
          if (line >= lines) break;
          // A smooth wander, a few across a limb, different for each line.
          // Where the model isn't, even enlarged, there are no lines to move.
          vec2 here = gl_FragCoord.xy - origin;
          vec4 rest = texture2D(positions, here / resolution);
          vec3 seed = rest.xyz * noiseScale + vec3(float(line) * 13.1, 0.0, boil);
          vec2 pixel = here + wander(seed) * jitter;
          float e = edgeAt(pixel).x;
          // Each line runs over by its own amount, varying along the model.
          float reach = overshoot * (0.6 + 0.4 * sketchNoise(seed * 0.5 + 77.0));
          if (e < 0.5 && reach >= 2.0) e = extended(pixel, reach);
          float alpha = mix(alphaMin, alphaMax, 0.5 + 0.5 * sketchNoise(seed * 0.7 + 91.0));
          ink = 1.0 - (1.0 - ink) * (1.0 - alpha * e);
        }
        gl_FragColor = vec4(vec3(0.0), ink);
      }`,
  }));
  const quadScene = new THREE.Scene().add(quad);
  const quadCamera = new THREE.Camera();
  const clear = new THREE.Color();

  return {
    uniforms,
    setSize(width: number, height: number) {
      target.setSize(width, height);
      edgeTarget.setSize(width, height);
      positionTarget.setSize(width, height);
      uniforms.resolution.value.set(width, height);
    },
    // Draws the model's geometry into the buffer, then the scene, then the edges on top.
    render(scene: THREE.Scene, camera: THREE.Camera, mesh: THREE.SkinnedMesh) {
      const { background } = scene, material = mesh.material, alpha = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      scene.background = null;
      mesh.material = geometryMaterial;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(target);
      renderer.clear();
      // Only the model goes into the buffer.
      const visible = new Map<THREE.Object3D, boolean>();
      scene.traverse(object => { if ((object as THREE.Mesh).isMesh && object !== mesh) { visible.set(object, object.visible); object.visible = false; } });
      renderer.render(scene, camera);
      mesh.material = positionMaterial;
      renderer.setRenderTarget(positionTarget);
      renderer.clear();
      renderer.render(scene, camera);
      visible.forEach((was, object) => { object.visible = was; });
      renderer.setRenderTarget(edgeTarget);
      renderer.render(findScene, quadCamera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clear, alpha);
      mesh.material = material;
      scene.background = background;
      renderer.render(scene, camera);
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCamera);
      renderer.autoClear = autoClear;
    },
  };
}
