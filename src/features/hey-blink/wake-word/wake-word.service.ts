import {
  DEFAULT_WAKE_WORD_CONFIG,
  PRIMARY_WAKE_PHRASE,
  type WakeWordConfig,
} from './wake-word-config';
import type {
  IWakeWordEngine,
  WakeWordDetectionEvent,
  WakeWordEngineInitResult,
  WakeWordEngineStatus,
} from './wake-word.interface';

export type WakeWordDetectionListener = (event: WakeWordDetectionEvent) => void;

/**
 * Default honest placeholder engine used when no third-party on-device wake-word
 * runtime/model has been approved and installed yet.
 *
 * Strictly obeys Phase H2.5 privacy and honesty rules:
 * - Never uploads passive audio to any cloud service.
 * - Never falls back to browser cloud SpeechRecognition.
 * - Never fakes always-on microphone detection.
 * - Clearly reports `model_unavailable` until an approved engine/model is plugged in.
 */
export class UnconfiguredOnDeviceWakeWordEngine implements IWakeWordEngine {
  public readonly engineId = 'on-device-model-pending';
  public readonly wakePhrase = PRIMARY_WAKE_PHRASE;
  public readonly isOnDevice = true as const;
  public readonly requiresCustomModel = true;

  public async initialize(): Promise<WakeWordEngineInitResult> {
    return {
      ready: false,
      status: 'model_unavailable',
      reason:
        'No on-device "Hey Blink" wake-word model is installed yet. Approve and plug in an on-device WASM engine (Sherpa-ONNX KWS, Porcupine Web, or openWakeWord) for live audio keyword spotting.',
    };
  }

  public processPcmFrame(_pcm16k: Int16Array, _rms: number): WakeWordDetectionEvent | null {
    return null;
  }

  public setSensitivity(_sensitivity: number): void {
    // No-op until concrete engine is plugged in
  }

  public reset(): void {
    // No-op
  }

  public dispose(): void {
    // No-op
  }
}

export interface WakeWordServiceOptions {
  engine?: IWakeWordEngine;
  config?: Partial<WakeWordConfig>;
}

/**
 * Dedicated local WakeWordService coordinating on-device "Hey Blink" detection.
 *
 * Guarantees:
 * - Strictly local PCM processing (zero network calls).
 * - Suspension guard during active conversations (eliminates self-triggering from Blink).
 * - Duplicate trigger suppression via configurable cooldown window.
 * - Clean resource teardown on `dispose()`.
 */
export class WakeWordService {
  private readonly engine: IWakeWordEngine;
  private config: WakeWordConfig;
  private status: WakeWordEngineStatus = 'uninitialized';
  private unavailableReason: string | null = null;
  private isSuspended = true;
  private lastAcceptedDetectionMs = -Infinity;
  private suppressedDuplicateCount = 0;
  private framesProcessed = 0;
  private readonly listeners = new Set<WakeWordDetectionListener>();

  constructor(options: WakeWordServiceOptions = {}) {
    this.engine = options.engine ?? new UnconfiguredOnDeviceWakeWordEngine();
    this.config = {
      ...DEFAULT_WAKE_WORD_CONFIG,
      ...options.config,
      wakePhrase: PRIMARY_WAKE_PHRASE,
    };
  }

  public getEngineId(): string {
    return this.engine.engineId;
  }

  public getWakePhrase(): string {
    return this.config.wakePhrase;
  }

  public getStatus(): WakeWordEngineStatus {
    return this.status;
  }

  public getUnavailableReason(): string | null {
    return this.unavailableReason;
  }

  public getIsSuspended(): boolean {
    return this.isSuspended;
  }

  public getSuppressedDuplicateCount(): number {
    return this.suppressedDuplicateCount;
  }

  public getFramesProcessed(): number {
    return this.framesProcessed;
  }

  public getConfig(): Readonly<WakeWordConfig> {
    return this.config;
  }

  public async initialize(): Promise<WakeWordEngineInitResult> {
    try {
      const result = await this.engine.initialize(this.config);
      this.status = result.status;
      this.unavailableReason = result.reason ?? null;
      this.isSuspended = !result.ready;
      return result;
    } catch (err) {
      this.status = 'error';
      this.isSuspended = true;
      this.unavailableReason =
        err instanceof Error ? err.message : 'Wake-word engine initialization failed.';
      return {
        ready: false,
        status: 'error',
        reason: this.unavailableReason,
      };
    }
  }

  public setSensitivity(sensitivity: number): void {
    const clamped = Math.max(0, Math.min(1, sensitivity));
    this.config = { ...this.config, sensitivity: clamped };
    this.engine.setSensitivity(clamped);
  }

  /**
   * Immediately halts wake-word evaluation (called during active conversations,
   * ending transitions, or privacy disable so Blink never self-triggers).
   */
  public suspend(): void {
    this.isSuspended = true;
    this.engine.reset();
  }

  /**
   * Resumes local wake-word evaluation once the microphone is handed back.
   */
  public resume(): boolean {
    if (this.status !== 'ready') {
      return false;
    }
    this.engine.reset();
    this.isSuspended = false;
    return true;
  }

  /**
   * Processes a local 16 kHz Int16 LE PCM frame from AudioResourceManager.
   * Ignored immediately when suspended or not ready.
   */
  public feedPcmFrame(pcm16k: Int16Array, rms: number): WakeWordDetectionEvent | null {
    if (this.isSuspended || this.status !== 'ready') {
      return null;
    }

    this.framesProcessed += 1;
    const detection = this.engine.processPcmFrame(pcm16k, rms);
    if (!detection) {
      return null;
    }

    return this.acceptDetection(detection);
  }

  /**
   * Explicit dev/test trigger allowing deterministic verification of the hands-free
   * lifecycle even when no custom binary wake-word model is installed yet.
   * Strictly marked `isSimulatedTrigger: true`.
   */
  public triggerWakeForDev(confidence = 0.99): WakeWordDetectionEvent | null {
    if (this.status === 'disposed') return null;
    const event: WakeWordDetectionEvent = {
      phrase: this.config.wakePhrase,
      confidence,
      engineId: `${this.engine.engineId}:dev-trigger`,
      detectedAtMs: Date.now(),
      isSimulatedTrigger: true,
    };
    return this.acceptDetection(event, true);
  }

  public subscribe(listener: WakeWordDetectionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.isSuspended = true;
    this.status = 'disposed';
    this.listeners.clear();
    this.engine.dispose();
  }

  private acceptDetection(
    event: WakeWordDetectionEvent,
    allowWhileModelPending = false
  ): WakeWordDetectionEvent | null {
    if (this.isSuspended && !allowWhileModelPending) {
      this.suppressedDuplicateCount += 1;
      return null;
    }

    const now = event.detectedAtMs;
    if (now - this.lastAcceptedDetectionMs < this.config.duplicateSuppressionMs) {
      this.suppressedDuplicateCount += 1;
      return null;
    }

    this.lastAcceptedDetectionMs = now;
    // Auto-suspend immediately to guarantee zero duplicate triggers during startup
    this.isSuspended = true;
    this.engine.reset();

    this.listeners.forEach((listener) => listener(event));
    return event;
  }
}
