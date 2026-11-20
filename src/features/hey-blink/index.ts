/**
 * Hey Blink — Feature Barrel Export (Phase H1)
 */

// Components
export { HeyBlinkScreen } from './components/HeyBlinkScreen';
export type { HeyBlinkScreenProps } from './components/HeyBlinkScreen';
export { VoiceControls } from './components/VoiceControls';
export { VoiceStatus } from './components/VoiceStatus';

// Visualizer
export { BlinkVoiceGlow } from './visualizer/BlinkVoiceGlow';
export type { BlinkVoiceGlowProps } from './visualizer/BlinkVoiceGlow';
export {
  BLINK_VISUAL_PRESETS,
  resolveVisualPreset,
  computeResponsiveBeamScale,
} from './visualizer/visual-presets';

// Audio Metering
export {
  AudioEnvelopeFollower,
  DualChannelAudioMeter,
  computeTimeDomainRms,
  DEFAULT_INPUT_ENVELOPE,
  DEFAULT_OUTPUT_ENVELOPE,
} from './audio/audio-meter';

// Session Contracts, State Machine & Mock Implementation
export type {
  VoiceSessionState,
  VoiceSessionErrorCode,
  VoiceSessionError,
  VoiceAudioLevels,
  VoiceSessionSnapshot,
  VoiceStateChangeEvent,
  VoiceSessionStartOptions,
  VoiceStateListener,
  VoiceAudioListener,
  IVoiceSession,
  IMockVoiceSessionControls,
  DeviceExperienceMode,
  DeviceExperienceTransitionHooks,
  DeviceExperienceVoiceMountProps,
} from './services/voice-session.interface';
export { hasMockVoiceControls } from './services/voice-session.interface';

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

// Hooks & State
export { useVoiceSession } from './hooks/useVoiceSession';
export type {
  UseVoiceSessionOptions,
  UseVoiceSessionResult,
} from './hooks/useVoiceSession';
export { useVoiceStore } from './state/voice.store';
export type { VoiceStoreState } from './state/voice.store';
