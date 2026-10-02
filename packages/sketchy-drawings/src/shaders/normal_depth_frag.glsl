// Packs the normal into rgb and depth (0 near, 1 at uFar) into alpha.
// Surfaces with uBackground set write the same value as the cleared
// background, so they never produce edges against it.

uniform float uFar;
uniform float uBackground;

varying vec3 vNormal;
varying float vDepth;

void main(){

	if ( uBackground > 0.5 ) {
		gl_FragColor = vec4( 0.5, 0.5, 1.0, 1.0 );
	} else {
		gl_FragColor = vec4( normalize( vNormal ) * 0.5 + 0.5, clamp( vDepth / uFar, 0.0, 1.0 ) );
	}

}
