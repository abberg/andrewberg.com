import * as THREE from 'three';

// Step 7: masonry painted like watercolour, drawn on a canvas once at load.
// Big blocks laid in courses, some joints stepped the way the stonework in
// the references is. Nothing is ruled and nothing is airbrushed: each block
// is a flat wash with wobbly edges and pigment pooled darker round its rim,
// all its variation comes from bristle-brush strokes over it, joints are
// brush strokes too, and the paper's grain shows through. Tiles both ways.
// Colours here are near white: the material's lit and shade colours (look.ts)
// tint them.

type Masonry = {
  // The tile's size, square, in metres, and on the canvas.
  metres: number;
  px?: number;
  // Course heights and block lengths, in metres.
  course: [number, number];
  block: [number, number];
  tints: string[];
  // The chance of a block's joint stepping halfway down.
  stepped?: number;
  // Green on the tops of blocks, 0 to 1.
  moss?: number;
  // Which way the brush mostly runs over the blocks: down (vertical) or along.
  grain?: 'down' | 'along';
  // How far a worn corner can round, in metres.
  round?: number;
  // Whether the gaps rounded corners leave where joints cross fill dark, as
  // the joints do.
  darkCorners?: boolean;
  seed?: number;
};

// Fills a total exactly with lengths picked between min and max.
function lengths(total: number, [min, max]: [number, number], random: () => number) {
  const picked: number[] = [];
  let sum = 0;
  while (sum < total - min / 2) { const l = min + random() * (max - min); picked.push(l); sum += l; }
  return picked.map(l => l * total / sum);
}

// Brush strokes, as white masks on small canvases: a run of bristles, each
// its own weight and wetness, tapering in where the brush lands and out where
// it lifts, breaking up as the brush runs dry, over a faint wash where the
// body of the brush touched. Painted along x, centred on y.
const STROKE = { length: 512, width: 64 };
// How far the masonry is knocked back under its highlights (see masonry()).
const GAIN = 1.2;
let masks: HTMLCanvasElement[] | undefined;
function brushes() {
  if (masks) return masks;
  let s = 4242;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  masks = Array.from({ length: 10 }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = STROKE.length;
    canvas.height = STROKE.width;
    const g = canvas.getContext('2d')!;
    const { length: L, width: W } = STROKE;
    const lands = 0.05 + random() * 0.1, lifts = 0.15 + random() * 0.3, dries = 0.45 + random() * 0.45;
    // How wide the stroke is along its length, 0 to 1, with a little swell.
    const swell = [random(), random(), random()];
    const envelope = (t: number) => Math.min(1, t / lands) ** 0.5 * Math.min(1, (1 - t) / lifts) ** 0.8
      * (0.85 + 0.15 * Math.sin(t * 7 + swell[0] * 6) * Math.sin(t * 3 + swell[1] * 6));
    // The body's wash.
    for (let x = 0; x < L; x += 2) {
      const half = envelope(x / L) * W / 2 * 0.95;
      g.fillStyle = `rgba(255,255,255,${0.3 * Math.min(1, (1 - x / L) / (1 - dries + 0.2))})`;
      g.fillRect(x, W / 2 - half, 2, half * 2);
    }
    // The bristles.
    const count = 26;
    for (let b = 0; b < count; b++) {
      const across = (b / (count - 1) - 0.5) * 2 + (random() - 0.5) * 0.08, weight = 1 + random() * 2.5, wet = 0.35 + random() * 0.65;
      const runsDry = dries + (random() - 0.5) * 0.3;
      let wiggle = 0;
      for (let x = 0; x < L; x += 2) {
        const t = x / L;
        wiggle += (random() - 0.5) * 0.04;
        wiggle *= 0.95;
        if (Math.abs(across) > envelope(t)) continue;
        if (t > runsDry && random() < (t - runsDry) * 4) continue;
        g.fillStyle = `rgba(255,255,255,${wet})`;
        g.fillRect(x, W / 2 + (across + wiggle) * W / 2 * 0.95 - weight / 2, 2, weight);
      }
    }
    return canvas;
  });
  return masks;
}
const dye = document.createElement('canvas');
dye.width = STROKE.length;
dye.height = STROKE.width;
// One stroke of colour from (x0, y0) to (x1, y1), width wide.
export function stroke(g: CanvasRenderingContext2D, mask: number, x0: number, y0: number, x1: number, y1: number, width: number, colour: string) {
  const d = dye.getContext('2d')!;
  d.globalCompositeOperation = 'copy';
  d.fillStyle = colour;
  d.fillRect(0, 0, STROKE.length, STROKE.width);
  d.globalCompositeOperation = 'destination-in';
  d.drawImage(brushes()[mask % brushes().length], 0, 0);
  g.save();
  g.translate(x0, y0);
  g.rotate(Math.atan2(y1 - y0, x1 - x0));
  g.drawImage(dye, 0, -width / 2, Math.hypot(x1 - x0, y1 - y0), width);
  g.restore();
}

