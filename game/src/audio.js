// WebAudio sounds, drawn in code: no audio files. Everything is guarded, so the game also
// runs in a headless screenshot where no sound device exists. Sound only starts after the
// player's first gesture, which is when browsers allow an AudioContext. The storm has its
// own voice here: a lightning strike cracks and then rumbles away, and the airfield's
// little prop plane drones overhead on its circuit, swelling as it passes.
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
  let heliSource = null;
  let heliGain = null;
  let heliLfo = null;
  let waveSource = null;
  let waveGain = null;
  let waveLfo = null;
  let trainSource = null;
  let trainGain = null;
  let planeSource = null;
  let planeGain = null;
  let planeLfo = null;
  let planeFilter = null; // the drone's bandpass: its pitch follows the plane's approach
  let marketSource = null;
  let marketGain = null;
  let marketLfo = null;
  let bandBeatGain = null; // the band's beat: a slow throb under the murmur while a set plays
  let lastThunder = 0;
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
    /** A street prop splitting under a car: a short woody crack, higher and quicker
     * than a crash — splinters, not bodywork. */
    smash() {
      noiseBurst(0.14, 2400, 0.32);
      tone(180, 0.07, 'triangle', 0.18, 70);
    },
    /** Tyres shredding on a spike strip: a harsh high tearing burst, then a low thump
     * as the rubber gives — call once per strip hit, from the spike event. */
    spike() {
      noiseBurst(0.3, 5200, 0.5);
      noiseBurst(0.18, 3000, 0.35);
      tone(95, 0.25, 'sawtooth', 0.3, 38);
    },
    /** Tyres swapped at a repair bay: three ratchet clicks, then a rising chime as
     * the fresh set goes on — call once per repair, from the repair event. */
    repair() {
      noiseBurst(0.05, 6000, 0.3);
      setTimeout(() => noiseBurst(0.05, 6000, 0.3), 90);
      setTimeout(() => noiseBurst(0.05, 6000, 0.3), 180);
      tone(520, 0.12, 'sine', 0.16, 300);
      setTimeout(() => tone(780, 0.16, 'sine', 0.16, 340), 200);
    },
    /** The elevated train passing: a low rumble of filtered noise whose loudness
     * follows how close the consist is (0 = the far side of the loop, silent). Call
     * every frame; the rumble swells as the train bears down on the player's street
     * and falls away behind it, twice a loop. */
    train(closeness) {
      if (closeness <= 0) {
        if (trainGain) trainGain.gain.setTargetAtTime(0, context.currentTime, 0.3);
        return;
      }
      if (!ensure()) return;
      if (!trainSource) {
        trainSource = context.createBufferSource();
        trainSource.buffer = noiseBuffer;
        trainSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        trainGain = context.createGain();
        trainGain.gain.value = 0;
        trainSource.connect(filter);
        filter.connect(trainGain);
        trainGain.connect(master);
        trainSource.start();
      }
      trainGain.gain.setTargetAtTime(closeness * 0.055, context.currentTime, 0.25);
    },
    /** The airfield's prop plane: a light drone of looped noise, chopped at propeller
     * speed so the putter of the engine sits under the chase, whose loudness follows
     * how close the aircraft is (0 = the far side of its circuit, silent). Call every
     * frame; it swells as the plane lifts off over the north road and falls away as
     * it circles the far blocks. The drone's pitch rides with it too — the bandpass
     * climbs as the plane bears down on the player, the way an approaching engine
     * does, and falls away as it leaves. */
    plane(closeness) {
      if (closeness <= 0) {
        if (planeGain) planeGain.gain.setTargetAtTime(0, context.currentTime, 0.3);
        return;
      }
      if (!ensure()) return;
      if (!planeSource) {
        planeSource = context.createBufferSource();
        planeSource.buffer = noiseBuffer;
        planeSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 320;
        filter.Q.value = 0.8;
        planeFilter = filter;
        const chop = context.createGain();
        chop.gain.value = 0.6;
        planeLfo = context.createOscillator();
        planeLfo.type = 'sine';
        planeLfo.frequency.value = 13;
        const lfoGain = context.createGain();
        lfoGain.gain.value = 0.4;
        planeLfo.connect(lfoGain);
        lfoGain.connect(chop.gain);
        planeGain = context.createGain();
        planeGain.gain.value = 0;
        planeSource.connect(filter);
        filter.connect(chop);
        chop.connect(planeGain);
        planeGain.connect(master);
        planeSource.start();
        planeLfo.start();
      }
      planeGain.gain.setTargetAtTime(0.012 + closeness * 0.035, context.currentTime, 0.4);
      // The approaching engine climbs in pitch; the departing one falls away.
      if (planeFilter) planeFilter.frequency.setTargetAtTime(280 + closeness * 420, context.currentTime, 0.4);
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
      // Now and then a heavy storm answers itself: a low, far-off thunder rumble under
      // the rain wash — never twice in quick succession, never in a drizzle.
      const now = performance.now();
      if (intensity > 0.7 && now - lastThunder > 11000 && Math.random() < 0.01) {
        lastThunder = now;
        noiseBurst(1.4, 180, 0.16);
      }
    },
    /** A lightning strike's thunder: a sharp crack as the bolt lands, then a long low
     * rumble that rolls away, with a second fainter roll after it — the sound the
     * screen flash is the picture of. A double strike answers itself a third time,
     * quieter still, almost a second later. Call once per strike, from the thunder event. */
    thunder() {
      noiseBurst(0.18, 2400, 0.5);
      noiseBurst(2.2, 120, 0.4);
      setTimeout(() => noiseBurst(1.2, 90, 0.2), 350);
      setTimeout(() => noiseBurst(0.9, 70, 0.12), 950);
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
    /** The police helicopter overhead: a wash of low noise chopped at rotor speed, so
     * the beat of the blades sits under the chase. Call every frame with whether the
     * bird is up; it fades out when the helicopter peels off. */
    heli(on) {
      if (!on) {
        if (heliGain) heliGain.gain.setTargetAtTime(0, context.currentTime, 0.15);
        return;
      }
      if (!ensure()) return;
      if (!heliSource) {
        heliSource = context.createBufferSource();
        heliSource.buffer = noiseBuffer;
        heliSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const chop = context.createGain();
        chop.gain.value = 0.55;
        heliLfo = context.createOscillator();
        heliLfo.type = 'sine';
        heliLfo.frequency.value = 11;
        const lfoGain = context.createGain();
        lfoGain.gain.value = 0.45;
        heliLfo.connect(lfoGain);
        lfoGain.connect(chop.gain);
        heliGain = context.createGain();
        heliGain.gain.value = 0;
        heliSource.connect(filter);
        filter.connect(chop);
        chop.connect(heliGain);
        heliGain.connect(master);
        heliSource.start();
        heliLfo.start();
      }
      heliGain.gain.setTargetAtTime(0.05, context.currentTime, 0.3);
    },
    /** The night market's murmur: a crowd wash of bandpassed noise that swells and
     * thins on a slow LFO — voices, plates, the band on the stage — whose loudness
     * follows how close the player stands to the plaza (0 = elsewhere, silent).
     * While the band is playing a set (`band` true) a slow two-beat throb rides
     * under the murmur, so the music reads even before the player reaches the
     * stage. Call every frame; it fades out as the player leaves the quarter. */
    market(closeness, band) {
      if (closeness <= 0) {
        if (marketGain) marketGain.gain.setTargetAtTime(0, context.currentTime, 0.5);
        if (bandBeatGain) bandBeatGain.gain.setTargetAtTime(0, context.currentTime, 0.5);
        return;
      }
      if (!ensure()) return;
      if (!marketSource) {
        marketSource = context.createBufferSource();
        marketSource.buffer = noiseBuffer;
        marketSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 850;
        filter.Q.value = 0.7;
        const murmur = context.createGain();
        murmur.gain.value = 0.6;
        marketLfo = context.createOscillator();
        marketLfo.type = 'sine';
        marketLfo.frequency.value = 0.35; // the crowd swells and thins, a few seconds a breath
        const lfoGain = context.createGain();
        lfoGain.gain.value = 0.35;
        marketLfo.connect(lfoGain);
        lfoGain.connect(murmur.gain);
        marketGain = context.createGain();
        marketGain.gain.value = 0;
        marketSource.connect(filter);
        filter.connect(murmur);
        murmur.connect(marketGain);
        marketGain.connect(master);
        marketSource.start();
        marketLfo.start();
        // The band's beat: a slow two-hertz throb that rides the murmur's gain
        // while a set is playing, and falls silent in the quiet between sets.
        const bandOsc = context.createOscillator();
        bandOsc.type = 'sine';
        bandOsc.frequency.value = 2.1;
        bandBeatGain = context.createGain();
        bandBeatGain.gain.value = 0;
        bandOsc.connect(bandBeatGain);
        bandBeatGain.connect(marketGain.gain);
        bandOsc.start();
      }
      marketGain.gain.setTargetAtTime(0.02 + closeness * 0.06, context.currentTime, 0.8);
      if (bandBeatGain) bandBeatGain.gain.setTargetAtTime(band ? 0.025 : 0, context.currentTime, 0.8);
    },
    /** The sea along the south shore: a slow-breathing wash of low noise whose loudness
     * follows how close the player stands to the water (0 = inland, silent). Call every
     * frame; the swell period is long, so the beach sounds lazy even mid-chase. */
    waves(closeness) {
      if (closeness <= 0) {
        if (waveGain) waveGain.gain.setTargetAtTime(0, context.currentTime, 0.5);
        return;
      }
      if (!ensure()) return;
      if (!waveSource) {
        waveSource = context.createBufferSource();
        waveSource.buffer = noiseBuffer;
        waveSource.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;
        const swell = context.createGain();
        swell.gain.value = 0.6;
        waveLfo = context.createOscillator();
        waveLfo.type = 'sine';
        waveLfo.frequency.value = 0.11; // one swell every nine seconds or so
        const lfoGain = context.createGain();
        lfoGain.gain.value = 0.4;
        waveLfo.connect(lfoGain);
        lfoGain.connect(swell.gain);
        waveGain = context.createGain();
        waveGain.gain.value = 0;
        waveSource.connect(filter);
        filter.connect(swell);
        swell.connect(waveGain);
        waveGain.connect(master);
        waveSource.start();
        waveLfo.start();
      }
      waveGain.gain.setTargetAtTime(0.015 + closeness * 0.05, context.currentTime, 0.8);
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
