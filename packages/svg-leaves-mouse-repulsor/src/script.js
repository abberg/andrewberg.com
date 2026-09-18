var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
if (thumbnailMode) { var seed = 12345; Math.random = function(){ return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); }; }
var SVG_NS = 'http://www.w3.org/2000/svg';
var pathDescription = 'M51.4734862,0 C17.1578287,34.7291512 1.01219225e-15,68.6240807 0,101.684788 C0,134.745496 17.1578287,167.517233 51.4734862,200 C83.8244954,168.079033 100,135.307296 100,101.684788 C100,68.0622806 83.8244954,34.1673511 51.4734862,0 Z';
pathCenter = {
  x: 50,
  y: 100,
}
var mouse = vec2.set(vec2.create(), -1000, -1000);
var radius = 200;
var leafViews = [];
var leafModels = [];

var svg = document.querySelector('svg');
var width, height;
function layout(){
leafViews.forEach(function(view){ view.remove(); });
leafViews = []; leafModels = [];
var rect = svg.getBoundingClientRect();
var scale = 1.5;
width = rect.width * scale;
height = rect.height * scale;
svg.setAttribute('viewBox', '0 0 '+ width + ' ' + height); 

var sampler = poissonDiscSampler(width, height, 50);
var sample;
while ((sample = sampler())) {
  //console.log('x, y:', sample[0], sample[1]);
  var clip = document.createElementNS(SVG_NS, 'path');
  var x = sample[0] - pathCenter.x;
  var y = sample[1] - pathCenter.y;
  var deg = Math.random() * 180;
  var translate = 'translate(' + x + ', ' + y + ')';
  var rotate = 'rotate(' + deg + ' ' + pathCenter.x + ' ' + pathCenter.y + ')';
  var transformation = translate + ' ' + rotate;
  clip.setAttributeNS(null, 'd', pathDescription);
  clip.setAttributeNS(null, 'transform', transformation);
  clip.setAttributeNS(null, 'fill', '#badc58');
  clip.setAttributeNS(null, 'stroke', '#6ab04c');
  clip.setAttributeNS(null, 'stroke-width', '3');
  svg.appendChild(clip);
  leafViews.push(clip);
  leafModels.push({
    origin: vec2.set(vec2.create(), x, y),
    position: vec2.set(vec2.create(), x, y),
    center: vec2.set(vec2.create(), x + pathCenter.x, y + pathCenter.y),
    rotation: deg,
    currentScale: 1,
    targetScale: 1,
    transformation: transformation,
  });
}

}
layout();
var resizeTimer;
window.addEventListener("resize", function(){ clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 150); });

var particleViews = [];
var particleModels = [];

function spawnParticle(){
  var position = vec2.clone(mouse);
  var dir = vec2.set(vec2.create(), (Math.random() * 2 ) - 1, (Math.random() * 2 ) - 1);
  vec2.normalize(dir, dir);
  vec2.scale(dir, dir, (radius * 0.7));
  vec2.add(position, position, dir);

  var particle = document.createElementNS(SVG_NS, 'path');
  particle.setAttributeNS(null, 'd', pathDescription);
  particle.setAttributeNS(null, 'fill', '#badc58');
  particle.setAttributeNS(null, 'stroke', '#6ab04c');
  particle.setAttributeNS(null, 'filter', 'url(#shadow)');
  svg.appendChild(particle);
  particleViews.push(particle);

  vec2.normalize(dir, dir);
  vec2.scale(dir, dir, 5);

  var model = {
    position: position,
    velocity: dir,
    scale: 0.65,
    rotation: Math.random() * 360,
    rotationVelocity: Math.random() < 0.5 ? -8 : 8,
  };
  particleModels.push(model);
}

