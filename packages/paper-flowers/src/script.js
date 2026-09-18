(function(){
  paper.setup(document.getElementById('canvas'));
  var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
  function render(){
    var originalRandom = Math.random;
    if (thumbnailMode) {
      var seed = 12345;
      Math.random = function(){ return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); };
    }
    try {
var simplex = new SimplexNoise('seed');
var canvas = document.getElementById('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
paper.project.clear();
paper.view.viewSize = new paper.Size(window.innerWidth, window.innerHeight);

var sampler = poissonDiscSampler(window.innerWidth, window.innerHeight, 140);
var samples = [];
var sample;
while ((sample = sampler())) {
  samples.push(sample);
}
shuffleArray(samples);

for(var i = 0; i < Math.min(15, samples.length); i++){
  var flower = getFlower();
  flower.position = new paper.Point(samples[i][0], samples[i][1]);
  flower.rotation = Math.random() * 360;
  var scale = 0.7 + Math.random() * 0.3;
  flower.scaling = new paper.Point(scale, scale);
}

paper.view.draw();

function getFlower(){
  var petal = getSuperformulaPath(10, 2, 0, 10, 1, 1);
  petal.scaling = new paper.Point(100, 100);
  addNoise(petal);
  var cutout = getSuperformulaPath(1, 1, 0.5, 0.5, 1, 1);
  cutout.scaling = new paper.Point(40, 40);
  addNoise(cutout);
  var petals = petal.subtract(cutout);
  petals.fillColor = Math.random() < 0.5 ? 'white' : '#c00'; 
  var center = getSuperformulaPath(1, 1, 1, 1, 1, 1);
  center.scaling = new paper.Point(25, 25);
  center.fillColor = 'orange';
  addNoise(center);
  return new paper.Group([petals, center]);
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

function addNoise(path){
  
  var noiseScale = 0.018;
  var offsetX = Math.random() * 1000;
  var offsetY = offsetX + 500;
  var noiseMax = 5;
  
  var sl = path.segments.length;
  for (var i = 0; i < sl; i++) {

    var point = path.segments[i].point;
    
    var noiseX = simplex.noise2D((point.x + offsetX) * noiseScale, (point.y + offsetX) * noiseScale);
    var noiseY = simplex.noise2D((point.x + offsetY) * noiseScale, (point.y + offsetY) * noiseScale);

    point.x += (noiseX * noiseMax);
    point.y += (noiseY * noiseMax);
  }
}

// Based on https://www.jasondavies.com/poisson-disc/
function poissonDiscSampler(width, height, radius) {
  var k = 30, // maximum number of samples before rejection
      radius2 = radius * radius,
      R = 3 * radius2,
      cellSize = radius * Math.SQRT1_2,
      gridWidth = Math.ceil(width / cellSize),
      gridHeight = Math.ceil(height / cellSize),
      grid = new Array(gridWidth * gridHeight),
      queue = [],
      queueSize = 0,
      sampleSize = 0;

  return function() {
    if (!sampleSize) return sample(Math.random() * width, Math.random() * height);

    // Pick a random existing sample and remove it from the queue.
    while (queueSize) {
      var i = Math.random() * queueSize | 0,
          s = queue[i];

      // Make a new candidate between [radius, 2 * radius] from the existing sample.
      for (var j = 0; j < k; ++j) {
        var a = 2 * Math.PI * Math.random(),
            r = Math.sqrt(Math.random() * R + radius2),
            x = s[0] + r * Math.cos(a),
            y = s[1] + r * Math.sin(a);

        // Reject candidates that are outside the allowed extent,
        // or closer than 2 * radius to any existing sample.
        if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) return sample(x, y);
      }

      queue[i] = queue[--queueSize];
      queue.length = queueSize;
    }
  };

  function far(x, y) {
    var i = x / cellSize | 0,
        j = y / cellSize | 0,
        i0 = Math.max(i - 2, 0),
        j0 = Math.max(j - 2, 0),
        i1 = Math.min(i + 3, gridWidth),
        j1 = Math.min(j + 3, gridHeight);

    for (j = j0; j < j1; ++j) {
      var o = j * gridWidth;
      for (i = i0; i < i1; ++i) {
        if (s = grid[o + i]) {
          var s,
              dx = s[0] - x,
              dy = s[1] - y;
          if (dx * dx + dy * dy < radius2) return false;
        }
      }
    }

    return true;
  }

  function sample(x, y) {
    var s = [x, y];
    queue.push(s);
    grid[gridWidth * (y / cellSize | 0) + (x / cellSize | 0)] = s;
    ++sampleSize;
    ++queueSize;
    return s;
  }
}

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
      document.documentElement.dataset.thumbnailReady = 'true';
    } finally { Math.random = originalRandom; }
  }
  var resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });
  render();
}());
