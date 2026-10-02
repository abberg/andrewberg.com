
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
	front:{
		writable: true,
		enumerable:	true
	},
	//signal
	updated:{
		writable:	true,
		enumerable:	true
	},
	// ----------------------------------------------------------------------------
	// adjust the steering force passed to applySteeringForce.
	//
	// allows a specific vehicle class to redefine this adjustment.
	// default is to disallow backward-facing steering at low speed.
	adjustForce:{
		value: function(force){
			
			var max_adjusted_speed = 0.2 * this.max_velocity,
				range,
				cosine;

			if ( vec3.length(this.velocity) > max_adjusted_speed || force === vec3.create([0,0,0])){
				return force;
			}else{
				range = vec3.length(this.velocity) / max_adjusted_speed;
				cosine = vecUtils.interpolate (Math.pow(range, 20), 1, -1);
				return vecUtils.limitMaxDeviationAngle (force, cosine, this.front);
			}

		}
	},
	update:{
		value: function(){

			// adjust acceleration force to prevent 180 flipping
			this.acceleration = this.adjustForce(this.acceleration);
			// divide acceleration by mass
			this.acceleration[0] /= this.mass;
			this.acceleration[1] /= this.mass;
			this.acceleration[2] /= this.mass;

			// add acceleration to velocity and limit if necessary
			vec3.add(this.velocity, this.acceleration);
			if(vec3.length(this.velocity) > this.max_velocity){
				vec3.normalize(this.velocity);
				vec3.scale(this.velocity, this.max_velocity);
			}

			// increment position
			vec3.add(this.position, this.velocity);

			// signal change
			this.updated.emit(this);
			
			// re-orient front vector
			vec3.set(this.velocity, this.front);
			vec3.normalize(this.front);
			// reset accleration;
			vec3.set(this.acceleration, [0,0,0]);


		}
	}

};

var createVehicle = function(c){
	
	var config	= c || {},
		vehicle = Object.create( Object.prototype, simpleVehicle);

	vehicle.position		= config.position		|| vec3.create();
	vehicle.acceleration	= config.acceleration	|| vec3.create();
	vehicle.velocity		= config.velocity		|| vec3.create();
	vehicle.min_velocity	= config.min_velocity	|| 1;
	vehicle.max_velocity	= config.max_velocity	|| 3;
	vehicle.max_force		= config.max_force		|| 0.09;
	vehicle.mass			= config.mass			|| 1;
	vehicle.front			= config.front			|| vec3.create([0, 0, 1]);
	vehicle.updated			= createSignal();
	
	return vehicle;
};