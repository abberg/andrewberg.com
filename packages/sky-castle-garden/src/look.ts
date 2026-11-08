import * as THREE from 'three';

// Step 6 of the plan: the light, the sky and the fog, and the palette laid on
// the greybox. The painted look comes from flat, hand-picked colour: each
// surface has a lit colour and a shade colour, and the sun picks between them
// in a few soft bands instead of shading it darker. Shade leans blue-green, or
// lavender on the stone, never grey.

// The plants' shade, deepened (Andrew, 2026-11-08): each shade colour
// multiplied by this, in linear light. Not the cypresses, already dark.
export const LEAF_SHADE = 0.45;
export function leafy(pair: readonly [number, number]) {
  return [pair[0], new THREE.Color(pair[1]).multiplyScalar(LEAF_SHADE).getHex()] as const;
}

// The plan's palette (docs/design-plan.md), as [lit, shade].
export const palette = {
  stone: [0xeee6d4, 0x9497c4],
  // The garden's tan sandstone, as in the references' bridge and tower: the
  // platform, causeway and stairs, and darker in the terrace's masonry under
  // the lawn and the cliff below it.
  sandstone: [0xdcc08a, 0x8f86a8],
  masonry: [0xd0b07a, 0x847a9f],
  // All the grass, and the ground it grows from: the garden's lawn and the
  // start tower's meadow alike (what was the meadow's own green).
  // Olive rather than minty, against the deep sky (Andrew, 2026-11-08).
  grass: [0x6e9636, 0x34502e],
  // The start tower's meadow: deeper, cooler greens, from Andrew's film still.
  meadow: [0x30603a, 0x153a2c],
  // Moss and ivy on the stonework.
  moss: leafy([0xb4d66a, 0x5f9468]),
  ivy: leafy([0x98c85c, 0x4f8664]),
  // The shadowed depths under them.
  mossDepth: leafy([0x86b052, 0x507e5c]),
  ivyDepth: leafy([0x76a44a, 0x466e54]),
  path: [0xe0c99a, 0x9c93b2],
  rust: [0xb47a45, 0x7a5a78],
  water: [0x5aa3a6, 0x3a7488],
  // The moats' canals, darker.
  canal: [0x2f6f7a, 0x22506a],
  door: [0x2a2622, 0x1c1d2a],
} as const;
// A little lighter now the robot is dark (Andrew, 2026-11-08).
export const SKY = 0x007ea2;
// Overhead, where the dome's gradient ends.
export const ZENITH = 0x007596;
// The horizon colour, shared by the dome, the fog, the background and the
// clouds' haze, so the panel's picker changes them all at once.
export const horizon = new THREE.Color(SKY);

// Shared by every painted material, and tuned from the panel.
export const look = {
  // How much of the light the middle band is, and where it sits: shade below
  // the first edge, full light past the second.
  mid: 0.55,
  // The sky fill on top of the bands, and the rim on the sunny side.
  fill: 0.25,
  rim: 0.25,
  // Fog below the garden: clear down to y = 0, gone by this far down.
  depth: 35,
  // Under the moats' water: how far down until things are lost in its
  // colour, and how much of it they take at most.
  drown: 13,
  murk: 0.85,
  // Stonework's shade (Andrew's film still of the start tower): a deep warm
  // core, how dark next to the lit face, and the cool reflected light only
  // on its edges, where it turns away from view: where that starts (0 is
  // facing the camera, 1 edge on).
  core: 0.09,
  edge: 0.55,
};
// The colour the drowned city sinks into.
export const DEEP = 0x1f5a62;
const uniforms = {
  uSun: { value: new THREE.Color() },
  uWarm: { value: new THREE.Color() },
  uMid: { value: look.mid },
  uFill: { value: look.fill },
  uRim: { value: look.rim },
  uDepth: { value: look.depth },
  uDrown: { value: look.drown },
  uMurk: { value: look.murk },
  uCore: { value: look.core },
  uEdge: { value: look.edge },
  uDeep: { value: new THREE.Color(DEEP) },
};
// The robot's ink shadow, falling on whatever it lies across (robot.ts sets
// these each frame): on or off, the depth of the robot seen from its own
// light, how to find a point in that view, how far to slide the shadow, and
// its colour. Everything painted takes it but the robot itself.
export const inkUniforms = {
  uInkOn: { value: 0 },
  uInkDepth: { value: null as THREE.Texture | null },
  uInkMatrix: { value: new THREE.Matrix4() },
  uInkShift: { value: new THREE.Vector3() },
  uInk: { value: new THREE.Color() },
};

