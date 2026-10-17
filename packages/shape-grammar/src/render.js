import { apply } from "./geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function svgElement(name, attributes = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  return el;
}

// The points of a shape in world coordinates.
export function worldPoints(s) {
  return s.geometry.points.map((p) => apply(s.transform, p));
}

export function bounds(shapes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of shapes) {
    for (const [x, y] of worldPoints(s)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function viewBox({ x, y, w, h }, padding) {
  const pad = Math.max(w, h) * padding;
  return `${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`;
}

// Draw shapes into an SVG group. Labelled shapes, the ones rules can still
// rewrite, are drawn in the accent colour with a dot at their marker so their
// orientation shows; terminal shapes are drawn in ink. With `plain`, every
// shape is drawn in ink.
export function drawShapes(group, shapes, { markerRadius, plain = false }) {
  group.replaceChildren();
  // Terminal shapes first, so the live ones sit on top.
  const ordered = [...shapes].sort((a, b) => (a.label == null ? 0 : 1) - (b.label == null ? 0 : 1));
  for (const s of ordered) {
    const points = worldPoints(s);
    const d = `M${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}${s.geometry.closed ? "Z" : ""}`;
    const live = !plain && s.label != null;
    group.append(
      svgElement("path", {
        d,
        class: live ? "shape live" : "shape",
        ...(s.style.fill ? { style: `fill: ${s.style.fill}` } : {}),
      }),
    );
    if (live) {
      // Small shapes get smaller dots, so the dots don't bury them.
      const { w, h } = bounds([s]);
      const [x, y] = apply(s.transform, s.geometry.marker);
      group.append(svgElement("circle", { cx: x, cy: y, r: Math.min(markerRadius, Math.hypot(w, h) * 0.06), class: "marker" }));
    }
  }
}
