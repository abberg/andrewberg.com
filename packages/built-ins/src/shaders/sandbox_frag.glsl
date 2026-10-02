uniform float opacity;

varying vec3 vLightFront;

uniform sampler2D shadowMap[ MAX_SHADOWS ];
uniform vec2 shadowMapSize[ MAX_SHADOWS ];

uniform float shadowDarkness[ MAX_SHADOWS ];
uniform float shadowBias[ MAX_SHADOWS ];

varying vec4 vShadowCoord[ MAX_SHADOWS ];

float unpackDepth( const in vec4 rgba_depth ) {

	const vec4 bit_shift = vec4( 1.0 / ( 256.0 * 256.0 * 256.0 ), 1.0 / ( 256.0 * 256.0 ), 1.0 / 256.0, 1.0 );
	float depth = dot( rgba_depth, bit_shift );
	return depth;

}

uniform vec3 fogColor;

uniform float fogNear;
uniform float fogFar;


void main(){
	
	gl_FragColor = vec4( vec3 ( 1.0 ), opacity );

	gl_FragColor.xyz *= ((vLightFront*0.5)+0.5)*((vLightFront*0.5)+0.5);

	


	float fDepth;
	vec3 shadowColor = vec3( 1.0 );

	for( int i = 0; i < MAX_SHADOWS; i ++ ) {

		vec3 shadowCoord = vShadowCoord[ i ].xyz / vShadowCoord[ i ].w;

		// if ( something && something ) 		 breaks ATI OpenGL shader compiler
		// if ( all( something, something ) )  using this instead

		bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );
		bool inFrustum = all( inFrustumVec );

		// don't shadow pixels outside of light frustum
		// use just first frustum (for cascades)
		// don't shadow pixels behind far plane of light frustum

		bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );

		bool frustumTest = all( frustumTestVec );

		if ( frustumTest ) {

			shadowCoord.z += shadowBias[ i ];

			vec4 rgbaDepth = texture2D( shadowMap[ i ], shadowCoord.xy );
			float fDepth = unpackDepth( rgbaDepth );

			if ( fDepth < shadowCoord.z )

				// spot with multiple shadows is darker

				shadowColor = shadowColor * vec3( 1.0 - shadowDarkness[ i ] );

				// spot with multiple shadows has the same color as single shadow spot

				//shadowColor = min( shadowColor, vec3( shadowDarkness[ i ] ) );


		}

	}


	gl_FragColor.xyz = gl_FragColor.xyz * shadowColor;

	// Fog
	float depth = gl_FragCoord.z / gl_FragCoord.w;
	float fogFactor = smoothstep( fogNear, fogFar, depth );

	gl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );

}