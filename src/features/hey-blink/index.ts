/**
 * Hey Blink — Feature Barrel Export (Phase H1 + H2 + H2.5)
 */

// Components
export { HeyBlinkScreen } from './components/HeyBlinkScreen';
export type { HeyBlinkScreenProps } from './components/HeyBlinkScreen';
export { VoiceControls } from './components/VoiceControls';
export { VoiceStatus } from './components/VoiceStatus';
export { BlinkDialStudio } from './components/BlinkDialStudio';
export type { BlinkDialStudioProps } from './components/BlinkDialStudio';

// Visualizer
export { BlinkVoiceGlow } from './visualizer/BlinkVoiceGlow';
export type { BlinkVoiceGlowProps } from './visualizer/BlinkVoiceGlow';
export {
  BLINK_VISUAL_PRESETS,
  DEFAULT_VOICE_GLOW_TUNING,
  ATMOSPHERE_OVERRIDES,
  resolveVisualPreset,
  computeResponsiveBeamScale,
} from './visualizer/visual-presets';
export type { BlinkAtmosphereId, VoiceGlowTuning } from './visualizer/visual-presets';

// Audio Metering, PCM Codec, Microphone Capture, Streaming Playback & Resource Manager
export {
  AudioEnvelopeFollower,
  DualChannelAudioMeter,
  computeTimeDomainRms,
  DEFAULT_INPUT_ENVELOPE,
  DEFAULT_OUTPUT_ENVELOPE,
} from './audio/audio-meter';

export {
  GEMINI_INPUT_SAMPLE_RATE,
  GEMINI_DEFAULT_OUTPUT_SAMPLE_RATE,
  GEMINI_INPUT_MIME_TYPE,
  parsePcmMimeType,
  computeFloat32Rms,
  float32ToInt16Pcm,
  int16PcmToFloat32,
  resampleLinear,
  StreamingLinearResampler,
  int16ToBase64,
  uint8ToBase64,
  base64ToInt16,
} from './audio/pcm-encoder';
export type { ParsedPcmFormat } from './audio/pcm-encoder';

export {
  MicrophoneCapture,
  MicrophoneCaptureError,
  isMicrophoneCaptureSupported,
  listAudioInputDevices,
} from './audio/microphone-capture';
export type {
  AudioInputDeviceInfo,
  CapturedAudioChunk,
  MicrophoneCaptureCallbacks,
  MicrophoneCaptureOptions,
} from './audio/microphone-capture';

export {
  StreamingAudioPlayer,
  PlaybackRingBuffer,
} from './audio/streaming-audio-player';
export type {
  StreamingAudioPlayerCallbacks,
  StreamingAudioPlayerOptions,
  StreamingPlaybackStats,
} from './audio/streaming-audio-player';

export { AudioResourceManager } from './audio/audio-resource-manager';
export type {
  AudioResourceOwner,
  AudioResourceConsumer,
  AudioResourceHandoverResult,
  AudioResourceManagerOptions,
  IMicrophoneCapturePipeline,
} from './audio/audio-resource-manager';

// Wake-Word Layer (On-Device, Platform-Neutral)
export {
  PRIMARY_WAKE_PHRASE,
  DEFAULT_WAKE_WORD_CONFIG,
  EVALUATED_WAKE_WORD_ENGINES,
} from './wake-word/wake-word-config';
export type {
  WakeWordConfig,
  WakeWordEngineEvaluation,
} from './wake-word/wake-word-config';

export type {
  WakeWordEngineStatus,
  WakeWordDetectionEvent,
  WakeWordEngineInitResult,
  IWakeWordEngine,
} from './wake-word/wake-word.interface';

export {
  UnconfiguredOnDeviceWakeWordEngine,
  WakeWordService,
} from './wake-word/wake-word.service';
export type {
  WakeWordDetectionListener,
  WakeWordServiceOptions,
} from './wake-word/wake-word.service';

// Hands-Free Conversation Lifecycle & Natural Ending
export {
  ALL_ACTIVATION_STATES,
  ALLOWED_ACTIVATION_TRANSITIONS,
  IllegalActivationTransitionError,
  HandsFreeActivationStateMachine,
  canTransitionActivationState,
  isConversationOccupiedState,
} from './conversation/conversation-lifecycle';
export type { HandsFreeActivationState } from './conversation/conversation-lifecycle';

export {
  normalizeUtterance,
  ConversationEndDetector,
} from './conversation/conversation-end-detector';
export type {
  EndIntentLayer,
  EndIntentEvaluation,
  StructuredEndConversationSignal,
  EndValidatorContext,
} from './conversation/conversation-end-detector';

