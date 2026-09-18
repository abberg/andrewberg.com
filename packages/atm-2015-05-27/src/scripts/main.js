(function(){

	"use strict";
	
	var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
    if (thumbnailMode) {
        var seed = 12345;
        Math.random = function(){ return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); };
    }
    var loop = ab.gameLoop(),
		three = ab.threeBase(),
		sketch = ab.sketch(three);

	loop.addEventListener('frameupdate', function(event){

		var timestep = event.detail.timestep;
		sketch.update(timestep);
	
	})

	loop.addEventListener('framedraw', function(event){

		var interpolation = event.detail.interpolation;
		sketch.draw(interpolation);
		three.renderer().render(three.scene(), three.camera());

	});

	sketch.init();
	if (thumbnailMode) {
        for (var i = 0; i < 120; i++) sketch.update(1000 / 60);
        sketch.draw(1);
        three.renderer().render(three.scene(), three.camera());
        document.documentElement.dataset.thumbnailReady = 'true';
    } else {
        loop.start();
    }

	if(ab.controlBar){
		ab.controlBar(loop, three);
	}

}())