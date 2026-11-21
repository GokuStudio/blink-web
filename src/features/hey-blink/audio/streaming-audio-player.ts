import {
  base64ToInt16,
  GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE,
  int16PcmToFloat32,
  parsePcmMimeType,
  resampleLinear,
} from './pcm-encoder';
import {
  PCM_PLAYBACK_PROCESSOR_NAME,
  registerPcmPlaybackWorklet,
} from './audio-worklet/pcm-playback-worklet';

export interface StreamingAudioPlayerCallbacks {
  /** Fired at ~60 Hz with real audible DAC output RMS energy (0..1) */
  onLevel: (rms: number, isPlaying: boolean) => void;
  /** Fired when audio actually begins playing out of the speaker for a turn */
  onPlaybackStart?: (generationId: number, latencyMs: number | null) => void;
  /** Fired when all queued audio for a completed turn has finished playing */
  onPlaybackDrain?: (generationId: number) => void;
  /** Fired when a jitter buffer underrun occurs mid-stream */
  onUnderrun?: (underrunCount: number) => void;
}

export interface StreamingAudioPlayerOptions {
  /** Jitter prebuffer before starting playback of a new turn (ms; default 45 ms) */
  prebufferMs?: number;
  /** Ring buffer duration in seconds (default 6 s) */
  bufferSeconds?: number;
}

export interface StreamingPlaybackStats {
  generationId: number;
  isPlaying: boolean;
  bufferedMs: number;
  underrunCount: number;
  droppedChunks: number;
  chunksEnqueued: number;
  firstAudioToPlaybackMs: number | null;
  lastInterruptionToSilenceMs: number | null;
}

/**
 * Pure TypeScript deterministic ring-buffer + generation-ID queue used for
 * unit testing audio chunk ordering, jitter buffering, underrun tracking,
 * overflow handling, and instant barge-in flushing without needing a real DAC.
 */
export class PlaybackRingBuffer {
  private readonly ring: Float32Array;
  private readIndex = 0;
  private writeIndex = 0;
  private available = 0;
  private generationId = 0;
  private droppedSamples = 0;
  private underruns = 0;
  private isPlaying = false;
  private turnComplete = false;
  private readonly prebufferSamples: number;

  constructor(
    public readonly sampleRate: number,
    bufferSeconds = 4,
    prebufferMs = 45
  ) {
    this.ring = new Float32Array(Math.max(512, Math.floor(sampleRate * bufferSeconds)));
    this.prebufferSamples = Math.max(64, Math.floor((sampleRate * prebufferMs) / 1000));
  }

  public getGenerationId(): number {
    return this.generationId;
  }

  public getAvailableSamples(): number {
    return this.available;
  }

  public getBufferedMs(): number {
    return (this.available / this.sampleRate) * 1000;
  }

  public getUnderruns(): number {
    return this.underruns;
  }

