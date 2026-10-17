Shape Grammar

A small shape grammar engine and a page that shows one rule and a grid of finished runs of it. The rule: a square grows a diamond on one side, a square half its area turned 45° and centred on that side. The diamond is a square too, so the rule applies to it in turn. Most runs pick one set of sides each step and apply it to every square in its own frame, so the design keeps the symmetry of its first step; the rest add one diamond at a time on a random free side. Every run is drawn at the same scale. Press New runs (or R) for another grid.

- `src/geometry.js`: affine transforms (`translate`, `rotate`, `scale`, `compose`) and geometry (`rect`, `square`, `triangle`, `polygon`, `polyline`).
- `src/grammar.js`: the engine. A `shape` is geometry placed by a transform, with an optional label. A `rule` names a label and gives the shapes that replace it, written in the matched shape's own frame, so it applies wherever that label appears at any position, rotation, scale or reflection. Rules can be functions for random variation, take `when` guards and `weight`s, and can keep `data` on a shape (the diamond rule keeps each square's free sides). `derive` runs a `grammar` from its axiom, either in parallel (every labelled shape each step, like an L-system) or sequentially (one shape and rule picked at random each step), and returns every state.
- `src/grammars.js`: the square and diamond grammar, symmetric and one at a time.
- `src/render.js` and `src/main.js`: SVG drawing and the page.

Matching is on labels, not geometry, so the engine doesn't find emergent subshapes where lines happen to overlap.

- `npm run dev --workspace=shape-grammar` serves it with hot reload at http://127.0.0.1:5194.
- `npm run build --workspace=shape-grammar` writes `dist/`, which the site build copies to `/sketches/shape-grammar/`.
