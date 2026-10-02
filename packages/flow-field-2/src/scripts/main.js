(function(){

	var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
	if (thumbnailMode) {
		var seed = 12345;
		Math.random = function(){ return ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); };
		document.documentElement.classList.add('thumbnail');
	}

	var camera,
		scene,
		renderer,
		boids,
		noise,
		startTime;

	if( !init() ){
		if (thumbnailMode) {
			for (var i = 0; i < 120; i++) update(i / 60 * 1000 * 0.0001);
			render();
			document.documentElement.dataset.thumbnailReady = 'true';
		} else {
			animate();
		}
	}

	function init() {

		if( !Detector.webgl ){

			Detector.addGetWebGLMessage();
			return true;

		}

		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 1, 1000 );
		camera.position.set(0, 0, 150);
		scene.add(camera);

		var light = new THREE.PointLight();
		light.position.set(50,50,50);
		scene.add( light );

		var geometry = new THREE.CubeGeometry( 100, 100, 100, 1, 1, 1);
		var material = new THREE.MeshBasicMaterial( { color: 0x444444, wireframe:true} );
		var cube = new THREE.Mesh( geometry, material );
		scene.add( cube );

		boids = [];
		var numBoids = 600;
		for(var i = 0; i < numBoids; i++){
			var pos = new THREE.Vector3(Math.random()*100-50, Math.random()*100-50, Math.random()*100-50);
			var m = Math.random()*1.1;
			var boid = createVehicle({position: pos, mass:m});
			boids.push(boid);

			var boidView = createVehicleView();
			boidView.scale = new THREE.Vector3(m, m, m);
			boid.updated.connect(boidView.presentationModelUpdated, boidView);

			scene.add(boidView.container);

		}

		noise = new SimplexNoise();
		startTime = new Date();

		renderer = new THREE.WebGLRenderer();
		renderer.setSize( window.innerWidth, window.innerHeight );
		document.body.appendChild( renderer.domElement );

		window.addEventListener('resize', function(){
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize( window.innerWidth, window.innerHeight );
		});

	}

	function animate() {

		requestAnimationFrame( animate );
		update((new Date() - startTime) * 0.0001);
		render();

	}

	function wrap(value){
		if(value > 50) return -50;
		if(value < -50) return 50;
		return value;
	}

	function update(time){
		var bl = boids.length;
		for(var i = 0; i < bl ; i++){

			var scaling = 0.008;
			var xpos = boids[i].position.x * scaling;
			var ypos = boids[i].position.y * scaling;
			var zpos = boids[i].position.z * scaling;

			var yoff = 16;
			var zoff = -128;
			var x = noise.noise4d(xpos, ypos, zpos, time);
			var y = noise.noise4d(xpos+yoff, ypos+yoff, zpos+yoff, time);
			var z = noise.noise4d(xpos+zoff, ypos+zoff, zpos+zoff, time);

			var force = new THREE.Vector3(x, y, z).normalize().multiplyScalar(Math.random()*0.3);

			boids[i].acceleration = force;
			boids[i].update();

			boids[i].position.x = wrap(boids[i].position.x);
			boids[i].position.y = wrap(boids[i].position.y);
			boids[i].position.z = wrap(boids[i].position.z);
		}

	}

	function render() {
		renderer.render( scene, camera );
	}

}());
