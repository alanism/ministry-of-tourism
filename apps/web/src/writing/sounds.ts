// Typewriter sounds, synthesized with Web Audio (no audio files).
let context: AudioContext | null = null;
/** 0–1, set by the keyboard's Volume knob. 0.4 matches the knob's starting point. */
let master = 0.4;
const level = (gain: number) => gain * master * 2.5;

function audio(): AudioContext {
  context ??= new AudioContext();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function noise(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

function play(source: AudioScheduledSourceNode, gain: number, filterHz?: number) {
  const ctx = audio();
  const volume = ctx.createGain();
  volume.gain.value = level(gain);
  let node: AudioNode = source;
  if (filterHz) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    source.connect(filter);
    node = filter;
  }
  node.connect(volume).connect(ctx.destination);
  source.start();
}

export const typewriterSounds = {
  setVolume(percent: number) {
    master = Math.max(0, Math.min(100, percent)) / 100;
  },
  key() {
    play(noise(audio(), 0.03), 0.35, 2400 + Math.random() * 600);
  },
  bell() {
    const ctx = audio();
    const osc = ctx.createOscillator();
    osc.frequency.value = 1760;
    const volume = ctx.createGain();
    volume.gain.setValueAtTime(Math.max(0.0002, level(0.25)), ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.connect(volume).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.2);
  },
  carriageReturn() {
    play(noise(audio(), 0.22), 0.4, 700);
  },
};

/** Board sounds: a card laid down on the whiteboard. */
export const boardSounds = {
  cardDown() {
    play(noise(audio(), 0.05), 0.22, 1400 + Math.random() * 300);
  },
  /** Paper scrunched up: a few quick rustles. */
  crumple() {
    for (let i = 0; i < 4; i++) setTimeout(() => play(noise(audio(), 0.06), 0.18, 2600 + Math.random() * 1600), i * 45);
  },
  /** The ball landing in the bin. */
  binLand() {
    play(noise(audio(), 0.09), 0.3, 420);
  },
};
