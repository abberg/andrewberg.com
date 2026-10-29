// The paper's constants (section 5.2), which it found to work for all its
// results. Distances are in screen pixels.
export const defaultParams = {
  // Membrane and thin-plate weights of the snake's internal energy. The paper
  // uses 0.001 against a step size it doesn't give. Relative to gamma below,
  // these keep a little smoothness without ironing corners into curves: at 1,
  // a recorded walk lost over half its bends of 60 degrees or more. Steadiness
  // comes from the distance-dependent attraction and depth instead.
  alpha: 0.05,
  beta: 0.05,
  // Width of the Gaussian whose gradient attracts snakes to the samples.
  sigma: 8,
  // How much of the way to its line the attraction moves a vertex each
  // iteration: attraction within a pixel of it, attractionFar from 4 px away,
  // blending between. Gentle near the line avoids jitter from pixel-quantized
  // samples; strong far from it stops snakes smearing where limbs cross.
  // gamma is the relaxation's inverse step size; it has to be well above the
  // spring stiffness, or the explicit spring forces overshoot. The paper gives
  // none of these.
  attraction: 0.08,
  attractionFar: 0.5,
  gamma: 4,
  // Relaxation iterations per frame.
  iterations: 5,
  // Spring stiffness that stops snakes shrinking like rubber bands.
  stiffness: 1,
  // Vertex spacing: at most deltaMax, and edges under a third of it collapse.
  deltaMax: 6,
  rCover: 10,
  rTrim: 5,
  rExtend: 20,
  rMerge: 20,
  // |cos| of the largest angle between tangents that still counts as aligned.
  thetaC: 0.85,
  thetaPar: 0.85,
  // Snakes split where neighbouring tangents meet at a cosine below this.
  thetaPerp: 0.5,
  // Balance of alignment against closeness in the extension score. Not the
  // snake's alpha above.
  goodness: 0.8,
  // Brush paths (section 6). Lifespan, in frames, over which vertices fade in
  // and out: the paper's kappa_max. The paper's 3 frames is a pop at 60 fps.
  kappaMax: 8,
  // Frames a vertex has to survive before it starts fading in. In busy detail
  // (the head, hands and feet) most new snakes and extensions live only a few
  // frames, and drawn at all they flicker; this way they're never seen.
  fadeDelay: 4,
  // Pixels a frame beyond which vertices also age with how fast they move
  // (engine.ts), so lines on a fast swing show at once; 0 for off.
  fastFade: 4,
  // Frames over which deleted strokes fade out. Shorter than the fade in: a
  // dying stroke is usually being covered by something passing in front, and
  // lingering there it smears.
  fadeOut: 3,
  // How far each frame's parameterization fit is pulled towards uniform
  // arc length (slope ±1) rather than following last frame's values: 0
  // follows them exactly, 1 ignores their slope.
  uniformity: 0.15,
  // Two brush paths on one snake join once their parameters meet to within
  // this; until then leveling nudges both phases this fraction of the way.
  // Leveling is off: every nudge slides strokes along the line, and on the
  // recorded walk it was the biggest single source of jitter.
  joinTolerance: 1,
  level: 0,
  // Stroke width, and the length over which stroke ends taper, in pixels.
  strokeWidth: 2.5,
  taper: 12,
  // Drawing style: 0 ink, 1 overdrawn sketchy lines.
  style: 1,
  // Overdrawn sketchy lines (section 7.1, "Overdraw" and "Offsets"). Each
  // path is drawn sketchLayers times as short strokes of about sketchLength
  // pixels, each layer's strokes covering about sketchCoverage of it, so the
  // overdraw is about layers x coverage. Each stroke drifts across the line
  // from one side to the other, by up to sketchOffset pixels, with a slight
  // bow and a gentle wobble of sketchWobble pixels along it. All of it is
  // keyed to the brush parameter, so strokes stay put on the drawing.
  sketchLayers: 3,
  sketchLength: 101,
  sketchCoverage: 0.95,
  sketchOffset: 6,
  sketchWobble: 2,
  // How much each stroke's width and opacity vary, as fractions either way,
  // and how much the width swells and thins along a stroke, like pen pressure.
  sketchWidthVariation: 1,
  sketchOpacityVariation: 0.68,
  sketchPressure: 0.4,
  // Inserted snakes shorter than this (px) are dropped: in noisy detail they
  // would otherwise be born and die every frame.
  minLength: 12,
  // Advection follows samples on the same line (|T·t| above advectAlignment).
  // Throughout, a vertex only deals with samples (and other vertices) at its
  // own depth, within depthTolerance of its distance from the camera: where
  // limbs cross, the one in front is a different line, however close on screen.
  advectAlignment: 0.7,
  depthTolerance: 0.01,
  // A vertex's depth is last frame's, a sample's this frame's, so for a part
  // moving fast (the swipe) they differ by more than depthTolerance. Advection
  // allows this much more per pixel a frame the sample has moved.
  advectDepthSlack: 0.002,
  // Junctions (after Bénard and Hertzmann's tutorial, sections 9.1 and 9.3).
  // A snake end within junctionRadius of another snake is at a junction;
  // otherwise it's a dead end. Snakes shorter than simplifyLength are hidden
  // unless both ends are at junctions and nothing else runs over them. Line
  // ends are drawn on by up to junctionReach to meet the line they run into.
  junctionRadius: 8,
  simplifyLength: 18,
  junctionReach: 14,
  // Seed for the stochastic initialization.
  seed: 1,
};

export type Params = typeof defaultParams;
