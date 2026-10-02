/**
 * @author mrdoob / http://mrdoob.com/
 * @author alteredq / http://alteredqualia.com/
 *
 * ShaderToon currently contains:
 *
 *	toon1
 *	toon2
 *	hatching
 *	dotted
 */

THREE.ShaderToon = {

'toon1' : {

	uniforms: THREE.UniformsUtils.merge( [

		THREE.UniformsLib[ "fog" ],
		THREE.UniformsLib[ "shadowmap" ],

		{
			"uDirLightPos":	{ type: "v3", value: new THREE.Vector3() },
			"uDirLightColor": { type: "c", value: new THREE.Color( 0xeeeeee ) },

			"uAmbientLightColor": { type: "c", value: new THREE.Color( 0x050505 ) },

			"uBaseColor":  { type: "c", value: new THREE.Color( 0xffffff ) }
		}
	]),

	vertexShader: [

		"varying vec3 vNormal;",
		"varying vec3 vRefract;",

		THREE.ShaderChunk[ "morphtarget_pars_vertex" ],
		THREE.ShaderChunk[ "shadowmap_pars_vertex" ],

		"void main() {",

			THREE.ShaderChunk[ "morphnormal_vertex" ],

			"vec4 mPosition = objectMatrix * vec4( position, 1.0 );",
			"vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
			"vec3 nWorld = normalize ( mat3( objectMatrix[0].xyz, objectMatrix[1].xyz, objectMatrix[2].xyz ) * normal );",

			"vNormal = transformedNormal;",

			"vec3 I = mPosition.xyz - cameraPosition;",
			"vRefract = refract( normalize( I ), nWorld, 1.02 );",

			"gl_Position = projectionMatrix * mvPosition;",

			THREE.ShaderChunk[ "morphtarget_vertex" ],
			THREE.ShaderChunk[ "shadowmap_vertex" ],

		"}"

	].join("\n"),

	fragmentShader: [


		THREE.ShaderChunk[ "shadowmap_pars_fragment" ],

		"uniform vec3 uBaseColor;",

		"uniform vec3 uDirLightPos;",
		"uniform vec3 uDirLightColor;",

		"uniform vec3 uAmbientLightColor;",

		"varying vec3 vNormal;",

		"varying vec3 vRefract;",

		"void main() {",

			"vec4 lDirection = viewMatrix * vec4( uDirLightPos, 0.0 );",
			"vec3 dirVector = normalize( lDirection.xyz );",

			"float directionalLightWeighting = max( dot( normalize( vNormal ), dirVector ), 0.0);",
			"vec3 lightWeighting = uAmbientLightColor + uDirLightColor * directionalLightWeighting;",

			"float intensity = smoothstep( - 0.5, 1.0, pow( length(lightWeighting), 20.0 ) );",
			"intensity += length(lightWeighting) * 0.2;",

			"float cameraWeighting = dot( normalize( vNormal ), vRefract );",
			"intensity += pow( 1.0 - length( cameraWeighting ), 6.0 );",
			"intensity = intensity * 0.2 + 0.3;",

			"if ( intensity < 0.50 ) {",

				"gl_FragColor = vec4( 2.0 * intensity * uBaseColor, 1.0 );",

			"} else {",

				"gl_FragColor = vec4( 1.0 - 2.0 * ( 1.0 - intensity ) * ( 1.0 - uBaseColor ), 1.0 );",

			"}",

			THREE.ShaderChunk[ "shadowmap_fragment" ],
			THREE.ShaderChunk[ "fog_fragment" ],

		"}"

	].join("\n")

},

'toon2' : {

	uniforms: THREE.UniformsUtils.merge( [

		THREE.UniformsLib[ "fog" ],
		THREE.UniformsLib[ "shadowmap" ],

		{
			"uDirLightPos":	{ type: "v3", value: new THREE.Vector3() },
			"uDirLightColor": { type: "c", value: new THREE.Color( 0xeeeeee ) },

			"uAmbientLightColor": { type: "c", value: new THREE.Color( 0x050505 ) },

			"uBaseColor":  { type: "c", value: new THREE.Color( 0xeeeeee ) },
			"uLineColor1": { type: "c", value: new THREE.Color( 0x808080 ) },
			"uLineColor2": { type: "c", value: new THREE.Color( 0x000000 ) },
			"uLineColor3": { type: "c", value: new THREE.Color( 0x000000 ) },
			"uLineColor4": { type: "c", value: new THREE.Color( 0x000000 ) }

	}]),

	vertexShader: [

		THREE.ShaderChunk[ "morphtarget_pars_vertex" ],
		THREE.ShaderChunk[ "shadowmap_pars_vertex" ],

		"varying vec3 vNormal;",

		"void main() {",

			THREE.ShaderChunk[ "morphnormal_vertex" ],

			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
			"vNormal = transformedNormal;",

			THREE.ShaderChunk[ "morphtarget_vertex" ],
			THREE.ShaderChunk[ "shadowmap_vertex" ],

		"}"

	].join("\n"),

	fragmentShader: [

		THREE.ShaderChunk[ "shadowmap_pars_fragment" ],

		"uniform vec3 uBaseColor;",
		"uniform vec3 uLineColor1;",
		"uniform vec3 uLineColor2;",
		"uniform vec3 uLineColor3;",
		"uniform vec3 uLineColor4;",

		"uniform vec3 uDirLightPos;",
		"uniform vec3 uDirLightColor;",

		"uniform vec3 uAmbientLightColor;",

		"varying vec3 vNormal;",

		"void main() {",

			"float camera = max( dot( normalize( vNormal ), vec3( 0.0, 0.0, 1.0 ) ), 0.4);",
			"float light = max( dot( normalize( vNormal ), normalize(uDirLightPos) ), 0.0);",

			"gl_FragColor = vec4( uBaseColor, 1.0 );",

			"if ( length(uAmbientLightColor + uDirLightColor * light) < 1.00 ) {",

				"gl_FragColor *= vec4( uLineColor1, 1.0 );",

			"}",

			"if ( length(uAmbientLightColor + uDirLightColor * camera) < 0.50 ) {",

				"gl_FragColor *= vec4( uLineColor2, 1.0 );",

			"}",

			THREE.ShaderChunk[ "shadowmap_fragment" ],
			THREE.ShaderChunk[ "fog_fragment" ],

		"}"

	].join("\n")

},

'hatching' : {

	uniforms: THREE.UniformsUtils.merge( [

		THREE.UniformsLib[ "fog" ],
		THREE.UniformsLib[ "shadowmap" ],
		
		{

			"uDirLightPos":	{ type: "v3", value: new THREE.Vector3() },
			"uDirLightColor": { type: "c", value: new THREE.Color( 0xeeeeee ) },

			"uAmbientLightColor": { type: "c", value: new THREE.Color( 0x050505 ) },

			"uBaseColor":  { type: "c", value: new THREE.Color( 0xffffff ) },
			"uLineColor1": { type: "c", value: new THREE.Color( 0x000000 ) },
			"uLineColor2": { type: "c", value: new THREE.Color( 0x000000 ) },
			"uLineColor3": { type: "c", value: new THREE.Color( 0x000000 ) },
			"uLineColor4": { type: "c", value: new THREE.Color( 0x000000 ) }

	}]),

	vertexShader: [

		THREE.ShaderChunk[ "morphtarget_pars_vertex" ],
		THREE.ShaderChunk[ "shadowmap_pars_vertex" ],

		"varying vec3 vNormal;",

		"void main() {",

			THREE.ShaderChunk[ "morphnormal_vertex" ],

			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
			"vNormal = transformedNormal;",

			THREE.ShaderChunk[ "morphtarget_vertex" ],
			THREE.ShaderChunk[ "shadowmap_vertex" ],

		"}"

	].join("\n"),

	fragmentShader: [

		THREE.ShaderChunk[ "shadowmap_pars_fragment" ],

		"uniform vec3 uBaseColor;",
		"uniform vec3 uLineColor1;",
		"uniform vec3 uLineColor2;",
		"uniform vec3 uLineColor3;",
		"uniform vec3 uLineColor4;",

		"uniform vec3 uDirLightPos;",
		"uniform vec3 uDirLightColor;",

		"uniform vec3 uAmbientLightColor;",

		"varying vec3 vNormal;",

		"void main() {",

			"float directionalLightWeighting = max( dot( normalize(vNormal), normalize(uDirLightPos) ), 0.0);",
			"vec3 lightWeighting = uAmbientLightColor + uDirLightColor * directionalLightWeighting;",

			"gl_FragColor = vec4( uBaseColor, 1.0 );",

			"if ( length(lightWeighting) < 1.00 ) {",

				"if ( mod(gl_FragCoord.x + gl_FragCoord.y, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor1, 1.0 );",

				"}",

			"}",

			"if ( length(lightWeighting) < 0.75 ) {",

				"if (mod(gl_FragCoord.x - gl_FragCoord.y, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor2, 1.0 );",

				"}",
			"}",

			"if ( length(lightWeighting) < 0.50 ) {",

				"if (mod(gl_FragCoord.x + gl_FragCoord.y - 5.0, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor3, 1.0 );",

				"}",
			"}",

			"if ( length(lightWeighting) < 0.3465 ) {",

				"if (mod(gl_FragCoord.x - gl_FragCoord.y - 5.0, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor4, 1.0 );",

				"}",
			"}",

			"#ifdef USE_SHADOWMAP",

			"float fDepth;",
			"vec3 shadowColor = vec3( 1.0 );",

			"for( int i = 0; i < MAX_SHADOWS; i ++ ) {",

				"vec3 shadowCoord = vShadowCoord[ i ].xyz / vShadowCoord[ i ].w;",

				// "if ( something && something )"		breaks ATI OpenGL shader compiler
				// "if ( all( something, something ) )"	using this instead

				"bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
				"bool inFrustum = all( inFrustumVec );",

				// don't shadow pixels outside of light frustum
				// use just first frustum (for cascades)
				// don't shadow pixels behind far plane of light frustum

				"bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",


				"bool frustumTest = all( frustumTestVec );",

				"if ( frustumTest ) {",

					"shadowCoord.z += shadowBias[ i ];",

					"vec4 rgbaDepth = texture2D( shadowMap[ i ], shadowCoord.xy );",
					"float fDepth = unpackDepth( rgbaDepth );",

					"if ( fDepth < shadowCoord.z )",

						// spot with multiple shadows is darker

						"shadowColor = shadowColor * vec3( 1.0 - shadowDarkness[ i ] );",

						// spot with multiple shadows has the same color as single shadow spot

						//"shadowColor = min( shadowColor, vec3( shadowDarkness[ i ] ) );",

				"}",

			"}",

			//"gl_FragColor.xyz = gl_FragColor.xyz * shadowColor;",

			"if ( length(shadowColor) < 1.00 ) {",

				"if ( mod(gl_FragCoord.x + gl_FragCoord.y, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor1, 1.0 );",

				"}",

			"}",

			"if ( length(shadowColor) < 0.75 ) {",

				"if (mod(gl_FragCoord.x - gl_FragCoord.y, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor2, 1.0 );",

				"}",
			"}",

			"if ( length(shadowColor) < 0.50 ) {",

				"if (mod(gl_FragCoord.x + gl_FragCoord.y - 5.0, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor3, 1.0 );",

				"}",
			"}",

			"if ( length(shadowColor) < 0.3465 ) {",

				"if (mod(gl_FragCoord.x - gl_FragCoord.y - 5.0, 10.0) == 0.0) {",

					"gl_FragColor = vec4( uLineColor4, 1.0 );",

				"}",
			"}",

		"#endif",
		
		THREE.ShaderChunk[ "fog_fragment" ],

		"}"

	].join("\n")

},

'dotted' : {

	uniforms: THREE.UniformsUtils.merge( [

		THREE.UniformsLib[ "fog" ],
		THREE.UniformsLib[ "shadowmap" ],
		
		{

			"uDirLightPos":	{ type: "v3", value: new THREE.Vector3() },
			"uDirLightColor": { type: "c", value: new THREE.Color( 0xeeeeee ) },

			"uAmbientLightColor": { type: "c", value: new THREE.Color( 0x050505 ) },

			"uBaseColor":  { type: "c", value: new THREE.Color( 0xffffff ) },
			"uLineColor1": { type: "c", value: new THREE.Color( 0x000000 ) }

	}]),

	vertexShader: [

		THREE.ShaderChunk[ "morphtarget_pars_vertex" ],
		THREE.ShaderChunk[ "shadowmap_pars_vertex" ],

		"varying vec3 vNormal;",

		"void main() {",

			THREE.ShaderChunk[ "morphnormal_vertex" ],

			"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
			"vNormal = transformedNormal;",

			THREE.ShaderChunk[ "morphtarget_vertex" ],
			THREE.ShaderChunk[ "shadowmap_vertex" ],

		"}"

	].join("\n"),

	fragmentShader: [

		THREE.ShaderChunk[ "shadowmap_pars_fragment" ],

		"uniform vec3 uBaseColor;",
		"uniform vec3 uLineColor1;",

		"uniform vec3 uDirLightPos;",
		"uniform vec3 uDirLightColor;",

		"uniform vec3 uAmbientLightColor;",

		"varying vec3 vNormal;",

		"void main() {",

			"float directionalLightWeighting = max( dot( normalize(vNormal), normalize(uDirLightPos) ), 0.0);",
			"vec3 lightWeighting = uAmbientLightColor + uDirLightColor * directionalLightWeighting;",

			"gl_FragColor = vec4( uBaseColor, 1.0 );",

			"if ( length(lightWeighting) < 1.00 ) {",

				"if ( ( mod(gl_FragCoord.x, 4.001) + mod(gl_FragCoord.y, 4.0) ) > 6.00 ) {",

					"gl_FragColor = vec4( uLineColor1, 1.0 );",

				"}",

			"}",

			"if ( length(lightWeighting) < 0.50 ) {",

				"if ( ( mod(gl_FragCoord.x + 2.0, 4.001) + mod(gl_FragCoord.y + 2.0, 4.0) ) > 6.00 ) {",

					"gl_FragColor = vec4( uLineColor1, 1.0 );",

				"}",

			"}",

			"#ifdef USE_SHADOWMAP",

			"float fDepth;",
			"vec3 shadowColor = vec3( 1.0 );",

			"for( int i = 0; i < MAX_SHADOWS; i ++ ) {",

				"vec3 shadowCoord = vShadowCoord[ i ].xyz / vShadowCoord[ i ].w;",

				// "if ( something && something )"		breaks ATI OpenGL shader compiler
				// "if ( all( something, something ) )"	using this instead

				"bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );",
				"bool inFrustum = all( inFrustumVec );",

				// don't shadow pixels outside of light frustum
				// use just first frustum (for cascades)
				// don't shadow pixels behind far plane of light frustum

				"bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );",


				"bool frustumTest = all( frustumTestVec );",

				"if ( frustumTest ) {",

					"shadowCoord.z += shadowBias[ i ];",

					"vec4 rgbaDepth = texture2D( shadowMap[ i ], shadowCoord.xy );",
					"float fDepth = unpackDepth( rgbaDepth );",

					"if ( fDepth < shadowCoord.z )",

						// spot with multiple shadows is darker

						"shadowColor = shadowColor * vec3( 1.0 - shadowDarkness[ i ] );",

						// spot with multiple shadows has the same color as single shadow spot

						//"shadowColor = min( shadowColor, vec3( shadowDarkness[ i ] ) );",

				"}",

			"}",

			//"gl_FragColor.xyz = gl_FragColor.xyz * shadowColor;",

			"if ( length(shadowColor) < 1.00 ) {",

				"if ( ( mod(gl_FragCoord.x, 4.001) + mod(gl_FragCoord.y, 4.0) ) > 6.00 ) {",

					"gl_FragColor = vec4( uLineColor1, 1.0 );",

				"}",

			"}",

			"if ( length(shadowColor) < 0.50 ) {",

				"if ( ( mod(gl_FragCoord.x + 2.0, 4.001) + mod(gl_FragCoord.y + 2.0, 4.0) ) > 6.00 ) {",

					"gl_FragColor = vec4( uLineColor1, 1.0 );",

				"}",

			"}",

		"#endif",
		
		THREE.ShaderChunk[ "fog_fragment" ],

		"}"

	].join("\n")

}

};
