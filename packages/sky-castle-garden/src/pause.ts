// Step 10: the pause menu. Esc lets the mouse go, which pauses the garden
// (the robot, the stones, wind, water and clouds all stop where they are);
// Esc again, a click on the view or Resume carries on. From the menu: put
// the stones back, or watch the opening again.

const STYLE = /* css */`
  #pause { position: fixed; inset: 0; display: none; place-items: center; background: rgba(40, 52, 64, 0.28); }
  #pause.shown { display: grid; }
  #pause .panel { width: min(340px, calc(100vw - 32px)); box-sizing: border-box; padding: 26px 28px 22px; border-radius: 14px;
    background: rgba(251, 248, 238, 0.94); box-shadow: 0 10px 40px rgba(30, 40, 60, 0.25); color: #3d3a46;
    font: 15px/1.5 Georgia, 'Times New Roman', serif; text-align: center; }
  #pause h1 { margin: 0 0 4px; font-size: 24px; font-weight: normal; letter-spacing: 0.02em; }
  #pause .sub { margin: 0 0 18px; color: #7a7686; font-size: 13px; font-style: italic; }
  #pause button { display: block; width: 100%; margin: 8px 0; padding: 9px 12px; border: 1px solid #d8d0bc; border-radius: 8px;
    background: #fffdf6; color: inherit; font: inherit; cursor: pointer; }
  #pause button:hover { background: #f3ecd9; }
  #pause button:focus-visible { outline: 2px solid #8a9ac8; outline-offset: 2px; }
  #pause button.primary { background: #6f8f5a; border-color: #6f8f5a; color: #fbf8ee; }
  #pause button.primary:hover { background: #5f7e4b; }
  #pause dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; margin: 16px 0 0; font-size: 13px; text-align: left; color: #5e5a68; }
  #pause dt { font-weight: bold; white-space: nowrap; }
  #pause dd { margin: 0; }
  #pause .credit { margin: 14px 0 0; color: #8a8696; font-size: 11px; line-height: 1.4; }
`;

export function createPause(canvas: HTMLCanvasElement, actions: { reset: () => void, replay: () => void }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);
  const menu = document.createElement('div');
  menu.id = 'pause';
  menu.innerHTML = `<div class="panel" role="dialog" aria-label="Paused">
    <h1>Sky Castle Gardener</h1>
    <p class="sub">Paused</p>
    <button class="primary" data-act="resume">Resume</button>
    <button data-act="reset">Put the stones back</button>
    <button data-act="replay">Watch the opening again</button>
    <dl>
      <dt>Mouse</dt><dd>look around, wheel to zoom</dd>
      <dt>W A S D</dt><dd>walk, Shift to run</dd>
      <dt>Walk into stone</dt><dd>shove it</dd>
      <dt>R</dt><dd>put the stones back</dd>
      <dt>Esc</dt><dd>pause</dd>
      <dt>M</dt><dd>music on or off (also top right)</dd>
      <dt>H</dt><dd>show or hide the controls along the bottom</dd>
    </dl>
    <p class="credit">Music and the robot's footsteps from <i>Castle in the Sky</i> (1986), music by Joe Hisaishi, © Studio Ghibli. Used non-commercially.</p>
  </div>`;
  document.body.append(menu);
  const hint = document.getElementById('controls');

  // Nothing to pause until the garden's been entered (start.ts).
  let paused = false, locked = false, enabled = false;
  const show = (on: boolean) => {
    paused = on;
    menu.classList.toggle('shown', on);
    if (hint) hint.style.visibility = on ? 'hidden' : '';
    if (on) (menu.querySelector('button.primary') as HTMLButtonElement).focus();
  };
  const resume = () => {
    show(false);
    // Can be refused (no click to go with it, or too soon after Esc): then
    // the next click on the view takes the mouse.
    try { Promise.resolve(canvas.requestPointerLock()).catch(() => {}); } catch { /* the same */ }
  };
  // Losing the pointer lock (Esc, or switching away) pauses.
  document.addEventListener('pointerlockchange', () => {
    const now = document.pointerLockElement === canvas;
    if (locked && !now) show(true);
    locked = now;
  });
  // Esc with the mouse already free toggles it.
  addEventListener('keydown', event => {
    if (event.code !== 'Escape' || locked || !enabled) return;
    if (paused) resume();
    else show(true);
  });
  menu.addEventListener('click', event => {
    const act = (event.target as HTMLElement).closest('button')?.dataset.act;
    if (act === 'reset') actions.reset();
    if (act === 'replay') actions.replay();
    if (act) resume();
    // A click outside the panel carries on too.
    else if (event.target === menu) resume();
  });
  // Hidden tab: pause, so nothing runs on unseen.
  document.addEventListener('visibilitychange', () => { if (document.hidden && !paused && enabled) show(true); });

  return { get paused() { return paused; }, enable() { enabled = true; } };
}
