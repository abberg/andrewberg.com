import { derive, rewrite } from "./grammar.js";
import { grammars } from "./grammars.js";
import { bounds, drawShapes, svgElement, viewBox } from "./render.js";

const params = new URLSearchParams(location.search);
const thumbnail = params.has("thumbnail");
const reducedMotion = thumbnail || matchMedia("(prefers-reduced-motion: reduce)").matches;

const stage = document.getElementById("stage");
const group = document.getElementById("shapes");
const tabs = document.getElementById("tabs");
const rulesPanel = document.getElementById("rules");
const stepLabel = document.getElementById("step");
const playButton = document.getElementById("play");

if (thumbnail) document.documentElement.classList.add("thumbnail");

let key = grammars[params.get("grammar")] ? params.get("grammar") : "diamonds";
let states = [];
let index = 0;
let markerRadius = 1;
let playing = !reducedMotion;
let timer = null;

for (const [k, { title }] of Object.entries(grammars)) {
  const button = document.createElement("button");
  button.textContent = title;
  button.dataset.key = k;
  button.addEventListener("click", () => select(k));
  tabs.append(button);
}

function select(k) {
  key = k;
  const url = new URL(location.href);
  url.searchParams.set("grammar", k);
  history.replaceState(null, "", url);
  for (const button of tabs.children) button.setAttribute("aria-pressed", String(button.dataset.key === k));
  drawRules(grammars[k].grammar);
  start();
}

// Derive afresh and frame the whole derivation, so the view holds still as
// the shapes grow.
function start() {
  states = derive(grammars[key].grammar);
  const box = bounds(states.flatMap((s) => s.shapes));
  stage.setAttribute("viewBox", viewBox(box, 0.06));
  markerRadius = Math.max(box.w, box.h) * 0.006;
  show(reducedMotion ? states.length - 1 : 0);
  schedule();
}

function show(i) {
  index = Math.max(0, Math.min(states.length - 1, i));
  drawShapes(group, states[index].shapes, { markerRadius });
  const applied = states[index].applied.map((a) => a.rule);
  const names = [...new Set(applied)].join(", ");
  stepLabel.textContent = `Step ${index} of ${states.length - 1}${names ? ` · ${names} ×${applied.length}` : ""}`;
}

// Step on a timer; at the end, hold for a moment, then start a new derivation.
function schedule() {
  clearTimeout(timer);
  playButton.textContent = playing ? "Pause" : "Play";
  if (!playing) return;
  const atEnd = index >= states.length - 1;
  timer = setTimeout(
    () => {
      if (atEnd) start();
      else {
        show(index + 1);
        schedule();
      }
    },
    atEnd ? 3000 : grammars[key].interval,
  );
}

function pause() {
  playing = false;
  schedule();
}

// Each rule drawn as its left side, an arrow, and its right side: the first
// shape in the axiom with the rule's label, and what the rule puts in its
// place. Both sides share one scale.
function drawRules(g) {
  rulesPanel.replaceChildren();
  const random = mulberry32(7);
  for (const r of g.rules) {
    const lhs = g.axiom.find((s) => s.label === r.label);
    if (!lhs) continue;
    const rhs = rewrite(r.diagram ? { ...r, rhs: r.diagram } : r, lhs, { step: 1, random, shapes: [lhs] });
    const box = bounds([lhs, ...rhs]);
    const row = document.createElement("div");
    row.className = "rule";
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "→";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = r.name;
    row.append(ruleSide([lhs], box), arrow, ruleSide(rhs, box), name);
    rulesPanel.append(row);
  }
}

function ruleSide(shapes, box) {
  const svg = svgElement("svg", { viewBox: viewBox(box, 0.12) });
  const g = svgElement("g");
  svg.append(g);
  drawShapes(g, shapes, { markerRadius: Math.max(box.w, box.h) * 0.05 });
  return svg;
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

document.getElementById("prev").addEventListener("click", () => {
  pause();
  show(index - 1);
});
document.getElementById("next").addEventListener("click", () => {
  pause();
  show(index + 1);
});
document.getElementById("again").addEventListener("click", start);
playButton.addEventListener("click", () => {
  playing = !playing;
  if (playing && index >= states.length - 1) show(0);
  schedule();
});

addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLButtonElement && (event.key === " " || event.key === "Enter")) return;
  if (event.key === "ArrowLeft") {
    pause();
    show(index - 1);
  } else if (event.key === "ArrowRight") {
    pause();
    show(index + 1);
  } else if (event.key === " ") {
    event.preventDefault();
    playButton.click();
  } else if (event.key === "r" || event.key === "R") start();
});

select(key);

// The site's thumbnail script waits for this before taking its screenshot.
document.documentElement.dataset.thumbnailReady = "true";
