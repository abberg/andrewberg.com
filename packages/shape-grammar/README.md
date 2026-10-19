Shape Grammars

A small shape grammar engine and an endless page of a two-rule hexagon grammar, drawn in amber with a faked bloom. The rules sit at the top; below them, rows of four finished runs load as you scroll, each row a level more complex than the last. The first row is a single step of the plain rules; each level adds a step and room for more hexagons, until about the ninth row, where runs reach eight steps and 500 hexagons. About a third of runs are asymmetric. Regenerate (or R) starts again from the top.

The hexagon rules: rule 1 puts a half-size hexagon centred on the midpoint of an edge, and rule 2 puts a full-size neighbour against an edge. Rule 1 also runs backwards, making a hexagon the half-size one on the edge of a hexagon twice its size. Each edge of a hexagon takes one rule, once.

- Each step gives the six edges a pattern of rules that repeats every 1, 2, 3 or 6 edges, applied to every hexagon in its own frame. A first step that repeats every 1 or 2 edges makes the whole design six- or three-fold symmetric; one that repeats every 3 or 6 makes it asymmetric.
- An inset starts a chain: rule 1 applied again and again along the same line, halving each time toward the centre of the hexagon next door. The chain is drawn out in full at once and takes no other rule.
- Runs stay legible: three sizes at most besides the chains (the start, half it and twice it), and hexagons of one size never overlap. A spot two moves in one step both want goes to neither, so visiting order can't break the symmetry.
- Each run fills its own cell, and a row never shows the same design twice.

Two simpler grammars are still there: `?rule=triangle`, where a triangle grows an upside-down copy of itself offset half a side along one edge, and `?rule=diamond`, where a square grows a diamond on one side, a square half its area turned 45° and centred on that side.

- `src/geometry.js`: affine transforms (`translate`, `rotate`, `scale`, `compose`) and geometry (`rect`, `square`, `triangle`, `hexagon`, `polygon`, `polyline`).
- `src/grammar.js`: the engine. A `shape` is geometry placed by a transform, with an optional label. A `rule` names a label and gives the shapes that replace it, written in the matched shape's own frame, so it applies wherever that label appears at any position, rotation, scale or reflection. Rules can be functions for random variation, take `when` guards and `weight`s, and can keep `data` on a shape (such as which edges are still free). `derive` runs a `grammar` from its axiom, either in parallel (every labelled shape each step, like an L-system) or sequentially (one shape and rule picked at random each step), and returns every state.
- `src/grammars.js`: the hexagon, triangle and diamond grammars.
- `src/render.js` and `src/main.js`: SVG drawing and the page.

Matching is on labels, not geometry, so the engine doesn't find emergent subshapes where lines happen to overlap.

- `npm run dev --workspace=shape-grammar` serves it with hot reload at http://127.0.0.1:5194.
- `npm run build --workspace=shape-grammar` writes `dist/`, which the site build copies to `/sketches/shape-grammar/`.
