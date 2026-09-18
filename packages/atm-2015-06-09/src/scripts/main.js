(function(){

	"use strict";
	
	var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
    var loop = ab.gameLoop(),
		three = ab.threeBase({
			preserveDrawingBuffer : ab.controlBar ? true : false
		}),
		sketch = ab.sketch(three);

	loop.addEventListener('frameupdate', function(event){

		var timestep = event.detail.timestep;
		sketch.update(timestep);
	
	})

	loop.addEventListener('framedraw', function(event){

		var interpolation = event.detail.interpolation;
		sketch.draw(interpolation);

	});

	sketch.init();
	if (thumbnailMode) {
        for (var i = 0; i < 120; i++) sketch.update(1000 / 60);
        sketch.draw(1);
        document.documentElement.dataset.thumbnailReady = 'true';
    } else {
        loop.start();
    }

	if(ab.controlBar){
		ab.controlBar(loop, three.renderer().domElement);
	}

}())