// Shade picked from lit by multiplying, per channel, so materials with a map
// (the robot's) keep it in both.
const ratio = (lit: number, shade: number) => {
  const a = new THREE.Color(lit), b = new THREE.Color(shade);
  return new THREE.Vector3(b.r / a.r, b.g / a.g, b.b / a.b);
};
// For anything without a shade of its own: towards blue-green.
const COOL = ratio(0xd8c8a0, 0x7f9aa8);

// Turns a standard material into a painted one. Shade defaults to cooling
// whatever colour the material already has.
// A map given with a tile size (in metres) is laid on by the model's own
// position from three sides and blended by its normal, so boxes and slabs
// need no UVs and the blocks stay the same size everywhere.
export function paint(material: THREE.MeshStandardMaterial, shade?: number, tile?: number) {
  const shadeRatio = shade === undefined ? COOL : ratio(material.color.getHex(), shade);
  // Masonry is painted darker than it is so its highlights can be brighter.
  if (material.map?.userData.gain) material.color.multiplyScalar(material.map.userData.gain);
  if (tile) material.defines = { TRIPLANAR: '' };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, inkUniforms, { uShade: { value: shadeRatio }, uTile: { value: tile ?? 1 } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vInkAt;\nvarying float vHeight;\nvarying vec3 vModel, vModelNormal;\n#ifdef MERGED\nattribute vec3 modelPosition, modelNormal;\n#endif\n#ifdef TEX_SHIFT\nattribute vec3 texShift;\n#endif\n#ifdef STONE_BLOCK\nattribute vec3 boxMin, boxMax;\nvarying vec3 vBlock, vBoxMin, vBoxMax, vShift;\n#endif')
      .replace('#include <fog_vertex>', /* glsl */`#include <fog_vertex>
        vInkAt = (inverse(viewMatrix) * mvPosition).xyz;
        vec4 placed = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          placed = instanceMatrix * placed;
        #endif
        vHeight = (modelMatrix * placed).y;
        vModel = transformed;
        vModelNormal = objectNormal;
        // Merged into one mesh (merge.ts): where it was on its own model.
        #ifdef MERGED
          vModel = modelPosition;
          vModelNormal = modelNormal;
        #endif
        // Each piece's own place in the stone's texture (columns.ts).
        // Where it is in the block, before the shift, and the block's bounds.
        #ifdef STONE_BLOCK
          vBlock = vModel;
          vBoxMin = boxMin;
          vBoxMax = boxMax;
          vShift = texShift;
        #endif
        #ifdef TEX_SHIFT
          vModel += texShift;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', /* glsl */`#include <fog_pars_fragment>
        uniform vec3 uSun, uWarm, uShade;
        uniform float uMid, uFill, uRim, uDepth, uTile, uDrown, uMurk, uCore, uEdge;
        uniform vec3 uDeep;
        uniform float uInkOn;
        uniform sampler2D uInkDepth;
        uniform mat4 uInkMatrix;
        uniform vec3 uInkShift, uInk;
        varying vec3 vInkAt;
        varying float vHeight;
        varying vec3 vModel, vModelNormal;
        #ifdef STONE_BLOCK
          varying vec3 vBlock, vBoxMin, vBoxMax, vShift;
          float stoneHash(float p) { return fract(sin(p * 127.1) * 43758.5453); }
          float stoneNoise(float p) { float i = floor(p), f = fract(p); return mix(stoneHash(i), stoneHash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
          // The brush strip holds four rows of strokes running along it: one
          // at u along the stroke, v across it (0 at its middle, 1 at its
          // edge either side, so a mark half off a face can sit on the edge).
          uniform sampler2D uBrush;
          // Eight whole strokes side by side, each running down its column
          // from where the brush lands (columns.ts, dripStrokes): u across a
          // stroke, v along it, both 0 to 1.
          uniform sampler2D uDrips;
          float dripStroke(float u, float v, float k) {
            if (u <= 0.0 || u >= 1.0 || v <= 0.0 || v >= 1.0) return 0.0;
            return texture2D(uDrips, vec2((k + u) / 8.0, 1.0 - v)).r;
          }
          // A face's own random numbers, the same all over it.
          float faceHash(vec3 face, float i) {
            vec3 p = fract(vec3(face.xy, face.z + i * 1.618) * 0.1031);
            p += dot(p, p.zyx + 31.32);
            return fract((p.x + p.y) * p.z);
          }
          // The cracks (columns.ts, crackStrip): eight in a strip, each
          // running from one end of its row to the other, laid between a and
          // b on the face. Red the crack, green its lit edge, blue the wash.
          uniform sampler2D uCracks;
          // Random heights joined by straight lines.
          float jag(float x) { float i = floor(x); return mix(stoneHash(i), stoneHash(i + 1.0), x - i); }
          vec3 crackMarks(vec2 p, vec2 a, vec2 b, float halfWidth, float k) {
            vec2 d = b - a;
            float len = length(d);
            vec2 t = d / len;
            // The strip's own wavering is squashed flat when a row is
            // stretched along a crack, so the crack is bent here, in metres
            // whatever its length: a slow wander and sharper jags on it, each
            // straight between kinks, as stone breaks.
            float u = dot(p - a, t) / len, along = u * len, seed = k * 7.31 + a.x * 3.1 + a.y * 1.7;
            float bend = (jag(along * 1.6 + seed) - 0.5) * 0.22 + (jag(along * 6.0 + seed * 1.3) - 0.5) * 0.08;
            float v = (dot(p - a, vec2(-t.y, t.x)) - bend) / halfWidth;
            if (u <= 0.0 || u >= 1.0 || abs(v) >= 1.0) return vec3(0.0);
            return texture2D(uCracks, vec2(u, (k + 0.5 + 0.5 * v) / 8.0)).rgb;
          }
          // A point on one of a face's four edges (0 the foot, then round
          // anticlockwise), t along it, and the way into the face from there.
          vec2 edgePoint(float e, float t, vec2 size) {
            return e < 0.5 ? vec2(t * size.x, 0.0) : e < 1.5 ? vec2(size.x, t * size.y) : e < 2.5 ? vec2(t * size.x, size.y) : vec2(0.0, t * size.y);
          }
          vec2 inward(float e) {
            return e < 0.5 ? vec2(0.0, 1.0) : e < 1.5 ? vec2(-1.0, 0.0) : e < 2.5 ? vec2(0.0, -1.0) : vec2(1.0, 0.0);
          }
          vec2 turn(vec2 v, float a) { return vec2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)); }
          // A crack run in from edge e of a face, part way across.
          vec3 edgeCrack(vec2 p, vec2 size, vec3 face, float e, float i, float k) {
            vec2 in_ = inward(e);
            vec2 a = edgePoint(e, 0.15 + 0.7 * faceHash(face, i), size) - in_ * 0.04;
            float across = e < 0.5 || (e > 1.5 && e < 2.5) ? size.y : size.x;
            vec2 b = a + turn(in_, (faceHash(face, i + 1.0) - 0.5) * 1.3) * across * (0.3 + 0.35 * faceHash(face, i + 2.0));
            return crackMarks(p, a, clamp(b, size * 0.06, size * 0.94), 0.26, k);
          }
          float brushStroke(float u, float v, float row) {
            v = abs(v);
            if (v >= 1.0) return 0.0;
            // Faded out before the band's edge, so it never ends in a line.
            return texture2D(uBrush, vec2(u, (row + 0.5 + 0.45 * v) * 0.25)).r * smoothstep(1.0, 0.6, v);
          }
        #endif`)
      .replace('#include <map_fragment>', /* glsl */`#if defined(USE_MAP) && defined(TRIPLANAR)
          vec3 side = pow(abs(normalize(vModelNormal)), vec3(8.0));
          side /= side.x + side.y + side.z;
          vec3 at = vModel / uTile;
          #ifdef STONE_BLOCK
            // Each face of a block from its own part of the stone, so
            // neighbouring and opposite faces never repeat each other.
            vec3 facing = step(0.0, vModelNormal);
            vec2 onX = at.zy + vec2(0.37, 0.61) + facing.x * vec2(0.5, 0.21);
            vec2 onY = at.xz + vec2(0.13, 0.29) + facing.y * vec2(0.27, 0.5);
            vec2 onZ = at.xy + vec2(0.71, 0.07) + facing.z * vec2(0.45, 0.33);
            diffuseColor *= texture2D(map, onX) * side.x + texture2D(map, onY) * side.y + texture2D(map, onZ) * side.z;
            // Weathering by the block's shape, painted with the shafts' brush
            // (columns.ts, brushStrip): strokes laid along the rim of each
            // face, down its upright corners and under its top edge where rain
            // sits, a few short drips from that edge, damp at the foot and a
            // green stroke up from it here and there.
            // Distances in metres.
            {
              vec3 n = abs(normalize(vModelNormal));
              vec3 low = vBlock - vBoxMin, high = vBoxMax - vBlock;
              vec3 edge = min(low, high);
              // Upright faces only, not the plinths' sloping tops.
              bool upright = n.y < 0.35;
              bool level = n.y > 0.9;
              float across = n.x > n.z ? edge.z : edge.x;
              float along = n.x > n.z ? vModel.z : vModel.x;
              float wobble = stoneNoise(along * 3.0 + vModel.y * 2.0) * 0.7 + stoneNoise(along * 9.0 + vModel.y * 5.0) * 0.3;
              float stain = 0.0;
              if (upright) {
                float top = high.y, foot = low.y;
                // Under the top edge: a stroke along it, half off the face,
                // its lower edge ragged where the bristles run out.
                stain += brushStroke(along / 1.7, top / (0.18 + 0.14 * wobble), 0.0) * 0.7;
                // Down each upright corner.
                stain += brushStroke(vModel.y / 1.7 + 0.3, across / (0.18 + 0.14 * wobble), 1.0) * 0.75;
                // Along the foot, lighter.
                stain += brushStroke(along / 1.7 + 0.6, foot / 0.2, 2.0) * 0.4;
                // Drips: here and there along the top, each one whole stroke
                // of the shafts' brush run down from the edge, landing,
                // thinning and breaking up dry as theirs do.
                // Each face of the block its own: which way it faces, and
                // the piece's own place in the stone, so a square plinth's
                // sides don't match.
                vec3 facing3 = sign(vModelNormal);
                float faceKey = (n.x > n.z ? facing3.x : 2.0 + facing3.z) * 41.0 + dot(floor(vShift * 64.0 + 0.5), vec3(0.13, 0.071, 0.037));
                float which = floor(along * 4.0) + faceKey, cell = fract(along * 4.0);
                float reach = stoneHash(which + 7.0) < 0.65 ? 0.25 + 1.4 * stoneHash(which + 3.0) * stoneHash(which + 19.0) : 0.0;
                float centre = 0.3 + 0.4 * stoneHash(which + 11.0), width = 0.07 + 0.08 * stoneHash(which + 5.0);
                float dark = stoneHash(which + 13.0) < 0.3 ? 1.6 : 1.1;
                stain += dripStroke((cell - centre) / 4.0 / width + 0.5, (top - 0.01) / max(reach, 0.01), floor(stoneHash(which + 17.0) * 8.0)) * dark;
                // Damp at the foot, greener.
                float damp = smoothstep(0.4 + 0.3 * wobble, 0.0, foot);
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.86, 0.66), damp * 0.7);
                // Green, as at the shafts' feet: now and then a broad stroke
                // of the same brush laid up the face from the ground, landing
                // at the foot and running out dry as it rises.
                float tuft = floor(along * 2.0 + 0.37) + faceKey, place = fract(along * 2.0 + 0.37);
                float rise = stoneHash(tuft + 23.0) < 0.22 ? 0.45 + 0.8 * stoneHash(tuft + 29.0) : 0.0;
                float middle = 0.3 + 0.4 * stoneHash(tuft + 31.0), broad = 0.12 + 0.1 * stoneHash(tuft + 37.0);
                float green = dripStroke((place - middle) / 2.0 / broad + 0.5, (foot - 0.01) / max(rise, 0.01), floor(stoneHash(tuft + 41.0) * 8.0));
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.56, 0.72, 0.34), clamp(green * 1.3, 0.0, 1.0) * 0.85);
              } else {
                // On tops and slopes, strokes round the rim.
                float rim = min(edge.x, edge.z), circuit = edge.x < edge.z ? vModel.z : vModel.x;
                stain += brushStroke(circuit / 1.7, rim / (0.16 + 0.12 * wobble), 1.0) * (level ? 0.6 : 0.45);
              }
              // In the shafts' stain violet.
              diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.6, 0.85), clamp(stain, 0.0, 1.0) * 0.8);
              // Cracks, by the face: on some, one anywhere; on some, two, each
              // run in from an edge; now and then one right across, edge to
              // edge; never more than two. Not on faces too narrow for them.
              {
                vec3 d = normalize(vModelNormal), box = vBoxMax - vBoxMin, inBox = vBlock - vBoxMin;
                bool onX = n.x >= n.y && n.x >= n.z, onY = !onX && n.y >= n.z;
                vec2 p = onX ? inBox.zy : onY ? inBox.xz : inBox.xy;
                vec2 size = onX ? box.zy : onY ? box.xz : box.xy;
                float axis = onX ? 0.0 : onY ? 1.0 : 2.0;
                float facingSign = (onX ? d.x : onY ? d.y : d.z) > 0.0 ? 1.0 : 0.0;
                vec3 face = floor(vShift * 64.0 + 0.5) + vec3(axis * 17.0 + facingSign * 5.0);
                float r = faceHash(face, 0.0), k = floor(faceHash(face, 1.0) * 8.0);
                vec3 marks = vec3(0.0);
                if (min(size.x, size.y) > 0.35) {
                  if (r < 0.08) {
                    // Right across, mostly the short way.
                    bool lengthways = (faceHash(face, 2.0) < 0.3) == (size.x > size.y);
                    float y0 = 0.2 + 0.6 * faceHash(face, 3.0), y1 = 0.2 + 0.6 * faceHash(face, 4.0);
                    vec2 a = lengthways ? vec2(-0.04, y0 * size.y) : vec2(y0 * size.x, -0.04);
                    vec2 b = lengthways ? vec2(size.x + 0.04, y1 * size.y) : vec2(y1 * size.x, size.y + 0.04);
                    marks = crackMarks(p, a, b, 0.3, k);
                  } else if (r < 0.45) {
                    // One, anywhere.
                    vec2 c = size * (0.25 + 0.5 * vec2(faceHash(face, 5.0), faceHash(face, 6.0)));
                    vec2 t = turn(vec2(1.0, 0.0), faceHash(face, 7.0) * 6.2832) * min(size.x, size.y) * (0.2 + 0.15 * faceHash(face, 8.0));
                    marks = crackMarks(p, clamp(c - t, size * 0.06, size * 0.94), clamp(c + t, size * 0.06, size * 0.94), 0.24, k);
                  } else if (r < 0.7) {
                    // Two, from different edges.
                    float e0 = floor(faceHash(face, 9.0) * 4.0), e1 = mod(e0 + 1.0 + floor(faceHash(face, 10.0) * 3.0), 4.0);
                    marks = max(edgeCrack(p, size, face, e0, 11.0, k), edgeCrack(p, size, face, e1, 14.0, mod(k + 3.0, 8.0)));
                  }
                }
                // Only where the face is flat, not round the worn edges.
                marks *= smoothstep(0.7, 0.95, max(side.x, max(side.y, side.z)));
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.84, 0.82, 0.95), marks.b * 0.6);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), marks.g * 0.6);
                diffuseColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.27, 0.58), marks.r);
              }
            }
          #else
            diffuseColor *= texture2D(map, at.zy) * side.x + texture2D(map, at.xz) * side.y + texture2D(map, at.xy) * side.z;
          #endif
        #else
          #include <map_fragment>
        #endif`)
      // How lit the surface is, 0 to 1, from what the sun gave it next to what
      // it would give a surface facing it square on, shadows included.
      .replace('vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;', /* glsl */`
        const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
        float full = dot(diffuseColor.rgb * uSun * RECIPROCAL_PI, luma);
        float lit = full > 1e-5 ? clamp(dot(reflectedLight.directDiffuse, luma) / full, 0.0, 1.0) : 0.0;
        float band = smoothstep(0.0, 0.12, lit) * uMid + smoothstep(0.3, 0.45, lit) * (1.0 - uMid);
        // Cel shaded (the robot): just the two, cut hard, nothing between.
        // The turn from lit to shade comes from the surface's angle to the sun
        // alone, so the line is clean; shadows only switch it to shade where
        // they clearly fall, so the shadow map's speckle stays out of it.
        #if defined(CEL) && NUM_DIR_LIGHTS > 0
          float facing = dot(normal, directionalLights[0].direction);
          float shadowed = facing > 0.05 ? lit / facing : 1.0;
          band = smoothstep(0.3, 0.34, facing) * step(0.5, shadowed);
        #endif
        vec3 shaded = diffuseColor.rgb * uShade;
        // Stonework: a deep, warm shade, the stone's own colour darkened,
        // turning to the cool reflected light only toward its edges.
        #ifdef STONE_SHADE
          float turned = smoothstep(uEdge, 1.0, 1.0 - saturate(dot(normal, geometryViewDir)));
          shaded = mix(diffuseColor.rgb * uCore * vec3(1.0, 0.8, 0.7), shaded, turned);
        #else
          float turned = 1.0;
        #endif
        vec3 totalDiffuse = mix(shaded, diffuseColor.rgb * uWarm, band);
        #ifndef CEL
          float rim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);
          totalDiffuse += diffuseColor.rgb * uWarm * rim * band * uRim;
          // (Less of the sky's green-blue fill in stonework's deep shade.)
          totalDiffuse += reflectedLight.indirectDiffuse * uFill * mix(1.0, 0.4 + 0.6 * turned, 1.0 - band);
        #endif`)
      // Distance fog, and fog rising from below so the cliff and the tower
      // melt into the sky.
      // Under the water, sinking into its colour instead.
      .replace('#include <fog_fragment>', /* glsl */`#ifndef CEL
          // In the robot's shadow: further from its light than the robot is.
          // Hard edged, in ink, then fogged like the robot's outline.
          if (uInkOn > 0.5) {
            vec4 inLight = uInkMatrix * vec4(vInkAt + uInkShift, 1.0);
            vec3 at = inLight.xyz / inLight.w * 0.5 + 0.5;
            if (all(greaterThan(at, vec3(0.0))) && all(lessThan(at, vec3(1.0))) && at.z > texture2D(uInkDepth, at.xy).r + 0.002) gl_FragColor.rgb = uInk;
          }
        #endif
        #ifdef DROWNED
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, uMurk * smoothstep(0.0, -uDrown, vHeight));
        #endif
        #ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #ifndef DROWNED
            fogFactor = max(fogFactor, smoothstep(0.0, -uDepth, vHeight));
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
          // Deep in the fog below the garden, the stone thins away (by
          // alpha to coverage, a little dithered) so the sky and the low
          // clouds behind it show, instead of a cut-out in the fog's colour.
          #if defined(FADE_DEEP) && !defined(DROWNED)
            float keep = 1.0 - smoothstep(-0.6 * uDepth, -uDepth, vHeight);
            if (keep < 1.0) {
              float noise = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
              gl_FragColor.a = clamp(keep + (noise - 0.5) * 0.3 * (1.0 - keep), 0.0, 1.0);
            }
          #endif
        #endif`);
  };
  return material;
}

// The same, for what's under the moats' water.
export const drowned = <T extends THREE.Material>(material: T) => {
  material.defines = { ...material.defines, DROWNED: '' };
  return material;
};

// For stone that reaches far down into the fog below the garden: it fades
// out as the fog thickens, so what's behind it shows (see the fog above).
export const fadesDeep = <T extends THREE.Material>(material: T) => {
  material.defines = { ...material.defines, FADE_DEEP: '' };
  material.alphaToCoverage = true;
  return material;
};

// A painted material in one of the palette's pairs.
// The sandstone, masonry and paving take the deep shade with cool edges; the
// castle and the garden's marble (palette.stone) keep their plain cool shade.
export const painted = (pair: readonly [number, number], options: THREE.MeshStandardMaterialParameters = {}, tile?: number) => {
  const material = paint(new THREE.MeshStandardMaterial({ color: pair[0], roughness: 1, metalness: 0, ...options }), pair[1], tile);
  if (STONEWORK.includes(pair)) material.defines = { ...material.defines, STONE_SHADE: '' };
  return material;
};
const STONEWORK: readonly (readonly [number, number])[] = [palette.sandstone, palette.masonry, palette.path];

// The sky: a dome, deeper blue overhead, the fog's colour at the horizon and
// below it, where the garden drops away.
function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { horizon: { value: horizon }, zenith: { value: new THREE.Color(ZENITH) } },
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 horizon, zenith;
      varying vec3 vDirection;
      void main() {
        float up = max(normalize(vDirection).y, 0.0);
        gl_FragColor = vec4(mix(horizon, zenith, pow(up, 0.6)), 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

// A colour as the panel's picker sees it: an sRGB hex string, like the
// palette's. Handing the picker a THREE.Color directly would have it write
// sRGB numbers straight into three's linear components, so every colour
// picked would come out much lighter than it looks in the picker.
const hex = (color: THREE.Color) => ({
  get hex() { return '#' + color.getHexString(); },
  set hex(value: string) { color.set(value); },
});

// What the sun's shadow has to cover: the whole level, from the platform to
// the top of the city, so shadows never pop in as the robot walks about.
const COVER = new THREE.Box3(new THREE.Vector3(-64, -10, -48), new THREE.Vector3(64, 90, 98));

export function createLook(scene: THREE.Scene) {
  scene.background = horizon;
  scene.fog = new THREE.Fog(SKY, 30, 350);
  scene.fog.color = horizon;
  const sky = createSky();
  scene.add(sky);

  const hemisphere = new THREE.HemisphereLight(0xcfe6f5, 0x4f7f3a, 1.4);
  // A warm sun, high in the north-west behind the usual view south to the
  // city, so the columns west of the main path throw shadows across it.
  const sun = new THREE.DirectionalLight(0xfff6e8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  scene.add(hemisphere, sun, sun.target);
  const angles = { height: 50, from: -60 };

  // Points the sun from its angles and fits its shadow box round the level.
  const aim = () => {
    const height = THREE.MathUtils.degToRad(angles.height), from = THREE.MathUtils.degToRad(angles.from);
    const centre = COVER.getCenter(new THREE.Vector3());
    sun.target.position.copy(centre);
    sun.position.copy(centre).add(new THREE.Vector3(Math.sin(from) * Math.cos(height), Math.sin(height), -Math.cos(from) * Math.cos(height)).multiplyScalar(200));
    const camera = sun.shadow.camera;
    camera.position.copy(sun.position);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    const box = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      const corner = new THREE.Vector3(i & 1 ? COVER.max.x : COVER.min.x, i & 2 ? COVER.max.y : COVER.min.y, i & 4 ? COVER.max.z : COVER.min.z);
      box.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse));
    }
    Object.assign(camera, { left: box.min.x, right: box.max.x, bottom: box.min.y, top: box.max.y, near: -box.max.z - 1, far: -box.min.z + 1 });
    camera.updateProjectionMatrix();
  };
  aim();

  const update = (camera: THREE.Camera) => {
    sky.position.copy(camera.position);
    uniforms.uSun.value.copy(sun.color).multiplyScalar(sun.intensity);
    uniforms.uWarm.value.copy(sun.color);
    uniforms.uMid.value = look.mid;
    uniforms.uFill.value = look.fill;
    uniforms.uRim.value = look.rim;
    uniforms.uDepth.value = look.depth;
    uniforms.uDrown.value = look.drown;
    uniforms.uMurk.value = look.murk;
    uniforms.uCore.value = look.core;
    uniforms.uEdge.value = look.edge;
  };

  const tune = (gui: { addFolder(name: string): any }) => {
    const folder = gui.addFolder('light');
    folder.add(angles, 'height', 20, 85, 1).name('sun height (°)').onChange(aim);
    folder.add(angles, 'from', -180, 180, 1).name('sun from, east of north (°)').onChange(aim);
    folder.addColor(hex(sun.color), 'hex').name('sun');
    folder.add(look, 'mid', 0, 1, 0.05).name('middle band');
    folder.add(hemisphere, 'intensity', 0, 4, 0.1).name('sky fill');
    folder.add(look, 'fill', 0, 1, 0.05).name('fill in the bands');
    folder.add(look, 'rim', 0, 1, 0.05).name('rim');
    folder.add(look, 'core', 0, 1, 0.01).name('stone shade (dark)');
    folder.add(look, 'edge', 0, 1, 0.01).name('stone edge light from');
    folder.add(scene.fog as THREE.Fog, 'near', 0, 300, 5).name('fog from (m)');
    folder.add(scene.fog as THREE.Fog, 'far', 100, 1000, 10).name('fog full (m)');
    folder.add(look, 'depth', 5, 120, 1).name('fog below (m)');
    folder.close();
    const skyFolder = gui.addFolder('sky');
    skyFolder.addColor(hex(horizon), 'hex').name('horizon & fog');
    skyFolder.addColor(hex((sky.material as THREE.ShaderMaterial).uniforms.zenith.value), 'hex').name('overhead');
    skyFolder.close();
  };

  return { sun, update, tune };
}
