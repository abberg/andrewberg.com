var simpleVehicle = {
	update:function(interpolate){

		interpolate = interpolate || 0;

		// limit helper function
		var limit = function(vec, max){
			if(vec.length() > max){
				vec.setLength(max);
			}
			return vec;
		};

		limit(this.acceleration, this.maxforce);
		this.acceleration.multiplyScalar(interpolate);
		this.velocity.add(this.acceleration);
		limit(this.velocity,this.maxspeed);
		this.position.add(this.velocity);

		// pipe out update to view...
		this.updated.emit(this.position);

		this.acceleration.multiplyScalar(0);

	},
	applyForce:function(force){
		this.acceleration.add(force.divideScalar(this.mass));
	}
};

createSimpleVehicle = function(config){

	config = config || {};

	return Object.create(simpleVehicle, {
		position: {
			value: config.position || new THREE.Vector3(),
			writable: true,
			enumerable: true
		},
		acceleration: {
			value: config.acceleration || new THREE.Vector3(),
			writable: true,
			enumerable: true
		},
		velocity: {
			value: config.velocity || new THREE.Vector3(),
			writable: true,
			enumerable: true
		},
		maxspeed: {
			value: config.maxspeed || 1,
			writable: true,
			enumerable: true
		},
		maxforce: {
			value: config.maxforce || 0.1,
			writable: true,
			enumerable: true
		},
		mass:{
			value: config.mass || 1,
			writable:true,
			enumerable:true
		},
		updated:{
			value: Object.create(signal, {slots:{value:[], writable:true, enumerable:true}}),
			enumerable: true
		}
	});
};