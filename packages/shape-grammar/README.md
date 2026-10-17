Shape Grammar

A small shape grammar engine and a sketch that steps through six grammars built with it. Pick one with the buttons or `?grammar=diamonds` (the default), `walk`, `squares`, `tree`, `triangles` or `rooms`.

The default is the square and diamond rule: a square grows a diamond on one side, a square half its area turned 45° and centred on that side, and the diamond is a square the rule can apply to in turn. `diamonds` picks one set of sides each step and applies it to every square in its own frame, so the design keeps the symmetry of its first step; `walk` adds one diamond at a time on a random free side. Each rule is drawn beside it as its left side, an arrow and its right side. Shapes a rule can still rewrite are pink, with a dot that shows their orientation; terminal shapes are ink. It plays one step at a time, holds on the last step, then derives again. Use ◀ ▶ (or the arrow keys) to step, space to pause, and New (or R) for a fresh derivation. Reduced motion shows the finished derivation.

- `src/geometry.js`: affine transforms (`translate`, `rotate`, `scale`, `compose`) and geometry (`rect`, `square`, `triangle`, `polygon`, `polyline`).
- `src/grammar.js`: the engine. A `shape` is geometry placed by a transform, with an optional label. A `rule` names a label and gives the shapes that replace it, written in the matched shape's own frame, so it applies wherever that label appears at any position, rotation, scale or reflection. Rules can be functions for random variation, take `when` guards and `weight`s, and can keep `data` on a shape (the diamond rule keeps each square's free sides). `derive` runs a `grammar` from its axiom, either in parallel (every labelled shape each step, like an L-system) or sequentially (one shape and rule picked at random each step), and returns every state.
- `src/grammars.js`: the demo grammars.
- `src/render.js` and `src/main.js`: SVG drawing and the page.

Matching is on labels, not geometry, so the engine doesn't find emergent subshapes where lines happen to overlap.

- `npm run dev --workspace=shape-grammar` serves it with hot reload at http://127.0.0.1:5194.
- `npm run build --workspace=shape-grammar` writes `dist/`, which the site build copies to `/sketches/shape-grammar/`.
