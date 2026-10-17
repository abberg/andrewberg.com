import { apply, compose, hexagon, rotate, scale, scaleOf, square, translate, triangle } from "./geometry.js";
import { derive, grammar, rule, shape } from "./grammar.js";

// Square and diamond: a square grows a diamond on one side, a square half
// its area turned 45° and centred on that side's midpoint. The diamond is a
// square too, so the rule applies to it in turn. Sides are numbered in each
// square's own frame (0 right, 1 bottom, 2 left, 3 top). A diamond's sides
// 1 and 2 face back into its parent, so only 0 and 3 are free.
const DIAMOND_FREE = [0, 3];
const diamondAt = (side) => compose(rotate(90 * side), translate(0.5, 0), rotate(45), scale(Math.SQRT1_2));

function growDiamonds(matched, sides) {
  const free = matched.data.free.filter((side) => !sides.includes(side));
  return [
    { label: free.length ? "S" : null, data: { free } },
    ...sides.map((side) => ({ label: "S", at: diamondAt(side), data: { free: DIAMOND_FREE } })),
  ];
}

const diamondRule = { name: "add diamond", diagram: [{}, { label: "S", at: diamondAt(0) }] };
const diamondAxiom = () => [shape(square(1), { label: "S", transform: scale(300), data: { free: [0, 1, 2, 3] } })];

// Every step picks one set of sides and grows diamonds on those sides of
// every square at once. Each square applies the same choice in its own
// frame, so whatever symmetry the first step has, the whole design keeps.
const SYMMETRIC_STARTS = [[0, 1, 2, 3], [0, 2], [0, 1, 2, 3], [0]];

function stepSides(context) {
  if (!context.sides) {
    if (context.step === 1) context.sides = SYMMETRIC_STARTS[Math.floor(context.random() * SYMMETRIC_STARTS.length)];
    else {
      const picks = [[0], [3], [0, 3], [0, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2, 3]];
      context.sides = picks[Math.floor(context.random() * picks.length)];
    }
  }
  return context.sides;
}

const diamondSymmetric = grammar({
  axiom: diamondAxiom(),
  rules: [
    rule("S", (matched, context) => growDiamonds(matched, stepSides(context).filter((side) => matched.data.free.includes(side))), {
      ...diamondRule,
      when: (matched, context) => stepSides(context).some((side) => matched.data.free.includes(side)),
    }),
  ],
  steps: 5,
});

// The same rule, one square and one free side at a time.
const diamondWalk = grammar({
  axiom: diamondAxiom(),
  mode: "sequential",
  rules: [
    rule(
      "S",
      (matched, { random }) => {
        const { free } = matched.data;
        return growDiamonds(matched, [free[Math.floor(random() * free.length)]]);
      },
      { ...diamondRule, when: (matched) => matched.transform[0] ** 2 + matched.transform[1] ** 2 > 30 ** 2 },
    ),
  ],
  steps: 40,
});

// Offset triangle: a triangle grows a copy of itself turned upside down,
// sharing the line of one edge and slid half a side along it, so the copy's
// corner sits on that edge's midpoint. The copy is the same triangle, so the
// rule applies to it in turn. Edges are numbered in each triangle's own frame,
// 0 being the one the copy grows from; edge 0 of a copy lies on its parent's,
// so a copy has edges 1 and 2 free.
const TRIANGLE_HEIGHT = Math.sqrt(3) / 2;
const offsetAt = (edge) => compose(rotate(120 * edge), translate(-0.5, (2 * TRIANGLE_HEIGHT) / 3), rotate(180));
const TRIANGLE_FREE = [1, 2];

// Where a triangle would land, so a rule never stacks one exactly on another.
function centreKey(transform) {
  const [x, y] = apply(transform, [0, 0]);
  return `${Math.round(x)},${Math.round(y)}`;
}

