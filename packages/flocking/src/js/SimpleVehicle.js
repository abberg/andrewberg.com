
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
		value: function(vehicles){

					this.flock(vehicles);

					this.velocity.addSelf(this.acceleration);
					if(this.velocity.length() > this.max_velocity){
						this.velocity.setLength(this.max_velocity);
					}
					this.position.addSelf(this.velocity);
					this.acceleration.set(0, 0, 0);
					this.updated.emit(this.position);
				}
	},
	applyForce:{
		value: function(forceVector){
			// if force = mass * acceleration
			// then acceleration = force / mass
			this.acceleration.addSelf(forceVector.divideScalar(this.mass));
		}
	},
	flock:{
		value: function(vehicles){
			var separationVector = this.separation(vehicles);
			var cohesionVector = this.cohesion(vehicles);
			var alignmentVector = this.alignment(vehicles);

			separationVector.multiplyScalar(2);
			cohesionVector.multiplyScalar(1);
			alignmentVector.multiplyScalar(1);

			this.applyForce(separationVector);
			this.applyForce(cohesionVector);
			this.applyForce(alignmentVector);
		}
	},
	steer:{
		value: function(target) {
			var steeringVector = new Vec3(0,0,0);
				
				// Normalize desired and give it magnitude determined by maxspeed
			target.normalize();
			target.multiplyScalar(this.max_velocity);
			// Steering = Desired minus Velocity
			steeringVector.sub(target, this.velocity);
			// Limit to maximum steering force
			if(steeringVector.length() > this.max_force){
				steeringVector.setLength(this.max_force);
			}
			
			return steeringVector;
		}
	},
	// Separation
	// Method checks for nearby vehicles and steers away
	separation:{
		value: function(vehicles){
			
			var desired_separation = 3,
				separationVector = new Vec3(),
				vl = vehicles.length,
				count = 0,
				i,
				distance,
				difference;
			
			// For every boid in the system, check if it's too close
			for (i = 0; i < vl; i+=1) {
				other = vehicles[i];
				distance = this.position.distanceTo(other.position);
				
				// If the distance is greater than 0 and less than an arbitrary amount (0 when you are yourself)
				if ((distance > 0) && (distance < desired_separation)) {
					
					// Calculate vector pointing away from neighbor
					difference = new Vec3().sub(this.position, other.position);
					difference.normalize();
					difference.divideScalar(distance);	// Weight by distance
					separationVector.addSelf(difference);
					count++;            // Keep track of how many
				}
			}
			
			// Average -- divide by how many
			if (count > 0) {
				separationVector.divideScalar(count);
				return this.steer(separationVector);
			}
			
			return separationVector;
		}
	},
	cohesion:{
		value: function(vehicles){
			var cohesionVector = new Vec3(),
				neighbordist = 20,
				i,
				count = 0,
				vl = vehicles.length,
				other,
				distance,
				difference;

			for (i = 0 ; i < vl; i++) {
				other = vehicles[i];
				distance = this.position.distanceTo(other.position);
				if (distance > 0 && distance < neighbordist) {
					difference = new Vec3().sub(other.position, this.position);
					difference.normalize();
					difference.divideScalar(distance);
					cohesionVector.addSelf(difference); // Add location
					count++;
				}
			}
			if (count > 0) {
				cohesionVector.divideScalar(count);
				return this.steer(cohesionVector);  // Steer towards the location
			}
			return cohesionVector;
		}
	},
	// Alignment
	// For every nearby boid in the system, calculate the average velocity
	alignment:{
		value: function(vehicles){
		
			var alignmentVector = new Vec3(0, 0, 0),
				neighbordist = 5,
				i,
				count = 0,
				vl = vehicles.length,
				other,
				distance;
			
			for (i = 0 ; i < vl; i++) {
				other = vehicles[i];
				distance = this.position.distanceTo(other.position);
				if (distance > 0 && distance < neighbordist) {
					alignmentVector.addSelf(other.velocity);
					count++;
				}
			}
			
			if (count > 0) {
				alignmentVector.divideScalar(count);
				return this.steer(alignmentVector);
			}

			return alignmentVector;
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