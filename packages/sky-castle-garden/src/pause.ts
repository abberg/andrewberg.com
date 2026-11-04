// Step 10: the pause menu. Esc lets the mouse go, which pauses the garden
// (the robot, the stones, wind, water and clouds all stop where they are);
// Esc again, a click on the view or Resume carries on. From the menu: put
// the stones back, or watch the opening again.

const STYLE = /* css */`
  #pause { position: fixed; inset: 0; display: none; place-items: center; background: rgba(40, 52, 64, 0.28); }
  #pause.shown { display: grid; }
  #pause .panel { width: min(340px, calc(100vw - 32px)); box-sizing: border-box; padding: 26px 28px 22px; border-radius: 14px;
    background: rgba(251, 248, 238, 0.94); box-shadow: 0 10px 40px rgba(30, 40, 60, 0.25); color: #3d3a46;
    font-family: 'Comfortaa', sans-serif; font-size: 15px; line-height: 1.5; text-align: center; }
  /* The start screen's Troika for the title, smaller and tilted the same way. */
  #pause h1 { margin: 0 0 6px; font-family: 'Troika', 'Impact', sans-serif; font-size: 34px; font-weight: normal; line-height: 1;
    transform: rotate(-1deg); }
  #pause .sub { margin: 0 0 18px; color: #7a7686; font-size: 13px; font-style: italic; }
  #pause .actions { display: grid; gap: 8px; }
  /* Pills, like the start screen's enter button. */
  #pause button { display: block; width: 100%; margin: 0; padding: 10px 20px; border: 1px solid #d8d0bc; border-radius: 999px;
    background: #fffdf6; color: inherit; font: inherit; cursor: pointer; }
  #pause button:hover { background: #f3ecd9; }
  #pause button:focus-visible { outline: 2px solid #98cc2f; outline-offset: 2px; }
  #pause button.primary { background: rgb(76, 137, 15); border-color: rgb(76, 137, 15); color: #fbf8ee; }
  #pause button.primary:hover { background: rgb(64, 118, 10); }
  /* The keys: one list on a phone (the two halves share one grid), two
     columns side by side on a wider screen. */
  #pause .keys { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: baseline; margin: 16px 0 0;
    font-size: 13px; text-align: left; color: #5e5a68; }
  #pause dl { display: contents; margin: 0; }
  @media (min-width: 900px) {
    #pause .panel { width: min(720px, calc(100vw - 32px)); padding: 28px 36px 24px; }
    /* In a row, each on one line; Resume takes what's left over. */
    #pause .actions { grid-template-columns: 1fr auto auto; }
    #pause .actions button { white-space: nowrap; }
    #pause .keys { grid-template-columns: 1fr 1fr; gap: 0 32px; margin-top: 20px; }
    #pause dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: baseline; align-content: start; }
  }
  #pause dt { font-weight: bold; white-space: nowrap; }
  #pause dd { margin: 0; }
  /* The shared keycaps (index.html), light on the light panel. */
  #pause kbd { border-color: #cfc6ad; background: #fffdf6; color: #3d3a46; font-weight: normal; }
  #pause .mouse { color: #3d3a46; vertical-align: -0.35em; }
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
    <div class="actions">
      <button class="primary" data-act="resume">Resume</button>
      <button data-act="reset">Put the stones back</button>
      <button data-act="replay">Watch the opening again</button>
    </div>
    <div class="keys"><dl>
      <dt><svg class="mouse" viewBox="0 0 16 24" role="img" aria-label="Mouse"><rect x="1.5" y="1.5" width="13" height="21" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><line x1="8" y1="5.5" x2="8" y2="9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></dt><dd>look around, wheel to zoom</dd>
      <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>walk, <kbd>Shift</kbd> to run</dd>
      <dt>Stones</dt><dd>walk into one to shove it</dd>
      <dt><kbd>R</kbd></dt><dd>put the stones back</dd>
    </dl><dl>
      <dt><kbd>Esc</kbd></dt><dd>pause</dd>
      <dt><kbd>M</kbd></dt><dd>music on or off</dd>
      <dt><kbd>H</kbd></dt><dd>show or hide the controls bar</dd>
    </dl></div>
    <p class="credit">Scene based on <i>Laputa: Castle in the Sky</i> (Studio Ghibli, 1986), with background and concept paintings by Nizo Yamamoto and character design by Hayao Miyazaki. Music: “The Forgotten Robot Soldier” by Joe Hisaishi; robot footsteps from the film. Used non-commercially.</p>
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
