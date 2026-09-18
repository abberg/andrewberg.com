'use strict';

import * as d3 from 'd3';
import poissonDiscSampler from 'poisson-disc-sampler';
import Victor from 'victor';

const voronoi = () => {
  const thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
  let thumbnailTime = 0;
  const now = () => thumbnailMode ? thumbnailTime : performance.now();
  if (thumbnailMode) { let seed = 12345; Math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); }

  
  var width = window.innerWidth,
      height = window.innerHeight;

  var container = document.createElement('div');
  container.classList.add('d3');
  document.body.appendChild(container);
  
  var svg = d3.select('.d3').append('svg')
    .attr('width', width)
    .attr('height', height)
    .on('pointermove pointerdown', function(){ moved(d3.event); })

  function getStaticPoints(){
    var points = []
    var sampler = poissonDiscSampler(width, height, width / 20);
    var sample;
 
    while ((sample = sampler())) {
      points.push({
        position: Victor.fromArray(sample),
        velocity: new Victor(),
        cull: false
      });
    }
    return points;
  }

  function getAnimatedPoints(){
    var points = [];
    var numPoints = width / 20;

    for(var i = 0; i < numPoints; i++){
      var spawn = new Victor(width/2, height/2);
      var radius = Math.random() * (width/2);
      var angle = Math.random() * Math.PI * 2;
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;
      var position = spawn.clone().add(new Victor(x, y));
      var velocity = position.clone()
        .subtract(spawn)
        .normalize()
        .multiply(new Victor(0.15, 0.15));
      points.push({
        position: position,
        velocity: velocity,
        cull: false
      });
    }

    return points;
  }

  var sites = getStaticPoints().concat(getAnimatedPoints());

  var voronoi = d3.voronoi()
      .extent([[-1, -1], [width + 1, height + 1]])
      .x(function x(d){
        return d.position.x;
      })
      .y(function y(d){
        return d.position.y;
      });

  var resizeTimeout;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      width = window.innerWidth;
      height = window.innerHeight;
      svg.attr('width', width).attr('height', height);
      voronoi = voronoi.extent([[-1, -1], [width + 1, height + 1]]);
      sites = getStaticPoints().concat(getAnimatedPoints());
    }, 500);
  });

  var polygon = svg.append('g')
      .attr('class', 'polygons')
    .selectAll('path')
    .data(voronoi.polygons(sites))
    .enter().append('path')
      .call(redrawPolygon);
  
  var lastTime = now();
  var spawnInterval = 1;
  var mouseColorScale = d3.scaleLinear()
              .domain([0, 0.05, 0.2, 0.3, 0.5, 1])
              .range([d3.hsl('#FFFFEE'), d3.hsl('#FFFF00'), d3.hsl('#990000'), d3.hsl('#220022'), d3.hsl('#333333'), d3.hsl('#666666')])
              .interpolate(d3.interpolateHsl);
  function moved(event) {
    var currentTime = now();
    if(currentTime - lastTime > spawnInterval){
      var rect = svg.node().getBoundingClientRect();
      var position = new Victor(event.clientX - rect.left, event.clientY - rect.top);
      position.x += Math.random() * 10 - 5;
      sites.push({
        position: position,
        velocity: new Victor(
          (Math.random() * 2 - 1), 
          -5 - (Math.random() * 2)
        ),
        cull: true,
        start: currentTime,
        timeToLive:  2500 + Math.random() * 500,
        color: function(){
            var elapsed = now() - this.start;
            var s = elapsed/this.timeToLive;
            if(s > 1){
              s = 1;
            }
            return mouseColorScale(s);
          }
      });
      lastTime = currentTime;
    }
  }

  function update() {
    var i = sites.length;
    while(i--){
      var site = sites[i];
      site.position.add(site.velocity);
      
      if(
        site.position.x <= 0 ||
        site.position.x >= width ||
        site.position.y <= 0 ||
        site.position.y >= height
      ){
        if(site.cull){
          sites.splice(i, 1);
        }else{
          var spawn = new Victor(width/2, height/2);
          var radius = Math.random() * ( height * 0.2 );
          var angle = Math.random() * Math.PI * 2;
          var x = Math.cos(angle) * radius;
          var y = Math.sin(angle) * radius;
          var position = spawn.clone().add(new Victor(x, y));
          var velocity = position.clone()
            .subtract(spawn)
            .normalize()
            .multiply(new Victor(0.15, 0.15));
          site.position = position;
          site.velocity = velocity;
        }
      }
    }
  }

  function redraw() {
    var diagram = voronoi(sites);
    polygon = polygon.data(diagram.polygons()), polygon.exit().remove();
    polygon = polygon.enter().append('path').merge(polygon).call(redrawPolygon);
  }

  function redrawPolygon(polygon) {
    polygon
      .attr('d', function(d) { return d ? 'M' + d.join('L') + 'Z' : null; })
      .style('fill', function(d) { return color(d); })
      .style('stroke', function(d) { return color(d); });
  }

  function color(d) {

    var mx = width / 2,
        my = height / 2,
        length = Math.sqrt(mx * mx + my * my),
        colorScale = d3.scaleLinear()
          .domain([1, 100, length * 0.9, length])
          .range([d3.hsl('#FFFFEE'), d3.hsl('#FFFF00'), d3.hsl('#330000'), d3.hsl('#110000')])
          .interpolate(d3.interpolateHsl);

    if(d){
      if(d.data.color){
        return d.data.color();
      }else{
        var dx = d.data.position.x - width / 2,
            dy = d.data.position.y - height / 2;
        return colorScale(Math.sqrt(dx * dx + dy * dy));
      } 
    }
  }

  function onFrame(){
    update();
    redraw();
    window.requestAnimationFrame(onFrame);
  }

  if (thumbnailMode) {
    for (let frame = 0; frame < 45; frame++) {
      thumbnailTime += 1000 / 60;
      moved({clientX: width * (0.3 + frame * 0.009), clientY: height * 0.7});
      update();
    }
    redraw();
    document.documentElement.dataset.thumbnailReady = 'true';
  } else { onFrame(); }
};


export default voronoi;