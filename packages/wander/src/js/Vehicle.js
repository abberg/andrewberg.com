
var Vehicle = (function(){
	"use strict";
	
	var constructor;

	constructor = function(){
		
	};

	constructor.prototype = {

		position: new THREE.Vector3(),
		acceleration: new THREE.Vector3(),
		velocity: new THREE.Vector3(),
		mass: 1,
		maxSpeed: 0.9,
		maxForce: 0.009,

		steeringDirection: new THREE.Vector3(),
		steeringForce: new THREE.Vector3(),

		forward: new THREE.Vector3(0, 0, 1),
		up: new THREE.Vector3(0, 1, 0),
		side: new THREE.Vector3(1, 0, 0),
		rotationMatrix: new THREE.Matrix4(),

		wanderDistance: 30,
		wanderStrength: 30,
		wanderFreqency: 1,
		wanderAmplitude: 0.1,
		wanderTheta: 0,
		wanderPhi: 0,
		wanderPosition: new THREE.Vector3(),
		wanderSpherePosition: new THREE.Vector3(),
		wanderTarget: new THREE.Vector3(),
		wanderCount: -1,

		update: function(){
			this.wander();

			this.steeringForce = this.limit(this.steeringDirection, this.maxForce);
			this.acceleration = this.steeringForce.divideScalar(this.mass);
			this.velocity = this.limit(this.velocity.addSelf(this.acceleration), this.maxSpeed);
			this.position.addSelf(this.velocity);

			var newForward		= this.velocity.clone(),
				globalUp		= new THREE.Vector3(0, 0.05, 0),
				accelUp			= this.acceleration.clone().multiplyScalar(6),
				bankUp			= new THREE.Vector3().add(globalUp, accelUp),
				approximateUp	= this.up.clone().addSelf(bankUp),
				newSide			= new THREE.Vector3(),
				newUp			= new THREE.Vector3();
			
			newForward.normalize();
			approximateUp.normalize();

			newSide.cross(approximateUp, newForward);
			newSide.normalize();
			
			newUp.cross(newForward, newSide);
			newUp.normalize();
			
			this.side = newSide;
			this.up = newUp;
			this.forward = newForward;
			
			this.rotationMatrix.set(this.side.x, this.up.x, this.forward.x, 0,
									this.side.y, this.up.y, this.forward.y, 0,
									this.side.z, this.up.z, this.forward.z, 0,
									0, 0, 0, 1);
						
			this.acceleration.set(0, 0, 0);
		},
		
		wander:function (){

			this.wanderCount += 1;

			if(this.wanderCount % this.wanderFreqency === 0){
				this.wanderPhi += this.getRandom(-this.wanderAmplitude, this.wanderAmplitude);
				this.wanderTheta += this.getRandom(-this.wanderAmplitude, this.wanderAmplitude);
				
				var x = Math.cos(this.wanderTheta) * Math.cos(this.wanderPhi) * this.wanderStrength,
					y = Math.cos(this.wanderTheta) * Math.sin(this.wanderPhi) * this.wanderStrength,
					z = Math.sin(this.wanderTheta) * this.wanderStrength;
				this.wanderPosition.set(x, y, z);
			}

			var wanderSphereDistance = this.velocity.clone();
			wanderSphereDistance.normalize();
			wanderSphereDistance.setLength(this.wanderDistance);

			this.wanderSpherePosition = this.position.clone();
			this.wanderSpherePosition.addSelf(wanderSphereDistance);

			this.wanderTarget.add(this.wanderSpherePosition, this.wanderPosition);

			var desiredVelocity = new THREE.Vector3().sub(this.wanderTarget, this.position);
			desiredVelocity.normalize();
			desiredVelocity.multiplyScalar(this.maxSpeed);
			this.steeringDirection.sub(desiredVelocity, this.velocity);

		},

		limit: function(vec3, max){
			var limitedVector3 = vec3.clone();
			if(limitedVector3.length() > max){
				limitedVector3.setLength(max);
			}
			return limitedVector3;
		},

		getRandom: function(min, max){  
			return Math.random() * (max - min) + min;  
		}
	};

	return constructor;

}());