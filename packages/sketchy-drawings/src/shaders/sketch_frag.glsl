// The sketchy drawing: a screen-aligned quad that reads TEdge and TSurface at
// texture coordinates perturbed by TNoise. Edges and surface use different
// 2x2 matrices so the lines drift independently of the fill, and each extra
// stroke reads the edges at another offset so lines double up like pencil.
// Shading is screentone: a fixed grid of halftone dots over the model where
// it turns from the light, diagonal hatching over the darkest parts, and
// vertical hatching for the shadow on the ground.

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
uniform vec3 uPaper;
uniform float uDotSpacing;
uniform float uDotSize;
uniform float uHighlight;
uniform float uHatchThreshold;
uniform float uHatchSpacing;

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

	float shade = 0.0;
	vec2 fragment = gl_FragCoord.xy;

	if ( surface.g < 0.5 && surface.b > 0.5 ) {

		// model: halftone dots on a 45 degree screen, growing as the light falls off
		float darkness = clamp( ( uHighlight - surface.r ) / uHighlight, 0.0, 1.0 );
		if ( darkness > 0.0 ) {
			vec2 screen = mat2( 0.7071, 0.7071, -0.7071, 0.7071 ) * fragment / uDotSpacing;
			float distanceToDot = length( fract( screen ) - 0.5 );
			float radius = uDotSize * ( 0.75 + 0.25 * darkness );
			shade = 1.0 - smoothstep( radius - 0.08, radius + 0.08, distanceToDot );
		}

		// and diagonal hatching over the darkest parts
		if ( surface.r < uHatchThreshold ) {
			float jitter = texture2D( tNoise, noiseUv * 2.0 ).g * 3.0;
			float line = abs( fract( ( fragment.x - fragment.y + jitter ) / uHatchSpacing ) - 0.5 ) * uHatchSpacing;
			shade = max( shade, 1.0 - smoothstep( 0.3, 0.9, line ) );
		}

	} else if ( surface.r < 0.85 ) {

		// ground shadow: wobbly vertical hatching
		float jitter = ( texture2D( tNoise, vec2( fragment.x / uResolution.x * 6.0, fragment.y / uResolution.y * 0.5 ) + uNoiseShift ).r - 0.5 ) * 4.0;
		float line = abs( fract( ( fragment.x + jitter ) / uHatchSpacing ) - 0.5 ) * uHatchSpacing;
		shade = 1.0 - smoothstep( 0.5, 1.2, line );

	}

	gl_FragColor = vec4( mix( uPaper, uInk, max( shade, edge ) ), 1.0 );

	if ( uView > 0.5 ) {
		vec4 nd = texture2D( tNormalDepth, vUv );
		if ( uView < 1.5 ) gl_FragColor = texture2D( tSurface, vUv );
		else if ( uView < 2.5 ) gl_FragColor = vec4( vec3( 1.0 - texture2D( tEdge, vUv ).r ), 1.0 );
		else if ( uView < 3.5 ) gl_FragColor = vec4( nd.rgb, 1.0 );
		else gl_FragColor = vec4( vec3( nd.a ), 1.0 );
	}

}