// The free edges of a triangle whose copy wouldn't land on a triangle that's
// already there, or one placed earlier in the same step.
function openEdges(matched, edges, context) {
  if (!context.taken) context.taken = new Set(context.shapes.map((s) => centreKey(s.transform)));
  return edges.filter(
    (edge) => matched.data.free.includes(edge) && !context.taken.has(centreKey(compose(matched.transform, offsetAt(edge)))),
  );
}

function growTriangles(matched, edges, context) {
  for (const edge of edges) context.taken.add(centreKey(compose(matched.transform, offsetAt(edge))));
  const free = matched.data.free.filter((edge) => !edges.includes(edge));
  return [
    { label: free.length ? "T" : null, data: { free } },
    ...edges.map((edge) => ({ label: "T", at: offsetAt(edge), data: { free: TRIANGLE_FREE } })),
  ];
}

// The axiom points down, as in the rule.
const triangleAxiom = () => [
  shape(triangle(1), { label: "T", transform: compose(rotate(180), scale(100)), data: { free: [0, 1, 2] } }),
];

function stepEdges(context) {
  if (!context.edges) {
    // Mostly one edge per step after the first, which grows arms rather
    // than filling in a lattice.
    const picks = context.step === 1 ? [[0, 1, 2], [0, 1, 2], [0]] : [[1], [2], [1], [2], [1, 2]];
    context.edges = picks[Math.floor(context.random() * picks.length)];
  }
  return context.edges;
}

const triangleSymmetric = grammar({
  axiom: triangleAxiom(),
  rules: [
    rule("T", (matched, context) => growTriangles(matched, openEdges(matched, stepEdges(context), context), context), {
      when: (matched, context) => openEdges(matched, stepEdges(context), context).length > 0,
    }),
  ],
});

const triangleWalk = grammar({
  axiom: triangleAxiom(),
  mode: "sequential",
  rules: [
    rule(
      "T",
      (matched, context) => {
        const edges = openEdges(matched, [0, 1, 2], context);
        return growTriangles(matched, [edges[Math.floor(context.random() * edges.length)]], context);
      },
      { when: (matched, context) => openEdges(matched, [0, 1, 2], context).length > 0 },
    ),
  ],
});

// Hexagons, with two rules. Rule 1 puts a half-size hexagon centred on the
// midpoint of an edge; rule 2 puts a full-size hexagon beside an edge, sharing
// it. Edges are numbered in each hexagon's own frame, 0 being the lower right
// and counting clockwise. Each edge takes one rule or the other, once. A
// neighbour's edge 3 is the one it shares with its parent, so it isn't free;
// a half-size hexagon keeps all six.
const HEX_HEIGHT = Math.sqrt(3) / 2;
const EDGES = [0, 1, 2, 3, 4, 5];
const hexRules = {
  inset: { at: (edge) => compose(rotate(60 * edge), translate(0.75, HEX_HEIGHT / 2), scale(0.5)), free: EDGES },
  neighbour: { at: (edge) => compose(rotate(60 * edge), translate(1.5, HEX_HEIGHT)), free: [0, 1, 2, 4, 5] },
};
const MAX_HEXAGONS = 400;

// Where a hexagon would land, and how big, so a rule never stacks one
// exactly on another.
function hexKey(transform) {
  const [x, y] = apply(transform, [0, 0]);
  return `${Math.round(x)},${Math.round(y)},${Math.round(scaleOf(transform))}`;
}

function openHexEdges(matched, ruleName, edges, context) {
  if (!context.taken) context.taken = new Set(context.shapes.map((s) => hexKey(s.transform)));
  if (context.shapes.length > MAX_HEXAGONS) return [];
  // Half-size hexagons stop once they're too small to see.
  if (ruleName === "inset" && scaleOf(matched.transform) < 20) return [];
  return edges.filter(
    (edge) =>
      matched.data.free.includes(edge) &&
      !context.taken.has(hexKey(compose(matched.transform, hexRules[ruleName].at(edge)))),
  );
}

