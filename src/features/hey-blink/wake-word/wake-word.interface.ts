import type { WakeWordConfig } from './wake-word-config';

export type WakeWordEngineStatus =
  | 'uninitialized'
  | 'ready'
  | 'model_unavailable'
  | 'error'
  | 'disposed';

export interface WakeWordDetectionEvent {
  /** Exact detected phrase (must match "Hey Blink") */
  phrase: string;
  /** Engine confidence score (0..1) */
  confidence: number;
  /** Engine identifier */
  engineId: string;
  /** Monotonic detection timestamp (performance.now()) */
  detectedAtMs: number;
  /** True only for explicit dev/test triggers — never disguised as real audio inference */
  isSimulatedTrigger: boolean;
}

export interface WakeWordEngineInitResult {
  ready: boolean;
  status: WakeWordEngineStatus;
  reason?: string;
}

/**
 * Platform-neutral on-device wake-word engine interface.
 *
 * Isolates model/runtime specifics so browser WASM engines (Sherpa-ONNX KWS,
 * Porcupine Web, openWakeWord ONNX) or future native/hardware DSP detectors
 * plug in cleanly without changing `WakeWordService` or `HandsFreeConversationController`.
 */
export interface IWakeWordEngine {
  readonly engineId: string;
  readonly wakePhrase: string;
  /** Enforces strictly on-device inference — cloud ASR engines are forbidden */
  readonly isOnDevice: true;
  /** Whether a custom "Hey Blink" model file must be provisioned before detection works */
  readonly requiresCustomModel: boolean;

  initialize(config: WakeWordConfig): Promise<WakeWordEngineInitResult>;

  /**
   * Evaluates a single mono 16 kHz Int16 LE PCM frame locally in memory.
   * Must NEVER transmit audio over the network.
   */
  processPcmFrame(pcm16k: Int16Array, rms: number): WakeWordDetectionEvent | null;

  setSensitivity(sensitivity: number): void;
  reset(): void;
  dispose(): void;
}
