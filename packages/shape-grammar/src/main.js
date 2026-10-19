import { compose, scale, translate } from "./geometry.js";
import { rewrite } from "./grammar.js";
import { shapeRules } from "./grammars.js";
import { bounds, drawShapes, svgElement, viewBox } from "./render.js";

// The page shows one grammar: the two-rule hexagons, or another with
// ?rule=triangle or ?rule=diamond. Its rules sit at the top, and rows of runs
// follow, loading as you scroll, in pages of four rows: every row in a page
// is at the same level, and each page is a level more complex than the last.
// Past the rule's top level, every run takes a level at random, so those
// pages show the whole range.
const params = new URLSearchParams(location.search);
const shapeRule = shapeRules[params.get("rule")] ?? shapeRules.hexagon;
const PER_ROW = 4;
const ROWS_PER_PAGE = 4;

const rows = document.getElementById("rows");
const sentinel = document.getElementById("more");
let rowCount = 0;
let page = null;
let seen = new Set();

// Each rule, labelled: its left side, an arrow, and its right side, all at
// one scale.
function drawRules(figure) {
  const diagrams = shapeRule.diagrams.map((parts) => {
    const lhs = shapeRule.lhs(scale(100));
    const matched = shapeRule.lhs(compose(translate(270, 0), scale(100)));
    return [lhs, ...rewrite({ rhs: parts }, matched, { step: 1 })];
  });
  // Room above for the labels.
  const box = bounds(diagrams.flat());
  box.y -= 42;
  box.h += 42;
  figure.replaceChildren(
    ...diagrams.map((shapes, i) => {
      const svg = svgElement("svg", { viewBox: viewBox(box, 0.04) });
      const g = svgElement("g");
      drawShapes(g, shapes, { plain: true });
      // The label sits just above the left side's top left corner.
      const left = bounds([shapes[0]]);
      const label = svgElement("text", { x: left.x, y: left.y - 26, class: "label" });
      label.textContent = `RULE ${i + 1}`;
      svg.append(g, svgElement("path", { d: "M85,0H170M158,-8L172,0L158,8", class: "arrow" }), label);
      return svg;
    }),
  );
}

// A row of runs at its page's level. Different plans can derive the same
// design, so a run that matches one already on the page (same count and
// extent) is drawn again. Every run is drawn at the same scale, centred in its cell, unless
// the rule asks for each to fill its cell.
function addRow() {
  if (rowCount % ROWS_PER_PAGE === 0) {
    page = document.createElement("section");
    page.className = "page";
    rows.append(page);
    seen = new Set();
  }
  const pageLevel = Math.floor(rowCount / ROWS_PER_PAGE);
  const maxLevel = shapeRule.maxLevel ?? Infinity;
  const runs = Array.from({ length: PER_ROW }, () => {
    for (let tries = 0; ; tries++) {
      const level = pageLevel <= maxLevel ? pageLevel : Math.floor(Math.random() * (maxLevel + 1));
      const shapes = shapeRule.run(Math.random, level);
      const box = bounds(shapes);
      const signature = `${shapes.length}:${Math.round(box.w)}:${Math.round(box.h)}`;
      if (!seen.has(signature) || tries > 20) {
        seen.add(signature);
        return { shapes, box };
      }
    }
  });
  const largest = Math.max(...runs.map(({ box }) => Math.max(box.w, box.h)));
  const row = document.createElement("div");
  row.className = "grid";
  row.append(
    ...runs.map(({ shapes, box }) => {
      const cell = document.createElement("figure");
      const size = shapeRule.fit === "each" ? Math.max(box.w, box.h) : largest;
      const centre = { x: box.x + box.w / 2 - size / 2, y: box.y + box.h / 2 - size / 2, w: size, h: size };
      const svg = svgElement("svg", { viewBox: viewBox(centre, 0.05) });
      const g = svgElement("g");
      drawShapes(g, shapes, { plain: true });
      svg.append(g);
      cell.append(svg);
      return cell;
    }),
  );
  page.append(row);
  rowCount++;
}

// Add rows, one a frame, while the end of the page is in or near view.
function fill() {
  if (sentinel.getBoundingClientRect().top < innerHeight + 800) {
    addRow();
    requestAnimationFrame(fill);
  }
}

const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) fill();
}, { rootMargin: "800px 0px" });


drawRules(document.getElementById("rule"));
fill();
observer.observe(sentinel);

// The site's thumbnail script waits for this before taking its screenshot.
document.documentElement.dataset.thumbnailReady = "true";
