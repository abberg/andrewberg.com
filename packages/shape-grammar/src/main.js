import { compose, scale, square, translate } from "./geometry.js";
import { derive, rewrite, shape } from "./grammar.js";
import { diamondRule, symmetric, walk } from "./grammars.js";
import { bounds, drawShapes, svgElement, viewBox } from "./render.js";

const RUNS = 24;

const ruleFigure = document.getElementById("rule");
const grid = document.getElementById("grid");

// The rule: a square, an arrow, and the square with its diamond.
function drawRule() {
  const lhs = shape(square(1), { transform: scale(100) });
  const matched = shape(square(1), { transform: compose(translate(270, 0), scale(100)) });
  const rhs = rewrite({ rhs: diamondRule.diagram }, matched, { step: 1 });
  const shapes = [lhs, ...rhs];
  const svg = svgElement("svg", { viewBox: viewBox(bounds(shapes), 0.04) });
  const g = svgElement("g");
  drawShapes(g, shapes, { plain: true });
  svg.append(g, svgElement("path", { d: "M85,0H170M158,-8L172,0L158,8", class: "arrow" }));
  ruleFigure.replaceChildren(svg);
}

// One finished run: most apply the rule to the same sides of every square at
// once, so they stay symmetric; some add one diamond at a time.
function run(random) {
  if (random() < 0.7) {
    const steps = 3 + Math.floor(random() * 3);
    return derive(symmetric, { steps, random }).at(-1).shapes;
  }
  const steps = 8 + Math.floor(random() * 24);
  return derive(walk, { steps, random }).at(-1).shapes;
}

// Every run is drawn at the same scale, centred in its cell, so their sizes
// can be compared.
function drawGrid() {
  const runs = Array.from({ length: RUNS }, () => {
    const shapes = run(Math.random);
    return { shapes, box: bounds(shapes) };
  });
  const size = Math.max(...runs.map(({ box }) => Math.max(box.w, box.h)));
  grid.replaceChildren(
    ...runs.map(({ shapes, box }, i) => {
      const cell = document.createElement("figure");
      const number = document.createElement("figcaption");
      number.textContent = i + 1;
      const centre = { x: box.x + box.w / 2 - size / 2, y: box.y + box.h / 2 - size / 2, w: size, h: size };
      const svg = svgElement("svg", { viewBox: viewBox(centre, 0.05) });
      const g = svgElement("g");
      drawShapes(g, shapes, { plain: true });
      svg.append(g);
      cell.append(number, svg);
      return cell;
    }),
  );
}

drawRule();
drawGrid();

document.getElementById("again").addEventListener("click", drawGrid);
addEventListener("keydown", (event) => {
  if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey) drawGrid();
});

// The site's thumbnail script waits for this before taking its screenshot.
document.documentElement.dataset.thumbnailReady = "true";
