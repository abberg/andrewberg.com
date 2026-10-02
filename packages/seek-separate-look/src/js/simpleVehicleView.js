
var simpleVehicleView = {
	container:{
		writable: true,
		enumerable: true
	},
	cacheVec:{
		writable: true,
		enumerable: true
	},
	presentationModelUpdated:{
		value: function(model){
			this.container.position.set(model.position[0], model.position[1], model.position[2]);
			this.container.quaternion.set(model.orientation[0], model.orientation[1], model.orientation[2], model.orientation[3]);
			//var rollOrientation = steeringBehaviors.getRollOrientation(model);
			//this.container.quaternion.set(rollOrientation[0], rollOrientation[1], rollOrientation[2], rollOrientation[3]);
			this.container.updateMatrix();
		},
		writable: true,
		enumerable: true
	}
};

var createVehicleView = function(c){

	var config	= c || {},
		view	= Object.create(null, simpleVehicleView),
		geometry,
		material,
		body;

	view.container = config.container || new THREE.Object3D();
	view.container.useQuaternion = true;

	geometry = new THREE.CylinderGeometry( 0, 2, 3, 4, 1);
	material = new THREE.MeshLambertMaterial( { color: 0xffffff, shading:THREE.FlatShading} );
	body = new THREE.Mesh( geometry, material );
	//body.position.set(0, 0, -3);
	body.rotation.set(1.57,0,0);
	body.scale.set(1,2,0.3);
	view.container.add(body);

	//view.cacheVec = new THREE.Vector3();

	return view;
};