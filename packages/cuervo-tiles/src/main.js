// Tile Pyramid: how the Cuervo Nation map loaded.
// The map had four zoom levels, each cut into tiles of 221 × 141 pixels. Here they are stacked in a plan-oblique
// (military) projection: every level keeps its true shape, turned on the page, and stands straight up from the one
// below, with the widest level on top. Zooming slides the built-in map to the new scale first, then the level's
// tiles load one at a time, nearest the centre of the view first.
(() => {
  const W = 884, H = 564;                 // the stage, and the widest level of the map, in pixels
  // Scales from the original's zoom offsets 0, 2, 5 and 7, at half a step each.
  const LEVELS = [
    { scale: 1, cols: 4 },
    { scale: 2, cols: 8 },
    { scale: 3.5, cols: 14 },
    { scale: 4.5, cols: 18 },
  ];
  LEVELS.forEach((level, index) => {
    level.index = index;
    level.count = level.cols * level.cols;          // tiles are 221 × 141 at every level, so each grid is square
    level.tw = W / level.cols; level.th = H / level.cols;   // a tile's size on the plan, in widest-level pixels
    level.tiles = Array.from({ length: level.count }, (_, i) => ({ col: i % level.cols, row: Math.floor(i / level.cols) }));
    level.loaded = new Map();       // tile → when it arrived. Tiles stay loaded when the visitor zooms away.
    level.queue = null;             // the load order, sorted the first time the level is shown
    level.cursor = 0;
  });
  const TOP = LEVELS.length - 1;

  const ANGLE = 25 * Math.PI / 180;       // how far the plan is turned
  const GAP = 125;                        // how far each level stands from the next, in plan pixels
  const COS = Math.cos(ANGLE), SIN = Math.sin(ANGLE);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SLIDE = calm ? 0 : 1000;          // the original's tween of the built-in map to the new scale
  const DROP = calm ? 0 : 320;            // how long a tile takes to settle once it has arrived

  let INK = '#16181A', PAPER = '#F5F5F1', MUTE = '#5E635E', ACCENT = '#C9A227';

  // ---- Elements

  const scene = document.getElementById('scene'), g = scene.getContext('2d');
  const view = document.getElementById('view'), v = view.getContext('2d');
  const hint = document.getElementById('hint'), status = document.getElementById('status');
  const inButton = document.getElementById('in'), outButton = document.getElementById('out');
  const track = document.getElementById('track'), knob = document.getElementById('knob');
  const bar = document.getElementById('bar'), count = document.getElementById('count');
  const list = document.getElementById('levels');

  LEVELS.forEach(level => {
    const stop = document.createElement('button');
    stop.type = 'button'; stop.className = 'stop';
    stop.style.left = `${level.index / TOP * 100}%`;
    stop.setAttribute('aria-label', `Zoom level ${level.index + 1}`);
    stop.addEventListener('click', () => zoomTo(level.index));
    track.insertBefore(stop, knob);
    const row = document.createElement('li');
    row.innerHTML = `<span>Level ${level.index + 1}</span><span>${level.cols} × ${level.cols}</span><span class="n">${Math.round(W * level.scale)} px</span>`;
    list.append(row);
    level.row = row;
  });

  // ---- The map. The tiles are cut from the low-resolution map built into the site,
  // and a blurrier copy stands in for that map scaled up past its size.

  const image = new Image();
  image.src = './island-map.jpg';
  const soft = document.createElement('canvas');
  let ready = false;
  image.decode().then(() => {
    soft.width = Math.round(W / 8); soft.height = Math.round(H / 8);
    soft.getContext('2d').drawImage(image, 0, 0, soft.width, soft.height);
    ready = true;
  }).catch(() => {});

  // ---- State

  let current = 0;                  // the level in view
  let cx = W / 2, cy = H / 2;       // the centre of the view, in widest-level pixels
  let phase = 'built-in';           // built-in, slide, loading, done
  let phaseStart = 0, budget = 0, dropped = null, resumed = 0;
  let from = { scale: 1, cx, cy };  // where the slide started, for the visitor's view

  let S = 1, ox = 0, oy = 0, dpr = 1;
  LEVELS[0].tiles.forEach((_, i) => LEVELS[0].loaded.set(i, -1e9));   // the widest level is built in

  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function delayFor(level) { return Math.min(90, Math.max(6, 2600 / level.count)); }

  function clamp(level, x, y) {
    const hw = W / level.scale / 2, hh = H / level.scale / 2;
    return [Math.min(W - hw, Math.max(hw, x)), Math.min(H - hh, Math.max(hh, y))];
  }
  function clampView() { [cx, cy] = clamp(LEVELS[current], cx, cy); }

  // Where the visitor's view is right now: mid-slide it is between the old scale and centre and the new ones.
  function liveView(now) {
    const level = LEVELS[current];
    if (phase !== 'slide') return { scale: level.scale, cx, cy };
    const t = ease(Math.min(1, (now - phaseStart) / SLIDE));
    return { scale: from.scale + (level.scale - from.scale) * t, cx: from.cx + (cx - from.cx) * t, cy: from.cy + (cy - from.cy) * t };
  }

  function zoomTo(index) {
    index = Math.max(0, Math.min(TOP, index));
    if (index === current) return;
    const now = performance.now();
    from = liveView(now);
    const leaving = LEVELS[current];
    dropped = phase === 'loading' && leaving.loaded.size < leaving.count ? current : null;
    current = index;
    clampView();
    if (index === 0) phase = 'built-in';
    else { phase = SLIDE ? 'slide' : 'loading'; phaseStart = now; budget = 0; }
    if (!SLIDE && index > 0) show(LEVELS[index]);
    touched();
    update();
  }

  // When the slide finishes: sort the level's tiles by distance from the centre of the view, the first time only,
  // then load whatever has not arrived yet, in that order.
  function show(level) {
    resumed = level.loaded.size;
    if (level.queue) return;
    const distance = i => {
      const tile = level.tiles[i], dx = (tile.col + 0.5) * level.tw - cx, dy = (tile.row + 0.5) * level.th - cy;
      return dx * dx + dy * dy;
    };
    level.queue = level.tiles.map((_, i) => i).sort((a, b) => distance(a) - distance(b));
  }

  function step(now, dt) {
    const level = LEVELS[current];
    if (phase === 'slide' && now - phaseStart >= SLIDE) { phase = 'loading'; budget = 0; show(level); update(); }
    if (phase === 'loading') {
      const delay = delayFor(level);
      budget += dt;
      while (budget >= delay) {
        budget -= delay;
        while (level.cursor < level.queue.length && level.loaded.has(level.queue[level.cursor])) level.cursor++;
        if (level.cursor >= level.queue.length) break;
        level.loaded.set(level.queue[level.cursor++], now - budget);
      }
      if (level.loaded.size === level.count) phase = 'done';
      update();
    }
  }

  // ---- Projection. A point (u, v) on a level's plan, at height z, lands at
  // x = S · (u cos θ − v sin θ), y = S · (u sin θ + v cos θ − z), around the centre of the stage.

  const height = level => (TOP - level.index) * GAP;   // the widest level on top
  function project(u, v, z) {
    const x = u - W / 2, y = v - H / 2;
    return [ox + S * (x * COS - y * SIN), oy + S * (x * SIN + y * COS - z)];
  }
  function planTransform(z) {
    const [e, f] = project(0, 0, z);
    g.setTransform(S * COS, S * SIN, -S * SIN, S * COS, e, f);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = scene.getBoundingClientRect();
    scene.width = Math.max(1, Math.round(box.width * dpr));
    scene.height = Math.max(1, Math.round(box.height * dpr));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    S = 1; ox = 0; oy = 0;
    for (const z of [0, TOP * GAP]) for (const [u, w] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const [x, y] = project(u, w, z);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const pad = (box.width < 500 ? 10 : 24) * dpr;
    S = Math.min((scene.width - pad * 2) / (x1 - x0), (scene.height - pad * 2) / (y1 - y0));
    ox = scene.width / 2 - S * (x0 + x1) / 2;
    oy = scene.height / 2 - S * (y0 + y1) / 2;
    const inset = view.getBoundingClientRect();
    view.width = Math.max(1, Math.round(inset.width * dpr));
    view.height = Math.max(1, Math.round(inset.height * dpr));
  }

  // ---- Drawing the stack

  function outline(z, x, y, w, h) {
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => project(a, b, z));
    g.beginPath();
    corners.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    return corners;
  }

  function grid(level, z) {
    g.beginPath();
    for (let c = 1; c < level.cols; c++) {
      const [ax, ay] = project(c * level.tw, 0, z), [bx, by] = project(c * level.tw, H, z);
      g.moveTo(ax, ay); g.lineTo(bx, by);
    }
    for (let r = 1; r < level.cols; r++) {
      const [ax, ay] = project(0, r * level.th, z), [bx, by] = project(W, r * level.th, z);
      g.moveTo(ax, ay); g.lineTo(bx, by);
    }
    g.stroke();
  }

  const settled = (at, now) => {
    const p = DROP ? Math.min(1, Math.max(0, (now - at) / DROP)) : 1;
    return 1 - (1 - p) * (1 - p) * (1 - p);
  };
  const tilesShowing = level => level.index === 0 || (level.index === current && phase !== 'slide');

  function drawStack(now) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = PAPER; g.fillRect(0, 0, scene.width, scene.height);
    const line = Math.max(1, dpr);
    const frames = [];

    // Bottom to top, so a level hides the ones below it. The levels above the one in view are drawn as outlines only.
    for (let k = TOP; k >= 0; k--) {
      const level = LEVELS[k], z = height(level), active = k === current, above = k < current;

      if (!above) { outline(z, 0, 0, W, H); g.fillStyle = PAPER; g.fill(); }

      if (ready && active) {
        g.save();
        outline(z, 0, 0, W, H); g.clip();
        planTransform(z);
        if (k > 0) { g.globalAlpha = 0.5; g.drawImage(soft, 0, 0, W, H); }
        if (tilesShowing(level)) for (const [i, at] of level.loaded) {
          const tile = level.tiles[i], x = tile.col * level.tw, y = tile.row * level.th, e = settled(at, now);
          planTransform(z + (1 - e) * GAP * 0.45);
          g.globalAlpha = e;
          g.drawImage(image, x, y, level.tw, level.th, x - 0.3, y - 0.3, level.tw + 0.6, level.th + 0.6);
        }
        g.restore();
      } else if (!active && !above && k > 0 && level.loaded.size) {
        // Tiles already loaded on a level below the one in view, kept for when the visitor comes back.
        g.save();
        planTransform(z);
        g.fillStyle = MUTE; g.globalAlpha = 0.22;
        for (const i of level.loaded.keys()) { const t = level.tiles[i]; g.fillRect(t.col * level.tw, t.row * level.th, level.tw, level.th); }
        g.restore();
      }

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = active ? 0.35 : above ? 0.25 : 0.4;
      g.strokeStyle = active ? INK : MUTE; g.lineWidth = active ? line : line * 0.75;
      grid(level, z);
      g.globalAlpha = 1;
      outline(z, 0, 0, W, H);
      g.strokeStyle = active ? INK : MUTE; g.lineWidth = active ? line * 1.6 : line; g.stroke();

      const [lx, ly] = project(0, H, z);
      g.font = `${active ? 700 : 400} ${Math.round(11 * dpr)}px ui-monospace, Menlo, Consolas, monospace`;
      g.fillStyle = active ? INK : MUTE; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(`${k + 1}`, lx - 10 * dpr, ly);

      const w = W / level.scale, h = H / level.scale;
      frames[k] = [cx - w / 2, cy - h / 2, w, h];
    }

    // The view on every level, joined at the corners into a column that narrows as the levels get closer.
    const corners = frames.map((frame, k) => [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => project(frame[0] + a * frame[2], frame[1] + b * frame[3], height(LEVELS[k]))));
    g.setLineDash([3 * dpr, 4 * dpr]);
    g.strokeStyle = MUTE; g.lineWidth = line;
    g.beginPath();
    for (let k = 0; k < TOP; k++) for (let c = 0; c < 4; c++) { g.moveTo(...corners[k][c]); g.lineTo(...corners[k + 1][c]); }
    for (let k = 0; k <= TOP; k++) if (k !== current) { g.moveTo(...corners[k][0]); for (let c = 1; c <= 4; c++) g.lineTo(...corners[k][c % 4]); }
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = ACCENT; g.lineWidth = line * 3;
    g.beginPath(); g.moveTo(...corners[current][0]); for (let c = 1; c <= 4; c++) g.lineTo(...corners[current][c % 4]); g.stroke();
    const [px, py] = project(cx, cy, height(LEVELS[current]));
    g.fillStyle = ACCENT; g.beginPath(); g.arc(px, py, 3.5 * dpr, 0, Math.PI * 2); g.fill();
  }

  // ---- Drawing what the visitor sees: the built-in map scaled to the view, with the level's tiles over it.

  function drawView(now) {
    const w = view.width, h = view.height, k = w / W;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.globalAlpha = 1;
    v.fillStyle = PAPER; v.fillRect(0, 0, w, h);
    if (!ready) return;
    const live = liveView(now), level = LEVELS[current];
    // A plan point (u, y) lands at ((u − left) · scale · k, (y − top) · scale · k).
    const left = live.cx - W / live.scale / 2, top = live.cy - H / live.scale / 2;
    v.setTransform(live.scale * k, 0, 0, live.scale * k, -left * live.scale * k, -top * live.scale * k);
    v.drawImage(live.scale > 1.01 ? soft : image, 0, 0, W, H);
    if (current > 0 && tilesShowing(level)) for (const [i, at] of level.loaded) {
      const tile = level.tiles[i], x = tile.col * level.tw, y = tile.row * level.th;
      v.globalAlpha = settled(at, now);
      v.drawImage(image, x, y, level.tw, level.th, x - 0.2, y - 0.2, level.tw + 0.4, level.th + 0.4);
    }
  }

  // ---- Panel

  let lastStatus = '';
  function update() {
    const level = LEVELS[current], n = level.index + 1;
    inButton.disabled = current === TOP;
    outButton.disabled = current === 0;
    knob.style.left = `${current / TOP * 100}%`;
    LEVELS.forEach(item => item.row.classList.toggle('on', item === level));
    const shown = phase === 'slide' ? 0 : level.loaded.size;
    bar.style.width = `${shown / level.count * 100}%`;
    const tally = `${shown} / ${level.count} tiles`;
    if (count.textContent !== tally) count.textContent = tally;
    let text;
    if (phase === 'built-in') text = 'The widest view: 16 tiles built into the site, so the whole island is on screen from the start.';
    else if (phase === 'slide') text = `Zooming to level ${n}. The built-in map scales up while the view slides into place${dropped ? `, and level ${dropped + 1} stops loading` : ''}.`;
    else if (phase === 'loading') text = resumed
      ? `Back on level ${n}: the ${resumed} tiles already loaded show at once, and the rest pick up where they stopped.`
      : `Loading level ${n} one tile at a time, nearest the centre of the view first.`;
    else text = `Level ${n} is sharp: all ${level.count} tiles have arrived.${current < TOP ? ' Zoom in again.' : ''}`;
    if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
  }

  // ---- Theme. Embedded in a page of the site, the demo follows that page's light or dark theme.
  // On its own it uses the theme saved by the site, or the system's.

  function theme() {
    try { const set = parent !== window && parent.document.documentElement.dataset.theme; if (set) return set; } catch {}
    try { const saved = localStorage.getItem('theme'); if (saved === 'light' || saved === 'dark') return saved; } catch {}
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    document.documentElement.dataset.theme = theme() === 'dark' ? 'dark' : 'light';
    for (const name of ['--bg', '--ink', '--mute']) {
      let value = '';
      try { if (parent !== window) value = getComputedStyle(parent.document.documentElement).getPropertyValue(name).trim(); } catch {}
      if (value) document.documentElement.style.setProperty(name, value); else document.documentElement.style.removeProperty(name);
    }
    const style = getComputedStyle(document.documentElement);
    INK = style.getPropertyValue('--ink').trim(); PAPER = style.getPropertyValue('--bg').trim();
    MUTE = style.getPropertyValue('--mute').trim(); ACCENT = style.getPropertyValue('--accent').trim();
  }
  applyTheme();
  try { new MutationObserver(applyTheme).observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('storage', applyTheme);

  // ---- Input. Dragging moves the view across the level in view, as dragging the map did.

  function touched() { hint.classList.add('gone'); }
  let dragging = false, lastX = 0, lastY = 0;
  scene.addEventListener('pointerdown', event => {
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    scene.setPointerCapture(event.pointerId); scene.classList.add('dragging');
  });
  scene.addEventListener('pointermove', event => {
    if (!dragging || phase === 'slide') return;
    const dx = (event.clientX - lastX) * dpr / S, dy = (event.clientY - lastY) * dpr / S;
    lastX = event.clientX; lastY = event.clientY;
    cx += dx * COS + dy * SIN; cy += -dx * SIN + dy * COS;
    clampView(); touched();
  });
  function release() { dragging = false; scene.classList.remove('dragging'); }
  scene.addEventListener('pointerup', release);
  scene.addEventListener('pointercancel', release);
  window.addEventListener('keydown', event => {
    const move = 40 / LEVELS[current].scale;
    if (event.key === '+' || event.key === '=') zoomTo(current + 1);
    else if (event.key === '-' || event.key === '_') zoomTo(current - 1);
    else if (phase === 'slide') return;
    else if (event.key === 'ArrowLeft') cx -= move;
    else if (event.key === 'ArrowRight') cx += move;
    else if (event.key === 'ArrowUp') cy -= move;
    else if (event.key === 'ArrowDown') cy += move;
    else return;
    event.preventDefault(); clampView(); touched();
  });
  inButton.addEventListener('click', () => zoomTo(current + 1));
  outButton.addEventListener('click', () => zoomTo(current - 1));

  // ---- Loop

  update();
  let before = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - before); before = now;
    step(now, dt);
    drawStack(now);
    drawView(now);
    requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe(document.body);
  resize();
  requestAnimationFrame(frame);
})();
