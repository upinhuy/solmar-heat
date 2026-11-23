// WebAudio sounds, drawn in code: no audio files. Everything is guarded, so the game also
// runs in a headless screenshot where no sound device exists. Sound only starts after the
// player's first gesture, which is when browsers allow an AudioContext.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let rainSource = null;
  let rainGain = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      const length = context.sampleRate;
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
      return false;
    }
    return true;
  }

  function noiseBurst(duration, filterFreq, volume) {
    if (!ensure()) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration);
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!ensure()) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + duration);
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(next) {
      muted = next;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    get muted() {
      return muted;
    },
    /** A gunshot: a short noise crack plus a low thump. */
    shot() {
      noiseBurst(0.12, 3200, 0.5);
      tone(140, 0.1, 'sine', 0.4, 60);
    },
    /** A punch: a dull thud. */
    punch() {
      tone(110, 0.09, 'sine', 0.45, 55);
    },
    /** A crash: longer filtered noise. */
    crash() {
      noiseBurst(0.35, 900, 0.6);
    },
    /** Cash earned: two bright chimes. */
    cash() {
      tone(880, 0.12, 'sine', 0.25);
      setTimeout(() => tone(1318, 0.18, 'sine', 0.25), 90);
    },
    /** A short mission sting. */
    sting() {
      tone(523, 0.14, 'triangle', 0.25);
      setTimeout(() => tone(784, 0.22, 'triangle', 0.25), 130);
    },
    /** A race checkpoint: one bright rising blip. */
    checkpoint() {
      tone(660, 0.09, 'square', 0.16, 990);
    },
    /** Grabbing the courier package: a soft two-note pop. */
    pickup() {
      tone(392, 0.08, 'sine', 0.3);
      setTimeout(() => tone(587, 0.12, 'sine', 0.3), 70);
    },
    /** A rival's shot nearby: a sharper, thinner crack than the player's own. */
    rivalShot() {
      noiseBurst(0.08, 4200, 0.28);
    },
    /** A car horn: two square tones a third apart, short and blunt. */
    horn() {
      tone(370, 0.16, 'square', 0.12);
      tone(466, 0.16, 'square', 0.1);
    },
    /** Rain on the streets: a looping wash of filtered noise whose loudness follows the
     * weather's intensity (0 = dry). Call every frame with game.weather.rain. */
    rain(intensity) {
      if (intensity <= 0) {
        if (rainGain) rainGain.gain.setTargetAtTime(0, context.currentTime, 0.4);
        return;
      }
      if (!ensure()) return;
      if (!rainSource) {
        rainSource = context.createBufferSource();
        rainSource.buffer = noiseBuffer;
        rainSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1600;
        filter.Q.value = 0.4;
        rainGain = context.createGain();
        rainGain.gain.value = 0;
        rainSource.connect(filter);
        filter.connect(rainGain);
        rainGain.connect(master);
        rainSource.start();
      }
      rainGain.gain.setTargetAtTime(0.028 + intensity * 0.05, context.currentTime, 0.6);
    },
    /** The engine hum: a sawtooth whose pitch and loudness follow speed. Call every frame. */
    engine(speedRatio) {
      if (!ensure()) return;
      if (!engineOsc) {
        engineOsc = context.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 60;
        engineGain = context.createGain();
        engineGain.gain.value = 0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 130, context.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0, context.currentTime, 0.08);
    },
    /** The police siren: two alternating tones. Call every frame with on/off. */
    siren(on) {
      if (!on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
        return;
      }
      if (!ensure()) return;
      if (!sirenOsc) {
        sirenOsc = context.createOscillator();
        sirenOsc.type = 'square';
        sirenOsc.frequency.value = 720;
        sirenLfo = context.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 1.4;
        const lfoGain = context.createGain();
        lfoGain.gain.value = 180;
        sirenLfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenGain = context.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenLfo.start();
      }
      sirenGain.gain.setTargetAtTime(0.045, context.currentTime, 0.2);
    },
  };
}
