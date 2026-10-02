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
	lookSmoothing:{
		writable: true,
		enumerable:	true
	},
	bankStrength:{
		writable: true,
		enumerable:	true
	},
	maxBank:{
		writable: true,
		enumerable:	true
	},
	lookLead:{
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
				steeringBehaviors.lookAhead(currentVehicle, this.target, this.lookSmoothing, this.bankStrength, this.maxBank, this.lookLead);
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
	vg.separationWeight = 1.3;
	vg.lookSmoothing = 0.12;
	vg.bankStrength = 25;
	vg.maxBank = Math.PI / 3;
	vg.lookLead = 10;
	return vg;
};