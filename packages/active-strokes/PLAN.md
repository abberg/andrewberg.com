# Active Strokes: web implementation plan

Rough plan for a browser implementation of **"Active Strokes: Coherent Line Stylization for Animated 3D Models"** (Bénard, Lu, Cole, Finkelstein, Thollot; NPAR 2012). Written 2026-10-28 after a design discussion, and revised the same day after reading the paper. Scaffolded (Vite, TypeScript, WebGPU) with the Behemoth walking; no `sketch.json` yet, so the site build doesn't pick it up.

## Goal

Take an animated 3D model, extract image-space feature lines, and render them as temporally coherent, stylized strokes at interactive frame rates, in the browser.

The method in one paragraph: feature samples (2D position, tangent, velocity) are vectorized by **snakes** (active contours) that are advected by the scene motion and relaxed onto the new frame's lines. Six heuristic operators (delete, split, trim, extend, merge, insert) keep snake topology and coverage clean. **Brush paths** are attached to snakes with positions relative to snake vertices, and they carry an independent arc-length parameterization, so strokes can be abstracted (straight segments, arcs, offsets) without hurting tracking.

## Decisions so far

| Topic | Decision | Why |
|---|---|---|
| GPU API | **WebGPU first**, via Three's `WebGPURenderer` | Compute shaders make extraction and compaction clean; cross-browser support is good (see below) |
| Firefox | Detect and show a clear message; no WebGL2 fallback in v1 | Only major browser with WebGPU still off by default (caniuse, checked 2026-10-28) |
| Library | **Three.js**, not raw WebGPU | Model loading, skinning, MRT render targets, async readback, less boilerplate |
| React Three Fiber | **Not required.** Keep the engine framework-agnostic; add a thin R3F wrapper later only if a richer UI justifies it | Per-frame pipeline is imperative and ordered; R3F's declarative layer doesn't help with it |
| CPU side | Plain **TypeScript in a Web Worker** | Greedy, branchy, sequential logic; the paper ran this on a 2011 Core 2 at 20-30 FPS. WASM only if profiling demands it |
| Relaxation solver | Hand-written **banded solver** in TS | With constant alpha/beta the system is pentadiagonal (cyclic for closed loops); no CHOLMOD needed |
| Attraction field | Evaluated **in the Worker** at each snake vertex, from nearby samples via the spatial hash (cutoff about 2σ) | The paper blurs a sample image on the GPU, but relaxation lives in the Worker here; this avoids a second full-screen readback. Fall back to a half-res GPU field only if profiling says so |
| Extraction input | **Flat, untextured shading + β·depth** to start | The Behemoth's rivets and panel texture would flood the filter with tiny samples; textured shading comes back later as a style choice |
| Extraction resolution | **CSS pixels**, not device pixels | Every threshold in the paper is in screen pixels, and 1x is a quarter of the work at DPR 2 |
| Build tooling | **Vite** + TypeScript | First-class module workers, TS, and HMR (useful when tuning many thresholds live); see "Build tooling" below |

Browser support snapshot (caniuse): on by default in Chrome/Edge 113+, Opera, Chrome Android, Samsung Internet, Safari iOS 26+. **Desktop Safari 26+ is "partial"**; the page doesn't say which parts, so stay within core WebGPU features and check the implementation-status wiki before using optional ones (timestamp queries, unusual texture formats).

## Pipeline: what runs where

| Stage | Nature | Home |
|---|---|---|
| G-buffer: flat shading, depth, screen-space velocity (at CSS-pixel size) | Per-pixel | GPU render pass (MRT) |
| Steerable quadrature filter pair + non-maxima suppression | Per-pixel | GPU compute (TSL) |
| Sample compaction | Parallel | GPU compute, `atomicAdd` slot allocation (order is nondeterministic, which is fine: snakes treat samples as an unordered set) |
| Readback | Async | Ring of staging buffers, accept 1 frame of latency. Each sample carries position, tangent **and velocity**, so snake vertices can be advected |
| Snake advection + relaxation, including the attraction field from nearby samples | Per-snake banded solves | Worker |
| Vectorization operators | Greedy, sequential | Worker |
| Brush path fit, parameterization, abstraction (DP, arc fit) | Per-path | Worker |
| Stroke rendering with SLAM textures | Per-fragment | GPU render pass |

