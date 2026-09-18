(function(ab){
	"use strict";
	ab.sketch  = function(three){

		var scene = three.scene(),
			camera = three.camera(),
			renderer = three.renderer(),
			skulls = [],
            resolveReady,
			lines = [],
			t = 0.002,

			init = function(){
				
				var directionalLight = new THREE.DirectionalLight( 0xfffffff ),
					reflectedLight =  new THREE.DirectionalLight( 0xeeffff, 0.65 );

				scene.add(directionalLight);
				directionalLight.position.set( 0, 1, 0 );

				scene.add(reflectedLight);
				reflectedLight.position.set( 0, -1, 0 );

				renderer.setClearColor( 0xffffff );

				camera.position.z = 20;
				camera.rotation.y = Math.PI/2;
				return new Promise(function(resolve, reject){
                    resolveReady = resolve;
                    new THREE.OBJLoader().load(assetPath + 'skull.obj', populateScene, undefined, reject);
                });

			},

			populateScene = function(skull){
				
				var numSkulls = 40,
					i,
					currentSkull,
					curve,
					rot,
					z1,
					z2,
					numLines = 50,
					lineGeo,
					windCurve,
					j,
					windLine,
					colors;

				skull.children[0].material = new THREE.MeshLambertMaterial({wrapAround: true});
				skull.children[0].position.y = -2.5;
				skull.children[0].rotation.x = 0.2;
				
				for (i = 0; i < numSkulls; i++) {
					
					currentSkull = skull.clone();
					scene.add(currentSkull);

					z1 = Math.random() - 0.5;
					z2 = Math.random() * 2 - 1; 

					curve = new THREE.SplineCurve3([
						new THREE.Vector3( -20, 0, 0 ),
						new THREE.Vector3( -12, 1, z1 ),
						new THREE.Vector3( -8, 10 - Math.random() * 10, z2 ),
						new THREE.Vector3( 3, 10 - Math.random() * 10, z2 ),
						new THREE.Vector3( 12, 1, z1 ),
						new THREE.Vector3( 20, 0, 0 ),
					]);

					rot = Math.random() * Math.PI * 2;
					skull.rotation.set(rot, rot, rot);
					skulls.push({
						container:currentSkull, 
						rotationVelocity: 0.0003 + Math.random()*0.0005, 
						time: i/numSkulls, 
						curve: curve,
						maxScale: 1
					});
				};
				
				colors = [0xe3feff, 0xf8ffff, 0xf1ffff, 0xe3f7ff, 0xc8ddde];

				for(i = 0; i < numLines; i++){

					windCurve = new THREE.SplineCurve3( [
						new THREE.Vector3( -18 - ( Math.random() * 4 - 2 ), Math.random(), 3 ),
						new THREE.Vector3( -10 - ( Math.random() * 4 - 2 ), 2 + Math.random() * 4, 3 ),
						new THREE.Vector3( 6 + ( Math.random() * 4 - 2 ), -1 - Math.random() * 2, 3 ),
						new THREE.Vector3( 18 + ( Math.random() * 4 - 2 ), Math.random(), 3 ),
					] );

					lineGeo = new THREE.Geometry();
					for(j = 0; j < 70; j++){
						lineGeo.vertices.push(windCurve.getPoint(0));
					}

					var lw;
					if( Math.random() > 0.8 ){
						lw = 5 + Math.random() * 5;
					}else{
						lw = 1 + Math.random() * 2;
					}
					
					windLine = {
						line: new THREE.Line(lineGeo, new THREE.LineBasicMaterial( { color : colors[Math.floor(Math.random()*5)], linewidth: lw} ) ),
						curve: windCurve,
						time: 0,
						currentOffset: 0,
						offset: Math.random()*5000
					}

					lines.push(windLine);
					scene.add(windLine.line);

				}

				setTimeout(function(){
                    update(1000 / 60);
					camera.position.z = distanceToFitObjectInFrustum(scene, camera, renderer.domElement);
					camera.lookAt(new THREE.Vector3(0, 4, 0));
					window.addEventListener('resize', function(){
						camera.position.z = distanceToFitObjectInFrustum(scene, camera, renderer.domElement);
					});
				    resolveReady();
                }, 150);
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

				var scale;

				skulls.forEach( function( skull ){
					skull.time += t;
					if(skull.time > 1){
						skull.time = 0.01;
					}
					skull.container.position.copy(skull.curve.getPoint(skull.time));

					scale = Math.sin(skull.time * Math.PI) * skull.maxScale;
					
					skull.container.scale.set(scale, scale, scale)

					skull.container.rotation.x += skull.rotationVelocity * timestep;
					skull.container.rotation.y += skull.rotationVelocity * timestep;
					
				} );


				lines.forEach(function(windLine){
					if(windLine.currentOffset < windLine.offset){
				
						windLine.currentOffset += 1000/timestep;
					
					}else{

						windLine.time += 0.005;
						if(windLine.time > 1){
							windLine.time = 1;
						}

						for(var i = windLine.line.geometry.vertices.length-1; i > -1; i--){
							var currentVert = windLine.line.geometry.vertices[i];
							var nextVert = windLine.line.geometry.vertices[i-1];
							if(nextVert){
								currentVert.copy(nextVert);
							}else{
								currentVert.copy(windLine.curve.getPoint(windLine.time));
							}
						}

						if(windLine.line.geometry.vertices[windLine.line.geometry.vertices.length-1].distanceTo(windLine.curve.getPoint(1)) === 0){
							
							windLine.currentOffset = 0;
							windLine.time = 0;
							windLine.line.geometry.vertices.forEach(function(vertex){
								vertex.copy(windLine.curve.getPoint(windLine.time));
							});
							

						}

						windLine.line.geometry.verticesNeedUpdate = true;

					}
				})

			},
			
			draw = function(interpolation){
				
				renderer.render(scene, camera);
			}

		return{
			init: init,
			update: update,
			draw: draw
		}
	}

}(window.ab = window.ab || {}))