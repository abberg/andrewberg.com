(function(){
	
	if ( ! Detector.webgl ) {
		Detector.addGetWebGLMessage();
		return;
	}

	var camera,
		scene,
		renderer,
		target,
		flock;

	function init(){

		var container = document.createElement('div');
		document.getElementById('main').appendChild( container );

		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 1, 2000 );
		scene.add( camera );

		renderer = new THREE.WebGLRenderer();
		renderer.setSize( window.innerWidth, window.innerHeight );

		container.appendChild( renderer.domElement );

		window.addEventListener('resize', resizeHandler, false);

	}

	function setup(){
		var geometry,
			material,
			plane,
			light,
			numVehicles = 20,
			i = 0,
			pos,
			vel,
			mF = 0.08,
			maxV = 1.5,
			m,
			currentModel,
			currentView;

		// ground plane
		geometry = new THREE.PlaneGeometry( 1000, 1000, 25, 25);
		material = new THREE.MeshBasicMaterial( { color: 0x444444, wireframe:true} );
		plane = new THREE.Mesh( geometry, material );
		plane.position.y = -150;
		scene.add( plane );

		// light
		light = new THREE.PointLight();
		light.position.set(0,500,0);
		scene.add( light );

		// position camera
		camera.position.z = 250;
		camera.position.y = 200;

		// add vehicles
		flock = createVehicleGroup();

		for(; i < numVehicles; i++){
			pos = vec3.scale(randomVec3(), randomRange(0, 50));
			vel = vec3.scale(randomVec3(), randomRange(0, maxV));
			m = randomRange(1, 3);
			currentModel = createVehicle({position:pos, velocity:vel, mass:m, max_force:mF, max_velocity:maxV});
			flock.vehicles.push(currentModel);
			
			currentView = createVehicleView();
			currentView.container.scale = new THREE.Vector3(m, m, m);
			currentModel.updated.connect(currentView.presentationModelUpdated, currentView);

			scene.add(currentView.container);
		}

		// add seek target
		geometry = new THREE.SphereGeometry( 3 );
		material = new THREE.MeshBasicMaterial( { color: 0xff0000} );
		target = new THREE.Mesh( geometry, material );
		scene.add( target );

		// kick off moving target
		window.setInterval(moveTarget, 5000);
		moveTarget();

		//flock.update();
	}

	function moveTarget(){
		var pos = vec3.scale(randomVec3(), randomRange(0, 250));
		TweenLite.to(target.position, 5, {x:pos[0], y:pos[1], z:pos[2], ease:Back.easeInOut});
	}

	function update(){
		
		flock.target[0] = target.position.x;
		flock.target[1] = target.position.y;
		flock.target[2] = target.position.z;
		flock.update();
		
	}

	function render(){
		camera.lookAt(target.position);
		renderer.render( scene, camera );
	}

	function animate() {
		requestAnimationFrame( animate );
		update();
		render();
	}

	function resizeHandler(){
		renderer.setSize( window.innerWidth, window.innerHeight );
		camera.aspect	= window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}

	init();
	setup();
	animate();

}());