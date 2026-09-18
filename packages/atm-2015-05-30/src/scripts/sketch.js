(function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			simplex = new SimplexNoise(),
			noiseY = 0,
			cubes = [],
			container,
			debugContext,

			init = function(){
				
				var numBoxes = 200,
					boxWidth = 0.05,
					boxDepth = 2,
					geometry = new THREE.BoxGeometry( boxWidth, 1, boxDepth ),
					material = new THREE.MeshPhongMaterial( { color: 0xFF3300, shininess: 100 } ),
					mesh,
					geometry2 = new THREE.BoxGeometry( 0.02, 1, 1.25 ),
					mesh2,
					edges,
					i,
					container,
					model,
					previousModel,
					keyLight = new THREE.DirectionalLight( 0xffffff ),
					bounceLight = new THREE.DirectionalLight( 0xffffff, 0.3 ),
					backLight = new THREE.SpotLight( 0xffffff, 0.5, 0, Math.PI/3, 10.0),
					debugCanvas;

				container = new THREE.Object3D();

				for(i = 0; i < numBoxes; i++){

					mesh = new THREE.Mesh( geometry, material ),
					container.add(mesh);

					model = new THREE.Object3D();
					model.position.x = ( i * boxWidth ) - 5;
					model.rotation.x = i * 0.04 ;
					previousModel = model.clone();

					mesh2 = new THREE.Mesh( geometry2 );
					mesh2.visible = false;
					edges = new THREE.EdgesHelper( mesh2, 0x990000 );
					container.add(mesh2);
					mesh.add(edges);
					mesh2.position.y = -0.8;
					mesh2.position.z = 0.25;

					cubes.push({mesh:mesh, model:model, previousModel:previousModel});

				}
				scene.add( container );

				geometry = new THREE.PlaneBufferGeometry( 100, 100, 1 );
				material = new THREE.MeshPhongMaterial( { color: 0x4c6467, shininess:1} ),
				mesh = new THREE.Mesh( geometry, material );
				mesh.position.z = -5;
				scene.add( mesh );

				scene.add(keyLight);
				keyLight.position.set( 1, 1, 0.5 );

				scene.add(bounceLight);
				bounceLight.position.set( 1, -1, 1 );

				scene.add(backLight);
				backLight.position.set( 0, -5, 0 );
				backLight.target = mesh;
				
				renderer.setClearColor(0x2D4445);

				camera.position.z = 3;

				debugCanvas = document.createElement('canvas');
				debugCanvas.style.position = 'absolute';
				debugCanvas.style.top = '0';
				debugCanvas.style.left = '0';
				debugCanvas.style.zIndex = '1';
				document.body.appendChild(debugCanvas);
				debugContext = debugCanvas.getContext('2d');
				debugCanvas.style.display = 'none';
			
			},
			
			update = function(timestep){
				
				var noiseSpeed = 0.015,
					noiseScale = 0.2,
					rotationVelocity = 0.02,
					noise,
					index = 0;

				cubes.forEach(function(cube){

					noise = simplex.noise2D(cube.model.position.x * noiseScale, noiseY * noiseScale);
					cube.model.position.y = noise;
					noise = ((noise + 1) * 0.5);

					cube.model.clone(cube.previousModel);
					cube.model.rotation.x -= rotationVelocity + ( 0.01 * noise );
					cube.model.scale.y = 0.1 + Math.pow( 1 - noise, 4 );
					cube.model.scale.z = 0.1 + Math.pow( 1 - noise, 4 ) * 3;

					var gray = parseInt(noise * 255);
                   	debugContext.fillStyle = 'rgb('+gray+', '+gray+', '+gray+')';
					debugContext.fillRect( index, 0, 1, 25 );

					index++;
				});

				noiseY += noiseSpeed;
			},
			
			draw = function(interpolation){
				
				cubes.forEach(function(cube){

					//slat.view.position.copy(slat.model.position);
					cube.mesh.position.lerpVectors(cube.previousModel.position, cube.model.position, interpolation);
					THREE.Quaternion.slerp(cube.previousModel.quaternion, cube.model.quaternion, cube.mesh.quaternion, interpolation);
					cube.mesh.scale.lerpVectors(cube.previousModel.scale, cube.model.scale, interpolation);

				});

			}

		return{
			init: init,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))