var createEnvironment = function(scene){

	var directionalLight,
		lensFlare,
		textureFlare0,
		textureFlare1,
		textureFlare2,
		dLightHelper,
		geometry,
		material,
		mesh,
		cubeImages,
		skyboxTexture,
		shader;

	// direction light for sun
	directionalLight = new THREE.DirectionalLight( 0xffffff);
	directionalLight.position.set(400, 300, 400);

	directionalLight.castShadow = true;
	directionalLight.shadowMapWidth = directionalLight.shadowMapHeight = 1024;

	/*
	directionalLight.shadowCameraNear	=  500;
	directionalLight.shadowCameraFar	=  1000;
	directionalLight.shadowCameraLeft	= -150;
	directionalLight.shadowCameraRight	=  150;
	directionalLight.shadowCameraTop	=  150;
	directionalLight.shadowCameraBottom = -150;
	*/
	directionalLight.name = 'sun';
	scene.add( directionalLight );

	//dLightHelper = new THREE.DirectionalLightHelper(directionalLight);
	//scene.add(dLightHelper);

	//lens flare
	textureFlare0 = new THREE.Texture(preloader.get('flare0'));
	textureFlare1 = new THREE.Texture(preloader.get('flare1'));
	textureFlare2 = new THREE.Texture(preloader.get('flare2'));

	textureFlare0.needsUpdate = true;
	textureFlare1.needsUpdate = true;
	textureFlare2.needsUpdate = true;

	lensFlare = new THREE.LensFlare();
	lensFlare.add( textureFlare0, 500, 0.0, THREE.AdditiveBlending, undefined, 0.5 )
	lensFlare.add( textureFlare1, 4000, 0.3, THREE.AdditiveBlending );
	lensFlare.add( textureFlare2, 300, 0.4, THREE.AdditiveBlending );
	lensFlare.add( textureFlare1, 1000, 0.47, THREE.AdditiveBlending, undefined, 0.3 );
	lensFlare.add( textureFlare1, 1000, 0.46, THREE.AdditiveBlending );
	lensFlare.add( textureFlare2, 200, 0.76, THREE.AdditiveBlending );
	lensFlare.add( textureFlare2, 150, 0.84, THREE.AdditiveBlending );
	lensFlare.add( textureFlare1, 500, 1.0, THREE.AdditiveBlending );

	lensFlare.customUpdateCallback = lensFlareUpdateCallback;
	lensFlare.position = directionalLight.position;

	scene.add( lensFlare );

	// ground
	scene.add(createGround());

	// skybox
	cubeImages = [
		preloader.get('px'), preloader.get('nx'),
		preloader.get('py'), preloader.get('ny'),
		preloader.get('pz'), preloader.get('nz')
	];

	skyboxTexture = new THREE.Texture(cubeImages);
	skyboxTexture.flipY = false;
	skyboxTexture.needsUpdate = true;

	shader = THREE.ShaderLib[ "cube" ];
	shader.uniforms[ "tCube" ].value = skyboxTexture;

	material = new THREE.ShaderMaterial( {
		fragmentShader: shader.fragmentShader,
		vertexShader: shader.vertexShader,
		uniforms: shader.uniforms,
		depthWrite: false,
		side: THREE.BackSide
	} );


	mesh = new THREE.Mesh( new THREE.CubeGeometry( 1000, 1000, 1000 ), material );
	mesh.id = "sky";
	scene.add( mesh );

	// fog
	scene.fog = new THREE.Fog( 0x888888, 100, 1000 );

};

createGround = function(){

	var data = preloader.get('heightmap'),
		width = 366,
		depth = 331,
		scale = 0.111106088574,
		geometry = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1),
		material = new THREE.MeshLambertMaterial( { color:0xdddddd} ),
		mesh = new THREE.Mesh(geometry, material),
		gl = mesh.geometry.vertices.length,
		i;

	for ( i = 0; i < gl; i++ ){
		mesh.geometry.vertices[i].z = data[i] * scale + 1;
	}

	mesh.geometry.computeFaceNormals();
	mesh.geometry.computeVertexNormals();


	mesh.rotation.x = -Math.PI/2;
	mesh.rotation.z = -Math.PI;
	mesh.scale.set(2.9, 2.9, 2.9);

	mesh.castShadow = true;
	mesh.receiveShadow = true;

	return mesh;
};

lensFlareUpdateCallback = function(object) {

	var f, fl = object.lensFlares.length;
	var flare;
	var vecX = -object.positionScreen.x * 2;
	var vecY = -object.positionScreen.y * 2;


	for( f = 0; f < fl; f++ ) {

		   flare = object.lensFlares[ f ];

		   flare.x = object.positionScreen.x + vecX * flare.distance;
		   flare.y = object.positionScreen.y + vecY * flare.distance;

		   flare.rotation = 0;

	}

	object.lensFlares[ 3 ].y -= 0.0;
	object.lensFlares[ 4 ].y -= 0.0;
	object.lensFlares[ 7 ].y -= 0.13;

	object.lensFlares[ 3 ].rotation = object.positionScreen.x * 0.5 + THREE.Math.degToRad( 45 );

}