(function(){
  var thumbnailMode = new URLSearchParams(location.search).has('thumbnail');
  var loadedModels = 0;
  var captureFrames = 0;
  var audioStarted = false;
  var dragPrompt = document.getElementById('drag-prompt');

	if ( ! Detector.webgl ) {
		Detector.addGetWebGLMessage();
		return;
	}

	var container,
		camera,
		scene,
		clock,
		renderer,
		composer,
        footer,
        closedMargin,

		spline,
		splinePoint,

		v3,
		lookOffset,

		mouseCurrentPosition,
		mousePreviousPosition,
		mouseAcceleration,
		mouseVelocity,
		dragging,
		v2,

		character,
		animationKeys,

		particles,
		particleCount,

		soundtrack,

		RATIO = 0.425531,
		SCREEN_WIDTH = window.innerWidth,
		SCREEN_HEIGHT = window.innerWidth * RATIO;

	init();
	setup();
	animate();

	function init() {

		var effect,
			from,
			to;

		renderer = new THREE.WebGLRenderer();
		renderer.setSize( SCREEN_WIDTH, SCREEN_HEIGHT );
		renderer.shadowMapEnabled = true;
		renderer.shadowMapSoft = true;
		renderer.domElement.className = "grab";
		document.body.appendChild( renderer.domElement );

		//
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera( 65, SCREEN_WIDTH / SCREEN_HEIGHT, 1, 12000 );

		projector = new THREE.Projector();
		pickVector = new THREE.Vector3();

		// postprocessing
		composer = new THREE.EffectComposer( renderer );
		composer.addPass( new THREE.RenderPass( scene, camera ) );

		effect = new THREE.ShaderPass( THREE.FXAAShader );
		effect.uniforms.resolution.value.set( 1 / SCREEN_WIDTH, 1 / SCREEN_HEIGHT );
		effect.renderToScreen = true;
		composer.addPass( effect );

		window.addEventListener( 'resize', onWindowResize, false );

		renderer.domElement.addEventListener('pointerdown', mouseDownHandler, false);
		renderer.domElement.addEventListener('pointerup', mouseUpHandler, false);
		renderer.domElement.addEventListener('pointermove', mouseMoveHandler, false);
		renderer.domElement.addEventListener('pointercancel', mouseUpHandler, false);
		dragging = false;

		// footer
		footer = document.getElementsByTagName('footer')[0];
		closedMargin = -(footer.getBoundingClientRect().height - 50);
		footer.style.marginBottom = closedMargin+'px';
		from = {marginBottom:0};
		to = {marginBottom:0};
		footer.addEventListener('click', function(){
			if(footer.style.marginBottom !== '0px'){
				//open
				from.marginBottom	= closedMargin;
				to.marginBottom		= 0;
			}else{
				//close
				from.marginBottom	= 0;
				to.marginBottom		= closedMargin;
			}

			new TWEEN.Tween( from ).to( to, 300 ).easing( TWEEN.Easing.Quadratic.EaseIn )
				.onUpdate( function () {
					footer.style.marginBottom = this.marginBottom + 'px';
				} )
				.start();

		});

	}

	function setup(){
		var light,
			reflectedLight,
			ambientLight,
			geometry,
			material,
			plane,
			path,
			format,
			urls,
			shader,
			textureCube,
			loader;

		light = new THREE.DirectionalLight( 0xffffff );
		light.position = new THREE.Vector3(0.0, 1400.0, 0.0);
		light.castShadow			= true;
		light.shadowDarkness		= 0.5;
		light.shadowMapWidth		= 2048;
		light.shadowMapHeight		= 2048;
		light.shadowCameraRight		=  1200;
		light.shadowCameraLeft		= -150;
		light.shadowCameraTop		=  700;
		light.shadowCameraBottom	= -600;
		scene.add( light );

		reflectedLight = new THREE.DirectionalLight( 0x999999 );
		reflectedLight.position = new THREE.Vector3(0.0, -1.0, 0.0);
		scene.add( reflectedLight );

		ambientLight = new THREE.AmbientLight(0x0a0a0a);
		scene.add(ambientLight);

		// ground
		geometry = new THREE.PlaneGeometry( 10000, 10000, 10, 10);
		material = new THREE.MeshLambertMaterial( { color:0xdddddd} );
		plane = new THREE.Mesh( geometry, material );
		plane.name = 'ground';
		plane.receiveShadow = true;
		plane.rotation.x = -Math.PI/2;
		scene.add( plane );

		// skybox
		path = "resources/textures/";
		format = '.png';
		urls = [
			path + 'posx' + format, path + 'negx' + format,
			path + 'posy' + format, path + 'negy' + format,
			path + 'posz' + format, path + 'negz' + format
		];

		textureCube = THREE.ImageUtils.loadTextureCube( urls );
		textureCube.format = THREE.RGBFormat;

		shader = THREE.ShaderUtils.lib.cube;
		shader.uniforms.tCube.value = textureCube;

		material = new THREE.ShaderMaterial( {

			fragmentShader: shader.fragmentShader,
			vertexShader: shader.vertexShader,
			uniforms: shader.uniforms,
			depthWrite: false,
			side: THREE.BackSide

		} ),

		mesh = new THREE.Mesh( new THREE.CubeGeometry( 10000, 10000, 10000, 1, 1, 1, null, true ), material );
		mesh.name = 'sky';
		scene.add( mesh );

		// mecha
		loader = new THREE.JSONLoader();
		loader.load( "resources/models/Auberon_2.js", function ( geometry ) {

			material = new THREE.MeshLambertMaterial({color:0x111111, shading:THREE.FlatShading});
			gundamMesh = new THREE.Mesh( geometry, material );
			gundamMesh.name = 'gundam';
			gundamMesh.position.set(0, 680, -750);
			gundamMesh.rotation.set(0.0, -0.4, 3.32);
			var scale = 80.0;
			gundamMesh.scale.set(scale, scale, scale);
			scene.add(gundamMesh);
			gundamMesh.castShadow = true;
			gundamMesh.receiveShadow  = true;
            loadedModels++;

		} );

		// priss
		loader = new THREE.JSONLoader();
		loader.load( "resources/models/priss.js", function( geometry ) {

			
			geometry.computeMorphNormals();
			
			var texture = THREE.ImageUtils.loadTexture('resources/textures/priss.png', new THREE.UVMapping());
			texture.flipY = false;
			
			material = new THREE.MeshPhongMaterial({color:0xffffff, emissive:0x2a2a2a, specular:0x999999, shininess:200, morphTargets: true, morphNormals: true, map:texture});
			
			character = new THREE.MorphAnimMesh( geometry, material);
			character.name = 'priss';
			character.rotation.y = -0.5;
			character.position.set(0, 23.8, 0);

			character.parseAnimations();
			character.baseDuration = character.duration;

			animationKeys = Object.keys(character.geometry.animations).splice(1);
			character.playAnimation( geometry.firstAnimation, 6 );
			character.castShadow = true;

			scene.add( character );
            loadedModels++;

			overCharacter = false;
			
		} );

		spline = new THREE.Spline();
		spline.initFromArray([[-30, 40, -5], [0, 5, 100], [180, 130, 250]]);
		//spline.reparametrizeByArcLength(50);
		splinePoint = 0.35;

		clock = new THREE.Clock();

		mouseCurrentPosition = new THREE.Vector2(0.0, 0.0);
		mousePreviousPosition = new THREE.Vector2(0.0, 0.0);
		mouseAcceleration = new THREE.Vector2(0.0, 0.0);
		mouseVelocity = new THREE.Vector2(0.0, 0.0);
		v2 = new THREE.Vector2(0.0, 0.0);
		
		v3 = new THREE.Vector3(0.0, 0.0, 0.0);
		lookOffset = new THREE.Vector3(0.0, 10.0, 0.0);

		// smoke

		var Pool = (function(){

			var p = [];

			return {
				// Get a new index
				get: function() {
					if ( p.length > 0 ) {
						return p.pop();
					}
					return null;
				},

				// Release an index back into the pool
				add: function( v ) {
					p.push( v );
				}
			};
		}());

		// particle system
		particleCount = 4000;
		geometry = new THREE.Geometry();

		for ( i = 0; i < particleCount; i ++ ) {

			var vertex = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

			geometry.vertices.push( vertex );
			Pool.add( i );

		}
		material = new THREE.ParticleBasicMaterial({color:0xf5f5f5, sizeAttenuation:false});
		particles = new THREE.ParticleSystem( geometry, material );
		particles.sortParticles = true;
		scene.add( particles );

		// spark particles
		var setTargetParticle = function() {
			return Pool.get();
		};

		var onParticleCreated = function(particle) {
			var target = particle.target;
			if(target !== null){
				particles.geometry.vertices[ target ] = particle.position;
			}
		};

		var onParticleDead = function(particle) {

			var target = particle.target;

			if(target !== null){
				// Hide the particle
				particles.geometry.vertices[ target ].set( Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY );
				// Mark particle index as available by returning to pool
				Pool.add( target );
			}
		};

		sparksEmitter = new SPARKS.Emitter(new SPARKS.SteadyCounter(200));

		sparksEmitter.addInitializer(new SPARKS.Target( null, setTargetParticle ));
		sparksEmitter.addInitializer(new SPARKS.Position( new SPARKS.ParallelogramZone( new THREE.Vector3(-200,0,300), new THREE.Vector3(300,0,0), new THREE.Vector3(-1000,0,-700) ) ) );
		sparksEmitter.addInitializer(new SPARKS.Lifetime(15,18));
		sparksEmitter.addInitializer(new SPARKS.Velocity(new SPARKS.PointZone(new THREE.Vector3(40,2,-25))));

		sparksEmitter.addAction(new SPARKS.Age());
		sparksEmitter.addAction(new SPARKS.Move());
		sparksEmitter.addAction(new SPARKS.RandomDrift(0,10,0));

		sparksEmitter.addCallback("created", onParticleCreated);
		sparksEmitter.addCallback("dead", onParticleDead);

		sparksEmitter.start();
		
		if (!thumbnailMode) {
        var wind = new buzz.sound( "resources/sounds/wind", {
			formats: [ "ogg", "mp3"],
			loop: true
		});

		soundtrack = new buzz.sound( "resources/sounds/new_world", {
			formats: [ "ogg", "mp3"],
			loop: true
		});

        }
        if (thumbnailMode) {
            dragPrompt.hidden = true;
            document.querySelector('footer').hidden = true;
        }
		
		camera.position.set(180, 130, 250);
	}

	function update(){
		var delta = thumbnailMode ? 1 / 60 : clock.getDelta(),
			animationDelta = delta*1000,
			flip = Math.random(),
			targetVolume;
		
		if (character) {
			if(character.time + animationDelta > character.duration){
				if(flip > 0.5){
					currentAnimation = animationKeys[ Math.floor(Math.random()*animationKeys.length) ];
				}else{
					currentAnimation = character.geometry.firstAnimation;
				}
				character.playAnimation(currentAnimation, 6);
			}

			character.updateAnimation( animationDelta );
		}

		if(Math.abs(mouseVelocity.length()) > 0.001){
			mouseVelocity.multiplyScalar(0.9);
		}else{
			mouseVelocity.set(0.0, 0.0);
		}

		splinePoint -= mouseVelocity.x * 0.0002;
		if(splinePoint > 1){
			splinePoint = 1;
		}else if(splinePoint < 0){
			splinePoint = 0;
		}

		camera.position = spline.getPoint(splinePoint);

		if(character){
			camera.lookAt(v3.add(character.position, lookOffset));
		}else{
			camera.lookAt(v3);
		}

		targetVolume = 40 - splinePoint * 40;
		
		if(soundtrack && soundtrack.getVolume() !== targetVolume){
			soundtrack.setVolume(targetVolume);
		}

	}

	function render(){
		//composer.render();
		TWEEN.update();
		renderer.render(scene, camera);
	}

	function animate() {

		requestAnimationFrame( animate );

        if (!thumbnailMode || captureFrames < 90) update();
        render();
        if (loadedModels === 2 && character.material.map.image.complete) {
            captureFrames++;
            if (thumbnailMode && captureFrames === 90) sparksEmitter.stop();
            if (!thumbnailMode || captureFrames >= 90) document.documentElement.dataset.thumbnailReady = 'true';
        }

	}

	function onWindowResize() {
        if (!thumbnailMode) {
            closedMargin = -(footer.getBoundingClientRect().height - 50);
            footer.style.marginBottom = closedMargin + 'px';
        }

		SCREEN_WIDTH = window.innerWidth;
		SCREEN_HEIGHT = window.innerWidth * RATIO;

		renderer.setSize( SCREEN_WIDTH, SCREEN_HEIGHT );

		camera.aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
		camera.updateProjectionMatrix();

	}

    function startAudio() {
        if (thumbnailMode || audioStarted) return;
        audioStarted = true;
        // Invoke play directly in the user gesture, including touch release.
        Promise.all(buzz.sounds.map(function(sound) { return sound.sound.play(); }))
            .catch(function() { audioStarted = false; dragPrompt.hidden = false; });
    }

	function mouseDownHandler(e){
        dragPrompt.hidden = true;
        if (e.pointerType !== 'touch') startAudio();
		e.preventDefault();
        renderer.domElement.setPointerCapture(e.pointerId);
        mouseCurrentPosition.set(e.screenX, e.screenY);
        mousePreviousPosition.copy(mouseCurrentPosition);
        dragging = true;
		renderer.domElement.className = "grabbing";
	}

	function mouseMoveHandler(e){
		e.preventDefault();
		mouseCurrentPosition.set(e.screenX, e.screenY);
		if(dragging){
			mouseAcceleration = v2.sub(mouseCurrentPosition, mousePreviousPosition);
			mouseVelocity.addSelf(mouseAcceleration);
		}
		mousePreviousPosition.set(mouseCurrentPosition.x, mouseCurrentPosition.y);
	}

	function mouseUpHandler(e){
        if (e.type !== 'pointercancel') startAudio();
		e.preventDefault();
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        dragging = false;
        renderer.domElement.className = "grab";
	}

}());
