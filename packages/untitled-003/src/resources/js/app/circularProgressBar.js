circularProgressBar = (function(){

	var canvas		= document.createElement('canvas'),
		ctx			= canvas.getContext('2d'),
		halfPI		= 1.5707963267948966,
		twoPI		= 6.283185307179586,
		radius		= 60,
		lineWidth	= 20,
		position	= radius + lineWidth,
		size		= position * 2,
		startAngle	= halfPI,
		currentAngle = startAngle,
		targetAngle = startAngle,

		completeSignal = Object.create(signal, {slots:{value:[], writable:true, enumerable:true}}),

		setProgress = function(per){
			targetAngle = startAngle+(twoPI*per);
		},

		update = function(){
			currentAngle += (targetAngle-currentAngle)*0.09;
		},

		draw = function(){
			ctx.clearRect ( 0 , 0, size, size );
			ctx.beginPath();
			ctx.arc(position,position,radius,startAngle,currentAngle);
			ctx.strokeStyle = '#333';
			ctx.lineWidth = lineWidth;
			ctx.stroke();
		},

		animate = function(){
			update();
			draw();
			window.requestAnimationFrame(animate, canvas);
		},

		hide = function(){
			canvas.setAttribute('style','display:none');
		},

		transitionOut = function(){

			TweenLite.to(canvas, 1, {opacity:0, onComplete:function(){
					hide();
					completeSignal.emit();
				}
			});

		},

		_end;



	canvas.setAttribute('width', size);
	canvas.setAttribute('height', size);
	canvas.setAttribute('style','margin-left: -'+position+'px; margin-top:-'+position+'px; position: fixed; top:50%; left:50%;');
	document.body.appendChild(canvas);
	animate();

	return {
		completeSignal: completeSignal,
		setProgress: setProgress,
		hide: hide,
		transitionOut: transitionOut
	};

}());