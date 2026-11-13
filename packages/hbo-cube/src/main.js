/* global THREE */
// One video holds the four camera angles in a 2 x 2 grid. Every side of the cube is a panel textured with
// the same video, its UVs offset to one quarter of the frame, so the angles can never drift out of sync.
(() => {
  const app = document.querySelector('.app');
  const canvas = document.querySelector('.gl');
  const video = document.querySelector('video');

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
  const LENS = 40; // the camera's usual vertical field of view, which widens a little at speed on a line
  const camera = new THREE.PerspectiveCamera(LENS, 1, 1, 3000);
  window.__cube = { camera }; // for checking the camera's motion from the console
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
  }

  // The canvas fills the window, under the top bar and the bottom controls. Things are framed in the band
  // between them: the view is shifted up so its centre is the band's, and fitted to the band's height.
  const TOP_BAR = 36, BOTTOM_BAR = 106;
  let fit = 60, tanV = 0.36, tanH = 0.6; // how far back the camera sits in the cube view, and the half angles of the band
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.setViewOffset(width, height, 0, (BOTTOM_BAR - TOP_BAR) / 2, width, height);
    // Back the camera off until the cube fits both face on and turned to a corner, where it is widest.
    const band = Math.max(0.3, (height - TOP_BAR - BOTTOM_BAR) / height);
    tanV = Math.tan(LENS * Math.PI / 360) * band;
    tanH = Math.tan(LENS * Math.PI / 360) * camera.aspect;
    const v = tanV * 0.88, h = tanH * 0.88 * 0.9;
    fit = Math.max(RADIUS / h, RADIUS + Y / v, X + X / h);
    // The spin buttons sit beside the cube's front face (face on, so they hold still as it turns), one and
    // a half tiles out from its edge, closer on a narrow window so that they stay 12 px inside it.
    const edge = X / (fit - X) / Math.tan(LENS * Math.PI / 360) * height / 2;
    const spin = document.querySelector('.spin'), tile = spin && spin.querySelector('.tile');
    const gap = tile ? Math.max(0, Math.min(tile.offsetWidth * 1.5, width / 2 - edge - 12 - spin.offsetWidth)) : 51;
    canvas.parentElement.style.setProperty('--edge', `${edge}px`);
    canvas.parentElement.style.setProperty('--gap', `${gap}px`);
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener('pointerdown', event => {
    if (view === 'piece') return; // facing another piece there is nothing to drag or click until the view pulls back
    drag = { x: event.clientX, y: event.clientY, moved: false };
    if (view === 'cube') { tween = null; Object.assign(drag, { turn, samples: [[performance.now(), turn]] }); }
    else Object.assign(drag, { gaze: true, yaw, pitch });
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!drag) {
      // A piece or a line that a click would fly to shows the pointing hand.
      if (event.pointerType === 'mouse') canvas.classList.toggle('pick', Boolean(pick(event.clientX, event.clientY)));
      return;
    }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.gaze) {
      // Away from the cube the camera stays where it is and a drag turns where it looks, as if pulling the view along.
      // It can turn all the way round, and up or down until it is nearly looking straight along the axis.
      yaw = drag.yaw + dx * 0.0022;
      pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + dy * 0.0022));
      return;
    }
    turn = drag.turn - dx / (canvas.clientWidth * 0.55);
    drag.samples.push([performance.now(), turn]);
    if (drag.samples.length > 8) drag.samples.shift();
  });
  const release = () => {
    if (!drag) return;
    canvas.classList.remove('dragging');
    // A click, rather than a drag, flies to whatever piece is under it.
    const picked = drag.moved ? null : pick(drag.x, drag.y);
    if (picked) flyTo(picked.item, picked.via && { start: picked.via, end: picked.end });
    if (drag.gaze) { drag = null; return; }
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
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  addEventListener('keydown', event => {
    if (event.target.closest && event.target.closest('button')) { if (event.key === ' ' || event.key === 'Enter') return; }
    if (event.key === 'ArrowLeft' && view === 'cube') go(stop(target) + 0.5);
    if (event.key === 'ArrowRight' && view === 'cube') go(stop(target) - 0.5);
    if (event.key === 'Escape') flyTo(hub);
  });
  document.querySelectorAll('[data-turn]').forEach(button =>
    button.addEventListener('click', () => { flyTo(hub); go(stop(target) + Number(button.dataset.turn) / 2); }));

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
  // Each side of the cube unlocks the first time the cube settles on it, or on a corner that shows it, and
  // every other piece the first time the camera flies in to face it. Every visit starts afresh, so the
  // demo always opens with everything still to find; progress from older builds is cleared.
  try { localStorage.removeItem('story-cube-seen'); localStorage.removeItem('story-cube-viewed'); } catch (error) { /* no storage */ }
  const seen = new Set();
  const viewed = new Set(); // pieces, filled in once the content is laid out
  const meter = document.querySelector('.unlock'), percent = document.querySelector('.percent');
  function showUnlocked() {
    // One more share than there is to find stays locked, as the hidden final film was.
    const share = Math.round((seen.size + viewed.size) / (4 + ITEMS.length) * 100);
    percent.textContent = `${share}% unlocked`;
    meter.style.setProperty('--p', `${share}%`);
  }
  function unlock(index) {
    if (seen.has(index)) return;
    seen.add(index);
    showUnlocked();
  }
  function view1st(item) {
    if (item === hub || viewed.has(item)) return;
    viewed.add(item);
    reveal(item);
    showUnlocked();
  }

  // ---- The content --------------------------------------------------------------------------------------
  // The original held two cubes and 41 more films, recordings and pictures. Only this cube is real here:
  // the rest are stand-ins of four kinds (cube, video, audio, picture), laid out once and shared by the map
  // and the universe. Each is an empty frame until it has been viewed.
  // Each is [kind, left, top] on a 160 x 96 sheet. The first is this cube.
  const SIZES = { cube: [26, 11], video: [17, 8], audio: [17, 8], picture: [8, 6] };
  const ITEMS = [
    ['cube', 67, 26], ['cube', 86, 39],
    ['video', 9, 28], ['video', 9, 45],
    ['audio', 27, 25], ['video', 27, 35], ['picture', 33, 46], ['video', 27, 57], ['audio', 27, 68],
    ['audio', 45, 13], ['video', 45, 25], ['video', 45, 46], ['video', 45, 57], ['video', 45, 68],
    ['audio', 71, 7], ['picture', 64, 18], ['picture', 67, 40], ['video', 71, 51], ['picture', 70, 64], ['video', 71, 72],
    ['picture', 84, 17], ['picture', 102, 54], ['video', 90, 64], ['picture', 92, 74], ['video', 90, 86],
    ['picture', 94, 8], ['video', 98, 17], ['video', 98, 28], ['audio', 102, 78],
    ['picture', 119, 23], ['video', 113, 41], ['video', 113, 52], ['video', 113, 68], ['picture', 121, 79],
    ['video', 131, 32], ['audio', 131, 52], ['audio', 131, 62],
  ].map(([kind, left, top]) => {
    const [width, height] = SIZES[kind];
    return { kind, left, top, width, height, x: left + width / 2, y: top + height / 2 };
  });
  // A small seeded generator, so the layout is the same on every visit.
  let seed = 2009;
  const random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // Every piece hangs off the nearest piece that is closer to this cube, which makes a tree rooted on it.
  const hub = ITEMS[0];
  const reachOf = item => Math.hypot(item.x - hub.x, item.y - hub.y);
  ITEMS.slice(1).forEach(item => {
    item.parent = ITEMS.filter(other => other !== item && reachOf(other) < reachOf(item))
      .sort((a, b) => Math.hypot(a.x - item.x, a.y - item.y) - Math.hypot(b.x - item.x, b.y - item.y))[0];
  });
  const wave = (count, width, height) => Array.from({ length: count }, (_, i) =>
    [i / (count - 1) * width, height / 2 + (random() - 0.5) * height * (i % (count - 1) ? 0.5 : 0)]);

  // ---- Map ---------------------------------------------------------------------------------------------
  // A flat sheet of everything, joined by thin lines. This cube shows what it is playing, and a click on any
  // piece flies to it.
  const map = document.querySelector('.map');
  const NS = 'http://www.w3.org/2000/svg';
  const plan = document.createElement('div');
  plan.className = 'plan';
  const links = document.createElementNS(NS, 'svg');
  links.setAttribute('class', 'links');
  links.setAttribute('viewBox', '0 0 160 96');
  links.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ITEMS.slice(1).map(item => `M${item.x} ${item.y}V${item.parent.y}H${item.parent.x}`).join(''));
  links.append(path);
  plan.append(links);
  let thumb;
  ITEMS.forEach((item, index) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `item ${item.kind}`;
    node.style.cssText = `left:${item.left / 1.6}%;top:${item.top / 0.96}%;width:${item.width / 1.6}%;height:${item.height / 0.96}%`;
    node.setAttribute('aria-label', index ? `${item.kind[0].toUpperCase()}${item.kind.slice(1)} ${index}` : 'The Heist');
    node.addEventListener('click', () => flyTo(item));
    item.node = node;
    if (!index) {
      node.classList.add('open');
      thumb = document.createElement('canvas');
      thumb.width = 260; thumb.height = 110;
      node.append(thumb);
    }
    if (item.kind === 'audio') {
      const sound = document.createElementNS(NS, 'svg');
      sound.setAttribute('viewBox', '0 0 100 40');
      sound.setAttribute('preserveAspectRatio', 'none');
      const line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', wave(40, 80, 40).map(([x, y]) => `${x + 10},${y}`).join(' '));
      sound.append(line);
      node.append(sound);
    }
    plan.append(node);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.textContent = 'Close ✕';
  close.addEventListener('click', () => setView(under));
  map.append(plan, close);
  const sheet = thumb.getContext('2d');
  function drawThumb(side) {
    if (video.readyState < 2) return;
    // The two sides nearest the viewer, side by side, each cropped from its quarter of the frame.
    const w = video.videoWidth / 2, h = video.videoHeight / 2, crop = h * 130 / 110;
    for (let half = 0; half < 2; half++) {
      const index = (side + half) % 4;
      sheet.drawImage(video, (index % 2) * w + (w - crop) / 2, (index >> 1) * h, crop, h, half * 130, 0, 130, 110);
    }
  }

  // ---- Universe ----------------------------------------------------------------------------------------
  // The other pieces hang in space around the cube, always in view, and turn with it. Pulling back shows the lines that join
  // them into a web, with the cube as one piece among them.
  const universe = new THREE.Group();
  scene.add(universe);
  const edge = new THREE.LineBasicMaterial({ color: 0x8a8a84 });
  const thread = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  // How each kind looks once viewed; until then every piece is an empty dark frame.
  const DARK = 0x020203, FLAT = 0x4a4a48;
  const LIT = { video: 0x101013, cube: 0x101013, audio: 0x050506, picture: 0x5c5c58 };
  const arrow = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.3, 1.7, 0.05), new THREE.Vector3(-1.3, -1.7, 0.05), new THREE.Vector3(1.7, 0, 0.05)]);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  // Pieces not yet chosen glow: a soft pale halo around the card, brightest at its edge and fading to
  // nothing with no visible edge. The halo is about GLOW_PX wide on screen however near or far the card is,
  // but never wider than GLOW of the card's height, so it stays a thin soft rim up close and a halo at a
  // distance; it also dims as the card grows large on screen. A shader works out the fade from the card's
  // rounded outline, so it can change width every frame.
  const GLOW = 0.35, GLOW_PX = 14, GLOW_OPACITY = 0.35, GLOW_NEAR = 0.15; // GLOW_NEAR: its opacity once the card is 400 px tall
  const glowVertex = `varying vec2 vAt; void main() { vAt = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const glowFragment = `
    uniform vec2 halfSize; uniform float reach, corner, opacity; varying vec2 vAt;
    void main() {
      vec2 q = abs(vAt) - halfSize + corner;
      float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner; // distance from the card's rounded outline
      if (outside <= 0.0) discard; // nothing over the card itself
      float a = pow(1.0 - clamp(outside / reach, 0.0, 1.0), 2.5); // reaches nothing with no slope at the far edge
      gl_FragColor = vec4(0.875, 0.933, 1.0, a * opacity); // #dfeeff, as written to the screen
    }`;
  const glowing = []; // the glows still showing, to be resized each frame
  function glowFor(width, height) {
    const most = height * GLOW;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width + most * 2, height + most * 2), new THREE.ShaderMaterial({
      vertexShader: glowVertex, fragmentShader: glowFragment, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { halfSize: { value: new THREE.Vector2(width / 2, height / 2) }, reach: { value: most }, corner: { value: Math.min(width, height) * 0.06 }, opacity: { value: GLOW_OPACITY } },
      // Pushed back in depth, so the card in front of it hides its middle from either side without flicker.
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8,
    }));
    glow.userData.most = most;
    glow.userData.height = height;
    glow.raycast = () => {}; // never picked
    glowing.push(glow);
    return glow;
  }
  const glowAt = new THREE.Vector3();
  function sizeGlows() {
    // World units per screen pixel at a distance of one.
    const perPixel = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, canvas.clientHeight);
    for (const glow of glowing) {
      if (!glow.visible) continue;
      glow.getWorldPosition(glowAt);
      const across = perPixel * glowAt.distanceTo(camera.position); // world units per screen pixel at the card
      glow.material.uniforms.reach.value = Math.max(1e-3, Math.min(glow.userData.most, GLOW_PX * across));
      const tall = glow.userData.height / across; // the card's height on screen, in pixels
      glow.material.uniforms.opacity.value = GLOW_OPACITY + (GLOW_NEAR - GLOW_OPACITY) * smoothstep((tall - 120) / 280);
    }
  }
  // A piece's glow goes out the moment it is chosen, by a click on it or on a line that leads to it.
  function unglow(item) {
    if (item.glow) item.glow.visible = false;
    if (item.node) item.node.classList.add('chosen');
  }
  function reveal(item) {
    item.node.classList.add('viewed');
    item.card.material.color.setHex(LIT[item.kind]);
    if (item.sound) { item.sound.material.color.setHex(0xa9c98f); item.sound.scale.y = 1; }
    if (item.play) item.play.visible = true;
  }
  const SPREAD = 3.4, CLEAR = 105;
  hub.place = new THREE.Vector3();
  const threads = [], ends = []; // the points of each line, and the piece at each point
  ITEMS.slice(1).forEach(item => {
    const place = new THREE.Vector3((item.x - hub.x) * SPREAD, (hub.y - item.y) * SPREAD, (random() - 0.5) * 520);
    // The universe turns with the cube, so every piece keeps far enough from the axis to swing round
    // behind the camera's seat and never between it and the cube.
    if (Math.hypot(place.x, place.z) < CLEAR)
      place.z = (random() < 0.5 ? -1 : 1) * (Math.sqrt(CLEAR * CLEAR - place.x * place.x) + random() * 140);
    item.place = place;
    const geometry = item.kind === 'cube' ? new THREE.BoxGeometry(18, 11, 18) : new THREE.PlaneGeometry(item.width, item.height);
    const card = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: DARK, side: THREE.DoubleSide }));
    card.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge));
    if (item.kind === 'audio') {
      const points = wave(40, item.width * 0.8, item.height).map(([x, y]) => new THREE.Vector3(x - item.width * 0.4, y - item.height / 2, 0.05));
      // Flat and grey until it has been heard.
      item.sound = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: FLAT }));
      item.sound.scale.y = 0.04;
      card.add(item.sound);
    }
    if (item.kind === 'video') {
      item.play = new THREE.Mesh(arrow, white);
      item.play.visible = false;
      card.add(item.play);
    }
    // Every piece of content glows until it is chosen; the other cube is not content, so it does not.
    if (item.kind !== 'cube') { item.glow = glowFor(item.width, item.height); card.add(item.glow); }
    card.userData.item = item;
    item.card = card;
    card.position.copy(place);
    card.rotation.set((random() - 0.5) * 0.9, (random() - 0.5) * 2.4, (random() - 0.5) * 0.5);
    universe.add(card);
  });
  ITEMS.slice(1).forEach((item, index) => {
    threads.push(item.place, item.parent.place);
    ends.push(item, item.parent);
    // A few threads cut across the tree, so it reads as a web.
    if (index % 4 === 0) {
      const other = ITEMS[1 + Math.floor(random() * (ITEMS.length - 1))];
      threads.push(item.place, other.place);
      ends.push(item, other);
    }
  });
  // An unseen box round the cube, generous enough to click when the cube is small.
  const reach = new THREE.Mesh(new THREE.BoxGeometry(24, 16, 24), new THREE.MeshBasicMaterial({ visible: false }));
  scene.add(reach);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(threads), thread);
  lines.visible = false;
  universe.add(lines);
  const PULL = 110; // how much further back the camera sits in the universe
  let zoom = 0, yaw = 0, pitch = 0;

  // ---- Picking -----------------------------------------------------------------------------------------
  // A click lands on a piece, or on a line. A line off the piece the camera is at leads to its other end;
  // otherwise it leads to whichever of its two pieces has not been viewed, or to the nearer one when both or
  // neither have. The camera flies to the clicked point on the line and
  // on down it to that piece without stopping.
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), spot = new THREE.Vector3();
  const endA = new THREE.Vector3(), endB = new THREE.Vector3();
  const cards = ITEMS.slice(1).map(item => item.card);
  function pick(x, y) {
    if (view !== 'universe') return null; // only the pulled-back view is clickable
    const box = canvas.getBoundingClientRect();
    pointer.set((x - box.left) / box.width * 2 - 1, 1 - (y - box.top) / box.height * 2);
    raycaster.setFromCamera(pointer, camera);
    // A generous box stands in for the cube, which is small from back here.
    const [hit] = raycaster.intersectObjects([...cards, reach], true);
    if (hit) {
      let object = hit.object;
      while (object && !object.userData.item) object = object.parent;
      const item = object ? object.userData.item : hub;
      return { item };
    }
    if (zoom < 0.5) return null;
    // Lines are thin, so they are picked on the screen: the one passing within a few pixels of the click.
    let best = null;
    const halfW = box.width / 2, halfH = box.height / 2, px = pointer.x * halfW, py = pointer.y * halfH;
    for (let index = 0; index < ends.length; index += 2) {
      // In the camera's own space, where it looks down -z. A line that runs off behind the camera is cut
      // where it passes the camera, so the part still in view can be clicked.
      endA.copy(ends[index].place).applyMatrix4(universe.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      endB.copy(ends[index + 1].place).applyMatrix4(universe.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      const front = -camera.near;
      if (endA.z > front && endB.z > front) continue;
      let start = 0, end = 1;
      if (endA.z > front) { start = (front - endA.z) / (endB.z - endA.z); endA.lerp(endB, start); }
      else if (endB.z > front) { end = (front - endA.z) / (endB.z - endA.z); endB.lerpVectors(endA, endB, end); }
      endA.applyMatrix4(camera.projectionMatrix);
      endB.applyMatrix4(camera.projectionMatrix);
      const ax = endA.x * halfW, ay = endA.y * halfH, bx = endB.x * halfW - ax, by = endB.y * halfH - ay;
      const along = Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / (bx * bx + by * by || 1)));
      const gap = Math.hypot(ax + bx * along - px, ay + by * along - py);
      if (gap < 9 && (!best || gap < best.gap)) best = { gap, index, along: start + along * (end - start) };
    }
    if (!best) return null;
    const from = ends[best.index], to = ends[best.index + 1];
    const known = piece => piece === hub || viewed.has(piece);
    // A line off the piece the camera is at always leads to its other end. Otherwise it leads to the end
    // not yet viewed, and to the nearer end only when both or neither have been.
    const item = from === focus ? to : to === focus ? from
      : known(from) !== known(to) ? (known(from) ? to : from) : best.along < 0.5 ? from : to;
    // The track: from the clicked point on the line to the piece it leads to.
    const via = endA.copy(from.place).lerp(to.place, best.along).applyMatrix4(universe.matrixWorld).clone();
    return { item, via, end: item.place.clone().applyMatrix4(universe.matrixWorld) };
  }

  // ---- Views -------------------------------------------------------------------------------------------
  // The camera always faces one piece, the focus: the cube to begin with. 'cube' and 'piece' sit close to it,
  // 'universe' pulls back from it, and 'map' lays the flat sheet over whichever of those was showing.
  const viewButtons = [...document.querySelectorAll('.views [data-view]')];
  let focus = hub, under = 'cube', flown = 'cube:0', fly = null;
  function setView(next) {
    let started = false;
    if (next === 'map') { if (view !== 'map') under = view; }
    else {
      // Fly whenever the place to be has changed. A flight sets off from exactly the view the camera has,
      // drag and all, and ends looking straight at the piece.
      const place = `${next}:${ITEMS.indexOf(focus)}`;
      if (place !== flown) {
        started = true;
        // A flight that sets off with the lines showing keeps them until it lands.
        fly = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), start: performance.now(), lines: zoom > 0.5 };
        yaw = pitch = 0;
        flown = place;
      }
    }
    view = next;
    const stage = view === 'map' ? under : view;
    app.dataset.view = view;
    app.dataset.stage = stage === 'cube' ? 'cube' : 'away';
    map.hidden = view !== 'map';
    canvas.classList.remove('pick');
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    return started;
  }
  const nearView = () => (focus === hub ? 'cube' : 'piece');
  function flyTo(item, track) {
    unglow(item);
    if (item !== hub) {
      // Face the side of the piece that the camera is already on.
      item.card.getWorldPosition(centre);
      item.card.getWorldQuaternion(facing);
      item.side = normal.set(0, 0, 1).applyQuaternion(facing).dot(spot.copy(camera.position).sub(centre)) < 0 ? -1 : 1;
    }
    focus = item;
    // By way of the line that was clicked, but only on a flight that has just set off from where the camera is.
    if (setView(nearView()) && track) fly.track = track;
  }
  // Where the camera belongs: in front of the focus, square to it, further back in the universe.
  const centre = new THREE.Vector3(), normal = new THREE.Vector3(), up = new THREE.Vector3();
  const facing = new THREE.Quaternion(), look = new THREE.Matrix4(), turned = new THREE.Quaternion(), euler = new THREE.Euler();
  const seat = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  function findSeat(stage) {
    let distance = fit;
    if (focus === hub) { centre.set(0, 0, 0); normal.set(0, 0, 1); up.set(0, 1, 0); }
    else {
      focus.card.getWorldPosition(centre);
      focus.card.getWorldQuaternion(facing);
      normal.set(0, 0, focus.side).applyQuaternion(facing);
      up.set(0, 1, 0).applyQuaternion(facing);
      distance = (focus.kind === 'cube' ? 9 : 0) + Math.max(focus.height / 2 / tanV, focus.width / 2 / tanH) * 2.2;
    }
    seat.position.copy(centre).addScaledVector(normal, distance + (stage === 'universe' ? PULL : 0));
    seat.quaternion.setFromRotationMatrix(look.lookAt(seat.position, centre, up));
    // Away from the cube a drag turns the gaze.
    if (stage !== 'cube') seat.quaternion.multiply(turned.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ')));
  }
  // The map button opens the sheet and closes it again; the universe button pulls back and flies back in.
  viewButtons.forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.view;
    if (name === 'map') setView(view === 'map' ? under : 'map');
    else setView(view === 'universe' ? nearView() : 'universe');
  }));

  function land(stage) {
    fly = null;
    if (camera.fov !== LENS) { camera.fov = LENS; camera.updateProjectionMatrix(); }
    if (stage === 'piece') view1st(focus); // arriving in front of a piece counts as viewing it
  }

  // ---- Timing ------------------------------------------------------------------------------------------
  // Every flight eases in from rest and out to rest. Its speed rises smoothly over the first part of the
  // time, holds through the middle and falls smoothly to zero over the last part, with no jolt anywhere:
  // the speed follows a smoothstep up over `rise` of the time and back down over `fall` of it. This gives the
  // share of the way covered by time t, and the speed then as a share of the top speed.
  const ramp = x => x * x * x - x * x * x * x / 2; // the integral of smoothstep from 0 to x
  function travel(t, rise, fall) {
    const top = 1 / (1 - (rise + fall) / 2);
    if (t < rise) return { share: top * rise * ramp(t / rise), speed: smoothstep(t / rise) };
    if (t > 1 - fall) return { share: 1 - top * fall * ramp((1 - t) / fall), speed: smoothstep((1 - t) / fall) };
    return { share: top * (rise / 2 + t - rise), speed: 1 };
  }
  // When, as a share of the time, a share of the way has been covered.
  function timeAt(share, rise, fall) {
    let low = 0, high = 1;
    for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (travel(mid, rise, fall).share < share) low = mid; else high = mid; }
    return (low + high) / 2;
  }
  function smoothstep(value) { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); }
  // Smootherstep: an ease in and out whose speed and acceleration are both zero at either end.
  function smootherstep(value) { const x = Math.max(0, Math.min(1, value)); return x * x * x * (x * (x * 6 - 15) + 10); }
  // How long a flight takes: longer the further it goes and the more the camera turns.
  const flightTime = (distance, angle) => Math.max(900, Math.min(3500, 600 + distance * 3 + angle * 500));
  const rideTime = (distance, angle) => Math.max(2000, Math.min(9000, 800 + distance * 4 + angle * 500));
  const RIDE_RISE = 0.3, RIDE_FALL = 0.4, FLIGHT_RISE = 0.45, FLIGHT_FALL = 0.55;
  // How fast the camera should turn at most, in radians a second: onto a rail, and as it settles onto a piece
  // (before and after TURN_DELAY), and how much of the time left the final turn of a line ride is held back.
  const BOARD_TURN = 2.2, BOARD_TURN_MOST = 3, SETTLE_TURN = 2, SETTLE_TURN_MOST = 2.5, TURN_DELAY = 0.25;

  // ---- The ride ----------------------------------------------------------------------------------------
  // A line is ridden like a roller coaster track: the camera drops onto the rail where it was clicked,
  // sitting just above it and looking down it, gathers speed along it toward the piece, then brakes and
  // swings off the end round into its seat in front of the piece. The camera's rotation is one quaternion,
  // eased in parts, each a slerp between fixed rotations: it keeps its rotation at the click, facing about
  // where it was clicked, until it nears the rail; then turns gradually round to the rider's (looking
  // straight down the rail), carrying on a way along the rail; holds the rider's, with a gentle sway; and
  // turns from the rider's to the seat's as it slows down. The approach, the
  // rail and the swing are one path, travelled by its length with a single ease in and out.
  const RIDE_HEIGHT = 2.5; // how high above the rail
  // When the turn down the rail starts, and the soonest it may, as shares of the way to the rail; and the
  // latest it may end, as a share of the ride's time.
  const JOIN_TURN_START = 0.6, JOIN_TURN_EARLIEST = 0.35, BOARD_END = 0.75;
  const RIDE_STRETCH = 0.3, RIDE_LONGEST = 6000; // how much the turns may lengthen a ride, and the longest a ride may be, in ms
  const ahead = new THREE.Vector3(), lift = new THREE.Vector3(), lookAt = new THREE.Vector3();
  function ride(now, smooth, stage) {
    if (!fly.curve) {
      const { start, end } = fly.track;
      ahead.copy(end).sub(start);
      const length = ahead.length();
      ahead.normalize();
      // Up for the rider is the camera's own up, squared to the rail.
      lift.set(0, 1, 0).applyQuaternion(fly.quaternion).addScaledVector(ahead, -lift.dot(ahead));
      if (lift.lengthSq() < 1e-4) lift.set(0, 0, 1).addScaledVector(ahead, -ahead.z);
      lift.normalize();
      // The rail runs out about as far from the piece as the seat is, where the camera swings round into it.
      const rail = Math.max(0, length - seat.position.distanceTo(end));
      const steps = Math.max(1, Math.round(rail / 25));
      const points = [fly.position.clone()];
      for (let step = 0; step <= steps; step++)
        points.push(start.clone().addScaledVector(ahead, rail * step / steps).addScaledVector(lift, RIDE_HEIGHT));
      points.push(seat.position.clone());
      const kept = points.filter((point, index) => index === 0 || point.distanceTo(points[index - 1]) > 0.5);
      fly.curve = new THREE.CatmullRomCurve3(kept, false, 'centripetal');
      fly.lift = lift.clone();
      const total = fly.curve.getLength(), board = fly.position.distanceTo(start), off = seat.position.distanceTo(points[points.length - 2]);
      fly.on = Math.min(0.9, board / total); // how far along the way the rail is reached
      fly.off = Math.max(fly.on, 1 - off / total); // and left
      // The turning the ride does: onto the rail looking down it, and from there round to the seat.
      const railFrom = spot.copy(start).addScaledVector(lift, RIDE_HEIGHT);
      fly.rider = new THREE.Quaternion().setFromRotationMatrix(look.lookAt(railFrom, lookAt.copy(railFrom).add(ahead), lift));
      const boardAngle = fly.quaternion.angleTo(fly.rider), settleAngle = fly.rider.angleTo(seat.quaternion);
      // The ride's own time comes from its length and turns. The turns may stretch it by RIDE_STRETCH at
      // most, and never past RIDE_LONGEST, so the ride keeps its pace.
      const own = rideTime(total, boardAngle + settleAngle), longest = Math.min(RIDE_LONGEST, own * (1 + RIDE_STRETCH));
      fly.duration = Math.min(RIDE_LONGEST, own);
      const fastest = (angle, most) => 1.875 * angle / most * 1000; // smootherstep peaks at 1.875 times the mean
      // The turn down the rail starts once JOIN_TURN_START of the way to the rail is covered, and lasts long
      // enough not to turn faster than BOARD_TURN, carrying on along the rail if need be, and must be done by
      // BOARD_END of the ride to leave room for the final turn. When it does not fit: the ride stretches as
      // far as it may; then the turn may peak at up to BOARD_TURN_MOST; then it starts sooner, but never
      // before JOIN_TURN_EARLIEST of the way to the rail.
      const gentle = Math.max(400, fastest(boardAngle, BOARD_TURN)), brisk = Math.max(400, fastest(boardAngle, BOARD_TURN_MOST));
      fly.boardFrom = timeAt(fly.on * JOIN_TURN_START, RIDE_RISE, RIDE_FALL);
      if (fly.boardFrom + gentle / fly.duration > BOARD_END)
        fly.duration = Math.min(longest, Math.max(fly.duration, gentle / Math.max(1e-3, BOARD_END - fly.boardFrom)));
      let turnSpan = Math.min(gentle / fly.duration, BOARD_END - fly.boardFrom);
      if (turnSpan < brisk / fly.duration) {
        fly.boardFrom = Math.max(timeAt(fly.on * JOIN_TURN_EARLIEST, RIDE_RISE, RIDE_FALL), BOARD_END - brisk / fly.duration);
        turnSpan = BOARD_END - fly.boardFrom;
      }
      fly.boarded = fly.boardFrom + turnSpan;
      // The final turn would start as the camera starts to slow down or leaves the rail, whichever comes
      // first, or earlier so it never turns faster than SETTLE_TURN; it is then held back by TURN_DELAY of the
      // time left. The delay only gives way if the turn would then be faster than SETTLE_TURN_MOST, and if
      // that is not enough the ride stretches, as far as it may.
      let settle = Math.max(fly.boarded, Math.min(1 - RIDE_FALL, timeAt(fly.off, RIDE_RISE, RIDE_FALL)));
      settle = Math.max(fly.boarded, Math.min(settle, 1 - fastest(settleAngle, SETTLE_TURN) / fly.duration));
      const base = settle;
      settle += TURN_DELAY * (1 - settle);
      if ((1 - settle) * fly.duration < fastest(settleAngle, SETTLE_TURN_MOST))
        settle = Math.max(base, 1 - fastest(settleAngle, SETTLE_TURN_MOST) / fly.duration);
      fly.settle = settle;
      fly.duration = Math.min(longest, Math.max(fly.duration, fastest(settleAngle, SETTLE_TURN_MOST) / (1 - fly.settle + 1e-6)));
      fly.roll = new THREE.Quaternion();
    }
    const t = Math.max(0, Math.min(1, (now - fly.start) / fly.duration));
    const { share: s, speed } = travel(t, RIDE_RISE, RIDE_FALL);
    fly.curve.getPointAt(s, camera.position);
    // The rider's rotation: eyes on the track a little way ahead, with a gentle sway from side to side
    // while on the rail.
    const onRail = smooth((s - fly.on * 0.6) / (fly.on * 0.4 + 0.02)) * (1 - smooth((s - fly.off) / (1 - fly.off + 1e-3)));
    if (t < fly.boarded) camera.quaternion.copy(fly.quaternion).slerp(fly.rider, smootherstep((t - fly.boardFrom) / (fly.boarded - fly.boardFrom)));
    else if (t < fly.settle) {
      // On the rail, a gentle sway from side to side, rising over 0.4 s after the camera boards and dying
      // away over 0.4 s before the final turn; none at all when the time on the rail is too short for it.
      const span = fly.settle - fly.boarded, edge = Math.min(400 / fly.duration, span / 2) + 1e-6;
      const sway = smooth((t - fly.boarded) / edge) * smooth((fly.settle - t) / edge) * smooth((span * fly.duration - 800) / 800);
      fly.roll.setFromAxisAngle(spot.set(0, 0, 1), Math.sin((now - fly.start) * 0.0023) * 0.05 * sway);
      camera.quaternion.copy(fly.rider).multiply(fly.roll);
    } else camera.quaternion.copy(fly.rider).slerp(seat.quaternion, smootherstep((t - fly.settle) / (1 - fly.settle + 1e-6)));
    // The view widens a touch with speed on the rail, and is back to normal by the time the ride stops.
    camera.fov = LENS + 14 * speed * speed * onRail;
    camera.updateProjectionMatrix();
    if (t === 1) land(stage);
  }

  // ---- Frame -------------------------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const elapsed = Math.min(100, now - last);
    last = now;
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.start) / tween.duration);
      turn = tween.from + (tween.to - tween.from) * tween.ease(t);
      if (t === 1) tween = null;
    }
    cube.rotation.y = universe.rotation.y = -turn * Math.PI / 2;

    // The lines of the web come up as the camera pulls back.
    const stage = view === 'map' ? under : view;
    zoom = Math.max(0, Math.min(1, zoom + (stage === 'universe' || (fly && fly.lines) ? 1 : -1) * elapsed / 1200));
    lines.visible = zoom > 0;
    thread.opacity = 0.22 * zoom * zoom * (3 - 2 * zoom);
    // The camera sits in its seat, or is on its way there from wherever it was when the flight began.
    scene.updateMatrixWorld();
    findSeat(stage);
    if (fly) {
      const smooth = smoothstep;
      if (!fly.track) {
        if (!fly.duration) fly.duration = flightTime(fly.position.distanceTo(seat.position), fly.quaternion.angleTo(seat.quaternion));
        const t = Math.max(0, Math.min(1, (now - fly.start) / fly.duration)), eased = travel(t, FLIGHT_RISE, FLIGHT_FALL).share;
        camera.position.lerpVectors(fly.position, seat.position, eased);
        camera.quaternion.copy(fly.quaternion).slerp(seat.quaternion, eased); // from the rotation at the click
        if (t === 1) land(stage);
      } else ride(now, smooth, stage);
    } else {
      // At rest the camera sits in its seat, and a drag turns it directly. A flight sets off from whatever
      // position and rotation that leaves it with.
      camera.position.copy(seat.position);
      camera.quaternion.copy(seat.quaternion);
    }

    sizeGlows();
    renderer.render(scene, camera);
    time.textContent = `${clock(video.currentTime)}/${clock(video.duration)}`;
    const nearest = stop(turn), facing = [wrap(Math.floor(nearest)), wrap(Math.ceil(nearest))];
    if (view === 'cube' && !drag && !tween && Math.abs(turn - nearest) < 0.03) facing.forEach(unlock);
    if (view === 'map') drawThumb(wrap(Math.floor(turn)));
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(canvas);
  resize();
  showUnlocked();
  showPlayback();
  video.play().catch(showPlayback);
  requestAnimationFrame(frame);
})();
