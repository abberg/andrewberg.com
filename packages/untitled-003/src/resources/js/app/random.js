function getRandomInt(min, max){
	return Math.floor(Math.random()*(max - min + 1)) + min;
}

var getNoise = (function(){

	var simplex = new SimplexNoise();

	return function(){
		var noise,
			scale = 0.1;

		switch (arguments.length){
			case 2:
				noise = simplex.noise2D(arguments[0]*scale, arguments[1]*scale);
				break;
			case 3:
				noise = simplex.noise3D(arguments[0]*scale, arguments[1]*scale, arguments[2]*scale);
				break;
			case 4:
				noise = simplex.noise2D(arguments[0]*scale, arguments[1]*scale, arguments[2]*scale, arguments[3]*scale);
				break;
			default:
				break;
		}
		return noise;
	};

}());