import { music, rememberMute } from './music';

// The speaker top right (#speaker in index.html), and M: the music on or off.
// The same remembered mute as the tuning panel's "mute music", so the two
// always agree. A click on it isn't a click on the view, so it doesn't take
// the mouse, and it works while paused.

export function createSpeaker() {
  const button = document.getElementById('speaker');
  if (!button) return;
  // Kept in step with the setting whichever way it's changed (the panel too).
  let shown: boolean | undefined;
  const show = () => {
    if (shown === music.muted) return;
    shown = music.muted;
    button.setAttribute('aria-pressed', String(music.muted));
    button.setAttribute('aria-label', music.muted ? 'Unmute music' : 'Mute music');
    button.title = music.muted ? 'Music off (M)' : 'Music on (M)';
  };
  const toggle = () => {
    music.muted = !music.muted;
    rememberMute();
    show();
  };
  show();
  button.addEventListener('click', () => { toggle(); button.blur(); });
  addEventListener('keydown', event => {
    if (event.code !== 'KeyM' || event.repeat || !('entered' in document.body.dataset)) return;
    if (event.target instanceof Element && event.target.closest('input, select')) return;
    toggle();
  });
  // The tuning panel changes the setting directly: follow it.
  const follow = () => { show(); requestAnimationFrame(follow); };
  requestAnimationFrame(follow);
}
