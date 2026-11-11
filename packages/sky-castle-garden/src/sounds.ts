// The garden's small sounds, made here rather than recorded: leaves
// rustling when a tree's shaken, a fruit coming off its stalk, set down in
// the crook of the arm, thudding onto the grass, squashed underfoot or
// dropping into water, the swish of a throw, slices pattering onto the moat
// and the fish taking them. Each is a moment of filtered noise or a short
// gliding tone, a little different every time. Browsers only let a page
// make sound once it's been clicked or a key pressed, so it starts when the
// garden's entered (start.ts); before that, and muted, nothing plays.

export const effects = { volume: 0.5, muted: false };

type Noise = { kind: 'noise', filter: BiquadFilterType, from: number, to: number, q?: number };
type Tone = { kind: 'tone', wave: OscillatorType, from: number, to: number };
// A part of a sound: what it is, when it starts (s), how long it takes to
// swell and to die away (s), and how loud.
type Part = (Noise | Tone) & { at?: number, attack: number, decay: number, gain: number };

const SOUNDS = {
  // Leaves: a wash of high noise that swells and falls, with a second gust.
  rustle: [
    { kind: 'noise', filter: 'bandpass', from: 3200, to: 1800, q: 0.7, attack: 0.08, decay: 0.5, gain: 0.5 },
    { kind: 'noise', filter: 'highpass', from: 4500, to: 3000, at: 0.22, attack: 0.1, decay: 0.45, gain: 0.3 },
  ],
  // Off its stalk: a small dry snap and a soft falling note.
  pluck: [
    { kind: 'noise', filter: 'highpass', from: 2500, to: 2500, attack: 0.002, decay: 0.03, gain: 0.35 },
    { kind: 'tone', wave: 'sine', from: 520, to: 300, attack: 0.004, decay: 0.09, gain: 0.5 },
  ],
  // Into the bowl of its arm, against the others.
  tock: [{ kind: 'tone', wave: 'triangle', from: 260, to: 200, attack: 0.003, decay: 0.07, gain: 0.45 }],
  // Onto the grass.
  thud: [
    { kind: 'tone', wave: 'sine', from: 120, to: 58, attack: 0.004, decay: 0.16, gain: 0.8 },
    { kind: 'noise', filter: 'lowpass', from: 500, to: 200, attack: 0.003, decay: 0.07, gain: 0.25 },
  ],
  // Underfoot.
  squash: [
    { kind: 'noise', filter: 'lowpass', from: 900, to: 220, attack: 0.01, decay: 0.2, gain: 0.6 },
    { kind: 'tone', wave: 'sine', from: 95, to: 60, attack: 0.005, decay: 0.14, gain: 0.5 },
  ],
  // A whole fruit into water: the drop, then the water closing over it.
  plop: [
    { kind: 'tone', wave: 'sine', from: 320, to: 130, attack: 0.004, decay: 0.13, gain: 0.7 },
    { kind: 'noise', filter: 'bandpass', from: 1400, to: 700, q: 0.8, at: 0.03, attack: 0.02, decay: 0.3, gain: 0.3 },
  ],
  // The arm swung through the air.
  swish: [{ kind: 'noise', filter: 'bandpass', from: 500, to: 1700, q: 1.2, attack: 0.12, decay: 0.2, gain: 0.3 }],
  // A slice onto the water: a small bright drop.
  plip: [
    { kind: 'tone', wave: 'sine', from: 620, to: 980, attack: 0.003, decay: 0.07, gain: 0.4 },
    { kind: 'noise', filter: 'highpass', from: 3000, to: 3000, attack: 0.002, decay: 0.04, gain: 0.12 },
  ],
  // A fish taking one: a quick gulp under a swirl of water.
  gulp: [
    { kind: 'tone', wave: 'sine', from: 420, to: 190, attack: 0.004, decay: 0.1, gain: 0.5 },
    { kind: 'noise', filter: 'bandpass', from: 900, to: 500, q: 0.9, at: 0.02, attack: 0.03, decay: 0.22, gain: 0.22 },
  ],
  // The creature (creature.ts). Its call: two quick rising pips.
  chirp: [
    { kind: 'tone', wave: 'sine', from: 1900, to: 2700, attack: 0.008, decay: 0.07, gain: 0.3 },
    { kind: 'tone', wave: 'sine', from: 2200, to: 3100, at: 0.11, attack: 0.008, decay: 0.09, gain: 0.3 },
  ],
  // Startled: one sharp falling squeak.
  squeak: [{ kind: 'tone', wave: 'triangle', from: 3300, to: 1700, attack: 0.004, decay: 0.12, gain: 0.3 }],
  // A bite out of a fruit: a small wet crunch.
  nibble: [
    { kind: 'noise', filter: 'bandpass', from: 2600, to: 1500, q: 1.5, attack: 0.003, decay: 0.035, gain: 0.3 },
    { kind: 'noise', filter: 'bandpass', from: 2100, to: 1300, q: 1.5, at: 0.07, attack: 0.003, decay: 0.03, gain: 0.22 },
  ],
  // Its feet on the grass, one bound.
  patter: [{ kind: 'noise', filter: 'lowpass', from: 1500, to: 600, attack: 0.003, decay: 0.035, gain: 0.2 }],
} satisfies Record<string, Part[]>;
export type Sound = keyof typeof SOUNDS;

let context: AudioContext | undefined, master: GainNode | undefined, hiss: AudioBuffer | undefined;

// From the click or key that enters the garden.
export function startEffects() {
  if (context) return;
  try {
    context = new AudioContext();
  } catch {
    return;
  }
  master = context.createGain();
  master.connect(context.destination);
  // Two seconds of white noise, for every sound that wants some.
  hiss = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = hiss.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) context!.suspend();
    else context!.resume();
  });
}

// Play one: louder or quieter (1 as made), after a delay (s), and a little
// higher or lower each time (or by a given factor).
export function play(name: Sound, { gain = 1, delay = 0, pitch = 0.92 + Math.random() * 0.16 } = {}) {
  if (!context || !master || !hiss || effects.muted || effects.volume <= 0 || context.state !== 'running') return;
  master.gain.value = effects.volume;
  for (const part of SOUNDS[name] as Part[]) {
    const start = context.currentTime + delay + (part.at ?? 0), end = start + part.attack + part.decay;
    const level = context.createGain();
    level.gain.setValueAtTime(0, start);
    level.gain.linearRampToValueAtTime(part.gain * gain, start + part.attack);
    level.gain.exponentialRampToValueAtTime(0.0001, end);
    level.connect(master);
    if (part.kind === 'tone') {
      const tone = context.createOscillator();
      tone.type = part.wave;
      tone.frequency.setValueAtTime(part.from * pitch, start);
      tone.frequency.exponentialRampToValueAtTime(part.to * pitch, end);
      tone.connect(level);
      tone.start(start);
      tone.stop(end + 0.02);
    } else {
      const noise = context.createBufferSource(), filter = context.createBiquadFilter();
      noise.buffer = hiss;
      noise.loop = true;
      filter.type = part.filter;
      filter.Q.value = part.q ?? 0.7;
      filter.frequency.setValueAtTime(part.from * pitch, start);
      filter.frequency.exponentialRampToValueAtTime(part.to * pitch, end);
      noise.connect(filter).connect(level);
      // From somewhere different in the noise each time.
      noise.start(start, Math.random() * 1.5);
      noise.stop(end + 0.02);
    }
  }
}
