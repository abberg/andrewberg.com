import { compose, rotate, scale, square, translate } from "./geometry.js";
import { grammar, rule, shape } from "./grammar.js";

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

export const diamondRule = { name: "add diamond", diagram: [{}, { label: "S", at: diamondAt(0) }] };
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

export const symmetric = grammar({
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
export const walk = grammar({
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
