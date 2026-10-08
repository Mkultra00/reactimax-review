// Sim-driven audio stings: instant feedback independent of any video feed.
let ctx: AudioContext | null = null;
let hum: OscillatorNode | null = null;

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  void ctx.resume();
  if (!hum) {
    hum = ctx.createOscillator();
    const g = ctx.createGain();
    hum.type = "sawtooth";
    hum.frequency.value = 118;
    g.gain.value = 0.012;
    hum.connect(g).connect(ctx.destination);
    hum.start();
  }
}
export function stopAudio() {
  hum?.stop(); hum = null;
}
function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.05, slide = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + dur);
}
function noise(dur: number, vol: number) {
  if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 600;
  src.buffer = buf; g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}
export const sfx = {
  drop: () => tone(900, 0.12, "square", 0.03, -500),
  impact: () => { noise(0.9, 0.5); tone(60, 0.5, "sine", 0.2, -30); },
  detect: () => tone(1400, 0.06, "sine", 0.03),
  hit: () => { tone(220, 0.4, "sawtooth", 0.08, -150); noise(0.3, 0.3); },
  warn: () => tone(700, 0.15, "square", 0.03),
  sector: () => { tone(660, 0.15, "sine", 0.05); setTimeout(() => tone(990, 0.2, "sine", 0.05), 150); },
};
