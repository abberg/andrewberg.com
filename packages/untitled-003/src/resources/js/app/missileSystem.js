var createMissileSystem = function(options){

	var system = new THREE.Object3D(),
		missiles = [],
		exploded = [],
		scene = [],
		fired = false,
		i,
		j,
		numMissles	= 20,
		columns		= 2,
		rows		= numMissles/columns,
		spacing		= 1.0,
		currentMissile,
		currentMissileView,
		fireBuffer,
		explodeBuffer;


    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    var context = !options.silent && AudioContextClass ? new AudioContextClass() : null;
    if (context) {
        context.decodeAudioData(preloader.get('fire'), function(buffer){ fireBuffer = buffer; }, function(){});
        context.decodeAudioData(preloader.get('explode'), function(buffer){ explodeBuffer = buffer; }, function(){});
    }
    system.resumeAudio = function(){
        if (context && context.state === 'suspended') context.resume().catch(function(){});
    };


	for(i = 0; i < columns; i++){
		for(j = 0; j < rows; j++){
			currentMissile = Object.create(createSimpleVehicle({maxspeed:5, maxforce:0.03}), {
				seek:{
					value: steeringBehaviors.seek
				},
				separate:{
					value: steeringBehaviors.separate
				},
				cohere:{
					value: steeringBehaviors.cohere
				},
				avoidObstacles:{
					value: steeringBehaviors.avoidObstacles
				},
				addNoise:{
					value: steeringBehaviors.addNoise
				},
				initPosition:{
					value: undefined,
					writable: true,
					enumerable: true
				},
				fired:{
					value: Object.create(signal, {slots:{value:[], writable:true, enumerable:true}}),
					enumerable: true
				},
				exploded:{
					value: Object.create(signal, {slots:{value:[], writable:true, enumerable:true}}),
					enumerable: true
				}
			});
			currentMissile.position.x = i*spacing;
			currentMissile.position.y = j*spacing;
			currentMissile.initPosition = currentMissile.position.clone();
			missiles.push(currentMissile);

			currentMissileView = createMissile();
			currentMissileView.position = currentMissile.position;
			currentMissile.fired.connect(currentMissileView.fire, currentMissileView);
			currentMissile.updated.connect(currentMissileView.update, currentMissileView);
			currentMissile.exploded.connect(currentMissileView.explode, currentMissileView);
			system.add(currentMissileView);

		}
	}

	function playSound(buffer) {
        if (!context || !buffer || context.state !== "running") return;
		var source = context.createBufferSource(); // creates a sound source
		source.buffer = buffer;                    // tell the source which sound to play
		source.connect(context.destination);       // connect the source to the context's destination (the speakers)
		source.start(0);                           // play the source now
		// note: on older systems, may have to use deprecated noteOn(time);
	}

	// populate collision scene...
	ground = new THREE.Plane();
	ground.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -43, 0));
	scene.push(ground);

	showSmoke = function(){
		var geometry,
			smokeTexture,
			material,
			particles,
			numParticles = 10,
			spread = 5,
			speed = 0.15;

		// launch smoke
		geometry = new THREE.Geometry();
		for ( i = 0; i < numParticles; i ++ ) {
			vertex = new THREE.Vector3(-3 + (Math.random()*spread - (spread*0.5)), Math.random()*spread - (spread*0.5), -3 + (Math.random()*spread - (spread*0.5)));
			vertex.velocity = new THREE.Vector3(Math.random()*speed, Math.random()*speed - (speed*0.5), 0.0);
			geometry.vertices.push( vertex );
		}

		//smokeTexture = THREE.ImageUtils.loadTexture('resources/textures/smoke.png');
		smokeTexture = new THREE.Texture(preloader.get('smoke'));
		smokeTexture.needsUpdate = true;

		material = new THREE.ParticleBasicMaterial({size:32, transparent:true, map:smokeTexture});
		// create particle system from geometry
		particles = new THREE.ParticleSystem( geometry, material );
		particles.sortParticles = true;
		particles.position = system.position.clone();
		//particles.scale.multiplyScalar(0.01);
		system.parent.add(particles);
		TweenLite.to(particles.material, 6.0, {
			opacity:0,
			ease:Power3.easeOut,
			onUpdate:function(particles){
				//particles.rotation.y += 0.03;
				for ( i = 0; i < numParticles; i ++ ) {
					var vertex = particles.geometry.vertices[i];
					vertex.add(vertex.velocity);
				}
				particles.geometry.needsUpdate = true;
			},
			onUpdateParams:[particles],
			onComplete:function(particles){
				particles.parent.remove(particles);
			},
			onCompleteParams:[particles]
		});
	};

	system.target = undefined;

	system.fire = function(){
		if(!fired){
			var i = missiles.length,
				currentMissile,
				_last;

			while(i--){
				currentMissile = missiles[i];
				currentMissile.fired.emit();
			}
			showSmoke();
			playSound(fireBuffer);
			fired = true;
		}
	};

	system.update = function(interpolate){
		if(fired){
			var i = missiles.length,
				currentMissile,
				seek,
				separate,
				avoidObstacles,
				noise,
				_last;

			while(i--){

				currentMissile = missiles[i];

				seek = currentMissile.seek(this.target);
				separate = currentMissile.separate(missiles);
				cohere = currentMissile.cohere(missiles);
				avoidObstacles = currentMissile.avoidObstacles(scene);
				noise = currentMissile.addNoise();

				seek.multiplyScalar(1.0);
				separate.multiplyScalar(1.3);
				cohere.multiplyScalar(0.28);
				avoidObstacles.multiplyScalar(1.0);
				noise.multiplyScalar(0.1);

				currentMissile.applyForce(seek);
				currentMissile.applyForce(separate);
				currentMissile.applyForce(cohere);
				currentMissile.applyForce(avoidObstacles);
				currentMissile.applyForce(noise);

				currentMissile.update(interpolate);

				if(currentMissile.position.distanceTo(this.target) < 50){
					currentMissile.exploded.emit();
					currentMissile.position = currentMissile.initPosition.clone();
					currentMissile.acceleration.multiplyScalar(0);
					currentMissile.velocity.multiplyScalar(0);
					currentMissile.update();
					exploded.push(missiles.splice(i, 1)[0]);
					this.explosion();
					playSound(explodeBuffer);
				}
			}

			if(missiles.length === 0){
				missiles = exploded.splice(0, exploded.length);
				fired = false;
				this.complete();
			}
		}
	};

	system.explosion = function(){};
	system.complete = function(){};

	return system;

};