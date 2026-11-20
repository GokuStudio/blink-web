/**
 * Hey Blink — Dual-Channel Smoothed Audio Metering
 *
 * Provides exponential attack/release envelope following so incoming user audio
 * and outgoing assistant audio drive fluid, organic motion with fast attack and
 * controlled release — avoiding harsh flicker while staying instantly interruptible.
 *
 * Input and output channels remain strictly independent.
 */

export interface EnvelopeConfig {
  /** Time constant (seconds) for rising amplitude — faster feels responsive */
  attackSeconds: number;
  /** Time constant (seconds) for falling amplitude — controlled release avoids jitter */
  releaseSeconds: number;
  /** Noise floor threshold (0..1); signals below read as 0 */
  noiseFloor: number;
  /** Output gain multiplier prior to soft clamp */
  gain: number;
}

export const DEFAULT_INPUT_ENVELOPE: EnvelopeConfig = {
  attackSeconds: 0.045,
  releaseSeconds: 0.22,
  noiseFloor: 0.015,
  gain: 1.0,
};

export const DEFAULT_OUTPUT_ENVELOPE: EnvelopeConfig = {
  attackSeconds: 0.035,
  releaseSeconds: 0.28,
  noiseFloor: 0.01,
  gain: 1.05,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Single-channel exponential attack/release envelope follower.
 * Zero heap allocations inside `step()`.
 */
export class AudioEnvelopeFollower {
  private level = 0;
  private config: EnvelopeConfig;

  constructor(config: Partial<EnvelopeConfig> = {}) {
    this.config = {
      ...DEFAULT_INPUT_ENVELOPE,
      ...config,
    };
  }

  public getLevel(): number {
    return this.level;
  }

  public updateConfig(partial: Partial<EnvelopeConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Advance the smoothed envelope toward `rawSample` over elapsed `dtSeconds`.
   */
  public step(rawSample: number, dtSeconds: number): number {
    const dt = Math.max(0, Math.min(dtSeconds, 0.25));
    const gated = rawSample <= this.config.noiseFloor ? 0 : rawSample;
    const scaled = clamp01(gated * this.config.gain);

    if (dt === 0) {
      return this.level;
    }

    const tau =
      scaled > this.level
        ? Math.max(0.005, this.config.attackSeconds)
        : Math.max(0.005, this.config.releaseSeconds);

    const alpha = 1 - Math.exp(-dt / tau);
    this.level = clamp01(this.level + (scaled - this.level) * alpha);

    // Snap microscopic tails cleanly to zero
    if (this.level < 0.001 && scaled === 0) {
      this.level = 0;
    }

    return this.level;
  }

  /**
   * Immediately drop level to 0 (used on interruption, mute, or session teardown).
   */
  public reset(): void {
    this.level = 0;
  }
}

export interface DualChannelLevels {
  input: number;
  output: number;
}

/**
 * Maintains strictly independent smoothed envelopes for:
 * - Incoming audio (user microphone / simulated input)
 * - Outgoing audio (assistant speech / simulated output)
 */
export class DualChannelAudioMeter {
  private readonly inputFollower: AudioEnvelopeFollower;
  private readonly outputFollower: AudioEnvelopeFollower;
  private lastTimestampMs: number | null = null;

  constructor(
    inputConfig: Partial<EnvelopeConfig> = DEFAULT_INPUT_ENVELOPE,
    outputConfig: Partial<EnvelopeConfig> = DEFAULT_OUTPUT_ENVELOPE
  ) {
    this.inputFollower = new AudioEnvelopeFollower({
      ...DEFAULT_INPUT_ENVELOPE,
      ...inputConfig,
    });
    this.outputFollower = new AudioEnvelopeFollower({
      ...DEFAULT_OUTPUT_ENVELOPE,
      ...outputConfig,
    });
  }

  public step(
    rawInput: number,
    rawOutput: number,
    nowMs: number = performance.now()
  ): DualChannelLevels {
    const dtSeconds =
      this.lastTimestampMs === null ? 1 / 60 : Math.max(0.001, (nowMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = nowMs;

    return {
      input: this.inputFollower.step(rawInput, dtSeconds),
      output: this.outputFollower.step(rawOutput, dtSeconds),
    };
  }

  public getLevels(): DualChannelLevels {
    return {
      input: this.inputFollower.getLevel(),
      output: this.outputFollower.getLevel(),
    };
  }

  /** Instantly suppress assistant playback level (for barge-in interruption) */
  public suppressOutput(): void {
    this.outputFollower.reset();
  }

  /** Instantly suppress input level (for mute) */
  public suppressInput(): void {
    this.inputFollower.reset();
  }

  /** Reset both channels and clock */
  public reset(): void {
    this.inputFollower.reset();
    this.outputFollower.reset();
    this.lastTimestampMs = null;
  }
}

/**
 * Computes normalized RMS amplitude (0..1) from an AnalyserNode time-domain buffer.
 * Ready for Phase H2 real microphone & Gemini Live audio stream metering.
 */
export function computeTimeDomainRms(buffer: Uint8Array): number {
  if (buffer.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centered = (buffer[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  const rms = Math.sqrt(sumSquares / buffer.length);
  // Gentle speech normalization curve
  return clamp01(rms * 2.4);
}
