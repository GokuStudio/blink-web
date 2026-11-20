/**
 * Blink Acoustic Design System — Pure Web Audio API synthesis.
 *
 * Tuned to a warm Fmaj9 / F-Lydian palette with a custom stereo convolution
 * reverb so the Rest Ritual ambience feels spacious, velvety, and genuinely
 * blissful (inspired by ambient minimalism: warm tidal pads + sparse drifting
 * harp/felt-bell notes in lush stereo space), while UI interactions remain
 * crisp, understated, and matched to motion speed.
 */

class BlinkSoundEngine {
  private ctx: AudioContext | null = null;
  private reverbBuffer: AudioBuffer | null = null;
  private enabled = true;

  // Active Zen ambient session state
  private zenMaster: GainNode | null = null;
  private zenStops: Array<() => void> = [];
  private zenNoteTimer: number | null = null;
  private zenActive = false;
  private zenPaused = false;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (this.zenActive && this.ctx && this.zenMaster) {
      // Smoothly mute/unmute active Zen session in place without resetting it
      const now = this.ctx.currentTime;
      this.zenMaster.gain.cancelScheduledValues(now);
      this.zenMaster.gain.setTargetAtTime(
        next && !this.zenPaused ? 0.095 : 0.0001,
        now,
        0.18
      );
    } else if (!next) {
      this.stopZenAmbience(0.3);
    }
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Generates a silky 4.2-second stereo velvet reverb impulse response once per
   * AudioContext so pads, floating melody notes, and the end bell bloom naturally.
   */
  private getReverbBuffer(ctx: AudioContext): AudioBuffer {
    if (this.reverbBuffer && this.reverbBuffer.sampleRate === ctx.sampleRate) {
      return this.reverbBuffer;
    }
    const duration = 4.2;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let lpState = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // Soft pre-bloom fade-in (first 35ms) + smooth exponential velvet tail
        const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.035));
        const decay = Math.pow(1 - t, 2.7);
        const white = Math.random() * 2 - 1;
        // One-pole low-pass inside IR to keep tail warm and never metallic/hissy
        lpState = lpState + 0.14 * (white - lpState);
        data[i] = lpState * fadeIn * decay * 0.9;
      }
    }

    this.reverbBuffer = buffer;
    return buffer;
  }

  /**
   * 1. Subtle ceramic tap for primary dock navigation & timeframe switches (~24ms).
   */
  public playTabTick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.026);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.036);
  }

  /**
   * 2. Physical micro-detent for Settings switches (~34ms).
   */
  public playToggle(on: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(on ? 440 : 540, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 660 : 390, now + 0.032);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.036, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.044);
  }

  /**
   * 3. Ultra-faint horological vernier tick for chart scrubbing & swipe detents (~16ms).
   */
  public playVernierTick(intensity = 0.5): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitch = 380 + Math.min(1, Math.max(0, intensity)) * 220;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.72, now + 0.016);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.02, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.024);
  }

  /**
   * 4. Flowing airy harmonic swell timed to the DistortionWave swipe completion (~820ms).
   */
  public playWaveFlow(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [261.63, 329.63, 392.0, 523.25];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      const onset = now + idx * 0.05;
      osc.frequency.setValueAtTime(f * 0.97, onset);
      osc.frequency.exponentialRampToValueAtTime(f, onset + 0.34);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(480, onset);
      filter.frequency.exponentialRampToValueAtTime(1500, onset + 0.36);
      filter.frequency.exponentialRampToValueAtTime(460, onset + 0.82);

      gain.gain.setValueAtTime(0.0001, onset);
      gain.gain.linearRampToValueAtTime(0.022 / (idx * 0.35 + 1), onset + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.0001, onset + 0.82);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(onset);
      osc.stop(onset + 0.88);
    });
  }

  /**
   * 5. Blissful, ultra-calm stereo Zen soundscape for the Rest Ritual:
   *    - Pure silk sine Fmaj9 tidal bed (zero harsh buzz/hiss)
   *    - Lush 4.2s stereo velvet convolution reverb
   *    - Sparse, floating felt-harp / celesta notes drifting gently across the stereo field
   */
  public startZenAmbience(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (this.zenActive) {
      this.setZenPaused(false);
      return;
    }

    this.stopZenAmbience(0.15);
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.095, now + 2.0);
    master.connect(ctx.destination);

    // Velvet stereo convolver bus (wet) + soft direct warmth (dry)
    const convolver = ctx.createConvolver();
    convolver.buffer = this.getReverbBuffer(ctx);
    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(0.84, now);
    convolver.connect(wetGain).connect(master);

    const dryGain = ctx.createGain();
    dryGain.gain.setValueAtTime(0.2, now);
    dryGain.connect(master);

    // Gentle master warmth shelf (ultra-mild & pillowy)
    const warmthFilter = ctx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.setValueAtTime(440, now);
    warmthFilter.Q.setValueAtTime(0.45, now);
    warmthFilter.connect(dryGain);
    warmthFilter.connect(convolver);

    const stops: Array<() => void> = [];

    // Pure silk sine tidal cloud (F2 warmth, C3, F3, A3, C4) — each breathes slowly out of phase
    const cloudVoices: Array<{
      freq: number;
      amp: number;
      lfoHz: number;
      pan: number;
    }> = [
      { freq: 87.31, amp: 0.14, lfoHz: 0.09, pan: 0 }, // Warm F2 foundation
      { freq: 130.81, amp: 0.15, lfoHz: 0.13, pan: -0.25 }, // C3 fifth
      { freq: 174.61, amp: 0.14, lfoHz: 0.11, pan: 0.22 }, // F3 heart
      { freq: 220.0, amp: 0.1, lfoHz: 0.16, pan: -0.35 }, // A3 warm major third
      { freq: 261.63, amp: 0.065, lfoHz: 0.14, pan: 0.35 }, // C4 airy top
    ];

    cloudVoices.forEach((v) => {
      const osc = ctx.createOscillator();
      const voiceGain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(v.freq, now);

      // Slow organic volume tide (+/- 35% of voice amplitude)
      voiceGain.gain.setValueAtTime(v.amp, now);
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(v.lfoHz, now);
      lfoDepth.gain.setValueAtTime(v.amp * 0.36, now);
      lfo.connect(lfoDepth).connect(voiceGain.gain);

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(v.pan, now);
        osc.connect(voiceGain).connect(panner).connect(warmthFilter);
      } else {
        osc.connect(voiceGain).connect(warmthFilter);
      }

      osc.start(now);
      lfo.start(now);

      stops.push(() => {
        try {
          osc.stop();
          lfo.stop();
          osc.disconnect();
          lfo.disconnect();
        } catch {
          // ignore
        }
      });
    });

    // Floating blissful felt-harp / celesta phrases in F-Lydian (drifting gently into the reverb)
    const blissfulNotes: Array<{ freq: number; pan: number }> = [
      { freq: 523.25, pan: -0.3 }, // C5
      { freq: 440.0, pan: 0.28 }, // A4
      { freq: 659.25, pan: -0.22 }, // E5
      { freq: 587.33, pan: 0.34 }, // D5
      { freq: 523.25, pan: -0.18 }, // C5
      { freq: 392.0, pan: 0.25 }, // G4
      { freq: 440.0, pan: -0.32 }, // A4
    ];

    let noteIdx = 0;

    const triggerFloatingNote = () => {
      if (!this.zenActive || this.zenPaused || !this.enabled || !this.ctx || !this.zenMaster) return;
      const t = this.ctx.currentTime;
      const { freq, pan } = blissfulNotes[noteIdx % blissfulNotes.length];
      noteIdx += 1;

      // Fundamental + whisper octave shimmer for ultra-mild felt-harp timbre
      [
        { f: freq, a: 0.048, dur: 3.6 },
        { f: freq * 2, a: 0.009, dur: 2.1 },
      ].forEach(({ f, a, dur }) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);

        g.gain.setValueAtTime(0.0001, t);
        // Velvety 95ms bloom attack — zero pluck harshness
        g.gain.linearRampToValueAtTime(a, t + 0.095);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

        if (typeof this.ctx.createStereoPanner === 'function') {
          const p = this.ctx.createStereoPanner();
          p.pan.setValueAtTime(pan, t);
          osc.connect(g).connect(p).connect(convolver);
          p.connect(dryGain);
        } else {
          osc.connect(g).connect(convolver);
          g.connect(dryGain);
        }

        osc.start(t);
        osc.stop(t + dur + 0.08);
      });
    };

    const scheduleNextNote = (initialDelayMs: number) => {
      this.zenNoteTimer = window.setTimeout(() => {
        if (!this.zenActive) return;
        triggerFloatingNote();
        // Unhurried organic spacing (~2.7s to 3.4s between floating notes)
        const nextGap = 2700 + ((noteIdx * 310) % 750);
        scheduleNextNote(nextGap);
      }, initialDelayMs);
    };

    scheduleNextNote(950);

    this.zenMaster = master;
    this.zenStops = stops;
    this.zenActive = true;
    this.zenPaused = false;
  }

  public setZenPaused(paused: boolean): void {
    this.zenPaused = paused;
    if (!this.ctx || !this.zenMaster || !this.zenActive) return;
    const now = this.ctx.currentTime;
    this.zenMaster.gain.cancelScheduledValues(now);
    this.zenMaster.gain.setTargetAtTime(
      paused || !this.enabled ? 0.0001 : 0.095,
      now,
      0.22
    );
  }

  public stopZenAmbience(fadeSec = 1.2): void {
    if (this.zenNoteTimer !== null) {
      window.clearTimeout(this.zenNoteTimer);
      this.zenNoteTimer = null;
    }
    if (!this.zenActive) return;
    this.zenActive = false;
    this.zenPaused = false;
    const master = this.zenMaster;
    const stops = this.zenStops;
    this.zenMaster = null;
    this.zenStops = [];

    if (this.ctx && master) {
      const now = this.ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + fadeSec);
      window.setTimeout(() => {
        stops.forEach((fn) => fn());
        try {
          master.disconnect();
        } catch {
          // ignore
        }
      }, Math.round((fadeSec + 0.12) * 1000));
    } else {
      stops.forEach((fn) => fn());
    }
  }

  /**
   * 6. Soft felt water-drop tone for eyes-closed 5-blink cadence pacing.
   */
  public playBlinkBreathCue(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(349.23, now);
    osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.34);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.038, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  /**
   * 7. Mild artisanal Zen singing-bowl / rin bell blooming through the stereo
   *    velvet reverb to calmly indicate rest completion while eyes are closed.
   */
  public playZenBell(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.135, now);
    master.connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = this.getReverbBuffer(ctx);
    const wet = ctx.createGain();
    wet.gain.setValueAtTime(0.65, now);
    convolver.connect(wet).connect(master);

    const dry = ctx.createGain();
    dry.gain.setValueAtTime(0.5, now);
    dry.connect(master);

    // Pure serene singing-bowl partials (C5 fundamental + gentle beating shimmer + soft fifth/octave)
    const partials: Array<{ freq: number; amp: number; decay: number }> = [
      { freq: 523.25, amp: 0.36, decay: 3.1 },
      { freq: 525.4, amp: 0.14, decay: 2.7 },
      { freq: 783.99, amp: 0.08, decay: 2.1 },
      { freq: 1046.5, amp: 0.1, decay: 1.9 },
    ];

    partials.forEach((p) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);

      g.gain.setValueAtTime(0.0001, now);
      // Soft felt mallet bloom (24ms gentle rise)
      g.gain.linearRampToValueAtTime(p.amp, now + 0.024);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(g);
      g.connect(dry);
      g.connect(convolver);
      osc.start(now);
      osc.stop(now + p.decay + 0.1);
    });
  }

  /**
   * 8. Hey Blink gentle ascending listening chime (~180ms).
   */
  public playListenStart(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [440, 587.33].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.065;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.036, t + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  /**
   * 9. Hey Blink calm single settling tone when a response arrives (~240ms).
   */
  public playReplyReady(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.032, now + 0.016);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }
}

export const blinkSound = new BlinkSoundEngine();
