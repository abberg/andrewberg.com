Shape Grammars

A small shape grammar engine and a page with a row per rule: the rule beside a grid of six finished runs of it. Each row's Regenerate deals another six; R regenerates every row.

The rules, simplest first, are the offset triangle, where a triangle grows a copy of itself turned upside down, sharing the line of one edge and slid half a side along it (a copy that would land exactly on an existing triangle is skipped); and the square and diamond, where a square grows a diamond on one side, a square half its area turned 45° and centred on that side. Either way the new shape is one the rule applies to in turn. The third grammar has two rules on hexagons: one puts a half-size hexagon centred on the midpoint of an edge, the other puts a full-size neighbour against an edge. Rule 1 also runs backwards, making a hexagon the half-size one on the edge of a hexagon twice its size. Each edge of a hexagon takes one rule, once. Every hexagon run is symmetric: each step gives the six edges a pattern of rules that repeats every 1, 2, 3 or 6 edges (the first step every 1 or 2, so six- or three-fold), applied to every hexagon in its own frame. Runs always use both rules and stay legible: at most three sizes (the start, half it and twice it) and about a hundred hexagons, inset hexagons are details that don't grow further, hexagons of one size never overlap, and a spot two moves in one step both want goes to neither, so the symmetry holds. Each run fills its own cell.

Most runs pick one rule and one set of edges each step and apply them to every shape in its own frame, so the design keeps the symmetry of its first step; the rest add one shape at a time on a random free edge. Every run is drawn at the same scale.

- `src/geometry.js`: affine transforms (`translate`, `rotate`, `scale`, `compose`) and geometry (`rect`, `square`, `triangle`, `polygon`, `polyline`).
- `src/grammar.js`: the engine. A `shape` is geometry placed by a transform, with an optional label. A `rule` names a label and gives the shapes that replace it, written in the matched shape's own frame, so it applies wherever that label appears at any position, rotation, scale or reflection. Rules can be functions for random variation, take `when` guards and `weight`s, and can keep `data` on a shape (the diamond rule keeps each square's free sides). `derive` runs a `grammar` from its axiom, either in parallel (every labelled shape each step, like an L-system) or sequentially (one shape and rule picked at random each step), and returns every state.
- `src/grammars.js`: the offset triangle, square and diamond, and two-rule hexagon grammars, symmetric and one at a time.
- `src/render.js` and `src/main.js`: SVG drawing and the page.

Matching is on labels, not geometry, so the engine doesn't find emergent subshapes where lines happen to overlap.

- `npm run dev --workspace=shape-grammar` serves it with hot reload at http://127.0.0.1:5194.
- `npm run build --workspace=shape-grammar` writes `dist/`, which the site build copies to `/sketches/shape-grammar/`.
