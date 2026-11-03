// The music, from the film: it fades in on the first click or key press
// (browsers allow no sound before one), loops for as long as the garden is
// open, each time round overlapping its end with its start so it never
// drops out, and sinks back, muffled, while the garden's paused. Streamed
// through two audio elements taking turns rather than decoded whole. If it
// won't load, the garden is simply quiet.

export const music = { volume: 0.4, muted: false };

const SOURCE = './sounds/music.m4a';
// How long each time round overlaps the next (s), and the fade in.
const OVERLAP = 4, FADE_IN = 2;
// Paused: how loud, and how muffled (the low-pass's cut-off, Hz).
const DUCKED = 0.3, MUFFLED = 900;
const KEY = 'sky-castle-garden:music-muted';

try { music.muted = localStorage.getItem(KEY) === '1'; } catch { /* no storage: not muted */ }
export const rememberMute = () => {
  try { localStorage.setItem(KEY, music.muted ? '1' : '0'); } catch { /* no storage */ }
};

export function createMusic() {
  let context: AudioContext | undefined, master: GainNode | undefined, filter: BiquadFilterNode | undefined;
  // The two players, the one playing now first.
  let players: { audio: HTMLAudioElement, gain: GainNode }[] = [];
  let overlapping = false, failed = false;

  const start = () => {
    removeEventListener('pointerdown', start);
    removeEventListener('keydown', start);
    try {
      context = new AudioContext();
      master = context.createGain();
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      filter.connect(master).connect(context.destination);
      master.gain.value = 0;
      players = [0, 1].map(() => {
        const audio = new Audio(SOURCE);
        audio.preload = 'auto';
        audio.hidden = true;
        audio.addEventListener('error', () => { failed = true; });
        document.body.append(audio);
        const gain = context!.createGain();
        context!.createMediaElementSource(audio).connect(gain).connect(filter!);
        return { audio, gain };
      });
      players[1].gain.gain.value = 0;
      players[0].audio.play().catch(() => { failed = true; });
    } catch {
      failed = true;
    }
  };
  addEventListener('pointerdown', start);
  addEventListener('keydown', start);
  // Nothing plays in a hidden tab.
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.hidden) context.suspend();
    else context.resume();
  });

  let heard = -1, muffled = -1;
  return {
    update(paused: boolean) {
      if (!context || !master || !filter || failed) return;
      const now = context.currentTime;
      // Louder or quieter, and muffled or not, only when that changes.
      const loud = music.muted ? 0 : music.volume * (paused ? DUCKED : 1);
      if (loud !== heard) {
        // The first time, a slow fade in from nothing.
        master.gain.setTargetAtTime(loud, now, heard < 0 ? FADE_IN / 3 : 0.25);
        heard = loud;
      }
      const cut = paused ? MUFFLED : 20000;
      if (cut !== muffled) {
        filter.frequency.setTargetAtTime(cut, now, 0.3);
        muffled = cut;
      }
      // Near the end: start the other from the top and cross over.
      const [playing, waiting] = players, { duration, currentTime } = playing.audio;
      if (!overlapping && duration > OVERLAP * 2 && currentTime > duration - OVERLAP) {
        overlapping = true;
        waiting.audio.currentTime = 0;
        waiting.audio.play().catch(() => {});
        playing.gain.gain.setValueAtTime(1, now);
        playing.gain.gain.linearRampToValueAtTime(0, now + OVERLAP);
        waiting.gain.gain.setValueAtTime(0, now);
        waiting.gain.gain.linearRampToValueAtTime(1, now + OVERLAP);
      }
      if (overlapping && playing.audio.ended) {
        players = [waiting, playing];
        overlapping = false;
      }
    },
  };
}
