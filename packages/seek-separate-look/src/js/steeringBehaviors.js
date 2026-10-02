var steeringBehaviors = {
	
	seek: function(vehicle, target){

		var that = steeringBehaviors.seek;
		if(that.steering === undefined){
			that.steering = vec3.create();
		}else{
			vec3.set([0,0,0], that.steering);
		}

		vec3.subtract(target, vehicle.position, that.steering);
		vec3.normalize(that.steering);
		vec3.scale(that.steering, vehicle.max_velocity);

		vec3.subtract(that.steering, vehicle.velocity);
		if(vec3.length(that.steering) > vehicle.max_force){
			vec3.normalize(that.steering);
			vec3.scale(that.steering, vehicle.max_force);
		}

		return that.steering;
	},

	inNeighboorhood:function(vehicle, other, minDistance, maxDistance, cosMaxAngle){

		var that = steeringBehaviors.inNeighboorhood,
			dist,
			distanceSquared,
			forwardness;

		if(that.offset === undefined){
			that.offset = vec3.create();
		}

		if(other === vehicle){
			return false;
		}else{
			vec3.subtract(other.position, vehicle.position, that.offset);
			dist = vec3.length(that.offset);
			distanceSquared = dist * dist;
			if(distanceSquared < minDistance){
				return true;
			}else{
				if(distanceSquared > maxDistance * maxDistance){
					return false;
				}else{
					vec3.normalize(that.offset);
					forwardness = vec3.dot(vehicle.front, that.offset);
					return forwardness > cosMaxAngle;
				}
			}
		}
	},

	separate: function(vehicle, group){
		var that = steeringBehaviors.separate,
			minDistance = 3,
			maxDistance = 16,
			cosMaxAngle = -1,
			neighbors = 0,
			gl = group.length,
			i = 0,
			distanceSquared;


		if(that.steering === undefined){
			that.steering = vec3.create();
			that.offset = vec3.create();
		}else{
			vec3.set([0,0,0], that.steering);
		}

		for(; i < gl; i++){
			var other = group[i];
			if(this.inNeighboorhood(vehicle, other, minDistance, maxDistance, cosMaxAngle)){
				// add in steering contribution
				// (opposite of the offset direction, divided once by distance
				// to normalize, divided another time to get 1/d falloff)
				vec3.subtract(other.position, vehicle.position, that.offset);
				distanceSquared = vec3.dot(that.offset, that.offset);
				that.offset[0] /= -distanceSquared;
				that.offset[1] /= -distanceSquared;
				that.offset[2] /= -distanceSquared;
				vec3.add(that.steering, that.offset);

				// count neighbors
				neighbors++;
			}
		}

		if(neighbors > 0){
			that.steering[0] /= neighbors;
			that.steering[1] /= neighbors;
			that.steering[2] /= neighbors;
			vec3.normalize(that.steering);
			vec3.scale(that.steering, vehicle.max_force);
		}
		return that.steering;
	},

	align:function(vehicle, targetQuaternion){

		var that = this.align,
			angle,
			s,
			slowRadius = 1,
			targetRadius = 0.01,
			targetSpeed,
			maxSpeed = 30;

		if(that.axis === undefined){
			that.currentQuaternion = quat4.create();
			that.axis = vec3.create();
			that.angularVelocity = vec3.create();
		}

		quat4.set(vehicle.orientation, that.currentQuaternion);
		// find the required rotation between the target and current quaternions.
		// The quaternion that would transform the start orientation to the target orientation is
		// q = (s * -1) * t;
		// where s is the current orientation, and t is the target quaternion.
		// conjugate is much faster than inverse
		quat4.conjugate(that.currentQuaternion);
		quat4.multiply(that.currentQuaternion, targetQuaternion);

		//split quat into axis angle
		angle = 2 * Math.acos(that.currentQuaternion[3]);
		s = Math.sqrt(1-that.currentQuaternion[3]*that.currentQuaternion[3]); // assuming quaternion normalised then w is less than 1, so term always positive.
		if (s < 0.001) { // test to avoid divide by zero, s is always positive due to sqrt
			// if s close to zero then direction of axis not important
			that.axis[0] = that.currentQuaternion[0]; // if it is important that axis is normalised then replace with x=1; y=z=0;
			that.axis[1] = that.currentQuaternion[1];
			that.axis[2] = that.currentQuaternion[2];
		} else {
			that.axis[0] = that.currentQuaternion[0] / s; // normalize axis
			that.axis[1] = that.currentQuaternion[1] / s;
			that.axis[2] = that.currentQuaternion[2] / s;
		}

		//If we are outside the slowRadius, then go max speed
		if (angle > slowRadius){
			targetSpeed = maxSpeed;
			//Otherwise calculate a scaled speed
		}else{
			targetSpeed = maxSpeed * angle / slowRadius;
		}

		vec3.scale(that.axis, targetSpeed, that.angularVelocity);
		return that.angularVelocity;
	},
	calculateOrientation:function(vector, vehicle){
		var that = this.calculateOrientation,
			halfAngle;

		if(that.baseOrientation === undefined){
			that.baseOrientation = quat4.create();
			that.orientation = quat4.create();
			that.baseZVector = vec3.create();
			that.inverseVector = vec3.create();
			that.axis = vec3.create();
		}

		quat4.set([0,0,0,1], that.baseOrientation);
		//quat4.multiply(that.baseOrientation, this.orientationInDirection(Math.atan2(vec3.length(vehicle.rotation), 10), [0,0,1]));

		vec3.negate(vector, that.inverseVector);

		vec3.set([0,0,1], that.baseZVector);
		quat4.multiplyVec3(that.baseOrientation, that.baseZVector);
		
		if(that.baseZVector === vector){
			quat4.set(baseOrientation, orientation);
			return orientation;
		}

		if(that.baseZVector === that.inverseVector){
			quat4.inverse(baseOrientation, orientation);
			return orientation;
		}
		
		vec3.cross(that.baseZVector, vector, that.axis);
		halfAngle = Math.acos(vec3.dot(that.baseZVector, vector)) * 0.5;
		vec3.normalize(that.axis);
	
		quat4.set([Math.sin(halfAngle)*that.axis[0], Math.sin(halfAngle)*that.axis[1], Math.sin(halfAngle)*that.axis[2], Math.cos(halfAngle)] , that.orientation);

		return that.orientation;
	},
	face:function(vehicle, target){
		
		var that = this.face,
			orientation;

		if(that.direction === undefined){
			that.direction = vec3.create();
		}

		vec3.subtract(target, vehicle.position, that.direction);
		if(vec3.length(that.direction) === 0){
			return that.direction;
		}
		vec3.normalize(that.direction);
		orientation = this.calculateOrientation(that.direction);
		return this.align(vehicle, orientation);

	},
	look: function(vehicle){
		var that = this.look,
			orientation;

		if(that.direction === undefined){
			that.direction = vec3.create();
		}

		vec3.set(vehicle.front, that.direction);
		orientation = this.calculateOrientation(that.direction, vehicle);
		return this.align(vehicle, orientation);
	},
	getRollOrientation:function(vehicle){
		/*
		// banking...

		var newForward = this.velocity.clone();
		newForward.normalize();
		
		var globalUp = new THREE.Vector3(0, 1, 0);
		var accelUp = this.acceleration.clone().multiplyScalar(6);
		var bankUp = new THREE.Vector3().add(globalUp, accelUp);
		var approximateUp = this.up.clone().addSelf(bankUp);
		approximateUp.normalize();

		var newSide = new THREE.Vector3().cross(approximateUp, newForward);
		newSide.normalize();
		
		var newUp = new THREE.Vector3().cross(newForward, newSide);
		newUp.normalize();
		
		this.side = newSide;
		this.up = newUp;
		this.forward = newForward;

		*/

		var that = this.getRollOrientation,
			currentUp,
			angle,
			x,
			y,
			z,
			w,
			w4;

		if(that.result === undefined){
			that.result = quat4.create();
			that.globalUp = vec3.create([0,1,0]);
			that.accelUp = vec3.create();
			that.newSide = vec3.create();
			that.newUp = vec3.create();
		}
		vec3.set(vehicle.acceleration, that.accelUp);
		vec3.scale(that.accelUp, 10);
		vec3.add(that.accelUp, that.globalUp);
		currentUp = [2 * (vehicle.orientation[0] * vehicle.orientation[1] - vehicle.orientation[3] * vehicle.orientation[2]), 1 - 2 * (vehicle.orientation[0] * vehicle.orientation[0] + vehicle.orientation[2] * vehicle.orientation[2]), 2 * (vehicle.orientation[1] * vehicle.orientation[2] + vehicle.orientation[3] * vehicle.orientation[0])];
		vec3.add(that.accelUp, currentUp);
		vec3.cross(that.accelUp, vehicle.front, that.newSide); // side
		vec3.normalize(that.newSide);
		vec3.cross(vehicle.front, that.newSide, that.newUp); // new up
		vec3.normalize(that.newUp);
		
		w = Math.sqrt(1.0 + that.newSide[0] + that.newUp[1] + vehicle.front[2]) / 2.0;
		w4 = (4 * w);
		x = (that.newUp[2] - vehicle.front[1]) / w4 ;
		y = (vehicle.front[0] - that.newSide[2]) / w4 ;
		z = (that.newSide[1] - that.newUp[0]) / w4 ;

		quat4.set([x, y, z, w],that.result);
		return that.result;
	},
	getFakeOrientation: function(vehicle, speedThreshold, rollScale){

		var that = this.getFakeOrientation,
			speed,
			fakeBlend,
			kinematicBlend,
			yaw,
			pitch,
			roll;

		if(that.result === undefined){
			that.result = quat4.create();
			that.temp = quat4.create();
		}

		speed = vec3.length(vehicle.velocity);
		if(speed < speedThreshold){
			if(speed === 0){
				return vehicle.orientation;
			}else{
				kinematicBlend = speed / speedThreshold;
				fakeBlend = 1.0 - kinematicBlend;
			}
		}else{
			fakeBlend = 1.0;
			kinematicBlend = 0;
		}

		quat4.multiply(vehicle.orientation, [0, 0, Math.sqrt(0.5), Math.sqrt(0.5)], that.temp);
		yaw = Math.atan2(2*(that.temp[3]*that.temp[0]+that.temp[1]*that.temp[2]), 1-2*(that.temp[0]*that.temp[0]+that.temp[1]*that.temp[1]));
		pitch = 0;//Math.asin(vehicle.velocity[1] / speed)*0.1;
		var rotationSpeed = vec3.length(vehicle.rotation);
		if(vehicle.velocity[0] +vehicle.velocity[1] + vehicle.velocity[2] < 0){
			rotationSpeed *= -1;
		}
		roll = Math.atan2(rotationSpeed, 10);

		//quat4.set(this.orientationInDirection(yaw, [0,1,0]), that.result);
		quat4.set(this.orientationInDirection(roll, [0,0,1]), that.result);
		quat4.multiply(that.result, this.orientationInDirection(pitch, [1,0,0]));
		quat4.multiply(that.result, this.orientationInDirection(yaw, [0,1,0]));

		return that.result;

	},
	orientationInDirection: function(angle, axis){

		var that = this.orientationInDirection,
			halfAngle = angle*0.5;
			sinAngle = Math.sin(halfAngle);

		if(that.result === undefined){
			that.result = quat4.create();
		}

		that.result[0] = axis[0] * sinAngle;
		that.result[1] = axis[1] * sinAngle;
		that.result[2] = axis[2] * sinAngle;
		that.result[3] = Math.cos(halfAngle);

		return that.result;
	}
};