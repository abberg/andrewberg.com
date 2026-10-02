// The sketchy drawing: a screen-aligned quad that reads TEdge and TSurface at
// texture coordinates perturbed by TNoise. Edges and surface use different
// 2x2 matrices so the lines drift independently of the fill, and each extra
// stroke reads the edges at another offset so lines double up like pencil.

uniform sampler2D tSurface;
uniform sampler2D tEdge;
uniform sampler2D tNoise;
uniform sampler2D tNormalDepth;

// 0 the drawing, 1 TSurface, 2 TEdge, 3 normals, 4 depth
uniform float uView;

uniform vec2 uResolution;
uniform float uWobble;
uniform float uNoiseScale;
uniform vec2 uNoiseShift;
uniform float uStrokes;
uniform vec3 uInk;

varying vec2 vUv;

const mat2 edgeMatrix = mat2( 0.9, 0.35, -0.25, 1.1 );
const mat2 surfaceMatrix = mat2( 1.2, -0.4, 0.3, 0.8 );

vec2 noise( vec2 uv ) {
	return texture2D( tNoise, uv ).rg * 2.0 - 1.0;
}

void main(){

	vec2 aspect = vec2( uResolution.x / uResolution.y, 1.0 );
	vec2 noiseUv = vUv * aspect * uNoiseScale + uNoiseShift;
	vec2 pixel = 1.0 / uResolution;

	float edge = 0.0;
	for ( int i = 0; i < 3; i ++ ) {
		if ( float( i ) >= uStrokes ) break;
		vec2 offset = edgeMatrix * noise( noiseUv + float( i ) * vec2( 0.37, 0.61 ) ) * uWobble * pixel;
		float strength = i == 0 ? 1.0 : 0.65;
		edge = max( edge, texture2D( tEdge, vUv + offset ).r * strength );
	}

	vec2 surfaceOffset = surfaceMatrix * ( texture2D( tNoise, noiseUv + vec2( 0.53, 0.17 ) ).ba * 2.0 - 1.0 ) * uWobble * pixel;
	vec3 surface = texture2D( tSurface, vUv + surfaceOffset ).rgb;

	// a little paper grain
	surface *= 0.97 + 0.03 * texture2D( tNoise, vUv * aspect * 23.0 ).b;

	gl_FragColor = vec4( mix( surface, uInk, edge ), 1.0 );

	if ( uView > 0.5 ) {
		vec4 nd = texture2D( tNormalDepth, vUv );
		if ( uView < 1.5 ) gl_FragColor = texture2D( tSurface, vUv );
		else if ( uView < 2.5 ) gl_FragColor = vec4( vec3( 1.0 - texture2D( tEdge, vUv ).r ), 1.0 );
		else if ( uView < 3.5 ) gl_FragColor = vec4( nd.rgb, 1.0 );
		else gl_FragColor = vec4( vec3( nd.a ), 1.0 );
	}

}
