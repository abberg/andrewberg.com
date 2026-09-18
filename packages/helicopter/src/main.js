var thumbnailMode = new URLSearchParams(location.search).has("thumbnail");
var modelLoaded = false;
var topRotorPivot;
var rotorStartedAt = 0;
var rotorInitialAngle = 0;
var rotorBladeMesh;
var rotorBladeTips = [];

var canvasWidth = window.innerWidth;
var canvasHeight = Math.round(canvasWidth * 0.425531);

var scene = new THREE.Scene();
scene.background = new THREE.Color( 0xf03434 );
scene.fog = new THREE.Fog( 0xf03434, 5, 20);
var camera = new THREE.PerspectiveCamera( 75, canvasWidth/canvasHeight, 0.1, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.autoClear = false;
renderer.setSize( canvasWidth, canvasHeight);
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.enabled = true;
renderer.domElement.classList.add('fixed-canvas');
document.body.appendChild( renderer.domElement );

var renderPass = new THREE.RenderPass( scene, camera );
var fxaaPass = new THREE.ShaderPass( THREE.FXAAShader );

var pixelRatio = renderer.getPixelRatio();

fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( canvasWidth * pixelRatio );
fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( canvasHeight * pixelRatio );

var composer = new THREE.EffectComposer( renderer );
composer.addPass( renderPass );
composer.addPass( fxaaPass );

window.addEventListener( 'resize', onWindowResize, false );
function onWindowResize(){
  canvasWidth = window.innerWidth;
  canvasHeight = Math.round(canvasWidth * 0.425531);
  camera.aspect = canvasWidth / canvasHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( canvasWidth, canvasHeight );
  composer.setSize( canvasWidth, canvasHeight );
  var pixelRatio = renderer.getPixelRatio();
  fxaaPass.material.uniforms[ 'resolution' ].value.x = 1 / ( canvasWidth * pixelRatio );
  fxaaPass.material.uniforms[ 'resolution' ].value.y = 1 / ( canvasHeight * pixelRatio );
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
    topRotorPivot = gltf.scene.getObjectByName("Top_Rotor");
    rotorInitialAngle = topRotorPivot.rotation.y;
    rotorStartedAt = performance.now();
    rotorBladeMesh = topRotor;
    // Find the two blade ends in mesh space, including the model's diagonal orientation.
    const positions = topRotor.geometry.attributes.position;
    const firstTip = new THREE.Vector3();
    let longest = 0;
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      const distance = point.x * point.x + point.z * point.z;
      if (distance > longest) { longest = distance; firstTip.copy(point); }
    }
    const secondTip = new THREE.Vector3();
    let opposite = Infinity;
    for (let i = 0; i < positions.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i);
      const projection = point.x * firstTip.x + point.z * firstTip.z;
      if (projection < opposite) { opposite = projection; secondTip.copy(point); }
    }
    rotorBladeTips = [firstTip, secondTip];
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
    modelLoaded = true;
  },
  // load progress
  function ( xhr ) {
    //console.log( ( xhr.loaded / xhr.total * 100 ) + '% loaded' );
  },
  // loading error
  function ( error ) {
    console.error("Helicopter model failed to load", error);
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
const waterNoiseGLSL = `
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

`;

var fragmentShader = `
  varying vec2 vUv;
  uniform float scale;
  uniform float elapsed;

  ${waterNoiseGLSL}

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

// Slice the actual blade mesh at the water surface so the wake meets the blade.
const waterHeight = 0;
// Use the nose water's simplex noise and clock in world space for both rotor marks.
const wakeVertexShader = `
  varying vec2 vUv;
  varying vec2 vWaterPosition;
  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWaterPosition = worldPosition.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;
const wakeNoiseGLSL = waterNoiseGLSL + `
  float wakeNoise(vec2 point, float time) {
    vec2 flow = vec2(time * 0.00016, -time * 0.00010);
    return 0.8 * snoise(point * 1.8 - flow) + 0.2 * snoise(point * 3.2 + flow * 0.5);
  }
`;

const bladeContactArc = new THREE.Mesh(
  new THREE.PlaneBufferGeometry(6, 6),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true },
    uniforms: { elapsed: uniforms.elapsed, direction: { value: new THREE.Vector2(0, 1) } },
    vertexShader: wakeVertexShader,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec2 direction;
      uniform float elapsed;
      varying vec2 vWaterPosition;
      ${wakeNoiseGLSL}
      void main() {
        vec2 p = (vUv - 0.5) * 6.0;
        float x = dot(p, vec2(direction.y, -direction.x));
        float y = dot(p, direction);
        float curve = -x * x / 0.18;
        float noise = wakeNoise(vWaterPosition * 0.4, elapsed * 0.65);
        float normalDistance = (y - curve) / sqrt(1.0 + 4.0 * x * x / (0.18 * 0.18));
        float displacement = 0.045 * noise * smoothstep(0.0, 0.18, abs(x));
        float distance = abs(normalDistance - displacement);
        float stroke = 0.065 * (1.0 + 0.55 * noise) * (1.0 - smoothstep(0.40, 0.62, abs(x)));
        float pixel = max(length(vec2(dFdx(y), dFdy(y))), 0.0001);
        if (stroke < max(0.01, pixel * 0.8)) discard;
        float coverage = 1.0 - smoothstep(stroke - pixel * 0.5, stroke + pixel * 0.5, distance);
        if (coverage <= 0.0) discard;
        gl_FragColor = vec4(vec3(1.0), coverage);
      }
    `,
  })
);
bladeContactArc.rotation.x = -Math.PI / 2;
bladeContactArc.visible = false;
scene.add(bladeContactArc);
// Short straight strokes peel away beside the apex, moving backward and outward.
const endWaveGeometry = new THREE.PlaneBufferGeometry(5, 5);
const endWaves = Array.from({ length: 8 }, () => {
  const mesh = new THREE.Mesh(endWaveGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    extensions: { derivatives: true },
    uniforms: { elapsed: uniforms.elapsed, age: { value: 0 }, direction: { value: new THREE.Vector2(0, 1) } },
    vertexShader: wakeVertexShader,
    fragmentShader: `
      varying vec2 vUv;
      uniform float age;
      uniform vec2 direction;
      uniform float elapsed;
      varying vec2 vWaterPosition;
      ${wakeNoiseGLSL}
      void main() {
        vec2 p = (vUv - 0.5) * 5.0;
        float x = dot(p, vec2(direction.y, -direction.x));
        float y = dot(p, direction);
        float halfLength = mix(0.55, 1.86, smoothstep(0.0, 1.2, age));
        float noise = wakeNoise(vWaterPosition * 0.4, elapsed * 0.65);
        float signedDistance = x - 0.045 * noise;
        float distance = abs(signedDistance);
        float pixel = max(length(vec2(dFdx(signedDistance), dFdy(signedDistance))), 0.0001);
        float width = max(pixel * 0.5, 0.028 * (1.0 + 0.55 * noise));
        float collapse = smoothstep(0.30, 1.70, age);
        // Half a screen pixel on either side of the centerline gives a one-pixel stroke.
        float stroke = mix(width, pixel * 0.5, collapse);
        stroke *= 1.0 - smoothstep(halfLength * 0.6, halfLength, abs(y));
        if (stroke <= 0.0) discard;
        float coverage = 1.0 - smoothstep(stroke - pixel * 0.5, stroke + pixel * 0.5, distance);
        if (coverage <= 0.0) discard;
        gl_FragColor = vec4(vec3(1.0), coverage);
      }
    `,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, born: -Infinity, origin: new THREE.Vector3(), velocity: new THREE.Vector3() };
});
let nextEndWave = 0;
const nextEndWaveAt = [0, 0];
function updateEndWaves(time) {
  if (bladeContactArc.visible) {
    const facing = bladeContactArc.material.uniforms.direction.value;
    const forward = new THREE.Vector3(facing.x, 0, -facing.y);
    const sideways = new THREE.Vector3(-forward.z, 0, forward.x);
    [-1, 1].forEach((sign, index) => {
      if (time < nextEndWaveAt[index]) return;
      const wave = endWaves[nextEndWave];
      // Start on the main parabola, following its tangent with no lateral gap.
      const spawnX = sign * 0.5;
      wave.origin.copy(bladeContactArc.position)
        .addScaledVector(sideways, spawnX)
        .addScaledVector(forward, -spawnX * spawnX / 0.18);
      wave.origin.y = 0.054;
      const driftDirection = sideways.clone().multiplyScalar(sign)
        .addScaledVector(forward, -2 * Math.abs(spawnX) / 0.18).normalize();
      wave.mesh.material.uniforms.direction.value.set(driftDirection.x, -driftDirection.z);
      // Keep the stroke parallel to the arm while its wavefront spreads sideways.
      wave.velocity.copy(sideways).multiplyScalar(sign * 0.65)
        .addScaledVector(forward, -0.45);
      wave.born = time;
      nextEndWave = (nextEndWave + 1) % endWaves.length;
      nextEndWaveAt[index] = time + 1.1 + Math.random() * 0.4;
    });
  }
  endWaves.forEach(wave => {
    const age = time - wave.born;
    wave.mesh.visible = age >= 0 && age < 1.8;
    if (!wave.mesh.visible) return;
    wave.mesh.position.copy(wave.origin).addScaledVector(wave.velocity, age);
    wave.mesh.material.uniforms.age.value = age;
  });
}

const bladeTrails = Array.from({ length: 2 }, () => {
  const geometry = new THREE.BufferGeometry();
  geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(128 * 3), 3));
  geometry.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(128 * 2), 2));
  const indices = [];
  for (let i = 0; i < 63; i++) {
    const v = i * 2;
    indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry,
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      extensions: { derivatives: true },
      uniforms: { elapsed: uniforms.elapsed },
      vertexShader: wakeVertexShader,
      fragmentShader: `
        varying vec2 vUv;
        varying vec2 vWaterPosition;
        uniform float elapsed;
        ${wakeNoiseGLSL}
        void main() {
          float noise = wakeNoise(vWaterPosition, elapsed);
          float halfWidth = 0.34 + noise * 0.12;
          float center = 0.5 + 0.06 * wakeNoise(vWaterPosition + vec2(3.7, 1.2), elapsed);
          float edge = abs(vUv.x - center);
          float pixel = max(fwidth(vUv.x), 0.001);
          float coverage = 1.0 - smoothstep(halfWidth - pixel * 0.5, halfWidth + pixel * 0.5, edge);
          if (coverage <= 0.0) discard;
          gl_FragColor = vec4(vec3(1.0), coverage);
        }
      `,
    }));
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, history: [] };
});
function updateBladeTrail(trail, contact) {
  const history = trail.history;
  if (!history.length || history[0].distanceTo(contact) >= 0.02) history.unshift(contact.clone());
  history.length = Math.min(history.length, 256);
  const path = [contact, ...history];
  const distances = [0];
  for (let i = 1; i < path.length; i++) distances.push(distances[i - 1] + path[i].distanceTo(path[i - 1]));
  const gap = 0.65;
  const end = Math.min(gap + 2.8, distances[distances.length - 1]);
  if (end <= gap + 0.02) { trail.mesh.visible = false; return; }
  const count = Math.min(64, Math.ceil((end - gap) / 0.04) + 1);
  const points = [];
  let segment = 1;
  for (let i = 0; i < count; i++) {
    const distance = gap + (end - gap) * i / (count - 1);
    while (segment < path.length - 1 && distances[segment] < distance) segment++;
    const length = distances[segment] - distances[segment - 1];
    points.push(path[segment - 1].clone().lerp(path[segment], length ? (distance - distances[segment - 1]) / length : 0));
  }
  const positions = trail.mesh.geometry.attributes.position;
  const uvs = trail.mesh.geometry.attributes.uv;
  for (let i = 0; i < count; i++) {
    const tangent = points[Math.min(i + 1, count - 1)].clone().sub(points[Math.max(0, i - 1)]).setY(0).normalize();
    const progress = i / (count - 1);
    const halfWidth = i === count - 1 ? 0 : 0.0525 * (1 - 0.6 * progress);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(halfWidth);
    const point = points[i];
    positions.setXYZ(i * 2, point.x + side.x, 0.055, point.z + side.z);
    positions.setXYZ(i * 2 + 1, point.x - side.x, 0.055, point.z - side.z);
    uvs.setXY(i * 2, 0, progress);
    uvs.setXY(i * 2 + 1, 1, progress);
  }
  positions.needsUpdate = true;
  uvs.needsUpdate = true;
  trail.mesh.geometry.setDrawRange(0, (count - 1) * 6);
  trail.mesh.visible = true;
}

const previousBladeContact = [null, null];
const localWaterPlane = new THREE.Plane();
const inverseBladeMatrix = new THREE.Matrix4();
const trianglePoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const cuts = [new THREE.Vector3(), new THREE.Vector3()];
const bladeHub = new THREE.Vector3();
function updateRotorContact() {
  bladeContactArc.visible = false;
  if (!rotorBladeMesh) return;
  scene.updateMatrixWorld(true);
  topRotorPivot.getWorldPosition(bladeHub);
  inverseBladeMatrix.getInverse(rotorBladeMesh.matrixWorld);
  localWaterPlane.set(new THREE.Vector3(0, 1, 0), -waterHeight).applyMatrix4(inverseBladeMatrix);
  const geometry = rotorBladeMesh.geometry;
  const positions = geometry.attributes.position;
  const indices = geometry.index;
  const count = indices ? indices.count : positions.count;
  const contacts = [new THREE.Vector3(), new THREE.Vector3()];
  const weights = [0, 0];
  const edges = [[], []];
  for (let i = 0; i < count; i += 3) {
    for (let j = 0; j < 3; j++) trianglePoints[j].fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j);
    let cutCount = 0;
    for (let j = 0; j < 3 && cutCount < 2; j++) {
      const a = trianglePoints[j], b = trianglePoints[(j + 1) % 3];
      const da = localWaterPlane.distanceToPoint(a), db = localWaterPlane.distanceToPoint(b);
      if ((da <= 0 && db > 0) || (db <= 0 && da > 0)) cuts[cutCount++].copy(a).lerp(b, da / (da - db));
    }
    if (cutCount !== 2) continue;
    const length = cuts[0].distanceTo(cuts[1]);
    const midpoint = cuts[0].clone().add(cuts[1]).multiplyScalar(0.5);
    const index = midpoint.x * rotorBladeTips[0].x + midpoint.z * rotorBladeTips[0].z >= 0 ? 0 : 1;
    edges[index].push(cuts[0].clone(), cuts[1].clone());
    contacts[index].addScaledVector(midpoint, length);
    weights[index] += length;
  }
  contacts.forEach((contact, index) => {
    if (!weights[index]) {
      previousBladeContact[index] = null;
      bladeTrails[index].mesh.visible = false;
      bladeTrails[index].history.length = 0;
      return;
    }
    contact.divideScalar(weights[index]).applyMatrix4(rotorBladeMesh.matrixWorld);
    const previous = previousBladeContact[index];
    const direction = previous ? contact.clone().sub(previous) : new THREE.Vector3();
    direction.y = 0;
    if (direction.lengthSq() < 1e-10) {
      direction.set(0, 1, 0).transformDirection(topRotorPivot.matrixWorld)
        .cross(contact.clone().sub(bladeHub)).setY(0);
    }
    direction.normalize();
    previousBladeContact[index] = contact.clone();
    updateBladeTrail(bladeTrails[index], contact);
    if (bladeContactArc.visible) return;
    // Place the arc at the forward edge of the mesh's waterline cross-section.
    const leadingEdge = contact.clone();
    let furthest = -Infinity;
    edges[index].forEach(point => {
      point.applyMatrix4(rotorBladeMesh.matrixWorld);
      const projection = point.dot(direction);
      if (projection > furthest) { furthest = projection; leadingEdge.copy(point); }
    });
    bladeContactArc.position.copy(leadingEdge).addScaledVector(direction, 0.025);
    bladeContactArc.position.y = 0.052;
    bladeContactArc.material.uniforms.direction.value.set(direction.x, -direction.z);
    bladeContactArc.visible = true;
  });
}

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
    shaderMaterial.uniforms.elapsed.value = thumbnailMode ? 1000 : e;
  }
  if (topRotorPivot && !thumbnailMode && e > 0) {
    // One revolution every 20 seconds, around the rotor hub's local Y axis.
    topRotorPivot.rotation.y = rotorInitialAngle + (e - rotorStartedAt) * Math.PI * 2 / 20000;
  }
  if (modelLoaded) updateRotorContact();
  if (!thumbnailMode && e > 0) updateEndWaves(e / 1000);
  composer.render();
  if (modelLoaded) document.documentElement.dataset.thumbnailReady = "true";

};

animate();