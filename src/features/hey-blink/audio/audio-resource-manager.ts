import {
  CapturedAudioChunk,
  MicrophoneCapture,
  MicrophoneCaptureError,
  type MicrophoneCaptureCallbacks,
  type MicrophoneCaptureOptions,
} from './microphone-capture';

export type AudioResourceOwner = 'none' | 'wake-word' | 'conversation';

export interface AudioResourceConsumer {
  onChunk: (chunk: CapturedAudioChunk) => void;
  onLevel?: (rms: number) => void;
  onDeviceDisconnected?: (reason: string) => void;
}

export interface AudioResourceHandoverResult {
  /** Measured handover duration (ms) */
  handoverDelayMs: number;
  /** Bounded post-wake speech chunks captured in local rolling buffer (never persisted) */
  bufferedChunks: CapturedAudioChunk[];
}

export interface AudioResourceManagerOptions {
  /** Maximum duration (ms) kept in volatile in-memory pre-roll ring buffer (default 600 ms) */
  preRollMaxMs?: number;
  /** Target chunk duration for latency-bounded PCM capture (default 32 ms) */
  chunkDurationMs?: number;
  /** Optional custom capture factory for deterministic unit tests */
  createCapture?: (callbacks: MicrophoneCaptureCallbacks) => IMicrophoneCapturePipeline;
}

export interface IMicrophoneCapturePipeline {
  start(options?: MicrophoneCaptureOptions): Promise<void>;
  setMuted(muted: boolean): void;
  resumeIfSuspended(): Promise<void>;
  stop(): void;
  getIsRunning(): boolean;
  getIsMuted(): boolean;
  getStartupLatencyMs(): number | null;
  getDroppedChunks(): number;
}

/**
 * Central Microphone Ownership & Audio-Resource Coordinator (Phase H2.5)
 *
 * Enforces strict single-pipeline microphone ownership so local wake-word detection
 * and Gemini Live conversations NEVER open competing `getUserMedia` streams or fight
 * over hardware audio devices:
 *
 * - `owner === 'wake-word'`: PCM frames route ONLY to the local on-device WakeWordService
 *   and a tiny bounded in-memory pre-roll buffer (zero cloud transmission, zero persistence).
 * - `owner === 'conversation'`: PCM frames route ONLY to the active IVoiceSession;
 *   wake-word frame delivery is strictly suspended (eliminating self-triggering from Blink).
 * - `owner === 'none'`: Hardware microphone tracks are stopped and all volatile buffers wiped.
 */
export class AudioResourceManager {
  private readonly preRollMaxChunks: number;
  private readonly chunkDurationMs: number;
  private readonly createCapture: (callbacks: MicrophoneCaptureCallbacks) => IMicrophoneCapturePipeline;

  private capture: IMicrophoneCapturePipeline | null = null;
  private owner: AudioResourceOwner = 'none';
  private wakeConsumer: AudioResourceConsumer | null = null;
  private conversationConsumer: AudioResourceConsumer | null = null;
  private selectedDeviceId: string | undefined;
  private isMuted = false;

  // Bounded volatile in-memory pre-roll ring buffer (cleared on disable or handover)
  private preRollBuffer: CapturedAudioChunk[] = [];
  private lastHandoverDelayMs: number | null = null;
  private isDisposed = false;

  constructor(options: AudioResourceManagerOptions = {}) {
    this.chunkDurationMs = Math.max(20, Math.min(40, options.chunkDurationMs ?? 32));
    const preRollMaxMs = Math.max(0, Math.min(1500, options.preRollMaxMs ?? 600));
    this.preRollMaxChunks = Math.max(1, Math.ceil(preRollMaxMs / this.chunkDurationMs));
    this.createCapture =
      options.createCapture ?? ((callbacks) => new MicrophoneCapture(callbacks));
  }

  public getOwner(): AudioResourceOwner {
    return this.owner;
  }

  public isCapturing(): boolean {
    return Boolean(this.capture?.getIsRunning());
  }

  public isMutedState(): boolean {
    return this.isMuted;
  }

  public getLastHandoverDelayMs(): number | null {
    return this.lastHandoverDelayMs;
  }

  public getStartupLatencyMs(): number | null {
    return this.capture?.getStartupLatencyMs() ?? null;
  }

  public getDroppedChunks(): number {
    return this.capture?.getDroppedChunks() ?? 0;
  }

  public getPreRollChunkCount(): number {
    return this.preRollBuffer.length;
  }

  /**
   * Acquires the single shared microphone pipeline for local on-device wake-word detection.
   * Must be invoked from a browser-permitted user gesture on initial enablement.
   */
  public async acquireForWakeWord(
    consumer: AudioResourceConsumer,
    options?: { deviceId?: string }
  ): Promise<void> {
    if (this.isDisposed) return;

    this.wakeConsumer = consumer;
    this.selectedDeviceId = options?.deviceId ?? this.selectedDeviceId;

    // Never steal microphone away from an active conversation
    if (this.owner === 'conversation') {
      return;
    }

    await this.ensureCaptureStarted(this.selectedDeviceId, false);
    this.owner = 'wake-word';
    this.clearPreRollBuffer();
  }

