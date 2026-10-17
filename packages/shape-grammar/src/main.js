import { compose, scale, translate } from "./geometry.js";
import { rewrite } from "./grammar.js";
import { shapeRules } from "./grammars.js";
import { bounds, drawShapes, svgElement, viewBox } from "./render.js";

const RUNS = 6;

// One row per rule: the rule beside a grid of finished runs.
const rows = Object.values(shapeRules).map((shapeRule) => {
  const section = document.createElement("section");
  const header = document.createElement("header");
  const ruleFigure = document.createElement("div");
  ruleFigure.className = "rule";
  const button = document.createElement("button");
  button.textContent = "Regenerate";
  button.title = "Regenerate (R regenerates every rule)";
  const grid = document.createElement("div");
  grid.className = "grid";
  header.append(ruleFigure, button);
  section.append(header, grid);
  document.getElementById("rules").append(section);

  drawRule(shapeRule, ruleFigure);
  const regenerate = () => drawGrid(shapeRule, grid);
  button.addEventListener("click", regenerate);
  regenerate();
  return regenerate;
});

// The rule: its left side, an arrow, and its right side.
function drawRule(shapeRule, figure) {
  const lhs = shapeRule.lhs(scale(100));
  const matched = shapeRule.lhs(compose(translate(270, 0), scale(100)));
  const rhs = rewrite({ rhs: shapeRule.diagram }, matched, { step: 1 });
  const shapes = [lhs, ...rhs];
  const svg = svgElement("svg", { viewBox: viewBox(bounds(shapes), 0.04) });
  const g = svgElement("g");
  drawShapes(g, shapes, { plain: true });
  svg.append(g, svgElement("path", { d: "M85,0H170M158,-8L172,0L158,8", class: "arrow" }));
  figure.replaceChildren(svg);
}

// Every run of a rule is drawn at the same scale, centred in its cell, so
// their sizes can be compared.
function drawGrid(shapeRule, grid) {
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

addEventListener("keydown", (event) => {
  if ((event.key === "r" || event.key === "R") && !event.metaKey && !event.ctrlKey) rows.forEach((regenerate) => regenerate());
});

// The site's thumbnail script waits for this before taking its screenshot.
document.documentElement.dataset.thumbnailReady = "true";
