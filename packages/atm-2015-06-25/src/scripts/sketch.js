(function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			cameraTarget = new THREE.Object3D(),
			tempPostition = new THREE.Vector3(),
			container,
			model,
			previousModel,

			init = function(){
				var geometry,
					material,
					mesh,
					directionalLight = new THREE.DirectionalLight( 0xffffff ),
					bounceLight = new THREE.DirectionalLight( 0xbcc4b7, 0.7),
					pickRandomColor = function(){
						var num = Math.floor( Math.random() * 50 );

						return new THREE.Color('rgb('+(68+num)+', '+(55+num)+', '+(20+num)+')');
					}

				renderer.setClearColor( 0x333333 );

				geometry = new THREE.SphereGeometry( 500 );
				material = new THREE.MeshPhongMaterial( { 
									color: 0xffffed, 
									side:THREE.BackSide, 
									wrapAround:true,
									wrapRGB: new THREE.Vector3(1, 1, 1)
								} );
				mesh = new THREE.Mesh(geometry, material);
				scene.add(mesh);

				container = new THREE.Object3D();
				model = new THREE.Object3D();
				previousModel = model.clone();
				scene.add( container );

				geometry = new THREE.BoxGeometry( 1, 1, 1 );

				for(var i = 0; i < 800; i++){
					material = new THREE.MeshLambertMaterial({color:pickRandomColor()});
					mesh = new THREE.Mesh(geometry, material);
					mesh.scale.z = 35 + Math.random() * 15;
					mesh.scale.x = mesh.scale.y = 0.2 + Math.random()*3
					mesh.rotation.x = Math.random() * Math.PI;
					mesh.rotation.y = Math.random() * Math.PI;
					container.add(mesh);
				}

				scene.add(directionalLight);
				directionalLight.position.set( 1, 1, 1 );

				scene.add(bounceLight);
				bounceLight.position.set( -1, -1, -1 );

				camera.position.z = 300;
				cameraTarget.position.z = distanceToFitObjectInFrustum(container, camera, renderer.domElement) - 15;

				window.addEventListener('resize', function(){
					cameraTarget.position.z = distanceToFitObjectInFrustum(container, camera, renderer.domElement)  - 15;
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
				var rotationVelocity = 0.0005;
				
				model.clone(previousModel);
				model.rotation.x += rotationVelocity/2 * timestep;
				model.rotation.y += rotationVelocity * timestep;

				 // ( target - current ) / easing
				tempPostition.subVectors(cameraTarget.position, camera.position).multiplyScalar(0.05);
				camera.position.add(tempPostition);
				
			},
			
			draw = function(interpolation){
				THREE.Quaternion.slerp ( previousModel.quaternion, model.quaternion, container.quaternion, interpolation );
				renderer.render(scene, camera);
			}

		return{
			init: init,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))