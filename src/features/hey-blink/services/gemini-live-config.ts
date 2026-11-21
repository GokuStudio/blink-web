import {
  ActivityHandling,
  Modality,
  ThinkingLevel,
  type LiveConnectConfig,
} from '@google/genai';

/**
 * Hey Blink — Gemini Live Model Strategy & Personality Configuration (Phase H2)
 *
 * Model evaluation summary:
 * - Primary: `gemini-3.1-flash-live-preview`
 *   Low-latency native audio-to-audio Live model supporting `ThinkingLevel.MINIMAL`
 *   for natural conversational responsiveness, automatic barge-in, 24 kHz native PCM
 *   speech output, session resumption, and context window compression.
 * - Verified Fallback: `gemini-2.5-flash-native-audio-preview-12-2025`
 *   Proven native audio Live model with affective dialog and sub-second streaming.
 * - Server-configurable: The trusted backend token endpoint selects and locks the
 *   effective model via `GEMINI_LIVE_MODEL` / `liveConnectConstraints` so clients
 *   cannot tamper with models or system instructions.
 */

export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const FALLBACK_GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
export const DEFAULT_GEMINI_LIVE_API_VERSION = 'v1alpha';
export const DEFAULT_BLINK_VOICE_NAME = 'Aoede';

/**
 * Hey Blink Companion Personality System Instruction.
 * Shared conceptually with the backend token issuer, which locks this instruction
 * inside `liveConnectConstraints` when minting ephemeral tokens.
 */
export const HEY_BLINK_SYSTEM_INSTRUCTION = `You are Blink, a warm, calm, intelligent desktop companion built around digital wellness and natural voice conversation.

Speaking style:
- Speak naturally, concisely, and warmly, like a thoughtful friend sitting nearby.
- Keep spoken replies brief and easy to follow by default (1 to 3 short sentences), expanding only when the user asks for more detail.
- Never open or pad replies with robotic phrasing like "As an AI assistant" or "Certainly! I would be happy to help."
- Do not repeat greetings once a conversation is already underway.
- Stay emotionally expressive yet grounded—avoid excessive hype, filler words, or forced enthusiasm.
- Welcome interruptions naturally: if the user changes direction or cuts in, adapt immediately without apologizing excessively.

Boundaries and honesty:
- Your product context is digital wellness and eye comfort. You may offer practical, general healthy screen-use tips (such as taking regular visual breaks, adjusting lighting, or remembering to blink) when relevant.
- Never claim to measure the user's real-time eye health, blink rate, or fatigue unless verified sensor telemetry is explicitly provided, and never give medical diagnoses.
- Never invent or guess personal data such as blink counts, health scores, emails, calendar events, reminders, or past history.
- If the user asks about personal integrations (such as Gmail, Google Calendar, or eye-tracking logs) that are not connected yet, briefly and clearly let them know that integration isn't connected yet.`;

export interface BuildLiveConnectConfigOptions {
  model: string;
  voiceName?: string;
  resumptionHandle?: string | null;
  /** Enables transient server input transcription for natural conversation end detection (never persisted/displayed) */
  enableInputEndIntentTranscription?: boolean;
  enableDebugTranscription?: boolean;
  /** When the ephemeral token already locked constraints server-side, only send dynamic session fields */
  constraintsLockedByToken?: boolean;
}

/**
 * Returns true if the model supports `thinkingConfig.thinkingLevel` (Gemini 3.x Live models).
 */
export function supportsThinkingLevel(model: string): boolean {
  const normalized = model.toLowerCase();
  return normalized.includes('gemini-3');
}

/**
 * Builds a compliant `@google/genai` `LiveConnectConfig` for Hey Blink.
 */
export function buildGeminiLiveConnectConfig(
  options: BuildLiveConnectConfigOptions
): LiveConnectConfig {
  const {
    model,
    voiceName = DEFAULT_BLINK_VOICE_NAME,
    resumptionHandle,
    enableInputEndIntentTranscription = true,
    enableDebugTranscription = false,
    constraintsLockedByToken = false,
  } = options;

  const sessionResumption = resumptionHandle
    ? { handle: resumptionHandle }
    : {};

  // When ephemeral token locks model + config server-side, keep setup compatible
  // while still providing resumption handles and transient input transcription.
  if (constraintsLockedByToken) {
    return {
      responseModalities: [Modality.AUDIO],
      sessionResumption,
      ...(enableInputEndIntentTranscription || enableDebugTranscription
        ? { inputAudioTranscription: {} }
        : {}),
      ...(enableDebugTranscription ? { outputAudioTranscription: {} } : {}),
    };
  }

  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: {
      parts: [{ text: HEY_BLINK_SYSTEM_INSTRUCTION }],
    },
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName,
        },
      },
    },
    ...(supportsThinkingLevel(model)
      ? {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        }
      : {}),
    realtimeInputConfig: {
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
      automaticActivityDetection: {
        disabled: false,
      },
    },
    sessionResumption,
    contextWindowCompression: {
      slidingWindow: {},
    },
    ...(enableInputEndIntentTranscription || enableDebugTranscription
      ? { inputAudioTranscription: {} }
      : {}),
    ...(enableDebugTranscription ? { outputAudioTranscription: {} } : {}),
  };
}
