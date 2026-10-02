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

	/*
	inBoidNeighborhood (const AbstractVehicle& other,
                    const float minDistance,
                    const float maxDistance,
                    const float cosMaxAngle)
{
    if (&other == this)
    {
        return false;
    }
    else
    {
        const Vec3 offset = other.position() - position();
        const float distanceSquared = offset.lengthSquared ();

        // definitely in neighborhood if inside minDistance sphere
        if (distanceSquared < (minDistance * minDistance))
        {
            return true;
        }
        else
        {
            // definitely not in neighborhood if outside maxDistance sphere
            if (distanceSquared > (maxDistance * maxDistance))
            {
                return false;
            }
            else
            {
                // otherwise, test angular offset from forward axis
                const Vec3 unitOffset = offset / sqrt (distanceSquared);
                const float forwardness = forward().dot (unitOffset);
                return forwardness > cosMaxAngle;
            }
        }
    }
}
	*/

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

	/*
	steerForSeparation (const float maxDistance,
                    const float cosMaxAngle,
                    const AVGroup& flock)
{
    // steering accumulator and count of neighbors, both initially zero
    Vec3 steering;
    int neighbors = 0;

    // for each of the other vehicles...
    for (AVIterator other = flock.begin(); other != flock.end(); other++)
    {
        if (inBoidNeighborhood (**other, radius()*3, maxDistance, cosMaxAngle))
        {
            // add in steering contribution
            // (opposite of the offset direction, divided once by distance
            // to normalize, divided another time to get 1/d falloff)
            const Vec3 offset = (**other).position() - position();
            const float distanceSquared = offset.dot(offset);
            steering += (offset / -distanceSquared);

            // count neighbors
            neighbors++;
        }
    }

    // divide by neighbors, then normalize to pure direction
    if (neighbors > 0) steering = (steering / (float)neighbors).normalize();

    return steering;
}
	*/

	separate: function(vehicle, group){
		var that = steeringBehaviors.separate,
			minDistance = 3,
			maxDistance = 10,
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
	}
};