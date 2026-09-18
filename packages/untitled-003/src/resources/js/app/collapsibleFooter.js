var collapsibleFooter = (function(){
	var footer			= document.getElementById('footer'),
		toggle			= document.getElementById('toggle'),
		main			= document.body,
		closed			= true,
		margin			= -footer.offsetHeight,
		targetMargin	= 0,
		easing;

	footer.style.marginBottom = margin+'px';
	footer.className = 'footer';

	toggle.addEventListener('click', function(){
		console.log('click');
		if(closed){
			//open
			targetMargin		= margin;
			easing				= Power2.easeOut;
			closed				= false;
		}else{
			//close
			targetMargin		= 0;
			easing				= Power2.easeIn;
			closed				= true;
		}

		TweenLite.to(main, 0.5, {marginTop:targetMargin+'px', ease:easing});

	});

	window.addEventListener('resize', function(){
		margin = -footer.offsetHeight;
		footer.style.marginBottom = margin+'px';
	});

}());