
var scene = new THREE.Scene();
scene.background = new THREE.Color( 0xf03434 );
scene.fog = new THREE.Fog( 0xf03434, 12, 20);
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth/window.innerHeight, 0.1, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.enabled = true;
renderer.domElement.classList.add('fixed-canvas');
document.body.appendChild( renderer.domElement );

window.addEventListener( 'resize', onWindowResize, false );
function onWindowResize(){
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
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

var shadowMaterial = new THREE.ShadowMaterial({color: 0x990000});
var shadow = new THREE.Mesh( planeGeometry, shadowMaterial );
shadow.receiveShadow = true;
shadow.position.y = 0.01;
scene.add( shadow );

let angle = 0;
const radius = 12;
var animate = function (e) {
  requestAnimationFrame( animate );

  angle += 0.0005;
  const xPos = Math.sin(angle) * radius;
  const zPos = Math.cos(angle) * radius;

  camera.position.set(xPos, 4, zPos);
  camera.lookAt(scene.position);

  renderer.render( scene, camera );

};

animate();