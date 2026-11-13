/* global THREE */
// One video holds the four camera angles in a 2 x 2 grid. Every side of the cube is a panel textured with
// the same video, its UVs offset to one quarter of the frame, so the angles can never drift out of sync.
(() => {
  const app = document.querySelector('.app');
  const canvas = document.querySelector('.gl');
  const video = document.querySelector('video');
  const SUITS = [
    { name: 'Club', glyph: '♣', at: [-5.17, 12.2], heading: 191 },
    { name: 'Spade', glyph: '♠', at: [-12.1, 2.07], heading: -80 },
    { name: 'Heart', glyph: '♥', at: [6.35, -11.0], heading: 0 },
    { name: 'Diamond', glyph: '♦', at: [5.0, -2.6], heading: 85 },
  ];

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (error) {
    const note = document.createElement('p');
    note.className = 'fallback';
    note.textContent = 'The cube needs WebGL, which this browser has turned off.';
    app.append(note);
    return;
  }
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // ---- The cube ----------------------------------------------------------------------------------------
  // A panel is 16 x 9. It sits flush with the surface, framed by the black body of the cube, which is thicker above and below.
  const W = 16, H = 9, BORDER_X = 1.1, BORDER_Y = 1.3;
  const X = W / 2 + BORDER_X, Y = H / 2 + BORDER_Y, RADIUS = X * Math.SQRT2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 200);
  const cube = new THREE.Group();
  scene.add(cube);

  function quads(list) {
    const positions = [];
    for (const [a, b, c, d] of list) positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  const outer = [[-X, -Y], [X, -Y], [X, Y], [-X, Y]];
  const inner = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
  const side = [];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    side.push([[...outer[k], X], [...outer[n], X], [...inner[n], X], [...inner[k], X]]);
  }
  const frameGeometry = quads(side);
  const capGeometry = quads([
    [[-X, Y, X], [X, Y, X], [X, Y, -X], [-X, Y, -X]],
    [[-X, -Y, -X], [X, -Y, -X], [X, -Y, X], [-X, -Y, X]],
  ]);
  const black = new THREE.MeshStandardMaterial({ color: 0x09090a, roughness: 0.55, metalness: 0.1 });
  cube.add(new THREE.Mesh(capGeometry, black));

  const texture = new THREE.VideoTexture(video);
  texture.encoding = THREE.sRGBEncoding;
  const screen = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const TEXEL_X = 0.5 / 1920, TEXEL_Y = 0.5 / 1080;
  for (let index = 0; index < 4; index++) {
    const turnY = index * Math.PI / 2;
    const frame = new THREE.Mesh(frameGeometry, black);
    frame.rotation.y = turnY;
    const geometry = new THREE.PlaneGeometry(W, H);
    const uv = geometry.attributes.uv;
    const column = index % 2, row = index >> 1;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i,
        (column + u) / 2 + (u ? -TEXEL_X : TEXEL_X),
        1 - (row + 1 - v) / 2 + (v ? -TEXEL_Y : TEXEL_Y));
    }
    const panel = new THREE.Mesh(geometry, screen);
    panel.position.z = X;
    const holder = new THREE.Group();
    holder.rotation.y = turnY;
    holder.add(panel);
    cube.add(frame, holder);
  }

  // The lights stay put while the cube turns under them.
  scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  const key = new THREE.PointLight(0xffffff, 0.45);
  key.position.set(-8, 13, 21);
  const rim = new THREE.PointLight(0xdfe6ff, 0.18);
  rim.position.set(26, 4, 20);
  scene.add(key, rim);

  // ---- Turning -----------------------------------------------------------------------------------------
  // Turns are counted in quarter turns to the right: 0 the club, 1 the spade, 2 the heart, 3 the diamond.
  // The cube stops every half step, so it rests on a side or on a corner between two sides.
  const stop = value => Math.round(value * 2) / 2;
  let turn = 0, target = 0, drag = null, tween = null, view = 'cube';
  // Ease out and past the stop, then settle back onto it. A larger overshoot swings further past.
  const back = overshoot => t => 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
  const SPIN = back(1.7), SETTLE = back(0.8);
  const wrap = value => ((Math.round(value) % 4) + 4) % 4;
  function go(next, ease = SPIN, duration = 500) {
    target = next;
    tween = { from: turn, to: next, start: performance.now(), duration, ease };
    document.body.classList.add('turned');
  }
  function goToSide(index) {
    const from = target;
    const step = (((index - from) % 4) + 6) % 4 - 2; // the shorter way round
    go(from + (step === -2 ? 2 : step));
  }

  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Back the camera off until the cube fits both face on and turned to a corner, where it is widest.
    const tanV = Math.tan(camera.fov * Math.PI / 360) * 0.88, tanH = tanV * camera.aspect * 0.9;
    camera.position.z = Math.max(RADIUS / tanH, RADIUS + Y / tanV, X + X / tanH);
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener('pointerdown', event => {
    tween = null;
    drag = { x: event.clientX, turn, samples: [[performance.now(), turn]] };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    turn = drag.turn - (event.clientX - drag.x) / (canvas.clientWidth * 0.55);
    if (Math.abs(turn - drag.turn) > 0.02) document.body.classList.add('turned');
    drag.samples.push([performance.now(), turn]);
    if (drag.samples.length > 8) drag.samples.shift();
  });
  const release = () => {
    if (!drag) return;
    // A throw carries on in the direction it was going: the speed over the last moments of the drag
    // decides how many stops further the cube travels before it settles.
    const now = performance.now();
    const recent = drag.samples.filter(([at]) => now - at < 120);
    let speed = 0;
    if (recent.length > 1) {
      const [firstAt, firstTurn] = recent[0], [lastAt, lastTurn] = recent[recent.length - 1];
      if (lastAt > firstAt) speed = (lastTurn - firstTurn) / (lastAt - firstAt); // quarter turns a millisecond
    }
    drag = null;
    const carry = Math.max(-3, Math.min(3, speed * 400));
    const rest = stop(turn + carry);
    go(rest, SETTLE, 500 + 220 * Math.abs(rest - turn));
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  addEventListener('keydown', event => {
    if (event.target.closest && event.target.closest('button')) { if (event.key === ' ' || event.key === 'Enter') return; }
    if (event.key === 'ArrowLeft') go(stop(target) + 0.5);
    if (event.key === 'ArrowRight') go(stop(target) - 0.5);
    if (event.key === 'Escape') setView('cube');
  });
  document.querySelectorAll('[data-turn]').forEach(button =>
    button.addEventListener('click', () => { setView('cube'); go(stop(target) + Number(button.dataset.turn) / 2); }));

  // ---- Playback ----------------------------------------------------------------------------------------
  const play = document.querySelector('.play'), time = document.querySelector('.time');
  const clock = seconds => {
    const whole = Math.floor(seconds || 0);
    return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
  };
  function showPlayback() {
    const paused = video.paused;
    play.querySelector('path').setAttribute('d', paused ? 'M5 3.2 12.6 8 5 12.8z' : 'M4.4 3.2h2.6v9.6H4.4zM9 3.2h2.6v9.6H9z');
    play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  }
  play.addEventListener('click', () => { if (video.paused) video.play(); else video.pause(); });
  for (const type of ['play', 'pause']) video.addEventListener(type, showPlayback);

  // ---- Unlocking ---------------------------------------------------------------------------------------
  // Each side unlocks the first time the cube settles on it, or on a corner that shows it.
  const STORE = 'story-cube-seen';
  const seen = new Set();
  try { for (const index of JSON.parse(localStorage.getItem(STORE) || '[]')) if (index >= 0 && index < 4) seen.add(index); } catch (error) { /* no storage */ }
  const percent = document.querySelector('.percent'), lit = document.querySelector('.lit'), meter = document.querySelector('.meter i');
  function showUnlocked() {
    const share = seen.size / 4;
    percent.textContent = `${share * 100}% unlocked`;
    lit.style.width = meter.style.width = `${share * 100}%`;
  }
  function unlock(index) {
    if (seen.has(index)) return;
    seen.add(index);
    try { localStorage.setItem(STORE, JSON.stringify([...seen])); } catch (error) { /* no storage */ }
    showUnlocked();
  }

  // ---- Map ---------------------------------------------------------------------------------------------
  // A plan of the room: the column in the middle and the four cameras, each of which turns the cube to its side.
  const map = document.querySelector('.map');
  const NS = 'http://www.w3.org/2000/svg';
  const make = (name, attributes, parent) => {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, v);
    parent.append(node);
    return node;
  };
  const plan = make('svg', { viewBox: '-15 -14.5 30 29', role: 'group', 'aria-label': 'Map of the room' }, map);
  make('rect', { class: 'room', x: -13, y: -12.5, width: 26, height: 25 }, plan);
  for (const [x1, y1, x2, y2] of [[-10, -1.3, -0.8, -1.3], [-10, -4.1, 1.2, -4.1], [-5.1, 1.4, -5.1, 6.2], [5, -1.9, 11.5, -1.9]])
    make('line', { class: 'wall', x1, y1: -y1, x2, y2: -y2 }, plan);
  make('rect', { class: 'column', x: -0.6, y: -0.6, width: 1.2, height: 1.2 }, plan);
  // The suit on each face of the column: heart to the south, diamond east, club north, spade west.
  for (const [glyph, x, y] of [['♥', 0, 1.7], ['♦', 1.7, 0], ['♣', 0, -1.7], ['♠', -1.7, 0]])
    make('text', { x, y }, plan).textContent = glyph;
  const cameras = SUITS.map((suit, index) => {
    const [x, north] = suit.at, y = -north;
    // Headings run 0 north, 90 west, 180 south.
    const ray = degrees => { const r = degrees * Math.PI / 180; return [x - Math.sin(r) * 5.5, y - Math.cos(r) * 5.5]; };
    const group = make('g', { class: 'cam', tabindex: 0, role: 'button', 'aria-label': `${suit.name} side` }, plan);
    make('path', { class: 'cone', d: `M${x} ${y}L${ray(suit.heading - 24)}L${ray(suit.heading + 24)}Z` }, group);
    make('circle', { cx: x, cy: y, r: 1.25 }, group);
    make('text', { x, y }, group).textContent = suit.glyph;
    const choose = () => { goToSide(index); setView('cube'); };
    group.addEventListener('click', choose);
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    return group;
  });
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  function setView(next) {
    view = next;
    map.hidden = view !== 'map';
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  }
  viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));

  // ---- Frame -------------------------------------------------------------------------------------------
  let shown = null;
  function frame() {
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / tween.duration);
      turn = tween.from + (tween.to - tween.from) * tween.ease(t);
      if (t === 1) tween = null;
    }
    cube.rotation.y = -turn * Math.PI / 2;
    renderer.render(scene, camera);
    time.textContent = `${clock(video.currentTime)}/${clock(video.duration)}`;
    const nearest = stop(turn), facing = [wrap(Math.floor(nearest)), wrap(Math.ceil(nearest))];
    if (!drag && !tween && Math.abs(turn - nearest) < 0.03) facing.forEach(unlock);
    if (nearest !== shown || !map.hidden) {
      shown = nearest;
      cameras.forEach((camera, index) => {
        camera.classList.toggle('current', facing.includes(index));
        camera.classList.toggle('seen', seen.has(index));
      });
    }
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  showUnlocked();
  showPlayback();
  video.play().catch(showPlayback);
  requestAnimationFrame(frame);
})();