var pt = svg.createSVGPoint();
function toSvgPosition (x, y){
  pt.x = x; 
  pt.y = y;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function movePointer(event){
  var pos = toSvgPosition(event.clientX, event.clientY);
  vec2.set(mouse, pos.x, pos.y);
  spawnParticle();
}
svg.addEventListener('pointermove', movePointer);
svg.addEventListener('pointerdown', movePointer);
function resetPointer(){ vec2.set(mouse, -1000, -1000); }
svg.addEventListener('pointerleave', resetPointer);
svg.addEventListener('pointercancel', resetPointer);
svg.addEventListener('pointerup', function(event){ if(event.pointerType !== 'mouse') resetPointer(); });

var direction = vec2.create();
function updateLeaves(){
  var i = leafModels.length - 1;
  while(i > -1){
    var model = leafModels[i];

    vec2.subtract(direction, mouse, model.center);
    var dist = vec2.length(direction);
    var scale = 1;

    if( dist <= radius ){
      var inner = radius * 0.5;
      if(dist > inner){
        var per = ((dist - inner) / (radius - inner));
        scale = per;
      } 
      else {
        scale = 0;
      }
    }

    model.targetScale = scale;

    var ease = 0.5;
    if(model.targetScale > model.currentScale){
      ease = 0.04;
    }

    var difference = model.targetScale - model.currentScale;
    if( Math.abs(difference) < 0.01 ){
      model.currentScale = model.targetScale;
    } else {
      model.currentScale += difference * ease;
    }
    i--;
  }
}

function renderLeaves(){

  var i = leafModels.length - 1;
  while(i > -1){
    var model = leafModels[i];
    var view = leafViews[i];
    var x = model.position[0];
    var y = model.position[1];
    var translate = 'translate(' + x + ', ' + y + ')';
    var rotate = 'rotate(' + model.rotation + ' ' + pathCenter.x + ' ' + pathCenter.y + ')';
    var transformation;

    if(model.currentScale !== 1){
      var scale = 'matrix(' + model.currentScale + ', 0, 0, ' + model.currentScale + ', '+ ( pathCenter.x - model.currentScale * pathCenter.x ) + ', ' + ( pathCenter.y - model.currentScale * pathCenter.y ) + ')';
      transformation =  translate + ' ' + rotate + ' ' + scale;
    } else {
      transformation =  translate + ' ' + rotate;
    }

    if(model.transformation !== transformation){
      view.setAttributeNS(null, 'transform', transformation);
    }

    model.transformation = transformation;

    i--;
  }

}

var simplex = new SimplexNoise();
var noise = vec2.create();
function updateParticles(){
  var i = particleViews.length - 1;
  while(i > -1){
    var model = particleModels[i];

    var noiseScale = 128;
    var noiseOffset = 50;
    var nX = simplex.noise2D(model.position[0] / noiseScale, model.position[1] / noiseScale);
    var nY = simplex.noise2D(( model.position[0] + noiseOffset ) / noiseScale, ( model.position[1] + noiseOffset ) / noiseScale);
    vec2.set(noise, nX, nY);
    vec2.normalize(noise, noise);
    vec2.scale(noise, noise, (1-model.scale) * 0.5);

    vec2.add(model.velocity, model.velocity, noise);
    vec2.add(model.position, model.position, model.velocity);
    model.rotation += model.rotationVelocity;
    model.scale -= 0.015;

    if(model.scale <= 0){
      svg.removeChild(particleViews[i]);
      particleViews.splice(i, 1);
      particleModels.splice(i, 1);
    }

    i--;
  }
}

function renderParticles(){
  var i = particleViews.length - 1;
  while(i > -1){
    var view = particleViews[i];
    var model = particleModels[i];
    var translation = 'translate(' + ( model.position[0] - pathCenter.x ) + ', ' + ( model.position[1] - pathCenter.y ) + ')';
    var scale = model.scale;
    var scaleMatrix = 'matrix(' + scale + ', 0, 0, ' + scale + ', '+ ( pathCenter.x - scale * pathCenter.x ) + ', ' + ( pathCenter.y - scale * pathCenter.y ) + ')';
    var rotation = 'rotate(' + model.rotation + ' 50 100)';
    view.setAttributeNS(null, 'transform', translation + ' ' + rotation + ' ' + scaleMatrix );

    i--;
  }
}

function update() {
  updateLeaves();
  updateParticles();
}

function render() {  
  renderLeaves();
  renderParticles();  
}

function onFrame(){
  update();
  render();
  window.requestAnimationFrame(onFrame);
}

if (thumbnailMode) {
  for(var frame = 0; frame < 35; frame++) {
    vec2.set(mouse, width * (0.35 + frame * 0.008), height * 0.5);
    spawnParticle(); update(); render();
  }
  document.documentElement.dataset.thumbnailReady = 'true';
} else { onFrame(); }


function poissonDiscSampler(width, height, radius, rng) {
  var k = 30; // maximum number of samples before rejection
  var radius2 = radius * radius;
  var R = 3 * radius2;
  var cellSize = radius * Math.SQRT1_2;

  var gridWidth = Math.ceil(width / cellSize);
  var gridHeight = Math.ceil(height / cellSize);

  var grid = new Array(gridWidth * gridHeight);

  var queue = [];
  var queueSize = 0;

  var sampleSize = 0;

  rng = rng || Math.random;

  function far(x, y) {
    var i = x / cellSize | 0;
    var j = y / cellSize | 0;

    var i0 = Math.max(i - 2, 0);
    var j0 = Math.max(j - 2, 0);
    var i1 = Math.min(i + 3, gridWidth);
    var j1 = Math.min(j + 3, gridHeight);

    for (j = j0; j < j1; ++j) {
      var o = j * gridWidth;

      for (i = i0; i < i1; ++i) {
        var s;

        if ((s = grid[o + i])) {
          var dx = s[0] - x,
              dy = s[1] - y;

          if (dx * dx + dy * dy < radius2) {
            return false;
          }
        }
      }
    }

    return true;
  }

  function sample(x, y) {
    var s = [x, y];

    queue.push(s);

    grid[gridWidth * (y / cellSize | 0) + (x / cellSize | 0)] = s;

    sampleSize++;
    queueSize++;

    return s;
  }

  return function () {
    if (!sampleSize) {
      return sample(rng() * width, rng() * height);
    }

    // Pick a random existing sample and remove it from the queue.
    while (queueSize) {
      var i = rng() * queueSize | 0;
      var s = queue[i];

      // Make a new candidate between [radius, 2 * radius] from the existing
      // sample.
      for (var j = 0; j < k; ++j) {
        var a = 2 * Math.PI * rng();
        var r = Math.sqrt(rng() * R + radius2);
        var x = s[0] + r * Math.cos(a);
        var y = s[1] + r * Math.sin(a);

        // Reject candidates that are outside the allowed extent,
        // or closer than 2 * radius to any existing sample.
        if (x >= 0 && x < width && y >= 0 && y < height && far(x, y)) {
          return sample(x, y);
        }
      }

      queue[i] = queue[--queueSize];
      queue.length = queueSize;
    }
  };
};