// Full-screen quad: covers the viewport whatever the camera.

varying vec2 vUv;

void main(){

	vUv = uv;
	gl_Position = vec4( uv * 2.0 - 1.0, 0.0, 1.0 );

}
