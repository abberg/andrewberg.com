(function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			frustum = new THREE.Frustum(),
			tempMatrix = new THREE.Matrix4(),
			simulationTime = 0,
			composer,
			spheres = [],

			init = function(){
				
				camera.position.z = 10;
				camera.updateMatrix(); 
				camera.updateMatrixWorld(true);
				camera.matrixWorldInverse.getInverse( camera.matrixWorld );
				
				frustum.setFromMatrix( tempMatrix.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ) );

				setupLighting();
				populateScene();
				setupPostprocessing();
			
			},

			setupLighting = function(){
				var keyLight = new THREE.PointLight( 0xFFFAE8, 1, 25 ),
					bounceLight = new THREE.DirectionalLight( 0xFFFAE8, 0.25);

				keyLight.position.set(0, 5.5, 0);
				scene.add(keyLight);
				bounceLight.position.set(0, -1, 0);
				scene.add(bounceLight);
			},
			
			populateScene = function(){
				var geometry = new THREE.SphereGeometry( 1, 32, 32 ),
					material = new THREE.MeshLambertMaterial( { color: 0xffffff, wrapAround: true } ),
					mesh,
					model,
					previousModel,
					velocity,
					containingSphere,
					numSpheres = 400,
					i;

				for(i = 0; i < numSpheres; i++){
					
					mesh = new THREE.Mesh( geometry, material );
					mesh.position.set(Math.random() * 16 - 8, Math.random() * 8 - 4, Math.random() * 10 - 5 );
					mesh.scale.multiplyScalar(Math.random());
					mesh.updateMatrix();
					mesh.updateMatrixWorld(true);

					model = new THREE.Object3D();
					model.position.copy(mesh.position);
					previousModel = model.clone();

					velocity = new THREE.Vector3();
					velocity.y = (0.003 + (0.007 - 0.007 * mesh.scale.x)) * 60;
					
					if( frustum.intersectsObject( mesh ) ){
						spheres.push({mesh: mesh, model: model, previousModel: previousModel, velocity: velocity,
                            radius: mesh.scale.x, inverseMass: 1 / Math.max(0.025, Math.pow(mesh.scale.x, 3)),
                            riseSpeed: velocity.y, phase: Math.random() * Math.PI * 2});
						scene.add(mesh);
					}
				
				}
				
			},

			setupPostprocessing = function(){
				var depthShader = THREE.ShaderLib[ "depthRGBA" ],
					depthUniforms = THREE.UniformsUtils.clone( depthShader.uniforms ),
					fxaa;

				composer = new THREE.EffectComposer( renderer );
				composer.addPass( new THREE.RenderPass( scene, camera ) );

				fxaa = new THREE.ShaderPass( THREE.FXAAShader );
				fxaa.uniforms.resolution.value.set( 1 / renderer.domElement.width, 1 / renderer.domElement.height );
				fxaa.renderToScreen = true;
				composer.addPass( fxaa );

				window.addEventListener('resize', function(){
                    composer.setSize(renderer.domElement.width, renderer.domElement.height);
					fxaa.uniforms.resolution.value.set( 1 / renderer.domElement.width, 1 / renderer.domElement.height );
				});

			},

            update = function(timestep){
                var dt = Math.min(timestep / 1000, 1 / 30);
                simulationTime += dt;
                var driftBlend = 1 - Math.exp(-0.8 * dt);
                var riseBlend = 1 - Math.exp(-1.2 * dt);
                spheres.forEach(function(sphere){
                    var position = sphere.model.position, velocity = sphere.velocity;
                    sphere.previousModel.position.copy(position);
                    velocity.x += (Math.sin(simulationTime * 0.45 + sphere.phase) * 0.12 - velocity.x) * driftBlend;
                    velocity.z += (Math.cos(simulationTime * 0.35 + sphere.phase) * 0.07 - velocity.z) * driftBlend;
                    velocity.y += (sphere.riseSpeed - velocity.y) * riseBlend;
                    position.x += velocity.x * dt;
                    position.y += velocity.y * dt;
                    position.z += velocity.z * dt;
                });
                ab.separateBubbles(spheres);
                spheres.forEach(function(sphere){
                    var position = sphere.model.position, velocity = sphere.velocity, radius = sphere.radius;
                    var near = 5 - radius, far = -5 + radius;
                    if (position.z > near) { position.z = near; velocity.z = -Math.abs(velocity.z) * 0.3; }
                    if (position.z < far) { position.z = far; velocity.z = Math.abs(velocity.z) * 0.3; }
                    var halfHeight = Math.tan(camera.fov * Math.PI / 360) * (camera.position.z - position.z);
                    var edge = Math.max(radius, halfHeight * camera.aspect - radius);
                    if (position.x > edge) { position.x = edge; velocity.x = -Math.abs(velocity.x) * 0.3; }
                    if (position.x < -edge) { position.x = -edge; velocity.x = Math.abs(velocity.x) * 0.3; }
                    if (position.y - radius > halfHeight) {
                        position.y = -halfHeight - radius;
                        position.x = (Math.random() * 2 - 1) * edge;
                        velocity.set(0, sphere.riseSpeed, 0);
                        // Don't interpolate across the screen when recycling a bubble.
                        sphere.previousModel.position.copy(position);
                    }
                });
            },

			draw = function(interpolation){

				spheres.forEach(function(sphere){
					sphere.mesh.position.lerpVectors(sphere.previousModel.position, sphere.model.position, interpolation);
				})

				composer.render();

			}

		return{
			init: init,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))