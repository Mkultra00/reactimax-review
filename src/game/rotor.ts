// Local quadcopter synthesis: no streaming, loop seams, or impact on the simulation.
export function createRotorSound(context: AudioContext) {
  const sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  const nodes: AudioNode[] = [];
  const motors: OscillatorNode[] = [];
  const output = context.createGain();
  output.gain.setValueAtTime(0, context.currentTime);
  output.gain.linearRampToValueAtTime(0.075, context.currentTime + 0.8);
  output.connect(context.destination);
  nodes.push(output);

  // Blade-pass fundamental with softened harmonics rather than a harsh sawtooth.
  const real = new Float32Array(12);
  const imaginary = new Float32Array([0, 1, 0.48, 0.24, 0.14, 0.08, 0.045, 0.025, 0.014, 0.008, 0.004, 0.002]);
  const wave = context.createPeriodicWave(real, imaginary);
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2300;
  filter.Q.value = 0.45;
  filter.connect(output);
  nodes.push(filter);

  for (let i = 0; i < 4; i++) {
    const motor = context.createOscillator();
    motor.setPeriodicWave(wave);
    motor.frequency.value = 155 + i * 2.7;
    const gain = context.createGain();
    gain.gain.value = 0.22;
    const pan = context.createStereoPanner();
    pan.pan.value = i % 2 === 0 ? -0.32 : 0.32;
    motor.connect(gain).connect(pan).connect(filter);

    // Slightly different motor rates create natural beating and blade flutter.
    const flutter = context.createOscillator();
    flutter.frequency.value = 19 + i * 1.3;
    const flutterDepth = context.createGain();
    flutterDepth.gain.value = 0.025;
    flutter.connect(flutterDepth).connect(gain.gain);
    const drift = context.createOscillator();
    drift.frequency.value = 0.43 + i * 0.17;
    const driftDepth = context.createGain();
    driftDepth.gain.value = 2.1;
    drift.connect(driftDepth).connect(motor.frequency);
    sources.push(motor, flutter, drift);
    nodes.push(gain, pan, flutterDepth, driftDepth);
    motors.push(motor);
  }

  const airBuffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const airData = airBuffer.getChannelData(0);
  for (let i = 0; i < airData.length; i++) airData[i] = Math.random() * 2 - 1;
  const air = context.createBufferSource();
  air.buffer = airBuffer;
  air.loop = true;
  const airFilter = context.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 1500;
  airFilter.Q.value = 0.6;
  const airGain = context.createGain();
  airGain.gain.value = 0.12;
  air.connect(airFilter).connect(airGain).connect(output);
  sources.push(air);
  nodes.push(airFilter, airGain);
  sources.forEach(source => source.start());
  let stopped = false;

  return {
    update(movement: number, climb: number, quiet: boolean) {
      if (stopped) return;
      const speed = Math.min(1, Math.max(0, movement));
      const vertical = Math.max(-1, Math.min(1, climb));
      const now = context.currentTime;
      motors.forEach((motor, i) => motor.frequency.setTargetAtTime(155 + i * 2.7 + speed * 24 + vertical * 19, now, 0.18));
      output.gain.setTargetAtTime(quiet ? 0 : 0.075 + speed * 0.015 + Math.max(0, vertical) * 0.012, now, 0.15);
      airGain.gain.setTargetAtTime(0.12 + speed * 0.14 + Math.abs(vertical) * 0.06, now, 0.25);
      filter.frequency.setTargetAtTime(2300 + speed * 500 + vertical * 250, now, 0.2);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = context.currentTime;
      output.gain.cancelScheduledValues(now);
      output.gain.setTargetAtTime(0, now, 0.04);
      sources.forEach(source => source.stop(now + 0.25));
      // onended also runs correctly if the audio context was suspended.
      air.onended = () => {
        sources.forEach(source => source.disconnect());
        nodes.forEach(node => node.disconnect());
      };
    },
  };
}