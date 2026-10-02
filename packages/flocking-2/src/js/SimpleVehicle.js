
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

					this.applyForce(this.flock(vehicles));
					this.updated.emit(this.position);
					this.acceleration.set(0, 0, 0);

				}
	},
	interpolate: {
		value: function (alpha, x0, x1){
			return x0 + ((x1 - x0) * alpha);
        }
    },
    // return component of vector parallel to a unit basis vector
    // (IMPORTANT NOTE: assumes "basis" has unit magnitude (length==1))
	parallelComponent:{
		value: function (vec3, unitBasis){
            var projection = vec3.dot(unitBasis);
            return unitBasis.multiplySelf(projection);
        }
	},

    // return component of vector perpendicular to a unit basis vector
    // (IMPORTANT NOTE: assumes "basis" has unit magnitude (length==1))
	perpendicularComponent:{
		value: function(vec3, unitBasis){
            return vec3.subSelf(this.parallelComponent(vec3, unitBasis));
        }
	},

    limitMaxDeviationAngle:{
		value: function (source, cosineOfConeAngle, basis){
			return this.vecLimitDeviationAngleUtility (true, source, cosineOfConeAngle, basis);
        }
    },
    // ----------------------------------------------------------------------------
	// Does a "ceiling" or "floor" operation on the angle by which a given vector
	// deviates from a given reference basis vector.  Consider a cone with "basis"
	// as its axis and slope of "cosineOfConeAngle".  The first argument controls
	// whether the "source" vector is forced to remain inside or outside of this
	// cone.  Called by vecLimitMaxDeviationAngle and vecLimitMinDeviationAngle.
	
	vecLimitDeviationAngleUtility:{
		value: function (insideOrOutside, source, cosineOfConeAngle, basis){
			// immediately return zero length input vectors
			var sourceLength = source.length();
			if (sourceLength === 0){
				return source;
			}
			// measure the angular diviation of "source" from "basis"
			var direction = new Vec3().clone(source).divideSelf(sourceLength);
			var cosineOfSourceAngle = direction.dot(basis);

			// Simply return "source" if it already meets the angle criteria.
			// (note: we hope this top "if" gets compiled out since the flag
			// is a constant when the function is inlined into its caller)
			if (insideOrOutside){
				// source vector is already inside the cone, just return it
				if (cosineOfSourceAngle >= cosineOfConeAngle){
					return source;
				}
			}else{
			// source vector is already outside the cone, just return it
				if (cosineOfSourceAngle <= cosineOfConeAngle){
					return source;
				}
			}

			// find the portion of "source" that is perpendicular to "basis"
			var perp = this.perpendicularComponent(source, basis);

			// normalize that perpendicular
			var unitPerp = perp.normalize ();

			// construct a new vector whose length equals the source vector,
			// and lies on the intersection of a plane (formed the source and
			// basis vectors) and a cone (whose axis is "basis" and whose
			// angle corresponds to cosineOfConeAngle)
			var perpDist = Math.sqrt(1 - (cosineOfConeAngle * cosineOfConeAngle));
			var c0 = basis.multiplyScalar(cosineOfConeAngle);
			var c1 = unitPerp.multiplyScalar(perpDist);
			return c0.addSelf(c1).multiplyScalar(sourceLength);
		}
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

			if ( this.velocity.length() > max_adjusted_speed || force === new Vec3(0, 0, 0)){
				return force;
			}else{
				range = this.velocity.length() / max_adjusted_speed;
				cosine = this.interpolate (Math.pow(range, 20), 1.0, -1.0);
				return this.limitMaxDeviationAngle (force, cosine, this.velocity);
				
			}

		}
	},
	applyForce:{
		value: function(forceVector){

			var adjustedForce = this.adjustForce(forceVector);

			if(adjustedForce.length() > this.max_force){
				adjustedForce.setLength(this.max_force);
			}
			// if force = mass * acceleration
			// then acceleration = force / mass
			this.acceleration.addSelf(adjustedForce.divideScalar(this.mass));

			this.velocity.addSelf(this.acceleration);
			if(this.velocity.length() > this.max_velocity){
				this.velocity.setLength(this.max_velocity);
			}
			
			this.position.addSelf(this.velocity);
		}
	},
	flock:{
		value: function(vehicles){

			
			var separationRadius = 5;
				separationAngle  = -0.5;
				separationWeight = 12;
				
				cohesionRadius = 20;
				cohesionAngle  = 0.1;
				cohesionWeight = 8;

				alignmentRadius = 10;
				alignmentAngle  = 0.5;
				alignmentWeight = 8;
				

			// removed broad phase proximity check,
			// could reimplement at some point...

			// determine each of the three component behaviors of flocking
			var separationVector = this.separation(separationRadius, separationAngle, vehicles);
			var cohesionVector = this.cohesion(cohesionRadius, cohesionAngle, vehicles);
			var alignmentVector = this.alignment(alignmentRadius, alignmentAngle, vehicles);

			// apply weights to components (save in variables for annotation)
			separationVector.multiplyScalar(separationWeight);
			cohesionVector.multiplyScalar(cohesionWeight);
			alignmentVector.multiplyScalar(alignmentWeight);
	
			return separationVector.addSelf(cohesionVector).addSelf(alignmentVector);
		}
	},
	inNeighborhood:{
		value:function(other, min_distance, max_distance, max_angle){

			var offset,
				distance_squared,
				unit_offset,
				forwardness;

			if (other === this){
				return false;
			}else{
				offset = new Vec3().sub(other.position, this.position);
				distance_squared = offset.lengthSq();
				// definitely in neighborhood if inside minDistance sphere
				if (distance_squared < (min_distance * min_distance)){
					return true;
				}else{
					// definitely not in neighborhood if outside maxDistance sphere
					if (distance_squared > (max_distance * max_distance)){
						return false;
					}else{
						// otherwise, test angular offset from forward axis
						unit_offset = offset.divideScalar(Math.sqrt(distance_squared));
						forwardness = this.velocity.dot(unit_offset);
						return forwardness > max_angle;
					}
				}
			}
		}
	},
	// Separation
	// Method checks for nearby vehicles and steers away
	separation:{
		value: function(max_distance, max_angle, vehicles){

			var separationVector = new Vec3(),
				vl = vehicles.length,
				count = 0,
				i,
				difference,
				distance_squared;
			
			// for each of the other vehicles...
			for (i = 0; i < vl; i+=1) {
				other = vehicles[i];
				
				// use inNeighborhood to determine if the other
				// is close and visible
				if (this.inNeighborhood (other, 1.2, max_distance, max_angle)) {
					
					// add in steering contribution
					// (opposite of the offset direction, divided once by distance
					// to normalize, divided another time to get 1/d falloff)
					difference = new Vec3().sub(other.position, this.position);
					distance_squared = difference.dot(difference);
					separationVector.addSelf(difference.divideScalar(-distance_squared));
					count++; // Keep track of how many
				}
			}
			
			// divide by neighbors, then normalize to pure direction
			if (count > 0) {
				separationVector.divideScalar(count).normalize();
				return separationVector;
			}
			
			return separationVector;
		}
	},
	cohesion:{
		value: function(max_distance, max_angle, vehicles){

			var cohesionVector = new Vec3(),
				i,
				count = 0,
				vl = vehicles.length,
				other;

			for (i = 0 ; i < vl; i++) {
				other = vehicles[i];
				if (this.inNeighborhood (other, 1.2, max_distance, max_angle)) {
					
					// accumulate sum of neighbor's positions
					cohesionVector.addSelf(other.position);
					count++;
				}
			}
			// divide by neighbors, subtract off current position to get error-
			// correcting direction, then normalize to pure direction
			if (count > 0) {
				cohesionVector.divideScalar(count).subSelf(this.position).normalize();
			}
			return cohesionVector;
		}
	},
	// Alignment
	// For every nearby boid in the system, calculate the average velocity
	alignment:{
		value: function(max_distance, max_angle, vehicles){
		
			var alignmentVector = new Vec3(0, 0, 0),
				i,
				count = 0,
				vl = vehicles.length,
				other;
			
			for (i = 0 ; i < vl; i++) {
				other = vehicles[i];
				if (this.inNeighborhood (other, 1.2, max_distance, max_angle)) {
					alignmentVector.addSelf(other.velocity);
					count++;
				}
			}
			
			if (count > 0) {
				// divide by neighbors, subtract off current heading to get error-
				// correcting direction, then normalize to pure direction
				alignmentVector.divideScalar(count).subSelf(this.velocity).normalize();
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
	vehicle.max_force		= config.max_force || 0.05;
	vehicle.mass			= config.mass || 1;
	vehicle.updated			= createSignal();
	return vehicle;
};