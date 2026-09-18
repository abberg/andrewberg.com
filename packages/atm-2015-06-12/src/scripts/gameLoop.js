(function(ab, eventTarget){
	/*
 * A main loop useful for games and other animated applications.
 */
	ab.gameLoop = function(config){

		config = config || {};

		var that = eventTarget(),
			simulationTimestep = config.timestep || 1000 / 60,
			frameDelta = 0,
			lastFrameTimeMs = 0,
			fps = 60,
			lastFpsUpdate = 0,
			framesThisSecond = 0,
			numUpdateSteps = 0,
			minFrameDelay = 0,
			running = false,
			wasRunning = false,
			started = false,
			panic = false,
			requestID,
			
			speed = (function(){
				var speed = 1;
				return function(val){
					if(val){
						speed = val;
					}
					return speed;
				}
			}()),

			start = function() {

				if (!started) {
					
					started = true;

					requestID = requestAnimationFrame(function(timestamp) {
						
						draw(1);
						running = true;

						lastFrameTimeMs = timestamp;
						lastFpsUpdate = timestamp;
						framesThisSecond = 0;

						requestID = requestAnimationFrame(onFrame);
					});
				}
				return this;
			},

			stop = function() {
				running = false;
				started = false;
				cancelAnimationFrame(requestID);
				return this;
			},

			step = function(){
				lastFrameTimeMs += simulationTimestep;
				begin(lastFrameTimeMs, simulationTimestep);
				update(simulationTimestep * speed());
				draw(1);
				end(fps, panic);
			},

			onFrame = function(timestamp) {
				if (timestamp < lastFrameTimeMs + minFrameDelay) {
					requestID = requestAnimationFrame(onFrame);
					return;
				}

				frameDelta += timestamp - lastFrameTimeMs;
				lastFrameTimeMs = timestamp;
				begin(timestamp, frameDelta);

				if (timestamp > lastFpsUpdate + 1000) {

					fps = 0.25 * framesThisSecond + 0.75 * fps;

					lastFpsUpdate = timestamp;
					framesThisSecond = 0;
				}
				
				framesThisSecond++;
				numUpdateSteps = 0;
				
				while (frameDelta >= simulationTimestep) {
					update(simulationTimestep * speed());
					frameDelta -= simulationTimestep;
					if (++numUpdateSteps >= 240) {
						panic = true;
						break;
					}
				}

				draw(frameDelta / simulationTimestep);

				end(fps, panic);

				panic = false;

				requestID = requestAnimationFrame(onFrame);
			},

			begin = function(timestamp, frameDelta){
				that.dispatchEvent(new CustomEvent('framestart', {
					detail:{
						timestamp: timestamp,
						frameDelta: frameDelta
					}
				}));
			},

			update = function(simulationTimestep){
				that.dispatchEvent(new CustomEvent('frameupdate', {
					detail:{
						timestep: simulationTimestep,
					}
				}));
			},

			draw = function(interpolation){
				that.dispatchEvent(new CustomEvent('framedraw', {
					detail:{
						interpolation: interpolation
					}
				}));
			},

			end = function(fps, panic){
				that.dispatchEvent(new CustomEvent('frameend', {
					detail:{
						fps: fps,
						panic: panic
					}
				}));
			}


		document.addEventListener("visibilitychange", function(event){
			if(event.target.hidden){
				if(running){
					wasRunning = true;
					stop();
				}
			}else{
				if(wasRunning){
					wasRunning = false;
					start();
				}
			}
		}, false);


		that.start = start;
		that.stop = stop;
		that.step = step;
		that.speed = speed;

		return that;
	};
}(window.ab = window.ab || {}, ab.eventTarget))