export { HandsFreeConversationController } from './conversation/hands-free-conversation-controller';
export type {
  HandsFreeMetrics,
  HandsFreeSnapshot,
  HandsFreeListener,
  HandsFreeControllerOptions,
} from './conversation/hands-free-conversation-controller';

// Session Contracts, State Machine, Mock & Gemini Live Implementations
export type {
  VoiceSessionState,
  VoiceSessionErrorCode,
  VoiceSessionError,
  VoiceAudioLevels,
  VoiceSessionSnapshot,
  VoiceStateChangeEvent,
  VoiceSessionStartOptions,
  VoiceProviderKind,
  VoiceSessionMetrics,
  TransientDebugTranscript,
  VoiceStateListener,
  VoiceAudioListener,
  IVoiceSession,
  IMockVoiceSessionControls,
  IVoiceSessionDiagnostics,
  DeviceExperienceMode,
  DeviceExperienceTransitionHooks,
  DeviceExperienceVoiceMountProps,
} from './services/voice-session.interface';
export {
  hasMockVoiceControls,
  hasVoiceDiagnostics,
} from './services/voice-session.interface';

export {
  ALLOWED_VOICE_TRANSITIONS,
  ALL_VOICE_STATES,
  IllegalVoiceTransitionError,
  VoiceStateMachine,
  canTransitionVoiceState,
  assertValidVoiceTransition,
  isActiveVoiceState,
  canInterruptVoiceState,
} from './services/voice-state-machine';

export { MockVoiceSession } from './services/mock-voice-session';
export type { MockVoiceSessionOptions } from './services/mock-voice-session';

export {
  DEFAULT_GEMINI_LIVE_MODEL,
  FALLBACK_GEMINI_LIVE_MODEL,
  DEFAULT_GEMINI_LIVE_API_VERSION,
  DEFAULT_BLINK_VOICE_NAME,
  HEY_BLINK_SYSTEM_INSTRUCTION,
  supportsThinkingLevel,
  buildGeminiLiveConnectConfig,
} from './services/gemini-live-config';

export {
  LiveSessionTokenClient,
  LiveSessionTokenError,
} from './services/live-session-token-client';
export type {
  LiveSessionTokenResponse,
  LiveSessionTokenClientOptions,
} from './services/live-session-token-client';

export { GeminiLiveVoiceSession } from './services/gemini-live-voice-session';
export type {
  IGeminiLiveTransport,
  GeminiLiveConnectParams,
  GeminiLiveTransportFactory,
  IMicrophoneAdapter,
  IAudioPlayerAdapter,
  GeminiLiveVoiceSessionOptions,
} from './services/gemini-live-voice-session';

export {
  resolveVoiceProviderConfig,
  createVoiceSessionProvider,
} from './services/voice-provider-factory';
export type { VoiceProviderConfig } from './services/voice-provider-factory';

// Hooks & State
export { useVoiceSession } from './hooks/useVoiceSession';
export type {
  UseVoiceSessionOptions,
  UseVoiceSessionResult,
} from './hooks/useVoiceSession';
export { useHandsFreeVoice } from './hooks/useHandsFreeVoice';
export type {
  UseHandsFreeVoiceOptions,
  UseHandsFreeVoiceResult,
} from './hooks/useHandsFreeVoice';
export { useVoiceStore } from './state/voice.store';
export type { VoiceStoreState } from './state/voice.store';

// Stage 2D — Integrated Device Voice Experience (Voice Ring + Unified Controller)
export {
  VoiceExperienceStateMachine,
  ALLOWED_EXPERIENCE_TRANSITIONS,
  canTransitionExperienceState,
  deriveVisualMode,
  isVoiceEngaged,
  isVoiceConversationLive,
  canActivateVoice,
  canInterruptExperience,
  getVoiceStatusCaption,
  classifyVoiceDiagnosticCode,
} from './integration/voiceExperienceStateMachine';
export type {
  VoiceExperienceState,
  BlinkVisualMode,
} from './integration/voiceExperienceStateMachine';

export { useBlinkVoiceExperience } from './integration/useBlinkVoiceExperience';
export type {
  UseBlinkVoiceExperienceOptions,
  BlinkVoiceExperience,
} from './integration/useBlinkVoiceExperience';

export { BlinkVoiceBubble } from './components/BlinkVoiceBubble';
export type { BlinkVoiceBubbleProps } from './components/BlinkVoiceBubble';

export { BlinkVoiceControlsPill } from './components/BlinkVoiceControlsPill';
export type { BlinkVoiceControlsPillProps } from './components/BlinkVoiceControlsPill';
