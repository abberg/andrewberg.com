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
    { name: 'Sky', tiles: 4, color: '#00b9d5', band: [0, 150], loose: 0.2 },
    { name: 'Skyline', tiles: 6, color: '#009b92', band: [50, 240], loose: 0.48 },
    { name: 'Shops', tiles: 9, color: '#307b57', band: [115, 305], loose: 0.72 },
    { name: 'Street', tiles: 14, color: '#3e5a2b', band: [222, 360], loose: 1 },
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

  // ---- The artwork. Each layer is a list of flat shapes placed along its ring, drawn in ring coordinates
  // in the layer's own colour, the same one its ring has in the diagram. `cut` punches a paper-coloured hole.

  function box(c, x, y, w, h) { c.fillRect(x, y, w, h); }
  function shape(c, points) {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.fill();
  }
  function disc(c, x, y, radius) { c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); }
  function cut(c, draw) { const paint = c.fillStyle; c.fillStyle = PAPER; draw(); c.fillStyle = paint; }

  function sky(layer) {
    const r = random(11), items = [];
    // The landmark at the seam: a blimp.
    items.push({ x0: -70, x1: 70, draw(c) {
      c.beginPath(); c.ellipse(0, 60, 52, 22, 0, 0, Math.PI * 2); c.fill();
      shape(c, [[38, 54], [64, 38], [64, 82], [38, 66]]);
      box(c, -14, 80, 28, 11);
    } });
    const count = 9;
    for (let i = 0; i < count; i++) {
      const x = 140 + (i + r() * 0.6) * (layer.length - 280) / count, y = between(r, 34, 112);
      const puffs = Array.from({ length: 5 }, (_, n) => [x + (n - 2) * between(r, 15, 21), y - (n % 2) * between(r, 5, 14), between(r, 13, 24)]);
      items.push({ x0: x - 80, x1: x + 80, draw(c) {
        for (const [px, py, pr] of puffs) disc(c, px, py, pr);
        box(c, puffs[0][0], y, puffs[4][0] - puffs[0][0], 16);
      } });
    }
    return items;
  }

  function skyline(layer) {
    const r = random(23), items = [], base = 240;
    // The landmark: a tall tower with a spire.
    items.push({ x0: -40, x1: 40, draw(c) {
      box(c, -30, 96, 60, base - 96); box(c, -19, 74, 38, 22);
      shape(c, [[-9, 74], [0, 50], [9, 74]]);
    } });
    let x = 40;
    while (layer.length - 40 - x > 26) {
      const w = Math.min(between(r, 42, 96), layer.length - 40 - x), h = between(r, 62, 158), top = base - h, kind = Math.floor(r() * 4), left = x;
      items.push({ x0: left, x1: left + w, draw(c) {
        box(c, left + 2, top, w - 4, h);
        if (kind === 0) shape(c, [[left + w * 0.2, top], [left + w / 2, top - 22], [left + w * 0.8, top]]);
        if (kind === 1) box(c, left + w * 0.25, top - 14, w * 0.5, 14);
        if (kind === 2) shape(c, [[left + 2, top], [left + 2, top - 12], [left + w - 2, top - 26], [left + w - 2, top]]);
      } });
      x += w;
    }
    return items;
  }

  function shops(layer) {
    const r = random(37), items = [], base = 305;
    // The landmark: a clock tower.
    items.push({ x0: -72, x1: 72, draw(c) {
      box(c, -62, 150, 124, base - 150);
      shape(c, [[-72, 150], [0, 120], [72, 150]]);
      cut(c, () => disc(c, 0, 192, 22));
      box(c, -1.5, 174, 3, 19); shape(c, [[0, 190], [13, 197], [11, 200], [-1, 193]]);
    } });
    let x = 72;
    while (layer.length - 72 - x > 60) {
      let w = between(r, 92, 172);
      if (layer.length - 72 - x - w < 60) w = layer.length - 72 - x;
      const h = between(r, 78, 150), top = base - h, left = x, columns = Math.max(1, Math.floor((w - 20) / 34)), rows = Math.max(0, Math.floor((h - 62) / 38));
      items.push({ x0: left, x1: left + w, draw(c) {
        box(c, left + 3, top, w - 6, h);
        box(c, left, top - 6, w, 8);
        const pitch = (w - 20) / columns;
        cut(c, () => {
          for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) box(c, left + 10 + col * pitch + pitch / 2 - 8, top + 16 + row * 38, 16, 22);
        });
      } });
      x += w;
    }
    return items;
  }

  function street(layer) {
    const r = random(53), items = [], ground = 292;
    items.push({ x0: 0, x1: layer.length, draw(c) {
      box(c, 0, ground, layer.length, H - ground);
      cut(c, () => { for (let x = 20; x < layer.length; x += 100) box(c, x, 336, 60, 6); });
    } });
    // The landmark: a kiosk.
    items.push({ x0: -70, x1: 70, draw(c) {
      box(c, -50, 258, 100, 40);
      shape(c, [[-66, 262], [-40, 232], [40, 232], [66, 262]]);
      cut(c, () => box(c, -38, 270, 50, 18));
    } });
    let x = 110;
    while (x < layer.length - 110) {
      const at = x, kind = Math.floor(r() * 5);
      items.push({ x0: at - 50, x1: at + 60, draw(c) {
        if (kind === 0) { // a lamp post
          box(c, at - 2.5, 236, 5, 60); shape(c, [[at - 10, 238], [at + 10, 238], [at + 6, 226], [at - 6, 226]]);
        } else if (kind === 1) { // bollards
          for (const dx of [0, 22, 44]) { box(c, at + dx - 3.5, 274, 7, 20); disc(c, at + dx, 274, 5); }
        } else if (kind === 2) { // a hydrant
          box(c, at - 6, 276, 12, 18); box(c, at - 10, 281, 20, 5); disc(c, at, 276, 6);
        } else if (kind === 3) { // a bench
          box(c, at - 26, 280, 52, 5); box(c, at - 26, 268, 52, 6); box(c, at - 22, 282, 4, 12); box(c, at + 18, 282, 4, 12);
        } else { // a tree
          box(c, at - 3, 256, 6, 38);
          for (const [dx, dy, pr] of [[-12, 250, 16], [12, 248, 17], [0, 236, 18]]) disc(c, at + dx, dy, pr);
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
    c.fillStyle = layer.color;
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
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
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
        g.strokeStyle = INK; g.lineWidth = Math.max(1, dpr * (seam ? 3 : 1.2));
        g.setLineDash(seam ? [] : [dpr * 5, dpr * 4]);
        g.beginPath(); g.moveTo(px, top); g.lineTo(px, bottom); g.stroke();
        g.setLineDash([]);
        const label = String(index + 1), pad = size * 0.45, width = g.measureText(label).width + pad * 2;
        g.fillStyle = layer.color; g.fillRect(px, top, width, size * 1.5);
        g.lineWidth = Math.max(1, dpr * 1.2); g.strokeRect(px, top, width, size * 1.5);
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