Per-frame order: render G-buffer, compute extract + compact, start readback, collect last frame's samples and post to worker, receive brush-path vertex buffers and upload, render strokes.

**Latency:** because of the async readback and the Worker, strokes are a frame or two behind the render. The toon shading underneath is kept in a ring of the last 8 frames, and the frame the current strokes were extracted from is the one drawn, so the two always show the same pose (render/toon.ts).

## Architecture

Keep the engine independent of any UI framework so plain Three and R3F are both thin shells:

```ts
class ActiveStrokesEngine {
  constructor(renderer: WebGPURenderer, opts)
  update(scene, camera, dt)   // G-buffer -> compute -> readback -> worker pump
  readonly strokes: Object3D  // stroke mesh to add to a scene
  setParams(p: Partial<Params>)
  dispose()                   // worker, staging buffers, pipelines
}
```

Proposed layout:

```
active-strokes/
  src/
    render/    # Three scene, G-buffer MRT pass, stroke material
    extract/   # steerable filter + NMS + compaction (TSL compute)
    snakes/    # pure TS: snake, operators, spatial hash, relaxation
    brush/     # pure TS: brush paths, parameterization, abstraction
    worker.ts  # snakes + brush in a Worker, typed-array in/out
```

Keep `snakes/` and `brush/` free of Three imports so the operators can be unit-tested headlessly on synthetic samples (two parallel lines, a T-junction, a sharp corner). Most tuning time goes into those operators, so fast tests there pay off.

Stroke geometry: brush path vertex counts change every frame, so use a preallocated instanced/indexed buffer with a capacity cap and a draw range; don't recreate geometries. Brush paths render as triangle strips with arc-length UVs.

If R3F is used later: WebGPU goes through an async `gl` factory (`new WebGPURenderer(props)`, `await renderer.init()`), `extend(THREE)` from `three/webgpu`, and one priority-ordered `useFrame` that takes over rendering. State typings still declare `gl` as `WebGLRenderer`, so expect casts. Never `setState` in `useFrame`.

## Phases

1. **Extraction only.** Shaded + depth image -> steerable filter -> NMS -> debug view of samples with tangent ticks.
2. **Snakes.** First-frame stochastic initialization, then advection + relaxation on a rotating model, plain polylines.
3. **Operators + coverage.** delete, split, trim, extend, merge, insert, with debug overlays for footprints and radii. Most of the tuning happens here.
4. **Brush paths.** Relative offsets, lifespan fading, arc-length parameterization, simple tiled textures.
5. **SLAM + abstraction + extras.** SLAM textures, straight segments and circular arcs via DP, then overdraw, offsets, speed lines.

## Algorithm notes (from the paper)

**Operator order matters:** delete, split, trim, extend, merge, insert. Process snakes longest to shortest, except trim, which goes shortest to longest, to maximize the length of long snakes.

**Constants the paper reports as working across all its results:**

| Constant | Value | Role |
|---|---|---|
| snake alpha, beta | 0.001 | membrane / thin-plate weights |
| sigma | 8 px | Gaussian width of the attraction field |
| delta_max | 6 px | max vertex spacing after resampling |
| spring stiffness k | 1 | keeps snakes from shrinking |
| r_cover | 10 px | coverage radius |
| r_trim | 5 px | trim distance |
| r_extend | 20 px | extension search radius |
| r_merge | 20 px | merge distance |
| theta_c = theta_par | 0.85 | tangent alignment (coverage, trim, extend, merge) |
| theta_perp | 0.5 | split angle threshold |
| alpha (goodness) | 0.8 | balance in extend/merge scores. Distinct from the snake alpha above |
| kappa_max | 3 | lifespan frames for fade in/out |
| speed-line seed t | 0.5 | threshold on V = -v . n |

