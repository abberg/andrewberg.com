// View-space normal and distance from the camera, for finding edges.
// Applies the morph animation when the material has morph targets.

#ifdef USE_MORPHTARGETS
uniform float morphTargetInfluences[ 4 ];
#endif

varying vec3 vNormal;
varying float vDepth;

void main(){

	vec3 morphed = position;
	vec3 morphedNormal = normal;

#ifdef USE_MORPHTARGETS
	morphed += ( morphTarget0 - position ) * morphTargetInfluences[ 0 ];
	morphed += ( morphTarget1 - position ) * morphTargetInfluences[ 1 ];
	morphed += ( morphTarget2 - position ) * morphTargetInfluences[ 2 ];
	morphed += ( morphTarget3 - position ) * morphTargetInfluences[ 3 ];
#endif

#ifdef USE_MORPHNORMALS
	morphedNormal += ( morphNormal0 - normal ) * morphTargetInfluences[ 0 ];
	morphedNormal += ( morphNormal1 - normal ) * morphTargetInfluences[ 1 ];
	morphedNormal += ( morphNormal2 - normal ) * morphTargetInfluences[ 2 ];
	morphedNormal += ( morphNormal3 - normal ) * morphTargetInfluences[ 3 ];
#endif

	vec4 mvPosition = modelViewMatrix * vec4( morphed, 1.0 );

	vNormal = normalize( normalMatrix * morphedNormal );
	vDepth = -mvPosition.z;

	gl_Position = projectionMatrix * mvPosition;

}
