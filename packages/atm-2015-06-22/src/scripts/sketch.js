(function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			depthMaterial,
			depthTarget,
			composer,
			clock = new THREE.Clock(true),
            thumbnailMode = new URLSearchParams(location.search).has('thumbnail'),
			container,
			walk,
			walkInterval,
			previousBox,
			currentStep = 0,
			totalSteps = 300,
			cameraTargetPosition = new THREE.Vector3(0, 0, 0),
			cameraLookAt = new THREE.Vector3(0, 0, 0),
			cameraLookAtTargetPosition = new THREE.Vector3(0, 0, 0),
			cameraOffset = new THREE.Vector3(0, 0.5, 1).normalize().multiplyScalar(50),
			tempPosition = new THREE.Vector3(),
			center = new THREE.Vector3(0, 0, 0),
			radius = 10,
			orbit = false,
			startOrbit,
			currentRotation = 0,

			init = function(){

				renderer.setClearColor( 0x8D9690);
				scene.fog = new THREE.Fog(  0x8D9690, 100, 300 );
				camera.position.set(0 , 10, 25);
				
				setupPostprocessing();
				addLights();
				populateScene();
				
				startWalk();

			},

			setupPostprocessing = function(){
				// depth
				
				var depthShader = THREE.ShaderLib[ "depthRGBA" ];
				var depthUniforms = THREE.UniformsUtils.clone( depthShader.uniforms );

				depthMaterial = new THREE.ShaderMaterial( { fragmentShader: depthShader.fragmentShader, vertexShader: depthShader.vertexShader, uniforms: depthUniforms } );
				depthMaterial.blending = THREE.NoBlending;

				// postprocessing
				
				composer = new THREE.EffectComposer( renderer );
				composer.addPass( new THREE.RenderPass( scene, camera ) );

				depthTarget = new THREE.WebGLRenderTarget( renderer.domElement.width, renderer.domElement.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat } );
				
				var vignette = new THREE.ShaderPass( THREE.VignetteShader );
				composer.addPass(vignette);

				var effect = new THREE.ShaderPass( THREE.SSAOShader );
				effect.uniforms[ 'tDepth' ].value = depthTarget;
				effect.uniforms[ 'size' ].value.set( renderer.domElement.width, renderer.domElement.height );
				effect.uniforms[ 'cameraNear' ].value = camera.near;
				effect.uniforms[ 'cameraFar' ].value = camera.far;
				effect.uniforms[ 'aoClamp' ].value = 0.7 ;
				effect.uniforms[ 'lumInfluence' ].value = 0.7;
				composer.addPass( effect );
				effect.renderToScreen = true;
                window.addEventListener('resize', function(){
                    var width = renderer.domElement.width, height = renderer.domElement.height;
                    composer.setSize(width, height);
                    var previous = depthTarget;
                    depthTarget = previous.clone();
                    depthTarget.width = width; depthTarget.height = height;
                    previous.dispose();
                    effect.uniforms.tDepth.value = depthTarget;
                    effect.uniforms.size.value.set(width, height);
                });

			},
			
			addLights = function(){
				
				var directionalLight = new THREE.DirectionalLight( 0xffffff, 1.2 ),
					bounceLight =  new THREE.DirectionalLight( 0xA7CCB2, 0.5 )

				scene.add(directionalLight);
				directionalLight.position.set( 1, 1, 1 );

				scene.add(bounceLight);
				bounceLight.position.set( -1, -1, -1 );

			},

			populateScene = function(){
				
				container = new THREE.Object3D();
				walk = new THREE.Object3D();
				container.add(walk);
				scene.add( container );
			
			},

			startWalk = function(){
                if (thumbnailMode) {
                    for (var i = 0; i < 120; i++) walkStep();
                    var bounds = new THREE.Box3().setFromObject(walk);
                    cameraLookAtTargetPosition.copy(bounds.center());
                    cameraTargetPosition.copy(cameraLookAtTargetPosition).add(cameraOffset);
                    camera.position.copy(cameraTargetPosition);
                    cameraLookAt.copy(cameraLookAtTargetPosition);
                    return;
                }
				var bbox = new THREE.Box3(),
					walkInterval = setInterval(function(){

						walkStep();
						currentStep++;

						bbox.setFromObject(walk);

						if(currentStep === totalSteps){
							clearInterval(walkInterval);
							previousBox = undefined;
							currentStep = 0;
							orbit = true;
							radius = bbox.getBoundingSphere().radius * 1.75;
							cameraLookAtTargetPosition.copy(bbox.center());
						}
					}, 62.5);
			},

			walkStep = function(){
				
				var geometry,
					material,
					mesh,
					randomColor = Math.random();

				geometry = new THREE.BoxGeometry( Math.random() * 5 + 1, Math.random() * 5 + 1, Math.random() * 5 + 1 );
				material = new THREE.MeshLambertMaterial({color: 0x5c2d63, wrapAround:true});
				mesh = new THREE.Mesh( geometry, material );

				geometry.computeBoundingBox();

				if( randomColor > 0.75 && randomColor < 0.95){
					material.color = new THREE.Color( 0xffffff );
				}else if( randomColor >= 0.95 ){
					material.color = new THREE.Color( 0xff0000 );
				}

				placeMesh(mesh);
				
				cameraTargetPosition.copy(mesh.position);
				cameraTargetPosition.add(cameraOffset);
				cameraLookAtTargetPosition.copy(mesh.position)

				previousBox = mesh;
					
			},

			placeMesh = function(mesh){

				var picking = true;

				while(picking){
					pickPositon(mesh);
					picking = hasZfight(mesh);
				}
				
				walk.add(mesh);
				
			},

			pickPositon = function(mesh){
				
				var direction = pickDirection(),
					distance = 0

				if(previousBox){
					mesh.position.copy(previousBox.position);
					distance = determineDistance(mesh, previousBox, direction);
				}

				mesh.position.add(direction.multiplyScalar(distance));
			},

			pickDirection = function(){

				var direction = new THREE.Vector3();

				switch( Math.floor( Math.random() * 6 + 1) ){
					case 1:
						direction.set(1, 0, 0);
						break;
					case 2:
						direction.set(-1, 0, 0);
						break;
					case 3:
						direction.set(0, 1, 0);
						break;
					case 4:
						direction.set(0, -1, 0);
						break;
					case 5:
						direction.set(0, 0, 1);
						break;
					case 6:
						direction.set(0, 0, -1);
						break;
				};

				return direction;

			},

			determineDistance = function(obj1, obj2, direction){
				var dist = 1,
					spacer = 0.001;

				if(direction.x != 0){
					// top and bottom
					if(direction.x === 1){
						dist = obj1.geometry.boundingBox.max.x + obj2.geometry.boundingBox.max.x + spacer;
					}else{
						dist = -( obj1.geometry.boundingBox.min.x + obj2.geometry.boundingBox.min.x  + spacer )
					}
				}else if(direction.y != 0){
					// left and right
					if(direction.y === 1){
						dist = obj1.geometry.boundingBox.max.y + obj2.geometry.boundingBox.max.y + spacer;
					}else{
						dist = -( obj1.geometry.boundingBox.min.y + obj2.geometry.boundingBox.min.y  + spacer )
					}
				}else{
					// front and back
					if(direction.z === 1){
						dist = obj1.geometry.boundingBox.max.z + obj2.geometry.boundingBox.max.z + spacer;
					}else{
						dist = -( obj1.geometry.boundingBox.min.z + obj2.geometry.boundingBox.min.z  + spacer )
					}
				}

				return dist;
			},

			hasZfight = function(mesh){

				var i,
					cl = walk.children.length,
					currentBox;

				for( i = 0; i < cl; i++){
					currentBox = walk.children[i];
					if(currentBox !== mesh && areCoplanar(currentBox, mesh)){
						return true;
					}
				}

				return false;
			},

			areCoplanar = (function(){

				var bbox1 = new THREE.Box3(),
					bbox2 = new THREE.Box3();

				return function(obj1, obj2){
					
					bbox1.setFromObject(obj1);
					bbox2.setFromObject(obj2);

					if(bbox2.isIntersectionBox(bbox1)){
						if(bbox1.min.x === bbox2.min.x ||
							bbox1.min.y === bbox2.min.y ||
							bbox1.min.z === bbox2.min.z ||
							bbox1.max.x === bbox2.max.x ||
							bbox1.max.y === bbox2.max.y ||
							bbox1.max.z === bbox2.max.z 
						){
							return true;
						}

					}

					return false;

				}
			
			}()),

			transitionOut = function(){
				var count = 0;
				walk.children.forEach(function(box){
					var tween = new TWEEN.Tween( { scale: 1 } )
						.to( { scale: 0.001 }, 500 )
						.easing( TWEEN.Easing.Quadratic.InOut )
						.onUpdate( function () {
							box.scale.x = box.scale.y = box.scale.z = this.scale;
							box.position.y += 1;
						} )
						.onComplete(function(){
							walk.remove(box);
                            box.geometry.dispose();
                            box.material.dispose();
							count++
							if(count === totalSteps){
								startWalk();
							}
						})
						.delay(Math.random()*200)
						.start(clock.getElapsedTime() * 1000);
				})
			},

			update = function(timestep){
				
				if(orbit){

					if(!startOrbit){
						startOrbit = clock.getElapsedTime();
					}

					if(clock.getElapsedTime() >= startOrbit + 7.4){
						
						orbit = false;
						startOrbit = undefined;
						currentRotation = 0;
						transitionOut();
					
					}else{
						
						cameraTargetPosition.copy(cameraLookAtTargetPosition);

						currentRotation += 0.015;

						cameraTargetPosition.x += radius * Math.sin(currentRotation);
						cameraTargetPosition.y += 0;
						cameraTargetPosition.z += radius * Math.cos(currentRotation);
					
					}
	
				}
				
				tempPosition.copy(cameraTargetPosition).sub(camera.position).multiplyScalar(0.01);
				camera.position.add(tempPosition);

				tempPosition.copy(cameraLookAtTargetPosition).sub(cameraLookAt).multiplyScalar(0.01);
				cameraLookAt.add(tempPosition);

				TWEEN.update(clock.getElapsedTime()*1000);

			},
			
			draw = function(interpolation){
				camera.lookAt(cameraLookAt);	
				
				renderer.setClearColor(0xffffff, 1);
                scene.overrideMaterial = depthMaterial;
				renderer.render( scene, camera, depthTarget );

				scene.overrideMaterial = null;
                renderer.setClearColor(0x8D9690, 1);
				composer.render();
			}

		return{
			init: init,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))