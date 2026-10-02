DebugView = function(){
	
	THREE.Object3D.call( this );
	
	this.ship = new THREE.Object3D();
	this.ship.matrixAutoUpdate = false;
	//this.ship.useQuaternion  = true;
	this.add(this.ship);

	var geometry = new THREE.CylinderGeometry( 0, 2, 3, 4, 1);
	var material = new THREE.MeshLambertMaterial( { color: 0xffffff, shading:THREE.FlatShading} );
	var body = new THREE.Mesh( geometry, material );
	body.position.set(0, 0, -1.5);
	body.rotation.set(1.57,0,0);
	body.scale.set(1,1,0.3);
	this.ship.add( body );

	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex(new THREE.Vector3(0, 0, 2))];
	var material = new THREE.LineBasicMaterial( { color: 0xff0000, opacity: 1, linewidth: 1 } );
	this.sideLine = new THREE.Line(geometry, material);
	this.add(this.sideLine);

	var geometry = new THREE.CylinderGeometry( 0, 0.2, 0.7);
	var material = new THREE.MeshBasicMaterial( { color: 0xff0000} );
	var cone = new THREE.Mesh( geometry, material );
	cone.rotation.set(-1.57, 0, 0);
	cone.position.set(0, 0, -0.35);
	this.sideCone = new THREE.Object3D();
	this.sideCone.add(cone);
	this.add( this.sideCone );

	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex(new THREE.Vector3(0, 0, 2))];
	var material = new THREE.LineBasicMaterial( { color: 0x00ff00, opacity: 1, linewidth: 1 } );
	this.upLine = new THREE.Line(geometry, material);
	this.add(this.upLine);

	var geometry = new THREE.CylinderGeometry( 0, 0.2, 0.7);
	var material = new THREE.MeshBasicMaterial( { color: 0x00ff00} );
	var cone = new THREE.Mesh( geometry, material );
	cone.rotation.set(-1.57, 0, 0);
	cone.position.set(0, 0, -0.35);
	this.upCone = new THREE.Object3D();
	this.upCone.add(cone);
	this.add( this.upCone );
	
	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex(new THREE.Vector3(0, 0, 0))];
	var material = new THREE.LineBasicMaterial( { color: 0x0000ff, opacity: 1, linewidth: 1 } );
	this.velocityLine = new THREE.Line(geometry, material);
	this.add(this.velocityLine);

	var geometry = new THREE.CylinderGeometry( 0, 0.2, 0.7);
	var material = new THREE.MeshBasicMaterial( { color: 0x0000ff} );
	var cone = new THREE.Mesh( geometry, material );
	cone.rotation.set(-1.57, 0, 0);
	cone.position.set(0, 0, -0.35);
	this.velocityCone = new THREE.Object3D();
	this.velocityCone.add(cone);
	this.add( this.velocityCone );
	
	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex()];
	geometry.dynamic = true;
	var material = new THREE.LineBasicMaterial( { color: 0xffff00, opacity: 1, linewidth: 1 } );
	this.forceLine = new THREE.Line(geometry, material);
	this.add(this.forceLine);

	var geometry = new THREE.CylinderGeometry( 0, 0.2, 0.7);
	var material = new THREE.MeshBasicMaterial( { color: 0xffff00} );
	var cone = new THREE.Mesh( geometry, material );
	cone.rotation.set(-1.57, 0, 0);
	cone.position.set(0, 0, -0.35);
	this.forceCone = new THREE.Object3D();
	this.forceCone.add(cone);
	this.add( this.forceCone );
	
	this.trailLength = 75;
	var geometry1 = new THREE.Geometry();
	var geometry2 = new THREE.Geometry();
	this.previousPositions = new Array();
	for(var i = 0; i < this.trailLength; i++){
		geometry1.vertices.push(new THREE.Vertex());
		geometry2.vertices.push(new THREE.Vertex());
		this.previousPositions.push(new THREE.Vector3());
	}
	geometry1.dynamic = true;
	geometry2.dynamic = true;
	var material = new THREE.LineBasicMaterial( { color: 0x999999, opacity: 0.5, linewidth: 2 } );
	this.trailLeft = new THREE.Line(geometry1, material);
	this.add(this.trailLeft);
	this.trailRight = new THREE.Line(geometry2, material);
	this.add(this.trailRight);

	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex()];
	geometry.dynamic = true;
	var material = new THREE.LineBasicMaterial( { color: 0x0000ff, opacity: 0.25, linewidth: 2 } );
	this.wanderBoundryLeft = new THREE.Line(geometry, material);
	this.add(this.wanderBoundryLeft);

	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex()];
	geometry.dynamic = true;
	var material = new THREE.LineBasicMaterial( { color: 0x0000ff, opacity: 0.25, linewidth: 2 } );
	this.wanderBoundryRight = new THREE.Line(geometry, material);
	this.add(this.wanderBoundryRight);

	var geometry = new THREE.SphereGeometry( 1, 8, 8);
	var material = new THREE.MeshBasicMaterial( { color: 0x0000ff, transparent:true, opacity: 0.25} );
	this.wanderSphere = new THREE.Mesh( geometry, material );
	this.add( this.wanderSphere );

	var geometry = new THREE.SphereGeometry( 1, 8, 8);
	var material = new THREE.MeshBasicMaterial( { color: 0xff00ff} );
	this.wanderTarget = new THREE.Mesh( geometry, material );
	this.add( this.wanderTarget );
	
	var geometry = new THREE.Geometry();
	geometry.vertices = [new THREE.Vertex( new THREE.Vector3() ), new THREE.Vertex()];
	geometry.dynamic = true;
	var material = new THREE.LineBasicMaterial( { color: 0xff00ff, opacity: 1, linewidth: 1 } );
	this.wanderLine = new THREE.Line(geometry, material);
	this.add(this.wanderLine);

	this.model = null;
	this.center = new THREE.Vector3(0, 0, 0);
}

