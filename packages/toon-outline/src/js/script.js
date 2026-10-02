(function(){
	
	if ( ! Detector.webgl ) {
		Detector.addGetWebGLMessage();
		return;
	}

	var container,
		camera,
		scene,
		renderer,
		mesh,
		animationKeys,
		currentAnimation,
		clock,
		mouseDown = [0, 0, 0, 0, 0, 0, 0, 0, 0],
		mouseDownCount = 0,
		previousMouseX,
		cameraTarget,
		center,
		angle = 1.57079633,
		targetAngle = angle,
		radius = 100,
		targetRadius = radius,
		
		MIN_RADIUS = 50,
		MAX_RADIUS = 300,

		vertText,
		fragText,

		assets = 0,
		TOTAL_ASSETS = 4;

	function init(){

		clock = new THREE.Clock();

		container = document.createElement('div');
		// prevent i-beam cursor on drag
		container.onselectstart = function () { return false; };

		document.getElementById('main').appendChild( container );

		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 1, 1000 );
		scene.add( camera );

		renderer = new THREE.WebGLRenderer();
		renderer.setSize( window.innerWidth, window.innerHeight );
		renderer.shadowMapEnabled = true;
		renderer.context.getExtension('OES_standard_derivatives');

		scene.fog = new THREE.Fog( 0x333333, 250, 400 );
		renderer.setClearColor( scene.fog.color, 1 );

		container.appendChild( renderer.domElement );

		window.addEventListener('resize', resizeHandler, false);
		
		container.addEventListener('pointerdown', mousedownHandler, false);
		container.addEventListener('pointerup', mouseupHandler, false);
		container.addEventListener('pointercancel', mouseupHandler, false);
		container.addEventListener('pointermove', mousemoveHandler, false);
		container.addEventListener('wheel', mousewheelHandler, { passive: false });

		shaderLoader.load('shaders/sandbox_vert.glsl', function(txt){
																vertText = txt;
																assetLoaded();
															});
		shaderLoader.load('shaders/sandbox_frag.glsl', function(txt){
																fragText = txt;
																assetLoaded();
															});
		shaderLoader.load('shaders/outline_vert.glsl', function(txt){
																outlineVertText = txt;
																assetLoaded();
															});
		shaderLoader.load('shaders/outline_frag.glsl', function(txt){
																outlineFragText = txt;
																assetLoaded();
															});
	}

	function assetLoaded(){
		assets++;
		if(assets === TOTAL_ASSETS){
			setup();
		}
	}

	function setup(){
		
		var light,
			geometry,
			material,
			loader,
			plane;

		//light
		light = new THREE.SpotLight( 0xffffff );
		light.target.position.set( 0, -24.0, 0 );
		light.position.set( 20, 100, 50);
		light.castShadow = true;
		light.shadowCameraFar = 180;
		light.shadowDarkness = 0.4;
		light.shadowMapWidth = 1024;
		light.shadowMapHeight = 1024;


		scene.add( light );

		// ground plane
		geometry = new THREE.PlaneGeometry( 800, 800, 10, 10);
		material = new THREE.MeshBasicMaterial( { color: 0x444444 });
		plane = new THREE.Mesh( geometry, material );
		plane.position.y = -24;
		plane.receiveShadow = true;
		scene.add( plane );

		// Model
		loader = new THREE.JSONLoader();

		//material = new THREE.MeshLambertMaterial({morphTargets: true, morphNormals: true});

		material =  new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge( [
				THREE.UniformsLib[ "common" ],
				THREE.UniformsLib[ "fog" ],
				THREE.UniformsLib[ "lights" ],
				THREE.UniformsLib[ "shadowmap" ]
			]),
			vertexShader:   vertText,
			fragmentShader: fragText,
			morphTargets: true,
			morphNormals: true,
			lights:true,
			fog:true
		});

		
		loader.load( "js/eva_unit01.js", function( geometry ) {

			geometry.computeMorphNormals();

			mesh = new THREE.MorphAnimMesh( geometry, material );
			
			mesh.rotation.y = Math.PI*0.55;
			
			mesh.castShadow = true;
			mesh.receiveShadow = true;

			mesh.parseAnimations();
			mesh.baseDuration = mesh.duration;

			animationKeys = Object.keys(mesh.geometry.animations).splice(1);
			mesh.playAnimation( geometry.firstAnimation, 6 );

			scene.add( mesh );

			if ( window.thumbnailStart ) window.thumbnailStart();

		} );

		center = new THREE.Vector3(0,0,0);

		// position camera
		camera.position.z = radius;
		camera.position.y = 25;

		// camera target
		cameraTarget = camera.position.clone();

		var renderModel = new THREE.RenderPass( scene, camera );
		effectFXAA = new THREE.ShaderPass( THREE.ShaderExtras[ "fxaa" ] );
		effectOutline = new THREE.ShaderPass({uniforms: {
													tDiffuse:{ type: "t", value: 0, texture: null },
													uScreenWidth: { type: "f", value: window.innerWidth},
													uScreenHeight: { type: "f", value: window.innerHeight}
												},
												vertexShader:outlineVertText,
												fragmentShader:outlineFragText} );

		effectFXAA.uniforms[ 'resolution' ].value.set( 1 / window.innerWidth, 1 / window.innerHeight );

		effectFXAA.renderToScreen = true;

		composer = new THREE.EffectComposer( renderer );

		composer.addPass( renderModel );
		composer.addPass( effectOutline );
		composer.addPass( effectFXAA );

		animate();
	}

	function update(){

		var delta = clock.getDelta()*1000,
			flip = Math.random(),
			diff;
		
		if (mesh) {

			if(mesh.time + delta > mesh.duration){
				if(flip > 0.6){
					currentAnimation = animationKeys[ Math.floor(Math.random()*animationKeys.length) ];
				}else{
					currentAnimation = mesh.geometry.firstAnimation;
				}
				mesh.playAnimation(currentAnimation, 6);
			}

			mesh.updateAnimation( delta );
		}

		orbitCamera();
	}

	function render(){
		renderer.clear();
		composer.render();
		//renderer.render( scene, camera );
	}

	function animate() {
		requestAnimationFrame( animate );
		update();
		render();
	}

	function orbitCamera(){

		var diff = (targetRadius - radius) * 0.1;

		radius += diff;
		camera.translateZ(diff);


		angle += (targetAngle - angle) * 0.09;
		
		camera.position.x = Math.cos(angle)*radius;
		camera.position.z = Math.sin(angle)*radius;
		camera.lookAt(center);

	}

	function resizeHandler(e){
		renderer.setSize( window.innerWidth, window.innerHeight );
		camera.aspect	= window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		effectFXAA.uniforms[ 'resolution' ].value.set( 1 / window.innerWidth, 1 / window.innerHeight );
		effectOutline.uniforms['uScreenWidth'].value = window.innerWidth;
		effectOutline.uniforms['uScreenHeight'].value = window.innerHeight;
	}

	function mousedownHandler(e){
		container.setPointerCapture(e.pointerId);
		++mouseDown[e.button];
		++mouseDownCount;
		previousMouseX = e.screenX;
	}

	function mouseupHandler(e){
		var button = e.type === "pointercancel" ? 0 : e.button;
		if(!mouseDown[button]) return;
		--mouseDown[button];
		--mouseDownCount;
	}

	function mousemoveHandler(e){
		if(mouseDownCount){
			for(var i = 0; i < mouseDown.length; ++i){
				if(i=== 0 && mouseDown[i]){
					var delta = e.screenX - previousMouseX;
					targetAngle += delta*0.01;
					previousMouseX = e.screenX;
				}
			}
		}
	}

	function mousewheelHandler(e){
		e.preventDefault();
		var delta = e.deltaY * 0.06;
		targetRadius += delta;
		if(targetRadius < MIN_RADIUS){
			targetRadius = MIN_RADIUS;
		}else if(targetRadius > MAX_RADIUS){
			targetRadius = MAX_RADIUS;
		}
	}

	init();

}());