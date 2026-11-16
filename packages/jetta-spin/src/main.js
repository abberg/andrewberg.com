// Jetta Spin: the exterior 360 from the explore section of The New Jetta.
// Thirty-six pictures of the car, one every 10 degrees, sit stacked on the stage. One number, the angle, says how far
// the car has turned. The picture for that angle is set to display: block and the rest stay hidden.
// Three things change the angle, as they did in 2005: dragging the stage, dragging the slider, and clicking the
// strip of thumbnails the slider rides along. Around the car floats a ring of feature bubbles, each a div with a
// place in 3D. The numbers for the ring, the slider and the easing are the ones in the original ActionScript.
(() => {
  const FRAMES = 36;
  const STEP = 360 / FRAMES;              // degrees between one picture and the next
  const FRONT = 4;                        // the picture that shows the car head on
  const STAGE_WIDTH = 780, STAGE_HEIGHT = 380;

  const fit = document.getElementById('fit');
  const stage = document.getElementById('stage');
  const track = document.getElementById('track');
  const strip = document.getElementById('strip');
  const knob = document.getElementById('knob');
  const mag = document.getElementById('mag');
  const tabs = document.getElementById('tabs');

  // The sections of the site, and which side of its bubble each caption sits on.
  const SECTIONS = [
    { name: 'Exterior', sides: ['left', 'right', 'right'] },
    { name: 'Interior', sides: ['right', 'left', 'right'] },
    { name: 'Performance', sides: ['right', 'left', 'right'] },
    { name: 'Safety', sides: ['right', 'right'] },
  ];

  // ---- The stack of pictures

  const pictures = [];
  for (let i = 0; i < FRAMES; i++) {
    const picture = new Image();
    picture.className = 'picture';
    picture.src = `./frames/jetta-${String(i).padStart(2, '0')}.webp`;
    picture.alt = '';
    picture.draggable = false;
    stage.appendChild(picture);
    pictures.push(picture);
  }

  // ---- The angle

  let angle = 0;                          // degrees, 0 to 360
  let spin = 0;                           // the same thing in radians, which is what the bubbles work in
  let shown = -1;                         // which picture is on display

  function setAngle(degrees) {
    angle = Math.min(360, Math.max(0, degrees));
    spin = angle * Math.PI / 180;
    const frame = (FRONT + Math.round(angle / STEP)) % FRAMES;
    if (frame !== shown) {
      if (shown >= 0) pictures[shown].style.display = 'none';
      pictures[frame].style.display = 'block';
      shown = frame;
    }
    placeSlider();
    for (const bubble of bubbles) aim(bubble);
    stage.setAttribute('aria-valuenow', Math.round(angle));
  }

  // ---- The bubbles

  const focalLength = 1500;
  const RING_X = 390, RING_Y = -340;      // where the middle of the ring sits on the stage
  const RING_RADIUS = 300;
  const RING_DROP = 475;                  // how far below that point the ring hangs
  const angleStep = 2 * Math.PI / 11;     // eleven bubbles share the full turn
  const anglePos = 2 * Math.PI / 3;       // the bubbles of one section sit a third of a turn apart
  const TWEEN = 1000;                     // a bubble takes a second to catch up with the car

  const bubbles = [];
  let fadeIn = 0, fadeOut = 0, count = 0;
  SECTIONS.forEach((section, i) => {
    fadeOut += angleStep * section.sides.length;
    section.sides.forEach((side, j) => {
      let around = -(anglePos * j) + 2 * Math.PI * 0.88 - angleStep * i;
      if (i === 2 && j === 2) around -= angleStep;
      const element = document.createElement('div');
      element.className = `bubble ${side}`;
      element.innerHTML = `<span class="caption">${section.name} ${j + 1}</span><span class="disc"><img src="./thumbs/large/thumb${count}.jpg" alt=""></span>`;
      stage.appendChild(element);
      bubbles.push({
        element,
        angle: around,                    // where it sits on the ring before the car has turned
        current: around,                  // where it is drawn right now
        from: around, change: 0, elapsed: TWEEN,
        y: RING_DROP + (i === 0 && j === 0 ? 40 : 0),
        // A bubble only shows while the car is turning through its own section.
        fadeIn: i === 0 ? fadeIn - 0.5 : fadeIn,
        fadeOut: i === SECTIONS.length - 1 ? fadeOut + 0.5 : fadeOut,
      });
      count++;
    });
    fadeIn = fadeOut;
  });

  // Start a bubble moving from wherever it is to where the angle now puts it.
  function aim(bubble) {
    bubble.from = bubble.current;
    bubble.change = bubble.angle + spin - bubble.current;
    bubble.elapsed = 0;
    bubble.element.classList.toggle('on', spin >= bubble.fadeIn && spin <= bubble.fadeOut);
    wake();
  }

  // Robert Penner's ease out back: it overshoots the target a little and settles.
  function easeOutBack(t, b, c, d, s) {
    return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
  }

  function display(bubble, passed) {
    bubble.elapsed = Math.min(bubble.elapsed + passed, TWEEN);
    const t = bubble.elapsed;
    bubble.current = easeOutBack(t, bubble.from, bubble.change, TWEEN, 1.8);
    const x = Math.cos(bubble.current) * RING_RADIUS;
    const z = Math.sin(bubble.current) * RING_RADIUS;
    // Nearer things are bigger and further from the middle of the view.
    const scaleRatio = focalLength / (focalLength + z);
    bubble.element.style.transform = `translate(${RING_X + x * scaleRatio}px, ${RING_Y + bubble.y * scaleRatio}px) scale(${scaleRatio})`;
    // The original swapped depths. The pictures of the car sit at 1000, so a bubble on the far side goes behind them.
    const depth = 1000 + Math.round(-z);
    if (depth !== 1000) bubble.element.style.zIndex = depth;
    return t < TWEEN;
  }

  // ---- The slider

  // The slider rides along the strip of thumbnails. It starts over the middle of the first one and ends over the
  // middle of the last, and that travel stands for the full 360 degrees.
  const STRIP_WIDTH = 329, MAG_WIDTH = 538;
  const SMALL = (STRIP_WIDTH - 24) / 11, MEDIUM = (MAG_WIDTH - 36) / 11;
  const FIRST = 13;                       // the middle of the first thumbnail, measured along the strip
  const TRAVEL = 10 * SMALL + 24;         // from there to the middle of the last
  const MAG_FIRST = 21, MAG_TRAVEL = 10 * MEDIUM + 36;   // the same two things on the bigger copy inside the slider
  const STRIP_LEFT = 16;                  // where the strip starts inside the track
  let target = null;                      // where the slider is sliding to after a click, or null

  let counter = 0;
  SECTIONS.forEach((section, i) => {
    const gap = 8 * i;                    // the sections are set a little apart
    const left = counter * SMALL + gap;
    if (i > 0) {
      const rule = document.createElement('i');
      rule.className = 'rule';
      rule.style.left = `${left - 4.5}px`;
      strip.appendChild(rule);
    }
    section.sides.forEach((side, j) => {
      const x = counter * SMALL + gap;
      const button = document.createElement('button');
      button.type = 'button';
      button.style.left = `${x}px`;
      button.style.backgroundImage = `url(./thumbs/small/thumb_small${counter}.jpg)`;
      button.setAttribute('aria-label', `${section.name} ${j + 1}`);
      // A click sends the slider to sit over the thumbnail.
      button.addEventListener('click', event => { event.stopPropagation(); slideTo(x); });
      button.addEventListener('pointerdown', event => event.stopPropagation());
      strip.appendChild(button);

      const medium = new Image();
      medium.src = `./thumbs/medium/thumb_medium${counter}.jpg`;
      medium.alt = '';
      medium.style.left = `${counter * MEDIUM + gap * 1.5}px`;
      mag.appendChild(medium);
      counter++;
    });
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = section.name;
    tab.style.left = `${left - 3}px`;
    tab.style.width = `${section.sides.length * SMALL + 5}px`;
    tab.addEventListener('click', () => slideTo(left));
    tabs.appendChild(tab);
  });

  function placeSlider() {
    const xPos = angle * TRAVEL / 360;
    knob.style.transform = `translateX(${STRIP_LEFT + FIRST + xPos}px)`;
    // Inside the slider is a bigger copy of the strip, moved so the same spot is under its middle.
    mag.style.transform = `translateX(${19 - MAG_FIRST - xPos * MAG_TRAVEL / TRAVEL}px)`;
  }

  function slideTo(xPos) {
    target = Math.min(TRAVEL, Math.max(0, xPos));
    wake();
  }

  // ---- One loop moves whatever is still moving, then stops

  let running = false, before = null;   // before is the time of the last frame, or null on the first
  function wake() {
    if (running) return;
    running = true;
    before = null;
    requestAnimationFrame(tick);
  }
  function tick(now) {
    // Time is counted frame to frame, so a bubble that is aimed again mid-flight never waits or runs backwards.
    const passed = before === null ? 1000 / 60 : Math.min(now - before, 100);
    let busy = false;
    if (target !== null) {
      // Each frame, at 31 frames a second, the slider covered a fifth of the distance left.
      const xPos = angle * TRAVEL / 360;
      const next = xPos + (target - xPos) * (1 - Math.pow(0.8, passed / 1000 * 31));
      const done = Math.abs(target - next) < 1;
      const to = done ? target : next;
      if (done) target = null;
      setAngle(to * 360 / TRAVEL);
      busy = !done;
    }
    for (const bubble of bubbles) if (display(bubble, passed)) busy = true;
    before = now;
    if (busy) requestAnimationFrame(tick); else running = false;
  }

  // ---- Dragging

  let scale = 1;                          // how much smaller or bigger than 780 pixels the stage is being shown
  const DRAG = 2 * Math.PI / STAGE_WIDTH;  // radians of turn for each pixel dragged: one full turn across the width of the stage

  function drag(element, start, move) {
    let last = null;
    element.addEventListener('pointerdown', event => {
      last = event.clientX;
      target = null;
      element.setPointerCapture(event.pointerId);
      element.classList.add('dragging');
      if (start) start(event);
    });
    element.addEventListener('pointermove', event => {
      if (last === null) return;
      move((event.clientX - last) / scale, event);
      last = event.clientX;
    });
    for (const type of ['pointerup', 'pointercancel']) element.addEventListener(type, () => {
      last = null;
      element.classList.remove('dragging');
    });
  }

  // Dragging the stage turns the car.
  drag(stage, null, pixels => setAngle(angle + pixels * DRAG * 180 / Math.PI));

  // Dragging the slider moves it along the strip. A press anywhere else on the track slides it there.
  const along = event => (event.clientX - strip.getBoundingClientRect().left) / scale - FIRST;
  drag(knob, event => event.stopPropagation(), (pixels, event) => setAngle(along(event) * 360 / TRAVEL));
  track.addEventListener('pointerdown', event => slideTo(along(event)));

  // The arrow keys turn the car one picture at a time.
  stage.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setAngle(angle + STEP);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setAngle(angle - STEP);
    else return;
    target = null;
    event.preventDefault();
  });

  // ---- Fitting the window

  function resize() {
    scale = Math.min(innerWidth / STAGE_WIDTH, innerHeight / STAGE_HEIGHT);
    const left = (innerWidth - STAGE_WIDTH * scale) / 2, top = (innerHeight - STAGE_HEIGHT * scale) / 2;
    fit.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  }
  resize();
  window.addEventListener('resize', resize);

  setAngle(0);

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
  }
  applyTheme();
  try { new MutationObserver(applyTheme).observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch {}
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('storage', applyTheme);
})();
