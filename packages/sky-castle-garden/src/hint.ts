// The controls along the bottom (#controls in index.html). The × hides them,
// and H hides them or brings them back; either way it's remembered, so once
// they're put away they stay away on later visits. Without storage they just
// show each time.

const KEY = 'sky-castle-gardener:controls-dismissed';

export function createHint() {
  const hint = document.getElementById('controls');
  if (!hint) return;
  let hidden = false;
  try { hidden = localStorage.getItem(KEY) === '1'; } catch { /* no storage: shown */ }
  const set = (on: boolean) => {
    hidden = on;
    hint.hidden = on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* no storage */ }
  };
  hint.hidden = hidden;
  hint.querySelector('.close')?.addEventListener('click', () => set(true));
  addEventListener('keydown', event => {
    // Not before the garden's entered, nor while typing in the tuning panel.
    if (event.code !== 'KeyH' || event.repeat || !('entered' in document.body.dataset)) return;
    if (event.target instanceof Element && event.target.closest('input, select')) return;
    set(!hidden);
  });
}
