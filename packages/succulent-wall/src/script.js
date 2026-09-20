(function(){
  paper.setup(document.getElementById('canvas'));
  var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
  var generation = 0;
  var plantTimer;
  function render(){
    const currentGeneration = ++generation;
    clearTimeout(plantTimer);
    paper.view.onFrame = null;
    delete document.documentElement.dataset.thumbnailReady;
    var originalRandom = Math.random;
    if (thumbnailMode) {
      var seed = 12345;
      Math.random = function(){ return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); };
    }
    try {
const RAD_TO_DEG = 180 / Math.PI;
const canvas = document.getElementById('canvas');
const width = window.innerWidth;
const height = window.innerHeight;
canvas.width = width;
canvas.height = height;
paper.project.clear();
paper.view.viewSize = new paper.Size(window.innerWidth, window.innerHeight);

const variations = [
  {
    petalGradient: ['#0a3d62', '#b8e994'],
    petalBorder: '#ffaaaa',
  },
  {
    petalGradient: ['#5a6852', '#cbdbe1'],
    petalBorder: '#cbdbe1',
  },
  {
    petalGradient: ['#1f572f', '#8ed089'],
    petalBorder: '#8ed089',
  },
  {
    petalGradient: ['#162414', '#455d4b'],
    petalBorder: '#332233',
  },
  {
    petalGradient: ['#1b361a', '#50844d'],
    petalBorder: '#6b956b',
  },
  {
    petalGradient: ['#281616', '#483033'],
    petalBorder: '#9a9b95',
  },
  {
    petalGradient: ['#142417', '#506361'],
    petalBorder: '#506361',
  },
  {
    petalGradient: ['#266261', '#bde6f0'],
    petalBorder: '#bde6f0',
  },
    {
    petalGradient: ['#477a49', '#8dcf89'],
    petalBorder: '#d5f2cf',
  },
];

const cell = 170;
const rows = Math.max(1, Math.floor(height/cell));
const columns = Math.max(1, Math.floor(width/cell));
const positions = [];
for(let i = 0; i < columns; i++){
  for(let j = 0; j < rows; j++){
    positions.push(new paper.Point(cell * i, cell * j));
  }
}

shuffleArray(positions);

const group = new paper.Group();
const animated = !thumbnailMode && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const growing = [];
let count = 0;
const offset = new paper.Point((width - cell * (columns - 1)) / 2,
                               (height - cell * (rows - 1)) / 2);

function addPlant(){
  if (currentGeneration !== generation) return;
  const plant = makeSucculent(variations[Math.floor(Math.random()*variations.length)]);
  plant.position = positions[count].add(offset);
  group.addChild(plant);
  if (animated) {
    const center = plant.position.clone();
    const petals = plant.removeChildren();
    // Cache three leaf layers: the center opens first, followed by the outer leaves.
    // This keeps thousands of vector points and shadows out of the animation loop.
    for (let layer = 0; layer < 3; layer++) {
      const leaves = new paper.Group(petals.slice(
        Math.floor(layer * petals.length / 3), Math.floor((layer + 1) * petals.length / 3)));
      const padding = new paper.Path.Rectangle(leaves.bounds.expand(48));
      padding.fillColor = null;
      padding.strokeColor = null;
      leaves.addChild(padding);
      const cached = leaves.rasterize(72 * Math.min(devicePixelRatio || 1, 2));
      leaves.remove();
      plant.addChild(cached);
      // Raster pivots use local coordinates, not canvas coordinates.
      cached.pivot = cached.globalToLocal(center);
      cached.position = center;
      const scale = cached.scaling.clone();
      growing.push({item: cached, scale, start: performance.now() + (2 - layer) * 140});
      cached.scaling = scale.multiply(0.015);
    }
  }
  count++;
  paper.view.update();
  if (count < positions.length) {
    // Yield after each plant, with a pause after every batch of three.
    plantTimer = setTimeout(addPlant, animated && count % 3 === 0 ? 240 : 0);
  } else if (!animated) {
    document.documentElement.dataset.thumbnailReady = 'true';
  }
}

if (animated) paper.view.onFrame = function(){
  const now = performance.now();
  for (let i = growing.length - 1; i >= 0; i--) {
    const growth = growing[i];
    const t = Math.max(0, Math.min(1, (now - growth.start) / 1500));
    const ease = 1 - Math.pow(1 - t, 3);
    growth.item.scaling = growth.scale.multiply(0.015 + 0.985 * ease);
    if (t === 1) growing.splice(i, 1);
  }
  if (count === positions.length && !growing.length) {
    paper.view.onFrame = null;
    document.documentElement.dataset.thumbnailReady = 'true';
  }
};
// Thumbnail generation stays synchronous so its seeded randomness is deterministic.
if (thumbnailMode) {
  while (count < positions.length) {
    addPlant();
    clearTimeout(plantTimer);
  }
} else {
  plantTimer = setTimeout(addPlant, 0);
}

function makeSucculent(config){
  const group = new paper.Group();
  const count = 16 + Math.floor(Math.random() * 50);
  const petalSize = 60 + Math.random() * 40;
  const petalCurve = 1 + Math.random();
  const petalPoint = 0.3 + Math.random() * 0.7;
  let n = count;
  const c =  1 + Math.floor(Math.random() * 5);
  const maxRadius = c * Math.sqrt(n);

  const template = getSuperformulaPath(3, petalCurve, petalPoint, petalPoint, 1, 1);
  template.remove();
  for(let i = 0; i < count; i++){
    const a = n * 137.5;
    const r = c * Math.sqrt(n);
    const x = r * Math.sin(a);
    const y = r * Math.cos(a);

    const petal = makePetal({
      template: template,
      gradient: config.petalGradient,
      border: config.petalBorder,
      size: petalSize,
      curve: petalCurve,
      point: petalPoint,
    });
    petal.position = new paper.Point(x, y);
    petal.scale(0.2 + ( 0.8 * ( r / maxRadius ) ),  1 * ( r / maxRadius ));
    petal.rotation = 180 - (a * RAD_TO_DEG);
    group.addChild(petal);

    n--;
  }

  return group;

}

function makePetal(config){
  const petalSize = config.size;
  const group = new paper.Group();
  const petal = config.template.clone();
  petal.rotation = 30;
  petal.scaling = new paper.Point(petalSize, petalSize);
  petal.position = new paper.Point(0, -(petalSize * 0.18));

  const border = petal.clone();
  border.scaling = new paper.Point(1.05, 1.05);
  border.position.y -= 4;
  border.fillColor = config.border;
  border.shadowColor = 'rgba(0, 0, 0, 0.6)';
  border.shadowBlur = 20;
  border.shadowOffset = new paper.Point(0, 2);
  group.addChild(border);

  petal.fillColor = {
    gradient: {
      stops: [[config.gradient[0], 0], [config.gradient[1], 1]],
      radial: true
    },
    origin: petal.bounds.bottomCenter,
    destination: petal.bounds.topCenter
  };
  group.addChild(petal);

  group.pivot = new paper.Point(0, petal.bounds.height * 0.2);
  return group;
}

// Generate a single path comprised of points located using superformula
function getSuperformulaPath(m, n1, n2, n3, a, b) {
    var resolution = 720;
    var phi = (Math.PI*2) / resolution;
    var path = new paper.Path();
    for(var i=0; i<=resolution; i++) {
      path.add(getSuperformulaPoint(phi*i, a, b, m, n1, n2, n3));
    }
    return path;
}

// Calculate the [x,y] position of a single point for a given angle (phi)
function getSuperformulaPoint(phi, a, b, m, n1, n2, n3) {
    var point = new paper.Point();
    var r;
    var t1, t2;

    t1 = Math.cos(m * phi / 4) / a;
    t1 = Math.abs(t1);
    t1 = Math.pow(t1, n2);

    t2 = Math.sin(m * phi / 4) / b;
    t2 = Math.abs(t2);
    t2 = Math.pow(t2, n3);

    r = Math.pow(t1 + t2, 1 / n1);

    if(Math.abs(r) == 0) {
        point.x = 0;
        point.y = 0;
    } else {
        r = 1 / r;
        point.x = r * Math.cos(phi);
        point.y = r * Math.sin(phi);
    }

    return point;
}

function shuffleArray(array) {
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}
    } finally { Math.random = originalRandom; }
  }
  var resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });
  render();
}());
