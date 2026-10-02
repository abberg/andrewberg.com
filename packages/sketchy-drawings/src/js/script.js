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

		shaders = {},
		SHADER_FILES = [ 'sandbox_vert', 'surface_frag', 'normal_depth_vert', 'normal_depth_frag', 'quad_vert', 'edge_frag', 'sketch_frag' ],
		assets = 0,

		PAPER = 0xfbfaf7,
		INK = 0x111111,

		plane,
		groundNormalDepth,
		materials = {},
		targets = {},
		noiseTexture,
		quad,
		quadScene,
		quadCamera,
		boilTime = 0,

		settings = {
			dotSpacing: 5.5,
			dotSize: 0.17,
			highlight: 0.11,
			hatchThreshold: 0,
			hatchSpacing: 6.5,
			wobble: 5.1,
			noiseScale: 7,
			boil: 12,
			strokes: 2,
			lineWidth: 1,
			normalThreshold: 1.4,
			depthThreshold: 0.53,
			view: 0
		};

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

		scene.fog = new THREE.Fog( PAPER, 250, 400 );
		renderer.setClearColor( scene.fog.color, 1 );

		container.appendChild( renderer.domElement );

		window.addEventListener('resize', resizeHandler, false);
		
		container.addEventListener('pointerdown', mousedownHandler, false);
		container.addEventListener('pointerup', mouseupHandler, false);
		container.addEventListener('pointercancel', mouseupHandler, false);
		container.addEventListener('pointermove', mousemoveHandler, false);
		container.addEventListener('wheel', mousewheelHandler, { passive: false });

		SHADER_FILES.forEach(function(name){
			shaderLoader.load('shaders/' + name + '.glsl', function(txt){
				shaders[name] = txt;
				assetLoaded();
			});
		});
	}

	function assetLoaded(){
		assets++;
		if(assets === SHADER_FILES.length){
			setup();
		}
	}

	// TNoise: tileable smooth value noise, a different field in each channel
	function createNoiseTexture(size, cells){
		var data = new Uint8Array(size * size * 4),
			lattice = [],
			channel, x, y, i, gx, gy, fx, fy, x0, y0, x1, y1, a, b, c, d;

		function smooth(t){ return t * t * (3 - 2 * t); }

		for(channel = 0; channel < 4; channel++){
			lattice.length = 0;
			for(i = 0; i < cells * cells; i++){
				lattice.push(Math.random());
			}
			for(y = 0; y < size; y++){
				for(x = 0; x < size; x++){
					gx = x / size * cells;
					gy = y / size * cells;
					x0 = Math.floor(gx);
					y0 = Math.floor(gy);
					x1 = (x0 + 1) % cells;
					y1 = (y0 + 1) % cells;
					fx = smooth(gx - x0);
					fy = smooth(gy - y0);
					a = lattice[y0 * cells + x0];
					b = lattice[y0 * cells + x1];
					c = lattice[y1 * cells + x0];
					d = lattice[y1 * cells + x1];
					data[(y * size + x) * 4 + channel] = 255 * ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy);
				}
			}
		}

		var texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		texture.magFilter = texture.minFilter = THREE.LinearFilter;
		texture.generateMipmaps = false;
		texture.needsUpdate = true;
		return texture;
	}

	function createTargets(){
		var width = window.innerWidth,
			height = window.innerHeight,
			options = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false };

		targets.surface = new THREE.WebGLRenderTarget(width, height, options);
		targets.normalDepth = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, stencilBuffer: false });
		targets.edge = new THREE.WebGLRenderTarget(width, height, options);

		if(materials.edge){
			materials.edge.uniforms.tNormalDepth.texture = targets.normalDepth;
			materials.sketch.uniforms.tSurface.texture = targets.surface;
			materials.sketch.uniforms.tEdge.texture = targets.edge;
			materials.sketch.uniforms.tNormalDepth.texture = targets.normalDepth;
			updateSizeUniforms();
		}
	}

	function updateSizeUniforms(){
		materials.edge.uniforms.uTexel.value.set(settings.lineWidth / window.innerWidth, settings.lineWidth / window.innerHeight);
		materials.sketch.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
	}

	function createMaterials(){

		materials.surface = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge( [
				THREE.UniformsLib[ "common" ],
				THREE.UniformsLib[ "fog" ],
				THREE.UniformsLib[ "lights" ],
				THREE.UniformsLib[ "shadowmap" ]
			]),
			vertexShader: shaders.sandbox_vert,
			fragmentShader: shaders.surface_frag,
			morphTargets: true,
			morphNormals: true,
			lights: true,
			fog: true
		});

		// paper-coloured ground that still takes the model's shadow
		materials.groundSurface = new THREE.MeshBasicMaterial({ color: 0xffffff });

		materials.normalDepth = new THREE.ShaderMaterial({
			uniforms: { uFar: { type: "f", value: 400 }, uBackground: { type: "f", value: 0 } },
			vertexShader: shaders.normal_depth_vert,
			fragmentShader: shaders.normal_depth_frag,
			// depth is stored in alpha, so it must not blend; r49 only applies a
			// material's blending in its transparent pass
			transparent: true,
			blending: THREE.NoBlending,
			morphTargets: true,
			morphNormals: true
		});

		materials.groundNormalDepth = new THREE.ShaderMaterial({
			uniforms: { uFar: { type: "f", value: 400 }, uBackground: { type: "f", value: 1 } },
			vertexShader: shaders.normal_depth_vert,
			fragmentShader: shaders.normal_depth_frag,
			transparent: true,
			blending: THREE.NoBlending
		});

		materials.edge = new THREE.ShaderMaterial({
			uniforms: {
				tNormalDepth: { type: "t", value: 0, texture: targets.normalDepth },
				uTexel: { type: "v2", value: new THREE.Vector2() },
				uNormalThreshold: { type: "f", value: settings.normalThreshold },
				uDepthThreshold: { type: "f", value: settings.depthThreshold }
			},
			vertexShader: shaders.quad_vert,
			fragmentShader: shaders.edge_frag,
			depthTest: false,
			depthWrite: false
		});

		materials.sketch = new THREE.ShaderMaterial({
			uniforms: {
				tSurface: { type: "t", value: 0, texture: targets.surface },
				tEdge: { type: "t", value: 1, texture: targets.edge },
				tNoise: { type: "t", value: 2, texture: noiseTexture },
				uResolution: { type: "v2", value: new THREE.Vector2() },
				uWobble: { type: "f", value: settings.wobble },
				uNoiseScale: { type: "f", value: settings.noiseScale },
				uNoiseShift: { type: "v2", value: new THREE.Vector2() },
				uStrokes: { type: "f", value: settings.strokes },
				uInk: { type: "c", value: new THREE.Color( INK ) },
				uPaper: { type: "c", value: new THREE.Color( PAPER ) },
				uDotSpacing: { type: "f", value: settings.dotSpacing },
				uDotSize: { type: "f", value: settings.dotSize },
				uHighlight: { type: "f", value: settings.highlight },
				uHatchThreshold: { type: "f", value: settings.hatchThreshold },
				uHatchSpacing: { type: "f", value: settings.hatchSpacing },
				tNormalDepth: { type: "t", value: 3, texture: targets.normalDepth },
				uView: { type: "f", value: 0 }
			},
			vertexShader: shaders.quad_vert,
			fragmentShader: shaders.sketch_frag,
			depthTest: false,
			depthWrite: false
		});

		updateSizeUniforms();
	}

	function createGui(){
		var gui = new dat.GUI();
		gui.add(settings, 'dotSpacing', 2, 12).step(0.5).onChange(function(v){ materials.sketch.uniforms.uDotSpacing.value = v; });
		gui.add(settings, 'dotSize', 0.1, 0.5).step(0.01).onChange(function(v){ materials.sketch.uniforms.uDotSize.value = v; });
		gui.add(settings, 'highlight', 0, 1).step(0.01).onChange(function(v){ materials.sketch.uniforms.uHighlight.value = v; });
		gui.add(settings, 'hatchThreshold', 0, 1).step(0.01).onChange(function(v){ materials.sketch.uniforms.uHatchThreshold.value = v; });
		gui.add(settings, 'hatchSpacing', 2, 12).step(0.5).onChange(function(v){ materials.sketch.uniforms.uHatchSpacing.value = v; });
		gui.add(settings, 'wobble', 0, 12).step(0.1).onChange(function(v){ materials.sketch.uniforms.uWobble.value = v; });
		gui.add(settings, 'noiseScale', 0.5, 12).step(0.1).onChange(function(v){ materials.sketch.uniforms.uNoiseScale.value = v; });
		gui.add(settings, 'boil', 0, 24).step(1);
		gui.add(settings, 'strokes', 1, 3).step(1).onChange(function(v){ materials.sketch.uniforms.uStrokes.value = v; });
		gui.add(settings, 'lineWidth', 0.5, 3).step(0.1).onChange(updateSizeUniforms);
		gui.add(settings, 'normalThreshold', 0.1, 3).step(0.05).onChange(function(v){ materials.edge.uniforms.uNormalThreshold.value = v; });
		gui.add(settings, 'view', { drawing: 0, surface: 1, edges: 2, normals: 3, depth: 4 }).onChange(function(v){ materials.sketch.uniforms.uView.value = Number(v); });
		gui.add(settings, 'depthThreshold', 0.02, 1).step(0.01).onChange(function(v){ materials.edge.uniforms.uDepthThreshold.value = v; });
	}

	function setup(){
		
		var light,
			geometry,
			loader;

		noiseTexture = createNoiseTexture(256, 8);
		createTargets();
		createMaterials();
		createGui();

		// full-screen quad for the edge and sketch passes
		quadScene = new THREE.Scene();
		quadCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, -1, 1 );
		quadScene.add( quadCamera );
		quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), materials.edge );
		quad.frustumCulled = false;
		// the quad shader ignores the mesh transform, so draw both faces
		quad.doubleSided = true;
		quadScene.add( quad );

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
		plane = new THREE.Mesh( geometry, materials.groundSurface );
		// r49 builds a mesh's vertex buffers for its first material, so the
		// normal and depth pass gets its own ground rather than a material swap
		groundNormalDepth = new THREE.Mesh( new THREE.PlaneGeometry( 800, 800, 10, 10 ), materials.groundNormalDepth );
		groundNormalDepth.position.y = -24;
		groundNormalDepth.visible = false;
		scene.add( groundNormalDepth );
		plane.position.y = -24;
		plane.receiveShadow = true;
		scene.add( plane );

		// Model
		loader = new THREE.JSONLoader();

		loader.load( "js/eva_unit01.js", function( geometry ) {

			geometry.computeMorphNormals();

			mesh = new THREE.MorphAnimMesh( geometry, materials.surface );
			
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

		// re-roll the noise a few times a second so the lines boil
		boilTime += delta;
		if(settings.boil > 0 && boilTime > 1000 / settings.boil){
			boilTime = 0;
			materials.sketch.uniforms.uNoiseShift.value.set(Math.random(), Math.random());
		}
	}

	function render(){

		if(!mesh){
			renderer.render( scene, camera );
			return;
		}

		// TSurface
		mesh.material = materials.surface;
		plane.visible = true;
		groundNormalDepth.visible = false;
		renderer.setClearColorHex( PAPER, 1 );
		renderer.render( scene, camera, targets.surface, true );

		// normals and depth, for TEdge (the shadow map is already up to date)
		mesh.material = materials.normalDepth;
		plane.visible = false;
		groundNormalDepth.visible = true;
		renderer.shadowMapAutoUpdate = false;
		renderer.setClearColorHex( 0x8080ff, 1 );
		renderer.render( scene, camera, targets.normalDepth, true );
		renderer.shadowMapAutoUpdate = true;
		renderer.setClearColorHex( PAPER, 1 );

		quad.material = materials.edge;
		renderer.render( quadScene, quadCamera, targets.edge, true );

		quad.material = materials.sketch;
		renderer.render( quadScene, quadCamera );
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
		if(targets.surface){
			createTargets();
		}
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