DebugView.prototype = new THREE.Object3D();
DebugView.prototype.constructor = DebugView;
DebugView.prototype.supr = THREE.Object3D.prototype;


DebugView.prototype.setModel = function (m){
	this.model = m;
}

DebugView.prototype.modelUpdated = function(){
	
	this.position = this.model.position;
	this.ship.matrix = this.model.rotationMatrix;

	this.sideLine.geometry.vertices[1].position = this.model.side;
	this.sideLine.geometry.__dirtyVertices = true;
	this.sideCone.position = this.model.side;
	this.sideCone.lookAt(this.center);
	
	this.upLine.geometry.vertices[1].position = this.model.up;
	this.upLine.geometry.__dirtyVertices = true;
	this.upCone.position = this.model.up;
	this.upCone.lookAt(this.center);
	
	this.velocityLine.geometry.vertices[1].position = this.model.velocity;
	this.velocityLine.geometry.__dirtyVertices = true;
	this.velocityCone.position = this.model.velocity;
	this.velocityCone.lookAt(this.center);

	this.forceLine.geometry.vertices[1].position = this.model.steeringDirection;
	this.forceLine.geometry.__dirtyVertices = true;
	this.forceCone.position = this.model.steeringDirection;
	
	if(this.model.steeringDirection.isZero()){
		this.forceCone.lookAt(new THREE.Vector3(0, 0, -1));
	}else{
		this.forceCone.lookAt(this.center);
	}
	
	this.previousPositions.unshift(this.position.clone());
	this.previousPositions.splice(-1, 1);
	var offsetX = this.model.side.clone().setLength(2.1);
	var offsetZ = new THREE.Vector3().sub(this.position, this.model.forward.clone().setLength(-3.1));
	for(var i = 0; i < this.trailLength; i++){
		var difference = new THREE.Vector3().sub(this.previousPositions[i], offsetZ);
		this.trailLeft.geometry.vertices[i].position.add(difference, offsetX);
		this.trailRight.geometry.vertices[i].position.sub(difference, offsetX);	
	}
	this.trailRight.geometry.__dirtyVertices = this.trailLeft.geometry.__dirtyVertices = true;

	this.wanderSphere.scale.set(this.model.wanderStrength, this.model.wanderStrength, this.model.wanderStrength);
	this.wanderSphere.position.sub(this.model.wanderSpherePosition, this.position);

	var offset = this.model.side.clone().setLength(this.model.wanderStrength);
	var leftBoundry = new THREE.Vector3().add(this.wanderSphere.position, offset);
	this.wanderBoundryLeft.geometry.vertices[1].position = leftBoundry.multiplyScalar(1.3);
	this.wanderBoundryLeft.geometry.__dirtyVertices = true;
	var rightBoundry = new THREE.Vector3().sub(this.wanderSphere.position, offset);
	this.wanderBoundryRight.geometry.vertices[1].position = rightBoundry.multiplyScalar(1.3);
	this.wanderBoundryRight.geometry.__dirtyVertices = true;

	this.wanderTarget.position = new THREE.Vector3().sub(this.model.wanderTarget, this.position);
	this.wanderTarget.scale.set(this.model.wanderAmplitude, this.model.wanderAmplitude, this.model.wanderAmplitude);
	this.wanderLine.geometry.vertices[1].position = this.wanderTarget.position;
	this.wanderLine.geometry.__dirtyVertices = true;
}
