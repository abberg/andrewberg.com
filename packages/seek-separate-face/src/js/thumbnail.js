// Thumbnail mode: seeds Math.random, runs the sketch on a virtual clock for a
// fixed number of frames as fast as possible, then freezes it and flags the page
// as ready for the site's thumbnail capture.
(function(){

	if (!new URLSearchParams(location.search).has('thumbnail')) return;
	document.documentElement.classList.add('thumbnail');

	var seed = 12345;
	Math.random = function(){ return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); };

	var RealDate = Date,
		start = RealDate.now(),
		now = start;
	function VirtualDate(){
		if (!arguments.length) return new RealDate(now);
		return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))();
	}
	VirtualDate.prototype = RealDate.prototype;
	VirtualDate.now = function(){ return now; };
	VirtualDate.parse = RealDate.parse;
	VirtualDate.UTC = RealDate.UTC;
	window.Date = VirtualDate;
	performance.now = function(){ return now - start; };

	var realRequestAnimationFrame = window.requestAnimationFrame.bind(window),
		queue = [],
		frames = 0,
		totalFrames = 240;
	window.requestAnimationFrame = function(callback){ queue.push(callback); return queue.length; };
	window.cancelAnimationFrame = function(){};

	function tick(){
		now += 1000 / 60;
		frames++;
		var callbacks = queue;
		queue = [];
		callbacks.forEach(function(callback){ callback(now - start); });
		if (frames < totalFrames) {
			setTimeout(tick, 0);
		} else {
			window.requestAnimationFrame = realRequestAnimationFrame;
			document.documentElement.dataset.thumbnailReady = 'true';
		}
	}
	window.addEventListener('load', function(){ setTimeout(tick, 0); });

}());
