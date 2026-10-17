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
// it. Rule 1 also runs backwards ("outset"): a hexagon becomes the half-size
// one on the edge of a hexagon twice its size. Edges are numbered in each
// hexagon's own frame, 0 being the lower right and counting clockwise. Each
// edge takes one rule, once.
const HEX_HEIGHT = Math.sqrt(3) / 2;
const EDGES = [0, 1, 2, 3, 4, 5];
const insetAt = (edge) => compose(rotate(60 * edge), translate(0.75, HEX_HEIGHT / 2), scale(0.5));
const hexRules = {
  inset: { at: insetAt, childEdge: null },
  // A neighbour's edge 3 is the one it shares with its parent.
  neighbour: { at: (edge) => compose(rotate(60 * edge), translate(1.5, HEX_HEIGHT)), childEdge: 3 },
  // The inverse of inset: in the bigger hexagon's frame, this one sits on
  // its edge 0, which is then taken.
  outset: { at: (edge) => compose(rotate(60 * edge), scale(2), translate(-0.75, -HEX_HEIGHT / 2)), childEdge: 0 },
};
const MAX_HEXAGONS = 500;
const MIN_SCALE = 20;
const MAX_SCALE = 200;

// Where a hexagon would land, and how big.
function hexPlace(transform) {
  const [x, y] = apply(transform, [0, 0]);
  return { x, y, size: scaleOf(transform) };
}

// Hexagons of one size may touch but not overlap, which keeps runs legible:
// two the same size overlap when their centres are closer than √3 sides.
function crowded(place, placed) {
  return placed.some(
    (p) => Math.abs(p.size - place.size) < 0.5 && Math.hypot(p.x - place.x, p.y - place.y) < place.size * 1.7,
  );
}

// A step's plan gives each of the six edges a rule, or none. The plan
// repeats every `period` edges: a period of 1 or 2 gives the first step six-
// or three-fold symmetry, and since every later step applies its plan to
// each hexagon in its own frame, the whole design keeps it.
function makePlan(random, periods) {
  const period = periods[Math.floor(random() * periods.length)];
  const options = [null, null, "inset", "neighbour", "neighbour", "outset"];
  const motif = Array.from({ length: period }, () => options[Math.floor(random() * options.length)]);
  return EDGES.map((edge) => motif[edge % period]);
}

// Plans for a whole run, redrawn until they use rule 2 and at least one
// direction of rule 1, and the first step isn't empty.
function makePlans(random, steps) {
  for (;;) {
    const plans = Array.from({ length: steps }, (_, i) => makePlan(random, i === 0 ? [1, 2] : [1, 2, 3, 6]));
    const used = new Set(plans.flat());
    if (plans[0].some(Boolean) && used.has("neighbour") && (used.has("inset") || used.has("outset"))) return plans;
  }
}

// The edges of a hexagon this step's plan can grow on: free, inside the size
// limits, and not overlapping a hexagon of the same size.
function hexMoves(matched, plan, context) {
  if (!context.placed) context.placed = context.shapes.map((s) => hexPlace(s.transform));
  if (context.shapes.length > MAX_HEXAGONS) return [];
  const size = scaleOf(matched.transform);
  return EDGES.filter((edge) => {
    const ruleName = plan[edge];
    if (!ruleName || !matched.data.free.includes(edge)) return false;
    if (ruleName === "inset" && size / 2 < MIN_SCALE) return false;
    if (ruleName === "outset" && size * 2 > MAX_SCALE) return false;
    return !crowded(hexPlace(compose(matched.transform, hexRules[ruleName].at(edge))), context.placed);
  });
}

function hexGrammar(plans) {
  const planFor = (context) => plans[context.step - 1];
  return grammar({
    axiom: [shape(hexagon(1), { label: "H", transform: scale(50), data: { free: EDGES } })],
    steps: plans.length,
    rules: [
      rule(
        "H",
        (matched, context) => {
          const plan = planFor(context);
          const edges = hexMoves(matched, plan, context);
          const free = matched.data.free.filter((edge) => !edges.includes(edge));
          return [
            { label: free.length ? "H" : null, data: { free } },
            ...edges.map((edge) => {
              const { at, childEdge } = hexRules[plan[edge]];
              context.placed.push(hexPlace(compose(matched.transform, at(edge))));
              return { label: "H", at: at(edge), data: { free: EDGES.filter((e) => e !== childEdge) } };
            }),
          ];
        },
        { when: (matched, context) => hexMoves(matched, planFor(context), context).length > 0 },
      ),
    ],
  });
}

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
    // Every run is symmetric, mixing the rules within and across steps.
    // Runs with too few hexagons to be interesting are drawn again.
    run: (random) => {
      for (let tries = 0; ; tries++) {
        const shapes = derive(hexGrammar(makePlans(random, 3 + Math.floor(random() * 3))), { random }).at(-1).shapes;
        if (shapes.length >= 24 || tries > 20) return shapes;
      }
    },
    // Each run fills its own cell: outsets make some runs far bigger than others.
    fit: "each",
  },
};
