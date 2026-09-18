
createMissile = function(){

	var missile,
		instance,
		geometry,
		material,
		mesh,
		_last;

	missile = Object.create(new THREE.Object3D(), {
		fire:{
			value:function(){
				var geometry,
					material;

				// start trail
				geometry = new THREE.Geometry();
				geometry.dynamic = true;
				for(i = 0; i < this.trailLength; i++){

					geometry.vertices.push(this.position.clone());
					geometry.vertices.push(this.position.clone());
					/*
					geometry.vertices.push(new THREE.Vector3(i*10, 10, 0));
					geometry.vertices.push(new THREE.Vector3(i*10, -10, 0));
					*/
					this.previousPositions[i].multiplyScalar(0);
				}
				material = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.7});
				material.side = THREE.DoubleSide;
				this.trail = new THREE.Ribbon( geometry, material );
				this.parent.add( this.trail );

				this.exploded = false;
			}
		},
		update:{
			value:function(pos){
				this.position.set(pos.x, pos.y, pos.z);

				if(!this.exploded){
					this.direction.subVectors(this.position, this.previousPositions[0]).add(this.position);
					this.lookAt(this.direction);
					this.previousPositions.unshift(this.previousPositions.splice(-1)[0].set(this.position.x, this.position.y, this.position.z));

					var previousPosition = this.previousPositions[0];
					var vl = this.trailLength*2;
					var taper = 40;
					for(var i = 0; i < vl; i+=2){
						var currentVertex1 = this.trail.geometry.vertices[i];
						var currentVertex2 = this.trail.geometry.vertices[i+1];
						var currentPosition = this.previousPositions[Math.floor(i*0.5)];
						var scale = 1;
						var width = 0.5;
						if(currentPosition.length() !== 0){

							if(i < taper){
								scale = i/taper;
							}
							width *= scale;

							currentVertex1.set(currentPosition.x, currentPosition.y+width, currentPosition.z);
							currentVertex2.set(currentPosition.x, currentPosition.y-width, currentPosition.z);

							previousPosition = currentPosition;
						}else{
							currentVertex1.set(previousPosition.x, previousPosition.y+width, previousPosition.z);
							currentVertex2.set(previousPosition.x, previousPosition.y-width, previousPosition.z);
						}

					}
					this.trail.geometry.verticesNeedUpdate = true;
				}

			}
		},
		explode:{
			value:function(){
				var geometry,
					material,
					mesh;

				// set off explosion
				geometry = new THREE.SphereGeometry( 10, 10, 8 );
				material = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:1.0, blending: THREE.AdditiveBlending});
				mesh = new THREE.Mesh( geometry, material );
				mesh.position = this.position.clone();
				this.parent.add( mesh );

				TweenLite.to(mesh.material, 1.0, {
					opacity:0,
					ease:Power3.easeOut,
					onUpdate:function(m){
						m.scale.multiplyScalar(1.01);
					},
					onUpdateParams:[mesh],
					onComplete:function(m){
						m.parent.remove(m);
					},
					onCompleteParams:[mesh]
				});

				// stop trail
				var trail = this.trail;
				TweenLite.to(trail.material, 1.5, {
					opacity:0,
					ease:Power4.easeIn,
					onUpdate:function(t){
						var scaleSpeed = 0.05;
						t.position.y += scaleSpeed;
					},
					onUpdateParams:[trail],
					onComplete:function(t){
						t.parent.remove(t);
					},
					onCompleteParams:[trail]
				});

				this.exploded = true;
			}
		}
	});

	instance = Object.create(missile, {
		direction:{
			value: new THREE.Vector3(),
			enumerable:		true
		},
		previousPositions:{
			value: [],
			writable:		true,
			enumerable:		true
		},
		trailLength:{
			value: 250,
			writable:		true,
			enumerable:		true
		},
		trail:{
			value: null,
			writable:		true,
			enumerable:		true
		},
		exploded:{
			value: false,
			writable:		true,
			enumerable:		true
		}
		/*
		prop:{
			value:,
			writable:		true,
			enumerable:		true,
			configurable:	true
		}
		*/
	});

	// create view...
	geometry = new THREE.SphereGeometry(0.5);
	material = new THREE.MeshPhongMaterial({color:0xff0000, specular:0xffffff, shininess:50});
	mesh = new THREE.Mesh(geometry, material);
	mesh.position.z = 1.5;
	mesh.scale.z = 1.5;
	instance.add(mesh);

	geometry = new THREE.CylinderGeometry(0.5, 0.5, 3);
	material = new THREE.MeshPhongMaterial({color:0xcccccc, specular:0xffffff, shininess:50});
	mesh = new THREE.Mesh(geometry, material);
	mesh.rotation.x = Math.PI*0.5;
	instance.add(mesh);

	// pre populate positions array
	for(i = 0; i < instance.trailLength; i++){
		instance.previousPositions.push(new THREE.Vector3());
	}

	return instance;
};