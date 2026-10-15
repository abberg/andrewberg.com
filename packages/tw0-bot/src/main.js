import Two from "two.js";
import { weightedRandom } from "@thi.ng/random";
import PoissonDiskSampling from "poisson-disk-sampling";
import Intersects from "intersects";

const DEG_TO_RAD = Math.PI / 180;

// Each theme sets the background, the colour that shows between the tiles, and
// the tile colours with their weights: mostly the main colour, with a few
// accents. ?layout=pair shows these two side by side; the default grid fetches
// a palette per robot from Colormind and falls back to these if it can't.
const themes = [
  {
    background: "#392F5A",
    backing: "#000",
    colors: ["#FF8811", "#9DD9D2", "#F4D06F", "#FFF8F0"],
    weights: [5, 5, 4, 86],
  },
  {
    // Off-black, indigo, purple and pink. The main colour is lifted off pure
    // black so the drop shadows show; the indigo and purple are brightened from
    // #150050 and #3F0071 so they read against it.
    background: "#F5EAD7",
    backing: "#150050",
    colors: ["#3A24A8", "#7424B8", "#FB2576", "#2D2A32"],
    weights: [6, 6, 4, 84],
  },
];

const shapes = [
  (two) => two.makeRectangle(0, 0, 30, 40 * Math.random() + 60),
  (two) => {
    const size = Math.random() * 10 + 40;
    return two.makeRectangle(0, 0, size, size);
  },
  (two) => two.makeRectangle(0, 0, 30, 30),
  (two) => two.makeCircle(0, 0, 10),
  (two) => {
    const rect = two.makeRectangle(
      0,
      0,
      50 * Math.random() + 50,
      100 * Math.random() + 50
    );
    rect.skewX = Math.random();
    return rect;
  },
];
const shapeWeights = [44, 44, 10, 10, 2];
const getShape = weightedRandom(shapes, shapeWeights);

const params = new URLSearchParams(location.search);
// The site's thumbnail script loads the sketch with ?thumbnail=1. It uses the
// built-in palettes, so the site build doesn't depend on Colormind being up.
const thumbnailMode = params.has("thumbnail");

async function setup() {
  // ?outline=svg uses the original hand-drawn outline instead of generated ones.
  const svg = params.get("outline") === "svg" ? await svgOutline() : null;
  const outline = () => svg ?? generateOutline();

  if (params.get("layout") === "pair") {
    // Lay out both halves before drawing, so each stage sizes to its half.
    document.body.classList.add("pair");
    const panes = themes.map(addPane);
    themes.forEach((theme, i) => drawRobot(panes[i], theme, outline()));
  } else {
    // A grid that fills the window with cells of roughly CELL_SIZE pixels.
    const columns = Math.max(1, Math.round(innerWidth / CELL_SIZE));
    const rows = Math.max(1, Math.round(innerHeight / CELL_SIZE));
    document.body.classList.add("grid");
    document.body.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    document.body.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    const panes = Array.from({ length: columns * rows }, addPane);
    await Promise.all(
      panes.map(async (pane, i) => {
        const theme = thumbnailMode
          ? themes[i % themes.length]
          : await fetchTheme().catch(() => themes[i % themes.length]);
        drawRobot(pane, theme, outline());
      })
    );
  }

  // The site's thumbnail script waits for this before taking its screenshot.
  document.documentElement.dataset.thumbnailReady = "true";
}

const CELL_SIZE = 300;

function addPane() {
  const pane = document.createElement("div");
  pane.className = "pane";
  document.body.append(pane);
  return pane;
}

