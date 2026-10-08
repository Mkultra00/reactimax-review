// Sim-driven audio stings: instant feedback independent of any video feed.
import { RADIO_CLIPS, radioCallForEvent, shouldPlay, type RadioCall } from "./radio";
const lastThreat = new Map<RadioCall, number>();
import type { SimEvent } from "./sim";

let ctx: AudioContext | null = null;
let hum: OscillatorNode | null = null;
let radioDownload: Promise<[RadioCall, ArrayBuffer][]> | null = null;
const radioBuffers = new Map<RadioCall, AudioBuffer>();
const activeRadio = new Set<AudioBufferSourceNode>();

export function preloadRadio() {
  if (!radioDownload) {
    radioDownload = Promise.all(Object.entries(RADIO_CLIPS).map(async ([call, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Radio clip failed [${response.status}]`);
      return [call as RadioCall, await response.arrayBuffer()] as [RadioCall, ArrayBuffer];
    }));
  }
  return radioDownload;
}

export function radioEvent(event: SimEvent) {
  const call = radioCallForEvent(event);
  if (!call || !ctx || ctx.state !== "running" || document.hidden) return;
  const buffer = radioBuffers.get(call);
  if (!buffer) return; // Never play a delayed callout against a later game event.
  if (!shouldPlay(call, ctx.currentTime, lastThreat)) return;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer; gain.gain.value = 0.8;
  source.connect(gain).connect(ctx.destination);
  activeRadio.add(source);
  source.onended = () => { activeRadio.delete(source); source.disconnect(); gain.disconnect(); };
  noise(0.07, 0.035);
  source.start();
}

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext();
  void ctx.resume();
  const audioContext = ctx;
  void preloadRadio().then(async (clips) => {
    await Promise.all(clips.map(async ([call, bytes]) => {
      if (!radioBuffers.has(call)) radioBuffers.set(call, await audioContext.decodeAudioData(bytes.slice(0)));
    }));
  }).catch((error: unknown) => { radioDownload = null; console.error("Radio audio unavailable:", error); });
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
  for (const source of activeRadio) source.stop();
  activeRadio.clear();
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
