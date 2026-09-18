var steeringBehaviors = {

	seek:(function(){

		var desired = new THREE.Vector3(),
			steer	= new THREE.Vector3();

		return function(target){

			desired.multiplyScalar(0);
			steer.multiplyScalar(0);

			desired.subVectors(target, this.position);
			desired.normalize();
			desired.multiplyScalar(this.maxspeed);
			steer.subVectors(desired, this.velocity);

			return steer;

		};
	}()),

	separate: (function(){

		var sum		= new THREE.Vector3(),
			diff	= new THREE.Vector3(),
			steer	= new THREE.Vector3();

		return function(vehicles){
			var desiredseparation = 9,
				count = 0,
				vl = vehicles.length,
				i,
				currentVehicle,
				distance;

			sum.multiplyScalar(0);
			diff.multiplyScalar(0);
			steer.multiplyScalar(0);

			for(i = 0; i < vl; i++){
				currentVehicle = vehicles[i];
				if(currentVehicle != this){
					distance = this.position.distanceTo(currentVehicle.position);
					if((distance > 0)&&(distance < desiredseparation)){
						diff.subVectors(this.position, currentVehicle.position);
						diff.normalize();
						diff.divideScalar(distance);
						sum.add(diff);
						count++;
					}
				}
			}

			if(count > 0){
				sum.divideScalar(count);
				sum.normalize();
				sum.multiplyScalar(this.maxspeed);
				steer.subVectors(sum, this.velocity);
			}

			return steer;
		};

	}()),

	cohere: (function(){

		var sum		= new THREE.Vector3(),
			diff	= new THREE.Vector3(),
			steer	= new THREE.Vector3();

		return function(vehicles){
			var desired = 7,
				count = 0,
				vl = vehicles.length,
				i,
				currentVehicle,
				distance;

			sum.multiplyScalar(0);
			diff.multiplyScalar(0);
			steer.multiplyScalar(0);

			for(i = 0; i < vl; i++){
				currentVehicle = vehicles[i];
				if(currentVehicle != this){
					distance = this.position.distanceTo(currentVehicle.position);
					if(distance > desired){
						diff.subVectors(currentVehicle.position, this.position);
						diff.normalize();
						diff.divideScalar(distance);
						sum.add(diff);
						count++;
					}
				}
			}

			if(count > 0){
				sum.divideScalar(count);
				sum.normalize();
				sum.multiplyScalar(this.maxspeed);
				steer.subVectors(sum, this.velocity);
			}

			return steer;
		};

	}()),

	avoidObstacles: (function(){

		var ray		= new THREE.Ray(),
			diff	= new THREE.Vector3(),
			sum		= new THREE.Vector3(),
			steer	= new THREE.Vector3();

		return function(obstacles){

			var i,
				ol = obstacles.length,
				currentObstacle,
				rayLength = 20,
				count = 0,
				_last;

			sum.multiplyScalar(0);
			diff.multiplyScalar(0);
			steer.multiplyScalar(0);

			ray.origin.copy(this.position);
			ray.direction.copy(this.velocity);
			ray.direction.normalize();

			for(i = 0; i < ol; i++){
				currentObstacle = obstacles[i];
				if(ray.isIntersectionPlane(currentObstacle) && Math.abs(ray.distanceToPlane(currentObstacle)) <= rayLength){
					sum.add(currentObstacle.normal);
					count++;
				}
			}

			if(count > 0){
				sum.divideScalar(count);
				sum.normalize();
				sum.multiplyScalar(this.maxspeed);
				steer.subVectors(sum, this.velocity);
			}

			return steer;

		};
	}()),

	addNoise: (function(){

		var desired = new THREE.Vector3(),
			steer	= new THREE.Vector3(),
			offsetY = Math.random() * 1000 - 500,
			offsetZ = Math.random() * 1000 - 500;

		return function(target){

			var noiseX = getNoise(this.position.x, this.position.y, this.position.z),
				noiseY = getNoise(this.position.x+offsetY, this.position.y+offsetY, this.position.z+offsetY),
				noiseZ = getNoise(this.position.x+offsetZ, this.position.y+offsetZ, this.position.z+offsetZ);

			desired.multiplyScalar(0);
			steer.multiplyScalar(0);

			desired.set(noiseX, noiseY, noiseZ);
			desired.normalize();
			desired.multiplyScalar(this.maxspeed);
			steer.subVectors(desired, this.velocity);

			return steer;

		};
	}())
};