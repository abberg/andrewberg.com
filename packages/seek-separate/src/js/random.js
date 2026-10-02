function randomRange(min, max){
	return Math.random() * (max - min) + min;
}

function randomVec3(){
	var v = vec3.create();

	v[0] = Math.random()*2 - 1;
	v[1] = Math.random()*2 - 1;
	v[2] = Math.random()*2 - 1;
	
	vec3.normalize(v);
	return v;
}

function randomQuaternion(){
	var q = quat4.create(),
		sum = 0;
	q[0] = Math.random()*2 - 1;
	sum += q[0]*q[0];
	q[1] = Math.sqrt( 1-sum )*( Math.random()*2 - 1 );
	sum += q[1]*q[1];
	q[2] = Math.sqrt( 1-sum )*( Math.random()*2 - 1 );
	sum += q[2]*q[2];
	q[3] = Math.sqrt( 1-sum )*( Math.random() < 0.5 ? -1 : 1 );

	quat4.normalize(q);

	return q;
}