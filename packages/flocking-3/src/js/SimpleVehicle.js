
var Vec3 = THREE.Vector3;

var simpleVehicle = {
	position:{
		writable: true,
		enumerable:	true
	},
	acceleration:{
		writable:	true,
		enumerable:	true
	},
	velocity:{
		writable:	true,
		enumerable:	true
	},
	max_velocity:{
		writable:	true,
		enumerable:	true
	},
	max_force:{
		writable:	true,
		enumerable:	true
	},
	mass:{
		writable:	true,
		enumerable:	true
	},
	//signal
	updated:{
		writable:	true,
		enumerable:	true
	},
	// methods
	update:{
		value: function(){
			this.velocity.addSelf(this.acceleration);
			if(this.velocity.length() > this.max_velocity){
				this.velocity.setLength(this.max_velocity);
			}
			this.position.addSelf(this.velocity);
			this.acceleration.set(0, 0, 0);
			this.updated.emit(this.position);
		}
	}

};

var createVehicle = function(c){
	
	var config	= c || {},
		vehicle = Object.create( null, simpleVehicle);

	vehicle.position		= config.position || new Vec3();
	vehicle.acceleration	= config.acceleration || new Vec3();
	vehicle.velocity		= config.velocity || new Vec3();
	vehicle.max_velocity	= config.max_velocity || 0.5;
	vehicle.max_force		= config.max_force || 0.01;
	vehicle.mass			= config.mass || 1;
	vehicle.updated			= createSignal();
	return vehicle;
};