import { IDENTITY, multiply } from "./geometry.js";

// A labelled shape grammar.
//
// A shape is a piece of geometry placed by a transform, and may carry a label.
// Labels are what rules look for: a rule names a label, and wherever a shape
// with that label appears, at any position, rotation, scale or reflection, the
// rule can replace it. The replacement is written in the matched shape's own
// frame, so one rule drawn once applies the same way to every copy. A shape
// with no label is terminal: no rule can touch it again.
//
// This matches on labels rather than on geometry, so it doesn't find shapes
// that only emerge where lines overlap (Stiny's subshapes); every shape a rule
// can see is one a rule put there.

let nextId = 0;

export function shape(geometry, { label = null, transform = IDENTITY, ...style } = {}) {
  return { id: nextId++, geometry, label, transform, step: 0, style };
}

// rule(label, rhs, options)
//
// rhs is a list of parts, or a function (matched, context) => parts for rules
// that vary. Each part is
//   { at, label, geometry, style }
// where `at` is a transform in the matched shape's frame (the identity if
// left out), `label` is the new shape's label (none, so terminal, if left
// out), and `geometry` is its geometry (the matched shape's if left out).
// So { } on its own keeps the matched shape and drops its label.
//
// options.when(matched, context) can refuse a match; options.weight sets how
// often a rule is picked when several apply; options.name names it.
export function rule(label, rhs, { when = () => true, weight = 1, name = label } = {}) {
  return { label, rhs, when, weight, name };
}

export function grammar({ axiom, rules, mode = "parallel", steps = 10 }) {
  return { axiom, rules, mode, steps };
}

// The rules that can rewrite this shape.
export function applicableRules(rules, matched, context) {
  if (matched.label == null) return [];
  return rules.filter((r) => r.label === matched.label && r.when(matched, context));
}

// The shapes a rule puts in place of a matched shape.
export function rewrite(r, matched, context) {
  const parts = typeof r.rhs === "function" ? r.rhs(matched, context) : r.rhs;
  return parts.map((part) => ({
    id: nextId++,
    geometry: part.geometry ?? matched.geometry,
    label: part.label ?? null,
    transform: multiply(matched.transform, part.at ?? IDENTITY),
    step: context.step,
    style: part.style ?? (part.geometry ? {} : matched.style),
  }));
}

// Run a grammar from its axiom, returning every state of the derivation.
//
// In "parallel" mode each step rewrites every labelled shape at once, like an
// L-system. In "sequential" mode each step rewrites a single shape, picked at
// random along with the rule, as in a classic shape grammar derivation.
// The derivation stops early once no rule applies.
export function derive(g, { steps = g.steps, random = Math.random } = {}) {
  const axiom = g.axiom.map((s) => ({ ...s, step: 0 }));
  const states = [{ shapes: axiom, applied: [] }];
  for (let step = 1; step <= steps; step++) {
    const { shapes } = states[states.length - 1];
    const context = { step, random, shapes };
    const next = g.mode === "sequential" ? sequentialStep(g, shapes, context) : parallelStep(g, shapes, context);
    if (!next) break;
    states.push(next);
  }
  return states;
}

function parallelStep(g, shapes, context) {
  const applied = [];
  const result = [];
  for (const s of shapes) {
    const options = applicableRules(g.rules, s, context);
    if (options.length === 0) {
      result.push(s);
      continue;
    }
    const r = pickWeighted(options, context.random);
    applied.push({ rule: r.name, shape: s.id });
    result.push(...rewrite(r, s, context));
  }
  return applied.length ? { shapes: result, applied } : null;
}

function sequentialStep(g, shapes, context) {
  const matches = [];
  shapes.forEach((s, index) => {
    for (const r of applicableRules(g.rules, s, context)) matches.push({ rule: r, index, weight: r.weight });
  });
  if (matches.length === 0) return null;
  const { rule: r, index } = pickWeighted(matches, context.random);
  const matched = shapes[index];
  const result = [...shapes.slice(0, index), ...rewrite(r, matched, context), ...shapes.slice(index + 1)];
  return { shapes: result, applied: [{ rule: r.name, shape: matched.id }] };
}

function pickWeighted(items, random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let pick = random() * total;
  for (const item of items) {
    pick -= item.weight;
    if (pick < 0) return item;
  }
  return items[items.length - 1];
}
