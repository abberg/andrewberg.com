(function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			simplex = new SimplexNoise(),
			planeWidth = 10,
			planeHeight = 10,
			container,
			model,
			previousModel,
			mesh,
			points,
			tempVert = new THREE.Vector3(),
			position = new THREE.Vector3(),

			init = function(){
				var subdivisions = 25,
					geometry = new THREE.PlaneGeometry( planeWidth, planeHeight, subdivisions, subdivisions ),
					material = new THREE.MeshPhongMaterial( { color: 0xffffff, wireframe: true, transparent: true, opacity:0.75} ),
					pointGeometry = new THREE.PlaneBufferGeometry( planeWidth, planeHeight, subdivisions, subdivisions ),
					pointMaterial = new THREE.PointCloudMaterial({color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity:0.25}),
					light = new THREE.PointLight( 0xffffff, 1, 15);

				model = new THREE.Object3D();
				model.rotation.x = -Math.PI/2;
				previousModel = model.clone();
				
				container = new THREE.Object3D();
				scene.add(container);

				mesh = new THREE.Mesh( geometry, material );
				container.add( mesh );

				points = new THREE.PointCloud( pointGeometry, pointMaterial );
				container.add(points);

				light.position.set( 0, 5, 0 ); 
				scene.add( light );

				renderer.setClearColor( 0x333333 );
				scene.fog = new THREE.Fog( 0x333333, 5, 15 );

				camera.position.y = 2.5;
				
				camera.position.z = distanceToFitObjectInFrustum(container, camera, renderer.domElement);
				window.addEventListener('resize', function(){
					camera.position.z = distanceToFitObjectInFrustum(container, camera, renderer.domElement);
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
			
			update = function(timestep){
				var rotationalVelocity = 0.00005,
					zpos,
					pointIndex = 2,
					xpos,
					ypos,
					noiseScale = 3.2;

				mesh.geometry.vertices.forEach(function(vertex){
					
					tempVert.copy(vertex);
					tempVert.add(position);
					
					zpos = fbm(tempVert);

					// here's the magic, the sin envelope pushes 
					// the noise up in the middle and down at the side.
					// First put the x and y position in the range of 0 - Math.PI
					xpos = ( ( vertex.x + ( planeWidth * 0.5 ) ) / planeWidth ) * Math.PI;
					ypos = ( ( vertex.y + ( planeHeight * 0.5 ) ) / planeHeight ) * Math.PI;
					// then sin and scale it up for drama!
					zpos *= Math.sin( xpos ) * noiseScale;
					zpos *= Math.sin( ypos ) * noiseScale;
					
					if(zpos < 0 ){
						zpos = 0;
					}

					vertex.z = zpos;
					points.geometry.attributes.position.array[pointIndex] = zpos;
					pointIndex += points.geometry.attributes.position.itemSize;

				})

				mesh.geometry.verticesNeedUpdate = true;
				points.geometry.attributes.position.needsUpdate = true;

				model.clone(previousModel);
				model.rotation.z +=  rotationalVelocity * timestep;

				position.y += timestep*0.001;

				camera.lookAt(container.position);
				
			},

			fbm = function(vertex){
				var i,
					octaves = 3,
					total = 0,
					gain = 0.5,
					lacunarity = 2,
					frequency = 0.1,
					amplitude = gain;
				
				for (i = 0; i < octaves; ++i){
					total += simplex.noise2D(vertex.x * frequency, vertex.y * frequency) * amplitude;         
					frequency *= lacunarity;
					amplitude *= gain;
				}

				return total;
			},
			
			draw = function(interpolation){
				THREE.Quaternion.slerp ( previousModel.quaternion, model.quaternion, container.quaternion, interpolation );
			}

		return{
			init: init,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))