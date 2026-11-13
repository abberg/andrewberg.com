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
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
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

  let fit = 60, tanV = 0.36, tanH = 0.6; // how far back the camera sits in the cube view, and the half angles of its view
  function resize() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Back the camera off until the cube fits both face on and turned to a corner, where it is widest.
    tanV = Math.tan(camera.fov * Math.PI / 360);
    tanH = tanV * camera.aspect;
    const v = tanV * 0.88, h = v * camera.aspect * 0.9;
    fit = Math.max(RADIUS / h, RADIUS + Y / v, X + X / h);
    camera.updateProjectionMatrix();
  }

  canvas.addEventListener('pointerdown', event => {
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
      yaw = Math.max(-1.2, Math.min(1.2, drag.yaw + dx * 0.0022));
      pitch = Math.max(-0.7, Math.min(0.7, drag.pitch + dy * 0.0022));
      return;
    }
    turn = drag.turn - dx / (canvas.clientWidth * 0.55);
    drag.samples.push([performance.now(), turn]);
    if (drag.samples.length > 8) drag.samples.shift();
  });
  // The triangles follow a mouse, which has a cursor to sit beside; touch and pen have none.
  const arrows = document.querySelector('.arrows');
  const follow = event => {
    if (event.pointerType !== 'mouse' || view !== 'cube' || canvas.classList.contains('pick')) { arrows.classList.remove('show'); return; }
    const box = app.getBoundingClientRect();
    arrows.style.transform = `translate(${event.clientX - box.left}px, ${event.clientY - box.top}px)`;
    arrows.classList.add('show');
  };
  canvas.addEventListener('pointerenter', follow);
  canvas.addEventListener('pointermove', follow);
  canvas.addEventListener('pointerleave', () => arrows.classList.remove('show'));
  const release = () => {
    if (!drag) return;
    canvas.classList.remove('dragging');
    // A click, rather than a drag, flies to whatever piece is under it.
    const picked = drag.moved ? null : pick(drag.x, drag.y);
    if (picked) flyTo(picked);
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
  // Each side unlocks the first time the cube settles on it, or on a corner that shows it.
  const STORE = 'story-cube-seen';
  const seen = new Set();
  try { for (const index of JSON.parse(localStorage.getItem(STORE) || '[]')) if (index >= 0 && index < 4) seen.add(index); } catch (error) { /* no storage */ }
  // The whole story was never on the cube alone: the last fifth stays locked, as the hidden final film was.
  const meter = document.querySelector('.unlock'), percent = document.querySelector('.percent');
  function showUnlocked() {
    const share = seen.size * 20;
    percent.textContent = `${share}% unlocked`;
    meter.style.setProperty('--p', `${share}%`);
  }
  function unlock(index) {
    if (seen.has(index)) return;
    seen.add(index);
    try { localStorage.setItem(STORE, JSON.stringify([...seen])); } catch (error) { /* no storage */ }
    showUnlocked();
  }

  // ---- The content --------------------------------------------------------------------------------------
  // The original held two cubes and 41 more films, recordings, pictures and papers. Only this cube is real
  // here: the rest are locked stand-ins, laid out once and shared by the map and the universe.
  // Each is [kind, left, top] on a 160 x 96 sheet. The first is this cube.
  const SIZES = { cube: [26, 11], video: [17, 8], audio: [17, 8], picture: [8, 6], paper: [5, 6] };
  const ITEMS = [
    ['cube', 67, 26], ['cube', 86, 39],
    ['video', 9, 28], ['video', 9, 45],
    ['audio', 27, 25], ['video', 27, 35], ['paper', 33, 46], ['video', 27, 57], ['audio', 27, 68],
    ['audio', 45, 13], ['video', 45, 25], ['video', 45, 46], ['video', 45, 57], ['video', 45, 68],
    ['audio', 71, 7], ['picture', 64, 18], ['picture', 67, 40], ['video', 71, 51], ['picture', 70, 64], ['video', 71, 72],
    ['picture', 84, 17], ['paper', 102, 54], ['video', 90, 64], ['paper', 92, 74], ['video', 90, 86],
    ['picture', 94, 8], ['video', 98, 17], ['video', 98, 28], ['audio', 101, 78],
    ['paper', 119, 23], ['video', 113, 41], ['video', 113, 52], ['video', 113, 68], ['paper', 121, 79],
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
  // A flat sheet of everything, joined by thin lines. This cube shows what it is playing; the rest are locked.
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
    const node = document.createElement(index ? 'div' : 'button');
    node.className = `item ${item.kind}`;
    node.style.cssText = `left:${item.left / 1.6}%;top:${item.top / 0.96}%;width:${item.width / 1.6}%;height:${item.height / 0.96}%`;
    if (index) node.title = 'Locked';
    else {
      node.type = 'button';
      node.classList.add('open');
      node.setAttribute('aria-label', 'The Heist');
      thumb = document.createElement('canvas');
      thumb.width = 260; thumb.height = 110;
      node.append(thumb);
      node.addEventListener('click', () => flyTo(hub));
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
  const sound = new THREE.LineBasicMaterial({ color: 0xa9c98f });
  const fills = {
    video: new THREE.MeshBasicMaterial({ color: 0x0b0b0c, side: THREE.DoubleSide }),
    audio: new THREE.MeshBasicMaterial({ color: 0x0b0b0c, side: THREE.DoubleSide }),
    picture: new THREE.MeshBasicMaterial({ color: 0x55555a, side: THREE.DoubleSide }),
    paper: new THREE.MeshBasicMaterial({ color: 0xb8b8b2, side: THREE.DoubleSide }),
    cube: new THREE.MeshBasicMaterial({ color: 0x0b0b0c }),
  };
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
    const card = new THREE.Mesh(geometry, fills[item.kind]);
    card.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge));
    if (item.kind === 'audio') {
      const points = wave(40, item.width * 0.8, item.height).map(([x, y]) => new THREE.Vector3(x - item.width * 0.4, y - item.height / 2, 0.05));
      card.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), sound));
    }
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
  const reach = new THREE.Mesh(new THREE.BoxGeometry(46, 34, 46), new THREE.MeshBasicMaterial({ visible: false }));
  scene.add(reach);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(threads), thread);
  lines.visible = false;
  universe.add(lines);
  const PULL = 110; // how much further back the camera sits in the universe
  let zoom = 0, yaw = 0, pitch = 0;

  // ---- Picking -----------------------------------------------------------------------------------------
  // A click lands on a piece, or on a line, which stands for whichever of its two pieces is nearer the click.
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), spot = new THREE.Vector3();
  raycaster.params.Line.threshold = 2.5;
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
      return item;
    }
    if (zoom < 0.5) return null;
    const [line] = raycaster.intersectObject(lines);
    if (!line) return null;
    universe.worldToLocal(spot.copy(line.point));
    const from = ends[line.index], to = ends[line.index + 1];
    return spot.distanceTo(from.place) < spot.distanceTo(to.place) ? from : to;
  }

  // ---- Views -------------------------------------------------------------------------------------------
  // The camera always faces one piece, the focus: the cube to begin with. 'cube' and 'piece' sit close to it,
  // 'universe' pulls back from it, and 'map' lays the flat sheet over whichever of those was showing.
  const viewButtons = [...document.querySelectorAll('.views [data-view]')];
  let focus = hub, under = 'cube', flown = 'cube:0', fly = null;
  function setView(next) {
    if (next === 'map') { if (view !== 'map') under = view; }
    else {
      // Fly whenever the place to be has changed, and start each flight looking straight at the piece.
      const place = `${next}:${ITEMS.indexOf(focus)}`;
      if (place !== flown) {
        fly = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), start: performance.now() };
        yaw = pitch = 0;
        flown = place;
      }
    }
    view = next;
    const stage = view === 'map' ? under : view;
    app.dataset.view = view;
    app.dataset.stage = stage === 'cube' ? 'cube' : 'away';
    map.hidden = view !== 'map';
    arrows.classList.remove('show');
    canvas.classList.remove('pick');
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  }
  const nearView = () => (focus === hub ? 'cube' : 'piece');
  function flyTo(item) {
    if (item !== hub) {
      // Face the side of the piece that the camera is already on.
      item.card.getWorldPosition(centre);
      item.card.getWorldQuaternion(facing);
      item.side = normal.set(0, 0, 1).applyQuaternion(facing).dot(spot.copy(camera.position).sub(centre)) < 0 ? -1 : 1;
    }
    focus = item;
    setView(nearView());
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
    zoom = Math.max(0, Math.min(1, zoom + (stage === 'universe' ? 1 : -1) * elapsed / 1200));
    lines.visible = zoom > 0;
    thread.opacity = 0.22 * zoom * zoom * (3 - 2 * zoom);
    // The camera sits in its seat, or is on its way there from wherever it was when the flight began.
    scene.updateMatrixWorld();
    findSeat(stage);
    if (fly) {
      const t = Math.min(1, (now - fly.start) / 1400), eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(fly.position, seat.position, eased);
      camera.quaternion.copy(fly.quaternion).slerp(seat.quaternion, eased);
      if (t === 1) fly = null;
    } else {
      camera.position.copy(seat.position);
      camera.quaternion.copy(seat.quaternion);
    }

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
