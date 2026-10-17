import { compose, scale, translate } from "./geometry.js";
import { rewrite } from "./grammar.js";
import { shapeRules } from "./grammars.js";
import { bounds, drawShapes, svgElement, viewBox } from "./render.js";

const RUNS = 6;

// ?rule=diamond for the square and diamond rule; the offset triangle by default.
const params = new URLSearchParams(location.search);
const shapeRule = shapeRules[params.get("rule")] ?? shapeRules.triangle;

const ruleFigure = document.getElementById("rule");
const grid = document.getElementById("grid");

// The rule: its left side, an arrow, and its right side.
function drawRule() {
  const lhs = shapeRule.lhs(scale(100));
  const matched = shapeRule.lhs(compose(translate(270, 0), scale(100)));
  const rhs = rewrite({ rhs: shapeRule.diagram }, matched, { step: 1 });
  const shapes = [lhs, ...rhs];
  const svg = svgElement("svg", { viewBox: viewBox(bounds(shapes), 0.04) });
  const g = svgElement("g");
  drawShapes(g, shapes, { plain: true });
  svg.append(g, svgElement("path", { d: "M85,0H170M158,-8L172,0L158,8", class: "arrow" }));
  ruleFigure.replaceChildren(svg);
}

// Every run is drawn at the same scale, centred in its cell, so their sizes
// can be compared.
function drawGrid() {
  const runs = Array.from({ length: RUNS }, () => {
    const shapes = shapeRule.run(Math.random);
    return { shapes, box: bounds(shapes) };
  });
  const size = Math.max(...runs.map(({ box }) => Math.max(box.w, box.h)));
  grid.replaceChildren(
    ...runs.map(({ shapes, box }) => {
      const cell = document.createElement("figure");
      const centre = { x: box.x + box.w / 2 - size / 2, y: box.y + box.h / 2 - size / 2, w: size, h: size };
      const svg = svgElement("svg", { viewBox: viewBox(centre, 0.05) });
      const g = svgElement("g");
      drawShapes(g, shapes, { plain: true });
      svg.append(g);
      cell.append(svg);
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