function growHexagons(matched, ruleName, edges, context) {
  const { at, free: childFree } = hexRules[ruleName];
  for (const edge of edges) context.taken.add(hexKey(compose(matched.transform, at(edge))));
  const free = matched.data.free.filter((edge) => !edges.includes(edge));
  return [
    { label: free.length ? "H" : null, data: { free } },
    ...edges.map((edge) => ({ label: "H", at: at(edge), data: { free: childFree } })),
  ];
}

const hexAxiom = () => [shape(hexagon(1), { label: "H", transform: scale(100), data: { free: EDGES } })];

// Every step picks one rule and one set of edges for every hexagon at once.
function stepHexChoice(context) {
  if (!context.choice) {
    const ruleName = context.random() < 0.65 ? "neighbour" : "inset";
    const picks = context.step === 1 ? [EDGES, [0, 2, 4], [0, 3]] : [[0], [1], [5], [0, 1], [0, 5], [0, 2, 4]];
    context.choice = { ruleName, edges: picks[Math.floor(context.random() * picks.length)] };
  }
  return context.choice;
}

const symmetricHexRule = (ruleName) =>
  rule(
    "H",
    (matched, context) => growHexagons(matched, ruleName, openHexEdges(matched, ruleName, stepHexChoice(context).edges, context), context),
    {
      name: ruleName,
      when: (matched, context) =>
        stepHexChoice(context).ruleName === ruleName &&
        openHexEdges(matched, ruleName, stepHexChoice(context).edges, context).length > 0,
    },
  );

const hexSymmetric = grammar({ axiom: hexAxiom(), rules: [symmetricHexRule("inset"), symmetricHexRule("neighbour")] });

const walkHexRule = (ruleName, weight) =>
  rule(
    "H",
    (matched, context) => {
      const edges = openHexEdges(matched, ruleName, EDGES, context);
      return growHexagons(matched, ruleName, [edges[Math.floor(context.random() * edges.length)]], context);
    },
    { name: ruleName, weight, when: (matched, context) => openHexEdges(matched, ruleName, EDGES, context).length > 0 },
  );

const hexWalk = grammar({ axiom: hexAxiom(), mode: "sequential", rules: [walkHexRule("inset", 0.35), walkHexRule("neighbour", 1)] });

// Each grammar, simplest first: its left side for the diagrams (given a
// transform), the parts each rule's right side adds, and a way to make one
// finished run. Most runs apply the
// rules to the same sides of every shape at once, so they keep the symmetry of
// their first step; the rest add one shape at a time.
export const shapeRules = {
  triangle: {
    lhs: (transform) => shape(triangle(1), { transform: compose(transform, rotate(180)) }),
    diagrams: [[{}, { at: offsetAt(0) }]],
    run: (random) =>
      random() < 0.5
        ? derive(triangleSymmetric, { steps: 3 + Math.floor(random() * 4), random }).at(-1).shapes
        : derive(triangleWalk, { steps: 4 + Math.floor(random() * 14), random }).at(-1).shapes,
  },
  diamond: {
    lhs: (transform) => shape(square(1), { transform }),
    diagrams: [diamondRule.diagram],
    run: (random) =>
      random() < 0.7
        ? derive(diamondSymmetric, { steps: 3 + Math.floor(random() * 3), random }).at(-1).shapes
        : derive(diamondWalk, { steps: 8 + Math.floor(random() * 24), random }).at(-1).shapes,
  },
  hexagon: {
    lhs: (transform) => shape(hexagon(1), { transform: compose(transform, scale(0.5)) }),
    diagrams: [
      [{}, { at: hexRules.inset.at(0) }],
      [{}, { at: hexRules.neighbour.at(0) }],
    ],
    run: (random) =>
      random() < 0.6
        ? derive(hexSymmetric, { steps: 3 + Math.floor(random() * 2), random }).at(-1).shapes
        : derive(hexWalk, { steps: 6 + Math.floor(random() * 18), random }).at(-1).shapes,
  },
};
