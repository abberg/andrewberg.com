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
  /*
  const vl = vert.length;
  for (let i = 0; i < vl; i += 2) {
    const circ = two.makeCircle(vert[i], vert[i + 1], 5);
    circ.fill = "#666";
  }
  */
  var p = new PoissonDiskSampling({
    shape: [svg.width, svg.height],
    minDistance: 25,
    maxDistance: 30,
    tries: 20,
  });
  var points = p
    .fill()
    .map((point) => [point[0] - svg.width, point[1] - svg.height * 0.5])
    .filter((point) => Intersects.polygonPoint(vert, point[0], point[1]))
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

setup();

two.bind("resize", resize);
resize();

function resize() {
  two.scene.position.set(two.width / 2, two.height / 2);
}
