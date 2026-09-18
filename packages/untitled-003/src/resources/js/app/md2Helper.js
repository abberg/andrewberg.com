
var createModel = function(ids, config){

	var container = new THREE.Object3D(),
		parser = new THREE.JSONLoader(),
		i,
		il,
		currentId,
		geometry,
		material,
		mesh,
		meshes = [],
		animationKeys,
		boundingBox = new THREE.Box3(),
		clock = new THREE.Clock(),
		_last;

	config = config || {};

	il = ids.length;
	for(i = 0; i < il; i++){
		currentId = ids[i];

		geometry = parser.parse( preloader.get(currentId)).geometry;
		geometry.computeMorphNormals();

		material = new THREE.MeshPhongMaterial({
			color:0xffffff,
			morphTargets: true,
			morphNormals:true,
			shading:THREE.FlatShading,
			wrapAround:true
		});

		mesh = new THREE.MorphAnimMesh( geometry, material );
		mesh.parseAnimations();

		if(!animationKeys){
			animationKeys = Object.keys(mesh.geometry.animations).splice(1);
		}

		mesh.castShadow = config.castShadow !== undefined ? config.castShadow : true;
		mesh.receiveShadow  = config.receiveShadow !== undefined ? config.receiveShadow  : true;

		mesh.rotation.y = Math.PI*0.5;
		container.add( mesh );

		mesh.geometry.computeBoundingBox();
		boundingBox.union(mesh.geometry.boundingBox);

		meshes.push(mesh);
	}

	container.playAnimation = function(key){
		var i,
			ml = meshes.length,
			currentMesh;

		if(this.currentAnimation != key){
			for( i = 0; i < ml; i++){
				currentMesh = meshes[i];
				currentMesh.playAnimation(key, 6);
			}

			this.currentAnimation = key;
		}

	};

	container.playRandomAnimation = function(animKeys){
		if(!animKeys){
			animKeys = animationKeys;
		}
		this.playAnimation(animKeys[getRandomInt(0, animKeys.length-1)]);
	};

	container.update = function(delta){
		// update based on time tick...
		var i,
			ml = meshes.length,
			currentMesh;

		delta = delta || clock.getDelta()*1000;

		for( i = 0; i < ml; i++){
			currentMesh = meshes[i];

			if(currentMesh.time + delta > currentMesh.duration && i === 0){
				// call loop callback
				this.onLoopComplete();
			}

			if(container.currentAnimation){
				currentMesh.updateAnimation( delta );
			}
		}

	};

	container.createHitbox = function(){
		var width		= boundingBox.max.x - boundingBox.min.x,
			height		= boundingBox.max.y - boundingBox.min.y,
			depth		= boundingBox.max.z - boundingBox.min.z,
			geometry	= new THREE.CubeGeometry(width, height, depth),
			mesh		= new THREE.Mesh(geometry);

		mesh.position = this.position.clone();
		mesh.userData.type = "hitbox";
		mesh.visible = false;
		mesh.onClick = function(){ container.onClick.apply(container); };
		this.parent.add(mesh);
	};

	// callback to be overridden
	container.onLoopComplete = function(){};
	container.onClick = function(){};

	return container;

};