// The same along a path: the brush mask is cut into slices, one per segment,
// so the stroke bends round corners.
export function strokeAlong(g: CanvasRenderingContext2D, mask: number, path: number[][], width: number, colour: string) {
  const d = dye.getContext('2d')!;
  d.globalCompositeOperation = 'copy';
  d.fillStyle = colour;
  d.fillRect(0, 0, STROKE.length, STROKE.width);
  d.globalCompositeOperation = 'destination-in';
  d.drawImage(brushes()[mask % brushes().length], 0, 0);
  const lengths = path.slice(1).map(([x, y], k) => Math.hypot(x - path[k][0], y - path[k][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  let along = 0;
  lengths.forEach((length, k) => {
    if (length < 0.01) return;
    const [x0, y0] = path[k], [x1, y1] = path[k + 1];
    const from = along / total * STROKE.length, slice = Math.max(1, length / total * STROKE.length);
    g.save();
    g.translate(x0, y0);
    g.rotate(Math.atan2(y1 - y0, x1 - x0));
    // A hair longer than the segment, so slices meet on the outside of bends.
    g.drawImage(dye, from, 0, Math.min(slice + 1, STROKE.length - from), STROKE.width, 0, -width / 2, length + 0.75, width);
    g.restore();
    along += length;
  });
}

export function masonry({ metres, px = 2048, course, block, tints, stepped = 0, moss = 0, grain = 'down', round = 0.39, darkCorners = false, seed = 1 }: Masonry) {
  let s = seed * 9301 + 49297;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  const m = px / metres;
  // Draws at x and again a tile to either side wherever the shape, inside
  // the given bounds, crosses the edge, so it wraps.
  const wrapped = (draw: (dx: number, dy: number) => void, x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity) => {
    for (const dx of [-px, 0, px]) for (const dy of [-px, 0, px]) {
      if (x1 + dx >= 0 && x0 + dx <= px && y1 + dy >= 0 && y0 + dy <= px) draw(dx, dy);
    }
  };

  // A line between two points, wobbling sideways as a hand would draw it.
  const wobbly = (points: number[][], amount: number) => {
    const out: number[][] = [];
    points.forEach(([x0, y0], k) => {
      const [x1, y1] = points[(k + 1) % points.length], length = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.round(length / (0.3 * m))), nx = -(y1 - y0) / (length || 1), ny = (x1 - x0) / (length || 1);
      for (let i = 0; i < steps; i++) {
        const t = i / steps, w = i ? (random() - 0.5) * amount : 0;
        out.push([x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w]);
      }
    });
    return out;
  };
  // An outline with some corners rounded, each by its own radius: a list of
  // radii (0 for a sharp corner), clipped to half the shorter edge.
  const rounded = (points: number[][], radii: number[]) => {
    const out: number[][] = [];
    points.forEach(([px, py], k) => {
      const [ax, ay] = points[(k + points.length - 1) % points.length], [bx, by] = points[(k + 1) % points.length];
      const la = Math.hypot(ax - px, ay - py), lb = Math.hypot(bx - px, by - py), r = Math.min(radii[k], la / 2, lb / 2);
      if (r < 1) { out.push([px, py]); return; }
      const [sx, sy] = [px + (ax - px) / la * r, py + (ay - py) / la * r], [ex, ey] = [px + (bx - px) / lb * r, py + (by - py) / lb * r];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, u = 1 - t;
        out.push([u * u * sx + 2 * u * t * px + t * t * ex, u * u * sy + 2 * u * t * py + t * t * ey]);
      }
    });
    return out;
  };
  const trace = (points: number[][], dx: number, dy: number, close = true) => {
    g.beginPath();
    points.forEach(([x, y], k) => k ? g.lineTo(x + dx, y + dy) : g.moveTo(x + dx, y + dy));
    if (close) g.closePath();
  };
  const rgba = (c: THREE.Color, a: number) => `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`;
  const pick = () => new THREE.Color(tints[Math.floor(random() * tints.length)]);

  // The paper.
  g.fillStyle = '#fbf8f0';
  g.fillRect(0, 0, px, px);

  const joint = Math.max(1.5, 0.04 * m), wobble = 0.05 * m;
  // Joints and the foot of each block: a clear violet, not grey.
  const pooled = new THREE.Color(0x6a58b8), shadow = new THREE.Color(0x8a70d8);
  let top = 0;
  // Edge highlights, drawn last over everything, with the bounds to wrap by.
  const highlights: { strokes: [number, number, number, number, number, number, string][]; bounds: number[] }[] = [];
  const courses = lengths(metres, course, random);
  // Each course's joints as x positions, and a step for each (0 for straight).
  courses.forEach(height => {
    const y0 = top * m, y1 = (top + height) * m;
    top += height;
    const widths = lengths(metres, block, random);
    let x = random() * metres;
    const joints = widths.map(w => {
      const at = { x: x * m, step: random() < stepped ? (random() < 0.5 ? -1 : 1) * (0.25 + random() * 0.4) * m : 0 };
      x += w;
      return at;
    });
    const middle = y0 + (y1 - y0) * (0.35 + random() * 0.3);
    joints.forEach((left, i) => {
      const right = joints[(i + 1) % joints.length];
      const rx = right.x + (i === joints.length - 1 ? px : 0);
      // The block's outline: down its left joint and up its right one, each
      // stepping sideways at the middle if it steps.
      const corners = [
        [left.x, y0], [rx, y0], [rx, middle], [rx + right.step, middle], [rx + right.step, y1],
        [left.x + left.step, y1], [left.x + left.step, middle], [left.x, middle],
      ];
      // The wash, a little inside the joints so paper shows between blocks.
      const inset = 0.03 * m;
      const cx = (left.x + rx) / 2, cy = (y0 + y1) / 2;
      // Some corners worn round, by different amounts; the rest left sharp.
      const radii = corners.map(() => random() < 0.55 ? (0.04 + random() ** 1.5 * (round - 0.04)) * m : 0);
      const wash = wobbly(rounded(corners.map(([x, y]) => [x + Math.sign(cx - x) * inset, y + Math.sign(cy - y) * inset]), radii), wobble);
      const tint = pick().offsetHSL((random() - 0.5) * 0.02, (random() - 0.5) * 0.04, (random() - 0.5) * 0.05), bleed = pick();
      const x0 = Math.min(left.x, left.x + left.step), x1 = Math.max(rx, rx + right.step);
      const mossy = random() < moss;
      // Strokes over the fill, mostly one way, each a shade off the block's
      // colour: lighter, darker, its neighbour's or the pooled lavender.
      const w = x1 - x0, h = y1 - y0, fills: [number, number, number, number, number, number, string][] = [];
      for (let k = 0; k < Math.ceil(w * h / (m * m) * 3); k++) {
        const width = (0.35 + random() * 0.6) * m, long = (grain === 'down' ? h : w) * (0.6 + random() * 0.7);
        const a = (grain === 'down' ? Math.PI / 2 : random() < 0.5 ? 0 : Math.PI) + (random() - 0.5) * 0.3;
        const sx = x0 + random() * w - (grain === 'down' ? 0 : Math.cos(a) * long / 2);
        const sy = grain === 'down' ? y0 - 0.15 * h + random() * Math.max(0.1 * h, h * 1.1 - long) : y0 + random() * h;
        const pickShade = random();
        // Darker strokes go richer, never greyer: more saturated, a shade
        // deeper, the hue nudged warm or cool.
        const [shade, alpha] = pickShade < 0.4 ? [tint.clone().offsetHSL(0, -0.02, 0.08), 0.25 + random() * 0.2]
          : pickShade < 0.7 ? [tint.clone().offsetHSL((random() - 0.5) * 0.06, 0.15, -0.06), 0.08 + random() * 0.1]
            : [bleed.clone().offsetHSL(0, 0.08, -0.02), 0.12 + random() * 0.12];
        fills.push([Math.floor(random() * 10), sx, sy, sx + Math.cos(a) * long, sy + Math.sin(a) * long, width, rgba(shade, alpha)]);
      }
      // A pale stroke along the top and a darker one along the foot, where a
      // painter would catch the light and the shadow under the next course.
      fills.push([Math.floor(random() * 10), x0, y0 + 0.08 * m, x1, y0 + 0.08 * m + (random() - 0.5) * 0.05 * m, (0.12 + random() * 0.1) * m, 'rgba(255,253,245,0.45)']);
      fills.push([Math.floor(random() * 10), x1, y1 - 0.1 * m, x0, y1 - 0.1 * m + (random() - 0.5) * 0.05 * m, (0.15 + random() * 0.15) * m, rgba(shadow, 0.16)]);
      if (mossy) for (let k = 0; k < 4; k++) {
        const sx = x0 + random() * w * 0.7;
        fills.push([Math.floor(random() * 10), sx, y0 + random() * 0.1 * m, sx + (0.4 + random() * 0.8) * m, y0 + random() * 0.2 * m, (0.15 + random() * 0.2) * m, 'rgba(110,150,60,0.6)']);
      }
      // Edge highlights on some blocks: a thin bright stroke just inside the
      // top joint, and on some down the left one too, as a painter picks out
      // the arrises that catch the sun. They run part of the way and stop.
      const glints: typeof fills = [];
      highlights.push({ strokes: glints, bounds: [x0 - m, y0 - m, x1 + m, y1 + m] });
      if (random() < 0.7) {
        const lip = 0.06 * m, from = x0 + random() * 0.3 * w, to = x1 - random() * 0.4 * w;
        glints.push([Math.floor(random() * 10), from, y0 + lip, to, y0 + lip + (random() - 0.5) * 0.02 * m, (0.06 + random() * 0.05) * m, `rgba(255,254,246,${0.75 + random() * 0.25})`]);
        if (random() < 0.5) {
          const down = Math.min(middle, y1) - y0;
          glints.push([Math.floor(random() * 10), left.x + lip, y0 + lip, left.x + lip + (random() - 0.5) * 0.02 * m, y0 + down * (0.5 + random() * 0.5), (0.05 + random() * 0.04) * m, `rgba(255,254,246,${0.65 + random() * 0.3})`]);
        }
      }
      // Pale dry streaks running down from the top.
      for (let k = Math.floor(random() * 3); k > 0; k--) {
        const sx = x0 + random() * w;
        fills.push([Math.floor(random() * 10), sx, y0, sx + (random() - 0.5) * 0.1 * m, y0 + h * (0.4 + random() * 0.6), (0.06 + random() * 0.12) * m, 'rgba(255,253,245,0.35)']);
      }
      // The joints: each side one or two strokes of a loaded brush, laid
      // from either end, wider in places and running dry in others.
      const seams: [number, number[][], number, string][] = [];
      {
        // The outline, rounded where the block is, cut into runs starting
        // somewhere at random, each overlapping the next a little.
        const outline = wobbly(rounded(corners, radii), wobble * 0.5);
        const at: number[] = [0];
        outline.forEach(([x, y], k) => { const [nx, ny] = outline[(k + 1) % outline.length]; at.push(at[k] + Math.hypot(nx - x, ny - y)); });
        const total = at[at.length - 1], point = (d: number) => {
          d = ((d % total) + total) % total;
          let k = 0;
          while (at[k + 1] < d) k++;
          const [x0, y0] = outline[k], [x1, y1] = outline[(k + 1) % outline.length], t = (d - at[k]) / (at[k + 1] - at[k] || 1);
          return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        };
        for (let d = random() * total, end = d + total; d < end;) {
          const run = Math.min((0.8 + random() * 1.4) * m, end - d);
          if (random() > 0.1) {
            const path: number[][] = [];
            for (let k = 0; k <= 24; k++) path.push(point(d - 0.05 * m + (run + 0.1 * m) * k / 24));
            seams.push([Math.floor(random() * 10), random() < 0.5 ? path : path.reverse(), joint * (0.7 + random() * 0.6), rgba(pooled, 0.4 + random() * 0.35)]);
          }
          d += run;
        }
      }
      wrapped((dx, dy) => {
        // The gap a rounded corner leaves where joints cross, in the joints'
        // colour: the square corner less the block's wash.
        if (darkCorners) for (const k of [0, 1, 4, 5]) {
          if (!radii[k]) continue;
          const [x, y] = corners[k], r = radii[k];
          const square = [x + dx + Math.min(0, Math.sign(cx - x) * r), y + dy + Math.min(0, Math.sign(cy - y) * r), r, r] as const;
          g.save();
          g.beginPath();
          g.rect(...square);
          g.clip();
          trace(wash, dx, dy);
          g.rect(...square);
          g.fillStyle = rgba(pooled, 0.75);
          g.fill('evenodd');
          g.restore();
        }
        g.save();
        trace(wash, dx, dy);
        g.fillStyle = rgba(tint, 0.65);
        g.fill();
        g.clip();
        for (const [mask, ax, ay, bx, by, width, colour] of fills) stroke(g, mask, ax + dx, ay + dy, bx + dx, by + dy, width, colour);
        // Pigment pooled at the wash's edge: a darker rim, inside only.
        trace(wash, dx, dy);
        g.strokeStyle = rgba(tint.clone().offsetHSL(0.02, 0.05, -0.25), 0.25);
        g.lineWidth = 0.06 * m;
        g.stroke();
        g.restore();
        for (const [mask, path, width, colour] of seams) strokeAlong(g, mask, path.map(([x, y]) => [x + dx, y + dy]), width, colour);
      }, x0 - m, y0 - m, x1 + m, y1 + m);
    });
  });

  // Everything so far knocked back a little, so the highlights can sit
  // brighter than the stone: the material's colour is turned up by GAIN to
  // make up for it (look.ts).
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${255 / GAIN | 0},${255 / GAIN | 0},${255 / GAIN | 0})`;
  g.fillRect(0, 0, px, px);
  g.globalCompositeOperation = 'source-over';
  for (const { strokes, bounds: [x0, y0, x1, y1] } of highlights) {
    wrapped((dx, dy) => { for (const [mask, ax, ay, bx, by, width, colour] of strokes) stroke(g, mask, ax + dx, ay + dy, bx + dx, by + dy, width, colour); }, x0, y0, x1, y1);
  }

  // The paper's grain.
  const image = g.getImageData(0, 0, px, px), data = image.data;
  for (let k = 0; k < data.length; k += 4) {
    const grain = 1 - 0.05 * Math.random();
    data[k] *= grain; data[k + 1] *= grain; data[k + 2] *= grain;
  }
  g.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.gain = GAIN;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// One small arched window, 0.9 by 1.6 m in its pale stone surround: deep blue
// glass, darker at the top. Clear round it, for an alpha test.
export const WINDOW = { width: 1.14, height: 1.72 };
export function windowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 114;
  canvas.height = 172;
  const g = canvas.getContext('2d')!;
  const arch = (inset: number) => {
    const r = 57 - inset;
    g.beginPath();
    g.moveTo(57 - r, 172 - inset);
    g.lineTo(57 - r, 57);
    g.arc(57, 57, r, Math.PI, 0);
    g.lineTo(57 + r, 172 - inset);
    g.closePath();
  };
  g.fillStyle = '#fbf6ea';
  arch(0);
  g.fill();
  const glass = g.createLinearGradient(0, 12, 0, 172);
  glass.addColorStop(0, '#1a2156');
  glass.addColorStop(0.55, '#33459a');
  glass.addColorStop(1, '#5a74c4');
  g.fillStyle = glass;
  arch(12);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// The textures the level uses.
// Wear painted over a texture of big stones (metres across): broad drifts
// of warmer and cooler colour, so pieces cut from different places differ;
// clumps of stains in the stone's own violets and a dirty ochre; pale scuffs
// where feet have worn it; and a few long cracks, lit on one side.
function worn(texture: THREE.CanvasTexture, metres: number) {
  const canvas = texture.image as HTMLCanvasElement, g = canvas.getContext('2d')!, px = canvas.width, m = px / metres;
  let s = 4111;
  const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tiled = (draw: (dx: number, dy: number) => void) => { for (const dx of [-px, 0, px]) for (const dy of [-px, 0, px]) draw(dx, dy); };
  const mark = (x: number, y: number, a: number, long: number, wide: number, colour: string) => {
    const mask = Math.floor(random() * 10);
    tiled((dx, dy) => stroke(g, mask, x + dx, y + dy, x + dx + Math.cos(a) * long, y + dy + Math.sin(a) * long, wide, colour));
  };
  // Drifts a slab or two across.
  for (let k = 0; k < 26; k++) {
    const warm = random() < 0.5;
    mark(random() * px, random() * px, random() * Math.PI, (0.8 + random() * 1.4) * m, (0.6 + random() * 0.8) * m,
      warm ? `rgba(214,168,104,${0.26 + random() * 0.2})` : `rgba(164,152,204,${0.24 + random() * 0.2})`);
  }
  // Stains, clumped.
  for (let c = 0; c < 14; c++) {
    const cx = random() * px, cy = random() * px, ochre = random() < 0.4;
    for (let k = 0, n = 3 + Math.floor(random() * 6); k < n; k++) {
      mark(cx + (random() - 0.5) * 0.5 * m, cy + (random() - 0.5) * 0.5 * m, random() * Math.PI, (0.12 + random() * 0.25) * m, (0.1 + random() * 0.14) * m,
        ochre ? `rgba(176,140,86,${0.18 + random() * 0.14})` : random() < 0.4 ? `rgba(128,120,184,${0.16 + random() * 0.14})` : `rgba(156,150,206,${0.18 + random() * 0.14})`);
    }
  }
  // Scuffs: pale, long and thin, worn along the way the slabs are walked.
  for (let k = 0; k < 30; k++) {
    mark(random() * px, random() * px, (random() - 0.5) * 0.5, (0.2 + random() * 0.4) * m, (0.04 + random() * 0.06) * m, `rgba(255,252,240,${0.35 + random() * 0.25})`);
  }
  // Cracks.
  g.lineCap = 'round';
  const crack = (x: number, y: number, a: number, steps: number, w: number) => {
    for (let k = 0; k < steps; k++) {
      a += (random() - 0.5) * 0.9;
      const len = 0.06 * m + random() * 0.1 * m, nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len, width = w * (1 - k / steps * 0.6);
      tiled((dx, dy) => {
        const line = (ox: number, oy: number, colour: string, lw: number) => {
          g.strokeStyle = colour; g.lineWidth = lw;
          g.beginPath(); g.moveTo(x + dx + ox, y + dy + oy); g.lineTo(nx + dx + ox, ny + dy + oy); g.stroke();
        };
        line(-1, -1, 'rgba(150,130,170,0.2)', width * 5);
        line(width * 0.9, width * 0.9, 'rgba(255,255,245,1)', width * 1.1);
        line(0, 0, 'rgba(104,88,140,0.85)', width);
      });
      x = nx; y = ny;
    }
  };
  for (let k = 0; k < 6; k++) crack(random() * px, random() * px, random() * Math.PI * 2, 14 + Math.floor(random() * 14), 2 + random() * 1.5);
  texture.needsUpdate = true;
  return texture;
}

const pale = ['#ffffff', '#fff7e6', '#f6eedc', '#eeeaf6', '#fbf1d6'];
const city = ['#ffffff', '#fffaf0', '#fbf6ea', '#f4f2fb', '#f7f5fe', '#fffbe8'];
export const textures = {
  // The city: tall pale blocks, some cream, some lilac.
  city: { metres: 24, map: () => masonry({ metres: 24, course: [2, 3.4], block: [1.6, 4.2], tints: city, stepped: 0.2, round: 0.16, darkCorners: true, seed: 3 }) },
  // The garden's sandstone: the platform, causeway, stairs and terrace sides.
  sandstone: { metres: 12, map: () => masonry({ metres: 12, px: 1024, course: [1, 1.8], block: [1.4, 3.4], tints: pale, stepped: 0.35, moss: 0.04, grain: 'along', round: 0.16, darkCorners: true, seed: 5 }) },
  // Big flagstones for the paths.
  // Long slabs for the stair treads, no stepped joints.
  steps: { metres: 12, map: () => masonry({ metres: 12, px: 1024, course: [0.8, 1.3], block: [2.2, 5], tints: pale, grain: 'along', round: 0.16, darkCorners: true, seed: 13 }) },
  // One big stone a tile, the paving's own, for loose slabs cut from it.
  slab: { metres: 6, map: () => worn(masonry({ metres: 6, px: 1024, course: [6, 6], block: [6, 6], tints: pale, grain: 'along', round: 0.16, seed: 17 }), 6) },
  paving: { metres: 10, map: () => masonry({ metres: 10, px: 1024, course: [0.9, 1.6], block: [0.9, 2], tints: pale, stepped: 0.1, grain: 'along', round: 0.16, darkCorners: true, seed: 7 }) },
  // Roof tiles in the rust bands between the city's tiers.
  tiles: { metres: 8, map: () => masonry({ metres: 8, px: 1024, course: [0.35, 0.55], block: [0.5, 1.1], tints: ['#ffffff', '#f0d8c0', '#e6cdb8', '#f4e6c8', '#d8c0b0'], moss: 0.08, seed: 9 }) },
};