  public getDroppedSamples(): number {
    return this.droppedSamples;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Enqueues PCM samples tagged with `chunkGenerationId`.
   * Returns false if discarded as stale (`chunkGenerationId < current`).
   */
  public enqueue(samples: Float32Array, chunkGenerationId: number): boolean {
    if (chunkGenerationId < this.generationId) {
      return false;
    }
    if (chunkGenerationId > this.generationId) {
      this.generationId = chunkGenerationId;
      this.turnComplete = false;
    }
    if (samples.length === 0) return true;

    const capacity = this.ring.length;
    const free = capacity - this.available;
    if (samples.length > free) {
      const overflow = samples.length - free;
      this.readIndex = (this.readIndex + overflow) % capacity;
      this.available -= overflow;
      this.droppedSamples += overflow;
    }

    const firstPart = Math.min(samples.length, capacity - this.writeIndex);
    this.ring.set(samples.subarray(0, firstPart), this.writeIndex);
    if (firstPart < samples.length) {
      this.ring.set(samples.subarray(firstPart), 0);
    }
    this.writeIndex = (this.writeIndex + samples.length) % capacity;
    this.available += samples.length;
    return true;
  }

  public markTurnComplete(generationId: number): void {
    if (generationId === this.generationId) {
      this.turnComplete = true;
    }
  }

  /**
   * Reads `frameCount` output samples in order, honoring prebuffer threshold and underruns.
   */
  public read(frameCount: number): { samples: Float32Array; drained: boolean; underrun: boolean } {
    const out = new Float32Array(frameCount);
    if (!this.isPlaying) {
      if (this.available >= this.prebufferSamples || (this.turnComplete && this.available > 0)) {
        this.isPlaying = true;
      } else {
        return { samples: out, drained: this.turnComplete && this.available === 0, underrun: false };
      }
    }

    let readCount = 0;
    const capacity = this.ring.length;
    for (let i = 0; i < frameCount; i += 1) {
      if (this.available > 0) {
        out[i] = this.ring[this.readIndex];
        this.readIndex = (this.readIndex + 1) % capacity;
        this.available -= 1;
        readCount += 1;
      } else {
        out[i] = 0;
      }
    }

    if (readCount < frameCount) {
      this.isPlaying = false;
      if (this.turnComplete) {
        return { samples: out, drained: true, underrun: false };
      }
      this.underruns += 1;
      return { samples: out, drained: false, underrun: true };
    }

    return { samples: out, drained: false, underrun: false };
  }

  /**
   * Immediately discards all queued audio and increments generation ID so stale
   * late-arriving packets cannot replay after interruption or reconnect.
   */
  public flush(): number {
    this.generationId += 1;
    this.readIndex = 0;
    this.writeIndex = 0;
    this.available = 0;
    this.isPlaying = false;
    this.turnComplete = false;
    return this.generationId;
  }
}

/**
 * Low-latency streaming audio player for Gemini Live native PCM responses.
 * Uses an AudioWorklet ring buffer for glitch-free streaming, instant barge-in flush,
 * and real-time audible DAC metering.
 */
export class StreamingAudioPlayer {
  private readonly callbacks: StreamingAudioPlayerCallbacks;
  private readonly options: Required<StreamingAudioPlayerOptions>;

  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isInitialized = false;

  private generationId = 0;
  private isPlaying = false;
  private bufferedMs = 0;
  private underrunCount = 0;
  private droppedChunks = 0;
  private chunksEnqueued = 0;
  private firstChunkArrivalMs: number | null = null;
  private firstAudioToPlaybackMs: number | null = null;
  private lastFlushRequestedMs: number | null = null;
  private lastInterruptionToSilenceMs: number | null = null;

  constructor(
    callbacks: StreamingAudioPlayerCallbacks,
    options: StreamingAudioPlayerOptions = {}
  ) {
    this.callbacks = callbacks;
    this.options = {
      prebufferMs: options.prebufferMs ?? 45,
      bufferSeconds: options.bufferSeconds ?? 6,
    };
  }

