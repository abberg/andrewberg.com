// Parallax Rings: how a street that loops all the way round can scroll in layers.
// Every layer is a ring of same-sized tiles. A layer that scrolls at half the speed of the street
// needs a ring half as long, so that one lap of the street is also exactly one lap of every layer.
(() => {
  const H = 360;            // the scene's height, in scene units
  const T = 300;            // the width of one tile, in scene units
  let INK = '#16181A', PAPER = '#F5F5F1';   // set from the page's theme, below

  // Back to front. `tiles` sets the ring's length; `loose` is a speed picked by eye, for comparison.
  // `colors` is the layer's colour on the light page, then on the dark one: the same four hues, set so that
  // the layers step from soft at the back to strong at the front against either background.
  // `tops` is the range of roof heights, `base` where the layer's buildings stop behind the next layer.
  const LAYERS = [
    { name: 'Clouds', tiles: 4, colors: ['#cbbfe4', '#3b2b5a'], band: [0, 150], loose: 0.2 },
    { name: 'Skyline', tiles: 6, colors: ['#5f9ccb', '#1d6392'], band: [84, 262], tops: [104, 180], base: 262, widths: [46, 96], loose: 0.48 },
    { name: 'Blocks', tiles: 9, colors: ['#12897f', '#00a098'], band: [156, 318], tops: [176, 250], base: 318, widths: [70, 140], loose: 0.72 },
    { name: 'Street', tiles: 14, colors: ['#33661f', '#8fcb6b'], band: [232, 360], tops: [252, 312], base: 360, widths: [100, 210], loose: 1 },
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
  const between = (r, a, b) => a + r() * (b - a);

  // ---- The artwork. The back layer is clouds and the rest are rows of plain building silhouettes, placed along each ring,
  // drawn in ring coordinates in the layer's own colour, the same one its ring has in the diagram.

  function box(c, x, y, w, h) { c.fillRect(x, y, w, h); }
  function shape(c, points) {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.fill();
  }

  function disc(c, x, y, radius) { c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); }

  function clouds(layer) {
    const r = random(11), items = [], count = 9;
    const cloud = (x, y, size) => {
      const puffs = Array.from({ length: 5 }, (_, n) => [x + (n - 2) * between(r, 15, 21) * size, y - (n % 2) * between(r, 5, 14) * size, between(r, 13, 24) * size]);
      items.push({ x0: x - 80 * size, x1: x + 80 * size, draw(c) {
        for (const [px, py, pr] of puffs) disc(c, px, py, pr);
        box(c, puffs[0][0], y, puffs[4][0] - puffs[0][0], 16 * size);
      } });
    };
    cloud(0, 62, 1.5);   // the landmark at the seam: the biggest cloud
    for (let i = 0; i < count; i++) cloud(170 + (i + r() * 0.6) * (layer.length - 340) / count, between(r, 38, 112), 1);
    return items;
  }

  function buildings(layer) {
    const r = random(11 + layer.index * 13), items = [], [high, low] = layer.tops, base = layer.base;
    const span = low - high, half = layer.widths[1] * 0.42;
    // The landmark at the seam: the tallest building in the layer, with a spire.
    items.push({ x0: -half, x1: half, draw(c) {
      box(c, -half, high + span * 0.3, half * 2, base - high);
      box(c, -half * 0.6, high + span * 0.08, half * 1.2, span * 0.3);
      shape(c, [[-half * 0.28, high + span * 0.08], [0, high - span * 0.22], [half * 0.28, high + span * 0.08]]);
    } });
    let x = half;
    while (layer.length - half - x > layer.widths[0] * 0.6) {
      let w = between(r, layer.widths[0], layer.widths[1]);
      if (layer.length - half - x - w < layer.widths[0] * 0.6) w = layer.length - half - x;
      const top = between(r, high + span * 0.25, low), kind = Math.floor(r() * 5), left = x, right = x + w, roof = Math.min(span * 0.28, w * 0.4);
      items.push({ x0: left, x1: right, draw(c) {
        box(c, left, top, w + 0.5, base - top);
        if (kind === 0) shape(c, [[left, top], [left + w / 2, top - roof], [right, top]]);            // a gable
        if (kind === 1) box(c, left + w * 0.25, top - roof * 0.6, w * 0.5, roof * 0.6 + 1);           // a set-back top
        if (kind === 2) shape(c, [[left, top], [left, top - roof * 0.5], [right, top - roof], [right, top]]);   // a slanted roof
        if (kind === 3) box(c, left + w * 0.62, top - roof * 0.8, w * 0.16, roof * 0.8 + 1);          // a chimney
      } });
      x += w;
    }
    return items;
  }

  LAYERS.forEach(layer => { layer.items = layer.index ? buildings(layer) : clouds(layer); });

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
    row.innerHTML = `<i></i><span>${layer.name}</span><span class="n">${layer.tiles} tiles</span><span class="r"></span>`;
    legend.append(row);
    layer.swatch = row.firstChild;
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
        g.strokeStyle = layer.dark; g.lineWidth = Math.max(1, dpr * (seam ? 3 : 1.5));
        g.setLineDash(seam ? [] : [dpr * 5, dpr * 4]);
        g.beginPath(); g.moveTo(px, top); g.lineTo(px, bottom); g.stroke();
        g.setLineDash([]);
        const label = String(index + 1), pad = size * 0.45, width = g.measureText(label).width + pad * 2;
        g.fillStyle = layer.color; g.fillRect(px, top, width, size * 1.5);
        g.lineWidth = Math.max(1, dpr * 1.2); g.strokeRect(px, top, width, size * 1.5);
        g.fillStyle = layer.text; g.fillText(label, px + pad, top + size * 0.8);
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
        rg.strokeStyle = layer.dark; rg.lineWidth = dpr * 1.2; rg.stroke();
      }
      // The seam, where the last tile meets the first.
      const seam = up - centre * turn;
      rg.strokeStyle = layer.dark; rg.lineWidth = dpr * 3;
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

  // ---- Theme. Embedded in a page of the site, the demo follows that page's light or dark theme.
  // On its own it uses the theme saved by the site, or the system's.

  function theme() {
    try { const set = parent !== window && parent.document.documentElement.dataset.theme; if (set) return set; } catch {}
    try { const saved = localStorage.getItem('theme'); if (saved === 'light' || saved === 'dark') return saved; } catch {}
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const dark = theme() === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    // Take the page's exact colours where there is one, so the demo sits flush with it.
    for (const name of ['--bg', '--ink', '--mute']) {
      let value = '';
      try { if (parent !== window) value = getComputedStyle(parent.document.documentElement).getPropertyValue(name).trim(); } catch {}
      if (value) document.documentElement.style.setProperty(name, value); else document.documentElement.style.removeProperty(name);
    }
    const style = getComputedStyle(document.documentElement);
    INK = style.getPropertyValue('--ink').trim(); PAPER = style.getPropertyValue('--bg').trim();
    // Tile edges and seams take a shade of their layer's colour: darker on paper, lighter on the dark page.
    for (const layer of LAYERS) {
      layer.color = layer.colors[dark ? 1 : 0];
      layer.swatch.style.background = layer.color;
      const [red, green, blue] = [1, 3, 5].map(at => parseInt(layer.color.slice(at, at + 2), 16));
      layer.text = red * 0.299 + green * 0.587 + blue * 0.114 > 140 ? '#16181A' : '#fff';
      layer.dark = '#' + [1, 3, 5].map(at => {
        const value = parseInt(layer.color.slice(at, at + 2), 16);
        return Math.round(dark ? value + (255 - value) * 0.6 : value * 0.5).toString(16).padStart(2, '0');
      }).join('');
    }
    cache.clear();
  }
  applyTheme();
  try { new MutationObserver(applyTheme).observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('storage', applyTheme);

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
