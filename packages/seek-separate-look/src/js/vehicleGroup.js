var vehicleGroup = {
	vehicles:{
		writable: true,
		enumerable:	true
	},
	target:{
		writable: true,
		enumerable:	true
	},
	separationWeight:{
		writable: true,
		enumerable:	true
	},
	update:{
		value: function(){

			var vl = this.vehicles.length,
				i = 0,
				currentVehicle,
				steeringForce;

			for(; i < vl; i++){
				currentVehicle = this.vehicles[i];
				steeringForce = steeringBehaviors.seek(currentVehicle, this.target);
				vec3.add(steeringForce, vec3.scale(steeringBehaviors.separate(currentVehicle, this.vehicles), this.separationWeight));
				vec3.add(currentVehicle.acceleration, steeringForce);
				currentVehicle.rotation = steeringBehaviors.look(currentVehicle);
				//currentVehicle.rotation = steeringBehaviors.face(currentVehicle, this.target);
				currentVehicle.update();
			}

		}
	},
	reset:{
		value: function(){
			var vl = this.vehicles.length,
				i = 0,
				currentVehicle;

			for(; i < vl; i++){
				currentVehicle = this.vehicles[i];
				vec3.set([0,0,0], currentVehicle.acceleration);
			}
		}
	}
};

var createVehicleGroup = function(){
	var vg = Object.create(null, vehicleGroup);
	vg.vehicles = [];
	vg.target = vec3.create([0,0,0]);
	vg.separationWeight = 1.5;
	return vg;
};