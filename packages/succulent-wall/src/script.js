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
let count = 0;
for(let i = 0; i < columns; i++){
  for(let j = 0; j < rows; j++){
    const s = makeSucculent(variations[Math.floor(Math.random()*variations.length)]);
    s.position = positions[count];
    group.addChild(s);
    count++;
  }
}

group.position = new paper.Point(width/2, height/2);

paper.view.draw();

function makeSucculent(config){
  const group = new paper.Group();
  const count = 16 + Math.floor(Math.random() * 50);
  const petalSize = 60 + Math.random() * 40;
  const petalCurve = 1 + Math.random();
  const petalPoint = 0.3 + Math.random() * 0.7;
  let n = count;
  const c =  1 + Math.floor(Math.random() * 5);
  const maxRadius = c * Math.sqrt(n);

  for(let i = 0; i < count; i++){
    const a = n * 137.5;
    const r = c * Math.sqrt(n);
    const x = r * Math.sin(a);
    const y = r * Math.cos(a);

    const petal = makePetal({
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
  const petal = getSuperformulaPath(3, config.curve, config.point, config.point, 1, 1);
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