**Required relationships:** `r_cover > delta_max / 2`, `r_extend > r_cover`, `theta_perp < theta_par` (hysteresis between split and merge).

**Acceleration structure:** hashed sparse grid with cell size `2 * r_cover`, so a disc query walks four cells. A `Map` or typed-array hash is enough.

## Gotchas

- **Typos in the paper text.** The lifespan update `kappa = max(kappa + 1, kappa_max)` should clearly be `min`. The theta / theta_par notation is garbled in places; cross-check against the published version at diglib.eg.org.
- **SLAM textures come from Bénard et al. 2010** ("Self-Similar Texture for Coherent Line Stylization", NPAR 2010), including synthesis and lookup. Read that paper before phase 5. The per-fragment mip-level blending means this needs a shader; SVG/Canvas2D can't do it.
- **Unspecified in the paper:** stroke width, opacity mapping, tapering details. These are design choices.
- **Phase 4 result (2026-10-28):** brush paths carry a parameter per snake vertex through every operator and are refit each frame. Measured as how far each frame's fit moves parameters that already existed, sliding is about 1.1 px/frame median (p90 1.4) at uniformity 0.15. With no pull towards uniform arc length (0), the median halves but the fit goes unstable (one 1,500 px jump in 3 s). SLAM textures (phase 5) are meant to absorb exactly this slope variation.
- **Phase 5 styles (2026-10-28):** construction lines (DP into straight segments per path, with a bonus for reusing last frame's breaks, eased offsets, overshoot) keep about 89% of breaks in place frame to frame; without the bonus it's about 80%. Overdrawn sketchy lines are several layers of short offset strokes keyed to the brush parameter: a deterministic stand-in for the paper's stochastic overdraw, which needs overlapping brush paths per snake. SLAM textures and circular arcs aren't done.
- **Still poses must settle (fixed 2026-10-28).** Run naively, the operators fight on a still frame: snakes are born and die every frame, ends creep and brush parameters slide. The fixes are: relaxation moves vertices only across their line; samples are sorted before use, since GPU compaction order is random, and insertion uses a fixed seed; the fit slope is clamped; merges need samples along the join; and delete, extend and insert judge coverage with a dead band (1.25x rCover, thetaC - 0.1) relative to trim, with extension never growing within 2x rTrim of another snake running parallel. On a captured still frame: births went from 14 to about 2 a frame, end motion from 4.8 to 0.6 px, and parameter slide from 1 px to 0.02 px. Walking: 97% of vertices persist and slide is 0.47 px a frame.
- **Temporal noise tuning (2026-10-28).** On 192 recorded walk frames replayed headlessly, points on the strokes (keyed by brush path and parameter) had a frame-to-frame acceleration of about 1.6 px/frame² along and 1.6 across, roughly 3x the motion's own. The biggest sources were leveling (it slides strokes) and strong attraction. With leveling off, attraction 1, alpha 1 and beta 0.2 (a stronger beta rounds corners before split sees them), it's about 0.4 along and 0.4 across, with vertices 2.2 px from the lines instead of 1.8 and coverage unchanged at 98%. Fades lengthened from 3 to 8 frames. In the browser while walking: 98.6% of vertices persist frame to frame and parameter slide is 0.35 px/frame.
- **Smearing where limbs cross (2026-10-28).** Weak attraction made strokes lag behind at occlusions. Strong attraction snaps snakes to pixel-quantized samples, which is jitter. Making the pull depend on distance resolves it: 0.08 of the way per iteration within a pixel of the line, 0.5 from 4 px away. It works as a pull towards the Gaussian-weighted centre of nearby samples. On the recorded walk that gives smear (visible vertices over 4 px off any line) of 9.4% against 13%, with jitter about 0.5 against 1.8 for the original tuning. Samples also now take velocity and depth from the nearest surface in their 3x3 neighbourhood (silhouette samples sit on the background), and advection follows only samples aligned with the vertex and at its depth. Dying strokes fade out over 3 frames (fadeOut) and fade in over 8.
- **Depth throughout (2026-10-28).** Each vertex carries the depth of the surface it tracks, and every interaction is gated on it: advection, attraction, coverage and footprints, extension, crowding, trim, merge and insert. A vertex only deals with samples and other vertices within depthTolerance (1%) of its distance from the camera. On the recorded walk this cut smear from 9.6% to 6.7% and brought vertices closer to their lines (1.6 px against 1.9), with coverage at 99% and slightly less jitter. Tighter tolerances tear snakes apart: at 0.5% popping doubles.
- **Corners (2026-10-28).** The strong membrane (alpha 1) used against jitter ironed corners into curves: bends over 60 degrees across about 24 px dropped from about 6 to 2 a frame. Once the distance-dependent attraction and depth gating were in, it wasn't needed, so alpha = beta = 0.05 now: about 5 bends a frame, with jitter 0.41/0.48 (the older tuning was 0.67/0.85) and smear unchanged at about 6.4%.
- **Junctions (2026-10-28, from the 2019 tutorial).** At draw time only (brush/junctions.ts), snakes under 18 px are hidden if they touch a dead end, loop, or are mostly overlapped, with visibility easing over kappaMax frames. Line ends are drawn on along their tangent to the line they run into, up to 14 px, and two ends pointing at each other across a corner are drawn on to where their lines cross. On the recorded walk, short fragments drawn went from 27.5 to 16.7 a frame, and 65% of line ends now reach a line (6.4 px on average).
- **Creases and part lines (2026-10-28, tutorial 2.1).** The G-buffer also stores the view-space normal and a part id, which is the bone each vertex is bound to (every Behemoth vertex is rigidly bound to one). WebGPU guarantees only 32 bytes of colour attachments per pixel, so the normal is octahedral-encoded into two channels and shares a target with the detail amount and part id. extract/creases.ts marks a two-pixel ridge where neighbouring normals turn more than 40 degrees or the part changes, and adds it to I at weight 0.3 each. On the walk: samples 7.5k to 8.6k, snakes 91 to 101, births 7.5 to 10 a frame, vertices on surviving snakes 97.3% to 96.8%.
- **Head noise (2026-10-29).** The head has 688 triangles in about 50 px square (under 4 px each), and hands and neck are similar, so with no anti-aliasing their detail rendered as broken dashes that changed every frame. The G-buffer is now rendered at 2x and averaged down where it's read (shading bilinearly, depth, velocity and normals by explicit texel loads; creases are computed at 2x a CSS pixel apart). Line samples in the head that don't reappear where their velocity says next frame went from 4.2% to 2.7%. New vertices also now wait fadeDelay (4) frames before fading in, so pieces that live only a few frames are never drawn. Together, mid-fade ink in the head (ink style) went from 93 to 66 px a frame, overall from 1416 to 1080. Tried and dropped, for no measurable gain: density-based omission at draw time (Grabli et al. 2004; the head's lines are 5-10 px apart, not crowded by count), a coarser filter scale (the face stays a tangle), and dropping samples whose neighbours disagree in direction (cuts corners elsewhere as much as noise in the head). What was left was the face's real geometry re-forming between frames, hence the next note.
- **Per-part detail (2026-10-29).** Parts busier than their pixels can show draw only their outline (extract/parts.ts). Busyness is triangles per pixel of the part's bounding circle on screen, projected on the CPU each frame from its bone, so a part half hidden behind another isn't taken for busy (counting visible pixels on the GPU did that: the neck, behind the head, came out busiest). From 0.05 triangles per px (fully at 0.1), shading inside the part is flattened to grey in the filter's input and its creases are dropped; depth and part boundaries still outline it. At the default framing that's the head, neck, chest, hands and fingers. In the head: mid-fade ink 67 to 32 px a frame, samples down 28%, snake births halved. Overall mid-fade 1091 to 992.
- **Paused flicker (2026-10-29).** With the walk paused the samples are bit-for-bit the same every frame, yet snakes kept being born and dying (about 0.8 a frame) and 2% of vertices moved. One pass of the operators a frame falls into small loops on a still frame. One was a bug: trim counted a vertex's footprint as covered by its own snake's other vertices, which could be trimmed next, so a whole short snake was trimmed away, its samples were left uncovered, and insert seeded it again every frame. Trim now only counts other snakes (on the walk this is neutral). Slower loops remain (relax, delete and insert passing a short snake around every few frames), so after 20 frames of identical samples the engine stops tracking and only ages fades (engine.ts). Paused, nothing moves now.
- **Overshoot jitter (2026-10-29).** Measured on the walk by matching every drawn line end and overshoot tip to the nearest one last frame (moved on by the scene's motion), so merges and splits that leave the drawing in place don't count: ends move about 2 px a frame and overshoot tips about 3.3. The extra comes from the overshoot's direction, taken from the last segment (about 5 px) of a line whose end wobbles sideways by a pixel or so, which an 18 px overshoot magnifies. Junction caps now ease in and out by 3 px a frame instead of switching (junctions.ts): fewer ends appear or vanish (5.2% to 3.6%), tips 3.4 to 3.2 px. Tried and dropped: gliding ends (the operators barely move ends; 78% of frames not at all, so it changed nothing), overshoots as separate flicks, a fixed overshoot length (worse), direction from a 20 px chord (3.1 px) and direction eased over frames (3.1 px). A per-snake measure that followed snake ids had suggested ends jump 3.4 px a frame; that was merges and splits relabelling ends, not movement.
- **Removed (2026-10-29): construction lines and overshoots.** Andrew's call after the overshoot jitter work: the construction-line style (straight segments, sticky breaks, eased offsets) and the overshoots past line ends in the sketchy style are gone. Styles are now 0 ink and 1 sketchy (the default); sketchy strokes still run on a few pixels past their own ends, but not past the ends of the line.
- **Hitches (2026-10-29).** Two causes of a periodic stutter. (1) The walk's loop: the last keyframe should repeat the first, but the chest's height was 0.1 short and a few leg rotations up to a degree off, so the upper body jolted once a cycle (every two steps). render/seamless.ts spreads each mismatch over the clip's last 0.25 s at load. (2) The Worker averaged 22.6 ms a step in Chrome, over a 60 fps frame, with spikes of 50-63 ms about every 1.5 s (most likely garbage collection: relaxation and advection allocated a closure per vertex per iteration). Since the shading is shown in step with the strokes, a slow step held the whole drawing for several frames and then jumped. Relaxation and advection now use a dense grid (grid.ts DenseGrid) and allocate nothing per vertex, with identical results on the recorded walk: relax 13.2 to 6.0 ms, advect 6.1 to 2.7 ms offline. In Chrome the Worker now takes 16.8 ms (p50), 23 ms at most, and the drawing advances one frame at a time 93% of the time. Each footfall also stops the upper body from about 3.5 px a frame to nearly nothing in one frame; that's the animation's stomp, not a bug.
- **Swipe layered on the walk (2026-10-29).** The model now carries the swipe attack (attackanim/x014_000, _010, _020, _021, 1.5 + 0.5 + 6 + 2 s) as well as the walk. render/motion.ts concatenates the four into one clip and mixes it with the walk in the AnimationMixer by body half: the walk's lower half (center, waist, legs) always at full weight, its upper half (body_control and everything on it) sharing weight with the swipe, which eases in over 0.4 s. So the legs keep walking while the arms and torso swing. After the strike the attack would hold its pose for 6 s (x014_020) and then recover to standing (x014_021); instead it holds swipeHold (0.3 s) and eases back into the walk over 0.8 s, about 3 s in all. By default it swipes after every two walk cycles (panel: Swipe every, Swipe hold, Swipe now, key W). The walk's loop fix (seamless.ts) applies to the walk only. The swipe is with the right arm, so the camera now sits 25 degrees round to the model's right (it was 37 degrees to the left, where the fist passed behind the body) and is panned left by a sixth of the model's height so the outstretched fist stays in frame. At the strike the arm moves too fast for strokes to hold on: it's drawn mostly by the shading.
- **Strokes through the strike (2026-10-29).** At the strike the upper body's samples move 12-25 px a frame on average. Snakes lost hold (a third of vertices found no samples to advect with, mostly because a vertex's depth is last frame's and a fast part's depth changes by more than 1% a frame), were deleted, and their replacements took fadeDelay + kappaMax (12) frames to show, longer than the strike: fully drawn ink fell from about 4,000 px to 1,200. Two changes: advection allows advectDepthSlack (0.002) more depth tolerance per pixel a frame the sample moved, and vertices age a frame more for every fastFade (4) px a frame they move beyond 4, so lines on a fast part show within a frame or two (motion hides the flicker the wait is for); ghosts fade faster the same way, and a ghost vertex that finds nothing to advect with goes at once (it would be left behind as a trail). On the recorded strike, fully drawn ink at the fastest frame went from 1,300 to 3,300 px. In Chrome over the strike, ink on the lines rose 20% and ink off them (smear) from 7.0% to 8.2%; the walk is unchanged (5.3% off). At the very fastest frames a few streaks follow the fist; Andrew likes these as speed lines, so they stay.
- **Simplifying the model (2026-10-29), tried and dropped.** Simplifying only the busy parts at extraction (meshoptimizer per bone: head 688 to 170 triangles, neck 602 to 149, hands 331 to 99, fingers to 40%) barely helped: half-faded ink in the head went from 147 to 131 px a frame without per-part detail, and with it 89 (full model) against 95 (simplified, which also makes the head count as less busy). With borders locked the face looked unchanged; with pruning the top of the head lost its bolts but the visor band, the real source of the tangle, stayed. The head's noise is medium-scale structure, not triangle density, so the full model stays and per-part detail does the work.
- **Steering sign in y-down pixels.** With Freeman and Adelson's C2/C3 as published, orientations come out mirrored in y-down pixel space (theta = -phi); C3 has to change sign. Found in phase 1 with synthetic edges and lines.
- **The paper's snake alpha/beta (0.001) only mean something against its unstated step size.** With gamma = 4 here, 0.2 is needed to stop zigzags while walking. The membrane term then shrinks snake ends a little each frame, which the extend operator has to win back.
- **Without the phase 3 operators, snakes fold and bridge gaps** where body parts slide past each other (feet, crotch), and their vertex count creeps up (about 1.7k to 4k over 5 s). Delete, split and trim are what keep this bounded.
- **Phase 3 result (2026-10-28):** with one operator pass a frame, vertices stay at about 1.4–1.7k over 10 s of walking, and 93% of each frame's vertices are on snakes that existed the frame before. The rest of the churn is roughly 19 short snakes a frame born and dying in noisy detail (head, feet); lifespan fading in phase 4 should hide it, and a minimum snake length is the fallback.
- **Occlusion zigzag is expected.** Section 7.4: for 2-3 frames at occlusion/disocclusion events the snake tears between feature lines. It's a known limitation of the image-space approach, not a bug.
- **Brush path merging:** two brush paths merge only if continuous in position and parameter value; otherwise both are kept. Leveling gradually pulls nearby paths toward a common parameterization.

## Things to verify early

- [ ] **First thing to check.** Does Three's TSL velocity node account for previous-frame skinning (bone matrices)? With the Behemoth walking on the spot under a fixed camera, *all* motion comes from skinning, so the paper's back-projection trick (which only covers camera motion) gives nothing. Fallback: keep last frame's bone matrices ourselves and skin each vertex twice in the G-buffer pass.
- [ ] Compute dispatch and async storage-buffer readback through `WebGPURenderer`: smooth enough, and how much latency?
- [ ] SLAM stroke shader expressed in TSL (or WGSL via function node): prototype early.
- [ ] Desktop Safari "partial" support: which features, and does the design avoid them?
- [ ] Worker transfer: transferable typed arrays vs SharedArrayBuffer (the latter needs COOP/COEP headers; start with transferables).

## Build tooling

**Recommendation: Vite.** The older sketches in this repo (e.g. `toon-outline`) use a per-package `build.mjs` plus `sketch.json`, but this one has needs those builds weren't designed for:

- **Module workers.** The snake/brush engine runs in a Worker; Vite bundles `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` with TS and shared imports working in both threads.
- **TypeScript** across engine, worker, and tests, with no extra config.
- **`three/webgpu` and TSL imports** resolve and tree-shake normally.
- **Fast HMR** for the parameter-tuning loop (about ten interacting thresholds).
- **Vitest** shares the Vite config, which suits the headless operator tests in `snakes/` and `brush/`.

Fitting it into the repo:

- Give the package `dev` and `build` scripts so `npm run dev --workspace=active-strokes` works like the other sketches.
- Output to `dist/` with `dist/index.html` at the root, as `toon-outline` does. Vite will probably need `base: './'` for relative asset paths. I haven't checked how the site consumes `dist/`, so confirm that when scaffolding.
- Add `sketch.json` (title, description, category, order, thumbnail) when it's ready to show up on the site. A thumbnail mode like `toon-outline`'s seeded virtual-clock capture would need a deterministic frame loop. Snakes depend on history and start from a random seed, so thumbnails need a **seeded RNG and a fixed timestep**, and GPU readback latency makes this fiddlier still.
- If workers need `SharedArrayBuffer` later, COOP/COEP headers must also be set on the site's host, not just the dev server. Start with transferables to avoid this.

## Open questions

- Demo only, or a reusable library?
- Arbitrary glTF animations, or a few hand-picked models?

## References

- Bénard, Lu, Cole, Finkelstein, Thollot. *Active Strokes: Coherent Line Stylization for Animated 3D Models.* NPAR 2012. Definitive version at http://diglib.eg.org/
- Bénard, Cole, Golovinskiy, Finkelstein. *Self-Similar Texture for Coherent Line Stylization.* NPAR 2010. (SLAM textures)
- Kass, Witkin, Terzopoulos. *Snakes: Active Contour Models.* IJCV 1988.
- Freeman, Adelson. *The Design and Use of Steerable Filters.* PAMI 1991. (line extraction)
- Kalnins et al. *Coherent Stylized Silhouettes.* SIGGRAPH 2003. (brush path parameterization)
- Delingette, Montagnat. *New Algorithms for Controlling Active Contours Shape and Topology.* ECCV 2000. (resampling, acceleration grid)
- caniuse WebGPU: https://caniuse.com/webgpu
- Bénard, Hertzmann. *Line Drawings from 3D Models: A Tutorial.* arXiv:1810.01175, 2019 (local copy in this folder, gitignored). Chapter 2 (image-space curves) and chapter 9 (stylization, topological simplification, animation) are the relevant parts. It positions Active Strokes as the image-space tracking option and names its weakness at junctions. Ideas worth taking: normal and part-ID buffers for crease and part edges (2.1); dropping short dead-end, loop and overlap chains of 10-20 px (9.3, Bénard et al. 2014); background lines ending at the foreground contour at T-junctions (9.1); toon shading from n·l (9.4); multiply or minimum blending for overlapping dry-media strokes (9.2).
