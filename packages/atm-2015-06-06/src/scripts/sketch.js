 (function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			occlusionScene = new THREE.Scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			composer,
			lightImposter,
			glow,
			ring,
			occlusionlightImposter,
			godRays,
			add,
			occlusionComposer,
			finalComposer,
			//controls = new THREE.OrbitControls( camera ),
			shells = [],

			init = function(){
				var geometry,
					material,
					mesh,
					occlusionMesh,
					model,
					previousModel,
					sphereBSP,
					sphereBSP2,
					boxBSP,
					boxBSP2,
					result,
					directionalLight = new THREE.DirectionalLight( 0x005566 ),
					keyLight = new THREE.SpotLight(0xffffff),
					pointLight = new THREE.PointLight( 0xff0099, 1.0, 3 );

				//renderer.setPixelRatio( window.devicePixelRatio );
				renderer.shadowMapEnabled = true;

				scene.add(keyLight);
				
				keyLight.intensity = 1;
				keyLight.distance = 0;
				keyLight.angle = Math.PI / 3;
				keyLight.exponent = 3;
				keyLight.decay = 2;
				
				keyLight.position.set( 0, 10, 5);
				keyLight.target.position.set(0, 0, -5);
				
				keyLight.castShadow = true;
				
				keyLight.shadowMapWidth = 1024;
				keyLight.shadowMapHeight = 1024;

				keyLight.shadowCameraNear = 9;
				keyLight.shadowCameraFar = 13;
				keyLight.shadowCameraFov = 20;
				//keyLight.shadowCameraVisible = true;
				//var slh = new THREE.SpotLightHelper(keyLight);
				//scene.add(slh);

				scene.add(directionalLight);
				directionalLight.position.set( 0, -1, 0.01 );

				scene.add( pointLight );

				geometry = new THREE.PlaneBufferGeometry( 30, 30, 1 );
				material = new THREE.MeshPhongMaterial( { color: 0xffffff } );
				mesh = new THREE.Mesh( geometry, material );
				mesh.position.z = -5;
				scene.add( mesh );

				geometry = new THREE.IcosahedronGeometry( 0.15, 2 );
				material = new THREE.MeshBasicMaterial( { color: 0xff99dd, transparent:true, opacity: 1} );
				lightImposter = new THREE.Mesh( geometry, material );
				scene.add( lightImposter );

				geometry = new THREE.IcosahedronGeometry( 0.3, 2 );
				material = new THREE.MeshBasicMaterial( { color: 0xffffff, transparent:true, opacity: 0.075, blending:THREE.AdditiveBlending} );
				glow = new THREE.Mesh( geometry, material );
				scene.add( glow );

				geometry = new THREE.TorusGeometry( 0.45, 0.01, 8, 32);
				material = new THREE.MeshBasicMaterial( { color: 0xffffff, transparent:true, opacity: 0.075, blending:THREE.AdditiveBlending} );
				ring = new THREE.Mesh( geometry, material );
				scene.add( ring );

				geometry = new THREE.IcosahedronGeometry( 0.5, 2 );
				material = new THREE.MeshBasicMaterial( { color: 0xff99dd } );
				occlusionlightImposter = new THREE.Mesh( geometry, material );
				occlusionScene.add( occlusionlightImposter );

				geometry = new THREE.IcosahedronGeometry( 1.5, 2 );
				mesh = new THREE.Mesh( geometry );
				sphereBSP = new ThreeBSP( mesh );

				geometry = new THREE.BoxGeometry( 4, 4, 2);
				mesh = new THREE.Mesh( geometry );
				mesh.position.set(0, 0, -1);
				boxBSP = new ThreeBSP( mesh );

				geometry = new THREE.BoxGeometry( 4, 2, 4);
				mesh = new THREE.Mesh( geometry );
				mesh.position.set(0, -1, 0);
				boxBSP2 = new ThreeBSP( mesh );

				geometry = new THREE.IcosahedronGeometry( 1.4 , 2);
				mesh = new THREE.Mesh( geometry);
				sphereBSP2 = new ThreeBSP( mesh );

				result = sphereBSP
							.subtract( boxBSP )
							.subtract( boxBSP2 )
							.subtract( sphereBSP2 )
							.toMesh( new THREE.MeshPhongMaterial({color: 0x667777, shininess: 40}) );

				for(var i = 6; i < 14; i++){
					
					mesh = result.clone();
					mesh.scale.multiplyScalar(i/14);
					scene.add(mesh);

					occlusionMesh = mesh.clone();
					occlusionMesh.material = new THREE.MeshBasicMaterial({color: 0x000000});
					occlusionScene.add(occlusionMesh);

					mesh.castShadow = true;
					mesh.receiveShadow = true;

					model = new THREE.Object3D();
					model.rotation.x =  Math.random() * ( Math.PI * 2 );
					model.rotation.y =  Math.random() * ( Math.PI * 2 );
					previousModel = model.clone();

					shells.push({
						mesh:mesh, 
						occlusionMesh: occlusionMesh, 
						model: model,
						previousModel: previousModel,
						xVelocity: Math.random() * 0.002 - 0.001, 
						yVelocity: Math.random() * 0.002 - 0.001
					});
				}

				var width = renderer.domElement.width,
					height = renderer.domElement.height,
					halfWidth = Math.max(1, Math.floor(width * 0.5)),
					halfHeight = Math.max(1, Math.floor(height * 0.5)),
					occlusionRender,
					horizontalBlur,
					verticalBlur,
					blurSize,				
					occlusionRenderTarget,
					sceneRender,
					FXAA;
	 
				occlusionRender = new THREE.RenderPass( occlusionScene, camera );

				horizontalBlur = new THREE.ShaderPass( THREE.HorizontalBlurShader );
				verticalBlur = new THREE.ShaderPass( THREE.VerticalBlurShader );
					
				blurSize = 3;
				 
				horizontalBlur.uniforms.h.value = blurSize / width;
				verticalBlur.uniforms.v.value = blurSize / height;
				 
				godRays = new THREE.ShaderPass( THREE.Extras.Shaders.Godrays );
				 
				occlusionRenderTarget = new THREE.WebGLRenderTarget( halfWidth, halfHeight, { minFilter: THREE.LinearFilter } );

				occlusionComposer = new THREE.EffectComposer( renderer, occlusionRenderTarget );
				occlusionComposer.addPass( occlusionRender );
				occlusionComposer.addPass( horizontalBlur );
				occlusionComposer.addPass( verticalBlur );
				occlusionComposer.addPass( horizontalBlur );
				occlusionComposer.addPass( verticalBlur );
				occlusionComposer.addPass( godRays );

				sceneRender = new THREE.RenderPass( scene, camera );
				 
				add = new THREE.ShaderPass( THREE.Extras.Shaders.Additive );
				
				FXAA = new THREE.ShaderPass( THREE.FXAAShader );
  				FXAA.uniforms.resolution.value.set( 1 / renderer.domElement.width, 1 / renderer.domElement.height );
				FXAA.renderToScreen = true;
				 
				finalComposer = new THREE.EffectComposer( renderer );
				finalComposer.addPass( sceneRender );
				finalComposer.addPass( add );
				finalComposer.addPass( FXAA );

				godRays.uniforms.fExposure.value 	= 0.13;
				godRays.uniforms.fDecay.value 		= 0.93;
				godRays.uniforms.fDensity.value 	= 1.0; 
				godRays.uniforms.fWeight.value 		= 1.0;

				window.addEventListener('resize', function(){

					width = renderer.domElement.width,
					height = renderer.domElement.height,
					halfWidth = Math.max(1, Math.floor(width * 0.5)),
					halfHeight = Math.max(1, Math.floor(height * 0.5)),

					occlusionComposer.setSize(halfWidth, halfHeight);
                    finalComposer.setSize(width, height);

					horizontalBlur.uniforms.h.value = blurSize / width;
					verticalBlur.uniforms.v.value = blurSize / height;

					FXAA.uniforms.resolution.value.set( 1 / renderer.domElement.width, 1 / renderer.domElement.height );
				});

				/*
				var gui = new dat.GUI();
	  			gui.add(godRays.uniforms.fExposure, 'value', 0, 1).name('Exposure');
	  			gui.add(godRays.uniforms.fDecay, 'value', 0, 1).name('Decay');
	  			gui.add(godRays.uniforms.fDensity, 'value', 0, 1).name('Density');
	  			gui.add(godRays.uniforms.fWeight, 'value', 0, 1).name('Weight');
	  			gui.add(godRays.uniforms.fClamp, 'value', 0, 1).name('Clamp');
				*/

				camera.position.z = distanceToFitObjectInFrustum(result, camera, renderer.domElement);
				window.addEventListener('resize', function(){
					camera.position.z = distanceToFitObjectInFrustum(result, camera, renderer.domElement);
				});

			},
			
			distanceToFitObjectInFrustum = function(object, camera, canvas){
				
				var cameraDistance,
					bbox = new THREE.Box3().setFromObject(object),
					width  = bbox.size().x,
					height = bbox.size().y,
					aspectRatio = canvas.width / canvas.height,
					fieldOfView = camera.fov,
					closestFace = bbox.max.z;

				if(canvas.width < canvas.height){
					// portrait - size via width
					cameraDistance = ( width / aspectRatio ) / 2 / Math.tan( Math.PI * fieldOfView / 360 );
				}else{
					// landscape - size by height
					cameraDistance = height / 2 / Math.tan( Math.PI * fieldOfView / 360 );
				}
				
				cameraDistance += closestFace;

				return cameraDistance
			},
			
			framestart = function(timestamp){
				
			},

			update = function(timestep){
				//controls.update();
				shells.forEach(function(shell){
					shell.previousModel.rotation.copy(shell.model.rotation)
					shell.model.rotation.x += shell.xVelocity * timestep;
					shell.model.rotation.y += shell.yVelocity * timestep;
				});

				var random = Math.random();

				lightImposter.material.opacity += random * 0.02 - 0.01;
				if(lightImposter.material.opacity < 0.7){
					lightImposter.material.opacity = 0.7;
				}else if(lightImposter.material.opacity > 1){
					lightImposter.material.opacity = 1;
				}

				lightImposter.scale.x = lightImposter.scale.y = lightImposter.scale.z = 0.3 + lightImposter.material.opacity;

				glow.material.opacity += random * 0.02 - 0.01;
				if(glow.material.opacity < 0.05){
					glow.material.opacity = 0.05;
				}else if(glow.material.opacity > 0.1){
					glow.material.opacity = 0.1;
				}

				glow.scale.x = glow.scale.y = glow.scale.z = 1 + glow.material.opacity;

				ring.material.opacity = glow.material.opacity;
				ring.scale.x = ring.scale.y = ring.scale.z = 1 - glow.material.opacity;

				

			},
			
			draw = function(interpolation){
				
				shells.forEach(function(shell){
					THREE.Quaternion.slerp(shell.previousModel.quaternion, shell.model.quaternion, shell.mesh.quaternion, interpolation);
					THREE.Quaternion.slerp(shell.previousModel.quaternion, shell.model.quaternion, shell.occlusionMesh.quaternion, interpolation);
				});
				
				occlusionComposer.render();
                add.uniforms.tAdd.value = occlusionComposer.readBuffer;
				finalComposer.render();
				//renderer.render(scene, camera);
			}

		return{
			init: init,
			framestart: framestart,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))