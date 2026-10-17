import { compose, polyline, rect, rotate, scale, square, translate, triangle } from "./geometry.js";
import { grammar, rule, shape } from "./grammar.js";

// The demo grammars. Each is an axiom (the starting shapes) and a list of
// rules; main.js derives one and steps through it.

// A square inscribed in a square, turned a little each time. The old square
// keeps its lines but loses its label, so only the newest can be rewritten.
const TURN = 12;
const INSCRIBE = 1 / (Math.cos((TURN * Math.PI) / 180) + Math.sin((TURN * Math.PI) / 180));

const squares = grammar({
  axiom: [shape(square(560), { label: "A" })],
  rules: [rule("A", [{}, { label: "A", at: compose(rotate(TURN), scale(INSCRIBE)) }], { name: "inscribe" })],
  steps: 40,
});

// A stem grows two shorter stems from its tip, each at its own angle.
const stem = polyline(
  [[0, 0], [0, -1]],
  [0, -0.75],
);

const tree = grammar({
  axiom: [shape(stem, { label: "B", transform: compose(translate(0, 260), scale(170)) })],
  rules: [
    rule(
      "B",
      (matched, { random }) => {
        const spread = 18 + random() * 16;
        const lean = (random() - 0.5) * 14;
        return [
          {},
          { label: "B", at: compose(translate(0, -1), rotate(lean - spread), scale(0.66 + random() * 0.12)) },
          { label: "B", at: compose(translate(0, -1), rotate(lean + spread), scale(0.66 + random() * 0.12)) },
        ];
      },
      { name: "branch" },
    ),
  ],
  steps: 10,
});

// A triangle replaced by three half-size triangles in its corners. Nothing
// stays behind, so every shape keeps its label.
const corners = triangle(1).points.map(([x, y]) => compose(translate(x / 2, y / 2), scale(0.5)));

const triangles = grammar({
  axiom: [shape(triangle(1), { label: "T", transform: compose(translate(0, 60), scale(640)) })],
  rules: [rule("T", corners.map((at) => ({ label: "T", at })), { name: "subdivide" })],
  steps: 6,
});

// A rectangle split across its longer side, one room at a time, until each
// room settles: it loses its label and sometimes takes a colour.
const MIN_SIDE = 38;
const FILLS = ["#E4002B", "#0F4C9C", "#F5C400", "#2D2A32"];

const rooms = grammar({
  axiom: [shape(rect(640, 440), { label: "R" })],
  mode: "sequential",
  rules: [
    rule(
      "R",
      ({ geometry: { w, h } }, { random }) => {
        const t = 0.3 + random() * 0.4;
        if (w >= h) {
          const a = w * t;
          const b = w - a;
          return [
            { label: "R", geometry: rect(a, h), at: translate(-w / 2 + a / 2, 0) },
            { label: "R", geometry: rect(b, h), at: translate(w / 2 - b / 2, 0) },
          ];
        }
        const a = h * t;
        const b = h - a;
        return [
          { label: "R", geometry: rect(w, a), at: translate(0, -h / 2 + a / 2) },
          { label: "R", geometry: rect(w, b), at: translate(0, h / 2 - b / 2) },
        ];
      },
      { name: "split", when: ({ geometry: { w, h } }) => Math.max(w, h) * 0.3 >= MIN_SIDE },
    ),
    rule(
      "R",
      (matched, { random }) => [{ style: random() < 0.3 ? { fill: FILLS[Math.floor(random() * FILLS.length)] } : {} }],
      {
        name: "settle",
        weight: 0.25,
        when: ({ geometry: { w, h } }) => w * h < 640 * 440 * 0.08,
      },
    ),
  ],
  steps: 200,
});

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

const diamonds = grammar({
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

export const grammars = {
  diamonds: { title: "Square and diamond", interval: 900, grammar: diamonds },
  walk: { title: "Diamonds, one at a time", interval: 300, grammar: diamondWalk },
  squares: { title: "Inscribed squares", interval: 260, grammar: squares },
  tree: { title: "Branching", interval: 650, grammar: tree },
  triangles: { title: "Corner triangles", interval: 900, grammar: triangles },
  rooms: { title: "Rooms", interval: 110, grammar: rooms },
};
