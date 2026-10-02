// Simple surface style (TSurface): flat fill with a single shade step where
// the model turns away from the light or falls in shadow, then fog.

uniform vec3 uFill;
uniform vec3 uShade;
uniform float uShadeThreshold;

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

	float light = dot( vLightFront, vec3( 0.333 ) );

	for( int i = 0; i < MAX_SHADOWS; i ++ ) {

		vec3 shadowCoord = vShadowCoord[ i ].xyz / vShadowCoord[ i ].w;

		bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );
		bool inFrustum = all( inFrustumVec );

		bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );
		bool frustumTest = all( frustumTestVec );

		if ( frustumTest ) {

			shadowCoord.z += shadowBias[ i ];

			float fDepth = unpackDepth( texture2D( shadowMap[ i ], shadowCoord.xy ) );

			if ( fDepth < shadowCoord.z )
				light = 0.0;

		}

	}

	gl_FragColor = vec4( light > uShadeThreshold ? uFill : uShade, 1.0 );

	// Fog
	float depth = gl_FragCoord.z / gl_FragCoord.w;
	float fogFactor = smoothstep( fogNear, fogFar, depth );

	gl_FragColor = mix( gl_FragColor, vec4( fogColor, gl_FragColor.w ), fogFactor );

}
