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

export const grammars = {
  squares: { title: "Inscribed squares", interval: 260, grammar: squares },
  tree: { title: "Branching", interval: 650, grammar: tree },
  triangles: { title: "Corner triangles", interval: 900, grammar: triangles },
  rooms: { title: "Rooms", interval: 110, grammar: rooms },
};
