/**
 * Hey Blink — On-Device Wake-Word Configuration (Phase H2.5)
 *
 * Primary wake phrase is strictly "Hey Blink" — never silently substituted
 * with another phrase if a custom model is not yet provisioned.
 */

export const PRIMARY_WAKE_PHRASE = 'Hey Blink';

export interface WakeWordConfig {
  /** Target wake phrase (locked to "Hey Blink") */
  wakePhrase: string;
  /** Detection sensitivity from 0.0 (strict/fewer false triggers) to 1.0 (more sensitive) */
  sensitivity: number;
  /** Minimum cooldown (ms) between detections to suppress duplicate triggers */
  duplicateSuppressionMs: number;
  /** Bounded volatile local pre-roll buffer (ms) preserved on handover */
  preRollBufferMs: number;
  /** Input PCM sample rate expected by the on-device detector (16 kHz mono Int16 LE) */
  sampleRate: number;
}

export const DEFAULT_WAKE_WORD_CONFIG: Readonly<WakeWordConfig> = {
  wakePhrase: PRIMARY_WAKE_PHRASE,
  sensitivity: 0.65,
  duplicateSuppressionMs: 1500,
  preRollBufferMs: 600,
  sampleRate: 16000,
};

/**
 * Documented evaluation of browser-compatible on-device wake-word engines
 * for the exact custom phrase "Hey Blink".
 */
export interface WakeWordEngineEvaluation {
  id: 'sherpa-onnx-kws' | 'picovoice-porcupine-web' | 'openwakeword-onnx';
  name: string;
  onDeviceBrowserWasm: boolean;
  exactCustomPhraseSupport: string;
  commercialLicensing: string;
  estimatedFootprint: string;
  requiresApprovalBeforeInstall: boolean;
}

export const EVALUATED_WAKE_WORD_ENGINES: readonly WakeWordEngineEvaluation[] = [
  {
    id: 'sherpa-onnx-kws',
    name: 'Sherpa-ONNX Keyword Spotting (WASM)',
    onDeviceBrowserWasm: true,
    exactCustomPhraseSupport:
      'Open-vocabulary KWS supports exact "Hey Blink" via keyword config with no custom model retraining.',
    commercialLicensing: 'Apache 2.0 (commercial-friendly, zero API/AccessKey required).',
    estimatedFootprint: '~15–25 MB cached quantized INT8 WASM/ONNX assets.',
    requiresApprovalBeforeInstall: true,
  },
  {
    id: 'picovoice-porcupine-web',
    name: 'Picovoice Porcupine Web (@picovoice/porcupine-web)',
    onDeviceBrowserWasm: true,
    exactCustomPhraseSupport:
      'Requires generating a custom "Hey Blink" .ppn model in Picovoice Console plus a Picovoice AccessKey.',
    commercialLicensing:
      'Free tier for dev/evaluation (capped); paid commercial subscription required for production.',
    estimatedFootprint: '~1–2 MB WASM + tiny .ppn model; lowest CPU & highest accuracy.',
    requiresApprovalBeforeInstall: true,
  },
  {
    id: 'openwakeword-onnx',
    name: 'openWakeWord + ONNX Runtime Web (onnxruntime-web)',
    onDeviceBrowserWasm: true,
    exactCustomPhraseSupport:
      'Requires training/exporting a custom hey_blink.onnx classifier (pre-trained weights cover other phrases).',
    commercialLicensing:
      'Apache 2.0 / MIT runtime; custom-trained hey_blink.onnx weights are commercially owned.',
    estimatedFootprint: '~5–15 MB WASM + feature/embedding + classifier ONNX models.',
    requiresApprovalBeforeInstall: true,
  },
] as const;
