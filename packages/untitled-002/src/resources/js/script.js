(function(){

	var renderer,
		scene,
		camera,
		aspectRatio		= 0.425531,
		thumbnailMode = new URLSearchParams(window.location.search).has("thumbnail"),
        audioStarted = false,
        playPrompt = document.getElementById("play-prompt"),
        thumbnailFrames = 0,
		depthMaterial,
		depthTarget,
		composer,
		ssao,
		dof,
		fxaa,
		bassMeshes,
		midMeshes,
		highMeshes,
		audio,
		analysis,
		segmentIndex	= 0,
		tatumIndex		= 0,
		beatIndex		= 0,
		barIndex		= 0,
		sectionIndex	= 0,
		waveCounter		= 0,
		numArms			= 18,
		grayArms		= 6,
		armLength		= 35,
		arms,
		_last;

	if ( ! Detector.webgl ) {
		Detector.addGetWebGLMessage();
		return;
	}else{
		preload();
	}

	function preload(){

		var audioType = 'mp3',
			tempAudio = new Audio();

		if(tempAudio.canPlayType('audio/ogg; codecs="vorbis"')){
			audioType = 'ogg';
		}

		var manifest = [
			{id:'audio', src:'resources/audio/breezin.'+audioType}, {id:'analysis', src:'resources/audio/breezin.json'},
			{src:'resources/textures/px.png', id:'px'},{src:'resources/textures/nx.png', id:'nx'},
            {src:'resources/textures/py.png', id:'py'},{src:'resources/textures/ny.png', id:'ny'},
            {src:'resources/textures/pz.png', id:'pz'},{src:'resources/textures/nz.png', id:'nz'}
		];

		if (thumbnailMode) manifest = manifest.filter(function(item){ return item.id !== "audio"; });
        preloader.add(manifest);
		preloader.completeSignal.connect(preloadCompleteHander);


		preloader.completeSignal.connect(circularProgressBar.transitionOut);
		preloader.progressSignal.connect(circularProgressBar.setProgress);
        preloader.start();

	}

	function preloadCompleteHander(){
		init();
		setup();
		animate(0);
		transitionIn();
	}

	function init(){

		var width = Math.max(1, document.body.clientWidth),
            height = Math.max(1, Math.round(width * aspectRatio)),
			depthShader,
			depthUniforms;

		renderer = new THREE.WebGLRenderer({clearColor:0xeeeeee, clearAlpha:1, devicePixelRatio:Math.min(window.devicePixelRatio || 1, 2)});
		renderer.setSize(width, height);
		renderer.domElement.style.opacity = 0;
		document.getElementsByClassName('viewport')[0].appendChild(renderer.domElement);

		scene = new THREE.Scene();
		scene.fog = new THREE.Fog( 0xeeeeee, 250, 600 );

		camera = new THREE.PerspectiveCamera(45, width / height, 1, scene.fog.far);
		camera.position.y = 20;
		camera.position.z = 200;

		// Use physical pixels for every offscreen target and sampling uniform.
        width = renderer.domElement.width;
        height = renderer.domElement.height;

		// depth
		depthShader = THREE.ShaderLib[ "depthRGBA" ];
		depthUniforms = THREE.UniformsUtils.clone( depthShader.uniforms );

		depthMaterial = new THREE.ShaderMaterial( { fragmentShader: depthShader.fragmentShader, vertexShader: depthShader.vertexShader, uniforms: depthUniforms } );
		depthMaterial.blending = THREE.NoBlending;

		depthTarget = new THREE.WebGLRenderTarget( width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );

		// postprocessing
		var colorTarget = new THREE.WebGLRenderTarget(width, height, {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat, stencilBuffer:false});
        colorTarget.generateMipmaps = false;
        depthTarget.generateMipmaps = false;
        composer = new THREE.EffectComposer(renderer, colorTarget);
		composer.addPass( new THREE.RenderPass( scene, camera ) );

		// screen space ambient occlusion
		ssao = new THREE.ShaderPass( THREE.SSAOShader );
		ssao.uniforms[ 'tDepth' ].value = depthTarget;
		ssao.uniforms[ 'size' ].value.set( width, height );
		ssao.uniforms[ 'cameraNear' ].value = camera.near;
		ssao.uniforms[ 'cameraFar' ].value = camera.far;
		ssao.uniforms[ 'fogEnabled' ].value = true;
		ssao.uniforms[ 'fogNear' ].value = scene.fog.near;
		ssao.uniforms[ 'fogFar' ].value = scene.fog.far;
		ssao.uniforms[ 'aoClamp' ].value = 0.3; // default 0.3;
		ssao.uniforms[ 'lumInfluence' ].value = 0.85; // default 0.9;
		//ssao.uniforms[ 'onlyAO' ].value = true;
		composer.addPass( ssao );
		//ssao.renderToScreen = true;

		// depth of field
		dof = new THREE.ShaderPass( THREE.DoFShader );
		dof.uniforms[ 'tDepth' ].value = depthTarget;
		dof.uniforms[ 'size' ].value.set( width, height );
		dof.uniforms[ 'texel' ].value.set( 1.0/width, 1.0/height);
		dof.uniforms[ 'znear' ].value = camera.near;
		dof.uniforms[ 'zfar' ].value = camera.far;
		composer.addPass( dof );

		// fast aproximate anti-alising
		fxaa = new THREE.ShaderPass( THREE.FXAAShader );
		fxaa.uniforms[ 'resolution' ].value.set( 1 / width, 1 / height );
		composer.addPass( fxaa );
		fxaa.renderToScreen = true;

		window.onresize = debounce( resizeHandler, 100 );
        audio = thumbnailMode ? {currentTime:0, pause:function(){}} : preloader.get('audio');
        if (!thumbnailMode) {
            playPrompt.hidden = false;
            playPrompt.textContent = navigator.maxTouchPoints ? 'Tap to play' : 'Click to play';
            playPrompt.addEventListener('click', startAudio);
            renderer.domElement.addEventListener('click', startAudio);
            window.addEventListener('blur', function(){ audio.pause(); });
            window.addEventListener('focus', function(){
                if (audioStarted && !audio.ended) startAudio();
            });
        }

		analysis = preloader.get('analysis');
		//console.log(analysis);
	}

	function setup(){

		var hemiLight,
			i,
			j,
			grayGeometry		= new THREE.IcosahedronGeometry( 1 , 1),
			grayMaterial		= new THREE.MeshLambertMaterial({color: 0xaaaaaa, shading: THREE.FlatShading}),
			whiteGeometry		= new THREE.IcosahedronGeometry( 1 ),
			whiteMaterial		= new THREE.MeshLambertMaterial({color: 0xffffff, shading: THREE.FlatShading}),
			blackGeometry		= new THREE.OctahedronGeometry(1, 0.1),
			cubeImages,
			blackMaterial,
			randomSelect,
			scale,
			minScale			= 1,
			maxScale			= 15,
			radius,
			noiseTheta,
			noisePhi,
			angleScale			= 0.17,
			previousTheta		= 0.5,
			previousPhi			= 0.5,
			phi,
			theta,
			randomPosition		= new THREE.Vector3(),
			mesh,
			previousPosition	= new THREE.Vector3(),
			previousScale		= minScale,
			//randomSeed			= Math.floor(Math.random()*1000),
			randomSeed			= 220,
			m,
			noise,
			noiseScale			= 3;

		console.log("seed = "+randomSeed);
		m = new MersenneTwister(randomSeed);
		noise = new SimplexNoise(m.noise);

		// hemisphere light
		hemiLight = new THREE.HemisphereLight( 0xffffff, 0xaaffff, 0.9 );
		scene.add( hemiLight );

		// direction light
		dirLight = new THREE.DirectionalLight( 0xffffff, 0.3);
		dirLight.position.set(0, 1, 0);
		scene.add( dirLight );

		container = new THREE.Object3D();
		scene.add(container);

		bassMeshes = [];
		midMeshes = [];
		highMeshes = [];


		cubeImages = [
			preloader.get('px'), preloader.get('nx'),
			preloader.get('py'), preloader.get('ny'),
			preloader.get('pz'), preloader.get('nz')
		];

		reflectionCube = new THREE.Texture(cubeImages);
		reflectionCube.flipY = false;
		reflectionCube.needsUpdate = true;

		blackMaterial = new THREE.MeshLambertMaterial( { color: 0x000000, shading: THREE.FlatShading, envMap:reflectionCube, combine:THREE.AddOperation, reflectivity: 0.5} );

		arms = [];
		for(i = 0; i < numArms; i++){
			arms[i] = {allMeshes:[], whiteMeshes:[], blackMeshes:[], smallMeshes:[], mediumMeshes:[], largeMeshes:[]};
			for(j = 0; j < armLength; j++){
				scale = previousScale+noise.noise2D(i, j)*noiseScale;
				if(scale < minScale){
					scale = minScale;
				}else if(scale > maxScale){
					scale = maxScale;
				}

				radius = (scale + previousScale)*0.8;

				noiseTheta	= (m.random() * (angleScale * 2)) - angleScale;
				noisePhi	= (m.random() * (angleScale * 2)) - angleScale;

				noiseTheta += previousTheta;
				noisePhi += previousPhi;

				noiseTheta = limit(noiseTheta, 0, 1);
				noisePhi = limit(noisePhi, 0, 1);

				previousTheta = noiseTheta;
				previousPhi = noisePhi;

				theta = 2 * Math.PI * noiseTheta;
				phi = Math.acos((2 * noisePhi) - 1);

				randomPosition.z = Math.cos(phi);
				randomPosition.y = Math.sqrt(1 - randomPosition.z * randomPosition.z) * Math.cos(theta);
				randomPosition.x = Math.sqrt(1 - randomPosition.z * randomPosition.z) * Math.sin(theta);
				randomPosition.multiplyScalar(radius);
				if(i < grayArms) {
					mesh = new THREE.Mesh(grayGeometry, grayMaterial);
					mesh.scale.set(scale, scale, scale);
				}else{
					randomSelect = m.random();
					if(randomSelect < 0.08){
						mesh = new THREE.Mesh(blackGeometry, blackMaterial);
						mesh.scale.set(scale, scale*1.5, scale);
						arms[i].blackMeshes.push(mesh);
					}else{
						mesh = new THREE.Mesh(whiteGeometry, whiteMaterial);
						mesh.scale.set(scale, scale, scale);
						arms[i].whiteMeshes.push(mesh);
						if(scale < 5){
							arms[i].smallMeshes.push(mesh);
						}else if(scale < 7){
							arms[i].mediumMeshes.push(mesh);
						}else{
							arms[i].largeMeshes.push(mesh);
						}
					}
				}
				arms[i].allMeshes.push(mesh);

				mesh.position.addVectors(previousPosition, randomPosition);

				container.add(mesh);

				mesh.initScale = new THREE.Vector3().copy(mesh.scale);
				mesh.distance = armLength - j;
				mesh.thresholdScale = mesh.scale.x*1.2;

				previousPosition.copy(mesh.position);
				previousScale = scale;
			}
			previousPosition.set(0, 0, 0);
			previousScale = 0;
			previousTheta = 0;
			previousPhi = 0;

		}
	}

	function relaxMeshes(array, ease){
		var al = array.length,
			i,
			currentMesh,
			d;

		for(i = 0; i < al; i++){
			currentMesh = array[i];
			if(currentMesh.scale.x > currentMesh.initScale.x){
				d = currentMesh.initScale.x - currentMesh.scale.x;
				currentMesh.scale.x += d*ease;
				currentMesh.scale.y += d*ease;
				currentMesh.scale.z += d*ease;
			}
		}
	}

	function springMeshes(array, spring, friction){
		var al = array.length,
			i,
			currentMesh;

		for(i = 0; i < al; i++){
			currentMesh = array[i];

			if(!currentMesh.velocity){
				currentMesh.velocity = new THREE.Vector3();
			}
			currentMesh.velocity.x += (currentMesh.initScale.x - currentMesh.scale.x) * spring;
			currentMesh.velocity.y += (currentMesh.initScale.y - currentMesh.scale.y) * spring;
			currentMesh.velocity.z += (currentMesh.initScale.z - currentMesh.scale.z) * spring;
			if(currentMesh.velocity.length() > 0.01){
				currentMesh.scale.x += (currentMesh.velocity.x *= friction);
				currentMesh.scale.y += (currentMesh.velocity.y *= friction);
				currentMesh.scale.z += (currentMesh.velocity.z *= friction);
			}else{
				currentMesh.scale.x = currentMesh.initScale.x;
				currentMesh.scale.y = currentMesh.initScale.y;
				currentMesh.scale.z = currentMesh.initScale.z;
			}

		}
	}

	function impulseMeshes(array){
		var al = array.length,
			i,
			currentMesh;

		for(i = 0; i < al; i++){
			currentMesh = array[i];
			currentMesh.scale.copy(currentMesh.initScale).multiplyScalar(2);
		}
	}

	function waveMeshes(array, t){
		var al = array.length,
			currentLength,
			i,
			currentMesh,
			timeScale = 0.2,
			s;

		currentLength = Math.floor(t*0.5);
		if(al > currentLength){
			al = currentLength;
		}
		t *= timeScale;
		for(i = 0; i < al; i++){
			currentMesh = array[i];

			//s = Math.cos(Math.sin(t + currentMesh.distance)+(t + currentMesh.distance))+1;
			s = (Math.sin(((t) + currentMesh.distance) * 0.3) * 0.8 ) + 0.2;
			//s = Math.sin(Math.exp(Math.cos((t+currentMesh.distance)*0.8))*2);
			currentMesh.scale.x = currentMesh.initScale.x + (currentMesh.initScale.x * s);
			currentMesh.scale.y = currentMesh.initScale.y + (currentMesh.initScale.y * s);
			currentMesh.scale.z = currentMesh.initScale.z + (currentMesh.initScale.z * s);
		}
	}

	function update(t){

		var i,
			currentSegment,
			currentTatum,
			currentBeat,
			currentBar,
			currentSection;

		// spin
		container.rotation.y += 0.005;
       	container.rotation.x += 0.003;

        //
        //relaxMeshes(midMeshes, 0.01);
        //relaxMeshes(highMeshes, 0.03);

        for(i = grayArms; i < numArms; i++){
			springMeshes(arms[i].blackMeshes, 0.03, 0.9);
			relaxMeshes(arms[i].smallMeshes, 0.5);
			relaxMeshes(arms[i].largeMeshes, 0.09);
        }

        if(sectionIndex > 2){
			waveCounter += 1;
			for(i = 0; i < grayArms; i++){
				waveMeshes(arms[i].allMeshes, waveCounter);
			}
        }

        // update lookAt every frame
        camera.lookAt(scene.position);

        /*
		segments: a set of sound entities (typically under a second) each relatively uniform in timbre and harmony.
		Segments are characterized by their perceptual onsets and duration in seconds, loudness (dB), pitch and timbral content.
			*loudness_start: indicates the loudness level at the start of the segment
			*loudness_max_time: offset within the segment of the point of maximum loudness
			*loudness_max: peak loudness value within the segment
		*/

		currentSegment = analysis.segments[segmentIndex];
		if(currentSegment && audio.currentTime >= currentSegment.start){
			segmentIndex++;
		}

		/*
		tatums: list of tatum markers, in seconds. Tatums represent the lowest regular pulse train that a listener intuitively
		infers from the timing of perceived musical events (segments).
		*/

		currentTatum = analysis.tatums[tatumIndex];
		if(currentTatum && audio.currentTime >= currentTatum.start){

			if(barIndex > 8){
				if(barIndex % 4 === 0){
					if(	tatumIndex % 8 === 0 ||
						tatumIndex % 8 === 1 ||
						tatumIndex % 8 === 2 ||
						tatumIndex % 8 === 4 ||
						tatumIndex % 8 === 5 ||
						tatumIndex % 8 === 6
					){
						for(i = grayArms; i < numArms; i++){
							impulseMeshes(arms[i].smallMeshes);
						}
					}
				}else{
					if(	tatumIndex % 8 === 0 ||
						tatumIndex % 8 === 1 ||
						tatumIndex % 8 === 2
					){
						for(i = grayArms; i < numArms; i++){
							impulseMeshes(arms[i].smallMeshes);
						}
					}
				}
			}
			tatumIndex++;
		}

		/*
		beats: list of beat markers, in seconds. A beat is the basic time unit of a piece of music; for example, each tick of
		a metronome. Beats are typically multiples of tatums.
		*/

		currentBeat = analysis.beats[beatIndex];
		if(currentBeat && audio.currentTime >= currentBeat.start){
			// Wood Block Clack
			if(sectionIndex > 0){
				if(barIndex > 8 && barIndex < 16){
					if(barIndex % 4 === 3){
						if(beatIndex % 4 === 2 || beatIndex % 4 === 3){
							for(i = grayArms; i < numArms; i++){
								impulseMeshes(arms[i].largeMeshes);
							}
						}
					}if(barIndex % 4 === 0){
						if(beatIndex % 4 === 1 || beatIndex % 4 === 3){
							for(i = grayArms; i < numArms; i++){
								impulseMeshes(arms[i].largeMeshes);
							}
						}
					}else{
						if(beatIndex % 4 === 2 || beatIndex % 4 === 3){
							for(i = grayArms; i < numArms; i++){
								impulseMeshes(arms[i].largeMeshes);
							}	
						}
					}
				}
				//console.log(beatIndex);
				if(beatIndex % 8 === 7 && barIndex != 4 && barIndex <= 46){
					for(i = grayArms; i < numArms; i++){
						impulseMeshes(arms[i].blackMeshes);
					}				}
			}
			beatIndex++;
		}

		/*
		bars: list of bar markers, in seconds. A bar (or measure) is a segment of time defined as a given number of beats.
		Bar offsets also indicate downbeats, the first beat of the measure.
		*/

		currentBar = analysis.bars[barIndex];
		if(currentBar && audio.currentTime >= currentBar.start){
			barIndex++;
			//console.log(barIndex);
		}

		/*
		sections: a set of section markers, in seconds. Sections are defined by large variations in rhythm or timbre, e.g.
		chorus, verse, bridge, guitar solo, etc.
		*/

		currentSection = analysis.sections[sectionIndex];
		if(currentSection && audio.currentTime >= currentSection.start){
			//console.log("section change "+sectionIndex);
			sectionIndex++;
		}


	}

	function render(){

		// Empty pixels must decode as far depth, not the scene background color.
        renderer.setClearColor(new THREE.Color(0xffffff), 1);
        scene.overrideMaterial = depthMaterial;
		renderer.render( scene, camera, depthTarget, true );
        renderer.setClearColor(new THREE.Color(0xeeeeee), 1);

		scene.overrideMaterial = null;

		composer.render();
		//renderer.render(scene, camera);
	}

    function startAudio(){
        if (thumbnailMode) return;
        audio.play().then(function(){
            audioStarted = true;
            playPrompt.hidden = true;
        }).catch(function(){ playPrompt.hidden = false; });
    }

    function transitionIn(){
        if (thumbnailMode) {
            renderer.domElement.style.opacity = 1;
            document.getElementById('footer').hidden = true;
        } else {
            TweenLite.to(renderer.domElement, 2, {opacity:1, delay:0.75});
        }
    }

    function animate(t){
        if (!thumbnailMode || thumbnailFrames < 60) {
            update(t);
            thumbnailFrames++;
        }
        render();
        if (thumbnailMode && thumbnailFrames >= 60) document.documentElement.dataset.thumbnailReady = 'true';
        window.requestAnimationFrame(animate);
    }

	function resizeHandler(){

		var width = Math.max(1, document.body.clientWidth),
            height = Math.max(1, Math.round(width * aspectRatio)),
			previousDepthTarget;

		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		renderer.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setSize(width, height);
        width = renderer.domElement.width;
        height = renderer.domElement.height;
		composer.setSize(width, height);

		previousDepthTarget = depthTarget;
		depthTarget = depthTarget.clone();
		depthTarget.width = width;
		depthTarget.height = height;
		previousDepthTarget.dispose();

		fxaa.uniforms['resolution'].value.set( 1 / width, 1 / height );

		ssao.uniforms[ 'tDepth' ].value = depthTarget;
		ssao.uniforms[ 'size' ].value.set( width, height );

		dof.uniforms[ 'tDepth' ].value = depthTarget;
		dof.uniforms[ 'size' ].value.set( width, height );
		dof.uniforms[ 'texel' ].value.set( 1.0/width, 1.0/height);

	}

	// debounce a callback function with delay being the longest acceptable time before seeing an effect
	// via https://gist.github.com/sansumbrella/4527653
	function debounce (fn, delay) {
		var timeout = null;
		return function () {
			if( timeout !== null ){ clearTimeout( timeout ); }
			timeout = setTimeout( fn, delay );
		};
	}

	function limit(target, min, max){
		if(target < min){
			target = min;
		}else if(target > max){
			target = max;
		}
		return target;
	}

}());
