
var simpleVehicleView = {
	container:{
		writable: true,
		enumerable: true
	},
	presentationModelUpdated:{
		value: function(position){
			this.container.position = position;
		},
		writable: true,
		enumerable: true
	}
};

var createVehicleView = function(c){

	var config	= c || {},
		view	= Object.create(null, simpleVehicleView);

	view.container = config.container || new THREE.Object3D();
		
	var geometry = new THREE.SphereGeometry( 1, 5, 3 );
	var material = new THREE.MeshLambertMaterial( { color:0xffffff , shading:THREE.FlatShading} );
	var sphere = new THREE.Mesh( geometry, material );
	view.container.add(sphere);

	return view;
};