// Asks Colormind (http://colormind.io/api-access/) for a five-colour palette
// and turns it into a theme.
async function fetchTheme() {
  const response = await fetch("https://colormind.io/api/", {
    method: "POST",
    body: JSON.stringify({ model: "default" }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Colormind: ${response.status}`);
  const { result } = await response.json();
  return paletteTheme(result);
}

// Sorts the palette from dark to light, then picks a light robot on the
// darkest colour or a dark robot on the lightest, whichever has more contrast.
// The middle three colours are the accents, and the backing between the tiles
// is a deep shade of whichever colour is darkest.
function paletteTheme(palette) {
  const sorted = [...palette].sort((a, b) => luminance(a) - luminance(b));
  const [darkest, ...middle] = sorted;
  const lightest = middle.pop();
  const lightRobot = chance(0.5);
  const hex = (rgb) => "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");
  const shade = (rgb, amount) => rgb.map((c) => c * (1 - amount));
  return {
    background: hex(lightRobot ? darkest : lightest),
    backing: hex(shade(darkest, lightRobot ? 0.6 : 0.3)),
    colors: [...middle.map(hex), hex(lightRobot ? lightest : darkest)],
    weights: [6, 5, 4, 85],
  };
}

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function drawRobot(pane, theme, outline) {
  const two = new Two().appendTo(pane);
  two.renderer.domElement.style.background = theme.background;
  const robot = two.makeGroup();
  const getColor = weightedRandom(theme.colors, theme.weights);

  // The backing that shows between the tiles, and its mirror image.
  for (const polygon of outline.polygons) {
    for (const flip of [1, -1]) {
      const anchors = [];
      for (let i = 0; i < polygon.length; i += 2) {
        anchors.push(new Two.Anchor(polygon[i] * flip, polygon[i + 1]));
      }
      const path = new Two.Path(anchors, true);
      path.fill = theme.backing;
      path.noStroke();
      robot.add(path);
    }
  }

  const inside = (x, y) =>
    outline.polygons.some((polygon) => Intersects.polygonPoint(polygon, x, y));
  const p = new PoissonDiskSampling({
    shape: [outline.width, outline.height],
    minDistance: 25,
    maxDistance: 30,
    tries: 20,
  });
  const points = p
    .fill()
    .map((point) => [point[0] - outline.width, point[1] - outline.height * 0.5])
    .filter((point) => inside(point[0], point[1]))
    .sort(() => Math.random() - 0.5);

  points.forEach((point) => {
    const shape = getShape()(two);
    shape.position.set(point[0], point[1]);
    shape.rotation = (Math.random() * 16 - 8) * DEG_TO_RAD;
    shape.fill = getColor();
    shape.stroke = "none";
    shape.className = "js-add-shadow-l";
    robot.add(shape);

    const mirrored = shape.clone();
    mirrored.position.x = -shape.position.x;
    const mirrorScale = new Two.Vector(-1, 1);
    mirrored.scale = mirrorScale.multiply(mirrored.scale);
    mirrored.className = "js-add-shadow-r";
    robot.add(mirrored);
  });

  // Centre the robot in its half, shrinking it to fit if the half is small.
  // The margin leaves room for tiles that hang over the edge of the outline.
  const fit = () => {
    two.renderer.setSize(pane.clientWidth, pane.clientHeight);
    two.width = pane.clientWidth;
    two.height = pane.clientHeight;
    robot.position.set(two.width / 2, two.height / 2);
    // In the grid the 0.85 leaves a little background between neighbours.
    robot.scale = 0.85 * Math.min(
      1 / 0.85,
      two.width / (outline.width * 2 + 80),
      two.height / (outline.height + 80)
    );
    two.update();
  };
  new ResizeObserver(fit).observe(pane);
  fit();

  pane.querySelectorAll(".js-add-shadow-l").forEach((path) => (path.style.filter = "url(#dropshadow-l)"));
  pane.querySelectorAll(".js-add-shadow-r").forEach((path) => (path.style.filter = "url(#dropshadow-r)"));
}

function loadOutline(uri) {
  return new Promise((resolve) => {
    new Two().load(uri, resolve);
  });
}

// The original outline: the left half of the robot, drawn in Boxy SVG.
async function svgOutline() {
  const group = await loadOutline("outline.svg");
  const svg = group.children[0];
  const vertices = svg.children[0].vertices
    .map((vert) => [vert.x - svg.width / 2, vert.y])
    .flat();
  return { width: svg.width, height: svg.height, polygons: [vertices] };
}

const between = (min, max) => min + Math.random() * (max - min);
// Like between(), but even odds of landing either side of the geometric
// middle, so 0.5 to 2 is as likely to halve a size as to double it.
const factor = (min, max) => Math.exp(between(Math.log(min), Math.log(max)));
const chance = (odds) => Math.random() < odds;

// Builds the left half of a robot from randomly sized body parts, each a
// four-sided polygon. Parts are measured from the centre line (x) and the top
// of the head (y), and stack on one another so the body always joins up. The
// base sizes come from outline.svg; each robot then gets its own proportions
// and a few optional parts, so some are squat tanks and some are lanky.
// Finally the arms and legs are pushed apart so the limbs stay readable once
// they're tiled. Returns the outline's polygons; drawRobot() draws the backing
// from them.
function generateOutline() {
  const parts = [];
  // Which part of the body the next quads belong to, for separate().
  let kind = "body";
  // A rectangle from x0 to x1 out from the centre line, y0 to y1 down.
  const box = (x0, x1, y0, y1) => quad(x0, x1, x0, x1, y0, y1);
  // A quad whose top edge spans x0 to x1 and bottom edge spans x2 to x3.
  const quad = (x0, x1, x2, x3, y0, y1) => {
    parts.push({ kind, points: [[x0, y0], [x1, y0], [x3, y1], [x2, y1]] });
  };

  // This robot's proportions.
  const bulk = factor(0.6, 1.7);
  const headSize = factor(0.5, 2);
  const headAspect = factor(0.5, 2);
  const torsoLength = factor(0.6, 1.6);
  const shoulderSize = factor(0.3, 2.2);
  const armLength = factor(0.5, 1.8);
  const armBulk = factor(0.5, 1.8);
  const legLength = factor(0.35, 1.8);
  const legBulk = factor(0.6, 1.8);

  const headW = between(28, 45) * headSize * Math.sqrt(headAspect);
  const headH = between(70, 100) * headSize / Math.sqrt(headAspect);
  // Leave room above the head for a crest or antennae.
  const headTop = 60;
  box(0, headW, headTop, headTop + headH);

  if (chance(0.35)) {
    // A crest down the middle of the head.
    const crestW = headW * between(0.15, 0.5);
    box(0, crestW, headTop - between(15, 55), headTop + 5);
  } else if (chance(0.4)) {
    // Antennae or horns, leaning out.
    const hornX = headW * between(0.4, 0.95);
    const hornW = between(6, 16);
    const lean = between(-5, 30);
    quad(hornX - hornW, hornX, hornX - hornW + lean, hornX - hornW / 3 + lean, headTop + 5, headTop - between(20, 60));
  }

  const neck = headTop + headH;
  const collarH = chance(0.3) ? 0 : between(12, 24);
  if (collarH) box(between(8, 20), headW + between(15, 40) * bulk, neck, neck + collarH);

  const chestTop = neck + collarH * between(0, 0.6);
  const chestW = between(70, 100) * bulk;
  const chestBottom = chestTop + between(80, 110) * torsoLength;
  box(0, chestW, chestTop, chestBottom);

  const shoulderW = chestW + between(40, 75) * shoulderSize;
  // Big pads ride up beside the head.
  const shoulderTop = chestTop - between(0, 20) * shoulderSize;
  const shoulderBottom = shoulderTop + between(45, 70) * Math.sqrt(shoulderSize);
  kind = "shoulder";
  box(chestW * between(0.4, 0.8), shoulderW, shoulderTop, shoulderBottom);
  if (chance(0.3)) {
    // A spike rising off the shoulder pad.
    const spikeX = between(chestW, shoulderW - 10);
    const spikeW = between(15, 40);
    quad(spikeX - spikeW, spikeX + spikeW, spikeX + between(0, 25), spikeX + between(0, 25) + 4, shoulderTop + 5, shoulderTop - between(25, 70));
  }

  // Upper arm, angled out from under the shoulder.
  kind = "arm";
  const upperArmW = between(25, 40) * armBulk;
  const upperArmX = shoulderW - upperArmW * between(0.6, 1.4);
  const upperArmLean = between(0, 30);
  const elbow = shoulderBottom + between(45, 75) * armLength;
  quad(
    upperArmX - upperArmW / 2,
    upperArmX + upperArmW / 2,
    upperArmX + upperArmLean - upperArmW / 2,
    upperArmX + upperArmLean + upperArmW / 2,
    shoulderBottom - 5,
    elbow
  );

  const forearmX = upperArmX + upperArmLean;
  const forearmTopW = between(45, 75) * armBulk;
  // Some forearms flare out toward the wrist, like gauntlets.
  const forearmBottomW = forearmTopW * (chance(0.35) ? between(1.2, 1.7) : 1);
  const wrist = elbow + between(95, 140) * armLength;
  quad(
    forearmX - forearmTopW / 2,
    forearmX + forearmTopW / 2,
    forearmX - forearmBottomW / 2,
    forearmX + forearmBottomW / 2,
    elbow,
    wrist
  );

  const handW = forearmTopW * between(0.5, 0.9);
  box(forearmX - handW / 2, forearmX + handW / 2, wrist - 2, wrist + between(20, 45) * Math.sqrt(armBulk));

  kind = "body";
  const waistW = Math.min(chestW - 10, between(30, 55) * bulk);
  const waistBottom = chestBottom + between(30, 80) * torsoLength;
  box(0, waistW, chestBottom - 2, waistBottom);

  const hipW = waistW + between(10, 30) * legBulk;
  const hipBottom = waistBottom + between(18, 35);
  kind = "hips";
  box(0, hipW, waistBottom - 2, hipBottom);
  kind = "body";
  if (chance(0.25)) {
    // A skirt of armour flaring out from the hips.
    quad(0, hipW, 0, hipW + between(15, 50), waistBottom, hipBottom + between(25, 60) * legLength);
  }

  // Thigh, angled in or out from the hip toward the knee.
  kind = "leg";
  const legGap = between(8, Math.max(10, hipW * 0.5));
  const thighW = between(30, 45) * legBulk;
  const thighIn = between(-10, 20);
  const knee = hipBottom + between(80, 130) * legLength;
  quad(legGap, legGap + thighW, legGap + thighIn, legGap + thighIn + thighW, hipBottom - 25, knee);

  const shinX = legGap + thighIn + thighW / 2 + between(0, 20) * legBulk;
  const shinTopW = between(50, 75) * legBulk;
  // Some shins taper toward the ankle, some swell like boots.
  const shinBottomW = shinTopW * factor(0.6, 1.5);
  const ankle = knee + between(120, 170) * legLength;
  quad(
    Math.max(legGap, shinX - shinTopW / 2),
    shinX + shinTopW / 2,
    Math.max(legGap, shinX - shinBottomW / 2),
    shinX + shinBottomW / 2,
    knee,
    ankle
  );

  const footTopW = shinBottomW * between(0.35, 0.8);
  const footW = shinBottomW + between(5, 45) * legBulk;
  quad(
    shinX - footTopW / 2,
    shinX + footTopW / 2,
    Math.max(legGap - 10, shinX - footW / 2),
    shinX + footW / 2,
    ankle,
    ankle + between(20, 45) * Math.sqrt(legBulk)
  );

  // Trim the empty space left above the head when there's nothing up there.
  const top = Math.min(...parts.flatMap((part) => part.points.map(([, y]) => y)));
  for (const part of parts) for (const point of part.points) point[1] -= top;

  // Fit the robot to the same box as outline.svg, keeping its proportions.
  // Separating the limbs makes the robot wider, which can shrink it further,
  // so the gap is set in screen pixels and recomputed for the new scale.
  const height = Math.max(...parts.flatMap((part) => part.points.map(([, y]) => y)));
  let scale = Math.min(1, 640 / height);
  let separated, width;
  for (let attempt = 0; attempt < 4; attempt++) {
    separated = separate(parts, LIMB_GAP / scale);
    width = Math.max(...separated.flatMap((part) => part.points.map(([x]) => x)));
    const fitted = Math.min(1, 640 / height, 360 / width);
    if (fitted >= scale * 0.98) break;
    scale = fitted;
  }

  // Convert to scene coordinates, with the left half to the left of x = 0.
  return {
    width: width * scale,
    height: height * scale,
    polygons: separated.map((part) =>
      part.points.flatMap(([x, y]) => [-x * scale, y * scale - (height * scale) / 2])
    ),
  };
}

// The space, in screen pixels, kept clear between the legs, and between each
// arm and the rest of the body. Tiles overhang the outline by up to about 25px
// each side, so this leaves a visible strip of background once it's tiled.
const LIMB_GAP = 70;

// Returns a copy of the robot's parts with the limbs moved apart: the legs out
// from the centre line until they're gap apart, then each arm out until it's
// gap clear of everything but its shoulder pad. The hips and shoulder pad
// stretch to stay attached to the leg and arm.
function separate(original, gap) {
  const parts = original.map((part) => ({
    kind: part.kind,
    points: part.points.map((point) => [...point]),
  }));
  const ofKind = (kind) => parts.filter((part) => part.kind === kind);
  const shift = (group, dx) => {
    for (const part of group) for (const point of part.points) point[0] += dx;
  };
  // Widens a box-shaped part so its outer edge reaches at least x.
  const reach = (part, x) => {
    const [, topRight, bottomRight] = part.points;
    topRight[0] = Math.max(topRight[0], x);
    bottomRight[0] = Math.max(bottomRight[0], x);
  };

  const legs = ofKind("leg");
  const [thigh] = legs;
  const inner = Math.min(...legs.flatMap((part) => part.points.map(([x]) => x)));
  if (inner < gap / 2) shift(legs, gap / 2 - inner);
  reach(ofKind("hips")[0], thigh.points[1][0]);

  const arm = ofKind("arm");
  const [upperArm] = arm;
  const others = parts.filter((part) => part.kind !== "arm" && part.kind !== "shoulder");
  for (let step = 0; step < 100 && clearance(arm, others) < gap; step++) {
    shift(arm, 4);
  }
  // The pad is the first shoulder part; any spike on it stays as it is.
  reach(ofKind("shoulder")[0], upperArm.points[1][0]);

  return parts;
}

// The smallest distance between any part in a and any part in b.
function clearance(a, b) {
  let min = Infinity;
  for (const p of a) for (const q of b) min = Math.min(min, distance(p.points, q.points));
  return min;
}

// The distance between two polygons, or 0 if they overlap.
function distance(a, b) {
  if (Intersects.polygonPolygon(a.flat(), b.flat())) return 0;
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      min = Math.min(
        min,
        pointToSegment(a1, b1, b2),
        pointToSegment(a2, b1, b2),
        pointToSegment(b1, a1, a2),
        pointToSegment(b2, a1, a2)
      );
    }
  }
  return min;
}

function pointToSegment([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

setup();
