# Sketchy Drawings

Real-time sketchy rendering after Nienhaus and Döllner, “Sketchy Drawings – A Hardware-Accelerated Approach for Real-Time Non-Photorealistic Rendering” (SIGGRAPH 2003 sketch). Built from `Archive/npr rendering/sandbox`, keeping its bundled Three.js (r49), Evangelion Unit-01 model and animation, and orbit camera; the original folder is untouched.

Each frame renders three textures and combines them on a full-screen quad:

- **TSurface** (`shaders/surface_frag.glsl`): the scene with a flat paper fill and one shade step for the side away from the light and the spotlight's shadow.
- **Normals and depth** (`shaders/normal_depth_*.glsl`): view-space normals in rgb and depth in alpha. The ground writes the same value as the background so it never draws lines.
- **TEdge** (`shaders/edge_frag.glsl`): a Sobel filter over that buffer; creases come from jumps in the normal, silhouettes from jumps in depth.

`shaders/sketch_frag.glsl` reads TEdge and TSurface at texture coordinates offset by a tileable noise texture (TNoise), each through its own 2×2 matrix so the lines drift independently of the fill, and draws extra strokes at further offsets. The noise is shifted a few times a second so the lines boil.

The paper's depth sprites are left out: they need fragment depth writes (`EXT_frag_depth` in WebGL 1) and only matter when compositing sketchy objects with other 3D geometry, while here the whole frame is sketched.

Run `npm run dev --workspace=sketchy-drawings` to start it independently. The controls tune the wobble, noise scale, boil rate, stroke count, line width and edge thresholds, and `view` shows each intermediate buffer. Drag to orbit and scroll to zoom.

`js/thumbnail.js` drives thumbnail mode: it waits for the model to load, seeds `Math.random`, runs 240 frames on a virtual clock, then freezes the scene for capture.
