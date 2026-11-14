// Parallax Rings: how a street that loops all the way round can scroll in layers.
// Every layer is a ring of same-sized tiles. A layer that scrolls at half the speed of the street
// needs a ring half as long, so that one lap of the street is also exactly one lap of every layer.
(() => {
  const H = 360;            // the scene's height, in scene units
  const T = 300;            // the width of one tile, in scene units
  const INK = '#1c1d1f';
  const PAPER = '#F5F5F1';

  // Back to front. `tiles` sets the ring's length; `loose` is a speed picked by eye, for comparison.
  const LAYERS = [
    { name: 'Sky', tiles: 4, color: '#3f88ad', band: [0, 150], loose: 0.2 },
    { name: 'Skyline', tiles: 6, color: '#7d63ad', band: [50, 240], loose: 0.48 },
    { name: 'Shops', tiles: 9, color: '#c8701f', band: [115, 305], loose: 0.72 },
    { name: 'Street', tiles: 14, color: '#c22f68', band: [222, 360], loose: 1 },
  ];
  const FRONT = LAYERS[LAYERS.length - 1].tiles;
  const LAP = FRONT * T;
  LAYERS.forEach((layer, index) => {
    layer.index = index;
    layer.length = layer.tiles * T;
    layer.speed = layer.tiles / FRONT;
  });

  const mod = (n, m) => ((n % m) + m) % m;
  function random(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];
  const between = (r, a, b) => a + r() * (b - a);

  // ---- The artwork. Each layer is a list of items placed along its ring, drawn in ring coordinates.

  function box(c, x, y, w, h, fill) {
    c.fillStyle = fill; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
  }
  function shape(c, points, fill) {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.stroke();
  }
  function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

  function sky(layer) {
    const r = random(11), items = [];
    // The landmark at the seam: a blimp.
    items.push({ x0: -70, x1: 70, draw(c) {
      shape(c, [[38, 52], [62, 38], [62, 82], [38, 68]], '#e9c24a');
      c.beginPath(); c.ellipse(0, 60, 52, 22, 0, 0, Math.PI * 2); c.fillStyle = '#e8739b'; c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, 60, 52, 8, 0, 0, Math.PI); c.stroke();
      box(c, -14, 82, 28, 9, '#f3ead2');
    } });
    const count = 9;
    for (let i = 0; i < count; i++) {
      const x = 140 + (i + r() * 0.6) * (layer.length - 280) / count, y = between(r, 34, 112);
      const puffs = Array.from({ length: 5 }, (_, n) => [x + (n - 2) * between(r, 15, 21), y - (n % 2) * between(r, 5, 14), between(r, 13, 24)]);
      items.push({ x0: x - 80, x1: x + 80, draw(c) {
        c.fillStyle = '#e3f1e6';
        for (const [px, py, pr] of puffs) { c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill(); }
        c.fillRect(puffs[0][0], y, puffs[4][0] - puffs[0][0], 16);
      } });
    }
    return items;
  }

  function skyline(layer) {
    const r = random(23), items = [], base = 240;
    const fills = ['#cbc7dc', '#b9c6d2', '#d8d2c5', '#c0d0c6', '#dcc9d3', '#c6cfdc'];
    // The landmark: a tall pink tower with a spire.
    items.push({ x0: -40, x1: 40, draw(c) {
      box(c, -32, 96, 64, base - 96, '#ec9bb8');
      box(c, -20, 74, 40, 22, '#f2b6ca');
      shape(c, [[-9, 74], [0, 52], [9, 74]], '#f2b6ca');
      for (let y = 106; y < base - 12; y += 16) line(c, -24, y, 24, y);
    } });
    let x = 40;
    while (layer.length - 40 - x > 26) {
      const w = Math.min(between(r, 42, 96), layer.length - 40 - x), h = between(r, 62, 158), top = base - h;
      const fill = pick(r, fills), kind = Math.floor(r() * 4), left = x, columns = Math.max(1, Math.floor((w - 12) / 13)), rows = Math.floor((h - 18) / 17);
      const lit = Array.from({ length: columns * rows }, () => r() < 0.72);
      items.push({ x0: left, x1: left + w, draw(c) {
        box(c, left, top, w, h, fill);
        if (kind === 0) shape(c, [[left + w * 0.2, top], [left + w / 2, top - 22], [left + w * 0.8, top]], fill);
        if (kind === 1) box(c, left + w * 0.25, top - 14, w * 0.5, 14, fill);
        if (kind === 2) shape(c, [[left, top], [left, top - 12], [left + w, top - 26], [left + w, top]], fill);
        c.fillStyle = '#1c1d1f55';
        const pitch = (w - 12) / columns;
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
          if (lit[row * columns + col]) c.fillRect(left + 6 + col * pitch + pitch / 2 - 3, top + 12 + row * 17, 6, 9);
        }
      } });
      x += w;
    }
    return items;
  }

  function shops(layer) {
    const r = random(37), items = [], base = 305;
    const walls = ['#eadfb0', '#dcb99a', '#c9d6a9', '#e6cbc1', '#bccdd8', '#dac6e0', '#e8d39a'];
    const trims = ['#c8443c', '#2f7d8a', '#5b7a3a', '#8a4f9e', '#d98a2b'];
    // The landmark: a clock tower.
    items.push({ x0: -72, x1: 72, draw(c) {
      box(c, -64, 150, 128, base - 150, '#8fc7c2');
      shape(c, [[-72, 150], [0, 122], [72, 150]], '#2f7d8a');
      c.beginPath(); c.arc(0, 192, 24, 0, Math.PI * 2); c.fillStyle = '#f7f1dc'; c.fill(); c.stroke();
      line(c, 0, 192, 0, 175); line(c, 0, 192, 12, 198);
      box(c, -22, 246, 44, base - 246, '#2f5d63');
      box(c, -52, 232, 20, 30, '#f7f1dc'); box(c, 32, 232, 20, 30, '#f7f1dc');
    } });
    let x = 72;
    while (layer.length - 72 - x > 60) {
      let w = between(r, 92, 172);
      if (layer.length - 72 - x - w < 60) w = layer.length - 72 - x;
      const h = between(r, 78, 150), top = base - h, left = x, wall = pick(r, walls), trim = pick(r, trims);
      const columns = Math.max(1, Math.floor((w - 16) / 30)), rows = Math.max(0, Math.floor((h - 62) / 36)), awning = r() < 0.6, stripes = Math.max(3, Math.round(w / 18));
      items.push({ x0: left, x1: left + w, draw(c) {
        box(c, left, top, w, h, wall);
        box(c, left - 3, top - 6, w + 6, 8, trim);
        const pitch = (w - 16) / columns;
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
          const wx = left + 8 + col * pitch + pitch / 2 - 8, wy = top + 14 + row * 36;
          box(c, wx, wy, 16, 22, '#f7f1dc');
          box(c, wx - 5, wy, 5, 22, trim); box(c, wx + 16, wy, 5, 22, trim);
        }
        const floor = base - 44;
        box(c, left + 10, floor + 8, w * 0.5, 26, '#bfe0e6');
        box(c, left + w * 0.5 + 22, floor + 4, 22, 40, trim);
        if (awning) {
          const sw = (w - 8) / stripes;
          for (let n = 0; n < stripes; n++) shape(c, [[left + 4 + n * sw, floor - 6], [left + 4 + (n + 1) * sw, floor - 6], [left + 2 + (n + 1) * sw, floor + 8], [left + 2 + n * sw, floor + 8]], n % 2 ? '#f7f1dc' : trim);
        } else {
          box(c, left + 12, floor - 10, w - 24, 12, '#f7f1dc');
        }
      } });
      x += w;
    }
    return items;
  }

  function street(layer) {
    const r = random(53), items = [], ground = 292;
    const stones = Array.from({ length: 150 }, () => [r() * layer.length, between(r, ground + 12, H - 6), between(r, 2, 5)]);
    items.push({ x0: 0, x1: layer.length, draw(c) {
      c.fillStyle = '#c2c4ba'; c.fillRect(0, ground, layer.length, H - ground);
      c.fillStyle = '#d6d7ce'; c.fillRect(0, ground, layer.length, 12);
      line(c, 0, ground, layer.length, ground); line(c, 0, ground + 12, layer.length, ground + 12);
      c.fillStyle = '#e9c24a';
      for (let x = 20; x < layer.length; x += 100) { c.fillRect(x, 338, 60, 5); c.strokeRect(x, 338, 60, 5); }
      c.fillStyle = '#a9ab9f';
      for (const [x, y, s] of stones) { c.beginPath(); c.ellipse(x, y, s, s * 0.5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    } });
    // The landmark: a kiosk.
    items.push({ x0: -70, x1: 70, draw(c) {
      box(c, -52, 262, 104, 48, '#f3ead2');
      box(c, -44, 270, 60, 22, '#3b3f58');
      box(c, 24, 270, 20, 40, '#c8443c');
      for (let n = 0; n < 8; n++) shape(c, [[-64 + n * 16, 246], [-48 + n * 16, 246], [-50 + n * 16, 264], [-66 + n * 16, 264]], n % 2 ? '#f7f1dc' : '#e8739b');
      shape(c, [[-64, 246], [-40, 230], [40, 230], [64, 246]], '#e8739b');
      for (let n = 0; n < 4; n++) box(c, -40 + n * 14, 296, 11, 14, pick(random(n + 2), ['#e9c24a', '#8fc7c2', '#f7f1dc']));
    } });
    let x = 110;
    while (x < layer.length - 110) {
      const at = x, kind = Math.floor(r() * 5), tint = pick(r, ['#3f88ad', '#c8443c', '#5b7a3a', '#e9c24a']);
      items.push({ x0: at - 50, x1: at + 60, draw(c) {
        if (kind === 0) { // a lamp post
          box(c, at - 2.5, 236, 5, 70, '#3b3f58'); box(c, at - 6, 300, 12, 8, '#3b3f58');
          shape(c, [[at - 9, 236], [at + 9, 236], [at + 6, 226], [at - 6, 226]], '#f7e9a6');
        } else if (kind === 1) { // bollards
          for (const dx of [0, 22, 44]) { box(c, at + dx - 3, 286, 6, 26, tint); c.beginPath(); c.arc(at + dx, 286, 4.5, 0, Math.PI * 2); c.fillStyle = tint; c.fill(); c.stroke(); }
        } else if (kind === 2) { // a hydrant
          box(c, at - 6, 292, 12, 20, '#c8443c'); box(c, at - 9, 298, 18, 5, '#c8443c');
          c.beginPath(); c.arc(at, 292, 6, Math.PI, 0); c.fillStyle = '#c8443c'; c.fill(); c.stroke();
        } else if (kind === 3) { // a bench
          box(c, at - 26, 290, 52, 6, '#b98a55'); box(c, at - 26, 278, 52, 6, '#b98a55');
          box(c, at - 22, 296, 4, 14, '#3b3f58'); box(c, at + 18, 296, 4, 14, '#3b3f58');
        } else { // a tree in a planter
          box(c, at - 3, 262, 6, 40, '#8a6a4a');
          c.fillStyle = '#7fb069';
          for (const [dx, dy, pr] of [[-12, 252, 16], [12, 250, 17], [0, 238, 18]]) { c.beginPath(); c.arc(at + dx, dy, pr, 0, Math.PI * 2); c.fill(); c.stroke(); }
          box(c, at - 14, 300, 28, 12, '#d98a2b');
        }
      } });
      x += between(r, 110, 230);
    }
    return items;
  }

  const ART = [sky, skyline, shops, street];
  LAYERS.forEach(layer => { layer.items = ART[layer.index](layer); });

  // ---- State

  const scene = document.getElementById('scene'), rings = document.getElementById('rings');
  const g = scene.getContext('2d'), rg = rings.getContext('2d');
  const hint = document.getElementById('hint'), status = document.getElementById('status');
  const tilesButton = document.getElementById('tiles'), fitButton = document.getElementById('fit');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DRIFT = calm ? 0 : 70;

  let x = 0;                // where the viewer is along the street, in scene units; one lap is LAP
  let velocity = DRIFT;
  let fit = 1, fitTarget = 1;   // 1: rings sized to their speed. 0: speeds picked by eye.
  let showTiles = true;
  let held = 0, dragging = false, lastMove = 0, idleSince = 0;
  let scale = 1, tilePixels = T, viewWidth = 800, dpr = 1;
  const cache = new Map();

  const legend = document.getElementById('legend');
  const rateCells = [...LAYERS].reverse().map(layer => {
    const row = document.createElement('li');
    row.innerHTML = `<i style="background:${layer.color}"></i><span>${layer.name}</span><span class="n">${layer.tiles} tiles</span><span class="r"></span>`;
    legend.append(row);
    return [layer, row.lastChild];
  });

  function rate(layer) { return layer.loose + (layer.speed - layer.loose) * fit; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = scene.getBoundingClientRect();
    scene.width = Math.max(1, Math.round(bounds.width * dpr));
    scene.height = Math.max(1, Math.round(bounds.height * dpr));
    // A tile is a whole number of pixels wide, so neighbours butt up without a seam.
    tilePixels = Math.max(8, Math.round(T * scene.height / H));
    scale = tilePixels / T;
    viewWidth = scene.width / scale;
    cache.clear();
    const box = rings.getBoundingClientRect();
    rings.width = Math.max(1, Math.round(box.width * dpr));
    rings.height = Math.max(1, Math.round(box.height * dpr));
  }

  // A tile is drawn once, when it first comes into view, and kept until it has scrolled away.
  function tile(layer, index) {
    const key = layer.index * 100 + index;
    let canvas = cache.get(key);
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.width = tilePixels;
    canvas.height = Math.ceil((layer.band[1] - layer.band[0]) * scale);
    const c = canvas.getContext('2d');
    c.scale(scale, scale);
    c.translate(-index * T, -layer.band[0]);
    c.lineWidth = 1.7; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK;
    for (const item of layer.items) for (const shift of [-layer.length, 0, layer.length]) {
      if (item.x0 + shift - 4 < (index + 1) * T && item.x1 + shift + 4 > index * T) {
        c.save(); c.translate(shift, 0); item.draw(c); c.restore();
      }
    }
    cache.set(key, canvas);
    return canvas;
  }

  function drawScene() {
    const w = scene.width, h = scene.height;
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#9fd2e8'); gradient.addColorStop(0.75, '#d5ebee');
    g.fillStyle = gradient; g.fillRect(0, 0, w, h);
    const wanted = new Set();
    for (const layer of LAYERS) {
      const left = rate(layer) * x - viewWidth / 2;
      const origin = Math.round(-left * scale);
      const first = Math.floor(left / T), last = Math.floor((left + viewWidth) / T);
      const top = Math.round(layer.band[0] * scale);
      layer.inView = new Set();
      for (let k = first; k <= last; k++) {
        const index = mod(k, layer.tiles);
        layer.inView.add(index); wanted.add(layer.index * 100 + index);
        g.drawImage(tile(layer, index), origin + k * tilePixels, top);
      }
      layer.first = first; layer.last = last; layer.origin = origin;
    }
    for (const key of cache.keys()) if (!wanted.has(key)) cache.delete(key);
    if (showTiles) drawTileMarks();
  }

  function drawTileMarks() {
    const size = Math.max(9, Math.round(scene.height / 34));
    g.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    g.textBaseline = 'middle'; g.textAlign = 'left';
    for (const layer of LAYERS) {
      const top = Math.round(layer.band[0] * scale) + (layer.index ? 0 : Math.round(4 * scale)), bottom = Math.round(layer.band[1] * scale);
      for (let k = layer.first; k <= layer.last + 1; k++) {
        const index = mod(k, layer.tiles), px = layer.origin + k * tilePixels, seam = index === 0;
        g.strokeStyle = layer.color; g.lineWidth = Math.max(1, dpr * (seam ? 3 : 1.5));
        g.setLineDash(seam ? [] : [dpr * 5, dpr * 4]);
        g.beginPath(); g.moveTo(px, top); g.lineTo(px, bottom); g.stroke();
        g.setLineDash([]);
        const label = String(index + 1), pad = size * 0.45, width = g.measureText(label).width + pad * 2;
        g.fillStyle = layer.color; g.fillRect(px, top, width, size * 1.5);
        g.fillStyle = '#fff'; g.fillText(label, px + pad, top + size * 0.8);
      }
    }
  }

  function drawRings() {
    const w = rings.width, h = rings.height, cx = w / 2, cy = h / 2, outer = Math.min(w, h) / 2 - dpr * 4;
    rg.clearRect(0, 0, w, h);
    const thick = outer * 0.105, up = -Math.PI / 2;
    for (const layer of LAYERS) {
      const radius = (outer - thick / 2) * layer.tiles / FRONT;
      const centre = rate(layer) * x, turn = Math.PI * 2 / layer.length;
      for (let index = 0; index < layer.tiles; index++) {
        const a0 = up + (index * T - centre) * turn, a1 = a0 + T * turn;
        rg.beginPath();
        rg.arc(cx, cy, radius + thick / 2, a0, a1); rg.arc(cx, cy, radius - thick / 2, a1, a0, true); rg.closePath();
        rg.fillStyle = layer.inView && layer.inView.has(index) ? layer.color : PAPER;
        rg.fill();
        rg.strokeStyle = INK; rg.lineWidth = dpr * 1.2; rg.stroke();
      }
      // The seam, where the last tile meets the first.
      const seam = up - centre * turn;
      rg.strokeStyle = INK; rg.lineWidth = dpr * 3;
      rg.beginPath();
      rg.moveTo(cx + Math.cos(seam) * (radius - thick * 0.8), cy + Math.sin(seam) * (radius - thick * 0.8));
      rg.lineTo(cx + Math.cos(seam) * (radius + thick * 0.8), cy + Math.sin(seam) * (radius + thick * 0.8));
      rg.stroke();
    }
    // The viewer, looking up the page.
    rg.fillStyle = INK; rg.beginPath(); rg.arc(cx, cy, dpr * 3.5, 0, Math.PI * 2); rg.fill();
    rg.strokeStyle = INK; rg.lineWidth = dpr; rg.setLineDash([dpr * 2, dpr * 3]);
    rg.beginPath(); rg.moveTo(cx, cy); rg.lineTo(cx, cy - outer); rg.stroke(); rg.setLineDash([]);
  }

  let lastStatus = '';
  function describe() {
    const text = fitTarget
      ? 'Each ring is as long as its layer is fast, so every ring turns together and the street meets itself after one lap.'
      : (() => {
        const off = Math.max(...LAYERS.map(layer => Math.abs((layer.loose - layer.speed) * x) / T));
        return `The same tiles, with speeds picked by eye. After ${(Math.abs(x) / LAP).toFixed(1)} laps the layers are up to ${off.toFixed(1)} tiles out of step.`;
      })();
    if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
    for (const [layer, cell] of rateCells) {
      const value = rate(layer).toFixed(2) + '×';
      if (cell.textContent !== value) cell.textContent = value;
      cell.classList.toggle('off', !fitTarget && layer.loose !== layer.speed);
    }
  }

  // ---- Input

  function touched() { idleSince = performance.now(); hint.classList.add('gone'); }
  let pointerX = 0, pointerTime = 0;
  scene.addEventListener('pointerdown', event => {
    dragging = true; pointerX = event.clientX; pointerTime = performance.now(); velocity = 0;
    scene.setPointerCapture(event.pointerId); scene.classList.add('dragging'); touched();
  });
  scene.addEventListener('pointermove', event => {
    if (!dragging) return;
    const now = performance.now(), moved = (event.clientX - pointerX) * dpr / scale, elapsed = Math.max(1, now - pointerTime) / 1000;
    x -= moved;
    velocity = velocity * 0.6 + (-moved / elapsed) * 0.4;
    pointerX = event.clientX; pointerTime = now; lastMove = now; touched();
  });
  function release() {
    if (!dragging) return;
    dragging = false; scene.classList.remove('dragging');
    if (performance.now() - lastMove > 90) velocity = 0;
    touched();
  }
  scene.addEventListener('pointerup', release);
  scene.addEventListener('pointercancel', release);
  window.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') held = -1; else if (event.key === 'ArrowRight') held = 1; else return;
    event.preventDefault(); touched();
  });
  window.addEventListener('keyup', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { held = 0; touched(); } });
  tilesButton.addEventListener('click', () => { showTiles = !showTiles; tilesButton.setAttribute('aria-pressed', showTiles); });
  fitButton.addEventListener('click', () => { fitTarget = fitTarget ? 0 : 1; fitButton.setAttribute('aria-pressed', Boolean(fitTarget)); });

  // ---- Loop

  let before = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - before) / 1000); before = now;
    if (!dragging) {
      if (held) velocity += (held * 520 - velocity) * Math.min(1, dt * 6);
      else if (now - idleSince > 2500) velocity += (DRIFT * (velocity < -1 ? -1 : 1) - velocity) * Math.min(1, dt * 1.5);
      else velocity *= Math.exp(-dt * 2.2);
      x += velocity * dt;
    }
    fit += (fitTarget - fit) * Math.min(1, dt * 5);
    if (Math.abs(fitTarget - fit) < 0.001) fit = fitTarget;
    drawScene(); drawRings(); describe();
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(document.body);
  resize();
  idleSince = -1e9;
  requestAnimationFrame(frame);
})();