  public getGenerationId(): number {
    return this.generationId;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getStats(): StreamingPlaybackStats {
    return {
      generationId: this.generationId,
      isPlaying: this.isPlaying,
      bufferedMs: Math.round(this.bufferedMs * 10) / 10,
      underrunCount: this.underrunCount,
      droppedChunks: this.droppedChunks,
      chunksEnqueued: this.chunksEnqueued,
      firstAudioToPlaybackMs: this.firstAudioToPlaybackMs,
      lastInterruptionToSilenceMs: this.lastInterruptionToSilenceMs,
    };
  }

  /**
   * Initializes the playback AudioContext & AudioWorklet.
   * Call within the user click gesture ("Talk to Blink") to satisfy browser autoplay rules.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized && this.audioContext && this.audioContext.state !== 'closed') {
      await this.resume();
      return;
    }

    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    // Prefer 24 kHz to match Gemini Live native output, while still supporting any hardware rate
    let ctx: AudioContext;
    try {
      ctx = new AudioCtx({ sampleRate: GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      ctx = new AudioCtx({ latencyHint: 'interactive' });
    }

    this.audioContext = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    await registerPcmPlaybackWorklet(ctx);

    const worklet = new AudioWorkletNode(ctx, PCM_PLAYBACK_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        prebufferMs: this.options.prebufferMs,
        bufferSeconds: this.options.bufferSeconds,
      },
    });

    worklet.port.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'playback-started') {
        if (msg.generationId !== this.generationId) return;
        this.isPlaying = true;
        if (this.firstChunkArrivalMs !== null) {
          this.firstAudioToPlaybackMs = Math.round((performance.now() - this.firstChunkArrivalMs) * 10) / 10;
          this.firstChunkArrivalMs = null;
        }
        this.callbacks.onPlaybackStart?.(this.generationId, this.firstAudioToPlaybackMs);
      } else if (msg.type === 'level') {
        const rms = typeof msg.rms === 'number' ? msg.rms : 0;
        const playing = Boolean(msg.isPlaying);
        this.isPlaying = playing;
        this.bufferedMs = typeof msg.bufferedMs === 'number' ? msg.bufferedMs : 0;
        if (typeof msg.underruns === 'number') {
          this.underrunCount = msg.underruns;
        }
        this.callbacks.onLevel(rms, playing);
      } else if (msg.type === 'drained') {
        if (msg.generationId !== this.generationId) return;
        this.isPlaying = false;
        this.bufferedMs = 0;
        this.callbacks.onLevel(0, false);
        this.callbacks.onPlaybackDrain?.(this.generationId);
      } else if (msg.type === 'underrun') {
        this.underrunCount = typeof msg.underruns === 'number' ? msg.underruns : this.underrunCount + 1;
        this.callbacks.onUnderrun?.(this.underrunCount);
      } else if (msg.type === 'flushed') {
        if (this.lastFlushRequestedMs !== null) {
          this.lastInterruptionToSilenceMs = Math.round((performance.now() - this.lastFlushRequestedMs) * 10) / 10;
          this.lastFlushRequestedMs = null;
        }
        this.isPlaying = false;
        this.bufferedMs = 0;
        this.callbacks.onLevel(0, false);
      }
    };

    worklet.connect(ctx.destination);
    this.workletNode = worklet;
    this.isInitialized = true;
  }

  /**
   * Resumes a suspended playback AudioContext.
   */
  public async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        // Autoplay restriction handled on next user gesture
      }
    }
  }

  /**
   * Decodes and enqueues a streamed Gemini Live Base64 PCM chunk for the active generation.
   */
  public enqueueBase64Pcm(
    base64Data: string,
    mimeType?: string,
    generationId: number = this.generationId
  ): boolean {
    if (!this.isInitialized || !this.workletNode || !this.audioContext) {
      this.droppedChunks += 1;
      return false;
    }

    if (generationId < this.generationId) {
      // Stale chunk from a previous interrupted turn
      this.droppedChunks += 1;
      return false;
    }

    const format = parsePcmMimeType(mimeType);
    if (!format.isPcm) {
      this.droppedChunks += 1;
      return false;
    }

    const int16 = base64ToInt16(base64Data);
    if (int16.length === 0) return false;

    const float32 = int16PcmToFloat32(int16);
    const targetRate = this.audioContext.sampleRate;
    const samples =
      format.sampleRate === targetRate
        ? float32
        : resampleLinear(float32, format.sampleRate, targetRate);

    if (!this.isPlaying && this.firstChunkArrivalMs === null) {
      this.firstChunkArrivalMs = performance.now();
    }

    this.chunksEnqueued += 1;
    // Transfer backing buffer zero-copy to the AudioWorklet thread
    const transferable = samples.buffer.slice(
      samples.byteOffset,
      samples.byteOffset + samples.byteLength
    );
    this.workletNode.port.postMessage(
      {
        type: 'enqueue',
        generationId,
        samplesBuffer: transferable,
      },
      [transferable]
    );

    return true;
  }

  /**
   * Marks that Gemini has finished generating audio for the active turn so the
   * worklet fires `onPlaybackDrain` cleanly once the last audible sample plays.
   */
  public markTurnComplete(generationId: number = this.generationId): void {
    if (!this.workletNode || generationId < this.generationId) return;
    this.workletNode.port.postMessage({
      type: 'turn-complete',
      generationId,
    });
  }

  /**
   * Immediately stops current playback, discards all queued unplayed audio,
   * invalidates stale generation IDs, and zeroes output metering.
   */
  public flush(): number {
    this.generationId += 1;
    this.isPlaying = false;
    this.bufferedMs = 0;
    this.firstChunkArrivalMs = null;
    this.lastFlushRequestedMs = performance.now();

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'flush',
        generationId: this.generationId,
      });
    }

    // Immediately zero output energy on the main thread for instant visual barge-in
    this.callbacks.onLevel(0, false);
    return this.generationId;
  }

  /**
   * Closes AudioContext and releases all playback resources.
   */
  public dispose(): void {
    this.flush();
    this.isInitialized = false;

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      try {
        this.workletNode.disconnect();
      } catch {
        // Ignore
      }
      this.workletNode = null;
    }

    if (this.audioContext) {
      const ctx = this.audioContext;
      this.audioContext = null;
      if (ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    }
  }
}
