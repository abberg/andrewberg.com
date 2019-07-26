
var scene = new THREE.Scene();
scene.background = new THREE.Color( 0xf03434 );
scene.fog = new THREE.Fog( 0xf03434, 5, 20);
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.autoClear = false;
renderer.setSize( window.innerWidth, window.innerHeight);
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.enabled = true;
renderer.domElement.classList.add('fixed-canvas');
document.body.appendChild( renderer.domElement );

var renderPass = new THREE.RenderPass( scene, camera );
var fxaaPass = new THREE.ShaderPass( THREE.FXAAShader );

var pixelRatio = renderer.getPixelRatio();

fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( window.innerWidth * pixelRatio );
fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( window.innerHeight * pixelRatio );

composer = new THREE.EffectComposer( renderer );
composer.addPass( renderPass );
composer.addPass( fxaaPass );

window.addEventListener( 'resize', onWindowResize, false );
function onWindowResize(){
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
  composer.setSize( window.innerWidth, window.innerHeight );
  var pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( window.innerWidth * pixelRatio );
  fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( window.innerHeight * pixelRatio );
}

var light = new THREE.DirectionalLight( 0xffffff, 1, 100 );
light.position.set( 0, 7, 0 );
light.castShadow = true;
scene.add( light );

light.shadow.mapSize.width = light.shadow.mapSize.height = 1024;
light.shadow.camera.far = 10;
light.shadow.camera.top = 10; 
light.shadow.camera.right = 10;
light.shadow.camera.bottom = -10;
light.shadow.camera.left = -10;

//var helper = new THREE.CameraHelper( light.shadow.camera );
//scene.add( helper );

var ambientLight = new THREE.AmbientLight(0x333333);
scene.add(ambientLight);

var loader = new THREE.GLTFLoader();
loader.load(
  'bell_huey_helicopter/scene.gltf',
  // load complete
  function ( gltf ) {
    const obj = gltf.scene.children[0].children[0].children[0].children[0].children[0].children[0];
    const backRotor = obj.children[0].children[0];
    const topRotor = obj.children[1].children[0];
    const interior = obj.children[2].children[1];
    const body = obj.children[4];
    backRotor.material = topRotor.material = body.material = new THREE.MeshToonMaterial();
    interior.material = new THREE.MeshBasicMaterial({color: 0x999999});
    backRotor.castShadow = true; 
    topRotor.castShadow = true;
    interior.castShadow = true; 
    body.castShadow = true;
    obj.rotateX(0.6);
    obj.rotateZ(-0.5);
    obj.position.y = 0.5;
    scene.add( obj );
  },
  // load progress
  function ( xhr ) {
    //console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
  },
  // loading error
  function ( error ) {
    //console.log( 'An error happened' );
  }
);

var planeGeometry = new THREE.PlaneGeometry( 40, 40, 10, 10 );
planeGeometry.rotateX( - Math.PI / 2 );
var planeMaterial = new THREE.MeshBasicMaterial( {color: 0xf03434} );
var plane = new THREE.Mesh( planeGeometry, planeMaterial );
scene.add( plane );

var vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;
var fragmentShader = `
  varying vec2 vUv;
  uniform float scale;
  uniform float elapsed;

  //
  // Description : Array and textureless GLSL 2D simplex noise function.
  //      Author : Ian McEwan, Ashima Arts.
  //  Maintainer : ijm
  //     Lastmod : 20110822 (ijm)
  //     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
  //               Distributed under the MIT License. See LICENSE file.
  //               https://github.com/ashima/webgl-noise
  //

  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec2 mod289(vec2 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec3 permute(vec3 x) {
    return mod289(((x*34.0)+1.0)*x);
  }

  float snoise(vec2 v)
    {
    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                      -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0
  // First corner
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);

  // Other corners
    vec2 i1;
    //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
    //i1.y = 1.0 - i1.x;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    // x0 = x0 - 0.0 + 0.0 * C.xx ;
    // x1 = x0 - i1 + 1.0 * C.xx ;
    // x2 = x0 - 1.0 + 2.0 * C.xx ;
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

  // Permutations
    i = mod289(i); // Avoid truncation effects in permutation
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

  // Gradients: 41 points uniformly over a line, mapped onto a diamond.
  // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

  // Normalise gradients implicitly by scaling m
  // Approximation of: m *= inversesqrt( a0*a0 + h*h );
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

  // Compute final noise value at P
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  #define PI 3.14159265358979323844;

  void main() {

    const float r_inner = 0.25; 
    const float r_outer = 0.5; 

    vec2 x = vUv - vec2(0.5);
    float radius = length(x);
    float angle = atan(x.y, x.x);

    vec2 tc_polar; // the new polar texcoords
    // map radius so that for r=r_inner -> 0 and r=r_outer -> 1
    tc_polar.s = ( radius - r_inner) / (r_outer - r_inner);

    // map angle from [-PI,PI] to [0,1]
    tc_polar.t = angle * 0.5 / PI + 0.5;

    float n = snoise((tc_polar - vec2(elapsed * 0.00005, 0.0)) * scale);
    n = step(0.5, n);
    gl_FragColor = vec4(1.0 * n, 1.0 * n, 1.0 * n, 0.9 * n);
  }
`;

var uniforms = {
  scale: { type: "f", value: 5.0 },
  elapsed: { type: "f", value: 1.0 }
};

var shaderMaterial = new THREE.ShaderMaterial(
  {
    uniforms : uniforms,
    vertexShader : vertexShader,
    fragmentShader : fragmentShader,
  });
shaderMaterial.transparent = true;
shaderMaterial.opacity = 0;
var rippleGeometry = new THREE.RingGeometry( 1, 2.25, 30, 1);
var rippleMesh = new THREE.Mesh(rippleGeometry, shaderMaterial);
rippleMesh.position.set( 0.5, 0.05, 2.7);
rippleMesh.rotateX( -Math.PI / 2 );
rippleMesh.rotateZ(-1);
scene.add(rippleMesh);

var shadowMaterial = new THREE.ShadowMaterial({color: 0x990000});
var shadow = new THREE.Mesh( planeGeometry, shadowMaterial );
shadow.receiveShadow = true;
shadow.position.y = 0.03;
scene.add( shadow );

let angle = 0;
const radius = 9;
const cameraTarget = new THREE.Vector3(0, 2, 0);
var animate = function (e) {
  requestAnimationFrame( animate );

  //angle += 0.005;
  angle = (Math.PI * 2) * 0.92;
  const xPos = Math.sin(angle) * radius;
  const zPos = Math.cos(angle) * radius;

  camera.position.set(xPos, 3, zPos);
  camera.lookAt(cameraTarget);

  if (e > 0) {
    shaderMaterial.uniforms.elapsed.value = e;
  }
  composer.render();

};

animate();