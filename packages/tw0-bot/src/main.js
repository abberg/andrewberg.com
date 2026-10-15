import Two from "two.js";
import { weightedRandom } from "@thi.ng/random";
import PoissonDiskSampling from "poisson-disk-sampling";
import Intersects from "intersects";

const DEG_TO_RAD = Math.PI / 180;

var two = new Two({
  fullscreen: true,
}).appendTo(document.body);

two.renderer.domElement.style.background = "#392F5A";

const colors = ["#FF8811", "#9DD9D2", "#F4D06F", "#FFF8F0"];
const weights = [5, 5, 4, 86];
const getColor = weightedRandom(colors, weights);

const shapes = [
  () => two.makeRectangle(0, 0, 30, 40 * Math.random() + 60),
  () => {
    const size = Math.random() * 10 + 40;
    return two.makeRectangle(0, 0, size, size);
  },
  () => two.makeRectangle(0, 0, 30, 30),
  () => two.makeCircle(0, 0, 10),
  () => {
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

async function setup() {
  // ?outline=svg uses the original hand-drawn outline instead of a generated one.
  const useSvg = new URLSearchParams(location.search).get("outline") === "svg";
  const outline = useSvg ? await svgOutline() : generateOutline();
  const inside = (x, y) =>
    outline.polygons.some((polygon) => Intersects.polygonPoint(polygon, x, y));

  /*
  const vl = vert.length;
  for (let i = 0; i < vl; i += 2) {
    const circ = two.makeCircle(vert[i], vert[i + 1], 5);
    circ.fill = "#666";
  }
  */
  var p = new PoissonDiskSampling({
    shape: [outline.width, outline.height],
    minDistance: 25,
    maxDistance: 30,
    tries: 20,
  });
  var points = p
    .fill()
    .map((point) => [point[0] - outline.width, point[1] - outline.height * 0.5])
    .filter((point) => inside(point[0], point[1]))
    .sort(() => Math.random() - 0.5);

  points.forEach((point) => {
    const shape = getShape()();
    shape.position.set(point[0], point[1]);
    shape.rotation = (Math.random() * 16 - 8) * DEG_TO_RAD;
    shape.fill = getColor();
    shape.stroke = "none";
    shape.className = "js-add-shadow-l";

    const mirrored = shape.clone();
    mirrored.position.x = -shape.position.x;
    const mirrorScale = new Two.Vector(-1, 1);
    mirrored.scale = mirrorScale.multiply(mirrored.scale);
    mirrored.className = "js-add-shadow-r";
    two.add(mirrored);
  });
  /*
  points.forEach((point) => {
    //const circ = two.makeCircle(point[0], point[1], 2);
    //circ.fill = "#999";
    const shape = two.makeRectangle(
      point[0],
      point[1],
      10 + Math.random() * 5,
      30 + Math.random() * 200
    );
    //shape.skewX = Math.random();
    shape.rotation = (Math.random() * 90 - 45) * DEG_TO_RAD;
    shape.fill = getColor();
    shape.stroke = "none";

    const mirrored = shape.clone();
    mirrored.position.x = -shape.position.x;
    const mirrorScale = new Two.Vector(-1, 1);
    mirrored.scale = mirrorScale.multiply(mirrored.scale);
    two.add(mirrored);
  });
  */
  two.update();

  const paths1 = document.querySelectorAll(".js-add-shadow-l");
  paths1.forEach((path) => (path.style = "filter:url(#dropshadow-l)"));
  const paths2 = document.querySelectorAll(".js-add-shadow-r");
  paths2.forEach((path) => (path.style = "filter:url(#dropshadow-r)"));

  // The site's thumbnail script waits for this before taking its screenshot.
  document.documentElement.dataset.thumbnailReady = "true";
}

function loadOutline(uri) {
  return new Promise((resolve) => {
    two.load(uri, resolve);
  });
}

// The original outline: the left half of the robot, drawn in Boxy SVG.
async function svgOutline() {
  const group = await loadOutline("outline.svg");
  const svg = group.children[0];
  svg.position.set(-svg.width, -svg.height / 2);
  two.add(svg);

  const flipped = svg.clone();
  flipped.scale = new Two.Vector(-1, 1);
  flipped.position.x = svg.width;
  two.add(flipped);

  const vert = svg.children[0].vertices
    .map((vert) => [vert.x - svg.width / 2, vert.y])
    .flat();
  return { width: svg.width, height: svg.height, polygons: [vert] };
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
function generateOutline() {
  const parts = [];
  // A rectangle from x0 to x1 out from the centre line, y0 to y1 down.
  const box = (x0, x1, y0, y1) => quad(x0, x1, x0, x1, y0, y1);
  // A quad whose top edge spans x0 to x1 and bottom edge spans x2 to x3.
  const quad = (x0, x1, x2, x3, y0, y1) => {
    parts.push([[x0, y0], [x1, y0], [x3, y1], [x2, y1]]);
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
  box(chestW * between(0.4, 0.8), shoulderW, shoulderTop, shoulderBottom);
  if (chance(0.3)) {
    // A spike rising off the shoulder pad.
    const spikeX = between(chestW, shoulderW - 10);
    const spikeW = between(15, 40);
    quad(spikeX - spikeW, spikeX + spikeW, spikeX + between(0, 25), spikeX + between(0, 25) + 4, shoulderTop + 5, shoulderTop - between(25, 70));
  }

  // Upper arm, angled out from under the shoulder.
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

  const waistW = Math.min(chestW - 10, between(30, 55) * bulk);
  const waistBottom = chestBottom + between(30, 80) * torsoLength;
  box(0, waistW, chestBottom - 2, waistBottom);

  const hipW = waistW + between(10, 30) * legBulk;
  const hipBottom = waistBottom + between(18, 35);
  box(0, hipW, waistBottom - 2, hipBottom);
  if (chance(0.25)) {
    // A skirt of armour flaring out from the hips.
    quad(0, hipW, 0, hipW + between(15, 50), waistBottom, hipBottom + between(25, 60) * legLength);
  }

  // Thigh, angled in or out from the hip toward the knee.
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
  const top = Math.min(...parts.flat().map(([, y]) => y));
  for (const part of parts) for (const point of part) point[1] -= top;

  // Fit the robot to the same box as outline.svg, keeping its proportions.
  const width = Math.max(...parts.flat().map(([x]) => x));
  const height = Math.max(...parts.flat().map(([, y]) => y));
  const scale = Math.min(1, 640 / height, 360 / width);

  // Convert to scene coordinates, with the left half to the left of x = 0.
  const polygons = parts.map((part) =>
    part.map(([x, y]) => [-x * scale, y * scale - (height * scale) / 2])
  );

  // The black backing that shows between the tiles, and its mirror image.
  for (const polygon of polygons) {
    for (const flip of [1, -1]) {
      const anchors = polygon.map(([x, y]) => new Two.Anchor(x * flip, y));
      const path = new Two.Path(anchors, true);
      path.fill = "#000";
      path.noStroke();
      two.add(path);
    }
  }

  return {
    width: width * scale,
    height: height * scale,
    polygons: polygons.map((polygon) => polygon.flat()),
  };
}

two.bind("resize", resize);
resize();

setup();

function resize() {
  two.scene.position.set(two.width / 2, two.height / 2);
}
