import { apply, compose, scale, scaleOf, translate } from "./geometry.js";
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
// Every design shown so far, so the scroll never repeats one.
const seen = new Set();

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

// A key for a design that ignores where it sits, how big it's drawn, and
// which way it's turned or flipped: the distances of its shapes from their
// centre and their sizes, relative to its largest shape, as a sorted list.
// Runs are drawn to fill their cells, so two runs with the same key look
// alike on the page.
function designKey(shapes) {
  const places = shapes.map((s) => [...apply(s.transform, [0, 0]), scaleOf(s.transform)]);
  const cx = places.reduce((sum, [x]) => sum + x, 0) / places.length;
  const cy = places.reduce((sum, [, y]) => sum + y, 0) / places.length;
  const unit = Math.max(...places.map(([, , size]) => size));
  return places
    .map(([x, y, size]) => `${Math.round((Math.hypot(x - cx, y - cy) / unit) * 50)}:${Math.round((size / unit) * 50)}`)
    .sort()
    .join(" ");
}

// One run at a level that the page hasn't shown yet. If a level runs short
// of new designs (the first, simplest pages can), it borrows from the next.
function freshRun(level, maxLevel) {
  for (let tries = 0; ; tries++) {
    const at = Math.min(level + Math.floor(tries / 200), maxLevel);
    const shapes = shapeRule.run(Math.random, at);
    const key = designKey(shapes);
    if (!seen.has(key) || tries > 2000) {
      seen.add(key);
      return { shapes, box: bounds(shapes) };
    }
  }
}

// A row of runs at its page's level, none of them a design shown before.
// Every run is drawn at the same scale, centred in its cell, unless the rule
// asks for each to fill its cell.
function addRow() {
  if (rowCount % ROWS_PER_PAGE === 0) {
    page = document.createElement("section");
    page.className = "page";
    rows.append(page);
  }
  const pageLevel = Math.floor(rowCount / ROWS_PER_PAGE);
  const maxLevel = shapeRule.maxLevel ?? 100;
  const runs = Array.from({ length: PER_ROW }, () =>
    freshRun(pageLevel <= maxLevel ? pageLevel : Math.floor(Math.random() * (maxLevel + 1)), maxLevel),
  );
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

// Add rows one at a time, letting the page paint between them, while the
// end of the page is in or near view.
function fill() {
  if (sentinel.getBoundingClientRect().top < innerHeight + 800) {
    addRow();
    setTimeout(fill, 16);
  } else {
    filling = false;
  }
}

// Check again whenever the page scrolls or resizes, starting one filling
// loop at a time.
let filling = false;
function check() {
  if (filling) return;
  filling = true;
  fill();
}

drawRules(document.getElementById("rule"));
addEventListener("scroll", check, { passive: true });
addEventListener("resize", check);
check();

// The site's thumbnail script waits for this before taking its screenshot.
document.documentElement.dataset.thumbnailReady = "true";
