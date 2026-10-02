// Visually important edges (TEdge): a Sobel filter over the normal and depth
// buffer. Creases show up as jumps in the normal, silhouettes as jumps in
// depth (measured relative to depth so distant objects still get lines).

uniform sampler2D tNormalDepth;
uniform vec2 uTexel;
uniform float uNormalThreshold;
uniform float uDepthThreshold;

varying vec2 vUv;

vec4 tap( float x, float y ) {
	return texture2D( tNormalDepth, vUv + vec2( x, y ) * uTexel );
}

void main(){

	vec4 tl = tap( -1.0,  1.0 );
	vec4 t  = tap(  0.0,  1.0 );
	vec4 tr = tap(  1.0,  1.0 );
	vec4 l  = tap( -1.0,  0.0 );
	vec4 c  = tap(  0.0,  0.0 );
	vec4 r  = tap(  1.0,  0.0 );
	vec4 bl = tap( -1.0, -1.0 );
	vec4 b  = tap(  0.0, -1.0 );
	vec4 br = tap(  1.0, -1.0 );

	vec4 gx = tr + 2.0 * r + br - tl - 2.0 * l - bl;
	vec4 gy = tl + 2.0 * t + tr - bl - 2.0 * b - br;

	float normalEdge = length( vec2( length( gx.rgb ), length( gy.rgb ) ) );
	float depthEdge = length( vec2( gx.a, gy.a ) ) / max( c.a, 0.02 );

	float edge = max(
		smoothstep( uNormalThreshold, uNormalThreshold * 1.5, normalEdge ),
		smoothstep( uDepthThreshold, uDepthThreshold * 1.5, depthEdge )
	);

	gl_FragColor = vec4( vec3( edge ), 1.0 );

}