  /**
   * Atomically hands microphone ownership from local wake-word listening (or idle)
   * to the active Gemini Live conversation session without reopening hardware streams
   * when the shared pipeline is already running.
   */
  public async handoverToConversation(
    consumer: AudioResourceConsumer,
    options?: { deviceId?: string; muted?: boolean; includePreRoll?: boolean }
  ): Promise<AudioResourceHandoverResult> {
    if (this.isDisposed) {
      return { handoverDelayMs: 0, bufferedChunks: [] };
    }

    const startedAt = performance.now();
    this.conversationConsumer = consumer;
    this.selectedDeviceId = options?.deviceId ?? this.selectedDeviceId;
    const requestedMuted = Boolean(options?.muted);

    // Grab bounded post-wake speech frames before wiping pre-roll
    const bufferedChunks =
      options?.includePreRoll !== false && this.owner === 'wake-word'
        ? this.preRollBuffer.slice()
        : [];
    this.clearPreRollBuffer();

    // Immediately switch routing ownership before awaiting anything so wake-word
    // receives zero frames from this moment forward
    this.owner = 'conversation';

    await this.ensureCaptureStarted(this.selectedDeviceId, requestedMuted);
    this.setMuted(requestedMuted);

    const handoverDelayMs = Math.round((performance.now() - startedAt) * 10) / 10;
    this.lastHandoverDelayMs = handoverDelayMs;

    return {
      handoverDelayMs,
      bufferedChunks,
    };
  }

  /**
   * Returns microphone ownership cleanly from an ending conversation back to local
   * wake-word listening, or releases hardware completely if wake-word consent is absent.
   */
  public releaseConversation(rearmWakeWord: boolean): void {
    this.conversationConsumer = null;
    this.clearPreRollBuffer();

    if (rearmWakeWord && this.wakeConsumer && !this.isDisposed && this.capture?.getIsRunning()) {
      this.setMuted(false);
      this.owner = 'wake-word';
      return;
    }

    this.releaseAll();
  }

  /**
   * Privacy-critical hard disable: stops all hardware microphone tracks immediately,
   * clears all volatile buffers, and sets owner to `'none'`.
   */
  public releaseAll(): void {
    this.owner = 'none';
    this.conversationConsumer = null;
    this.clearPreRollBuffer();
    this.isMuted = false;

    if (this.capture) {
      try {
        this.capture.stop();
      } catch {
        // Ignore teardown errors
      }
      this.capture = null;
    }
  }

  /**
   * Unregisters the wake-word consumer AND releases hardware if not in conversation.
   */
  public revokeWakeWordOwnership(): void {
    this.wakeConsumer = null;
    if (this.owner === 'wake-word') {
      this.releaseAll();
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.capture?.setMuted(muted);
    if (muted) {
      this.clearPreRollBuffer();
    }
  }

  public async resumeIfSuspended(): Promise<void> {
    await this.capture?.resumeIfSuspended();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.wakeConsumer = null;
    this.releaseAll();
  }

  private async ensureCaptureStarted(deviceId?: string, muted = false): Promise<void> {
    if (this.capture && this.capture.getIsRunning()) {
      await this.capture.resumeIfSuspended();
      return;
    }

    const pipeline = this.createCapture({
      onChunk: (chunk) => this.routeCapturedChunk(chunk),
      onLevel: (rms) => this.routeLevel(rms),
      onDeviceDisconnected: (reason) => this.handleDeviceDisconnected(reason),
    });

    this.capture = pipeline;
    try {
      await pipeline.start({
        deviceId,
        muted,
        chunkDurationMs: this.chunkDurationMs,
      });
    } catch (err) {
      this.capture = null;
      this.owner = 'none';
      if (err instanceof MicrophoneCaptureError) throw err;
      throw err;
    }
  }

  private routeCapturedChunk(chunk: CapturedAudioChunk): void {
    if (this.isDisposed || this.isMuted) return;

    if (this.owner === 'wake-word') {
      // Strictly local-only routing — NEVER touches network/cloud!
      this.pushPreRoll(chunk);
      this.wakeConsumer?.onChunk(chunk);
      return;
    }

    if (this.owner === 'conversation') {
      this.conversationConsumer?.onChunk(chunk);
    }
  }

  private routeLevel(rms: number): void {
    if (this.isDisposed) return;
    if (this.owner === 'wake-word') {
      this.wakeConsumer?.onLevel?.(rms);
    } else if (this.owner === 'conversation') {
      this.conversationConsumer?.onLevel?.(rms);
    }
  }

  private handleDeviceDisconnected(reason: string): void {
    const prevOwner = this.owner;
    this.releaseAll();
    if (prevOwner === 'conversation') {
      this.conversationConsumer?.onDeviceDisconnected?.(reason);
    } else if (prevOwner === 'wake-word') {
      this.wakeConsumer?.onDeviceDisconnected?.(reason);
    }
  }

  private pushPreRoll(chunk: CapturedAudioChunk): void {
    this.preRollBuffer.push(chunk);
    if (this.preRollBuffer.length > this.preRollMaxChunks) {
      this.preRollBuffer.shift();
    }
  }

  private clearPreRollBuffer(): void {
    this.preRollBuffer = [];
  }
}
