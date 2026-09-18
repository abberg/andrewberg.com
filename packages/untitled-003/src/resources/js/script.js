(function(){

	var viewport = document.getElementsByClassName('viewport')[0],
		status = document.getElementsByClassName('status-text')[0],
		renderer,
		scene,
		camera,
		cameraTarget,
		controls,
		screenWidth,
		screenHeight,
		aspectRatio		= 0.425531,
		composer,
		fxaa,
		robot1,
		robot2,
		projector,
		rayCaster,
		pointer,
		clicked,
		intersecting,
		mousePosition,
		mouseVector,
		missileSystem,
		clock,
		lastTime,
		thumbnailMode = new URLSearchParams(location.search).has("thumbnail"),
        interactionPrompt = document.getElementById("interaction-prompt"),
		_last;

	if ( ! Detector.webgl ) {
		Detector.addGetWebGLMessage({parent:viewport});
		return;
	}else{
		preload();
	}

	function preload(){

		var manifest = [
			{src:'resources/textures/px.png', id:'px'},{src:'resources/textures/nx.png', id:'nx'},
            {src:'resources/textures/py.png', id:'py'},{src:'resources/textures/ny.png', id:'ny'},
            {src:'resources/textures/pz.png', id:'pz'},{src:'resources/textures/nz.png', id:'nz'},
            {src:'resources/textures/lensflare/lensflare0.png', id:'flare0'},
            {src:'resources/textures/lensflare/lensflare2.png', id:'flare1'},
            {src:'resources/textures/lensflare/hexangle.png', id:'flare2'},
            {src:'resources/textures/smoke.png', id:'smoke'},
            {src:'resources/heightmap/heightmap.dem', id:'heightmap'},
            {src:'resources/meshes/gear.js', id:'robot1'}, {src:'resources/meshes/gear_weapon.js', id:'robot1Weapon'},
            {src:'resources/meshes/ddbattlemover.js', id:'robot2'},
            {src:'resources/audio/missile_fire.mp3', id:'fire'},
            {src:'resources/audio/explosion.mp3', id:'explode'}
		];

		preloader.add(manifest);

		preloader.progressSignal.connect(circularProgressBar.setProgress);
		preloader.completeSignal.connect(circularProgressBar.transitionOut);

		circularProgressBar.completeSignal.connect(preloadCompleteHander);

		preloader.start();

	}

	function preloadCompleteHander(){

		init();
		setup();

	}

	function init(){

		screenWidth	= document.body.clientWidth;
		screenHeight = (screenWidth * aspectRatio);

		

		renderer = new THREE.WebGLRenderer({devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2)});
		renderer.setSize(screenWidth, screenHeight);
		renderer.shadowMapEnabled = true;
		renderer.shadowMapType = THREE.PCFShadowMap;

		renderer.domElement.classList.add('u-transparent');
		renderer.domElement.classList.add('u-transition--slow');

		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera(50, screenWidth / screenHeight, 1, 10000);
		cameraTarget = new THREE.Vector3();

		// LOOK AT whole scene
		//camera.position.set(0, 250, 250);
		//camera.lookAt(new THREE.Vector3(0, 100, 0));

		// look at missle pod
		//camera.position.set(35, 50, -350);
		//camera.lookAt(new THREE.Vector3(60, 50, -390));

		//controls = new THREE.OrbitControls(camera);

		/*
		// postprocessing
		composer = new THREE.EffectComposer( renderer );
		composer.addPass( new THREE.RenderPass( scene, camera ) );

		// fast aproximate anti-alising
		fxaa = new THREE.ShaderPass( THREE.FXAAShader );
		fxaa.uniforms[ 'resolution' ].value.set( 1 / screenWidth, 1 / screenHeight );
		composer.addPass( fxaa );
		fxaa.renderToScreen = true;
		*/
		renderer.domElement.addEventListener( 'click', mouseClickHandler, false );
		renderer.domElement.addEventListener( 'pointermove', mouseMoveHandler, false );
		mouse = {x:0, y:0};
		window.onresize = resizeHandler;
		window.onkeypress = keyHandler;

		projector = new THREE.Projector();
		raycaster = new THREE.Raycaster();

		mousePosition = new THREE.Vector2();
		mouseVector = new THREE.Vector3();
		clicked = false;
		pointer = false;

		clock = new THREE.Clock();
	}

	function updateStatus(message){
		status.replaceChild(document.createTextNode(message), status.childNodes[0]);
	}

	function statusChangedHandler(mutations) {
		mutations.forEach(function(mutation) {
			console.log(mutation.addedNodes[0].textContent);
			setTimeout(function(){
                // invoke callback
                setup();
           }, 100);
		});
	}
	new MutationObserver(statusChangedHandler).observe(status, {childList: true});

	var setup = (function(){

		var count = -1;

		return function(){

			var steps = [
				function(){
					updateStatus('Create Environment');
				},
				function(){
					createEnvironment(scene);
					setup();
				},
				function(){
					updateStatus('Setup Robot1');
				},
				function(){
					// Robot 1
					robot1 = createModel(['robot1', 'robot1Weapon']);
					robot1.position.set(-320, 32, -100);
					robot1.rotation.y = Math.PI*0.8;
					robot1.onLoopComplete = function(){
						if(Math.random() > 0.25){
							this.playRandomAnimation(['flip', 'wave', 'point']);
						}else{
							this.playAnimation('stand');
						}
					};
					robot1.onClick = function(){
						this.playAnimation('jump');
					};
					scene.add(robot1);
					robot1.createHitbox();
					setup();
				},
				function(){
					updateStatus('Setup Robot2');
				},
				function(){
					// Robot 2
					robot2 = createModel(['robot2'], {receiveShadow:false});
					robot2.position.set(60, 36, -390);
					robot2.rotation.y = -Math.PI*0.15;
					robot2.onLoopComplete = function(){
						this.playAnimation('stand');
					};
					robot2.onClick = function(){
						this.playAnimation('attack');
						missileSystem.fire();
					};
					scene.add(robot2);
					robot2.createHitbox();
					setup();
				},
				function(){
					updateStatus('Create Missile System');
				},
				function(){
					// missile missileSystem
					missileSystem = createMissileSystem({silent:thumbnailMode});
					missileSystem.position = robot2.position.clone();
					missileSystem.rotation = robot2.rotation.clone();
					//missileSystem.position.x += -50;

					missileSystem.position.x += -3.5;
					missileSystem.position.y += 19.5;
					missileSystem.position.z += -6;

					missileSystem.updateMatrixWorld(true);
					scene.add(missileSystem);

					// missile target
					missileSystem.target = missileSystem.worldToLocal(robot1.position.clone());
					missileSystem.explosion = function(){
						robot1.playAnimation('painone');
					};
					missileSystem.complete = function(){
						robot1.playAnimation('deaththree');
					};
					setup();
				},
				function(){
					updateStatus('Setup Complete');
				},
				setupComplete
			];

			steps[count+=1].apply();
		};

	}());

	function setupComplete(){

		viewport.replaceChild(renderer.domElement, status);

		update(0);
		render();

		setTimeout(transitionIn, 10);

	}

	function transitionIn(){
		var canvas = renderer.domElement;

		canvas.classList.remove('u-transparent');

		camera.position.set(55, 70, -440);
		TweenLite.to(camera.position, 7, {x:17, y:13, z:-453, ease:Quad.easeOut, delay:0.6});

		cameraTarget.set(0, 50, -330);
		TweenLite.to(cameraTarget, 8, {x:0, y:200, z:0, ease:Quad.easeIn, delay:0.6});

		robot1.playAnimation('stand');
		robot2.playAnimation('stand');

        if (thumbnailMode) {
            TweenLite.killTweensOf(camera.position);
            TweenLite.killTweensOf(cameraTarget);
            camera.position.set(17, 13, -453);
            cameraTarget.set(0, 200, 0);
            document.getElementById('footer').hidden = true;
            canvas.classList.remove('u-transition--slow');
            update(0);
            render();
            document.documentElement.dataset.thumbnailReady = 'true';
            return;
        }
        interactionPrompt.textContent = navigator.maxTouchPoints ? 'Tap either robot' : 'Click either robot';
        interactionPrompt.hidden = false;
        vignetteSoundtrack.init();

		animate();

	}

	function update(delta){

		var frameRate = 1000/60,
			lag = delta;

		while(lag >= frameRate){
			missileSystem.update(1);
			lag -= frameRate;
		}
		missileSystem.update(lag/frameRate);

		robot1.update();
		robot2.update();

		updateMouse();

		camera.lookAt(cameraTarget);
		//controls.update();

	}

	function render(){
		//composer.render();
		renderer.render(scene, camera);
	}


	function animate(t){

		var delta = Math.min(t - lastTime, 100);
		if(!delta){
			delta = 0;
		}

		update(delta);
		render();

		lastTime = t;

		window.requestAnimationFrame(animate, renderer.domElement);

	}

	function updateMouse(){

		var intersects;

		// mouse interaction in 3D scene with raycast
		mouseVector.set(mousePosition.x, mousePosition.y, 1);
		projector.unprojectVector( mouseVector, camera );
		raycaster.set( camera.position, mouseVector.sub( camera.position ).normalize() );
		intersects = raycaster.intersectObjects( scene.children );
		
		// show mouseovers
		var hit = intersects.length ? intersects[0].object : null;
        if(hit !== intersecting){
			intersecting = hit;
			if(intersecting && intersecting.userData.type  === 'hitbox'){
				if(!pointer){
					renderer.domElement.style.cursor = 'pointer';
					pointer = true;
				}
			}else{
				if(pointer){
					renderer.domElement.style.cursor = 'default';
					pointer = false;
				}
			}
		}
		// respond to clicks
		if(clicked){
			if(intersecting && intersecting.userData.type === 'hitbox'){
				intersecting.onClick();
			}
			clicked = false;
		}

	}

	function mouseClickHandler(e){

		e.preventDefault();
        mouseMoveHandler(e);
        missileSystem.resumeAudio();
        vignetteSoundtrack.start();
        interactionPrompt.hidden = true;
        clicked = true;

	}

	function mouseMoveHandler(e){

		var mouseX,
			mouseY;

		e.preventDefault();

		var bounds = renderer.domElement.getBoundingClientRect();
        mouseX = ((e.clientX - bounds.left) / bounds.width) * 2 - 1;
        mouseY = -((e.clientY - bounds.top) / bounds.height) * 2 + 1;
		mousePosition.set(mouseX, mouseY, 0);

	}

	function resizeHandler(){
		
		screenWidth	= document.body.clientWidth;
		screenHeight = (screenWidth * aspectRatio);

		camera.aspect = screenWidth / screenHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( screenWidth, screenHeight );
		//composer.setSize( screenWidth, screenHeight );

		//fxaa.uniforms['resolution'].value.set( 1 / screenWidth, 1 / screenHeight );
	
	}

	function keyHandler(e){
		switch(e.keyCode){
			case 32:
			// spacebar			
				break;
			default:
				console.log(e.keyCode);
				break;
		}
	}

}());
