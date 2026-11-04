// The loading and start screen (its markup and look are in index.html, so it
// shows from the first byte). While the garden's built, a thin bar follows
// real progress (main.ts says how far along it is); once the first frame's
// drawn, the bar gives way to "Click to enter". That one click, tap, Enter or Space is what browsers need before
// they'll play sound, so it's what starts the music, takes the mouse and
// sets the opening going. Nothing in the garden moves until then.

export function createStart() {
  const screen = document.getElementById('start')!;
  const bar = screen.querySelector<HTMLElement>('.bar')!, fill = bar.querySelector<HTMLElement>('span')!;
  const enter = screen.querySelector<HTMLButtonElement>('.enter')!;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) {
    enter.textContent = 'Tap to enter';
    // The same keys, with a word first that they're for a computer.
    screen.querySelector('.keys')!.insertAdjacentHTML('afterbegin', '<span class="touch">Best with a keyboard and mouse:</span>');
  }

  let shown = 0;
  return {
    // How far along loading is, 0 to 1. Never goes back.
    progress(done: number) {
      shown = Math.max(shown, Math.min(1, done));
      fill.style.width = `${(shown * 100).toFixed(1)}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
    },
    // Loaded and drawn: wait for the gesture, then fade away. onEnter runs
    // inside that gesture's own event, so sound and the pointer lock are allowed.
    ready(onEnter: () => void) {
      this.progress(1);
      screen.dataset.state = 'ready';
      enter.focus({ preventScroll: true });
      let entered = false;
      const go = (event: Event) => {
        if (entered) return;
        entered = true;
        event.preventDefault();
        screen.removeEventListener('click', go);
        removeEventListener('keydown', key);
        screen.dataset.state = 'gone';
        document.body.dataset.entered = '';
        // Off the page once faded (or straight away if there's no fade).
        const away = () => { screen.hidden = true; };
        screen.addEventListener('transitionend', event => { if (event.target === screen && event.propertyName === 'opacity') away(); });
        setTimeout(away, 1200);
        onEnter();
      };
      const key = (event: KeyboardEvent) => {
        if (event.repeat || (event.code !== 'Enter' && event.code !== 'Space' && event.code !== 'NumpadEnter')) return;
        go(event);
      };
      screen.addEventListener('click', go);
      addEventListener('keydown', key);
    },
    // No gesture (the thumbnail capture): just go.
    dismiss() {
      this.progress(1);
      screen.hidden = true;
      document.body.dataset.entered = '';
    },
  };
}
